<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Recent designs on the AI Designer page (client 2026-10-30, like ChatGPT keeps your chats): one row per brief, with the
 * four designs it gave (their pictures are files under storage/app/ai-sessions), so a session reopens with no new AI call.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('ai_sessions')) {
            return;
        }
        Schema::create('ai_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('prompt');
            $table->string('sport', 60)->nullable();
            $table->string('garment', 60)->nullable();
            // web or app: where the designs were made (the two keep their 3D kit specs in their own shapes).
            $table->string('source', 10)->default('web');
            $table->json('reference_ids')->nullable();
            // Up to four: name, description, quality, view, direction, design (web) or spec (app), file and thumb paths.
            $table->json('options');
            $table->timestamps();
            $table->index(['user_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_sessions');
    }
};
