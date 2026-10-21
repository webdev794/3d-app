<?php

namespace App\Services\Payments;

use App\Models\Invoice;
use App\Models\Order;
use App\Services\Pricing\BillingSettings;
use App\Services\Pricing\Money;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * The rule for paying before Production (Admin > Pricing > Payments): the whole invoice (the default: the client's
 * rule), a deposit (a percentage of the invoice), or none. An invoice keeps the rule it was issued under.
 */
final class PaymentRules
{
    /** Whether the order's invoice is paid in full (false with no invoice, a quote still to price, or a cancelled one). */
    public static function paidInFull(Order $order): bool
    {
        $invoice = self::current($order);

        return $invoice !== null && $invoice->total_cents !== null
            && ($invoice->status === 'paid' || ($invoice->status === 'part_paid' && $invoice->paid_cents >= $invoice->total_cents));
    }

    /** The order's invoice that counts (not cancelled); null without one, or before the payments migration ran. */
    public static function current(Order $order): ?Invoice
    {
        static $table;
        try {
            if (! ($table ??= Schema::hasTable('invoices'))) {
                return null;
            }

            return $order->invoices()->where('status', '!=', 'cancelled')->latest('id')->first();
        } catch (Throwable) {
            return null;
        }
    }

    /** The rule an invoice was issued under, else the current one: {rule, deposit_percent}. */
    public static function rule(?Invoice $invoice = null): array
    {
        $rule = $invoice?->snapshot['payment_rule'] ?? null;
        if (! is_array($rule) || ! in_array($rule['rule'] ?? null, BillingSettings::RULES, true)) {
            $rule = ['rule' => BillingSettings::get('payment_rule'), 'deposit_percent' => (int) BillingSettings::get('deposit_percent')];
        }

        return ['rule' => in_array($rule['rule'], BillingSettings::RULES, true) ? $rule['rule'] : 'none', 'deposit_percent' => max(1, min(100, (int) ($rule['deposit_percent'] ?? 50)))];
    }

    /** Whether the rule is met: always with no rule; else the deposit or the whole invoice is paid. */
    public static function met(?Invoice $invoice): bool
    {
        $rule = self::rule($invoice);
        if ($rule['rule'] === 'none') {
            return true;
        }
        if (! $invoice || $invoice->total_cents === null || in_array($invoice->status, ['quote_required', 'cancelled', 'refunded'], true)) {
            return false;
        }
        if ($invoice->status === 'paid') {
            return true;
        }

        return $rule['rule'] === 'deposit' && $invoice->paid_cents > 0
            && $invoice->paid_cents >= Money::percentOf($invoice->total_cents, $rule['deposit_percent']);
    }

    /** Null when the order may go into Production; else why not (for staff to confirm, like a missing approval). */
    public static function productionWarning(Order $order): ?string
    {
        $invoice = self::current($order);
        if (self::met($invoice)) {
            return null;
        }
        $rule = self::rule($invoice);
        if (! $invoice || $invoice->status === 'quote_required') {
            return 'This order has no invoice yet: '.($rule['rule'] === 'deposit' ? "a {$rule['deposit_percent']}% deposit" : 'payment in full').' is required before production.';
        }

        return $rule['rule'] === 'deposit'
            ? "The {$rule['deposit_percent']}% deposit for invoice {$invoice->number} is not paid yet."
            : "Invoice {$invoice->number} is not paid in full yet.";
    }
}
