<?php

namespace App\Http\Controllers;

use App\Services\OpenAiDesigner;
use App\Services\ProductMockup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use RuntimeException;

/** The Studio's "Mockup": studio product photos (front, back, 3/4) of the user's design, one view per call. */
class MockupController extends Controller
{
    private const IMAGE = ['required', 'string', 'max:12000000', 'regex:#^data:image/(png|jpeg|webp);base64,#'];

    private const JPEG = 'data:image/jpeg;base64,';

    public function generate(Request $request, OpenAiDesigner $designer): JsonResponse
    {
        $data = $request->validate([
            'front' => self::IMAGE,
            'back' => self::IMAGE,
            'view' => ['required', Rule::in(ProductMockup::VIEWS)],
            'background' => ['sometimes', Rule::in(array_keys(ProductMockup::BACKGROUNDS))],
            'sport' => ['required', 'string', 'max:40'],
            'garment' => ['required', 'string', 'max:40'],
            'logoText' => ['nullable', 'string', 'max:40'],
            'backName' => ['nullable', 'string', 'max:40'],
            'number' => ['nullable', 'string', 'max:3'],
            'colors' => ['sometimes', 'array', 'max:6'],
            'colors.*' => ['string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);
        abort_unless(OpenAiDesigner::enabled(), 503, 'AI generation is not configured on this server.');
        set_time_limit(300);
        $captures = match ($data['view']) {
            'back' => [$data['back'], $data['front']],
            'three-quarter' => [$data['front'], $data['back']],
            default => [$data['front']],
        };
        try {
            $jpeg = $designer->productMockup($captures, ProductMockup::prompt($data['view'], $data['background'] ?? 'light-grey', $data));
        } catch (RuntimeException $e) {
            abort(502, $e->getMessage());
        }

        return response()->json(['data' => ['view' => $data['view'], 'image' => self::JPEG.base64_encode($jpeg)]], 201);
    }

    /** "Save to my assets": keeps the chosen mockups in the user's private Assets. */
    public function save(Request $request): JsonResponse
    {
        $data = $request->validate([
            'images' => ['required', 'array', 'min:1', 'max:6'],
            'images.*.image' => ['required', 'string', 'max:12000000', 'starts_with:'.self::JPEG],
            'images.*.view' => ['required', Rule::in(ProductMockup::VIEWS)],
            'name' => ['nullable', 'string', 'max:100'],
        ]);
        $files = [];
        foreach ($data['images'] as $item) {
            $jpeg = base64_decode(substr($item['image'], strlen(self::JPEG)), true);
            abort_if($jpeg === false || ! str_starts_with($jpeg, "\xFF\xD8"), 422, 'The mockup picture could not be read.');
            $files[] = [$item['view'], $jpeg];
        }
        $assets = [];
        foreach ($files as [$view, $jpeg]) {
            $path = 'assets/'.$request->user()->id.'/mockup-'.Str::uuid().'.jpg';
            Storage::disk('local')->put($path, $jpeg);
            $assets[] = $request->user()->assets()->create([
                'name' => mb_substr(($data['name'] ?? null ?: 'Kit').' mockup · '.($view === 'three-quarter' ? '3/4' : $view), 0, 120),
                'type' => 'showcase',
                'path' => $path,
                'mime_type' => 'image/jpeg',
                'size' => strlen($jpeg),
            ]);
        }

        return response()->json(['data' => ['assets' => $assets]], 201);
    }
}
