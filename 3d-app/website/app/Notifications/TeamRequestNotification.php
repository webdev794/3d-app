<?php

namespace App\Notifications;

use App\Models\TeamRequest;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * News about a 3DEEZI TEAM design request, in the website and app (notifications table, like order updates) and,
 * for the customer's key moments, by email. Sent straight away (not queued). Shape: team-api.md 6.
 */
class TeamRequestNotification extends Notification
{
    /** Kinds the customer also gets by email. */
    private const MAILED = ['review', 'approved', 'message', 'received'];

    public function __construct(public TeamRequest $request, public string $kind, public string $text, public ?string $message = null, public bool $staff = false) {}

    /** Kinds the assigned designer (an admin too, when the owner designs) also gets by email. */
    private const DESIGNER_MAILED = ['assigned', 'message', 'revision', 'approved'];

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        $designer = $this->staff && ($notifiable->id ?? null) && (int) $notifiable->id === (int) $this->request->designer_id;
        $mail = filled($notifiable->email ?? null) && ($this->staff
            ? $designer && in_array($this->kind, self::DESIGNER_MAILED, true)
            : in_array($this->kind, self::MAILED, true));

        return $mail ? ['database', 'mail'] : ['database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->subject("3DEEZI TEAM · {$this->text} · {$this->request->number}")
            ->greeting('Hi '.(explode(' ', trim((string) $notifiable->name))[0] ?: 'there').',')
            ->line("{$this->text} · {$this->request->number} ({$this->request->name}).");
        if (filled($this->message)) {
            $mail->line('“'.mb_substr((string) $this->message, 0, 600).'”');
        }

        return $mail->action($this->staff ? 'Open the request' : ($this->kind === 'review' ? 'Review your design' : 'Open your request'), url($this->link($notifiable)));
    }

    public function toArray(object $notifiable): array
    {
        return [
            'team_request_id' => $this->request->id,
            // Null so the app's order notifications never open a wrong order.
            'order_id' => null,
            'number' => $this->request->number,
            'name' => $this->request->name,
            'kind' => $this->kind,
            'text' => $this->text,
            'message' => $this->message === null ? null : mb_substr($this->message, 0, 300),
            'link' => $this->link($notifiable),
        ];
    }

    private function link(object $notifiable): string
    {
        if (! $this->staff) {
            return '/team/requests/'.$this->request->id;
        }

        return ($notifiable->is_admin ?? false) ? '/admin/team/'.$this->request->id : '/designer/'.$this->request->id;
    }
}
