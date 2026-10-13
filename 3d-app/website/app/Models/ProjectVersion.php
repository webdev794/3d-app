<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectVersion extends Model
{
    protected $fillable = ['name', 'design', 'version'];

    protected $hidden = ['project_id', 'updated_at'];

    protected function casts(): array
    {
        return ['design' => 'array', 'version' => 'integer'];
    }
}
