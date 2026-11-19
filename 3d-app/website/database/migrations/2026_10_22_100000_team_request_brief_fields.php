<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 3DEEZI TEAM, the client's new /team form (2026-10-22): "Garments needed" (several garments; `garment` stays the
 * first one, for the Studio and order paths) and an optional "Preferred delivery date". Until this runs, both are
 * written into the request's instructions instead (TeamRequest::briefReady()).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('team_requests', function (Blueprint $table) {
            // Catalogue garment ids or free text, in the customer's order (the first is also in `garment`).
            $table->json('garments')->nullable();
            // The customer's target date for the finished kit (not the designer's due date).
            $table->date('preferred_date')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('team_requests', function (Blueprint $table) {
            $table->dropColumn(['garments', 'preferred_date']);
        });
    }
};
