<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * An order the Order Assistant collated (task TL-3): the chat, the files, the reading (App\Services\OrderAnalysis) and
 * the maker whose branding the PDF carries (3DEEZI when none). Opened by its token: the share link.
 */
class OrderAssist extends Model
{
    public const DIR = 'order-assists';

    protected $fillable = ['title', 'messages', 'files', 'analysis', 'supplier_id', 'user_id'];

    protected $hidden = ['user_id', 'id'];

    protected function casts(): array
    {
        return ['messages' => 'array', 'files' => 'array', 'analysis' => 'array'];
    }

    protected static function booted(): void
    {
        static::creating(function (self $assist) {
            $assist->token ??= Str::random(40);
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function getRouteKeyName(): string
    {
        return 'token';
    }

    /** The maker named on the PDF and pages: the chosen supplier, else 3DEEZI. */
    public function brandName(): string
    {
        return $this->supplier?->name ?: '3DEEZI';
    }
}
