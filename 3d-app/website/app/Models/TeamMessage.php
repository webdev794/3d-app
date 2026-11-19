<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A message in a design request's conversation, or an entry in its history (any kind but "message"). */
class TeamMessage extends Model
{
    public const KINDS = ['message', 'submitted', 'status', 'assign', 'delivery', 'revision', 'approval', 'payment', 'note'];

    protected $fillable = ['user_id', 'kind', 'role', 'visibility', 'body', 'from_status', 'to_status', 'data'];

    protected function casts(): array
    {
        return ['data' => 'array'];
    }

    public function request(): BelongsTo
    {
        return $this->belongsTo(TeamRequest::class, 'team_request_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(TeamFile::class)->orderBy('id');
    }
}
