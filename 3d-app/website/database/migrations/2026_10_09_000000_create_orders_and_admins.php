<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_admin')->default(false)->after('password');
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('number', 20)->nullable()->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 20)->default('pending')->index();
            // Quantity per size, e.g. {"S": 4, "M": 10}.
            $table->json('sizes');
            $table->unsignedInteger('quantity')->default(0);
            $table->decimal('unit_price', 10, 2)->nullable();
            $table->decimal('total', 12, 2)->nullable();
            $table->string('currency', 3)->default('AUD');
            $table->string('contact_name', 120);
            $table->string('phone', 40)->nullable();
            $table->text('shipping_address')->nullable();
            $table->text('notes')->nullable();
            $table->text('admin_notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('is_admin'));
    }
};
