<?php

namespace App\Notifications;

use App\Models\Invoice;
use App\Models\Payment;
use App\Services\Pdf\InvoicePdf;
use App\Services\Pricing\Money;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Schema;

/** The receipt: what was paid, when and how, and what is still due; the invoice PDF (marked paid) attached. */
class PaymentReceived extends Notification
{
    public function __construct(public Invoice $invoice, public Payment $payment) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return array_values(array_filter([filled($notifiable->email ?? null) ? 'mail' : null, Schema::hasTable('notifications') ? 'database' : null]));
    }

    public function toMail(object $notifiable): MailMessage
    {
        $invoice = $this->invoice;
        $payment = $this->payment;
        $amount = Money::format($payment->amount_cents, $payment->currency);
        $card = isset($payment->details['last4']) ? ' by '.ucfirst((string) ($payment->details['brand'] ?? 'card')).' •••• '.$payment->details['last4']
            : match ($payment->method) {
                'bank_transfer' => ' by bank transfer',
                'cash' => ' in cash',
                default => '',
            };
        $order = $invoice->snapshot['order']['number'] ?? null;
        $mail = (new MailMessage)
            ->subject("3DEEZI · Payment received · {$invoice->number}")
            ->greeting('Thank you, '.(explode(' ', trim((string) $notifiable->name))[0] ?: 'there').'!')
            ->line("We received your payment of {$amount}{$card} on ".($payment->paid_at ?? now())->format('j M Y')." for invoice {$invoice->number}".($order ? " (order {$order})" : '').'.')
            ->line($invoice->status === 'paid' ? 'Your invoice is paid in full.' : 'Still to pay: '.Money::format($invoice->amountDue(), $invoice->currency).'.')
            ->line('Receipt: '.$invoice->number.'-'.$payment->id.($payment->reference ? ' · Reference '.$payment->reference : ''))
            ->action('View your invoice', (string) $invoice->payUrl());

        return $mail->attachData(InvoicePdf::render($invoice), $invoice->number.'.pdf', ['mime' => 'application/pdf']);
    }

    public function toArray(object $notifiable): array
    {
        return [
            'order_id' => $this->invoice->order_id,
            'number' => $this->invoice->snapshot['order']['number'] ?? null,
            'name' => $this->invoice->snapshot['order']['name'] ?? null,
            'kind' => 'payment',
            'text' => 'Payment received: '.Money::format($this->payment->amount_cents, $this->payment->currency)." for invoice {$this->invoice->number}",
            'message' => null,
            'link' => '/invoices/'.$this->invoice->number,
        ];
    }
}
