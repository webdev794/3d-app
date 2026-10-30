<?php

namespace App\Services\Team;

use App\Models\Asset;
use App\Models\Invoice;
use App\Models\TeamFile;
use App\Models\TeamMessage;
use App\Models\TeamRequest;
use App\Models\User;
use App\Services\Pricing\Money;

/** The JSON of design requests for the customer and for staff (team-api.md 5). */
final class TeamView
{
    public static function summary(TeamRequest $r, bool $staff = false): array
    {
        $r->loadMissing(['designer:id,name', 'invoice']);
        [$label, $index] = TeamRequest::STATUSES[$r->status] ?? [$r->label(), -1];
        $sports = collect(config('catalog.sports'));
        $garments = collect(config('catalog.garments'));
        $data = [
            'id' => $r->id,
            'number' => $r->number,
            'status' => $r->status,
            'status_label' => $label,
            'stage_index' => $index,
            'name' => $r->name,
            'email' => $r->email,
            'sport' => $r->sport,
            'sport_name' => $sports->firstWhere('id', $r->sport)['name'] ?? $r->sport,
            'garment' => $r->garment,
            'garment_name' => $garments->firstWhere('id', $r->garment)['name'] ?? $r->garment,
            // "Garments needed" (several; the first is `garment`) and the optional "Preferred delivery date" (2026-10-22).
            'garments' => $list = $r->garmentList(),
            'garment_names' => array_map(fn ($g) => $garments->firstWhere('id', $g)['name'] ?? $g, $list),
            'preferred_date' => TeamRequest::briefReady() ? $r->preferred_date?->toDateString() : null,
            'category' => $r->category,
            'description' => $r->description,
            'colours' => array_values($r->colours ?? []),
            'instructions' => $r->instructions,
            'billing' => $r->billing,
            'plan' => $r->plan,
            // Prices include GST (2026-10-21).
            'price' => Money::decimal((int) $r->price_cents),
            'tax_included' => true,
            'currency' => $r->invoice?->currency ?? \App\Services\Pricing\BillingSettings::currency(),
            'invoice' => Invoice::summary($r->invoice),
            'designer' => $r->designer ? ['id' => $r->designer->id, 'name' => $r->designer->name] : null,
            'revisions_used' => $r->revisions_used,
            'revisions_allowed' => $r->revisions_allowed,
            'due_date' => $r->due_date?->toDateString(),
            'extra_revisions' => (int) ($r->extra_revisions ?? 0),
            // An extra revision round waiting for its invoice (pay it to start the revision).
            'pending_revision' => $r->pending_revision_message_id ? ['invoice' => Invoice::summary($r->revisionInvoice)] : null,
            // "due": a paid request cancelled before work started (refunded by hand), "refunded", or null.
            'refund_status' => $r->refund_status,
            'refunded_at' => $r->refunded_at?->toIso8601String(),
            'latest_version' => $r->latestVersion(),
            'unread' => self::unread($r, $staff),
            'created_at' => $r->created_at?->toIso8601String(),
            'updated_at' => $r->updated_at?->toIso8601String(),
            'status_changed_at' => $r->status_changed_at?->toIso8601String(),
            'approved_at' => $r->approved_at?->toIso8601String(),
        ];
        if ($staff) {
            $r->loadMissing('user:id,name,email');
            $data += [
                'customer' => $r->user ? ['id' => $r->user->id, 'name' => $r->user->name, 'email' => $r->user->email] : null,
                'priority' => $r->priority,
                'internal_notes_count' => $r->messages()->where('visibility', 'internal')->count(),
                'files_count' => $r->files()->count(),
            ];
        }

        return $data;
    }

