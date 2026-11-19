<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A customer's 3DEEZI TEAM plan and allowance, set by admins (subscriptions will set the plan when they go live). */
class TeamAllowance extends Model
{
    protected $fillable = ['user_id', 'plan', 'monthly_included', 'bonus_requests', 'unlimited', 'unlimited_by', 'note'];

    protected function casts(): array
    {
        return ['monthly_included' => 'integer', 'bonus_requests' => 'integer', 'unlimited' => 'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
