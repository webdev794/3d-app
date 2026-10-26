<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Preferred suppliers (task 9.118): who makes an order. 3DEEZI (the default) and Mantis are the owner's own entries;
 * other companies apply with "Become a preferred supplier", pay a monthly or yearly listing, and are approved by an
 * admin. Each order keeps who makes it (supplier_id) and that name as it was (made_by).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('suppliers')) {
            Schema::create('suppliers', function (Blueprint $table) {
                $table->id();
                // The account that applied (an outside supplier); none for the owner's own entries.
                $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
                // The owner's built-in entries: 3deezi (the default maker) and mantis.
                $table->string('slug', 40)->nullable()->unique();
                $table->boolean('owner')->default(false);
                $table->string('name', 160);
                $table->string('contact_name', 120)->nullable();
                $table->string('email', 190)->nullable();
                $table->string('phone', 40)->nullable();
                $table->string('website', 255)->nullable();
                $table->string('summary', 300)->nullable();
                $table->string('makes', 300)->nullable();
                $table->string('location', 160)->nullable();
                $table->text('message')->nullable();
                $table->string('logo', 255)->nullable();
                // applied, approved (on the page and in the order form) or hidden.
                $table->string('status', 20)->default('applied')->index();
                // The listing: monthly or yearly, paid until this date.
                $table->string('plan', 10)->nullable();
                $table->date('paid_until')->nullable();
                $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
                $table->unsignedBigInteger('paid_invoice_id')->nullable();
                $table->unsignedInteger('sort')->default(100);
                $table->timestamp('approved_at')->nullable();
                $table->timestamps();
            });
            $now = now();
            DB::table('suppliers')->insert([
                ['slug' => '3deezi', 'owner' => true, 'name' => '3DEEZI', 'summary' => 'Designed and made by 3DEEZI.', 'makes' => 'Custom sportswear and teamwear',
                    'status' => 'approved', 'sort' => 0, 'approved_at' => $now, 'created_at' => $now, 'updated_at' => $now],
                ['slug' => 'mantis', 'owner' => true, 'name' => 'Mantis', 'summary' => 'The company behind 3DEEZI.', 'makes' => 'Custom sportswear and teamwear',
                    'status' => 'approved', 'sort' => 1, 'approved_at' => $now, 'created_at' => $now, 'updated_at' => $now],
            ]);
        }
        if (! Schema::hasColumn('orders', 'made_by')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
                // The maker's name as it was when chosen (kept if the supplier is renamed or removed).
                $table->string('made_by', 160)->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('orders', 'made_by')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->dropConstrainedForeignId('supplier_id');
                $table->dropColumn('made_by');
            });
        }
        Schema::dropIfExists('suppliers');
    }
};
