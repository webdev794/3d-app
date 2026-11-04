<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Asset extends Model
{
    protected $fillable = ['name', 'type', 'path', 'mime_type', 'size', 'source_id'];

    protected $hidden = ['user_id', 'path', 'updated_at'];

    protected $appends = ['url'];

    protected function casts(): array
    {
        return ['size' => 'integer'];
    }

    /** Whether this database has assets.source_id yet (the migration of 2026-11-02; live runs it later). */
    public static function keepsSources(): bool
    {
        static $has = null;

        return $has ??= \Illuminate\Support\Facades\Schema::hasColumn('assets', 'source_id');
    }

    public function getUrlAttribute(): string
    {
        return route('assets.file', ['asset' => $this->id]);
    }
}
