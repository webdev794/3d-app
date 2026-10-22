<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\OpenAiDesigner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The AI designer's results (client visual 2026-10-21, images/138.jpg): one planning call gives four ranked design
 * directions; #1 is rendered HD as the PRIMARY, #2-4 as medium previews, each with the client's logo as an image input.
 * OpenAI is faked: no real calls are made.
 */
class AiDesignsTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    /** The brief's kit spec and three alternatives; the AI scores the second alternative highest, then the third, then the first. */
    private function plan(): array
    {
        $scores = [61, 94, 70];
        $names = ['Plain Stripe', 'Voltage Strike', 'Night Shards'];
        $kit = fn (string $name) => ['designName' => $name, 'summary' => "I'll create {$name} for BLITZ.", 'mainColor' => '#0a0c12', 'secondaryColor' => '#1e5bff', 'accentColor' => '#ffffff', 'pattern' => 'Velocity', 'logoText' => 'blitz', 'patternMotif' => "motif {$name}"];

        return [
            'brief' => $kit('Blitz Brief'),
            'directions' => array_map(fn (int $i) => [
                ...$kit($names[$i]),
                'score' => $scores[$i],
                'pattern' => $i === 2 ? 'Zigzag' : 'Velocity',
                'palette' => 'electric blue #1E5BFF, black #0A0C12, white #FFFFFF',
                'theme' => "theme {$i}: speed and lightning",
                'front' => "FRONT-{$i}: black body, the mascot logo large on the chest",
                'back' => 'BLITZ over a big 01',
                'graphics' => 'jagged lightning bolts',
                'trims' => 'electric blue binding',
                'bodyColour' => ['black #0A0C12', 'white #FFFFFF', 'electric blue #1E5BFF'][$i],
                'layout' => ['all-over graphics', 'diagonal sash', 'hoops'][$i],
            ], range(0, 2)),
        ];
    }

    private function fake(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake([
            'api.openai.com/v1/responses' => Http::response(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode($this->plan())]]]]]),
            'api.openai.com/v1/images/*' => Http::response(['data' => [['b64_json' => self::PNG]]]),
        ]);
    }

    /** @return array{0: User, 1: int} */
    private function userWithLogo(): array
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        Storage::disk('local')->put('assets/'.$user->id.'/blitz.png', base64_decode(self::PNG));
        $logo = $user->assets()->create(['name' => 'BLITZ', 'type' => 'reference', 'path' => 'assets/'.$user->id.'/blitz.png', 'mime_type' => 'image/png', 'size' => 68]);

        return [$user, $logo->id];
    }

    public function test_one_planning_call_gives_the_primary_spec_and_three_ranked_alternatives(): void
    {
        Storage::fake('local');
        $this->fake();
        [, $logo] = $this->userWithLogo();

        $response = $this->postJson('/api/v1/ai/designs', ['prompt' => 'Cool training singlets using this logo', 'sport' => 'rugby-league', 'garment' => 'singlet', 'reference_ids' => [$logo]])
            ->assertOk()->assertJsonCount(4, 'data.directions')->assertJsonPath('data.planned', true);

        // #1 is the brief as written (already rendering); the alternatives are ranked by the AI's scores: 94, 70, 61.
        $this->assertSame(['Blitz Brief', 'Voltage Strike', 'Night Shards', 'Plain Stripe'], array_column($response->json('data.directions'), 'name'));
        $this->assertSame([1, 2, 3, 4], array_column($response->json('data.directions'), 'rank'));
        $this->assertSame([0, 94, 70, 61], array_column($response->json('data.directions'), 'score'));
        $response->assertJsonPath('data.directions.0.direction', ['ownDesign' => false])
            ->assertJsonPath('data.directions.1.direction.front', 'FRONT-1: black body, the mascot logo large on the chest')
            ->assertJsonPath('data.summary', "I'll create Blitz Brief for BLITZ.")
            ->assertJsonPath('data.directions.0.design.garment', 'singlet')
            ->assertJsonPath('data.directions.0.design.logoText', 'BLITZ')
            ->assertJsonPath('data.directions.1.design.main', '#0A0C12')
            ->assertJsonPath('data.directions.2.design.pattern', 'Chevron')
            ->assertJsonPath('data.directions.1.motif', 'motif Voltage Strike');

        // One short call, not four: the planner saw the logo itself and was asked for scored alternatives under the brand rules.
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/responses')
            && str_contains(json_encode($r->data(), JSON_UNESCAPED_SLASHES), 'data:image/png;base64,')
            && str_contains(json_encode($r->data()), 'design_directions')
            && str_contains(json_encode($r->data()), 'exactly 3 clearly different alternative design directions')
            && str_contains(json_encode($r->data()), 'brief fit, logo fit, boldness and readability')
            && str_contains(json_encode($r->data()), 'Be quick and brief')
            && str_contains(json_encode($r->data()), 'keep the client\'s logo, mascot and lettering exactly as supplied')
            && str_contains(json_encode($r->data()), 'never from skin tones'));
    }

    public function test_a_failed_or_slow_plan_falls_back_to_ready_made_designs(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/v1/responses' => Http::response(['error' => ['message' => 'Server busy']], 500)]);
        Sanctum::actingAs(User::factory()->create());

        $response = $this->postJson('/api/v1/ai/designs', ['prompt' => 'A navy MANTIS rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey'])
            ->assertOk()->assertJsonCount(4, 'data.directions')->assertJsonPath('data.planned', false)
            ->assertJsonPath('data.directions.0.direction', ['ownDesign' => false])
            ->assertJsonPath('data.directions.0.design.garment', 'jersey');
        $this->assertStringStartsWith('bold and aggressive', $response->json('data.directions.1.direction.theme'));
    }

    public function test_all_four_render_medium_by_default_and_hd_on_request_with_the_logo_as_an_image(): void
    {
        Storage::fake('local');
        $this->fake();
        [$user, $logo] = $this->userWithLogo();
        $brief = ['prompt' => 'Cool training singlets using this logo', 'sport' => 'rugby-league', 'garment' => 'singlet', 'reference_ids' => [$logo]];
        $directions = $this->postJson('/api/v1/ai/designs', $brief)->json('data.directions');

        foreach ($directions as $d) {
            $this->postJson('/api/v1/ai/designs/render', [...$brief, 'rank' => $d['rank'], 'direction' => $d['direction'], 'name' => $d['name']])
                ->assertCreated()->assertJsonPath('data.quality', 'medium')->assertJsonPath('data.rank', $d['rank'])->assertJsonPath('data.asset', null);
        }
        // "HD primary" on, or "Make HD": the same design in high quality, kept in Assets.
        $this->postJson('/api/v1/ai/designs/render', [...$brief, 'rank' => 1, 'quality' => 'high', 'direction' => $directions[0]['direction']])
            ->assertCreated()->assertJsonPath('data.quality', 'high')->assertJsonPath('data.asset.type', 'mockup');

        $edits = Http::recorded(fn (Request $r) => str_ends_with($r->url(), '/images/edits'))->map(fn ($pair) => $pair[0]->body())->values();
        $this->assertCount(5, $edits);
        $quality = fn (string $body) => preg_match('/name="quality"(?:\r\n[^\r\n]+)*\r\n\r\n(\w+)/', $body, $m) ? $m[1] : null;
        $this->assertSame(['medium', 'medium', 'medium', 'medium', 'high'], $edits->map($quality)->all());
        // #1 is the brief under the full design rules; #2 the best alternative (Voltage Strike, FRONT-1).
        $this->assertStringNotContainsString('Creative direction', $edits[0]);
        $this->assertStringContainsString('- Front: FRONT-1: black body', $edits[1]);
        $this->assertStringContainsString('- Front: FRONT-2: black body', $edits[2]);
        foreach ($edits as $i => $body) {
            $this->assertSame(2, substr_count($body, 'name="image[]"'));
            // All four and Make HD: front and back side by side in one tall picture (YOUR DESIGNS, 146.jpg).
            $this->assertStringContainsString(OpenAiDesigner::PORTRAIT, $body);
            $this->assertStringContainsString('tall portrait image (2:3)', $body);
            $this->assertStringContainsString('the front view on the left and the back view on the right', $body);
            $this->assertStringContainsString('only for the small neck label', $body);
            $this->assertStringContainsString('fully sublimated all-over design', $body);
            $this->assertStringContainsString('name="input_fidelity"', $body);
        }
        $this->assertSame(1, $user->assets()->where('type', 'mockup')->count());
    }

    public function test_the_alternatives_get_different_body_colours_and_layouts(): void
    {
        Storage::fake('local');
        $this->fake();
        [, $logo] = $this->userWithLogo();
        $brief = ['prompt' => 'Cool training singlets using this logo', 'sport' => 'rugby-league', 'garment' => 'singlet', 'reference_ids' => [$logo]];
        $directions = $this->postJson('/api/v1/ai/designs', $brief)->assertOk()->json('data.directions');

        // The planner is told to vary body colour, layout and boldness, with the dark body for the brief's design only.
        Http::assertSent(fn (Request $r) => str_contains($json = json_encode($r->data()), 'alternative A has a different main body colour')
            && str_contains($json, 'alternative B has a different layout: bold panels, a diagonal sash, hoops or stripes')
            && str_contains($json, 'alternative C is clearly bolder or clearly more minimal')
            && str_contains($json, 'applies to the brief\'s design only')
            && str_contains($json, '"bodyColour"') && str_contains($json, '"diagonal sash"'));
        // Ranked 94 (white, sash), 70 (blue, hoops), 61 (black, all-over): each keeps its own colour and layout.
        $this->assertSame(['white #FFFFFF', 'electric blue #1E5BFF', 'black #0A0C12'], array_map(fn ($d) => $d['direction']['body'], array_slice($directions, 1)));
        $this->assertSame(['diagonal sash', 'hoops', 'all-over graphics'], array_map(fn ($d) => $d['direction']['layout'], array_slice($directions, 1)));
        $this->assertCount(3, array_unique(array_map(fn ($d) => $d['direction']['body'].$d['direction']['layout'], array_slice($directions, 1))));

        // A white sash option: its own body colour and layout, no dark-body rule, the logo kept exactly.
        $this->postJson('/api/v1/ai/designs/render', [...$brief, 'rank' => 2, 'direction' => $directions[1]['direction']])->assertCreated()->assertJsonPath('data.view', 'presentation');
        $body = Http::recorded(fn (Request $r) => str_ends_with($r->url(), '/images/edits'))->last()[0]->body();
        $this->assertStringContainsString('- Body colour: white #FFFFFF', $body);
        $this->assertStringContainsString('- Layout: diagonal sash', $body);
        $this->assertStringContainsString('Follow the layout in the creative direction (diagonal sash)', $body);
        $this->assertStringNotContainsString('prefer a dark body', $body);
        $this->assertStringContainsString('keep the client\'s logo, mascot and lettering exactly as supplied', $body);
        // The PRIMARY (the brief as written) keeps the dark body preference.
        $this->postJson('/api/v1/ai/designs/render', [...$brief, 'rank' => 1, 'direction' => ['ownDesign' => false]])->assertCreated()->assertJsonPath('data.view', 'presentation');
        $this->assertStringContainsString('prefer a dark body', Http::recorded(fn (Request $r) => str_ends_with($r->url(), '/images/edits'))->last()[0]->body());
    }

    public function test_make_it_3d_from_a_front_only_option_designs_the_back_to_match(): void
    {
        Storage::fake('local');
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/v1/images/*' => Http::response(['data' => [['b64_json' => self::PNG]]])]);
        Sanctum::actingAs(User::factory()->create());
        $sheet = ['image' => 'data:image/jpeg;base64,'.self::PNG, 'sport' => 'rugby-league', 'garment' => 'singlet', 'name' => 'Blitz'];

        $this->postJson('/api/v1/ai/print-sheet', [...$sheet, 'front_only' => true])->assertCreated();
        $this->postJson('/api/v1/ai/print-sheet', $sheet)->assertCreated();
        $bodies = Http::recorded()->map(fn ($pair) => $pair[0]->body())->values();
        $this->assertStringContainsString('The picture shows the front only: draw the front exactly and design the back to match it', $bodies[0]);
        $this->assertStringNotContainsString('front only', $bodies[1]);
        foreach ($bodies as $body) {
            $this->assertStringContainsString('front on the left and its back on the right', $body);
        }
    }

    public function test_a_full_kit_stands_as_worn_and_a_size_error_falls_back_to_landscape_once(): void
    {
        Storage::fake('local');
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/v1/images/*' => Http::sequence()
            ->push(['error' => ['message' => "Invalid value: '1024x1536'. Supported values are: '1024x1024', '1536x1024', and 'auto'.", 'param' => 'size', 'code' => 'invalid_value']], 400)
            ->push(['data' => [['b64_json' => self::PNG]]])]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/v1/ai/designs/render', ['prompt' => 'A navy BLITZ rugby league full kit', 'sport' => 'rugby-league', 'garment' => 'fullkit', 'rank' => 2, 'direction' => ['front' => 'Navy body', 'ownDesign' => false]])
            ->assertCreated()->assertJsonPath('data.view', 'presentation');
        $bodies = Http::recorded()->map(fn ($pair) => $pair[0]->body())->values();
        $this->assertCount(2, $bodies, 'one portrait try, then landscape once');
        $this->assertStringContainsString(OpenAiDesigner::PORTRAIT, $bodies[0]);
        $this->assertStringContainsString('the top with its shorts directly below it', $bodies[0]);
        $this->assertStringContainsString('1536x1024', $bodies[1]);
        $this->assertStringContainsString('one landscape image', $bodies[1]);
        $this->assertStringNotContainsString('tall portrait', $bodies[1]);
    }

    public function test_another_error_is_not_retried_in_landscape(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/v1/images/*' => Http::response(['error' => ['message' => 'Your request was rejected by the safety system.', 'code' => 'moderation_blocked']], 400)]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/v1/ai/designs/render', ['prompt' => 'A navy BLITZ rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey', 'rank' => 1, 'direction' => ['ownDesign' => false]])->assertStatus(502);
        Http::assertSentCount(1);
    }

    public function test_make_hd_renders_an_option_in_high_quality(): void
    {
        Storage::fake('local');
        $this->fake();
        [$user] = $this->userWithLogo();

        $this->postJson('/api/v1/ai/designs/render', ['prompt' => 'A navy BLITZ rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey', 'rank' => 3, 'quality' => 'high', 'direction' => ['front' => 'Navy body', 'ownDesign' => false]])
            ->assertCreated()->assertJsonPath('data.quality', 'high')->assertJsonPath('data.asset.type', 'mockup');
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/images/edits') && preg_match('/name="quality"(?:\r\n[^\r\n]+)*\r\n\r\nhigh/', $r->body()) === 1);
        $this->assertSame(1, $user->assets()->where('type', 'mockup')->count());
    }

    public function test_designs_need_a_login_a_key_and_a_valid_request(): void
    {
        $this->postJson('/api/v1/ai/designs', ['prompt' => 'A navy rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey'])->assertUnauthorized();
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/ai/designs', ['prompt' => 'A navy rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey'])->assertStatus(503);
        $this->fake();
        $this->postJson('/api/v1/ai/designs/render', ['prompt' => 'A navy rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey', 'rank' => 5, 'direction' => ['front' => 'x']])->assertUnprocessable()->assertJsonValidationErrors('rank');
        $this->postJson('/api/v1/ai/designs/render', ['prompt' => 'A navy rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey', 'rank' => 2, 'quality' => 'low', 'direction' => ['front' => 'x']])->assertJsonValidationErrors('quality');
        $this->postJson('/api/v1/ai/designs/render', ['prompt' => 'A navy rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey', 'rank' => 2])->assertJsonValidationErrors('direction');
        Http::assertNothingSent();
    }

    public function test_planning_and_hd_models_are_separate_settings_with_fallbacks(): void
    {
        Storage::fake('local');
        $this->fake();
        config(['services.openai.text_model' => 'gpt-6-luna', 'services.openai.image_model' => 'gpt-image-2', 'services.openai.planning_model' => null, 'services.openai.hd_image_model' => null]);
        $brief = ['prompt' => 'A navy BLITZ rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey'];
        $model = fn (Request $r) => str_ends_with($r->url(), '/responses') ? $r['model'] : (preg_match('/name="model"(?:\r\n[^\r\n]+)*\r\n\r\n([\w.\-]+)/', $r->body(), $m) ? $m[1] : null);
        $models = fn () => Http::recorded()->map(fn ($pair) => $model($pair[0]))->values()->all();

        // Not set: planning on the text model, HD on the image model.
        $admin = User::factory()->create();
        $admin->is_admin = true;
        $admin->save();
        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/ai/designs', $brief)->assertOk();
        $this->postJson('/api/v1/ai/designs/render', [...$brief, 'rank' => 1, 'quality' => 'high', 'direction' => ['ownDesign' => false]])->assertCreated();
        $this->assertSame(['gpt-6-luna', 'gpt-image-2'], $models());

        // Admin › Settings: a planning model and an HD image model; the ASSIST chat and medium renders keep theirs.
        $this->putJson('/api/v1/admin/settings', ['openai_planning_model' => 'gpt-6.1-sol', 'openai_hd_image_model' => 'gpt-image-2.5-sunburst'])
            ->assertOk()->assertJsonPath('data.planning_model', 'gpt-6.1-sol')->assertJsonPath('data.hd_image_model', 'gpt-image-2.5-sunburst')
            ->assertJsonPath('data.text_model', 'gpt-6-luna')->assertJsonPath('data.image_model', 'gpt-image-2');
        $this->putJson('/api/v1/admin/settings', ['openai_planning_model' => 'bad model!'])->assertJsonValidationErrors('openai_planning_model');
        // (Saving settings re-reads the key from .env, empty in tests.)
        config(['services.openai.key' => 'sk-test', 'services.openai.planning_model' => null, 'services.openai.hd_image_model' => null]);
        \App\Models\Setting::applyToConfig();
        $this->assertSame('gpt-6.1-sol', \App\Services\OpenAiDesigner::planningModel());
        $this->assertSame('gpt-image-2.5-sunburst', \App\Services\OpenAiDesigner::hdImageModel());

        $this->postJson('/api/v1/ai/designs', $brief)->assertOk();
        $this->postJson('/api/v1/ai/designs/render', [...$brief, 'rank' => 2, 'direction' => ['front' => 'x']])->assertCreated()->assertJsonPath('data.quality', 'medium');
        $this->postJson('/api/v1/ai/designs/render', [...$brief, 'rank' => 2, 'quality' => 'high', 'direction' => ['front' => 'x']])->assertCreated();
        $this->assertSame(['gpt-6-luna', 'gpt-image-2', 'gpt-6.1-sol', 'gpt-image-2', 'gpt-image-2.5-sunburst'], $models());

        // Cleared: back to the fallbacks.
        $this->putJson('/api/v1/admin/settings', ['openai_planning_model' => '', 'openai_hd_image_model' => null])
            ->assertOk()->assertJsonPath('data.planning_model', null)->assertJsonPath('data.hd_image_model', null);
        $this->assertSame('gpt-6-luna', \App\Services\OpenAiDesigner::planningModel());
    }

    public function test_gpt_image_2_5_models_never_get_input_fidelity(): void
    {
        Storage::fake('local');
        $this->fake();
        config(['services.openai.image_model' => 'gpt-image-2.5-flare', 'services.openai.hd_image_model' => 'gpt-image-2.5-sunburst']);
        [, $logo] = $this->userWithLogo();
        $brief = ['prompt' => 'A navy BLITZ rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey', 'reference_ids' => [$logo]];

        $this->postJson('/api/v1/ai/designs/render', [...$brief, 'rank' => 2, 'direction' => ['front' => 'x']])->assertCreated();
        $this->postJson('/api/v1/ai/designs/render', [...$brief, 'rank' => 1, 'quality' => 'high', 'direction' => ['ownDesign' => false]])->assertCreated();
        $this->postJson('/api/v1/ai/print-sheet', ['image' => 'data:image/jpeg;base64,'.self::PNG, 'sport' => 'rugby-league', 'garment' => 'jersey', 'reference_ids' => [$logo]])->assertCreated();

        // One request each (no wasted retry), with the logo as an image and no input_fidelity.
        $edits = Http::recorded(fn (Request $r) => str_ends_with($r->url(), '/images/edits'))->map(fn ($pair) => $pair[0]->body())->values();
        $this->assertCount(3, $edits);
        foreach ($edits as $body) {
            $this->assertStringNotContainsString('name="input_fidelity"', $body);
            $this->assertGreaterThanOrEqual(2, substr_count($body, 'name="image[]"'));
        }
        $this->assertStringContainsString('gpt-image-2.5-flare', $edits[0]);
        $this->assertStringContainsString('gpt-image-2.5-sunburst', $edits[1]);
        $this->assertTrue(\App\Services\OpenAiDesigner::takesInputFidelity('gpt-image-2'));
        $this->assertTrue(\App\Services\OpenAiDesigner::takesInputFidelity('gpt-image-1.5'));
        $this->assertFalse(\App\Services\OpenAiDesigner::takesInputFidelity('gpt-image-2.5-flare'));
    }

    public function test_the_image_editor_uses_the_hd_image_model(): void
    {
        config(['services.openai.key' => 'sk-test', 'services.openai.image_model' => 'gpt-image-2.5-flare', 'services.openai.hd_image_model' => 'gpt-image-2.5-sunburst']);
        Http::fake(['api.openai.com/v1/images/*' => Http::response(['data' => [['b64_json' => self::PNG]]])]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/v1/ai/image-edit', ['image' => 'data:image/png;base64,'.self::PNG, 'instruction' => 'Make the collar gold'])->assertOk();
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/images/edits') && str_contains($r->body(), 'gpt-image-2.5-sunburst'));
    }

    public function test_the_four_designs_always_have_distinct_names(): void
    {
        config(['services.openai.key' => 'sk-test']);
        $plan = $this->plan();
        $plan['brief']['designName'] = 'Blitz Velocity';
        $plan['directions'][1]['designName'] = 'Blitz Velocity';
        $plan['directions'][2]['designName'] = 'blitz velocity';
        Http::fake(['api.openai.com/v1/responses' => Http::response(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode($plan)]]]]])]);
        Sanctum::actingAs(User::factory()->create());

        $names = array_column($this->postJson('/api/v1/ai/designs', ['prompt' => 'A navy BLITZ rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey'])->assertOk()->json('data.directions'), 'name');
        $this->assertSame(['Blitz Velocity', 'Blitz Velocity Strike', 'blitz velocity Edge', 'Plain Stripe'], $names);
        Http::assertSent(fn (Request $r) => str_contains(json_encode($r->data()), 'gets its own different name'));
    }
}
