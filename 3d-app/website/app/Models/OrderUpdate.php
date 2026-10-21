<?php

namespace App\Models;

use App\Notifications\OrderUpdateNotification;
use App\Support\OrderStages;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * One entry in an order's activity history: who did what, and when. Customer-visible entries are the customer's
 * updates; internal ones (staff notes, edits) are only ever shown to staff.
 */
class OrderUpdate extends Model
{
    /** "payment" (invoice issued, payment received, refund, cancelled) is written by the payments feature: shown to the customer, never emailed (it sends its own emails). */
    public const KINDS = ['submitted', 'stage', 'step', 'approval', 'tracking', 'note', 'file', 'edit', 'payment'];

    protected $fillable = ['user_id', 'kind', 'visibility', 'from_status', 'to_status', 'step', 'approval', 'message', 'order_file_id', 'data'];

    protected function casts(): array
    {
        return ['data' => 'array'];
    }

    protected static function booted(): void
    {
        // The customer hears about what needs them or what they would want to know: approval needed, a message
        // from the team, and the order being shipped (after the change is saved for good).
        static::created(function (OrderUpdate $update) {
            if ($update->notifiesCustomer()) {
                DB::afterCommit(fn () => $update->notifyCustomer());
            }
        });
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function file(): BelongsTo
    {
        return $this->belongsTo(OrderFile::class, 'order_file_id');
    }

    /** Who did it, as the customer sees it: staff, customer or system (the website). */
    public function author(): string
    {
        return (string) ($this->data['author'] ?? ($this->user_id ? 'staff' : 'system'));
    }

    /** The entry as one line, ready to show. */
    public function text(): string
    {
        $data = $this->data ?? [];
        $version = isset($data['version']) ? ' v'.$data['version'] : '';

        return match ($this->kind) {
            'submitted' => match ($data['source'] ?? null) {
                'form' => 'Order received from your order form',
                'upload' => 'Order received with your uploaded order form',
                'admin' => 'Order added by the 3DEEZI team',
                default => 'Order received',
            },
            'stage' => match (true) {
                $this->to_status === 'cancelled' => 'Order cancelled',
                // Shipped with its tracking in one go: one entry (and one message to the customer).
                $this->to_status === 'shipped' && (filled($data['carrier'] ?? null) || filled($data['number'] ?? null)) => self::trackingText($data),
                default => 'Moved to '.OrderStages::label((string) $this->to_status),
            },
            // A sub-status with staff's own words ("Sewing underway, numbers next") shows those words.
            'step' => filled($this->message) ? (string) $this->message : OrderStages::stepText((string) ($this->to_status ?: 'in_production'), (string) $this->step),
            'approval' => match ($this->approval) {
                'review' => 'Design proof'.$version.' is ready for your approval',
                'approved' => 'Design'.($version ? ' proof'.$version : '').' approved',
                'changes' => 'Changes requested'.($version ? ' to design proof'.$version : ''),
                default => 'Design in progress',
            },
            'tracking' => self::trackingText($data),
            'file' => ucfirst(str_replace('_', ' ', (string) ($data['file_kind'] ?? 'file'))).' added'.(filled($data['name'] ?? null) ? ': '.$data['name'] : ''),
            'edit' => 'Order details changed'.(empty($data['fields']) ? '' : ': '.implode(', ', $data['fields'])),
            default => (string) ($this->message ?? ''),
        };
    }

    private static function trackingText(array $data): string
    {
        return 'Shipped'.(filled($data['carrier'] ?? null) ? ' with '.$data['carrier'] : '')
            .(filled($data['number'] ?? null) ? '. Tracking number '.$data['number'] : '');
    }

    /** As the customer sees it (customer-visible entries only, see Order::customerUpdates). */
    public function forCustomer(): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'text' => $this->text(),
            'message' => $this->message,
            'from_status' => $this->from_status,
            'to_status' => $this->to_status,
            'step' => $this->step,
            'approval' => $this->approval,
            'author' => $this->author(),
            'file' => $this->file && $this->file->visibility === 'customer' ? $this->file->toArray() : null,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    /** As staff see it: also internal entries, who did it and the details kept with it. */
    public function forStaff(): array
    {
        return [
            ...$this->forCustomer(),
            'visibility' => $this->visibility,
            'file' => $this->file?->toArray(),
            'user' => $this->user ? ['id' => $this->user->id, 'name' => $this->user->name] : null,
            'data' => $this->data,
        ];
    }

    public function notifiesCustomer(): bool
    {
        return $this->visibility === 'customer' && $this->author() !== 'customer' && match ($this->kind) {
            'approval' => $this->approval === 'review',
            'note', 'tracking' => true,
            'stage' => $this->to_status === 'shipped',
            default => false,
        };
    }

    public function notifyCustomer(): void
    {
        try {
            $customer = $this->order?->user;
            $customer?->notify(new OrderUpdateNotification($this->order, $this));
        } catch (Throwable $e) {
            // A mail server that is down never undoes the staff member's change.
            Log::warning('Order update notification failed: '.$e->getMessage(), ['order' => $this->order_id, 'update' => $this->id]);
        }
    }
}
