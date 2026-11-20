<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The Order Assistant (task TL-3, client 2026-11-05): one row per order the assistant collated, kept by a secret token
 * (the share link), with the chat, the files (under storage/app/order-assists/{id}) and the reading (lines, groups,
 * totals, things to check, the order form's rows).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('order_assists')) {
            return;
        }
        Schema::create('order_assists', function (Blueprint $table) {
            $table->id();
            $table->string('token', 48)->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title', 120)->default('');
            $table->json('messages')->nullable();
            $table->json('files')->nullable();
            $table->longText('analysis')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_assists');
    }
};
