<?php

namespace App\Http\Controllers;

use App\Models\Asset;
use App\Services\OpenAiDesigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
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
            'prompt' => ['required', 'string', 'min:8', 'max:2000'],
            'sport' => ['required', Rule::in(array_column(config('catalog.sports'), 'id'))],
            'garment' => ['required', Rule::in(array_column(config('catalog.garments'), 'id'))],
            'reference_ids' => ['sometimes', 'array', 'max:4'],
            'reference_ids.*' => ['required', 'integer', 'distinct', Rule::exists('assets', 'id')->where('user_id', $request->user()->id)],
        ]);
        abort_unless(OpenAiDesigner::enabled(), 503, 'AI generation is not configured on this server.');
        set_time_limit(330);
        $references = Asset::whereIn('id', $data['reference_ids'] ?? [])->where('user_id', $request->user()->id)->get()
            ->filter(fn (Asset $a) => Storage::disk('local')->exists($a->path))
            ->map(fn (Asset $a) => 'data:'.$a->mime_type.';base64,'.base64_encode(Storage::disk('local')->get($a->path)))
            ->values()->all();
        $sport = collect(config('catalog.sports'))->firstWhere('id', $data['sport'])['name'];
        $garment = collect(config('catalog.garments'))->firstWhere('id', $data['garment'])['name'];
        try {
            $jpeg = $designer->mockup($data['prompt'], $sport, $garment, $references);
        } catch (RuntimeException $e) {
            abort(502, $e->getMessage());
        }

        return response()->json(['data' => $this->store($request, $jpeg, 'mockup', 'AI mockup · '.mb_substr($data['prompt'], 0, 80))], 201);
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
