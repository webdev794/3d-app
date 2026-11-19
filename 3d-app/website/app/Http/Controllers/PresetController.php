<?php

namespace App\Http\Controllers;

use App\Models\Preset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Preset designs (task 9.148). GET /presets: the 3DEEZI presets (everyone). GET /presets/mine: the signed-in
 * customer's own. POST /presets saves the current design as "my preset", or (team: true, admins and 3DEEZI TEAM
 * designers only) as a 3DEEZI preset. PATCH renames, DELETE removes: only the owner (3DEEZI ones: staff).
 */
class PresetController extends Controller
{
    public function index(): JsonResponse
    {
        if (! Preset::ready() || ! Preset::query()->whereNull('user_id')->exists()) {
            return response()->json(['data' => Preset::fileList()]);
        }

        return response()->json(['data' => Preset::query()->whereNull('user_id')->where('hidden', false)
            ->orderBy('sort')->orderBy('id')->get()->map->present()->values()]);
    }

    public function mine(Request $request): JsonResponse
    {
        if (! Preset::ready()) {
            return response()->json(['data' => []]);
        }

        return response()->json(['data' => Preset::query()->where('user_id', $request->user()->id)
            ->orderByDesc('id')->get()->map->present()->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless(Preset::ready(), 503, 'Presets are being set up. Please try again later.');
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['sometimes', 'nullable', 'string', 'max:300'],
            'design' => ['required', 'array'],
            'thumbnail' => ['sometimes', 'nullable', 'string', 'max:3000000', 'starts_with:data:image/'],
            'team' => ['sometimes', 'boolean'],
            'sport' => ['sometimes', 'nullable', 'string', 'max:40'],
        ]);
        $user = $request->user();
        $team = (bool) ($data['team'] ?? false);
        abort_if($team && ! self::staff($user), 403, 'Only 3DEEZI admins and team designers can save 3DEEZI presets.');
        abort_if(strlen((string) json_encode($data['design'])) > 4000000, 422, 'This design is too large to save as a preset.');
        abort_if(! $team && Preset::query()->where('user_id', $user->id)->count() >= 200, 422, 'You have 200 presets: delete one to save another.');
        $garment = $data['design']['garment'] ?? null;
        $preset = Preset::query()->create([
            'slug' => Preset::newSlug($team),
            'user_id' => $team ? null : $user->id,
            'name' => trim($data['name']),
            'description' => $data['description'] ?? null,
            'sport' => $data['sport'] ?? null,
            'garment' => is_string($garment) ? substr($garment, 0, 40) : null,
            'design' => $data['design'],
            'thumbnail' => $data['thumbnail'] ?? null,
            'sort' => $team ? ((int) Preset::query()->whereNull('user_id')->max('sort')) + 1 : 0,
        ]);

        return response()->json(['data' => $preset->present()], 201);
    }

    public function update(Request $request, Preset $preset): JsonResponse
    {
        $this->owns($request, $preset);
        $data = $request->validate(['name' => ['required', 'string', 'max:120']]);
        $preset->update(['name' => trim($data['name'])]);

        return response()->json(['data' => $preset->present()]);
    }

    public function destroy(Request $request, Preset $preset): JsonResponse
    {
        $this->owns($request, $preset);
        $preset->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    private function owns(Request $request, Preset $preset): void
    {
        $user = $request->user();
        abort_unless($preset->user_id === null ? self::staff($user) : $preset->user_id === $user->id, 404);
    }

    public static function staff($user): bool
    {
        return $user && ($user->is_admin || $user->is_designer);
    }
}
