<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Schema;

/** A message sent with the contact form on the Support page (/support). */
class SupportMessage extends Model
{
    public const STATUSES = ['new', 'answered', 'closed'];

    protected $fillable = ['user_id', 'name', 'email', 'order_reference', 'message', 'status'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** False until the update's migration has run (`php artisan migrate --force`); the form and the list say so. */
    public static function ready(): bool
    {
        return Schema::hasTable('support_messages');
    }
}
