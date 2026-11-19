<?php

namespace App\Support;

use App\Models\Order;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * The gate into Production: an order should have the customer's design approval and be paid in full before it moves
 * into Production (or past it). Staff may still move it, with an explicit confirmation (and a reason for an unpaid
 * order); the override is recorded in the order's history.
 */
final class OrderGate
{
    /**
     * Checks a status change on $order (not saved yet). Throws 409 listing the problems (code approval_missing or
     * payment_missing) unless confirmed, 422 when an unpaid order is confirmed without a reason.
     *
     * @return array{override: ?string, unpaid: ?string, reason: ?string} what was overridden, for the history
     */
    public static function check(Order $order, bool $confirmApproval, bool $confirmUnpaid, ?string $reason): array
    {
        $none = ['override' => null, 'unpaid' => null, 'reason' => null];
        $from = $order->getOriginal('status');
        if (! $order->isDirty('status') || ! in_array($order->status, OrderStages::MAKING, true) || in_array($from, OrderStages::MAKING, true)) {
            return $none;
        }
        $label = OrderStages::label($order->status);
        $problems = [];
        $approval = $order->approvalMissingFor($order->status);
        if ($approval && ! $confirmApproval) {
            $state = ['waiting' => 'the design is still in progress', 'review' => 'the customer has not approved the design proof yet', 'changes' => 'the customer asked for changes to the design'][$order->approval] ?? 'the design is not approved';
            $problems[] = ['code' => 'approval_missing', 'message' => "Not approved: {$state}."];
        }
        $unpaid = self::unpaid($order);
        $reason = trim((string) $reason);
        if ($unpaid && ! $confirmUnpaid) {
            $problems[] = ['code' => 'payment_missing', 'message' => $unpaid.'.', 'needs_reason' => true];
        }
        if ($problems) {
            throw new HttpResponseException(response()->json([
                'message' => "Moving {$order->number} to {$label}: ".implode(' ', array_column($problems, 'message')).' Move it anyway?',
                'code' => $problems[0]['code'],
                'problems' => $problems,
            ], 409));
        }
        if ($unpaid && mb_strlen($reason) < 3) {
            throw ValidationException::withMessages(['override_reason' => 'Give a reason for moving an order that is not paid in full into '.$label.'.']);
        }

        return ['override' => $approval ? (string) $order->approval : null, 'unpaid' => $unpaid, 'reason' => $unpaid ? mb_substr($reason, 0, 500) : null];
    }

    /** Null when the order is paid in full; else why not: "Not paid in full: INV-1048 A$1,870.00 outstanding". */
    public static function unpaid(Order $order): ?string
    {
        if (method_exists($order, 'isPaidInFull')) {
            try {
                if ($order->isPaidInFull()) {
                    return null;
                }
            } catch (Throwable) {
                // Read the invoice below instead.
            }
        }
        $invoice = self::invoice($order);
        if ($invoice && $invoice->status === 'paid') {
            return null;
        }
        if (! $invoice) {
            return 'Not paid in full: no invoice has been issued yet';
        }
        if ($invoice->status === 'quote_required') {
            return 'Not paid in full: the price is still to be confirmed (quote required)';
        }
        $due = method_exists($invoice, 'amountDue') ? $invoice->amountDue() : null;

        // "A$1,870.00", as every price on the site (task 9.85).
        return trim('Not paid in full: '.($invoice->number ?: 'the invoice')
            .($due === null ? '' : ' '.\App\Services\Pricing\Money::format($due, (string) ($invoice->currency ?: $order->currency ?: 'AUD'))).' outstanding');
    }

    /** The order's current invoice (not cancelled), from the payments feature; null without one. */
    public static function invoice(Order $order): ?Model
    {
        if (! class_exists(\App\Models\Invoice::class)) {
            return null;
        }
        try {
            $query = method_exists($order, 'invoices') ? $order->invoices() : \App\Models\Invoice::where('order_id', $order->id);

            return $query->where('status', '!=', 'cancelled')->latest('id')->first();
        } catch (Throwable) {
            return null;
        }
    }
}
