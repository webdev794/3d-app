<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 3DEEZI TEAM, the human designer service (team-api.md): a customer's design request (TEAM-1001...) with its brief,
 * logos and references, the designer it is assigned to, its conversation and status history, the designer's
 * versioned deliveries, the final design, and how it was paid for (a monthly allowance, or an invoice).
 * Customers' plans and allowances (team_allowances) are set by admins until subscriptions go live; users get the
 * designer role.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // A 3DEEZI designer: sees the requests assigned to them (all requests with designer_all).
            $table->boolean('is_designer')->default(false);
            $table->boolean('designer_all')->default(false);
        });

        Schema::create('team_requests', function (Blueprint $table) {
            $table->id();
            // TEAM-1001, TEAM-1002, ...
            $table->unsignedInteger('sequence')->unique();
            $table->string('number', 20)->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('designer_id')->nullable()->constrained('users')->nullOnDelete();
            // awaiting_payment, received, assigned, in_progress, review, revision, approved or closed.
            $table->string('status', 20)->default('received')->index();
            $table->string('name', 120);
            $table->string('email', 190);
            $table->string('sport', 60);
            $table->string('garment', 60);
            $table->string('category', 60)->nullable();
            $table->text('description');
            $table->json('colours')->nullable();
            $table->text('instructions')->nullable();
            // included (the monthly allowance or a bonus), paid (an invoice) or free (no charge, or unlimited).
            $table->string('billing', 10)->default('included');
            // The plan and the month it counted in (YYYY-MM).
            $table->string('plan', 20)->default('free');
            $table->string('period', 7);
            $table->unsignedInteger('price_cents')->default(0);
            // A bonus request was used (given back if it is closed before anyone worked on it).
            $table->boolean('used_bonus')->default(false);
            $table->unsignedInteger('revisions_used')->default(0);
            $table->unsignedInteger('revisions_allowed')->default(2);
            $table->string('priority', 10)->default('normal');
            $table->date('due_date')->nullable();
            // The version the customer approved, and the copies saved in their assets.
            $table->unsignedInteger('final_version')->nullable();
            $table->json('final_asset_ids')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamp('status_changed_at')->nullable();
            // When the customer last read the conversation (for "unread").
            $table->timestamp('customer_read_at')->nullable();
            $table->timestamp('staff_read_at')->nullable();
            $table->string('idempotency_key', 80)->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'idempotency_key']);
            $table->index(['user_id', 'period']);
        });

        Schema::create('team_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('team_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            // message (the conversation), or the history: submitted, status, assign, delivery, revision, approval, payment, note.
            $table->string('kind', 12)->default('message');
            // customer, designer, admin or system: who wrote it, as shown.
            $table->string('role', 10)->default('system');
            // customer (shown to the customer) or internal (staff only).
            $table->string('visibility', 10)->default('customer');
            $table->text('body')->nullable();
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20)->nullable();
            $table->json('data')->nullable();
            $table->timestamps();
            $table->index(['team_request_id', 'created_at']);
        });

        Schema::create('team_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('team_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('team_message_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            // logo, reference, artwork, mockup, attachment (with a message) or working (staff files).
            $table->string('kind', 12);
            $table->string('visibility', 10)->default('customer');
            $table->string('name', 160);
            $table->string('extension', 10);
            $table->string('path');
            $table->string('mime_type', 120);
            $table->unsignedBigInteger('size');
            $table->mediumText('thumb')->nullable();
            // Deliveries (artwork, mockup) are versioned 1, 2, ...
            $table->unsignedInteger('version')->nullable();
            $table->timestamps();
            $table->index(['team_request_id', 'kind']);
        });

        // A customer's 3DEEZI TEAM plan and allowance, set by admins (until subscriptions set the plan).
        Schema::create('team_allowances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('plan', 20)->default('free');
            // Replaces the plan's included requests a month (null = the plan's).
            $table->unsignedInteger('monthly_included')->nullable();
            // One-off extra requests, used after the month's included ones and before paying.
            $table->unsignedInteger('bonus_requests')->default(0);
            // Only an admin turns this on; who did it is kept.
            $table->boolean('unlimited')->default(false);
            $table->foreignId('unlimited_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note', 500)->nullable();
            $table->timestamps();
        });

        // A paid design request's invoice (the existing invoices: INV-..., no order).
        Schema::table('invoices', function (Blueprint $table) {
            $table->foreignId('team_request_id')->nullable()->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropConstrainedForeignId('team_request_id');
        });
        Schema::dropIfExists('team_allowances');
        Schema::dropIfExists('team_files');
        Schema::dropIfExists('team_messages');
        Schema::dropIfExists('team_requests');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['is_designer', 'designer_all']);
        });
    }
};
