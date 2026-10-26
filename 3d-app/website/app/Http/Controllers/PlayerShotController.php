<?php

namespace App\Http\Controllers;

use App\Services\OpenAiDesigner;
use App\Services\PlayerShot;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use RuntimeException;

/** "See it on a player": the kit worn by a photoreal athlete; kept in Assets only when the user saves it. */
class PlayerShotController extends Controller
{
    private const IMAGE = ['string', 'max:12000000', 'regex:#^data:image/(png|jpeg|webp);base64,#'];

    public function make(Request $request, PlayerShot $shot): JsonResponse
    {
        $data = $request->validate([
            'images' => ['required', 'array', 'min:1', 'max:2'],
            'images.*' => ['required', ...self::IMAGE],
            'sport' => ['required', 'string', 'max:60'],
            'garment' => ['required', 'string', 'max:60'],
            'player' => ['sometimes', Rule::in(PlayerShot::PLAYERS)],
            'pose' => ['sometimes', Rule::in(array_keys(PlayerShot::POSES))],
            'colours' => ['sometimes', 'array', 'max:8'],
            'colours.*' => ['string', 'max:40'],
            'logoText' => ['nullable', 'string', 'max:40'],
            'backName' => ['nullable', 'string', 'max:40'],
            'number' => ['nullable', 'string', 'max:3'],
            // The user's own photo (about 10 MB at most); used for this request only, never stored.
            'person' => ['nullable', 'string', 'max:14000000', 'regex:#^data:image/(png|jpeg|webp);base64,#'],
        ], ['person.regex' => 'Choose a JPG, PNG or WebP photo.', 'person.max' => 'Choose a photo smaller than 10 MB.']);
        abort_unless(OpenAiDesigner::enabled(), 503, 'AI generation is not configured on this server.');
        set_time_limit(320);
        $person = $data['person'] ?? null;
        try {
            $isPerson = ! $person || $shot->isPerson($person);
        } catch (RuntimeException $e) {
            abort(502, $e->getMessage());
        }
        abort_unless($isPerson, 422, 'That photo does not show a person. Choose a photo of someone standing, with their upper body in view.');
        try {
            $jpeg = $shot->make($data['images'], $data, $person);
        } catch (RuntimeException $e) {
            abort(502, $e->getMessage());
        }

        return response()->json(['data' => [
            'image' => 'data:image/jpeg;base64,'.base64_encode($jpeg),
            'player' => PlayerShot::player($data['player'] ?? 'male', $data['garment']),
            'pose' => $data['pose'] ?? 'front',
        ]], 201);
    }

    public function save(Request $request): JsonResponse
    {
        $data = $request->validate([
            'image' => ['required', 'regex:#^data:image/jpeg;base64,#', 'max:12000000'],
            'name' => ['nullable', 'string', 'max:120'],
        ]);
        $jpeg = base64_decode(substr($data['image'], strlen('data:image/jpeg;base64,')), true);
        abort_unless($jpeg && str_starts_with($jpeg, "\xFF\xD8"), 422, 'The picture could not be read.');
        $path = 'assets/'.$request->user()->id.'/player-'.Str::uuid().'.jpg';
        Storage::disk('local')->put($path, $jpeg);
        $asset = $request->user()->assets()->create([
            'name' => mb_substr(($data['name'] ?: 'Kit').' on a player', 0, 120),
            'type' => 'showcase',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'size' => strlen($jpeg),
        ]);

        return response()->json(['data' => ['asset' => $asset]], 201);
    }
}
