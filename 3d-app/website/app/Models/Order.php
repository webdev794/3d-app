<?php

namespace App\Models;

use App\Support\OrderStages;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\Schema;

class Order extends Model
{
    /** The board's stages are these statuses (see App\Support\OrderStages); cancelled orders are off the board. */
    public const STATUSES = ['pending', 'confirmed', 'in_production', 'shipped', 'delivered', 'cancelled'];

    /** Garments on the order form. */
    public const GARMENTS = ['jersey' => 'Jersey', 'shorts' => 'Shorts', 'tee' => 'Training tee', 'singlet' => 'Singlet', 'polo' => 'Polo',
        'hoodie' => 'Hoodie', 'jacket' => 'Jacket', 'warmup' => 'Warm-up top', 'pants' => 'Track pants', 'socks' => 'Socks', 'cap' => 'Cap', 'other' => 'Other'];

    public const FITS = ['mens' => 'Mens', 'womens' => 'Womens', 'youth' => 'Youth', 'unisex' => 'Unisex'];

    /** Where the order came from: Order this kit, the order form, an uploaded order form, or staff. */
    public const SOURCES = ['studio', 'form', 'upload', 'admin'];

    /** The design approval: in progress, proof sent (approval needed), approved, changes requested. */
    public const APPROVALS = ['waiting', 'review', 'approved', 'changes'];

    public const MAX_ITEMS = 30;

    /** Delivered orders count as completed (off the current board) this many days after delivery. */
    public const COMPLETED_AFTER_DAYS = 14;

    /** Never in a customer's API response. */
    public const INTERNAL = ['admin_notes', 'assigned_to', 'due_date', 'idempotency_key', 'design_snapshot', 'user_id'];

    public const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Kids'];

    /** Names and numbers on the back: the same on every shirt, a different one for each player (a list), or none. */
    public const NAMES = ['same', 'list', 'none'];

    public const MAX_PLAYERS = 300;

    /** The sample name a new design starts with: the customer types the real one when ordering. */
    public const PLACEHOLDER_NAME = 'YOUR NAME';

    protected $fillable = ['user_id', 'project_id', 'status', 'sizes', 'unit_price', 'contact_name', 'phone', 'shipping_address', 'notes', 'admin_notes', 'names', 'players',
        'source', 'team_name', 'contact_email', 'items', 'needed_by', 'approval', 'step', 'carrier', 'tracking_number', 'tracking_url', 'assigned_to', 'due_date'];

    protected $attributes = ['status' => 'pending', 'source' => 'studio'];

    // The kit as ordered holds the design's pictures (large): only the admin's order page asks for it.
    protected $hidden = ['design_snapshot', 'idempotency_key'];

    /**
     * For the next save's activity history: `note` (a customer-visible message to go with the change), `override`
     * (the approval it was moved on without), `unpaid` and `reason` (moved on before full payment, and why). Not a column.
     */
    public array $activity = [];

    /** Whether the last save used the `note` in its history (else the caller records it as a note). */
    public bool $noteRecorded = false;

    /** Changes recorded in the history as an internal edit, with the words used for them. */
    private const EDIT_LABELS = ['user_id' => 'customer', 'project_id' => 'kit', 'sizes' => 'sizes', 'items' => 'garments', 'unit_price' => 'unit price',
        'contact_name' => 'contact name', 'contact_email' => 'email', 'phone' => 'phone', 'shipping_address' => 'delivery address', 'notes' => 'instructions',
        'admin_notes' => 'internal notes', 'names' => 'names and numbers', 'players' => 'names and numbers', 'team_name' => 'name',
        'needed_by' => 'needed-by date', 'assigned_to' => 'assigned staff', 'due_date' => 'due date'];

    protected function casts(): array
    {
        return ['sizes' => 'array', 'quantity' => 'integer', 'unit_price' => 'decimal:2', 'total' => 'decimal:2', 'players' => 'array', 'design_snapshot' => 'array', 'project_version' => 'integer',
            'items' => 'array', 'needed_by' => 'date:Y-m-d', 'due_date' => 'date:Y-m-d', 'assigned_to' => 'integer', 'status_changed_at' => 'datetime',
            // The customer's price choices (destination, extras, discount code), kept as JSON for the invoice.
            'pricing' => 'array'];
    }

