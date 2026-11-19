<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Preset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Admin > Presets (task 9.148): the 3DEEZI presets, hidden ones too: rename, reorder, hide or show, sport and garment, delete. */
class PresetAdminController extends Controller
{
    public function index(): JsonResponse
    {
        abort_unless(Preset::ready(), 503, 'The presets table is not set up yet: run php artisan migrate --force.');

        return response()->json(['data' => Preset::query()->whereNull('user_id')->orderBy('sort')->orderBy('id')->get()->map->forAdmin()->values()]);
    }

    public function update(Request $request, Preset $preset): JsonResponse
    {
        abort_unless($preset->user_id === null, 404);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'description' => ['sometimes', 'nullable', 'string', 'max:300'],
            'hidden' => ['sometimes', 'boolean'],
            'sport' => ['sometimes', 'nullable', 'string', 'max:40'],
            'garment' => ['sometimes', 'nullable', 'string', 'max:40'],
        ]);
        $preset->update($data);

        return response()->json(['data' => $preset->forAdmin()]);
    }

    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate(['ids' => ['required', 'array', 'max:1000'], 'ids.*' => ['integer']]);
        DB::transaction(function () use ($data) {
            foreach (array_values($data['ids']) as $i => $id) {
                Preset::query()->whereNull('user_id')->whereKey($id)->update(['sort' => $i]);
            }
        });

        return $this->index();
    }

    public function destroy(Preset $preset): JsonResponse
    {
        abort_unless($preset->user_id === null, 404);
        $preset->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }
}
