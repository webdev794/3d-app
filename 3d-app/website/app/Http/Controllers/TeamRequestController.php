<?php

namespace App\Http\Controllers;

use App\Models\TeamFile;
use App\Models\TeamRequest;
use App\Services\Team\TeamPlans;
use App\Services\Team\TeamService;
use App\Services\Team\TeamView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * 3DEEZI TEAM for customers (team-api.md 3): the allowance, sending a brief, my requests, the conversation,
 * approving or asking for revisions, and taking the final design into the Studio or an order.
 */
class TeamRequestController extends Controller
{
    public function __construct(private TeamService $team) {}

    public function allowance(Request $request): JsonResponse
    {
        return response()->json(['data' => TeamPlans::status($request->user())]);
    }

    public function index(Request $request): JsonResponse
    {
        $requests = TeamRequest::query()->where('user_id', $request->user()->id)->with(['designer:id,name', 'invoice'])->orderByDesc('id')->get();

        return response()->json(['data' => $requests->map(fn (TeamRequest $r) => TeamView::summary($r))->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        if (is_string($request->input('colours'))) {
            $request->merge(['colours' => array_values(array_filter(array_map('trim', explode(',', $request->input('colours')))))]);
        }
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190'],
            'sport' => ['required', 'string', 'max:60'],
            'garment' => ['required', 'string', 'max:60'],
            'category' => ['sometimes', 'nullable', 'string', 'max:60'],
            'description' => ['required', 'string', 'min:10', 'max:4000'],
            'colours' => ['sometimes', 'nullable', 'array', 'max:8'],
            'colours.*' => ['string', 'max:40'],
            'instructions' => ['sometimes', 'nullable', 'string', 'max:4000'],
            'logos' => ['sometimes', 'array', 'max:5'],
            'logos.*' => TeamFile::rules('logo'),
            'references' => ['sometimes', 'array', 'max:10'],
            'references.*' => TeamFile::rules('reference'),
            'idempotency_key' => ['sometimes', 'nullable', 'string', 'max:80'],
        ], ['logos.*.max' => 'Files can be up to 20 MB.', 'references.*.max' => 'Files can be up to 20 MB.', 'logos.max' => 'Add up to 5 logos.', 'references.max' => 'Add up to 10 references.']);
        $user = $request->user();
        if (filled($data['idempotency_key'] ?? null) && ($same = TeamRequest::where('user_id', $user->id)->where('idempotency_key', $data['idempotency_key'])->first())) {
            return response()->json(['data' => TeamView::detail($same, $user)]);
        }
        $logos = (array) $request->file('logos', []);
        $references = (array) $request->file('references', []);
        $total = array_sum(array_map(fn ($f) => $f->getSize(), [...$logos, ...$references]));
        if ($total > TeamFile::MAX_TOTAL_BYTES) {
            throw ValidationException::withMessages(['references' => 'All files together can be up to 100 MB.']);
        }
        $data['colours'] = array_values(array_filter($data['colours'] ?? [], 'filled')) ?: null;
        $created = $this->team->submit($user, $data, $logos, $references);

        return response()->json(['data' => TeamView::detail($created, $user)], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $found = $this->own($request, $id);
        $data = TeamView::detail($found, $request->user());
        $found->forceFill(['customer_read_at' => now()])->saveQuietly();

        return response()->json(['data' => $data]);
    }

    public function message(Request $request, int $id): JsonResponse
    {
        $found = $this->own($request, $id);
        $data = $this->validateMessage($request);
        $message = $this->team->message($found, $request->user(), $data['body'] ?? null, (array) $request->file('files', []));

        return response()->json(['data' => TeamView::message($message, $found)], 201);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $found = $this->own($request, $id);
        $data = $request->validate(['version' => ['sometimes', 'nullable', 'integer', 'min:1']]);

        return response()->json(['data' => TeamView::detail($this->team->approve($found, $data['version'] ?? null, $request->user()), $request->user())]);
    }

    public function revise(Request $request, int $id): JsonResponse
    {
        $found = $this->own($request, $id);
        $data = $request->validate([
            'message' => ['required', 'string', 'min:2', 'max:4000'],
            'files' => ['sometimes', 'array', 'max:5'],
            'files.*' => TeamFile::rules('reference'),
            // Revisions used up: ask for an extra round (invoiced, starts once paid).
            'extra' => ['sometimes', 'boolean'],
        ]);

        return response()->json(['data' => TeamView::detail($this->team->revise($found, $request->user(), $data['message'], (array) $request->file('files', []), $request->boolean('extra')), $request->user())]);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $found = $this->own($request, $id);

        return response()->json(['data' => TeamView::detail($this->team->close($found, $request->user(), 'Cancelled by the customer.'), $request->user())]);
    }

    public function toStudio(Request $request, int $id): JsonResponse
    {
        $found = $this->own($request, $id);
        $asset = $this->team->studioAsset($found);

        return response()->json(['data' => ['asset_id' => $asset->id, 'name' => $asset->name, 'garment' => $found->garment, 'sport' => $found->sport, 'url' => '/api/v1/assets/'.$asset->id.'/file']]);
    }

    public function orderDraft(Request $request, int $id): JsonResponse
    {
        $found = $this->own($request, $id);
        $draft = $this->team->orderDraft($found);

        return response()->json(['data' => ['draft_id' => $draft->id, 'link' => '/orders/new?draft='.$draft->id]], 201);
    }

    /** A file: the customer's own request (customer-visible files), a designer's assigned requests, or any for admins. */
    public function file(Request $request, int $file): StreamedResponse
    {
        $found = TeamFile::with('request')->findOrFail($file);
        $user = $request->user();
        $r = $found->request;
        $staff = $user->is_admin || ($user->is_designer && ($user->designer_all || $r->designer_id === $user->id));
        abort_unless($staff || ($r->user_id === $user->id && $found->visibility === 'customer'), 404);
        abort_unless(Storage::disk('local')->exists($found->path), 404, 'The file is missing on the server.');
        $inline = $request->boolean('inline') && $found->isPicture();

        return Storage::disk('local')->{$inline ? 'response' : 'download'}($found->path, $found->name, [
            'Content-Type' => $found->mime_type,
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            'Cache-Control' => 'private, max-age=300',
        ]);
    }

    public static function validateMessage(Request $request): array
    {
        $data = $request->validate([
            'body' => [$request->hasFile('files') ? 'nullable' : 'required', 'string', 'max:4000'],
            'files' => ['sometimes', 'array', 'max:5'],
            'files.*' => TeamFile::rules('reference'),
            'internal' => ['sometimes', 'boolean'],
        ], ['body.required' => 'Write a message or attach a file.']);
        if (isset($data['body'])) {
            $data['body'] = trim($data['body']) ?: null;
        }

        return $data;
    }

    private function own(Request $request, int $id): TeamRequest
    {
        return TeamRequest::query()->where('user_id', $request->user()->id)->findOrFail($id);
    }
}