    protected static function booted(): void
    {
        static::saving(function (Order $order) {
            if ($order->isDirty(['names', 'players'])) {
                $order->players = self::tidyPlayers($order->names, $order->players);
            }
            // A players list decides the sizes (one garment each), so the two never disagree.
            if ($order->names === 'list' && $order->players) {
                $order->sizes = self::countSizes($order->players);
            }
            // So do the order form's garments: the order's sizes are theirs added up.
            if ($order->isDirty('items')) {
                $order->items = is_array($order->items) && $order->items !== [] ? self::tidyItems($order->items) : null;
            }
            if ($order->items) {
                $order->sizes = self::sumItems($order->items);
            }
            // An uploaded order form has its sizes in the file until staff enter them.
            $order->sizes ??= [];
            // Quantity and total always follow the sizes and the unit price.
            $order->quantity = array_sum(array_map('intval', $order->sizes ?? []));
            $order->total = $order->unit_price === null ? null : round((float) $order->unit_price * $order->quantity, 2);
            // A new stage starts at its default sub-status, unless one is given with it.
            if (! $order->exists || $order->isDirty('status')) {
                $order->status_changed_at = now();
                if ($order->exists && ! $order->isDirty('step')) {
                    $order->step = null;
                }
            }
        });
        static::created(function (Order $order) {
            $order->forceFill(['number' => sprintf('3DZ-%05d', $order->id)])->saveQuietly();
            $order->record('submitted', ['to_status' => $order->status, 'data' => ['source' => $order->source]]);
        });
        static::updated(fn (Order $order) => $order->recordChanges());
    }

    /** Keeps the kit as it is now with the order, so later edits to the project don't change what was ordered. */
    public function keepKit(?Project $project): void
    {
        $this->design_snapshot = $project?->only(['name', 'sport', 'garment', 'mode', 'design', 'thumbnail']);
        $this->project_version = $project?->version;
    }

    /** Garments per size for a players list, in size order. */
    public static function countSizes(array $players): array
    {
        $counts = array_count_values(array_filter(array_column($players, 'size'), 'is_string'));

        return array_filter(array_combine(self::SIZES, array_map(fn ($size) => $counts[$size] ?? 0, self::SIZES)));
    }

    /** Each row as {name, number} (and its size in a list), trimmed; none unless the back has names. */
    private static function tidyPlayers(?string $names, mixed $players): ?array
    {
        if (! in_array($names, ['same', 'list'], true) || ! is_array($players)) {
            return null;
        }
        $rows = array_map(fn ($p) => ['name' => trim((string) ($p['name'] ?? '')), 'number' => trim((string) ($p['number'] ?? ''))]
            + ($names === 'list' ? ['size' => $p['size'] ?? null] : []), array_values(array_filter($players, 'is_array')));

        return $names === 'same' ? array_slice($rows, 0, 1) : $rows;
    }

    /**
     * The order form's rows, tidied: {garment, sport, fit, label, project_id, project_name, project_version,
     * sizes (only sizes ordered, in size order), quantity, players}.
     */
    public static function tidyItems(array $items): array
    {
        return array_values(array_map(function ($item) {
            $sizes = [];
            foreach (self::SIZES as $size) {
                $n = (int) ($item['sizes'][$size] ?? 0);
                if ($n > 0) {
                    $sizes[$size] = $n;
                }
            }
            $players = is_array($item['players'] ?? null) ? array_values(array_map(fn ($p) => [
                'name' => trim((string) ($p['name'] ?? '')), 'number' => trim((string) ($p['number'] ?? '')), 'size' => $p['size'] ?? null,
            ], array_filter($item['players'], 'is_array'))) : [];
            $text = fn ($key, $max) => filled($item[$key] ?? null) ? mb_substr(trim((string) $item[$key]), 0, $max) : null;

            return array_filter([
                'garment' => (string) ($item['garment'] ?? 'other'),
                'sport' => $text('sport', 40),
                'fit' => $text('fit', 20),
                'label' => $text('label', 60),
                'project_id' => isset($item['project_id']) ? (int) $item['project_id'] : null,
                'project_name' => $text('project_name', 120),
                'project_version' => isset($item['project_version']) ? (int) $item['project_version'] : null,
                'sizes' => $sizes,
                'quantity' => array_sum($sizes),
                'players' => $players ?: null,
                'file_ids' => is_array($item['file_ids'] ?? null) && $item['file_ids'] ? array_values(array_unique(array_map('intval', $item['file_ids']))) : null,
            ], fn ($v) => $v !== null);
        }, array_filter($items, 'is_array')));
    }

