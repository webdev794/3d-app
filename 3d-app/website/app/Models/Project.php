<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    protected $fillable = ['name', 'sport', 'garment', 'mode', 'status', 'design', 'thumbnail', 'version'];

    protected $hidden = ['user_id'];

    /**
     * Netball training tees saved before the netball tee had its own cut (viewer -234, look teeSidesNetball) carry only
     * the rugby tee's flag: give them the netball flag when they are read, so they open in the netball cut (FN13).
     */
    protected static function booted(): void
    {
        static::retrieved(function (Project $project) {
            $design = $project->design;
            if ($project->sport !== 'netball' || ! is_array($design) || ($design['garment'] ?? $project->garment) !== 'tee') {
                return;
            }
            $colours = is_array($design['zoneColors'] ?? null) ? $design['zoneColors'] : [];
            if (empty($colours['teeFlare']) || ! empty($colours['teeNetball'])) {
                return;
            }
            $colours['teeNetball'] = '#27282a';
            $design['zoneColors'] = $colours;
            $project->design = $design;
            $project->syncOriginalAttribute('design');
        });
    }

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
