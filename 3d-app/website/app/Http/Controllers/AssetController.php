<?php

namespace App\Http\Controllers;

use App\Models\Asset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

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
        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:120'],
            'type' => ['required', 'in:logo,pattern,artwork,reference,layout'],
            'file' => $layout
                ? ['required', 'file', 'mimes:pdf,svg,png,jpg,jpeg', 'max:30720']
                : ['required', 'file', 'image', 'mimes:png,jpg,jpeg,webp', 'max:10240', 'dimensions:max_width=8192,max_height=8192'],
        ]);
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