    /** All the rows' sizes added up, in size order. */
    public static function sumItems(array $items): array
    {
        $sum = array_fill_keys(self::SIZES, 0);
        foreach ($items as $item) {
            foreach ((array) ($item['sizes'] ?? []) as $size => $n) {
                if (isset($sum[$size])) {
                    $sum[$size] += (int) $n;
                }
            }
        }

        return array_filter($sum);
    }

    /** A garment row's name: "Rugby League Jersey", or its own label. */
    public static function itemName(array $item): string
    {
        if (filled($item['label'] ?? null)) {
            return (string) $item['label'];
        }
        $sport = collect(config('catalog.sports'))->firstWhere('id', $item['sport'] ?? null)['name'] ?? null;

        return trim(($sport ? $sport.' ' : '').(self::GARMENTS[$item['garment'] ?? 'other'] ?? 'Garment'));
    }

    /** The name shown for the order: the team, else the kit, else its reference. */
    public function displayName(): string
    {
        return $this->team_name ?: ($this->project?->name ?: ($this->getAttribute('kit_name') ?: 'Order '.$this->number));
    }

    /** Completed orders are off the current board: cancelled, or delivered over COMPLETED_AFTER_DAYS ago. */
    public function isCompleted(): bool
    {
        return $this->status === 'cancelled'
            || ($this->status === 'delivered' && $this->status_changed_at && $this->status_changed_at->lt(now()->subDays(self::COMPLETED_AFTER_DAYS)));
    }

    /** Whether moving to this status would skip the customer's design approval (see OrderStages::MAKING). */
    public function approvalMissingFor(string $status): bool
    {
        return in_array($status, OrderStages::MAKING, true)
            && ! in_array($this->getOriginal('status') ?? $this->status, OrderStages::MAKING, true)
            && in_array($this->approval, ['waiting', 'review', 'changes'], true);
    }

    /** The newest design proof the customer can see. */
    public function latestProof(): ?OrderFile
    {
        return $this->files()->where('kind', 'proof')->where('visibility', 'customer')->orderByDesc('version')->orderByDesc('id')->first();
    }

    /**
     * Adds an entry to the activity history. The author is the signed-in user: staff in the admin panel, the
     * customer on their own order; nobody (the website) otherwise.
     */
    public function record(string $kind, array $fields = []): OrderUpdate
    {
        $user = auth()->user();
        $author = match (true) {
            $user && $user->is_admin && request()->routeIs('admin.*') => 'staff',
            $user && $user->id === $this->user_id => 'customer',
            (bool) $user?->is_admin => 'staff',
            default => 'system',
        };

        $data = ['author' => $author] + ($fields['data'] ?? []);

        return $this->updates()->create(['kind' => $kind, 'data' => $data] + $fields + ['user_id' => $user?->id, 'visibility' => 'customer']);
    }

