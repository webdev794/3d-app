<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

/**
 * A preset design (task 9.148): a 3DEEZI preset (user_id null, everyone sees it unless hidden) or a customer's
 * private "My preset" (only that user sees it). Before the table exists, public/media/presets.json is the list.
 */
class Preset extends Model
{
    protected $fillable = ['slug', 'user_id', 'name', 'description', 'sport', 'garment', 'design', 'thumbnail', 'hidden', 'sort'];

    protected function casts(): array
    {
        return ['design' => 'array', 'hidden' => 'boolean', 'sort' => 'integer', 'user_id' => 'integer'];
    }

    public static function ready(): bool
    {
        try {
            return Schema::hasTable('presets');
        } catch (Throwable) {
            return false;
        }
    }

    /** The old file list (the fallback while the table is missing or holds no 3DEEZI presets). */
    public static function fileList(): array
    {
        $file = public_path('media/presets.json');
        $list = is_file($file) ? (json_decode((string) file_get_contents($file), true) ?: []) : [];

        return array_map(fn ($p) => $p + [
            'team' => true, 'mine' => false, 'thumbnail' => url('/media/presets/'.$p['id'].'.webp'),
            'sport' => null, 'garment' => $p['design']['garment'] ?? null,
        ], $list);
    }

    public static function newSlug(bool $team): string
    {
        return ($team ? 'team-' : 'my-').Str::lower(Str::random(12));
    }

    public function thumbUrl(): ?string
    {
        $t = (string) $this->thumbnail;
        if ($t === '') {
            return null;
        }

        return str_starts_with($t, 'data:') || preg_match('#^https?://#', $t) ? $t : url('/media/'.ltrim($t, '/'));
    }

    /** For the Studio's panel and the app: the old file's keys, plus key (the row id), team/mine, thumbnail, sport, garment. */
    public function present(): array
    {
        return [
            'id' => $this->slug,
            'key' => $this->id,
            'name' => $this->name,
            'description' => (string) $this->description,
            'sport' => $this->sport,
            'garment' => $this->garment,
            'design' => $this->design,
            'thumbnail' => $this->thumbUrl(),
            'team' => $this->user_id === null,
            'mine' => $this->user_id !== null,
        ];
    }

    public function forAdmin(): array
    {
        return $this->present() + ['hidden' => (bool) $this->getAttribute('hidden'), 'sort' => $this->sort, 'updated_at' => $this->updated_at?->toIso8601String()];
    }
}
