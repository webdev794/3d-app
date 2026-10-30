<?php

namespace App\Http\Controllers;

use App\Http\Requests\OrderRequest;
use App\Models\OrderDraft;
use App\Models\OrderFile;
use App\Services\OrderFormReader;
use App\Services\OrderSubmission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Saved order forms and uploads (drafts) with their files, until they are submitted as one order. Drafts are never
 * orders: no reference number, not on the board. A customer only ever reaches their own drafts.
 */
class OrderDraftController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->orderDrafts()->withCount('files')->latest('updated_at')->get()->map->summary()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->checked($request, true);
        $draft = $request->user()->orderDrafts()->create($data);

        return response()->json(['data' => $this->full($draft)], 201);
    }

    public function show(Request $request, int $draft): JsonResponse
    {
        return response()->json(['data' => $this->full($this->owned($request, $draft))]);
    }

    public function update(Request $request, int $draft): JsonResponse
    {
        $owned = $this->owned($request, $draft);
        $owned->update(['data' => $this->checked($request, false)['data']]);
        // Saved again with the same data: still show it as saved now.
        $owned->touch();

        return response()->json(['data' => $this->full($owned)]);
    }

    public function destroy(Request $request, int $draft): JsonResponse
    {
        $this->owned($request, $draft)->delete();

        return response()->json(['data' => ['message' => 'Draft deleted.']]);
    }

    /** Submits the draft as one order (its saved fields, replaced by any sent now), with an idempotency key. */
    public function submit(Request $request, int $draft, OrderSubmission $submission): JsonResponse
    {
        $key = OrderSubmission::key($request);
        if ($existing = OrderSubmission::replay($request->user(), $key)) {
            return app(OrderController::class)->placed($existing, false);
        }
        if (! $key) {
            throw ValidationException::withMessages(['idempotency_key' => 'Send an Idempotency-Key with the order, so it is never placed twice.']);
        }
        $owned = $this->owned($request, $draft);
        $sent = $request->only(\App\Models\OrderDraft::FIELDS);
        $fields = array_merge(OrderSubmission::fromDraft($owned), $sent, ['source' => $owned->kind, 'draft_id' => $owned->id]);
        $data = OrderRequest::check($request, $fields);
        [$order, $made] = $submission->submit($request->user(), $data, $key);

        return app(OrderController::class)->placed($order, $made);
    }

    public function files(Request $request, int $draft): JsonResponse
    {
        return response()->json(['data' => $this->owned($request, $draft)->files]);
    }

    /**
     * Attaches an order form or artwork file to the draft. An order form in CSV or Excel (.xlsx) is also read into
     * suggested garment rows (`suggested`), for the customer to check before submitting.
     */
    public function storeFile(Request $request, int $draft, OrderFormReader $reader): JsonResponse
    {
        $owned = $this->owned($request, $draft);
        $kind = in_array($request->input('kind'), OrderFile::CUSTOMER_KINDS, true) ? $request->input('kind') : 'artwork';
        $request->validate([
            'kind' => ['required', 'in:'.implode(',', OrderFile::CUSTOMER_KINDS)],
            'file' => OrderFile::rules($kind),
        ], [
            'kind.required' => 'Say whether the file is the order form or artwork.',
            'kind.in' => 'Say whether the file is the order form or artwork.',
            'file.required' => 'Choose a file to upload.',
            'file.uploaded' => 'The file did not upload: it may be larger than 25 MB. Try a smaller file.',
            'file.max' => 'Files can be up to 25 MB.',
        ]);
        $file = DB::transaction(function () use ($request, $owned, $kind, $reader) {
            OrderDraft::whereKey($owned->id)->lockForUpdate()->first();
            if ($owned->files()->count() >= OrderFile::MAX_FILES) {
                throw ValidationException::withMessages(['file' => 'A draft can have up to '.OrderFile::MAX_FILES.' files. Remove one to add another.']);
            }
            $file = OrderFile::fromUpload($request->file('file'), $kind, (string) $request->user()->id);
            $file->user_id = $request->user()->id;
            $file->visibility = 'customer';
            if ($kind === 'order_form') {
                $suggested = $reader->suggest(\Illuminate\Support\Facades\Storage::disk('local')->path($file->path), $file->extension);
                $file->meta = $suggested ? ['suggested' => $suggested] : null;
            }
            $owned->files()->save($file);
            $owned->touch();

            return $file;
        });

        return response()->json(['data' => $file->toArray() + ['suggested' => $file->meta['suggested'] ?? null]], 201);
    }

    public function destroyFile(Request $request, int $draft, int $file): JsonResponse
    {
        $this->owned($request, $draft)->files()->findOrFail($file)->delete();

        return response()->json(['data' => ['message' => 'File removed.']]);
    }

    private function owned(Request $request, int $draft): OrderDraft
    {
        return $request->user()->orderDrafts()->findOrFail($draft);
    }

    /** The draft with its data and files (and each order form's suggested rows). */
    private function full(OrderDraft $draft): array
    {
        $draft->load('files');

        return $draft->toArray() + ['files' => []] + ['link' => $draft->summary()['link']]
            + ['suggested' => $draft->files->where('kind', 'order_form')->map(fn ($f) => ['file_id' => $f->id] + ($f->meta['suggested'] ?? []))->filter(fn ($s) => isset($s['items']))->values()->all()];
    }

    /** A draft's kind (on create) and its data: an object of up to 200 KB. */
    private function checked(Request $request, bool $creating): array
    {
        $data = $request->validate([
            'kind' => $creating ? ['required', 'in:'.implode(',', OrderDraft::KINDS)] : ['prohibited'],
            'data' => ['present', 'array'],
        ], ['kind.required' => 'Say whether this is an order form or an upload.', 'kind.in' => 'A draft is an order form or an upload.', 'data.array' => 'Send the draft as an object.']);
        if (strlen((string) json_encode($data['data'])) > OrderDraft::MAX_BYTES) {
            throw ValidationException::withMessages(['data' => 'This draft is too large to save. Remove some text and try again.']);
        }

        return $data;
    }
}
