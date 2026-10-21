<?php

namespace App\Mail;

use App\Models\SupportMessage;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Tells the 3DEEZI team about a new message from the Support page. Queued on the "deferred" connection: it is sent
 * just after the visitor's page has its answer, so it needs no queue worker (shared hosting) and a slow or failing
 * mail server never delays or loses the saved message.
 */
class SupportMessageReceived extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(public SupportMessage $supportMessage)
    {
        $this->onConnection('deferred');
    }

    public function envelope(): Envelope
    {
        $reference = $this->supportMessage->order_reference ? ' ('.$this->supportMessage->order_reference.')' : '';

        return new Envelope(
            replyTo: [new Address($this->supportMessage->email, $this->supportMessage->name)],
            subject: '3DEEZI Support: message from '.$this->supportMessage->name.$reference,
        );
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.support-message', with: ['item' => $this->supportMessage]);
    }
}
