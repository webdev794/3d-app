<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * The 6-digit code for "Forgot password?" (sign in with it, or set a new password). Queued on the "deferred"
 * connection like the Support email: it is sent just after the answer, so it needs no queue worker and a slow mail
 * server never delays the sign-in window.
 */
class LoginCode extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(public string $code, public string $recipientName = '')
    {
        $this->onConnection('deferred');
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your 3DEEZI code: '.$this->code);
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.login-code',
            text: 'mail.login-code-text',
            with: ['code' => $this->code, 'name' => trim(strtok($this->recipientName, ' ') ?: ''), 'minutes' => \App\Http\Controllers\LoginCodeController::MINUTES],
        );
    }
}
