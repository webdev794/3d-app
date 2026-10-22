<?php

namespace App\Support;

use App\Models\Order;
use App\Models\OrderFile;
use App\Models\OrderUpdate;
use App\Models\Project;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Throwable;

/**
 * Orders as the API sends them: board cards and the full order, for the customer (their own order, customer-visible
 * updates and files only, no staff information) or for staff (everything, with the activity history).
 */
final class OrderView
{
    /** Adds what a card needs to an orders query. */
    public static function forCards(Builder $query, bool $staff): Builder
    {
        $with = ['project:id,name,garment,sport,thumbnail', 'cover' => self::coverColumns(...), $staff ? 'latestUpdate' : 'latestCustomerUpdate'];
        if ($staff) {
            array_push($with, 'user:id,name,email', 'assignee:id,name');
        }
        if (self::hasInvoices()) {
            $with[] = 'invoice';
        }

        return $query->withoutKit()
            // The kit as ordered: its picture, name and garment, for a card whose project was deleted since.
            ->addSelect(['orders.design_snapshot->thumbnail as kit_thumbnail', 'orders.design_snapshot->name as kit_name', 'orders.design_snapshot->garment as kit_garment', 'orders.design_snapshot->design->productName as kit_product'])
            ->with($with)
            ->withCount(['files' => fn ($q) => $staff ? $q : $q->where('visibility', 'customer')]);
    }

    /** Whether invoices can be read: the payments feature's relation and its table (not before its migration ran). */
    public static function hasInvoices(): bool
    {
        static $has;

        return $has ??= method_exists(Order::class, 'invoice') && \Illuminate\Support\Facades\Schema::hasTable('invoices');
    }

    /** The cover's columns, named with their table (its query joins the files table to itself). */
    private static function coverColumns($query): void
    {
        $query->select('order_files.id', 'order_files.order_id', 'order_files.thumb');
    }

    /** The saved designs chosen on these orders' rows, by id (a customer's own only). */
    public static function itemProjects(iterable $orders, ?int $ownerId = null): Collection
    {
        $ids = collect($orders)->flatMap(fn (Order $o) => array_column($o->items ?? [], 'project_id'))->filter()->unique()->values();

        return $ids->isEmpty() ? collect() : Project::whereIn('id', $ids)
            ->when($ownerId, fn ($q) => $q->where('user_id', $ownerId))
            ->get(['id', 'name', 'garment', 'sport', 'thumbnail', 'version'])->keyBy('id');
    }

    /** One card on the board. */
    public static function card(Order $order, bool $staff, Collection $projects): array
    {
        $latest = $staff ? $order->latestUpdate : $order->latestCustomerUpdate;
        $hasTracking = filled($order->tracking_number) || filled($order->tracking_url) || filled($order->carrier);
        $tracking = $hasTracking && ($staff || in_array($order->status, ['shipped', 'delivered'], true))
            ? ['carrier' => $order->carrier, 'number' => $order->tracking_number, 'url' => $order->tracking_url] : null;
        $payment = self::payment($order);
        $card = [
            'id' => $order->id,
            'number' => $order->number,
            'name' => $order->displayName(),
            'source' => $order->source,
            'status' => $order->status,
            'stage' => OrderStages::key($order->status),
            'stage_label' => OrderStages::label($order->status),
            'sub_status' => OrderStages::subStatus($order),
            'step' => $order->step,
            'approval' => $order->approval,
            'quantity' => (int) $order->quantity,
            'garments' => self::garments($order, $projects),
            'cover' => $order->cover?->thumb,
            'submitted_at' => $order->created_at?->toIso8601String(),
            'updated_at' => ($latest?->created_at ?? $order->updated_at)?->toIso8601String(),
            'latest_update' => $latest ? ['kind' => $latest->kind, 'text' => $latest->text(), 'message' => $latest->message, 'at' => $latest->created_at?->toIso8601String()] : null,
            'tracking' => $tracking,
            'action' => $order->approval === 'review' && $order->status !== 'cancelled' ? 'review_design'
                : ($order->status === 'shipped' && ($order->tracking_url || $order->tracking_number) ? 'track_delivery' : null),
            'completed' => $order->isCompleted(),
            'needed_by' => $order->needed_by?->toDateString(),
            'files_count' => (int) ($order->files_count ?? 0),
            'payment' => $payment,
            'link' => '/orders/'.$order->id,
        ];
        if ($staff) {
            $card += [
                'customer' => $order->user ? ['id' => $order->user->id, 'name' => $order->user->name, 'email' => $order->user->email] : null,
                'assigned_to' => $order->assigned_to,
                'assignee' => $order->assignee?->name,
                'due_date' => $order->due_date?->toDateString(),
                'quote_required' => (bool) ($order->getAttribute('quote_required') ?? ($payment['quote_required'] ?? false)),
                'unit_price' => $order->unit_price,
                'total' => $order->total,
                'currency' => $order->currency,
                'admin_link' => '/admin/orders/'.$order->id,
            ];
        }

        return $card;
    }

