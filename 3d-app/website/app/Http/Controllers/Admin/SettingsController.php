<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Services\OpenAiDesigner;
use App\Support\OrderDelivery;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/** Admin: the OpenAI connection, editable without a server terminal. */
class SettingsController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->state()]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'openai_key' => ['sometimes', 'nullable', 'string', 'max:300', 'regex:/^sk-[A-Za-z0-9_\-]{20,}$/'],
            'clear_key' => ['sometimes', 'boolean'],
            'openai_text_model' => ['sometimes', 'nullable', 'string', 'max:80', 'regex:/^[A-Za-z0-9._\-]+$/'],
            'openai_image_model' => ['sometimes', 'nullable', 'string', 'max:80', 'regex:/^[A-Za-z0-9._\-]+$/'],
            'openai_planning_model' => ['sometimes', 'nullable', 'string', 'max:80', 'regex:/^[A-Za-z0-9._\-]+$/'],
            'openai_hd_image_model' => ['sometimes', 'nullable', 'string', 'max:80', 'regex:/^[A-Za-z0-9._\-]+$/'],
            'production_lead_weeks' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:52'],
        ], ['openai_key.regex' => 'That does not look like an OpenAI API key (it starts with sk-).',
            'production_lead_weeks.integer' => 'Give the production lead time in whole weeks.', 'production_lead_weeks.max' => 'The production lead time can be up to 52 weeks.']);
        if (array_key_exists('production_lead_weeks', $data)) {
            Setting::put(OrderDelivery::LEAD_WEEKS_SETTING, $data['production_lead_weeks'] === null ? null : (string) $data['production_lead_weeks']);
        }

        if ($request->boolean('clear_key')) {
            Setting::put('openai_key', null);
        } elseif (filled($data['openai_key'] ?? null)) {
            Setting::put('openai_key', trim($data['openai_key']));
        }
        foreach (['openai_text_model', 'openai_image_model', 'openai_planning_model', 'openai_hd_image_model'] as $key) {
            if (array_key_exists($key, $data)) {
                Setting::put($key, $data[$key]);
            }
        }
        // Use the new values for this request's response too.
        config(['services.openai.key' => env('OPENAI_API_KEY'), 'services.openai.text_model' => env('OPENAI_TEXT_MODEL', 'gpt-6-luna'), 'services.openai.image_model' => env('OPENAI_IMAGE_MODEL', 'gpt-image-2'), 'services.openai.planning_model' => env('OPENAI_PLANNING_MODEL'), 'services.openai.hd_image_model' => env('OPENAI_HD_IMAGE_MODEL')]);
        Setting::applyToConfig();

        return response()->json(['data' => $this->state()]);
    }

    /** Checks the key with a cheap call that lists the available models. */
    public function test(): JsonResponse
    {
        if (! OpenAiDesigner::enabled()) {
            return response()->json(['data' => ['ok' => false, 'message' => 'No OpenAI key is set.']]);
        }
        try {
            $response = Http::withToken((string) config('services.openai.key'))->timeout(20)->acceptJson()->get('https://api.openai.com/v1/models');
        } catch (ConnectionException) {
            return response()->json(['data' => ['ok' => false, 'message' => 'The server could not reach OpenAI.']]);
        }
        if ($response->failed()) {
            return response()->json(['data' => ['ok' => false, 'message' => $response->status() === 401 ? 'OpenAI rejected this key.' : 'OpenAI error: '.($response->json('error.message') ?? $response->status())]]);
        }
        $models = collect($response->json('data', []))->pluck('id');
        $missing = collect([config('services.openai.text_model'), config('services.openai.image_model'), OpenAiDesigner::planningModel(), OpenAiDesigner::hdImageModel()])->unique()->reject(fn ($m) => $models->contains($m))->values();

        return response()->json(['data' => [
            'ok' => $missing->isEmpty(),
            'message' => $missing->isEmpty() ? 'Connected. All the models are available on this key.' : 'Connected, but this key cannot use: '.$missing->implode(', '),
        ]]);
    }

    private function state(): array
    {
        $key = (string) config('services.openai.key');

        return [
            'configured' => $key !== '',
            'source' => Setting::has('openai_key') ? 'admin panel' : ($key !== '' ? '.env file' : 'none'),
            'masked_key' => $key === '' ? null : substr($key, 0, 7).'…'.substr($key, -4),
            'text_model' => config('services.openai.text_model'),
            'image_model' => config('services.openai.image_model'),
            // Empty: the text model plans designs and the image model renders HD.
            'planning_model' => config('services.openai.planning_model') ?: null,
            'hd_image_model' => config('services.openai.hd_image_model') ?: null,
            // Orders: the usual production and delivery time (Upload Your Order and the order form warn before it).
            'production_lead_weeks' => OrderDelivery::leadWeeks(),
        ];
    }
}
