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

    /** Shared hosting has no shell for `php artisan migrate`, so an uploaded update creates its table on first use. */
    public static function ensureTable(): void
    {
        static $checked = false;
        if (! $checked && ! \Illuminate\Support\Facades\Schema::hasTable('ai_sessions')) {
            \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
        }
        $checked = true;
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
