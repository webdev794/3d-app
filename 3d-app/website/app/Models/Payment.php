<?php

namespace App\Models;

use App\Services\Pricing\Money;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One payment towards an invoice: an Airwallex or Stripe PaymentIntent, a test payment (test mode), or one staff recorded (a bank
 * transfer). Card details are never here: the provider keeps them; at most the card brand and last 4 digits.
 */
class Payment extends Model
{
    public const STATUSES = ['pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded'];

    public const METHODS = ['card', 'wallet', 'bank_transfer', 'cash', 'other'];

    protected $fillable = ['invoice_id', 'user_id', 'provider', 'provider_id', 'kind', 'method', 'amount_cents', 'currency', 'status', 'message', 'reference', 'details', 'paid_at'];

    protected $hidden = ['client_secret'];

    protected function casts(): array
    {
        return ['amount_cents' => 'integer', 'details' => 'array', 'paid_at' => 'datetime', 'client_secret' => 'encrypted'];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** For the pay page and the admin (no secrets). */
    public function present(): array
    {
        return [
            'id' => $this->id,
            'provider' => $this->provider,
            'kind' => $this->kind,
            'method' => $this->method,
            'status' => $this->status,
            'amount' => Money::decimal($this->amount_cents),
            'currency' => $this->currency,
            'message' => $this->message,
            'reference' => $this->reference,
            'card' => isset($this->details['last4']) ? ['brand' => $this->details['brand'] ?? null, 'last4' => $this->details['last4']] : null,
            'paid_at' => $this->paid_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
