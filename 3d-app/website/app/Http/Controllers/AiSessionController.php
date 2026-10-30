<?php

namespace App\Http\Controllers;

use App\Models\AiSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Recent designs (client 2026-10-30, like ChatGPT keeps your chats): each AI Designer brief with its four designs, saved
 * by the website or the app once the designs are in; the AI page lists the latest and reopens one with no new AI call.
 */
class AiSessionController extends Controller
{
    /** How many sessions an account keeps (the oldest go, with their pictures). */
    public const KEEP = 40;

    /** The strip: the latest sessions (small pictures inline) and the latest saved projects. */
    public function index(Request $request): JsonResponse
    {
        $limit = min(12, max(1, (int) $request->query('limit', 8)));
        $sessions = $request->user()->aiSessions()->latest('updated_at')->latest('id')->limit($limit)->get();

        return response()->json(['data' => [
            'sessions' => $sessions->map(fn (AiSession $s) => $this->summary($s))->values(),
            'projects' => $request->user()->projects()->latest('updated_at')->limit(4)->get(),
        ]]);
    }

    /** One session with its full pictures, to reopen YOUR DESIGNS. */
    public function show(Request $request, int $session): JsonResponse
    {
        $s = $this->owned($request, $session);
        $disk = Storage::disk('local');
        $refs = array_values(array_map('intval', $s->reference_ids ?? []));

        return response()->json(['data' => [
            ...$this->summary($s, false),
            // Pictures still in Assets only (a deleted logo is not sent to the AI again).
            'reference_ids' => $refs ? $request->user()->assets()->whereIn('id', $refs)->pluck('id')->all() : [],
            'options' => collect($s->options)->map(fn (array $o) => [
                ...collect($o)->except(['file', 'thumb', 'mime'])->all(),
                'image' => ! empty($o['file']) && $disk->exists($o['file'])
                    ? 'data:'.($o['mime'] ?? 'image/jpeg').';base64,'.base64_encode($disk->get($o['file'])) : null,
            ])->values(),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules(true));
        $s = new AiSession(collect($data)->except('options')->all());
        $s->user()->associate($request->user());
        $s->options = $this->options($request, $data['options'], []);
        $s->save();
        $this->prune($request);

        return response()->json(['data' => $this->summary($s)], 201);
    }

    /** Later changes (Make HD, Regenerate, Refine, Edit image): a design sent without its picture keeps the one saved. */
    public function update(Request $request, int $session): JsonResponse
    {
        $s = $this->owned($request, $session);
        $data = $request->validate($this->rules(false));
        $s->fill(collect($data)->except('options')->all());
        if (isset($data['options'])) {
            $s->options = $this->options($request, $data['options'], $s->options ?? []);
        }
        $s->updated_at = now();
        $s->save();

        return response()->json(['data' => $this->summary($s)]);
    }

    public function destroy(Request $request, int $session): JsonResponse
    {
        $this->owned($request, $session)->delete();

        return response()->json(null, 204);
    }

    private function rules(bool $creating): array
    {
        $need = $creating ? 'required' : 'sometimes';

        return [
            'prompt' => [$need, 'string', 'min:1', 'max:4000'],
            'sport' => ['nullable', 'string', 'max:60'],
            'garment' => ['nullable', 'string', 'max:60'],
            'source' => ['sometimes', Rule::in(['web', 'app'])],
            'reference_ids' => ['sometimes', 'nullable', 'array', 'max:4'],
            'reference_ids.*' => ['integer'],
            'options' => [$need, 'array', 'min:1', 'max:4'],
            'options.*.image' => [$creating ? 'required' : 'nullable', 'string', 'max:12000000', 'regex:#^data:image/(png|jpeg|webp);base64,#'],
            'options.*.name' => ['nullable', 'string', 'max:120'],
            'options.*.description' => ['nullable', 'string', 'max:2000'],
            'options.*.quality' => ['nullable', Rule::in(['high', 'medium'])],
            'options.*.view' => ['nullable', Rule::in(['presentation', 'front'])],
            'options.*.motif' => ['nullable', 'string', 'max:600'],
            'options.*.direction' => ['nullable', 'array'],
            'options.*.design' => ['nullable', 'array'],
            'options.*.spec' => ['nullable', 'array'],
        ];
    }

    /** The designs as kept: each picture a file with a small copy for the strip; an unchanged picture keeps its file. */
    private function options(Request $request, array $sent, array $saved): array
    {
        $disk = Storage::disk('local');
        $dir = 'ai-sessions/'.$request->user()->id;
        $out = [];
        // Validation can reorder the list (a design with a new picture first): keep the order sent.
        ksort($sent);
        foreach (array_values($sent) as $i => $o) {
            $was = $saved[$i] ?? [];
            $keep = collect($o)->only(['name', 'description', 'quality', 'view', 'motif', 'direction', 'design', 'spec'])->all();
            if (! empty($o['image'])) {
                $url = $o['image'];
                $mime = substr($url, 5, strpos($url, ';') - 5);
                $bytes = (string) base64_decode(substr($url, strpos($url, ',') + 1), true);
                if ($bytes === '' || ! @getimagesizefromstring($bytes)) {
                    abort(422, 'A design picture could not be read.');
                }
                $disk->delete(array_filter([$was['file'] ?? null, $was['thumb'] ?? null]));
                $base = $dir.'/'.Str::uuid();
                $ext = ['image/png' => 'png', 'image/webp' => 'webp'][$mime] ?? 'jpg';
                $file = "{$base}.{$ext}";
                $disk->put($file, $bytes);
                $thumb = $this->thumb($bytes);
                if ($thumb !== null) {
                    $disk->put($base.'-t.jpg', $thumb);
                }
                $out[] = [...$keep, 'file' => $file, 'thumb' => $thumb !== null ? $base.'-t.jpg' : null, 'mime' => $mime];
            } elseif (! empty($was['file'])) {
                $out[] = [...$keep, 'file' => $was['file'], 'thumb' => $was['thumb'] ?? null, 'mime' => $was['mime'] ?? 'image/jpeg'];
            }
        }
        // Designs no longer sent lose their pictures.
        foreach (array_slice($saved, count($out)) as $gone) {
            $disk->delete(array_filter([$gone['file'] ?? null, $gone['thumb'] ?? null]));
        }
        abort_if($out === [], 422, 'Send at least one design picture.');

        return $out;
    }

    /** A small JPEG for the strip (GD); null when the picture cannot be read. */
    private function thumb(string $bytes): ?string
    {
        if (! function_exists('imagecreatefromstring')) {
            return null;
        }
        $src = @imagecreatefromstring($bytes);
        if (! $src) {
            return null;
        }
        $w = imagesx($src);
        $h = imagesy($src);
        $scale = min(1, 240 / max($w, $h));
        $tw = max(1, (int) round($w * $scale));
        $th = max(1, (int) round($h * $scale));
        $dst = imagecreatetruecolor($tw, $th);
        imagefill($dst, 0, 0, imagecolorallocate($dst, 11, 16, 22));
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $tw, $th, $w, $h);
        ob_start();
        imagejpeg($dst, null, 78);
        $jpeg = (string) ob_get_clean();
        imagedestroy($src);
        imagedestroy($dst);

        return $jpeg;
    }

    private function summary(AiSession $s, bool $thumbs = true): array
    {
        $disk = Storage::disk('local');

        return [
            'id' => $s->id,
            'prompt' => $s->prompt,
            'sport' => $s->sport,
            'garment' => $s->garment,
            'source' => $s->source,
            'count' => count($s->options ?? []),
            'names' => array_map(fn ($o) => $o['name'] ?? null, $s->options ?? []),
            'thumbs' => $thumbs ? array_map(fn ($o) => ! empty($o['thumb']) && $disk->exists($o['thumb'])
                ? 'data:image/jpeg;base64,'.base64_encode($disk->get($o['thumb'])) : null, $s->options ?? []) : null,
            'created_at' => $s->created_at,
            'updated_at' => $s->updated_at,
        ];
    }

    private function owned(Request $request, int $id): AiSession
    {
        return $request->user()->aiSessions()->findOrFail($id);
    }

    private function prune(Request $request): void
    {
        $request->user()->aiSessions()->latest('updated_at')->latest('id')->skip(self::KEEP)->take(100)->get()->each->delete();
    }
}
