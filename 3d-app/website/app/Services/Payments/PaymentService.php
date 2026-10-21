<?php

namespace App\Services\Payments;

use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PaymentEvent;
use App\Models\User;
use App\Services\Pricing\Money;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Paying invoices: starting a card payment (an Airwallex or Stripe PaymentIntent, or a test payment), and applying
 * what the provider reports (its webhook, a check after the customer comes back, or the TEST form) through one path.
 * Each provider event is handled once; an invoice is marked paid once; a failed or cancelled attempt leaves it
 * awaiting payment, ready to try again.
 */
class PaymentService
{
    public function __construct(private InvoiceService $invoices) {}

    /** Starts (or picks up the open) payment of the amount due, or of the deposit. */
    public function start(Invoice $invoice, User $user, string $kind = 'full'): Payment
    {
        $gateway = Gateways::current();
        abort_unless($gateway, 503, 'Online payment is not available yet. Please pay by bank transfer, or contact us.');

        [$payment, $fresh, $older] = DB::transaction(function () use ($invoice, $user, $kind, $gateway) {
            $invoice = Invoice::query()->lockForUpdate()->findOrFail($invoice->id);
            abort_if($invoice->order && $invoice->order->status === 'cancelled', 409, 'This order was cancelled, so it cannot be paid.');
            abort_unless($invoice->canPay(), 409, $invoice->status === 'paid' ? 'This invoice is already paid.' : 'This invoice cannot be paid now.');
            $amount = $kind === 'deposit' ? $invoice->depositDue() : $invoice->amountDue();
            abort_unless($amount, 422, $kind === 'deposit' ? 'No deposit is due on this invoice.' : 'Nothing is due on this invoice.');
            $kind = $kind === 'deposit' ? 'deposit' : ($invoice->paid_cents > 0 ? 'balance' : 'full');
            $open = $invoice->payments()->where('provider', $gateway->name())->whereIn('status', ['pending', 'failed'])->orderByDesc('id')->get();
            // The same amount again (a retry, a reload): the same payment, so it can only be paid once.
            // (Airwallex's client secret is short-lived: an older Airwallex payment is replaced by a new one.)
            $same = $open->first(fn (Payment $p) => $p->amount_cents === $amount && $p->provider_id && ($p->provider === 'test' || $p->client_secret)
                && ! ($p->provider === 'airwallex' && $p->created_at?->lt(now()->subMinutes(AirwallexGateway::REUSE_MINUTES))));
            if ($same) {
                return [$same, false, collect()];
            }
            $payment = $invoice->payments()->create(['user_id' => $user->id, 'provider' => $gateway->name(), 'kind' => $kind, 'method' => 'card',
                'amount_cents' => $amount, 'currency' => $invoice->currency, 'status' => 'pending']);

            return [$payment, true, $open];
        });
        if (! $fresh) {
            return $payment;
        }
        try {
            $intent = $gateway->create($payment, $invoice->fresh(['order']));
        } catch (Throwable $e) {
            report($e);
            $payment->forceFill(['status' => 'failed', 'message' => 'The payment could not be started.'])->save();
            abort(502, 'We could not start the payment. Please try again in a minute.');
        }
        $payment->forceFill(['provider_id' => $intent['id'], 'client_secret' => $intent['client_secret']])->save();
        // An older open payment of another amount (deposit vs. in full) is cancelled, so only one is ever paid.
        foreach ($older as $old) {
            $gateway->cancel($old);
            $old->forceFill(['status' => 'cancelled'])->save();
        }

        return $payment;
    }

    /**
     * A provider event (Stripe's or Airwallex's webhook, or a test payment's result): {id, type, data: {object}}
     * (Airwallex's event name is passed as type). The same event id twice changes nothing.
     * Returns handled, duplicate, unknown (not one of our payments) or ignored.
     */
    public function handleEvent(array $event, string $provider = 'stripe'): string
    {
        $id = (string) ($event['id'] ?? '');
        $type = (string) ($event['type'] ?? '');
        $object = $event['data']['object'] ?? null;
        if ($id === '' || $type === '' || ! is_array($object)) {
            return 'ignored';
        }
        try {
            return DB::transaction(function () use ($id, $type, $object, $provider) {
                $record = PaymentEvent::query()->create(['provider' => $provider, 'event_id' => $id, 'type' => $type]);
                $paymentId = match (true) {
                    $provider === 'airwallex' => AirwallexGateway::intentIdOf($type, $object),
                    str_starts_with($type, 'payment_intent.') => (string) ($object['id'] ?? ''),
                    $type === 'charge.refunded' => (string) ($object['payment_intent'] ?? ''),
                    default => null,
                };
                if ($paymentId === null) {
                    return 'ignored';
                }
                $payment = $paymentId === '' ? null : Payment::query()->where('provider', $provider)->where('provider_id', $paymentId)->first();
                if (! $payment) {
                    return 'unknown';
                }
                $record->forceFill(['payment_id' => $payment->id])->save();
                match (true) {
                    $provider === 'airwallex' => $this->applyAirwallex($payment, $type, $object),
                    $type === 'charge.refunded' => $this->refunded($payment, $object),
                    default => $this->apply($payment, $object),
                };

                return 'handled';
            });
        } catch (UniqueConstraintViolationException) {
            return 'duplicate';
        }
    }

