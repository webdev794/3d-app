<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\Schema;

/**
 * A 3DEEZI TEAM design request (TEAM-1001...): a customer's brief that a 3DEEZI designer turns into a design.
 * Statuses and permissions: team-api.md.
 */
class TeamRequest extends Model
{
    /** status => [customer label, progress index]. */
    public const STATUSES = [
        'awaiting_payment' => ['Awaiting payment', -1],
        'received' => ['Request received', 0],
        'assigned' => ['Designer assigned', 1],
        'in_progress' => ['Design in progress', 2],
        'review' => ['Ready for review', 3],
        'revision' => ['Revisions requested', 3],
        'approved' => ['Final: approved', 4],
        'closed' => ['Closed', -1],
    ];

    /** Not finished: still counts as open. */
    public const OPEN = ['awaiting_payment', 'received', 'assigned', 'in_progress', 'review', 'revision'];

    /** A designer may move a request to these. */
    public const DESIGNER_STATUSES = ['in_progress', 'review'];

    protected $fillable = ['name', 'email', 'sport', 'garment', 'category', 'description', 'colours', 'instructions', 'priority', 'due_date', 'revisions_allowed'];

    protected function casts(): array
    {
        return ['colours' => 'array', 'final_asset_ids' => 'array', 'used_bonus' => 'boolean', 'sequence' => 'integer', 'price_cents' => 'integer',
            'revisions_used' => 'integer', 'revisions_allowed' => 'integer', 'final_version' => 'integer', 'due_date' => 'date',
            'approved_at' => 'datetime', 'closed_at' => 'datetime', 'refunded_at' => 'datetime', 'extra_revisions' => 'integer', 'status_changed_at' => 'datetime', 'customer_read_at' => 'datetime', 'staff_read_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function designer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'designer_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(TeamMessage::class)->orderBy('id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(TeamFile::class)->orderBy('id');
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    /** The request's own invoice that counts (not cancelled; not an extra revision's). */
    public function invoice(): HasOne
    {
        return $this->hasOne(Invoice::class)->ofMany(['id' => 'max'], function ($q) {
            $q->where('status', '!=', 'cancelled');
            if (self::answersReady()) {
                $q->where(fn ($q) => $q->whereNull('team_purpose')->orWhere('team_purpose', 'request'));
            }
        });
    }

    /** The latest extra revision round's invoice (not cancelled). */
    public function revisionInvoice(): HasOne
    {
        return $this->hasOne(Invoice::class)->ofMany(['id' => 'max'], function ($q) {
            $q->where('status', '!=', 'cancelled')->where(self::answersReady() ? 'team_purpose' : 'id', self::answersReady() ? 'revision' : 0);
        });
    }

    private static ?bool $answersReady = null;

    /**
     * Whether the 2026_10_21_700000 migration ran (extra revisions, refund marks): until it does, those features are
     * off and everything else works as before.
     */
    public static function answersReady(): bool
    {
        if (self::$answersReady === null) {
            try {
                self::$answersReady = Schema::hasColumn('team_requests', 'refund_status') && Schema::hasColumn('invoices', 'team_purpose');
            } catch (\Throwable) {
                self::$answersReady = false;
            }
        }

        return self::$answersReady;
    }

    /**
     * Work has not started: unpaid, received or assigned (the designer has not set it in progress or sent a draft).
     * The customer may cancel, an included request is given back, and a paid one is refunded in full.
     */
    public function notStarted(): bool
    {
        return in_array($this->status, ['awaiting_payment', 'received', 'assigned'], true) && $this->latestVersion() === 0;
    }

    /** The revisions the customer has in all: the plan's (or an admin's number) plus extra rounds. */
    public function revisionsLeft(): int
    {
        return max(0, (int) $this->revisions_allowed - (int) $this->revisions_used);
    }

    public function label(): string
    {
        return self::STATUSES[$this->status][0] ?? ucfirst(str_replace('_', ' ', (string) $this->status));
    }

    public function isOpen(): bool
    {
        return in_array($this->status, self::OPEN, true);
    }

    /** The newest delivery version the customer can see (0 = none yet). */
    public function latestVersion(): int
    {
        return (int) $this->files()->whereIn('kind', TeamFile::DELIVERY_KINDS)->where('visibility', 'customer')->max('version');
    }

    /** The requests a staff member may see: all for admins and designers with designer_all, else their own. */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        if (! $user->is_admin && ! $user->designer_all) {
            $query->where('designer_id', $user->id);
        }
    }

    /** Adds a history entry or a message. */
    public function log(string $kind, array $fields = []): TeamMessage
    {
        return $this->messages()->create($fields + ['kind' => $kind, 'role' => 'system', 'visibility' => 'customer']);
    }
}
