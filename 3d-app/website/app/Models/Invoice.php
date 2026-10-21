<?php

namespace App\Models;

use App\Services\Payments\PaymentRules;
use App\Services\Pricing\BillingSettings;
use App\Services\Pricing\Money;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An order's invoice: "quote_required" while something has no price (no number yet), then issued with a unique
 * number (INV-1001...), the order and prices as agreed (quote, snapshot), and its payment status.
 * Amounts are whole cents.
 */
class Invoice extends Model
{
    /** status => [label, tone]. A failed or cancelled card payment leaves the invoice awaiting payment. */
    public const STATUSES = [
        'quote_required' => ['Quote required', 'amber'],
        'awaiting_payment' => ['Awaiting payment', 'amber'],
        'part_paid' => ['Deposit paid', 'blue'],
        'paid' => ['Paid', 'green'],
        'refunded' => ['Refunded', 'grey'],
        'cancelled' => ['Cancelled', 'grey'],
    ];

    /** Statuses the customer can pay in. */
    public const PAYABLE = ['awaiting_payment', 'part_paid'];

    protected $fillable = ['order_id', 'user_id', 'status', 'currency', 'notes'];

    protected function casts(): array
    {
        return ['sequence' => 'integer', 'subtotal_cents' => 'integer', 'tax_cents' => 'integer', 'total_cents' => 'integer', 'paid_cents' => 'integer',
            'refunded_cents' => 'integer', 'quote' => 'array', 'snapshot' => 'array', 'reasons' => 'array', 'last_attempt' => 'array',
            'issued_at' => 'datetime', 'due_at' => 'date', 'paid_at' => 'datetime', 'refunded_at' => 'datetime', 'cancelled_at' => 'datetime', 'emailed_at' => 'datetime'];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class)->orderBy('id');
    }

    public function label(): string
    {
        return self::STATUSES[$this->status][0] ?? ucfirst(str_replace('_', ' ', (string) $this->status));
    }

    /** The Review & Pay page (sign-in needed). */
    public function payUrl(): ?string
    {
        return $this->number ? url('/invoices/'.$this->number) : null;
    }

    /** Still to pay, in cents (null while the price is not set). */
    public function amountDue(): ?int
    {
        return $this->total_cents === null ? null : max(0, $this->total_cents - $this->paid_cents);
    }

    /** The deposit asked for before production (the rule when it was issued), while nothing is paid; else null. */
    public function depositDue(): ?int
    {
        $rule = $this->snapshot['payment_rule'] ?? null;
        if (($rule['rule'] ?? 'none') !== 'deposit' || $this->paid_cents > 0 || $this->total_cents === null || ! in_array($this->status, self::PAYABLE, true)) {
            return null;
        }
        $deposit = Money::percentOf($this->total_cents, (int) ($rule['deposit_percent'] ?? 50));

        return $deposit > 0 && $deposit < $this->total_cents ? $deposit : null;
    }

    public function canPay(): bool
    {
        return in_array($this->status, self::PAYABLE, true) && ($this->amountDue() ?? 0) > 0;
    }

    /** The status for order cards and the app (null = no invoice yet). See payments-api.md 2. */
    public static function summary(?self $invoice): ?array
    {
        if (! $invoice) {
            return null;
        }
        [$label, $tone] = self::STATUSES[$invoice->status] ?? [$invoice->label(), 'grey'];

        return [
            'invoice_id' => $invoice->id,
            'invoice_number' => $invoice->number,
            'status' => $invoice->status,
            'label' => $label,
            'tone' => $tone,
            'currency' => $invoice->currency,
            'total' => Money::decimal($invoice->total_cents),
            'amount_paid' => Money::decimal($invoice->paid_cents),
            'amount_due' => Money::decimal($invoice->amountDue()),
            'deposit_due' => Money::decimal($invoice->depositDue()),
            'issued_at' => $invoice->issued_at?->toIso8601String(),
            'due_at' => $invoice->due_at?->toDateString(),
            'paid_at' => $invoice->paid_at?->toIso8601String(),
            'pay_url' => $invoice->payUrl(),
            'pdf' => $invoice->number ? '/invoices/'.$invoice->number.'/pdf' : null,
            'can_pay' => $invoice->canPay(),
            'last_attempt' => $invoice->last_attempt,
            'reasons' => $invoice->status === 'quote_required' ? array_values($invoice->reasons ?? []) : [],
            'production_ready' => PaymentRules::met($invoice),
        ];
    }

    /** The seller's currency for a new invoice. */
    public static function currency(): string
    {
        return BillingSettings::currency();
    }
}