    /** An Airwallex event: the PaymentIntent's state, a failed attempt, or a refund (made here or in Airwallex). */
    private function applyAirwallex(Payment $payment, string $type, array $object): void
    {
        match (true) {
            str_starts_with($type, 'payment_intent.') => $this->apply($payment, AirwallexGateway::intentState($object)),
            in_array($type, AirwallexGateway::ATTEMPT_FAILURES, true) => $this->apply($payment, AirwallexGateway::attemptFailure($object)),
            in_array($type, ['refund.accepted', 'refund.settled'], true) => $this->providerRefund($payment, (string) ($object['id'] ?? ''), AirwallexGateway::cents($object['amount'] ?? 0)),
            $type === 'refund.failed' => $this->providerRefundFailed($payment, (string) ($object['id'] ?? ''), (string) ($object['failure_reason'] ?? $object['failure_code'] ?? '')),
            default => null,
        };
    }

    /** Applies a PaymentIntent's state to our payment. */
    public function apply(Payment $payment, array $intent): void
    {
        $status = (string) ($intent['status'] ?? '');
        if ($status === 'succeeded') {
            $received = (int) ($intent['amount_received'] ?? $intent['amount'] ?? 0);
            if ($received > 0 && $received !== $payment->amount_cents) {
                // Never expected (the server sets the amount), but the money taken is what counts.
                Log::warning('Payment amount differs from the PaymentIntent', ['payment' => $payment->id, 'expected' => $payment->amount_cents, 'received' => $received]);
                $payment->forceFill(['amount_cents' => $received])->save();
            }
            $this->succeeded($payment, $this->cardDetails($intent));
        } elseif ($status === 'processing') {
            $this->mark($payment, 'processing', null);
        } elseif ($status === 'canceled') {
            $this->mark($payment, 'cancelled', 'The payment was cancelled.');
        } elseif ($status === 'requires_payment_method' && ! empty($intent['last_payment_error'])) {
            $this->mark($payment, 'failed', (string) ($intent['last_payment_error']['message'] ?? 'The payment did not go through.'));
        }
    }

    /** Marks a payment paid and adds it to the invoice: once only, whatever reports it how often. */
    public function succeeded(Payment $payment, array $details = []): bool
    {
        $done = DB::transaction(function () use ($payment, $details) {
            $payment = Payment::query()->lockForUpdate()->findOrFail($payment->id);
            if (in_array($payment->status, ['succeeded', 'refunded'], true)) {
                return null;
            }
            $invoice = Invoice::query()->lockForUpdate()->findOrFail($payment->invoice_id);
            $payment->forceFill([
                'status' => 'succeeded', 'message' => null, 'paid_at' => $details['paid_at'] ?? now(),
                'method' => $details['method'] ?? ($payment->method ?: 'card'),
                'details' => ! empty($details['card']) ? $details['card'] : $payment->details,
            ])->save();
            $invoice->paid_cents += $payment->amount_cents;
            $full = $invoice->total_cents !== null && $invoice->paid_cents >= $invoice->total_cents;
            $invoice->forceFill([
                'status' => $full ? 'paid' : 'part_paid',
                'paid_at' => $full ? now() : $invoice->paid_at,
                'last_attempt' => ['status' => 'succeeded', 'message' => null, 'at' => now()->toIso8601String()],
            ])->save();

            return [$payment, $invoice];
        });
        if (! $done) {
            return false;
        }
        $this->invoices->paymentReceived($done[1], $done[0]);

        return true;
    }

