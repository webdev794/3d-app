<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;

/**
 * An editable Artboard design kept in the account (File > Save to my account), or one of the user's templates to
 * start new designs from (File > Save as template). `document` is the Artboard's own JSON text: every page with its
 * objects and guidelines. Artwork sent to the 3D Studio remembers the design's id, so the Studio can open it again.
 */
class ArtboardDocument extends Model
{
    /** Designs and templates one account keeps. */
    public const MAX_PER_USER = 300;

    /** The largest design: its JSON text, pictures included (20 MB). */
    public const MAX_DOCUMENT = 20 * 1024 * 1024;

    /** What the lists show: everything but the design itself. */
    public const SUMMARY = ['id', 'name', 'template', 'preview', 'pages', 'size', 'version', 'created_at', 'updated_at'];

    protected $fillable = ['name', 'template', 'document', 'preview', 'pages', 'size'];

    protected $hidden = ['user_id'];

    protected function casts(): array
    {
        return ['template' => 'boolean', 'pages' => 'integer', 'size' => 'integer', 'version' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Shared hosting has no shell for `php artisan migrate`, so an uploaded update creates its table on first use. */
    public static function ensureTable(): void
    {
        static $checked = false;
        if (! $checked && ! Schema::hasTable('artboard_documents')) {
            Artisan::call('migrate', ['--force' => true]);
        }
        $checked = true;
    }
}
