<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * AI Designer uploads of design files (client 2026-11-02, picture 295.jpg): a PDF, SVG, AI, EPS, PSD or TIFF is kept
 * as it was (an asset of type "design"); the picture the AI reads from it (a "reference") points to it here.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('assets', 'source_id')) {
            return;
        }
        Schema::table('assets', function (Blueprint $table) {
            $table->unsignedBigInteger('source_id')->nullable()->index();
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('assets', 'source_id')) {
            return;
        }
        Schema::table('assets', function (Blueprint $table) {
            $table->dropIndex(['source_id']);
            $table->dropColumn('source_id');
        });
    }
};