    /** A payment that is processing, failed or cancelled: the invoice stays as it is, with the attempt noted. */
    private function mark(Payment $payment, string $status, ?string $message): void
    {
        DB::transaction(function () use ($payment, $status, $message) {
            $payment = Payment::query()->lockForUpdate()->find($payment->id);
            // A success is never undone by a late or repeated event.
            if (! $payment || in_array($payment->status, ['succeeded', 'refunded'], true)) {
                return;
            }
            $message = $message === null ? null : mb_substr($message, 0, 500);
            $payment->forceFill(['status' => $status, 'message' => $message])->save();
            Invoice::query()->whereKey($payment->invoice_id)->lockForUpdate()->first()?->forceFill([
                'last_attempt' => ['status' => $status, 'message' => $message, 'at' => now()->toIso8601String()],
            ])->save();
        });
    }

    /** Stripe's charge.refunded: what was refunded of this payment (all of it, or part). */
    private function refunded(Payment $payment, array $charge): void
    {
        DB::transaction(function () use ($payment, $charge) {
            $payment = Payment::query()->lockForUpdate()->findOrFail($payment->id);
            $total = min($payment->amount_cents, (int) ($charge['amount_refunded'] ?? 0));
            $this->recordRefunded($payment, $total, ! empty($charge['refunded']));
        });
    }

    /**
     * A refund through a provider's API (Airwallex): each refund id counts once, whether it comes from our refund
     * request or from its webhooks (refund.accepted, then refund.settled), or was made in Airwallex's web app.
     */
    public function providerRefund(Payment $payment, string $refundId, int $cents): void
    {
        if ($refundId === '' || $cents <= 0) {
            return;
        }
        DB::transaction(function () use ($payment, $refundId, $cents) {
            $payment = Payment::query()->lockForUpdate()->findOrFail($payment->id);
            $refunds = (array) ($payment->details['refunds'] ?? []);
            if (array_key_exists($refundId, $refunds)) {
                return;
            }
            $refunds[$refundId] = $cents;
            $payment->details = array_merge($payment->details ?? [], ['refunds' => $refunds]);
            $this->recordRefunded($payment, min($payment->amount_cents, (int) array_sum($refunds)), false);
        });
    }

    /** Airwallex's refund.failed: a refund counted already is taken back off, so the invoice shows the money as paid. */
    private function providerRefundFailed(Payment $payment, string $refundId, string $reason): void
    {
        Log::warning('Airwallex refund failed', ['payment' => $payment->id, 'refund' => $refundId, 'reason' => mb_substr($reason, 0, 200)]);
        DB::transaction(function () use ($payment, $refundId, $reason) {
            $payment = Payment::query()->lockForUpdate()->findOrFail($payment->id);
            $invoice = Invoice::query()->lockForUpdate()->findOrFail($payment->invoice_id);
            $refunds = (array) ($payment->details['refunds'] ?? []);
            $cents = (int) ($refunds[$refundId] ?? 0);
            unset($refunds[$refundId]);
            $details = array_merge($payment->details ?? [], ['refunds' => $refunds, 'refunded_cents' => min($payment->amount_cents, (int) array_sum($refunds)),
                'refund_failed' => ['id' => $refundId, 'reason' => mb_substr($reason, 0, 200) ?: null, 'at' => now()->toIso8601String()]]);
            $payment->forceFill(['details' => $details, 'status' => $payment->status === 'refunded' && $details['refunded_cents'] < $payment->amount_cents ? 'succeeded' : $payment->status])->save();
            if ($cents > 0) {
                $invoice->refunded_cents = max(0, $invoice->refunded_cents - $cents);
                if ($invoice->status === 'refunded' && $invoice->refunded_cents < $invoice->paid_cents) {
                    $full = $invoice->total_cents !== null && $invoice->paid_cents >= $invoice->total_cents;
                    $invoice->forceFill(['status' => $full ? 'paid' : 'part_paid', 'refunded_at' => null]);
                }
                $invoice->forceFill(['last_attempt' => ['status' => 'refund_failed', 'message' => 'A refund failed in Airwallex'.($reason !== '' ? ': '.mb_substr($reason, 0, 200) : '.'), 'at' => now()->toIso8601String()]])->save();
            }
        });
    }

