<?php

namespace App\Http\Controllers;

use App\Models\Asset;
use App\Services\OpenAiDesigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/** AI patterns, Showcase, one-prompt mockups, design edits and image conversion (OpenAI, server-side). */
class AiController extends Controller
{
    public function pattern(Request $request, OpenAiDesigner $designer): JsonResponse
    {
        $data = $request->validate(['motif' => ['required', 'string', 'min:3', 'max:300']]);
        abort_unless(OpenAiDesigner::enabled(), 503, 'AI generation is not configured on this server.');
        set_time_limit(180);
        try {
            return response()->json(['data' => ['patternImage' => $designer->pattern($data['motif'])]]);
        } catch (RuntimeException $e) {
            abort(502, $e->getMessage());
        }
    }

    public function showcase(Request $request, OpenAiDesigner $designer): JsonResponse
    {
        $data = $request->validate([
            'image' => ['required', 'string', 'max:12000000', 'regex:#^data:image/(png|jpeg|webp);base64,#'],
            'scene' => ['required', Rule::in(array_keys(OpenAiDesigner::SCENES))],
            'sport' => ['required', 'string', 'max:40'],
            'garment' => ['required', 'string', 'max:40'],
            'logoText' => ['nullable', 'string', 'max:40'],
            'number' => ['nullable', 'string', 'max:3'],
            'back' => ['sometimes', 'boolean'],
            'name' => ['nullable', 'string', 'max:120'],
        ]);
        abort_unless(OpenAiDesigner::enabled(), 503, 'AI generation is not configured on this server.');
        set_time_limit(240);
        try {
            $jpeg = $designer->showcase($data['image'], $data['scene'], $data);
        } catch (RuntimeException $e) {
            abort(502, $e->getMessage());
        }

        // Keep every showcase in the user's private Assets.
        $path = 'assets/'.$request->user()->id.'/showcase-'.Str::uuid().'.jpg';
        Storage::disk('local')->put($path, $jpeg);
        $asset = $request->user()->assets()->create([
            'name' => mb_substr(($data['name'] ?: 'Kit').' showcase · '.$data['scene'], 0, 120),
            'type' => 'showcase',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'size' => strlen($jpeg),
        ]);

        return response()->json(['data' => [
            'asset' => $asset,
            'image' => 'data:image/jpeg;base64,'.base64_encode($jpeg),
        ]], 201);
    }

    /** One prompt to a finished HD presentation mockup, saved in Assets. */
    public function mockup(Request $request, OpenAiDesigner $designer): JsonResponse
    {
        $data = $request->validate([
            'prompt' => ['required', 'string', 'min:8', 'max:4000'],
            'sport' => ['required', Rule::in(array_column(config('catalog.sports'), 'id'))],
            'garment' => ['required', Rule::in(array_column(config('catalog.garments'), 'id'))],
            'reference_ids' => ['sometimes', 'array', 'max:4'],
            'reference_ids.*' => ['required', 'integer', 'distinct', Rule::exists('assets', 'id')->where('user_id', $request->user()->id)],
        ]);
        abort_unless(OpenAiDesigner::enabled(), 503, 'AI generation is not configured on this server.');
        // The art direction (up to 90 s) and the HD render (up to 300 s).
        set_time_limit(420);
        $references = $this->references($request, $data['reference_ids'] ?? []);
        $sport = collect(config('catalog.sports'))->firstWhere('id', $data['sport'])['name'];
        $garment = collect(config('catalog.garments'))->firstWhere('id', $data['garment'])['name'];
        try {
            $plan = $designer->mockupPlan($data['prompt'], $sport, $garment, $references);
            $jpeg = $designer->renderMockup($plan['prompt'], $references);
        } catch (RuntimeException $e) {
            abort(502, $e->getMessage());
        }

        return response()->json(['data' => [
            ...$this->store($request, $jpeg, 'mockup', 'AI mockup · '.mb_substr($data['prompt'], 0, 80)),
            // What the AI set out to make, said to the client like ChatGPT does.
            'direction' => $plan['direction']['summary'] ?? null,
        ]], 201);
    }

    /**
     * "Make it 3D": the mockup redrawn as a flat front and back print sheet,
     * kept in Assets; the Studio's "My design picture" puts it on the 3D kit.
     */
    public function printSheet(Request $request, OpenAiDesigner $designer): JsonResponse
    {
        $data = $request->validate([
            'image' => ['required', 'string', 'max:12000000', 'regex:#^data:image/(png|jpeg|webp);base64,#'],
            'sport' => ['required', Rule::in(array_column(config('catalog.sports'), 'id'))],
            'garment' => ['required', Rule::in(array_column(config('catalog.garments'), 'id'))],
            'reference_ids' => ['sometimes', 'array', 'max:4'],
            'reference_ids.*' => ['required', 'integer', 'distinct', Rule::exists('assets', 'id')->where('user_id', $request->user()->id)],
            'name' => ['nullable', 'string', 'max:80'],
        ]);
        abort_unless(OpenAiDesigner::enabled(), 503, 'AI generation is not configured on this server.');
        set_time_limit(330);
        $sport = collect(config('catalog.sports'))->firstWhere('id', $data['sport'])['name'];
        $garment = collect(config('catalog.garments'))->firstWhere('id', $data['garment'])['name'];
        try {
            $jpeg = $designer->printSheet($data['image'], $sport, $garment, $this->references($request, $data['reference_ids'] ?? []));
        } catch (RuntimeException $e) {
            abort(502, $e->getMessage());
        }

        return response()->json(['data' => $this->store($request, $jpeg, 'reference', 'Print sheet · '.($data['name'] ?: 'AI design'))], 201);
    }

