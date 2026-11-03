<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The order confirmation (client 2026-11-03, images/336 and 338): each order keeps a version number (1 when sent,
 * up by one each time 3DEEZI or the customer changes its garments or sizes) and its approval record: who approved
 * the mockups, sizes and garment details on the confirmation, and when.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedInteger('version')->default(1);
            $table->string('approved_by', 160)->nullable();
            $table->timestamp('approved_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['version', 'approved_by', 'approved_at']);
        });
    }
};