    /** The history of a save: stage, sub-status and tracking for the customer; other edits for staff only. */
    private function recordChanges(): void
    {
        $changes = $this->getChanges();
        $context = $this->activity;
        $this->activity = [];
        $note = filled($context['note'] ?? null) ? trim((string) $context['note']) : null;
        $this->noteRecorded = false;
        $withNote = function () use (&$note) {
            [$message, $note] = [$note, null];
            $this->noteRecorded = $this->noteRecorded || $message !== null;

            return $message;
        };
        $tracking = array_intersect_key($changes, array_flip(['carrier', 'tracking_number', 'tracking_url'])) !== [] && ($this->tracking_number || $this->tracking_url);
        $trackingData = ['carrier' => $this->carrier, 'number' => $this->tracking_number, 'url' => $this->tracking_url];

        if (array_key_exists('status', $changes)) {
            $shipped = $this->status === 'shipped' && ($this->tracking_number || $this->carrier);
            $this->record('stage', ['from_status' => $this->getOriginal('status'), 'to_status' => $this->status, 'step' => $this->step, 'message' => $withNote(),
                'data' => $shipped ? $trackingData : []]);
            $tracking = $tracking && ! $shipped;
            if (! empty($context['override'])) {
                $this->record('note', ['visibility' => 'internal', 'message' => 'Moved to '.OrderStages::label($this->status).' without the customer\'s design approval ('.($this->approval === 'review' ? 'approval needed' : ($this->approval === 'changes' ? 'changes requested' : 'design in progress')).').', 'data' => ['override' => 'approval']]);
            }
            if (! empty($context['unpaid'])) {
                $this->record('note', ['visibility' => 'internal', 'message' => 'Moved to '.OrderStages::label($this->status).' before full payment ('.$context['unpaid'].'). Reason: '.$context['reason'],
                    'data' => ['override' => 'payment', 'reason' => $context['reason']]]);
            }
        } elseif (array_key_exists('step', $changes) && $this->step) {
            $this->record('step', ['to_status' => $this->status, 'step' => $this->step, 'message' => $withNote()]);
        }
        if ($tracking) {
            $this->record('tracking', ['message' => $withNote(), 'data' => $trackingData]);
        }
        $edited = array_values(array_unique(array_intersect_key(self::EDIT_LABELS, $changes)));
        if ($edited) {
            $this->record('edit', ['visibility' => 'internal', 'data' => ['fields' => $edited]]);
        }
    }

    /** Every column but the kit as ordered (see keepKit), for lists of orders. */
    public function scopeWithoutKit(Builder $query): void
    {
        static $columns;
        $columns ??= array_values(array_diff(Schema::getColumnListing('orders'), ['design_snapshot']));
        $query->select(array_map(fn ($column) => 'orders.'.$column, $columns));
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** The staff member looking after the order. */
    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /** The activity history, oldest first. */
    public function updates(): HasMany
    {
        return $this->hasMany(OrderUpdate::class)->orderBy('id');
    }

    public function latestUpdate(): HasOne
    {
        return $this->hasOne(OrderUpdate::class)->latestOfMany();
    }

    /** The newest entry a customer may see. */
    public function latestCustomerUpdate(): HasOne
    {
        return $this->hasOne(OrderUpdate::class)->ofMany(['id' => 'max'], fn ($q) => $q->where('visibility', 'customer'));
    }

    public function files(): HasMany
    {
        return $this->hasMany(OrderFile::class)->orderBy('id');
    }

    /** The first customer-visible picture (artwork or a proof), for a card without a kit picture. */
    public function cover(): HasOne
    {
        return $this->hasOne(OrderFile::class)->ofMany(['id' => 'min'], fn ($q) => $q->where('visibility', 'customer')->whereNotNull('thumb')->whereIn('kind', ['artwork', 'proof', 'photo']));
    }

    /** Payments feature: every invoice of the order, oldest first (see payments-api.md). */
    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class)->orderBy('id');
    }

    /** Payments feature: the order's current invoice; its card summary is Invoice::summary($order->invoice). */
    public function invoice(): HasOne
    {
        return $this->hasOne(Invoice::class)->latestOfMany();
    }

    /** Payments feature: whether the order's invoice is paid in full (the rule before Production). */
    public function isPaidInFull(): bool
    {
        return \App\Services\Payments\PaymentRules::paidInFull($this);
    }
}
