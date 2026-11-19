<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A new model setting never stops a feature that worked before: when OpenAI turns down the model or one of its
 * parameters, the call is retried once with the known-good model (gpt-image-2 / gpt-6-luna) and a warning is logged.
 * A content refusal is not retried. OpenAI is faked.
 */
class AiModelFallbackTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    private static function model(Request $r): ?string
    {
        return str_ends_with($r->url(), '/responses') ? $r['model'] : (preg_match('/name="model"(?:\r\n[^\r\n]+)*\r\n\r\n([\w.\-]+)/', $r->body(), $m) ? $m[1] : null);
    }

    public function test_an_image_model_that_is_turned_down_falls_back_to_gpt_image_2(): void
    {
        Storage::fake('local');
        Log::spy();
        config(['services.openai.key' => 'sk-test', 'services.openai.image_model' => 'gpt-image-9-nova']);
        Http::fake(['api.openai.com/v1/images/*' => Http::sequence()
            ->push(['error' => ['message' => 'The model `gpt-image-9-nova` does not exist or you do not have access to it.', 'code' => 'model_not_found']], 404)
            ->push(['data' => [['b64_json' => self::PNG]]])]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/v1/ai/designs/render', ['prompt' => 'A navy BLITZ rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey', 'rank' => 2, 'direction' => ['front' => 'x']])
            ->assertCreated();
        $edits = Http::recorded()->map(fn ($pair) => $pair[0])->values();
        $this->assertSame(['gpt-image-9-nova', 'gpt-image-2'], $edits->map(fn ($r) => self::model($r))->all());
        // gpt-image-2 with its own parameters: input_fidelity included.
        $this->assertStringContainsString('name="input_fidelity"', $edits[1]->body());
        Log::shouldHaveReceived('warning')->once()->withArgs(fn ($message) => str_contains($message, 'gpt-image-9-nova') && str_contains($message, 'gpt-image-2'));
    }

    public function test_a_text_model_that_is_turned_down_falls_back_to_gpt_6_luna(): void
    {
        Log::spy();
        config(['services.openai.key' => 'sk-test', 'services.openai.text_model' => 'gpt-6-luna', 'services.openai.planning_model' => 'gpt-7-nope']);
        $plan = ['brief' => ['designName' => 'Brief', 'summary' => 'S', 'mainColor' => '#000000', 'secondaryColor' => '#111111', 'accentColor' => '#ffffff', 'pattern' => 'Velocity', 'logoText' => 'BLITZ', 'patternMotif' => 'm'],
            'directions' => [['designName' => 'A', 'summary' => 'S', 'mainColor' => '#000000', 'secondaryColor' => '#111111', 'accentColor' => '#ffffff', 'pattern' => 'Velocity', 'logoText' => 'BLITZ', 'patternMotif' => 'm', 'score' => 80, 'palette' => 'p', 'theme' => 't', 'front' => 'f', 'back' => 'b', 'graphics' => 'g', 'trims' => 'tr']]];
        Http::fake(['api.openai.com/v1/responses' => Http::sequence()
            ->push(['error' => ['message' => "Invalid value for 'model': 'gpt-7-nope'.", 'param' => 'model', 'code' => 'invalid_value']], 400)
            ->push(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode($plan)]]]]])]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/v1/ai/designs', ['prompt' => 'A navy BLITZ rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey'])
            ->assertOk()->assertJsonPath('data.planned', true)->assertJsonPath('data.directions.1.name', 'A');
        $this->assertSame(['gpt-7-nope', 'gpt-6-luna'], Http::recorded()->map(fn ($pair) => self::model($pair[0]))->values()->all());
        Log::shouldHaveReceived('warning')->once();
    }

    public function test_a_content_refusal_is_not_retried_with_another_model(): void
    {
        Storage::fake('local');
        Log::spy();
        config(['services.openai.key' => 'sk-test', 'services.openai.image_model' => 'gpt-image-2.5-flare']);
        Http::fake(['api.openai.com/v1/images/*' => Http::response(['error' => ['message' => 'Your request was rejected by the safety system.', 'code' => 'moderation_blocked']], 400)]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/v1/ai/designs/render', ['prompt' => 'A navy BLITZ rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey', 'rank' => 2, 'direction' => ['front' => 'x']])
            ->assertStatus(502);
        Http::assertSentCount(1);
        Log::shouldNotHaveReceived('warning');
    }

    public function test_the_known_good_model_itself_is_not_retried(): void
    {
        Log::spy();
        config(['services.openai.key' => 'sk-test', 'services.openai.image_model' => 'gpt-image-2']);
        Http::fake(['api.openai.com/v1/images/*' => Http::response(['error' => ['message' => "Unknown parameter: 'quality'.", 'code' => 'unknown_parameter']], 400)]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/v1/ai/pattern', ['motif' => 'lightning bolts'])->assertStatus(502);
        Http::assertSentCount(1);
        Log::shouldNotHaveReceived('warning');
    }
}
