<?php

namespace App\Http\Controllers;

use App\Models\ArtboardDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The Artboard's designs and templates in the account: File > Save to my account, Open from my account, Save as
 * template and New from template (website and apps). Each user sees and changes only their own.
 */
class ArtboardDocumentController extends Controller
{
    /** The designs (or, with template=1, the templates), newest first, without their contents. */
    public function index(Request $request): JsonResponse
    {
        ArtboardDocument::ensureTable();
        $filters = $request->validate(['template' => ['sometimes', 'boolean']]);
        $query = $request->user()->artboardDocuments()->select(ArtboardDocument::SUMMARY)->latest('updated_at')->latest('id');
        if (array_key_exists('template', $filters)) {
            $query->where('template', (bool) $filters['template']);
        }

        return response()->json(['data' => $query->limit(ArtboardDocument::MAX_PER_USER)->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        ArtboardDocument::ensureTable();
        $data = $this->validated($request, true);
        $user = $request->user();
        abort_if(
            $user->artboardDocuments()->count() >= ArtboardDocument::MAX_PER_USER,
            422,
            'Your account keeps up to '.ArtboardDocument::MAX_PER_USER.' Artboard designs and templates. Delete some you no longer need (File > Open from my account), then save again.',
        );
        $document = $user->artboardDocuments()->create($data);

        return response()->json(['data' => $this->summary($document->refresh())], 201);
    }

    /** One design with its contents, to open in the Artboard. */
    public function show(Request $request, int $artboard): JsonResponse
    {
        ArtboardDocument::ensureTable();

        return response()->json(['data' => $this->owned($request, $artboard)]);
    }

    /** Saves a design again. `expected_version`: the version it was opened at; a newer one on the server answers 409. */
    public function update(Request $request, int $artboard): JsonResponse
    {
        ArtboardDocument::ensureTable();
        $data = $this->validated($request, false);
        $expected = $request->input('expected_version');
        $document = DB::transaction(function () use ($request, $artboard, $data, $expected) {
            $owned = $request->user()->artboardDocuments()->lockForUpdate()->findOrFail($artboard);
            if ($expected !== null && (int) $expected !== $owned->version) {
                abort(409, 'This design was changed somewhere else since you opened it (in another tab or in the app).');
            }
            $owned->fill($data);
            if ($owned->isDirty()) {
                $owned->version++;
                $owned->save();
            }

            return $owned;
        });

        return response()->json(['data' => $this->summary($document)]);
    }

    public function destroy(Request $request, int $artboard): JsonResponse
    {
        ArtboardDocument::ensureTable();
        $this->owned($request, $artboard)->delete();

        return response()->json(['data' => ['message' => 'Design deleted.']]);
    }

    private function owned(Request $request, int $artboard): ArtboardDocument
    {
        return $request->user()->artboardDocuments()->findOrFail($artboard);
    }

    private function summary(ArtboardDocument $document): array
    {
        return $document->makeHidden('document')->toArray();
    }

    /** The fields to save, with the design's page count and size. */
    private function validated(Request $request, bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes';
        $data = $request->validate([
            'name' => [$required, 'string', 'max:120'],
            'template' => ['sometimes', 'boolean'],
            'document' => [$required, 'string', 'max:'.ArtboardDocument::MAX_DOCUMENT],
            // A small picture of the page for the lists (PNG, JPEG or WebP data URL).
            'preview' => ['sometimes', 'nullable', 'string', 'max:600000', 'regex:#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$#D'],
            'expected_version' => ['sometimes', 'integer', 'min:1'],
        ], [
            'document.max' => 'This design is too large to keep in your account (over 20 MB). Make the big pictures in it smaller, or delete some, and save again.',
            'preview.regex' => 'The design\'s picture must be a PNG, JPEG or WebP image.',
        ]);
        unset($data['expected_version']);
        if (isset($data['document'])) {
            $data['pages'] = $this->pageCount($data['document']);
            $data['size'] = strlen($data['document']);
        }
        if (array_key_exists('template', $data)) {
            $data['template'] = (bool) $data['template'];
        }

        return $data;
    }

    /** The design's page count. Anything that is not an Artboard design (damaged, or another kind of file) is refused. */
    private function pageCount(string $document): int
    {
        $doc = json_decode($document, true, 512);
        $damaged = fn () => throw ValidationException::withMessages(['document' => 'This is not an Artboard design (the file may be damaged). Save it again from the Artboard.']);
        if (! is_array($doc) || ($doc !== [] && array_is_list($doc)) || ! is_array($doc['objects'] ?? null) || ! array_is_list($doc['objects'])) {
            $damaged();
        }
        $size = $doc['page'] ?? null;
        if ($size !== null && (! is_array($size) || count($size) !== 2 || ! is_numeric($size[0] ?? null) || ! is_numeric($size[1] ?? null))) {
            $damaged();
        }
        if (! array_key_exists('pages', $doc)) {
            return 1;
        }
        $pages = $doc['pages'];
        if (! is_array($pages) || ! array_is_list($pages) || count($pages) > 200) {
            $damaged();
        }
        foreach ($pages as $page) {
            if (! is_array($page) || (isset($page['objects']) && ! is_array($page['objects']))) {
                $damaged();
            }
        }

        return max(1, count($pages));
    }
}
