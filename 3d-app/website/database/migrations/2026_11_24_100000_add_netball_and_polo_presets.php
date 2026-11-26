<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The netball and polo presets (client 24 Nov 2026, PRESETS2): Netball 01-18 (the client's netball preset collections
 * 01 and 02 and the side panel collection) on the netball dress, and Polo 01-06 (polo preset collection 01) on the
 * polo, each a design picture (front and back, public/media/presets/drawings/<id>.jpg) as the Rugby League presets.
 * The netball ones show on Netball (sport) on the dress; the polo ones on every sport's polo (no sport, garment polo).
 * The rows come from public/media/presets.json (ids netball-NN and polo-NN); a row already there gets the file's design
 * and description (its name, order and hidden flag stay as an admin may have set them).
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
            if (empty($p['id']) || empty($p['design']) || ! preg_match('/^(netball|polo)-\d\d$/', (string) $p['id'])) {
                continue;
            }
            $row = DB::table('presets')->whereNull('user_id')->where('slug', $p['id']);
            if ($row->exists()) {
                $row->update(['design' => json_encode($p['design']), 'description' => $p['description'] ?? null, 'updated_at' => $now]);
                continue;
            }
            DB::table('presets')->insertOrIgnore([
                'slug' => $p['id'], 'user_id' => null, 'name' => $p['name'] ?? $p['id'], 'description' => $p['description'] ?? null,
                'sport' => $p['sport'] ?? null, 'garment' => $p['design']['garment'] ?? null,
                'design' => json_encode($p['design']), 'thumbnail' => 'presets/'.$p['id'].'.webp',
                'hidden' => false, 'sort' => ++$sort, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('presets')) {
            DB::table('presets')->whereNull('user_id')->where(fn ($q) => $q->where('slug', 'like', 'netball-%')->orWhere('slug', 'like', 'polo-%'))->delete();
        }
    }
};
