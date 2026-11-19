<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Names and numbers on the back of an order's shirts, and the kit as it was ordered: a copy of the project's design
 * and its version, so later edits to the project don't change what was ordered.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            // same (one name and number on every shirt), list (one per player) or none.
            $table->string('names', 10)->nullable();
            // same: [{name, number}]; list: [{name, number, size}, ...], up to 300.
            $table->json('players')->nullable();
            // The project when it was ordered: {name, sport, garment, mode, design, thumbnail}.
            $table->json('design_snapshot')->nullable();
            $table->unsignedInteger('project_version')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('orders', fn (Blueprint $table) => $table->dropColumn(['names', 'players', 'design_snapshot', 'project_version']));
    }
};
