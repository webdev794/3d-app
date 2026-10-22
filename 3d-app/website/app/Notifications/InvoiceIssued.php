<?php

namespace App\Notifications;

use App\Models\Invoice;
use App\Services\Pdf\InvoicePdf;
use App\Services\Pricing\Money;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Schema;

/**
 * The customer's invoice: the amount, the due date, a "Review & pay" button (the pay page: sign in with the order's
 * account) and the PDF attached. Also in the website's notifications.
 */
class InvoiceIssued extends Notification
{
    public function __construct(public Invoice $invoice) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return array_values(array_filter([filled($notifiable->email ?? null) ? 'mail' : null, Schema::hasTable('notifications') ? 'database' : null]));
    }

    public function toMail(object $notifiable): MailMessage
    {
        $invoice = $this->invoice;
        $order = $invoice->snapshot['order'] ?? [];
        $total = Money::format($invoice->total_cents, $invoice->currency);
        $tax = $invoice->quote['tax'] ?? [];
        $mail = (new MailMessage)
            ->subject("3DEEZI · Invoice {$invoice->number} · {$total}")
            ->greeting('Hi '.(explode(' ', trim((string) $notifiable->name))[0] ?: 'there').',')
            ->line('Thanks for your order'.(filled($order['number'] ?? null) ? ' '.$order['number'] : '').(filled($order['name'] ?? null) ? ' ('.$order['name'].')' : '').". Your invoice {$invoice->number} is ready.")
            ->line("Amount due: {$total}".(($tax['amount_cents'] ?? 0) > 0 ? ' (includes '.($tax['name'] ?? 'GST').' '.Money::format($tax['amount_cents'], $invoice->currency).')' : '').'.'
                .($invoice->due_at ? ' Please pay by '.$invoice->due_at->format('j M Y').'.' : ''))
            ->action('Review & pay', (string) $invoice->payUrl())
            ->line('Sign in with this email address to pay securely by card or wallet. The invoice is attached as a PDF.');
        $bank = trim((string) ($invoice->snapshot['bank_details'] ?? ''));
        if ($bank !== '') {
            $mail->line("Prefer a bank transfer? {$bank} · Reference: {$invoice->number}");
        }
        if (($invoice->snapshot['payment_rule']['rule'] ?? 'none') === 'full') {
            $mail->line('Production starts once the invoice is paid in full.');
        }
        if (filled($invoice->snapshot['note'] ?? null)) {
            $mail->line((string) $invoice->snapshot['note']);
        }

        return $mail->attachData(InvoicePdf::render($invoice), $invoice->number.'.pdf', ['mime' => 'application/pdf']);
    }

    /** What the website shows (notifications table), like the order updates. */
    public function toArray(object $notifiable): array
    {
        // A 3DEEZI TEAM design request's invoice (no order): the TEAM bell finds it by team_request_id.
        $teamRequestId = $this->invoice->team_request_id;
        $team = $teamRequestId && (! filled($this->invoice->snapshot['order']['number'] ?? null) || ! filled($this->invoice->snapshot['order']['name'] ?? null))
            ? $this->invoice->teamRequest : null;

        return [
            'order_id' => $this->invoice->order_id,
            'team_request_id' => $teamRequestId,
            'number' => $this->invoice->snapshot['order']['number'] ?? $team?->number,
            'name' => $this->invoice->snapshot['order']['name'] ?? $team?->name,
            'kind' => 'invoice',
            'text' => "Invoice {$this->invoice->number} is ready: ".Money::format($this->invoice->total_cents, $this->invoice->currency).' to pay',
            'message' => null,
            'link' => '/invoices/'.$this->invoice->number,
        ];
    }
}
