<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * One line of the admin's price list: a garment's unit price (for every sport or one sport), an extra (charged per
 * garment, per printed name/number or per order), a shipping destination's rate, or a discount (an automatic quantity
 * tier, or a code customers type). Amounts are in cents.
 */
class PriceRule extends Model
{
    public const KINDS = ['garment', 'extra', 'shipping', 'discount'];

    /** What an extra is charged per. */
    public const UNITS = ['garment', 'player', 'order'];

    protected $fillable = ['kind', 'code', 'sport', 'name', 'amount_cents', 'per_item_cents', 'percent', 'unit', 'auto', 'min_quantity', 'taxable', 'active', 'sort'];

    protected function casts(): array
    {
        return ['amount_cents' => 'integer', 'per_item_cents' => 'integer', 'percent' => 'decimal:2', 'auto' => 'boolean',
            'min_quantity' => 'integer', 'taxable' => 'boolean', 'active' => 'boolean', 'sort' => 'integer'];
    }

    public function scopeActive(Builder $query): void
    {
        $query->where('active', true);
    }

    public function scopeKind(Builder $query, string $kind): void
    {
        $query->where('kind', $kind);
    }
}
