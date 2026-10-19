<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Schema;

class Order extends Model
{
    public const STATUSES = ['pending', 'confirmed', 'in_production', 'shipped', 'delivered', 'cancelled'];

    public const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Kids'];

    /** Names and numbers on the back: the same on every shirt, a different one for each player (a list), or none. */
    public const NAMES = ['same', 'list', 'none'];

    public const MAX_PLAYERS = 300;

    /** The sample name a new design starts with: the customer types the real one when ordering. */
    public const PLACEHOLDER_NAME = 'YOUR NAME';

    protected $fillable = ['user_id', 'project_id', 'status', 'sizes', 'unit_price', 'contact_name', 'phone', 'shipping_address', 'notes', 'admin_notes', 'names', 'players'];

    // The kit as ordered holds the design's pictures (large): only the admin's order page asks for it.
    protected $hidden = ['design_snapshot'];

    protected function casts(): array
    {
        return ['sizes' => 'array', 'quantity' => 'integer', 'unit_price' => 'decimal:2', 'total' => 'decimal:2', 'players' => 'array', 'design_snapshot' => 'array', 'project_version' => 'integer'];
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
            // Quantity and total always follow the sizes and the unit price.
            $order->quantity = array_sum(array_map('intval', $order->sizes ?? []));
            $order->total = $order->unit_price === null ? null : round((float) $order->unit_price * $order->quantity, 2);
        });
        static::created(function (Order $order) {
            $order->forceFill(['number' => sprintf('3DZ-%05d', $order->id)])->saveQuietly();
        });
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
}
