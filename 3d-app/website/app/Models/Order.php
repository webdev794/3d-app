<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Order extends Model
{
    public const STATUSES = ['pending', 'confirmed', 'in_production', 'shipped', 'delivered', 'cancelled'];

    public const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Kids'];

    protected $fillable = ['user_id', 'project_id', 'status', 'sizes', 'unit_price', 'contact_name', 'phone', 'shipping_address', 'notes', 'admin_notes'];

    protected function casts(): array
    {
        return ['sizes' => 'array', 'quantity' => 'integer', 'unit_price' => 'decimal:2', 'total' => 'decimal:2'];
    }

    protected static function booted(): void
    {
        // Quantity and total always follow the sizes and the unit price.
        static::saving(function (Order $order) {
            $order->quantity = array_sum(array_map('intval', $order->sizes ?? []));
            $order->total = $order->unit_price === null ? null : round((float) $order->unit_price * $order->quantity, 2);
        });
        static::created(function (Order $order) {
            $order->forceFill(['number' => sprintf('3DZ-%05d', $order->id)])->saveQuietly();
        });
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
