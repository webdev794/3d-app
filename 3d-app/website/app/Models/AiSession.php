<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

/** One AI Designer brief and its four designs (Recent designs on /create/ai and the app's AI Designer). */
class AiSession extends Model
{
    protected $fillable = ['prompt', 'sport', 'garment', 'source', 'reference_ids', 'options'];

    protected $hidden = ['user_id'];

    protected function casts(): array
    {
        return ['options' => 'array', 'reference_ids' => 'array'];
    }

    public function user(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    protected static function booted(): void
    {
        // The pictures go with the row.
        static::deleting(function (AiSession $session) {
            foreach ($session->options ?? [] as $o) {
                Storage::disk('local')->delete(array_filter([$o['file'] ?? null, $o['thumb'] ?? null]));
            }
        });
    }
}
