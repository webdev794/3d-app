<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The Rugby League presets (client 19 Nov 2026, PRESETRL): the twelve designs of the client's Rugby League design
 * collections 02 and 03, each a design picture (front and back, public/media/presets/drawings/<id>.jpg) put on the
 * Rugby League jersey. Shown only on Rugby League (sport), on the jersey and the kit (garment). The rows come from
 * public/media/presets.json (the entries with sport rugby-league); ones already there are left as they are.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('presets')) {
            return;
        }
        $file = public_path('media/presets.json');
        $list = is_file($file) ? (json_decode((string) file_get_contents($file), true) ?: []) : [];
        $sort = (int) DB::table('presets')->whereNull('user_id')->max('sort');
        $now = now();
        foreach ($list as $p) {
            if (($p['sport'] ?? null) !== 'rugby-league' || empty($p['id']) || empty($p['design'])) {
                continue;
            }
            DB::table('presets')->insertOrIgnore([
                'slug' => $p['id'], 'user_id' => null, 'name' => $p['name'] ?? $p['id'], 'description' => $p['description'] ?? null,
                'sport' => 'rugby-league', 'garment' => $p['design']['garment'] ?? 'jersey',
                'design' => json_encode($p['design']), 'thumbnail' => 'presets/'.$p['id'].'.webp',
                'hidden' => false, 'sort' => ++$sort, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('presets')) {
            DB::table('presets')->whereNull('user_id')->where('slug', 'like', 'rl-c0%')->delete();
        }
    }
};