    /** The full order. Staff also get the kit as ordered (design_snapshot) and everything internal. */
    public static function detail(Order $order, bool $staff): array
    {
        $order->loadMissing(['project:id,name,garment,sport,thumbnail,version', 'files', 'updates.user:id,name', 'updates.file', 'cover' => self::coverColumns(...), 'latestUpdate', 'latestCustomerUpdate']);
        if (self::hasInvoices()) {
            try {
                $order->loadMissing('invoice');
            } catch (Throwable) {
                // No invoices yet.
            }
        }
        if ($staff) {
            $order->loadMissing(['user:id,name,email', 'assignee:id,name']);
        }
        $projects = self::itemProjects([$order], $staff ? null : $order->user_id);
        $files = $staff ? $order->files : $order->files->where('visibility', 'customer')->values();
        $order->setAttribute('files_count', $files->count());
        $updates = $staff ? $order->updates : $order->updates->where('visibility', 'customer')->values();
        $proofs = $order->files->where('kind', 'proof')->where('visibility', 'customer')->sortByDesc(fn (OrderFile $f) => [$f->version, $f->id])->values();

        $base = Arr::except($order->attributesToArray(), ['kit_thumbnail', 'kit_name', 'kit_garment', 'kit_product', 'files_count']);
        if (! $staff) {
            $base = Arr::except($base, Order::INTERNAL);
        }
        $reached = ['received' => $order->created_at?->toIso8601String()];
        foreach ($order->updates as $update) {
            if ($update->kind === 'stage' && $update->to_status && $update->to_status !== 'cancelled') {
                $reached[OrderStages::key($update->to_status)] = $update->created_at?->toIso8601String();
            }
        }

        return array_merge($base, self::card($order, $staff, $projects), [
            'items' => array_map(fn (array $item) => $item + [
                'name' => Order::itemName($item),
                'thumbnail' => isset($item['project_id']) ? ($projects[$item['project_id']]->thumbnail ?? null) : null,
            ], $order->items ?? []),
            'project' => $order->project ? $order->project->only(['id', 'name', 'garment', 'sport', 'thumbnail', 'version']) : null,
            'files' => $files->map(fn (OrderFile $f) => $staff ? $f->toArray() + ['visibility' => $f->visibility, 'meta' => $f->meta] : $f->toArray())->all(),
            'proof' => $proofs->first()?->toArray(),
            'proofs' => $proofs->map->toArray()->all(),
            'stages_reached' => $reached,
            'updates' => $updates->sortByDesc('id')->values()->map(fn (OrderUpdate $u) => $staff ? $u->forStaff() : $u->forCustomer())->all(),
        ]);
    }

    /** The garments on a card: the order form's rows, or the ordered kit (a full kit is a jersey and shorts). */
    public static function garments(Order $order, Collection $projects): array
    {
        if ($order->items) {
            return array_map(fn (array $item) => [
                'garment' => $item['garment'] ?? 'other',
                'name' => Order::itemName($item),
                'quantity' => (int) ($item['quantity'] ?? array_sum($item['sizes'] ?? [])),
                'thumbnail' => isset($item['project_id']) ? ($projects[$item['project_id']]->thumbnail ?? null) : null,
            ], $order->items);
        }
        $thumbnail = $order->project?->thumbnail ?: self::text($order->getAttribute('kit_thumbnail'));
        $garment = $order->project?->garment ?: self::text($order->getAttribute('kit_garment'));
        if (! $garment && ! $thumbnail) {
            return [];
        }
        if ($garment === 'fullkit') {
            return [
                ['garment' => 'jersey', 'name' => 'Jersey', 'quantity' => (int) $order->quantity, 'thumbnail' => $thumbnail],
                ['garment' => 'shorts', 'name' => 'Shorts', 'quantity' => (int) $order->quantity, 'thumbnail' => null],
            ];
        }
        // The Studio's own garments that the order form lists under another row: a zip hoodie is a hoodie, the pocket polo a polo.
        $row = Order::PROJECT_ROWS[(string) $garment] ?? $garment;
        $known = $row && array_key_exists($row, Order::GARMENTS);
        // The sport's garment tile the kit was made as ("Netball dress", task 9.99).
        $attributes = $order->getAttributes();
        $snapshot = array_key_exists('design_snapshot', $attributes) ? $order->design_snapshot : null;
        $product = trim((string) (array_key_exists('kit_product', $attributes) ? self::text($attributes['kit_product']) : (is_array($snapshot) ? ($snapshot['design']['productName'] ?? null) : null)));
        $name = $product !== '' ? $product : ($row !== $garment ? collect(config('catalog.garments'))->firstWhere('id', $garment)['name'] ?? Order::GARMENTS[$row] : ($known ? Order::GARMENTS[$row] : 'Kit'));

        return [['garment' => $known ? $row : 'jersey', 'name' => $known ? $name : 'Kit', 'quantity' => (int) $order->quantity, 'thumbnail' => $thumbnail]];
    }

    /**
     * The payment summary from the order's invoice (the payments feature adds Order::invoice() and
     * Invoice::summary()); null without one.
     */
    public static function payment(Order $order): ?array
    {
        if (! self::hasInvoices()) {
            return null;
        }
        try {
            $invoice = $order->relationLoaded('invoice') ? $order->getRelation('invoice') : $order->invoice()->first();
            if (! $invoice) {
                return null;
            }
            // payments-api.md R2: Invoice::summary($invoice).
            if (method_exists($invoice, 'summary')) {
                return $invoice::summary($invoice);
            }

            return [
                'invoice_number' => $invoice->number ?? null,
                'status' => $invoice->status ?? null,
                'amount_due' => $invoice->amount_due ?? null,
                'currency' => $invoice->currency ?? $order->currency,
                'pay_url' => $invoice->pay_url ?? null,
                'quote_required' => (bool) ($invoice->quote_required ?? false),
            ];
        } catch (Throwable) {
            return null;
        }
    }

    /** A JSON value read with a selector: SQLite gives text, MySQL may give it quoted. */
    private static function text(mixed $value): ?string
    {
        if (! is_string($value) || $value === '' || $value === 'null') {
            return null;
        }

        return str_starts_with($value, '"') ? (json_decode($value) ?: null) : $value;
    }
}
