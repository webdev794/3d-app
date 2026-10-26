<?php

namespace App\Services;

use App\Events\OrderSubmitted;
use App\Models\Order;
use App\Models\OrderDraft;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Places a customer's order, once: the order form, an uploaded order form, or a Studio kit ("Order this kit").
 * A submission carries an idempotency key; the same key again gives back the order already made.
 */
class OrderSubmission
{
    /** The key sent with a submission (Idempotency-Key header, or idempotency_key in the body), or null. */
    public static function key(Request $request): ?string
    {
        $key = trim((string) ($request->header('Idempotency-Key') ?: $request->input('idempotency_key', '')));
        if ($key === '') {
            return null;
        }
        if (! preg_match('/^[A-Za-z0-9_-]{8,80}$/', $key)) {
            throw ValidationException::withMessages(['idempotency_key' => 'The idempotency key is 8 to 80 letters, digits, - or _.']);
        }

        return $key;
    }

    /** The order already made with this key, if any. */
    public static function replay(User $user, ?string $key): ?Order
    {
        return $key ? $user->orders()->where('idempotency_key', $key)->first() : null;
    }

    /**
     * Makes the order from validated fields; returns [order, made now]. A key used meanwhile by a parallel request
     * gives that request's order.
     *
     * @return array{0: Order, 1: bool}
     */
    public function submit(User $user, array $data, ?string $key): array
    {
        // The "Made by" columns are checked (and set up on shared hosting) before the order's transaction starts.
        \App\Models\Supplier::ready();
        try {
            $order = DB::transaction(fn () => $this->create($user, $data, $key));
        } catch (UniqueConstraintViolationException $e) {
            $order = self::replay($user, $key) ?? throw $e;

            return [$order, false];
        }
        // After it is saved for good: the payments feature issues the invoice.
        OrderSubmitted::dispatch($order);

        return [$order, true];
    }

    private function create(User $user, array $data, ?string $key): Order
    {
        $source = $data['source'] ?? 'studio';
        $draft = null;
        if (! empty($data['draft_id'])) {
            $draft = $user->orderDrafts()->lockForUpdate()->find($data['draft_id']);
            abort_unless($draft, 404, 'This draft was already submitted or deleted.');
        }
        if ($source === 'upload' && ! $draft?->files()->where('kind', 'order_form')->exists()) {
            throw ValidationException::withMessages(['files' => 'Attach your completed order form.']);
        }
        // Delivery or pick up (Upload Your Order) becomes the order's delivery address text, as on every order view.
        if (isset($data['delivery'])) {
            $data['shipping_address'] = \App\Support\OrderDelivery::text($data['delivery'], $data['address'] ?? null) ?? ($data['shipping_address'] ?? null);
            // The price list's destination follows the choice (pick up, the country), unless one was chosen on the review.
            $destination = \App\Support\OrderDelivery::destination($data['delivery'], $data['address'] ?? null);
            if ($destination && blank($data['pricing']['destination'] ?? null)) {
                $data['pricing'] = ['destination' => $destination] + (is_array($data['pricing'] ?? null) ? $data['pricing'] : []);
            }
        }
        $order = $user->orders()->make(Arr::except($data, ['design_final', 'project_version', 'draft_id', 'idempotency_key', 'items', 'pricing', 'delivery', 'address', 'supplier_id']));
        $order->forceFill(['idempotency_key' => $key]);
        // Who makes it (preferred suppliers, task 9.118): the one chosen, else 3DEEZI.
        \App\Models\Supplier::assign($order, $data['supplier_id'] ?? null);
        // The customer's pricing choices, for the invoice (payments-api.md R3).
        if (self::hasPricing()) {
            $order->forceFill(['pricing' => \App\Services\Pricing\PricingService::cleanChoices($data['pricing'] ?? null)]);
        }

        if ($source === 'studio') {
            $this->kit($user, $order, $data);
        } else {
            $order->source = $source;
            $order->approval = 'waiting';
            // A row's files must be the draft's own (they move to the order with the same ids).
            $files = $draft ? $draft->files()->pluck('id')->all() : [];
            $order->items = $this->items($user, array_map(fn ($item) => isset($item['file_ids'])
                ? ['file_ids' => array_values(array_intersect(array_map('intval', (array) $item['file_ids']), $files))] + $item : $item, $data['items'] ?? []));
            // The first saved design chosen on a row is the order's kit (for the admin's kit page).
            $first = collect($order->items ?? [])->pluck('project_id')->filter()->first();
            if ($first) {
                $project = $user->projects()->find($first);
                $order->project_id = $project?->id;
                $order->keepKit($project);
            }
        }
        $order->save();

        if ($draft) {
            // The draft's files are the order's now; the draft is done.
            $draft->files()->update(['order_id' => $order->id, 'order_draft_id' => null]);
            $draft->delete();
        }

        return $order;
    }

    /** Studio "Order this kit": the customer's own saved kit, confirmed as final, kept as ordered. */
    private function kit(User $user, Order $order, array $data): void
    {
        $order->source = 'studio';
        if (! isset($data['project_id'])) {
            return;
        }
        $project = $user->projects()->lockForUpdate()->find($data['project_id']);
        abort_unless($project, 422, 'Choose one of your saved projects.');
        // The design confirmed as final is the one made.
        if (isset($data['project_version']) && (int) $data['project_version'] !== $project->version) {
            abort(409, "This kit has changed since you opened it (it is now version {$project->version}). Check it, then order again.");
        }
        $order->keepKit($project);
        $order->approval = 'approved';
        if ($project->status !== 'approved') {
            // Ordering approves the design; the version stays the same.
            $project->forceFill(['status' => 'approved'])->save();
        }
    }

    /** The order form's rows; a saved design must be the customer's own, and is noted with its name and version. */
    private function items(User $user, array $items): ?array
    {
        $ids = collect($items)->pluck('project_id')->filter()->unique();
        $projects = $ids->isEmpty() ? collect() : $user->projects()->whereIn('id', $ids)->get(['id', 'name', 'version', 'garment', 'design'])->keyBy('id');
        $errors = [];
        foreach ($items as $i => &$item) {
            if (empty($item['project_id'])) {
                unset($item['project_id']);

                continue;
            }
            $project = $projects[$item['project_id']] ?? null;
            if (! $project) {
                $errors["items.$i.project_id"] = 'Garment '.($i + 1).': choose one of your saved designs.';

                continue;
            }
            $item['project_name'] = $project->name;
            $item['project_version'] = $project->version;
            // The design's own garment name ("Netball dress", task 9.99) names the row when the row is that garment, unless
            // the row has its own label; a row of another garment keeps its own name ("Rugby League Jersey", task 9.97).
            $product = trim((string) ($project->design['productName'] ?? ''));
            if ($product !== '' && blank($item['label'] ?? null) && Order::isDesignRow($project->garment, $item['garment'] ?? null)) {
                $item['label'] = mb_substr($product, 0, 60);
            }
        }
        unset($item);
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        return $items ?: null;
    }

    /** Whether the payments feature keeps pricing choices with orders (its class and the orders.pricing column). */
    private static function hasPricing(): bool
    {
        static $has;

        return $has ??= class_exists(\App\Services\Pricing\PricingService::class) && \Illuminate\Support\Facades\Schema::hasColumn('orders', 'pricing');
    }

    /** The order form's fields kept in a draft, for submitting it. */
    public static function fromDraft(OrderDraft $draft): array
    {
        return Arr::only(is_array($draft->data) ? $draft->data : [], OrderDraft::FIELDS);
    }
}
