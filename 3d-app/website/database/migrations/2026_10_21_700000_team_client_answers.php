<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 3DEEZI TEAM, the client's answers (2026-10-21): extra revision rounds paid by invoice, the refund marks for a paid
 * request cancelled before work starts, and the confirmed plan values (prices incl. GST: Free A$99, Pro A$79,
 * Premium A$69, Business A$49; included 0/0/2/6; revisions 2/3/3/5; open at once 1/2/3/10). Saved plan values are
 * only changed where they still hold the old placeholders, so an admin's own values stay.
 */
return new class extends Migration
{
    /** The v1 placeholders and the confirmed values, per plan and field. */
    private const OLD = [
        'free' => ['price_cents' => 9900, 'included_per_month' => 0, 'revisions' => 2, 'max_open' => 2],
        'pro' => ['price_cents' => 6900, 'included_per_month' => 0, 'revisions' => 3, 'max_open' => 3],
        'premium' => ['price_cents' => 6900, 'included_per_month' => 2, 'revisions' => 3, 'max_open' => 5],
        'business' => ['price_cents' => 4900, 'included_per_month' => 6, 'revisions' => 5, 'max_open' => 10],
    ];

    private const NEW = [
        'free' => ['price_cents' => 9900, 'included_per_month' => 0, 'revisions' => 2, 'max_open' => 1],
        'pro' => ['price_cents' => 7900, 'included_per_month' => 0, 'revisions' => 3, 'max_open' => 2],
        'premium' => ['price_cents' => 6900, 'included_per_month' => 2, 'revisions' => 3, 'max_open' => 3],
        'business' => ['price_cents' => 4900, 'included_per_month' => 6, 'revisions' => 5, 'max_open' => 10],
    ];

    public function up(): void
    {
        Schema::table('team_requests', function (Blueprint $table) {
            // Extra revision rounds bought (or given free by an admin) on top of the plan's revisions.
            $table->unsignedInteger('extra_revisions')->default(0);
            // An extra revision waiting for its invoice to be paid: the customer's revision message.
            $table->foreignId('pending_revision_message_id')->nullable()->constrained('team_messages')->nullOnDelete();
            // A paid request cancelled before work started: "due" until an admin refunds it by hand and ticks "refunded".
            $table->string('refund_status', 10)->nullable();
            $table->timestamp('refunded_at')->nullable();
            $table->foreignId('refunded_by')->nullable()->constrained('users')->nullOnDelete();
        });
        Schema::table('invoices', function (Blueprint $table) {
            // A design request's invoices: the request itself, or an extra revision round.
            $table->string('team_purpose', 10)->nullable();
        });
        DB::table('invoices')->whereNotNull('team_request_id')->update(['team_purpose' => 'request']);
        $this->updatePlans();
    }

    /** The saved plan values that still hold the old placeholders get the client's values. */
    public function updatePlans(): void
    {
        $row = DB::table('settings')->where('key', 'team_plans')->first();
        if ($row) {
            $saved = json_decode((string) $row->value, true) ?: [];
            foreach (self::NEW as $plan => $values) {
                foreach ($values as $field => $value) {
                    if (array_key_exists($field, (array) ($saved['plans'][$plan] ?? [])) && (int) $saved['plans'][$plan][$field] === self::OLD[$plan][$field]) {
                        $saved['plans'][$plan][$field] = $value;
                    }
                }
            }
            DB::table('settings')->where('key', 'team_plans')->update(['value' => json_encode($saved, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]);
        }
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropColumn('team_purpose');
        });
        Schema::table('team_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('pending_revision_message_id');
            $table->dropConstrainedForeignId('refunded_by');
            $table->dropColumn(['extra_revisions', 'refund_status', 'refunded_at']);
        });
    }
};
