<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Editable Artboard designs kept in the account (File > Save to my account) and the user's own templates
        // (File > Save as template): the Artboard's JSON with every page, a name and a small picture for the lists.
        Schema::create('artboard_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->boolean('template')->default(false);
            $table->longText('document');
            $table->longText('preview')->nullable();
            $table->unsignedSmallInteger('pages')->default(1);
            $table->unsignedInteger('size')->default(0);
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->index(['user_id', 'template', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('artboard_documents');
    }
};
