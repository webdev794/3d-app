<?php

namespace App\Services\Payments;

use App\Jobs\SendBillingEmail;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderUpdate;
use App\Models\Payment;
use App\Services\Pricing\BillingSettings;
use App\Services\Pricing\Money;
use App\Services\Pricing\PricingService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Invoices for orders. A submitted order is priced: fully priced, it gets an invoice at once (unique number, the
 * order and prices kept as agreed, "Awaiting payment", emailed with its PDF and pay link); otherwise it waits as
 * "Quote required" until staff price it and issue it. Staff also cancel, record refunds and resend.
 */
class InvoiceService
{
    public function __construct(private PricingService $pricing) {}

    /** On a new order: issue its invoice, or open a quote for staff. Once per order. */
    public function openForOrder(Order $order): Invoice
    {
        $existing = $order->invoices()->where('status', '!=', 'cancelled')->latest('id')->first();
        if ($existing) {
            return $existing;
        }
        $quote = $this->pricing->quote($this->pricing->requestFor($order));
        $invoice = new Invoice;
        $invoice->forceFill(['order_id' => $order->id, 'user_id' => $order->user_id, 'status' => 'quote_required', 'currency' => $quote['currency']]);
        if ($quote['status'] === 'priced') {
            $this->saveIssued($invoice, $order, $quote, null);
            $this->afterIssue($invoice, $order, true);

            return $invoice;
        }
        $invoice->forceFill(['quote' => $quote, 'reasons' => $quote['reasons']])->save();
        $this->history($order, 'Quote required: '.implode(' ', array_column($quote['reasons'], 'message')), 'internal');

        return $invoice;
    }

    /** The quote for an order as it is now, with staff's prices (for the admin's preview). */
    public function preview(Order $order, array $overrides = []): array
    {
        return $this->pricing->quote($this->pricing->requestFor($order), $overrides);
    }

    /**
     * Staff issue an invoice: a quote_required one, or a new one for an order without an open invoice. The order is
     * priced again with staff's prices for what has none; anything still unpriced is a 422.
     */
    public function issue(Order $order, array $overrides = [], ?string $notes = null, bool $email = true): Invoice
    {
        $open = $order->invoices()->where('status', '!=', 'cancelled')->latest('id')->first();
        if ($open && $open->status !== 'quote_required') {
            abort(409, "This order already has invoice {$open->number} ({$open->label()}). Cancel it first to issue a new one.");
        }
        $quote = $this->preview($order, $overrides);
        if ($quote['status'] !== 'priced') {
            throw ValidationException::withMessages(['prices' => array_values(array_unique(array_column($quote['reasons'], 'message')))]);
        }
        $invoice = $open ?? (new Invoice)->forceFill(['order_id' => $order->id, 'user_id' => $order->user_id, 'status' => 'quote_required', 'currency' => $quote['currency']]);
        $this->saveIssued($invoice, $order, $quote, $notes);
        $this->afterIssue($invoice, $order, $email);

        return $invoice;
    }

    /**
     * Gives the invoice its number and keeps the agreed order and prices. Numbers come from the highest one so far
     * (inside a transaction); the unique index refuses a number another request took at the same moment, and then
     * the next one is taken.
     */
    private function saveIssued(Invoice $invoice, Order $order, array $quote, ?string $notes): void
    {
        $settings = BillingSettings::all();
        $snapshot = $this->snapshot($order);
        for ($attempt = 1; ; $attempt++) {
            try {
                DB::transaction(function () use ($invoice, $quote, $notes, $settings, $snapshot) {
                    if ($invoice->exists) {
                        $status = Invoice::query()->lockForUpdate()->whereKey($invoice->id)->value('status');
                        abort_if($status !== 'quote_required', 409, 'This invoice was already issued.');
                    }
                    $sequence = $this->nextSequence(max(1, (int) $settings['invoice_start']));
                    $invoice->forceFill([
                        'sequence' => $sequence,
                        'number' => 'INV-'.$sequence,
                        'status' => $quote['total_cents'] === 0 ? 'paid' : 'awaiting_payment',
                        'currency' => $quote['currency'],
                        'subtotal_cents' => $quote['subtotal_cents'],
                        'tax_cents' => $quote['tax']['amount_cents'],
                        'total_cents' => $quote['total_cents'],
                        'paid_cents' => 0,
                        'refunded_cents' => 0,
                        'quote' => $quote,
                        'snapshot' => $snapshot,
                        'reasons' => null,
                        'notes' => $notes ?? $invoice->notes,
                        'issued_at' => now(),
                        'due_at' => now()->addDays(max(0, (int) $settings['due_days']))->toDateString(),
                        'paid_at' => $quote['total_cents'] === 0 ? now() : null,
                        'last_attempt' => null,
                    ])->save();
                });

                return;
            } catch (UniqueConstraintViolationException $e) {
                if ($attempt >= 5) {
                    throw $e;
                }
            }
        }
    }

