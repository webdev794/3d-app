<?php

namespace App\Http\Controllers;

use App\Models\Asset;
use App\Services\OpenAiDesigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use RuntimeException;

class ConceptController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'prompt' => ['required', 'string', 'min:8', 'max:1500'],
            'sport' => ['required', Rule::in(array_column(config('catalog.sports'), 'id'))],
            'garment' => ['required', Rule::in(array_column(config('catalog.garments'), 'id'))],
            'colors' => ['sometimes', 'array', 'min:1', 'max:3'],
            'colors.*' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'reference_ids' => ['sometimes', 'array', 'max:6'],
            'reference_ids.*' => ['required', 'integer', 'distinct', Rule::exists('assets', 'id')->where('user_id', $request->user()->id)],
        ]);

        if (OpenAiDesigner::enabled()) {
            return $this->fromOpenAi($request, $data);
        }

        $colours = $data['colors'] ?? $this->coloursFrom($data['prompt']);
        $palette = array_replace(['#09121E', '#04D9E8', '#7757FF'], array_values($colours));
        $patterns = ['Chevron', 'Velocity', 'Stripes', 'Solid'];
        $brief = mb_strtolower($data['prompt']);
        foreach (['stripe' => 'Stripes', 'chevron' => 'Chevron', 'velocity' => 'Velocity', 'plain' => 'Solid', 'minimal' => 'Solid'] as $keyword => $pattern) {
            if (str_contains($brief, $keyword)) {
                $patterns = array_values(array_unique(array_merge([$pattern], $patterns)));
                break;
            }
        }

        $names = ['Match day', 'After dark', 'Team signature', 'Clean lines'];
        $concepts = [];
        foreach ($patterns as $index => $pattern) {
            $concepts[] = [
                'id' => substr(hash('sha256', $data['prompt'].$data['sport'].$data['garment'].$pattern.json_encode($palette)), 0, 16),
                'name' => $names[$index],
                'description' => $pattern.' pattern with a palette inspired by your brief.',
                'design' => [
                    'garment' => $data['garment'],
                    'main' => $palette[$index === 2 ? 1 : 0],
                    'secondary' => $palette[$index === 2 ? 0 : 1],
                    'accent' => $palette[2],
                    'pattern' => $pattern,
                    'logoText' => '3DEEZI',
                    'number' => '01',
                    'backName' => 'YOUR NAME',
                    'prompt' => $data['prompt'],
                ],
            ];
        }

        return response()->json(['data' => [
            'provider' => config('catalog.provider'),
            'concepts' => $concepts,
            'reference_ids' => $data['reference_ids'] ?? [],
            'reference_images_analyzed' => false,
        ]]);
    }

    private function fromOpenAi(Request $request, array $data): JsonResponse
    {
        set_time_limit(240);
        $sport = AiController::sportForAi($data['sport']);
        $garment = collect(config('catalog.garments'))->firstWhere('id', $data['garment'])['name'];
        $references = Asset::whereIn('id', $data['reference_ids'] ?? [])
            ->where('user_id', $request->user()->id)
            ->get()
            ->filter(fn (Asset $a) => Storage::disk('local')->exists($a->path))
            ->map(fn (Asset $a) => 'data:'.$a->mime_type.';base64,'.base64_encode(Storage::disk('local')->get($a->path)))
            ->values()
            ->all();
        try {
            $concepts = app(OpenAiDesigner::class)->concepts($data['prompt'], $sport, $garment, $references);
        } catch (RuntimeException $e) {
            abort(502, $e->getMessage());
        }
        // The designer gets the garment's display name for its prompt; saved designs need the catalog id.
        $concepts = array_map(fn (array $c) => array_replace_recursive($c, ['design' => ['garment' => $data['garment']]]), $concepts);

        return response()->json(['data' => [
            'provider' => OpenAiDesigner::provider(),
            'concepts' => $concepts,
            'reference_ids' => $data['reference_ids'] ?? [],
            'reference_images_analyzed' => count($references) > 0,
        ]]);
    }

    private function coloursFrom(string $prompt): array
    {
        $named = [
            'black' => '#09121E', 'white' => '#F3F5F8', 'cyan' => '#04D9E8',
            'turquoise' => '#16CDB8', 'teal' => '#10A9A3', 'navy' => '#132A50',
            'blue' => '#1479F3', 'purple' => '#7757FF', 'violet' => '#7757FF',
            'red' => '#EF4444', 'orange' => '#F98A26', 'yellow' => '#F7D544',
            'gold' => '#D9AE4F', 'green' => '#27BA78', 'pink' => '#F165AC',
            'grey' => '#8993A6', 'gray' => '#8993A6',
        ];
        $found = [];
        preg_match_all('/#[A-Fa-f0-9]{6}\b|\b('.implode('|', array_keys($named)).')\b/i', $prompt, $matches);
        foreach ($matches[0] as $match) {
            $colour = str_starts_with($match, '#') ? strtoupper($match) : $named[strtolower($match)];
            if (! in_array($colour, $found, true)) {
                $found[] = $colour;
            }
        }

        return array_slice($found, 0, 3);
    }
}
