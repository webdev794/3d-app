<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A saved, not yet submitted order form or uploaded order. Never an order: no reference number, not on the board.
 * Submitting it makes one order, which takes its files; the draft is then deleted.
 */
class OrderDraft extends Model
{
    public const KINDS = ['form', 'upload'];

    /** The order fields a draft's data may hold (anything else the page keeps there is left out when submitting). */
    public const FIELDS = ['contact_name', 'contact_email', 'phone', 'team_name', 'shipping_address', 'needed_by', 'notes', 'items', 'pricing', 'delivery', 'address', 'supplier_id', 'assist_token'];

    /** The largest data a draft may hold, as JSON. */
    public const MAX_BYTES = 200 * 1024;

    protected $fillable = ['kind', 'title', 'data'];

    protected $hidden = ['user_id'];

    protected function casts(): array
    {
        return ['data' => 'array'];
    }

    protected static function booted(): void
    {
        static::saving(function (OrderDraft $draft) {
            $name = is_array($draft->data) ? trim((string) ($draft->data['team_name'] ?? '')) : '';
            $draft->title = $name === '' ? null : mb_substr($name, 0, 120);
        });
        // Its files go with it (a submitted draft's files belong to the order by then).
        static::deleting(fn (OrderDraft $draft) => $draft->files()->get()->each->delete());
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function files(): HasMany
    {
        return $this->hasMany(OrderFile::class)->orderBy('id');
    }

    /** For lists: no data, the number of files and garment rows. */
    public function summary(): array
    {
        $items = is_array($this->data['items'] ?? null) ? $this->data['items'] : [];

        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'title' => $this->title,
            // What the lists call it: the team name, else what it holds ("Rugby League Jersey · 25"); null when empty.
            // My orders adds "draft from 11 Nov" (QA10 2026-11-11: every unnamed draft was "Untitled order").
            'name' => $this->title ?? self::contentName($items),
            'quantity' => self::quantityOf($items),
            'files_count' => (int) ($this->files_count ?? $this->files()->count()),
            'garments_count' => count($items),
            'link' => $this->kind === 'upload' ? '/orders/upload?draft='.$this->id : '/orders/new?draft='.$this->id,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    /** "Rugby League Jersey · 25", "Rugby League Jersey + 1 more · 40": the first garment by name and the total; null without rows. */
    public static function contentName(array $items): ?string
    {
        $rows = array_values(array_filter($items, 'is_array'));
        $names = array_values(array_unique(array_filter(array_map(fn (array $row) => trim(Order::itemName($row)), $rows))));
        if (! $names) {
            return null;
        }
        $name = $names[0].(count($names) > 1 ? ' + '.(count($names) - 1).' more' : '');
        $quantity = self::quantityOf($rows);

        return mb_substr($quantity > 0 ? "{$name} · {$quantity}" : $name, 0, 160);
    }

    /** The rows' garments together: each row's quantity, else its sizes added up. */
    public static function quantityOf(array $items): int
    {
        return array_sum(array_map(function ($row) {
            if (! is_array($row)) {
                return 0;
            }
            $sizes = is_array($row['sizes'] ?? null) ? array_sum(array_map(fn ($n) => max(0, (int) $n), $row['sizes'])) : 0;

            return max(0, (int) ($row['quantity'] ?? 0)) ?: $sizes;
        }, $items));
    }
}