    /** Records that $total cents of a (locked) payment are refunded now, and adds the difference to its invoice. */
    private function recordRefunded(Payment $payment, int $total, bool $full): void
    {
        $invoice = Invoice::query()->lockForUpdate()->findOrFail($payment->invoice_id);
        $before = (int) ($payment->details['refunded_cents'] ?? 0);
        if ($total <= $before) {
            if ($payment->isDirty()) {
                $payment->save();
            }

            return;
        }
        $payment->forceFill(['details' => array_merge($payment->details ?? [], ['refunded_cents' => $total]),
            'status' => $full || $total >= $payment->amount_cents ? 'refunded' : $payment->status])->save();
        $invoice->refunded_cents += $total - $before;
        if ($invoice->paid_cents > 0 && $invoice->refunded_cents >= $invoice->paid_cents) {
            $invoice->forceFill(['status' => 'refunded', 'refunded_at' => $invoice->refunded_at ?? now()]);
        }
        $invoice->save();
    }

    /** Asks the provider how a payment stands (after the browser confirms it, or the customer is back from Airwallex), then applies it. */
    public function sync(Payment $payment): void
    {
        if (in_array($payment->status, ['succeeded', 'refunded', 'cancelled'], true)) {
            return;
        }
        $gateway = Gateways::for($payment->provider);
        if (! $gateway) {
            return;
        }
        try {
            $intent = $gateway->retrieve($payment);
        } catch (Throwable $e) {
            report($e);

            return;
        }
        if ($intent) {
            $this->apply($payment, $intent);
        }
    }

    /**
     * Test mode: the TEST form's outcome, as the event Stripe would send, through the same handling as the webhook.
     */
    public function completeTest(Payment $payment, string $outcome, string $method = 'card'): void
    {
        abort_unless($payment->provider === 'test' && Gateways::testAllowed(), 404);
        $paid = $outcome === 'succeeded';
        $intent = [
            'id' => $payment->provider_id,
            'object' => 'payment_intent',
            'amount' => $payment->amount_cents,
            'amount_received' => $paid ? $payment->amount_cents : 0,
            'currency' => strtolower($payment->currency),
            'status' => $paid ? 'succeeded' : 'requires_payment_method',
            'last_payment_error' => $paid ? null : ['code' => 'card_declined', 'message' => 'Your card was declined. (Test payment: no card was charged.)'],
            'payment_method' => ['type' => 'card', 'card' => ['brand' => 'visa', 'last4' => '4242', 'wallet' => $method === 'wallet' ? ['type' => 'google_pay'] : null]],
            'metadata' => ['payment_id' => (string) $payment->id],
        ];
        $this->handleEvent(['id' => 'evt_test_'.Str::uuid(), 'type' => $paid ? 'payment_intent.succeeded' : 'payment_intent.payment_failed', 'data' => ['object' => $intent]], 'test');
    }

    /** Staff record a payment received another way (bank transfer, cash): paid through the same path. */
    public function recordManual(Invoice $invoice, User $staff, array $data): Payment
    {
        abort_unless(in_array($invoice->status, Invoice::PAYABLE, true), 409, 'Only an invoice awaiting payment can be marked paid.');
        $due = (int) $invoice->amountDue();
        $amount = isset($data['amount']) && $data['amount'] !== null && $data['amount'] !== '' ? (int) Money::toCents($data['amount']) : $due;
        abort_if($amount <= 0, 422, 'Enter the amount received.');
        abort_if($amount > $due, 422, 'That is more than the amount due ('.Money::format($due, $invoice->currency).').');
        $payment = $invoice->payments()->create([
            'user_id' => $staff->id, 'provider' => 'manual', 'kind' => $amount < $due ? ($invoice->paid_cents > 0 ? 'balance' : 'deposit') : ($invoice->paid_cents > 0 ? 'balance' : 'full'),
            'method' => $data['method'] ?? 'bank_transfer', 'amount_cents' => $amount, 'currency' => $invoice->currency, 'status' => 'pending',
            'reference' => filled($data['reference'] ?? null) ? mb_substr(trim((string) $data['reference']), 0, 120) : null,
        ]);
        $this->succeeded($payment, ['method' => $payment->method, 'paid_at' => $data['paid_at'] ?? now()]);

        return $payment->refresh();
    }

    /** The card's brand and last 4 digits, and the wallet (Apple Pay, Google Pay), when the provider sends them. */
    private function cardDetails(array $intent): array
    {
        $method = $intent['payment_method'] ?? null;
        if (! is_array($method)) {
            return [];
        }
        $card = is_array($method['card'] ?? null) ? $method['card'] : [];
        $wallet = $card['wallet']['type'] ?? null;

        return ['method' => $wallet ? 'wallet' : 'card', 'card' => array_filter(['brand' => $card['brand'] ?? null, 'last4' => $card['last4'] ?? null, 'wallet' => $wallet])];
    }
}
