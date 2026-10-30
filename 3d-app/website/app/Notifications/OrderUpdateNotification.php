<?php

namespace App\Notifications;

use App\Models\Order;
use App\Models\OrderUpdate;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Tells a customer about their order: approval needed, a message from the 3DEEZI team, or the order shipped.
 * In the website (database) and by email. Sent straight away (not queued), so it works without a queue worker.
 */
class OrderUpdateNotification extends Notification
{
    public function __construct(public Order $order, public OrderUpdate $update) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return filled($notifiable->email ?? null) ? ['database', 'mail'] : ['database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $name = $this->order->displayName();
        $subject = match (true) {
            $this->update->kind === 'approval' => "Approval needed for {$this->order->number}",
            $this->update->kind === 'stage' || $this->update->kind === 'tracking' => "{$this->order->number} is on its way",
            default => "An update on your order {$this->order->number}",
        };
        $mail = (new MailMessage)
            ->subject("3DEEZI · {$subject}")
            ->greeting('Hi '.(explode(' ', trim((string) $notifiable->name))[0] ?: 'there').',')
            ->line("{$this->update->text()} · {$this->order->number} ({$name}).");
        if (filled($this->update->message)) {
            $mail->line('“'.$this->update->message.'”');
        }
        if ($this->order->tracking_url && in_array($this->update->kind, ['stage', 'tracking'], true)) {
            $mail->line('Track your parcel: '.$this->order->tracking_url);
        }

        return $mail->action($this->update->kind === 'approval' ? 'Review the design' : 'View your order', $this->link())
            ->line('You can follow every order on My Orders.');
    }

    /** What the website shows (stored in the notifications table). */
    public function toArray(object $notifiable): array
    {
        return [
            'order_id' => $this->order->id,
            'number' => $this->order->number,
            'name' => $this->order->displayName(),
            'kind' => $this->update->kind,
            'text' => $this->update->text(),
            'message' => $this->update->message,
            'link' => '/orders/'.$this->order->id,
        ];
    }

    private function link(): string
    {
        return url('/orders/'.$this->order->id);
    }
}
