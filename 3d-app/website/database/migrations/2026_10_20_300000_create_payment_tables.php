<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Prices, invoices and online payments: the admin's price list (garments, extras, shipping, discounts), invoices with
 * the order and prices as agreed, payment attempts (Stripe, test or recorded by staff), and the provider events
 * already handled (so a repeated webhook changes nothing).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('price_rules', function (Blueprint $table) {
            $table->id();
            // garment (a garment's price), extra (e.g. names and numbers printing), shipping (a destination) or discount.
            $table->string('kind', 10);
            // garment: the garment id (jersey); extra: its code; shipping: the destination code (AU);
            // discount: the code customers type, or null for an automatic quantity discount.
            $table->string('code', 40)->nullable();
            // garment only: the price for one sport (rugby-league); null = every sport.
            $table->string('sport', 40)->nullable();
            $table->string('name', 120);
            // Cents. garment: the unit price; extra: the price per unit; shipping: per order; discount: an amount off.
            $table->unsignedInteger('amount_cents')->default(0);
            // shipping only: added per garment, in cents.
            $table->unsignedInteger('per_item_cents')->default(0);
            // discount only: percent off (e.g. 10.00); null when it is an amount off.
            $table->decimal('percent', 5, 2)->nullable();
            // extra only: what it is charged per: garment, player (a printed name or number) or order.
            $table->string('unit', 10)->nullable();
            // extra only: added by itself when it applies (true) or chosen by the customer (false).
            $table->boolean('auto')->default(false);
            // discount only: the fewest garments it needs.
            $table->unsignedInteger('min_quantity')->nullable();
            // shipping only: GST (tax) applies to orders sent there.
            $table->boolean('taxable')->default(true);
            $table->boolean('active')->default(true);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
            $table->index(['kind', 'code']);
        });

        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            // INV-1001, INV-1002, ...: given when the invoice is issued (none while a quote is required).
            $table->unsignedInteger('sequence')->nullable()->unique();
            $table->string('number', 30)->nullable()->unique();
            // Kept when the order or the account is deleted: invoices are records.
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            // quote_required, awaiting_payment, part_paid, paid, refunded or cancelled.
            $table->string('status', 20)->default('quote_required')->index();
            $table->string('currency', 3)->default('AUD');
            $table->unsignedBigInteger('subtotal_cents')->nullable();
            $table->unsignedBigInteger('tax_cents')->nullable();
            $table->unsignedBigInteger('total_cents')->nullable();
            $table->unsignedBigInteger('paid_cents')->default(0);
            $table->unsignedBigInteger('refunded_cents')->default(0);
            // The priced order (lines, extras, shipping, discounts, tax): as agreed once issued, never recalculated.
            $table->json('quote')->nullable();
            // The order, the customer and the seller as they were when it was issued.
            $table->json('snapshot')->nullable();
            // Why a quote is required: [{code, message}].
            $table->json('reasons')->nullable();
            // Staff notes printed on the invoice.
            $table->text('notes')->nullable();
            // The latest payment attempt, for order cards: {status, message, at}.
            $table->json('last_attempt')->nullable();
            $table->timestamp('issued_at')->nullable();
            $table->date('due_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('refunded_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('emailed_at')->nullable();
            $table->timestamps();
            $table->index(['order_id', 'id']);
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            // stripe, test (test mode) or manual (recorded by staff, e.g. a bank transfer).
            $table->string('provider', 10);
            // Stripe's PaymentIntent id (pi_...) or the test payment's id.
            $table->string('provider_id', 120)->nullable()->unique();
            // full, deposit or balance.
            $table->string('kind', 10)->default('full');
            // card, wallet, bank_transfer, cash or other.
            $table->string('method', 20)->nullable();
            $table->unsignedBigInteger('amount_cents');
            $table->string('currency', 3);
            // pending, processing, succeeded, failed, cancelled or refunded.
            $table->string('status', 12)->default('pending')->index();
            // Stripe's client secret for the browser (encrypted).
            $table->text('client_secret')->nullable();
            $table->string('message', 500)->nullable();
            // Staff: the bank transfer's reference and the like.
            $table->string('reference', 120)->nullable();
            // e.g. {brand: visa, last4: 4242}.
            $table->json('details')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });

        Schema::create('payment_events', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 10);
            $table->string('event_id', 120);
            $table->string('type', 80);
            $table->foreignId('payment_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->unique(['provider', 'event_id']);
        });

        // The customer's pricing choices sent with an order: {destination, extras: [...], discount_code}.
        if (! Schema::hasColumn('orders', 'pricing')) {
            Schema::table('orders', fn (Blueprint $table) => $table->json('pricing')->nullable());
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_events');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('invoices');
        Schema::dropIfExists('price_rules');
        if (Schema::hasColumn('orders', 'pricing')) {
            Schema::table('orders', fn (Blueprint $table) => $table->dropColumn('pricing'));
        }
    }
};