    /** The next invoice number: one more than the highest so far, and never below the admin's starting number. */
    protected function nextSequence(int $start): int
    {
        return max((int) Invoice::query()->lockForUpdate()->max('sequence') + 1, $start);
    }

    private function afterIssue(Invoice $invoice, Order $order, bool $email): void
    {
        $this->history($order, "Invoice {$invoice->number} issued: ".Money::format($invoice->total_cents, $invoice->currency).'.');
        if ($email && $invoice->total_cents > 0) {
            $this->emailInvoice($invoice);
        }
    }

    /** The order, the customer and the seller as they are now: kept with the invoice, never changed after. */
    public function snapshot(Order $order): array
    {
        $settings = BillingSettings::all();
        $user = $order->user;
        $items = [];
        foreach ((array) ($order->items ?? []) as $item) {
            $sizes = array_map('intval', (array) ($item['sizes'] ?? []));
            $items[] = ['name' => PricingService::itemName($item), 'garment' => $item['garment'] ?? null, 'sizes' => $sizes,
                'quantity' => (int) ($item['quantity'] ?? array_sum($sizes)), 'players' => is_array($item['players'] ?? null) ? count($item['players']) : 0];
        }
        if ($items === [] && (int) $order->quantity > 0) {
            $kit = $order->design_snapshot ?: ($order->project ? $order->project->only(['name', 'garment', 'sport']) : []);
            $items[] = ['name' => PricingService::itemName(['garment' => $kit['garment'] ?? 'jersey', 'sport' => $kit['sport'] ?? null]), 'garment' => $kit['garment'] ?? 'jersey',
                'sizes' => array_map('intval', (array) ($order->sizes ?? [])), 'quantity' => (int) $order->quantity, 'players' => is_array($order->players) ? count($order->players) : 0];
        }
        $name = method_exists($order, 'displayName') ? $order->displayName() : ($order->team_name ?: 'Order '.$order->number);

        return [
            'order' => ['id' => $order->id, 'number' => $order->number, 'name' => $name, 'source' => $order->source, 'quantity' => (int) $order->quantity,
                'items' => $items, 'summary' => self::summaryText($items)],
            'customer' => [
                'name' => $order->team_name ?: ($order->contact_name ?: $user?->name),
                'contact' => $order->contact_name ?: $user?->name,
                'email' => $order->contact_email ?: $user?->email,
                'phone' => $order->phone,
                'address' => $order->shipping_address,
            ],
            'seller' => BillingSettings::seller(),
            'note' => trim((string) $settings['invoice_note']),
            'bank_details' => trim((string) $settings['bank_details']),
            'payment_rule' => PaymentRules::rule(),
        ];
    }

    /** "20 jerseys · 20 shorts". */
    public static function summaryText(array $items): string
    {
        $garments = PricingService::garments();
        $parts = [];
        foreach ($items as $item) {
            $quantity = (int) ($item['quantity'] ?? 0);
            $name = mb_strtolower($garments[$item['garment'] ?? ''] ?? ($item['name'] ?? 'garment'));
            if ($quantity !== 1 && ! str_ends_with($name, 's')) {
                $name .= 's';
            }
            $parts[] = $quantity.' '.$name;
        }

        return implode(' · ', $parts);
    }

    /** Cancels an invoice nothing was paid on (its unfinished card payments too). */
    public function cancel(Invoice $invoice, ?string $note = null): Invoice
    {
        $open = DB::transaction(function () use ($invoice, $note) {
            $locked = Invoice::query()->lockForUpdate()->findOrFail($invoice->id);
            if ($locked->status === 'cancelled') {
                return null;
            }
            abort_if($locked->paid_cents - $locked->refunded_cents > 0, 409, 'This invoice has payments: record a refund first.');
            $locked->forceFill(['status' => 'cancelled', 'cancelled_at' => now(), 'notes' => $this->withNote($locked->notes, $note)])->save();
            $open = $locked->payments()->whereIn('status', ['pending', 'failed'])->get();
            $locked->payments()->whereIn('status', ['pending', 'failed'])->update(['status' => 'cancelled']);

            return $open;
        });
        $invoice->refresh();
        if ($open !== null) {
            foreach ($open as $payment) {
                Gateways::for($payment->provider)?->cancel($payment);
            }
            $this->history($invoice->order, 'Invoice '.($invoice->number ?? '(quote)').' cancelled.'.($note ? ' '.$note : ''));
        }

        return $invoice;
    }