    public static function detail(TeamRequest $r, User $viewer, bool $staff = false): array
    {
        $r->loadMissing(['files.uploader:id,name,is_admin,is_designer', 'messages.author:id,name,is_admin,is_designer']);
        $files = $r->files->filter(fn (TeamFile $f) => $staff || $f->visibility === 'customer');
        $messages = $r->messages->filter(fn (TeamMessage $m) => $staff || $m->visibility === 'customer');
        $byMessage = $files->groupBy('team_message_id');
        $deliveries = $files->whereIn('kind', TeamFile::DELIVERY_KINDS)->where('visibility', 'customer')->groupBy('version')->sortKeysDesc()
            ->map(function ($group, $version) use ($messages, $r) {
                $note = $messages->first(fn (TeamMessage $m) => $m->kind === 'delivery' && (int) ($m->data['version'] ?? 0) === (int) $version);

                return ['version' => (int) $version, 'created_at' => $group->first()->created_at?->toIso8601String(), 'note' => $note?->body, 'files' => $group->map(fn ($f) => self::file($f, $r))->values()];
            })->values();
        $isOwner = $viewer->id === $r->user_id;
        $final = null;
        if ($r->status === 'approved') {
            $assets = Asset::query()->where('user_id', $r->user_id)->whereIn('id', (array) ($r->final_asset_ids ?? []))->orderBy('id')->get();
            $final = [
                'version' => $r->final_version,
                'files' => $files->whereIn('kind', TeamFile::DELIVERY_KINDS)->where('version', $r->final_version)->map(fn ($f) => self::file($f, $r))->values(),
                'assets' => $assets->map(fn (Asset $a) => ['id' => $a->id, 'name' => $a->name, 'url' => '/api/v1/assets/'.$a->id.'/file'])->values(),
                'studio_asset_id' => $assets->first()?->id,
                'approved_at' => $r->approved_at?->toIso8601String(),
            ];
        }
        $data = self::summary($r, $staff) + [
            'files' => $files->whereIn('kind', $staff ? ['logo', 'reference', 'attachment', 'working'] : ['logo', 'reference', 'attachment'])->map(fn ($f) => self::file($f, $r))->values(),
            'deliveries' => $deliveries,
            'messages' => $messages->where('kind', 'message')->map(fn (TeamMessage $m) => self::message($m, $r, $byMessage->get($m->id, collect())))->values(),
            'history' => $messages->where('kind', '!=', 'message')->map(fn (TeamMessage $m) => [
                'id' => $m->id, 'kind' => $m->kind, 'from' => $m->from_status, 'to' => $m->to_status, 'text' => $m->body,
                'by' => $m->author?->name, 'role' => $m->role, 'internal' => $m->visibility === 'internal', 'at' => $m->created_at?->toIso8601String(),
                'files' => $m->kind === 'revision' ? $byMessage->get($m->id, collect())->map(fn ($f) => self::file($f, $r))->values() : [],
            ])->values(),
            'final' => $final,
            'extra_revision_price' => TeamPlans::extraRevision(),
            'can' => [
                'message' => $r->status !== 'closed',
                'approve' => $isOwner && $r->status === 'review',
                'revise' => $isOwner && $r->status === 'review' && $r->revisions_used < $r->revisions_allowed,
                'cancel' => $isOwner && $r->notStarted(),
                // Revisions used up: an extra round, invoiced (A$25 incl. GST) and started once paid.
                'extra_revision' => $isOwner && $r->status === 'review' && $r->revisions_used >= $r->revisions_allowed && ! $r->pending_revision_message_id && TeamRequest::answersReady(),
                'pay_revision' => $isOwner && $r->pending_revision_message_id && (bool) $r->revisionInvoice?->canPay(),
                'pay' => $isOwner && $r->status === 'awaiting_payment' && (bool) $r->invoice?->canPay(),
                'to_studio' => $r->status === 'approved',
                'order' => $isOwner && $r->status === 'approved',
            ],
        ];
        if ($staff) {
            $data['allowance'] = $r->user ? TeamPlans::status($r->user) : null;
            unset($data['allowance']['plans']);
        }

        return $data;
    }

    public static function file(TeamFile $f, TeamRequest $r): array
    {
        $u = $f->uploader;

        return [
            'id' => $f->id, 'kind' => $f->kind, 'name' => $f->name, 'extension' => $f->extension, 'size' => $f->size, 'mime_type' => $f->mime_type,
            'is_image' => $f->isPicture() || in_array($f->extension, ['gif', 'svg'], true), 'thumb' => $f->thumb, 'version' => $f->version,
            'visibility' => $f->visibility, 'url' => '/api/v1/team/files/'.$f->id,
            'uploaded_by' => $u ? ['id' => $u->id, 'name' => $u->name, 'role' => self::roleOf($u, $r)] : null,
            'created_at' => $f->created_at?->toIso8601String(),
        ];
    }

    public static function message(TeamMessage $m, TeamRequest $r, $files = null): array
    {
        $files ??= $m->files;

        return [
            'id' => $m->id, 'body' => $m->body, 'role' => $m->role,
            'author' => $m->author ? ['id' => $m->author->id, 'name' => $m->author->name] : null,
            'internal' => $m->visibility === 'internal',
            'files' => collect($files)->map(fn ($f) => self::file($f, $r))->values(),
            'created_at' => $m->created_at?->toIso8601String(),
        ];
    }

    private static function roleOf(User $u, TeamRequest $r): string
    {
        if ($u->id === $r->user_id && $u->id !== $r->designer_id && ! $u->is_admin) {
            return 'customer';
        }

        return $u->id === $r->designer_id || ($u->is_designer && ! $u->is_admin) ? 'designer' : 'admin';
    }

    /** Messages from the other side since this side last opened the request. */
    private static function unread(TeamRequest $r, bool $staff): int
    {
        $since = $staff ? $r->staff_read_at : $r->customer_read_at;

        return $r->messages()->where('kind', 'message')->where('visibility', 'customer')
            ->when($staff, fn ($q) => $q->where('role', 'customer'), fn ($q) => $q->where('role', '!=', 'customer'))
            ->when($since, fn ($q) => $q->where('created_at', '>', $since))->count();
    }
}
