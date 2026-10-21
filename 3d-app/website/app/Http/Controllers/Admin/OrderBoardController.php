<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderFile;
use App\Models\User;
use App\Support\OrderBoard;
use App\Support\OrderGate;
use App\Support\OrderStages;
use App\Support\OrderView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Staff run the order board: move orders between stages, set the sub-status, ask for design approval with a
 * versioned proof, post updates (customer-visible or internal), add files, tracking, assignment and due dates.
 * Everything is recorded in the order's history.
 */
class OrderBoardController extends Controller
{
    public function board(Request $request): JsonResponse
    {
        $filters = $request->validate(['view' => ['sometimes', 'in:current,completed'], 'search' => ['sometimes', 'nullable', 'string', 'max:120']]);

        return response()->json(['data' => OrderBoard::build(Order::query(), true, $filters['view'] ?? 'current', trim((string) ($filters['search'] ?? '')))]);
    }

    /** The staff an order can be assigned to. */
    public function staff(): JsonResponse
    {
        return response()->json(['data' => User::where('is_admin', true)->orderBy('name')->get(['id', 'name', 'email'])]);
    }

    /**
     * Moves an order to another stage (a card dropped on another column). Into Production or later without the
     * customer's design approval or full payment: 409 (approval_missing / payment_missing) unless confirmed
     * (confirm_without_approval; confirm_unpaid with an override_reason), recorded in the history. See OrderGate.
     */
    public function stage(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(Order::STATUSES)],
            'step' => ['sometimes', 'nullable', 'string', 'max:30'],
            'message' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'visibility' => ['sometimes', 'in:customer,internal'],
            'confirm_without_approval' => ['sometimes', 'boolean'],
            'confirm_unpaid' => ['sometimes', 'boolean'],
            'override_reason' => ['sometimes', 'nullable', 'string', 'max:500'],
        ], ['status.in' => 'Choose one of the board\'s stages.']);
        if (isset($data['step']) && ! OrderStages::validStep($data['status'], $data['step'])) {
            throw ValidationException::withMessages(['step' => 'Choose a sub-status of '.OrderStages::label($data['status']).'.']);
        }
        $moved = DB::transaction(function () use ($order, $data) {
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $locked->status = $data['status'];
            if (array_key_exists('step', $data)) {
                $locked->step = $data['step'];
            }
            $gate = OrderGate::check($locked, (bool) ($data['confirm_without_approval'] ?? false), (bool) ($data['confirm_unpaid'] ?? false), $data['override_reason'] ?? null);
            $this->saveWithNote($locked, $data['message'] ?? null, $data['visibility'] ?? 'customer', $gate);

            return $locked;
        });

        return response()->json(['data' => $this->card($moved)]);
    }

    /**
     * Posts an update and/or changes the sub-status, design approval, tracking, assignment or due date.
     * Asking for approval ("review") on an order still in Order Received moves it to Design & Approval.
     */
    public function post(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate([
            'message' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'visibility' => ['sometimes', 'in:customer,internal'],
            'step' => ['sometimes', 'nullable', 'string', 'max:30'],
            'approval' => ['sometimes', Rule::in(Order::APPROVALS)],
            'carrier' => ['sometimes', 'nullable', 'string', 'max:80'],
            'tracking_number' => ['sometimes', 'nullable', 'string', 'max:80'],
            'tracking_url' => ['sometimes', 'nullable', 'url:http,https', 'max:500'],
            'assigned_to' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')->where('is_admin', true)],
            'due_date' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
        ], [
            'tracking_url.url' => 'The tracking link must start with http:// or https://.',
            'assigned_to.exists' => 'Assign the order to a staff member (an administrator).',
        ]);
        $fields = array_intersect_key($data, array_flip(['step', 'approval', 'carrier', 'tracking_number', 'tracking_url', 'assigned_to', 'due_date']));
        if (! $fields && ! filled($data['message'] ?? null)) {
            throw ValidationException::withMessages(['message' => 'Write an update, or change something first.']);
        }
        if (array_key_exists('step', $fields) && ! OrderStages::validStep($order->status, $fields['step'])) {
            throw ValidationException::withMessages(['step' => 'Choose a sub-status of '.OrderStages::label($order->status).'.']);
        }
        $updated = DB::transaction(function () use ($order, $data, $fields) {
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $approval = $fields['approval'] ?? null;
            unset($fields['approval']);
            $locked->fill($fields);
            $note = filled($data['message'] ?? null) ? trim($data['message']) : null;
            $visibility = $data['visibility'] ?? 'customer';
            if ($approval !== null && $approval !== $locked->approval) {
                $proof = $this->setApproval($locked, $approval);
                $this->saveWithNote($locked, null, $visibility);
                $locked->record('approval', ['approval' => $approval, 'message' => $visibility === 'customer' ? $note : null, 'order_file_id' => $proof?->id,
                    'data' => array_filter(['version' => $proof?->version, 'proof_id' => $proof?->id])]);
                if ($visibility === 'internal' && $note) {
                    $locked->record('note', ['visibility' => 'internal', 'message' => $note]);
                }
            } else {
                $this->saveWithNote($locked, $note, $visibility);
            }

            return $locked;
        });

        return response()->json(['data' => OrderView::detail($updated->fresh(), true)]);
    }

    /**
     * Adds a file: artwork, a design proof, photos, an invoice or anything else, customer-visible or internal.
     * A customer-visible proof is the next version of the design: it always asks the customer to approve it again.
     */
    public function storeFile(Request $request, Order $order): JsonResponse
    {
        $kind = in_array($request->input('kind'), OrderFile::KINDS, true) ? $request->input('kind') : 'other';
        $request->validate([
            'kind' => ['required', Rule::in(OrderFile::KINDS)],
            'visibility' => ['sometimes', Rule::in(OrderFile::VISIBILITIES)],
            'file' => OrderFile::rules($kind),
            'message' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ], ['file.uploaded' => 'The file did not upload: it may be larger than 25 MB.', 'file.max' => 'Files can be up to 25 MB.']);
        $visibility = $request->input('visibility', 'customer');
        $note = filled($request->input('message')) ? trim((string) $request->input('message')) : null;

        $updated = DB::transaction(function () use ($request, $order, $kind, $visibility, $note) {
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $file = OrderFile::fromUpload($request->file('file'), $kind, 'order-'.$locked->id);
            $file->user_id = $request->user()->id;
            $file->visibility = $visibility;
            if ($kind === 'proof' && $visibility === 'customer') {
                $file->version = (int) $locked->files()->where('kind', 'proof')->where('visibility', 'customer')->max('version') + 1;
                $locked->files()->save($file);
                $this->setApproval($locked, 'review', $file);
                $this->saveWithNote($locked, null, 'customer');
                $locked->record('approval', ['approval' => 'review', 'message' => $note, 'order_file_id' => $file->id, 'data' => ['version' => $file->version, 'proof_id' => $file->id]]);
            } else {
                $locked->files()->save($file);
                $locked->record('file', ['visibility' => $visibility, 'message' => $note, 'order_file_id' => $file->id, 'data' => ['file_kind' => $kind, 'name' => $file->name]]);
            }

            return $locked;
        });

        return response()->json(['data' => OrderView::detail($updated->fresh(), true)], 201);
    }

    public function destroyFile(Order $order, int $file): JsonResponse
    {
        $found = $order->files()->findOrFail($file);
        $name = $found->name;
        $found->delete();
        $order->record('note', ['visibility' => 'internal', 'message' => "File removed: {$name}"]);

        return response()->json(['data' => OrderView::detail($order->fresh(), true)]);
    }

    /**
     * Sets the design approval. Asking for it ("review") marks the newest customer-visible proof as the one to
     * answer (older unanswered ones are replaced) and moves an order still in Order Received to Design & Approval.
     */
    private function setApproval(Order $order, string $approval, ?OrderFile $proof = null): ?OrderFile
    {
        $order->approval = $approval;
        if ($approval !== 'review') {
            // Staff answer for the customer (e.g. approved by phone), or start again: the waiting proof is settled.
            $pending = $order->files()->where('kind', 'proof')->where('review_status', 'pending')->orderByDesc('version')->first();
            $pending?->forceFill(['review_status' => $approval === 'waiting' ? 'superseded' : $approval, 'reviewed_at' => now()])->save();

            return $proof ?? $pending ?? $order->latestProof();
        }
        $proof ??= $order->latestProof();
        $order->files()->where('kind', 'proof')->where('review_status', 'pending')->when($proof, fn ($q) => $q->whereKeyNot($proof->id))->update(['review_status' => 'superseded']);
        if ($proof) {
            $proof->forceFill(['review_status' => 'pending', 'reviewed_at' => null, 'review_note' => null])->save();
        }
        if ($order->status === 'pending') {
            $order->status = 'confirmed';
        }

        return $proof;
    }

    /** Saves with the message going with the change it explains; a message on its own is a note. */
    private function saveWithNote(Order $order, ?string $note, string $visibility, array $activity = []): void
    {
        $order->activity = $activity + ['note' => $visibility === 'customer' ? $note : null];
        $order->save();
        if ($note && ($visibility === 'internal' || ! $order->noteRecorded)) {
            $order->record('note', ['visibility' => $visibility, 'message' => $note]);
        }
    }

    private function card(Order $order): array
    {
        $loaded = OrderView::forCards(Order::whereKey($order->id), true)->firstOrFail();

        return OrderView::card($loaded, true, OrderView::itemProjects([$loaded]));
    }
}
