<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Presets (task 9.148): 3DEEZI team presets everyone sees (user_id null) and a customer's private "My presets"
 * (user_id set). The old public/media/presets.json entries become the starting 3DEEZI presets.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('presets')) {
            Schema::create('presets', function (Blueprint $table) {
                $table->id();
                $table->string('slug', 80)->unique();
                // Null: a 3DEEZI preset; set: that customer's own preset.
                $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
                $table->string('name', 120);
                $table->string('description', 300)->nullable();
                $table->string('sport', 40)->nullable();
                $table->string('garment', 40)->nullable();
                $table->json('design');
                // A data URL, or a media path ("presets/x.webp") for the starting presets.
                $table->longText('thumbnail')->nullable();
                $table->boolean('hidden')->default(false);
                $table->integer('sort')->default(0);
                $table->timestamps();
                $table->index(['user_id', 'sort']);
            });
        }
        if (DB::table('presets')->whereNull('user_id')->exists()) {
            return;
        }
        $file = public_path('media/presets.json');
        $list = is_file($file) ? (json_decode((string) file_get_contents($file), true) ?: []) : [];
        $now = now();
        foreach (array_values($list) as $i => $p) {
            if (empty($p['id']) || empty($p['design'])) {
                continue;
            }
            DB::table('presets')->insertOrIgnore([
                'slug' => $p['id'], 'user_id' => null, 'name' => $p['name'] ?? $p['id'], 'description' => $p['description'] ?? null,
                'sport' => $p['sport'] ?? null, 'garment' => $p['design']['garment'] ?? null,
                'design' => json_encode($p['design']), 'thumbnail' => 'presets/'.$p['id'].'.webp',
                'hidden' => false, 'sort' => $i, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('presets');
    }
};
