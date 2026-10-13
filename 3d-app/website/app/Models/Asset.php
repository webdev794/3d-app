<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Asset extends Model
{
    protected $fillable = ['name', 'type', 'path', 'mime_type', 'size'];

    protected $hidden = ['user_id', 'path', 'updated_at'];

    protected $appends = ['url'];

    protected function casts(): array
    {
        return ['size' => 'integer'];
    }

    public function getUrlAttribute(): string
    {
        return route('assets.file', ['asset' => $this->id]);
    }
}
