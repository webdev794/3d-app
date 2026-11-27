<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * MODEL-PAINTER (admin tool, 2026-11-26; an internal extra, remove with model-painter/REMOVE.md): the hand-painted
 * colour-area maps of the ready-made 3D models, one per garment tile (model + tile name). Kept as plain files in
 * public/media/model-maps/ (index.json + <model>/<tile>.json), which the 3D viewer reads for designs from that tile.
 */
class ModelPainterController extends Controller
{
    private function dir(): string
    {
        return public_path('media/model-maps');
    }

    private function index(): array
    {
        $file = $this->dir().'/index.json';
        $json = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;

        return is_array($json) && is_array($json['maps'] ?? null) ? $json : ['maps' => []];
    }

    private function writeIndex(array $index): void
    {
        ksort($index['maps']);
        $this->put($this->dir().'/index.json', json_encode($index, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    private function put(string $file, string $text): void
    {
        $dir = dirname($file);
        if (! is_dir($dir) && ! @mkdir($dir, 0775, true) && ! is_dir($dir)) {
            abort(500, 'The folder public/media/model-maps could not be made: check the server lets the website write there.');
        }
        if (@file_put_contents($file.'.tmp', $text) === false || ! @rename($file.'.tmp', $file)) {
            abort(500, 'The map could not be written to public/media/model-maps: check the server lets the website write there.');
        }
    }

    /** A model that is on the viewer (its data file beside it). */
    private function model(Request $request): string
    {
        $model = (string) $request->input('model');
        abort_unless(preg_match('/^[a-z0-9-]{2,60}$/', $model) && is_file(public_path("media/viewer/tripo-{$model}.js")), 422, 'Unknown model.');

        return $model;
    }

    private function fileFor(string $model, string $tile): string
    {
        return $model.'/'.(Str::slug($tile) ?: 'tile').'-'.substr(md5($tile), 0, 6).'.json';
    }

    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->index()]);
    }

    public function save(Request $request): JsonResponse
    {
        $model = $this->model($request);
        $b64 = 'regex:/^[A-Za-z0-9+\/=]*$/';
        $data = $request->validate([
            'tile' => ['required', 'string', 'max:120'],
            'sport' => ['nullable', 'string', 'max:60'],
            'data' => ['required', 'array'],
            'data.count' => ['required', 'integer', 'min:1', 'max:200000'],
            'data.partKeys' => ['present', 'array', 'max:8'],
            'data.partKeys.*' => ['string', 'max:80'],
            'data.piece' => ['required', 'string', 'max:2000000', $b64],
            'data.pieceTri' => ['present', 'nullable', 'string', 'max:6000000', $b64],
            'data.triPart' => ['present', 'nullable', 'string', 'max:2000000', $b64],
            'data.areas' => ['nullable', 'array', 'max:8'],
            'data.areas.*' => ['string', 'max:80'],
        ]);
        abort_unless(strlen(base64_decode($data['data']['piece'])) === $data['data']['count'] * 3, 422, 'The map does not fit this model.');
        $map = [
            'id' => base_convert((string) (int) (microtime(true) * 1000), 10, 36),
            'model' => $model,
            'tile' => $data['tile'],
            'sport' => $data['sport'] ?? null,
            'count' => $data['data']['count'],
            'partKeys' => array_values($data['data']['partKeys']),
            'areas' => $data['data']['areas'] ?? null,
            'piece' => $data['data']['piece'],
            'pieceTri' => $data['data']['pieceTri'] ?? '',
            'triPart' => $data['data']['triPart'] ?? null,
            'savedAt' => now()->toIso8601String(),
            'savedBy' => $request->user()?->name,
        ];
        $file = $this->fileFor($model, $data['tile']);
        $this->put($this->dir().'/'.$file, json_encode($map, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        $index = $this->index();
        $index['maps']["{$model}|{$data['tile']}"] = $file;
        $this->writeIndex($index);

        return response()->json(['data' => ['file' => $file, 'id' => $map['id']]]);
    }

    /** Copy a tile's saved map to other tiles' names (the admin picks them; never automatic). */
    public function copy(Request $request): JsonResponse
    {
        $model = $this->model($request);
        $data = $request->validate(['tile' => ['required', 'string', 'max:120'], 'to' => ['required', 'array', 'max:100'], 'to.*' => ['string', 'max:120']]);
        $index = $this->index();
        $from = $index['maps']["{$model}|{$data['tile']}"] ?? null;
        abort_unless($from && is_file($this->dir().'/'.$from), 422, 'Save this map first, then copy it.');
        $map = json_decode((string) file_get_contents($this->dir().'/'.$from), true);
        foreach (array_unique($data['to']) as $tile) {
            if ($tile === $data['tile']) {
                continue;
            }
            $file = $this->fileFor($model, $tile);
            $copy = ['id' => base_convert((string) (int) (microtime(true) * 1000), 10, 36).substr(md5($tile), 0, 3), 'tile' => $tile, 'savedAt' => now()->toIso8601String(), 'copiedFrom' => $data['tile']] + $map;
            $this->put($this->dir().'/'.$file, json_encode($copy, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            $index['maps']["{$model}|{$tile}"] = $file;
        }
        $this->writeIndex($index);

        return response()->json(['data' => ['ok' => true]]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $model = $this->model($request);
        $tile = (string) $request->validate(['tile' => ['required', 'string', 'max:120']])['tile'];
        $index = $this->index();
        $file = $index['maps']["{$model}|{$tile}"] ?? null;
        if ($file) {
            unset($index['maps']["{$model}|{$tile}"]);
            $this->writeIndex($index);
            if (! in_array($file, $index['maps'], true) && is_file($this->dir().'/'.$file)) {
                @unlink($this->dir().'/'.$file);
            }
        }

        return response()->json(['data' => ['ok' => true]]);
    }
}
