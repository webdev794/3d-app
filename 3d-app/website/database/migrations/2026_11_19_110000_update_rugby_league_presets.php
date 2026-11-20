<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The Rugby League presets (PRESETRL 19 Nov 2026), second step: their design pictures re-made (front and back apart on
 * a plain background) and each one's front / back roles as the Studio's own design-picture check reads them. The 3DEEZI
 * rows rl-c02-01..rl-c03-06 get the design (and description) of public/media/presets.json; their name, order, hidden
 * flag and sport stay as an admin may have set them. Rows not there yet are added as the first step does.
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
            $row = DB::table('presets')->whereNull('user_id')->where('slug', $p['id']);
            if ($row->exists()) {
                $row->update(['design' => json_encode($p['design']), 'description' => $p['description'] ?? null, 'updated_at' => $now]);
            } else {
                DB::table('presets')->insertOrIgnore([
                    'slug' => $p['id'], 'user_id' => null, 'name' => $p['name'] ?? $p['id'], 'description' => $p['description'] ?? null,
                    'sport' => 'rugby-league', 'garment' => $p['design']['garment'] ?? 'jersey',
                    'design' => json_encode($p['design']), 'thumbnail' => 'presets/'.$p['id'].'.webp',
                    'hidden' => false, 'sort' => ++$sort, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        // (The first step's down removes the rows.)
    }
};