    /** The user's own saved pictures as data URLs, in the order asked. */
    private function references(Request $request, array $ids): array
    {
        return Asset::whereIn('id', $ids)->where('user_id', $request->user()->id)->get()
            ->sortBy(fn (Asset $a) => array_search($a->id, $ids))
            ->filter(fn (Asset $a) => Storage::disk('local')->exists($a->path))
            ->map(fn (Asset $a) => 'data:'.$a->mime_type.';base64,'.base64_encode(Storage::disk('local')->get($a->path)))
            ->values()->all();
    }

    /** "Ask 3DEEZI to change anything": a plain-language edit of the design. */
    public function edit(Request $request, OpenAiDesigner $designer): JsonResponse
    {
        $data = $request->validate([
            'instruction' => ['required', 'string', 'min:2', 'max:600'],
            'design' => ['required', 'array'],
            'image' => ['sometimes', 'nullable', 'string', 'max:8000000', 'regex:#^data:image/(png|jpeg|webp);base64,#'],
        ]);
        abort_unless(OpenAiDesigner::enabled(), 503, 'AI generation is not configured on this server.');
        set_time_limit(120);
        try {
            return response()->json(['data' => $designer->editDesign($data['design'], $data['instruction'], $data['image'] ?? null)]);
        } catch (RuntimeException $e) {
            abort(502, $e->getMessage());
        }
    }

    /**
     * The image editor's "Describe edits" (AI concepts, mockups, showcases, assets): the picture
     * changed as described, guided by an optional mask, a copy with the client's marks and
     * numbered notes. Answers the new picture; the editor keeps it as a new version.
     */
    public function imageEdit(Request $request, OpenAiDesigner $designer): JsonResponse
    {
        $dataUrl = ['string', 'regex:#^data:image/(png|jpeg|webp);base64,#'];
        $data = $request->validate([
            'image' => ['required', 'max:12000000', ...$dataUrl],
            'mask' => ['nullable', 'string', 'max:6000000', 'regex:#^data:image/png;base64,#'],
            'marked' => ['nullable', 'max:8000000', ...$dataUrl],
            'instruction' => ['required_without:notes', 'nullable', 'string', 'max:1000'],
            'notes' => ['sometimes', 'array', 'max:20'],
            'notes.*.text' => ['required', 'string', 'max:300'],
            'notes.*.x' => ['required', 'numeric', 'between:0,1'],
            'notes.*.y' => ['required', 'numeric', 'between:0,1'],
            'size' => ['nullable', Rule::in(OpenAiDesigner::EDIT_SIZES)],
        ], [
            'instruction.required_without' => 'Describe the change you want, or add a note on the picture.',
            'mask.regex' => 'The mask must be a PNG image.',
        ]);
        // The image model needs readable pictures and a mask the size of the picture.
        $size = fn (?string $url) => $url ? (@getimagesizefromstring((string) base64_decode(substr($url, strpos($url, ',') + 1), true)) ?: null) : null;
        $picture = $size($data['image']);
        if (! $picture) {
            throw ValidationException::withMessages(['image' => 'The picture could not be read. Use a PNG, JPEG or WebP image.']);
        }
        if (filled($data['mask'] ?? null) && array_slice($size($data['mask']) ?: [], 0, 2) !== array_slice($picture, 0, 2)) {
            throw ValidationException::withMessages(['mask' => 'The mask must be the same size as the picture.']);
        }
        abort_unless(OpenAiDesigner::enabled(), 503, 'AI generation is not configured on this server.');
        set_time_limit(330);
        try {
            [$mime, $bytes] = $designer->editImage(
                $data['image'], (string) ($data['instruction'] ?? ''), $data['mask'] ?? null,
                $data['marked'] ?? null, $data['notes'] ?? [], $data['size'] ?? null,
            );
        } catch (RuntimeException $e) {
            abort(502, $e->getMessage());
        }

        return response()->json(['data' => ['image' => 'data:'.$mime.';base64,'.base64_encode($bytes)]]);
    }

    /** Turns an uploaded kit photo or mockup into an editable 3D design. */
    public function convert(Request $request, OpenAiDesigner $designer): JsonResponse
    {
        $data = $request->validate([
            'image' => ['required', 'string', 'max:12000000', 'regex:#^data:image/(png|jpeg|webp);base64,#'],
        ]);
        abort_unless(OpenAiDesigner::enabled(), 503, 'AI generation is not configured on this server.');
        set_time_limit(120);
        try {
            return response()->json(['data' => $designer->convert(
                $data['image'],
                array_column(config('catalog.sports'), 'id'),
                array_column(config('catalog.garments'), 'id'),
            )]);
        } catch (RuntimeException $e) {
            abort(502, $e->getMessage());
        }
    }

    /** Keeps a generated image in the user's private Assets. */
    private function store(Request $request, string $jpeg, string $type, string $name): array
    {
        $path = 'assets/'.$request->user()->id."/{$type}-".Str::uuid().'.jpg';
        Storage::disk('local')->put($path, $jpeg);
        $asset = $request->user()->assets()->create([
            'name' => mb_substr($name, 0, 120),
            'type' => $type,
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'size' => strlen($jpeg),
        ]);

        return ['asset' => $asset, 'image' => 'data:image/jpeg;base64,'.base64_encode($jpeg)];
    }
}