    /**
     * Refunds what was paid: Airwallex card payments are refunded through Airwallex's API first (its refund
     * webhooks then change nothing more); everything else is recorded (a bank transfer back, or a refund made in
     * Stripe's dashboard).
     */
    public function refund(Invoice $invoice, ?string $note = null): Invoice
    {
        $fresh = $invoice->fresh();
        abort_if(! $fresh || $fresh->paid_cents <= 0, 409, 'Nothing was paid on this invoice.');
        abort_if($fresh->status === 'refunded', 409, 'This invoice is already refunded.');
        $viaProvider = false;
        foreach ($fresh->payments()->where('status', 'succeeded')->where('provider', 'airwallex')->get() as $payment) {
            $remaining = $payment->amount_cents - (int) ($payment->details['refunded_cents'] ?? 0);
            $gateway = Gateways::for($payment->provider);
            if ($remaining <= 0 || ! $gateway) {
                abort_if($remaining > 0, 409, 'Airwallex is not set up on this server, so this card payment cannot be refunded from here. Refund it in Airwallex first.');

                continue;
            }
            try {
                $refund = $gateway->refund($payment, $remaining);
            } catch (Throwable $e) {
                report($e);
                abort(502, 'Airwallex did not accept the refund: '.mb_substr(preg_replace('/^Airwallex: /', '', $e->getMessage()), 0, 200));
            }
            if ($refund) {
                app(PaymentService::class)->providerRefund($payment, $refund['id'], $remaining);
                $viaProvider = true;
            }
        }
        DB::transaction(function () use ($invoice, $note, $viaProvider) {
            $locked = Invoice::query()->lockForUpdate()->findOrFail($invoice->id);
            abort_if($locked->paid_cents <= 0, 409, 'Nothing was paid on this invoice.');
            abort_if($locked->status === 'refunded' && ! $viaProvider, 409, 'This invoice is already refunded.');
            $locked->forceFill(['status' => 'refunded', 'refunded_cents' => $locked->paid_cents, 'refunded_at' => now(), 'notes' => $this->withNote($locked->notes, $note)])->save();
            $locked->payments()->where('status', 'succeeded')->update(['status' => 'refunded']);
        });
        $invoice->refresh();
        $this->history($invoice->order, 'Refund of '.Money::format($invoice->refunded_cents, $invoice->currency)." recorded for invoice {$invoice->number}.".($note ? ' '.$note : ''));

        return $invoice;
    }

    private function withNote(?string $notes, ?string $note): ?string
    {
        $note = trim((string) $note);

        return $note === '' ? $notes : trim(($notes ? $notes."\n" : '').$note);
    }

    /** After a payment: the order's history and the receipt by email. */
    public function paymentReceived(Invoice $invoice, Payment $payment): void
    {
        $this->history($invoice->order, 'Payment received: '.Money::format($payment->amount_cents, $payment->currency)
            .($invoice->status === 'paid' ? " (invoice {$invoice->number} paid in full)." : " towards invoice {$invoice->number}."));
        SendBillingEmail::dispatchAfterResponse($invoice->id, 'receipt', $payment->id);
        // A 3DEEZI TEAM design request's invoice: paid in full, the request starts.
        if ($invoice->team_request_id ?? null) {
            try {
                app(\App\Services\Team\TeamService::class)->invoicePaid($invoice);
            } catch (Throwable $e) {
                report($e);
            }
        }
    }

    /** The invoice with its PDF and pay link, by email (sent after the response, so mail never slows or breaks it). */
    public function emailInvoice(Invoice $invoice): void
    {
        SendBillingEmail::dispatchAfterResponse($invoice->id, 'invoice');
    }

    /**
     * Notes billing news in the order's history. A customer-visible note would also email the customer (the order
     * updates feature), so until the history has its own "payment" kind these are staff-only: our own emails tell
     * the customer.
     */
    private function history(?Order $order, string $text, string $visibility = 'customer'): void
    {
        if (! $order || ! method_exists($order, 'record')) {
            return;
        }
        try {
            $kind = defined(OrderUpdate::class.'::KINDS') && in_array('payment', OrderUpdate::KINDS, true) ? 'payment' : 'note';
            $order->record($kind, ['message' => $text, 'visibility' => $kind === 'payment' ? $visibility : 'internal', 'data' => ['billing' => true]]);
        } catch (Throwable $e) {
            Log::info('Billing history not recorded: '.$e->getMessage(), ['order' => $order->id]);
        }
    }
}
