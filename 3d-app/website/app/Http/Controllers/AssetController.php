<?php

namespace App\Http\Controllers;

use App\Models\Asset;
use App\Services\DesignFiles;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AssetController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->assets()->latest()->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        // A factory print layout (Studio › Artwork) may be a PDF or SVG as well as a picture: it is read by the 3D
        // viewer, never shown as a page.
        $layout = $request->input('type') === 'layout';
        // AI Designer (client 2026-11-02): a design file (PDF, SVG, AI, EPS, PSD, TIFF…) kept as it is, type "design".
        $design = $request->input('type') === 'design';
        // …and a reference picture may bring the design file it was drawn from ("original"): both are kept, the
        // picture pointing to the file. Without a picture the server draws one, when it can.
        $withOriginal = $request->input('type') === 'reference' && $request->hasFile('original');
        // Patterns › My patterns: an own pattern picture, up to 5 MB.
        $max = $request->input('type') === 'pattern' ? 5120 : 10240;
        $picture = ['file', 'image', 'mimes:png,jpg,jpeg,webp', 'max:'.$max, 'dimensions:max_width=8192,max_height=8192'];
        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:120'],
            'type' => ['required', 'in:logo,pattern,artwork,reference,layout,design'],
            'file' => match (true) {
                $layout => ['required', 'file', 'mimes:pdf,svg,png,jpg,jpeg,webp', 'max:30720'],
                $design => ['required', 'file', 'max:'.DesignFiles::MAX_KB],
                $withOriginal => ['nullable', ...$picture],
                default => ['required', ...$picture],
            },
            'original' => $withOriginal ? ['file', 'max:'.DesignFiles::MAX_KB] : ['prohibited'],
            'page' => ['sometimes', 'integer', 'min:1', 'max:999'],
        ], [
            'file.max' => $design ? 'Use a design file under 25 MB.' : 'Use a picture under '.($max / 1024).' MB.',
            'original.max' => 'Use a design file under 25 MB.',
            'original.uploaded' => 'The design file did not arrive. Use a file under 25 MB.',
        ]);
        if ($design || $withOriginal) {
            return $this->storeDesign($request, $data, $design ? $request->file('file') : $request->file('original'), $design ? null : $request->file('file'));
        }
        $file = $request->file('file');
        $path = $file->store('assets/'.$request->user()->id, 'local');
        abort_if(! $path, 500, 'The image could not be stored. Please try again.');

        try {
            $asset = $request->user()->assets()->create([
                'name' => $data['name'] ?? mb_substr(pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME), 0, 120),
                'type' => $data['type'],
                'path' => $path,
                'mime_type' => $file->getMimeType(),
                'size' => $file->getSize(),
            ]);
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete($path);
            throw $exception;
        }

        return response()->json(['data' => $asset], 201);
    }

    /**
     * A design file kept as it is (type "design"), and for a reference its picture beside it: the one sent, or the
     * one this server draws (EPS, PSD, TIFF… when it can). Answers the picture with its `source`, or the file itself.
     */
    private function storeDesign(Request $request, array $data, UploadedFile $original, ?UploadedFile $picture): JsonResponse
    {
        $kind = DesignFiles::kind($original->getRealPath());
        abort_unless($kind !== null, 422, 'This is not a design file we can read. Use PDF, SVG, AI, EPS, PSD, TIFF, PNG, JPG or WebP.');
        $drawn = null;
        if ($data['type'] === 'reference' && ! $picture) {
            $drawn = app(DesignFiles::class)->picture($original->getRealPath(), $kind, (int) ($data['page'] ?? 1));
            abort_unless($drawn !== null, 422, DesignFiles::cannotRead($kind));
        }
        $user = $request->user();
        $dir = 'assets/'.$user->id;
        $saved = [];
        try {
            $sourceName = mb_substr($original->getClientOriginalName() ?: 'Design file', 0, 120);
            $source = $user->assets()->create([
                'name' => $data['type'] === 'design' && ! empty($data['name']) ? $data['name'] : $sourceName,
                'type' => 'design',
                'path' => $saved[] = $original->storeAs($dir, Str::random(40).'.'.$this->ending($original, $kind), 'local'),
                'mime_type' => DesignFiles::MIME[$kind],
                'size' => $original->getSize(),
            ]);
            if ($data['type'] === 'design') {
                return response()->json(['data' => $source], 201);
            }
            $path = $picture ? $picture->store($dir, 'local') : $dir.'/'.Str::random(40).'.png';
            $saved[] = $path;
            if ($drawn !== null) {
                Storage::disk('local')->put($path, $drawn);
            }
            $asset = $user->assets()->create([
                'name' => $data['name'] ?? mb_substr(pathinfo($sourceName, PATHINFO_FILENAME), 0, 120),
                'type' => 'reference',
                'path' => $path,
                'mime_type' => $picture ? $picture->getMimeType() : 'image/png',
                'size' => $picture ? $picture->getSize() : strlen((string) $drawn),
                ...(Asset::keepsSources() ? ['source_id' => $source->id] : []),
            ]);
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete(array_filter($saved));
            isset($source) && $source->exists && $source->delete();
            throw $exception;
        }

        return response()->json(['data' => [...$asset->toArray(), 'source' => $source]], 201);
    }

    /** The design file's own ending (an Illustrator file stays .ai), or the one of its kind. */
    private function ending(UploadedFile $file, string $kind): string
    {
        $ext = strtolower($file->getClientOriginalExtension());

        return in_array($ext, DesignFiles::EXTENSIONS, true) ? $ext : ['jpeg' => 'jpg'][$kind] ?? $kind;
    }

    public function file(Request $request, int $asset): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        // Administrators may read any file: an order's kit page draws the kit with the customer's print layout.
        $owned = $request->user()->is_admin ? Asset::findOrFail($asset) : $this->owned($request, $asset);
        abort_unless(Storage::disk('local')->exists($owned->path), 404);

        return Storage::disk('local')->response($owned->path, null, [
            'Content-Type' => $owned->mime_type,
            'X-Content-Type-Options' => 'nosniff',
            // Files are read by the page's scripts, never run: an SVG or PDF opened on its own gets no powers.
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            'Cache-Control' => 'private, max-age=300',
        ]);
    }

    public function destroy(Request $request, int $asset): JsonResponse
    {
        $owned = $this->owned($request, $asset);
        Storage::disk('local')->delete($owned->path);
        $owned->delete();

        return response()->json(['data' => ['message' => 'Asset deleted.']]);
    }

    private function owned(Request $request, int $asset): Asset
    {
        return $request->user()->assets()->findOrFail($asset);
    }
}
