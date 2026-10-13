<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    protected $fillable = ['name', 'sport', 'garment', 'mode', 'status', 'design', 'thumbnail', 'version'];

    protected $hidden = ['user_id'];

    protected function casts(): array
    {
        return ['design' => 'array', 'version' => 'integer'];
    }

    public function versions(): HasMany
    {
        return $this->hasMany(ProjectVersion::class);
    }

    public function user(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function snapshot(): void
    {
        $this->versions()->create([
            'name' => $this->name,
            'design' => $this->design,
            'version' => $this->version,
        ]);
    }
}
