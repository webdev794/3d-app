<?php

namespace App\Jobs;

use App\Models\Invoice;
use App\Models\Payment;
use App\Notifications\InvoiceIssued;
use App\Notifications\PaymentReceived;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Emails the customer their invoice (with its PDF and pay link) or a payment receipt. Dispatched to run after the
 * response, so a slow or failing mail server never delays or undoes the order or the payment.
 */
class SendBillingEmail
{
    use Dispatchable;

    public function __construct(public int $invoiceId, public string $type = 'invoice', public ?int $paymentId = null) {}

    public function handle(): void
    {
        try {
            $invoice = Invoice::query()->with(['user', 'order'])->find($this->invoiceId);
            $user = $invoice?->user;
            if (! $invoice || ! $user || ! filled($user->email) || ! $invoice->number) {
                return;
            }
            if ($this->type === 'receipt') {
                $payment = $this->paymentId ? Payment::query()->find($this->paymentId) : null;
                // Only a payment that really went through (a rolled-back one never sends a receipt).
                if (! $payment || $payment->status !== 'succeeded') {
                    return;
                }
                $user->notify(new PaymentReceived($invoice, $payment));

                return;
            }
            if (! in_array($invoice->status, Invoice::PAYABLE, true)) {
                return;
            }
            $user->notify(new InvoiceIssued($invoice));
            $invoice->forceFill(['emailed_at' => now()])->saveQuietly();
        } catch (Throwable $e) {
            Log::warning("Billing email ({$this->type}) failed: ".$e->getMessage(), ['invoice' => $this->invoiceId]);
        }
    }
}
