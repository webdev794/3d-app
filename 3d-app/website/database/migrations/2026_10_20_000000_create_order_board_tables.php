<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 3DEEZI Orders: the order form and uploaded orders (drafts, files), the stage board with its sub-status, design
 * proofs and approval, delivery tracking, staff assignment, and the activity history behind the customer's updates.
 * The five board stages are the existing statuses (pending, confirmed, in_production, shipped, delivered), so existing
 * orders keep their place; each gets a history that starts when it was placed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            // studio (Order this kit), form (the order form), upload (an uploaded order form) or admin (added by staff).
            $table->string('source', 10)->default('studio');
            $table->string('team_name', 120)->nullable();
            $table->string('contact_email', 190)->nullable();
            // Order form rows: [{garment, sport, fit, label, project_id, sizes: {M: 4}, players: [...]}].
            $table->json('items')->nullable();
            // The date the customer needs the order by.
            $table->date('needed_by')->nullable();
            // Design approval: waiting, review (proof sent, approval needed), approved or changes (requested).
            $table->string('approval', 10)->nullable();
            // The sub-status within the stage, e.g. sewing in production; null is the stage's default.
            $table->string('step', 30)->nullable();
            $table->string('carrier', 80)->nullable();
            $table->string('tracking_number', 80)->nullable();
            $table->string('tracking_url', 500)->nullable();
            // Staff only: who looks after the order and when it is due.
            $table->unsignedBigInteger('assigned_to')->nullable();
            $table->date('due_date')->nullable();
            // Sent by the website with a submission, so a double click or a retry never makes a second order.
            $table->string('idempotency_key', 80)->nullable();
            // When the order entered its current stage: the board shows the newest arrival first.
            $table->timestamp('status_changed_at')->nullable();
            $table->unique(['user_id', 'idempotency_key']);
        });

        Schema::create('order_drafts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // form (Create Order Form) or upload (Upload Your Order).
            $table->string('kind', 10);
            $table->string('title', 120)->nullable();
            // The form's fields as the page saved them; checked in full only when submitted.
            $table->json('data');
            $table->timestamps();
        });

        Schema::create('order_files', function (Blueprint $table) {
            $table->id();
            // Who uploaded it (the customer, or a staff member for proofs and the like).
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            // A file belongs to a draft until the draft is submitted, then to the order.
            $table->foreignId('order_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('order_draft_id')->nullable()->constrained()->nullOnDelete();
            // order_form, artwork, proof, photo, invoice or other.
            $table->string('kind', 12);
            // customer (the customer sees it) or internal (staff only).
            $table->string('visibility', 10)->default('customer');
            $table->string('name', 160);
            $table->string('extension', 10);
            $table->string('path');
            $table->string('mime_type', 120);
            $table->unsignedBigInteger('size');
            // A small JPEG preview (data URL) of a picture.
            $table->mediumText('thumb')->nullable();
            // Design proofs are versioned (1, 2, ...); the customer approves one version or asks for changes to it.
            $table->unsignedInteger('version')->nullable();
            $table->string('review_status', 12)->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_note')->nullable();
            // E.g. the rows read from an uploaded order form, suggested to the customer to check.
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->index(['order_id', 'kind']);
        });

        Schema::create('order_updates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            // Who did it: the customer, a staff member, or nobody (the website).
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            // submitted, stage, step, approval, proof, tracking, note, file or edit.
            $table->string('kind', 12);
            // customer (shown to the customer) or internal (staff only).
            $table->string('visibility', 10)->default('customer');
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20)->nullable();
            $table->string('step', 30)->nullable();
            $table->string('approval', 10)->nullable();
            $table->text('message')->nullable();
            $table->foreignId('order_file_id')->nullable()->constrained('order_files')->nullOnDelete();
            // Anything else worth keeping, e.g. the fields an edit changed or a proof's version.
            $table->json('data')->nullable();
            $table->timestamps();
            $table->index(['order_id', 'created_at']);
        });

        if (! Schema::hasTable('notifications')) {
            Schema::create('notifications', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('type');
                $table->morphs('notifiable');
                $table->text('data');
                $table->timestamp('read_at')->nullable();
                $table->timestamps();
            });
        }

        // Existing orders: an ordered kit was confirmed as final by the customer; one without a kit was added by staff.
        DB::table('orders')->whereNotNull('project_id')->update(['source' => 'studio', 'approval' => 'approved']);
        DB::table('orders')->whereNull('project_id')->update(['source' => 'admin']);
        DB::table('orders')->update(['status_changed_at' => DB::raw('updated_at')]);
        // Their history starts when they were placed, then the stage they are in now.
        foreach (DB::table('orders')->orderBy('id')->get(['id', 'status', 'created_at', 'updated_at']) as $order) {
            $row = ['order_id' => $order->id, 'user_id' => null, 'visibility' => 'customer', 'from_status' => null, 'step' => null, 'approval' => null, 'message' => null, 'order_file_id' => null, 'data' => null];
            DB::table('order_updates')->insert($row + ['kind' => 'submitted', 'to_status' => 'pending', 'created_at' => $order->created_at, 'updated_at' => $order->created_at]);
            if ($order->status !== 'pending') {
                DB::table('order_updates')->insert($row + ['kind' => 'stage', 'to_status' => $order->status, 'created_at' => $order->updated_at, 'updated_at' => $order->updated_at]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('order_updates');
        Schema::dropIfExists('order_files');
        Schema::dropIfExists('order_drafts');
        Schema::table('orders', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'idempotency_key']);
            $table->dropColumn(['source', 'team_name', 'contact_email', 'items', 'needed_by', 'approval', 'step', 'carrier', 'tracking_number', 'tracking_url', 'assigned_to', 'due_date', 'idempotency_key', 'status_changed_at']);
        });
        // The notifications table is left: other features may use it.
    }
};
