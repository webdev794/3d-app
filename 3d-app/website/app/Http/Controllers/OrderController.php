<?php

namespace App\Http\Controllers;

use App\Http\Requests\OrderRequest;
use App\Models\Order;
use App\Models\OrderFile;
use App\Services\OrderAssistant;
use App\Services\OrderSubmission;
use App\Support\OrderBoard;
use App\Support\OrderStages;
use App\Support\OrderView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Customers place orders (a Studio kit, the order form or an uploaded order form) and follow them on their board.
 * They only ever see their own orders, and never staff-only notes, files or fields.
 */
class OrderController extends Controller
{
    /** The choices for the order forms (public). */
    public function options(): JsonResponse
    {
        return response()->json(['data' => [
            'garments' => collect(Order::GARMENTS)->map(fn ($name, $id) => compact('id', 'name'))->values(),
            'sports' => collect(config('catalog.sports'))->map(fn ($s) => ['id' => $s['id'], 'name' => $s['name']])->values(),
            'fits' => collect(Order::FITS)->map(fn ($name, $id) => compact('id', 'name'))->values(),
            'sizes' => Order::SIZES,
            'stages' => OrderStages::all(),
            'files' => [
                'order_form' => ['extensions' => OrderFile::TYPES['order_form'], 'max_kb' => OrderFile::MAX_KB],
                'artwork' => ['extensions' => OrderFile::TYPES['artwork'], 'max_kb' => OrderFile::MAX_KB],
                'max_files' => OrderFile::MAX_FILES,
            ],
            'completed_after_days' => Order::COMPLETED_AFTER_DAYS,
            // A date required sooner than this many weeks gets a gentle warning (Admin › Settings).
            'lead_time_weeks' => \App\Support\OrderDelivery::leadWeeks(),
        ]]);
    }

    /** "Help me add sizes": garment rows read from a plain description (public, throttled like the chat). */
    public function assist(Request $request, OrderAssistant $assistant): JsonResponse
    {
        $data = $request->validate(['text' => ['required', 'string', 'max:1500']], ['text.required' => 'Describe your order, e.g. 12 jerseys M, 12 shorts L.']);

        return response()->json(['data' => $assistant->read($data['text'])]);
    }

    /** All my orders, newest first (each as a board card plus the order's own fields). */
    public function index(Request $request): JsonResponse
    {
        $orders = OrderView::forCards($request->user()->orders()->getQuery(), false)->latest('orders.created_at')->latest('orders.id')->get();
        $projects = OrderView::itemProjects($orders, $request->user()->id);

        return response()->json(['data' => $orders->map(fn (Order $o) => array_merge(
            Arr::except($o->attributesToArray(), [...Order::INTERNAL, 'kit_thumbnail', 'kit_name', 'kit_garment', 'files_count']),
            ['project' => $o->project?->only(['id', 'name', 'garment', 'sport'])],
            OrderView::card($o, false, $projects),
        ))]);
    }

    /** My orders by stage: current (default) or completed, with a search, and my saved drafts. */
    public function board(Request $request): JsonResponse
    {
        $filters = $request->validate(['view' => ['sometimes', 'in:current,completed'], 'search' => ['sometimes', 'nullable', 'string', 'max:120']]);
        $board = OrderBoard::build($request->user()->orders()->getQuery(), false, $filters['view'] ?? 'current', trim((string) ($filters['search'] ?? '')), $request->user()->id);
        $board['drafts'] = $request->user()->orderDrafts()->withCount('files')->latest('updated_at')->get()->map->summary()->all();

        return response()->json(['data' => $board]);
    }

    /** One of my orders, with its customer-visible files and updates. */
    public function show(Request $request, int $order): JsonResponse
    {
        return response()->json(['data' => OrderView::detail($request->user()->orders()->findOrFail($order), false)]);
    }

    /**
     * Places an order once: the same idempotency key again gives the order already made (200, Idempotent-Replayed).
     * Orders from the order form or an uploaded order form need the key.
     */
    public function store(OrderRequest $request, OrderSubmission $submission): JsonResponse
    {
        $key = OrderSubmission::key($request);
        if ($existing = OrderSubmission::replay($request->user(), $key)) {
            return $this->placed($existing, false);
        }
        $data = $request->validated();
        if (in_array($data['source'] ?? 'studio', ['form', 'upload'], true) && ! $key) {
            throw ValidationException::withMessages(['idempotency_key' => 'Send an Idempotency-Key with the order, so it is never placed twice.']);
        }
        [$order, $made] = $submission->submit($request->user(), $data, $key);

        return $this->placed($order, $made);
    }

    /** The order as placed, for the confirmation screen: its reference, a link to it and the invoice, if issued. */
    public function placed(Order $order, bool $made): JsonResponse
    {
        $detail = OrderView::detail($order->fresh(), false);

        return response()->json(['data' => $detail + ['invoice' => $detail['payment']]], $made ? 201 : 200, $made ? [] : ['Idempotent-Replayed' => 'true']);
    }

    /**
     * The customer's answer to a design proof: approve that version, or ask for changes (with a note). Only while
     * approval is needed; recorded in the history. The stage never changes here.
     */
    public function approval(Request $request, int $order): JsonResponse
    {
        $data = $request->validate([
            'decision' => ['required', 'in:approve,changes'],
            'proof_id' => ['sometimes', 'nullable', 'integer'],
            'message' => ['required_if:decision,changes', 'nullable', 'string', 'max:2000'],
        ], ['decision.in' => 'Approve the design or ask for changes.', 'message.required_if' => 'Tell us what to change.']);
        $owned = DB::transaction(function () use ($request, $order, $data) {
            $owned = $request->user()->orders()->lockForUpdate()->findOrFail($order);
            abort_unless($owned->approval === 'review', 409, 'There is no design waiting for your approval.');
            $proof = $owned->files()->where('kind', 'proof')->where('visibility', 'customer')->where('review_status', 'pending')->orderByDesc('version')->first();
            if ($proof && empty($data['proof_id'])) {
                throw ValidationException::withMessages(['proof_id' => 'Say which design proof you are answering.']);
            }
            if ($proof && (int) $data['proof_id'] !== $proof->id) {
                abort(409, 'This design proof has been replaced by a newer version. Check the latest proof, then answer again.');
            }
            $approved = $data['decision'] === 'approve';
            $message = filled($data['message'] ?? null) ? trim($data['message']) : null;
            $proof?->forceFill(['review_status' => $approved ? 'approved' : 'changes', 'reviewed_at' => now(), 'review_note' => $message])->save();
            $owned->approval = $approved ? 'approved' : 'changes';
            $owned->save();
            $owned->record('approval', ['approval' => $owned->approval, 'message' => $message, 'order_file_id' => $proof?->id,
                'data' => array_filter(['version' => $proof?->version, 'proof_id' => $proof?->id])]);

            return $owned;
        });

        return response()->json(['data' => OrderView::detail($owned->fresh(), false)]);
    }
}
