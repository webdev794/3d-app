<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** OpenAI integration with a faked API: no real calls are made. */
class AiApiTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    private function concept(int $i): array
    {
        return [
            'designName' => "Concept {$i}",
            'summary' => "Summary {$i}",
            'mainColor' => '#0b1016',
            'secondaryColor' => '#00c2cc',
            'accentColor' => '#36e3ee',
            'pattern' => $i === 3 ? 'Unknown' : 'Chevron',
            'logoText' => 'mantis',
            'renderPrompt' => 'Black jersey with cyan chevrons.',
            'patternMotif' => 'interlocking chevrons',
        ];
    }

    private function fakeOpenAi(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake([
            'api.openai.com/v1/responses' => Http::response(['output' => [[
                'type' => 'message',
                'content' => [['type' => 'output_text', 'text' => json_encode(['concepts' => array_map(fn ($i) => $this->concept($i), range(0, 3))])]],
            ]]]),
            'api.openai.com/v1/images/*' => Http::response(['data' => [['b64_json' => self::PNG]]]),
        ]);
    }

    private function direction(): array
    {
        return ['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode([
            'summary' => "I'll create a BLITZ training singlet in electric blue, black and white.",
            'ownDesign' => false, 'teamName' => 'BLITZ', 'palette' => 'electric blue #1E5BFF, black #0A0C12, white #FFFFFF',
            'theme' => 'speed and lightning', 'front' => 'Black body, the mascot logo large on the chest, blue lightning shards up the sides.',
            'back' => 'BLITZ over a big 01.', 'graphics' => 'jagged lightning bolts with halftone fades', 'trims' => 'electric blue binding',
            'presentation' => 'night stadium, blue haze',
        ])]]]]];
    }

    public function test_mockup_follows_an_art_direction_with_the_logo_as_a_real_image_input(): void
    {
        Storage::fake('local');
        config(['services.openai.key' => 'sk-test']);
        Http::fake([
            'api.openai.com/v1/responses' => Http::response($this->direction()),
            'api.openai.com/v1/images/*' => Http::response(['data' => [['b64_json' => self::PNG]]]),
        ]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        Storage::disk('local')->put('assets/'.$user->id.'/blitz.png', base64_decode(self::PNG));
        $logo = $user->assets()->create(['name' => 'BLITZ', 'type' => 'reference', 'path' => 'assets/'.$user->id.'/blitz.png', 'mime_type' => 'image/png', 'size' => 68]);

        $this->postJson('/api/v1/ai/mockup', ['prompt' => 'Create a cool training singlets using this for the theme and main logo', 'sport' => 'rugby-league', 'garment' => 'singlet', 'reference_ids' => [$logo->id]])
            ->assertCreated()->assertJsonPath('data.direction', "I'll create a BLITZ training singlet in electric blue, black and white.");

        // The art director saw the logo itself.
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/responses')
            && str_contains(json_encode($r->data(), JSON_UNESCAPED_SLASHES), 'data:image/png;base64,')
            && str_contains(json_encode($r->data()), 'art_direction'));
        // The render follows the direction: bold sublimation, logo centrepiece, name and number, dark presentation, high fidelity.
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/images/edits')
            && substr_count($r->body(), 'name="image[]"') === 2
            && str_contains($r->body(), '- Front: Black body, the mascot logo large on the chest')
            && str_contains($r->body(), 'fully sublimated all-over design')
            && str_contains($r->body(), 'Never a plain template with flat colour blocks')
            && str_contains($r->body(), 'large centrepiece on the front, reproduced faithfully')
            && str_contains($r->body(), 'large player number')
            && str_contains($r->body(), 'dramatic dark setting')
            && str_contains($r->body(), 'only for the small neck label')
            && str_contains($r->body(), 'name="input_fidelity"')
            // Colours: dark body for a bold brief with a logo, readable white numbers, no skin tones.
            && str_contains($r->body(), 'prefer a dark body (black or deep navy)')
            && str_contains($r->body(), 'white with an outline in the accent colour')
            && str_contains($r->body(), 'never from skin tones or tiny logo details'));
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/responses')
            && str_contains(json_encode($r->data()), 'prefer a dark body (black or deep navy)')
            && str_contains(json_encode($r->data()), 'large white player number'));
    }

    public function test_mockup_renders_without_a_direction_and_retries_without_input_fidelity(): void
    {
        Storage::fake('local');
        config(['services.openai.key' => 'sk-test']);
        Http::fake([
            'api.openai.com/v1/responses' => Http::response(['error' => ['message' => 'Server busy']], 500),
            'api.openai.com/v1/images/*' => Http::sequence()
                ->push(['error' => ['message' => "Unknown parameter: 'input_fidelity'.", 'param' => 'input_fidelity']], 400)
                ->push(['data' => [['b64_json' => self::PNG]]]),
        ]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/v1/ai/mockup', ['prompt' => 'A navy MANTIS rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey'])
            ->assertCreated()->assertJsonPath('data.direction', null);
        $edits = Http::recorded(fn (Request $r) => str_ends_with($r->url(), '/images/edits'))->values();
        $this->assertCount(2, $edits);
        $this->assertStringContainsString('name="input_fidelity"', $edits[0][0]->body());
        $this->assertStringNotContainsString('name="input_fidelity"', $edits[1][0]->body());
        $this->assertStringNotContainsString('Creative direction', $edits[1][0]->body());
        $this->assertStringContainsString('do NOT put 3DEEZI on the chest', $edits[1][0]->body());
    }

    public function test_make_it_3d_redraws_the_mockup_as_a_flat_print_sheet(): void
    {
        Storage::fake('local');
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/v1/images/*' => Http::response(['data' => [['b64_json' => self::PNG]]])]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        Storage::disk('local')->put('assets/'.$user->id.'/blitz.png', base64_decode(self::PNG));
        $logo = $user->assets()->create(['name' => 'BLITZ', 'type' => 'reference', 'path' => 'assets/'.$user->id.'/blitz.png', 'mime_type' => 'image/png', 'size' => 68]);

        $sheet = $this->postJson('/api/v1/ai/print-sheet', ['image' => 'data:image/jpeg;base64,'.self::PNG, 'sport' => 'rugby-league', 'garment' => 'singlet', 'reference_ids' => [$logo->id], 'name' => 'Blitz'])
            ->assertCreated()->assertJsonPath('data.asset.type', 'reference')->assertJsonPath('data.asset.name', 'Print sheet · Blitz');
        Storage::disk('local')->assertExists($user->assets()->find($sheet->json('data.asset.id'))->path);
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/images/edits')
            && substr_count($r->body(), 'name="image[]"') === 2
            && str_contains($r->body(), 'flat print artwork sheet')
            && str_contains($r->body(), 'front on the left and its back on the right')
            && str_contains($r->body(), 'plain pure white background')
            && str_contains($r->body(), 'reproduce them faithfully'));

        $this->postJson('/api/v1/ai/print-sheet', ['image' => 'not a picture', 'sport' => 'rugby-league', 'garment' => 'singlet'])->assertUnprocessable();
    }

    public function test_concept_previews_carry_the_client_logo_and_free_design(): void
    {
        Storage::fake('local');
        $this->fakeOpenAi();
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        Storage::disk('local')->put('assets/'.$user->id.'/blitz.png', base64_decode(self::PNG));
        $logo = $user->assets()->create(['name' => 'BLITZ', 'type' => 'reference', 'path' => 'assets/'.$user->id.'/blitz.png', 'mime_type' => 'image/png', 'size' => 68]);

        $this->postJson('/api/v1/concepts', ['prompt' => 'Cool training singlets using this logo', 'sport' => 'rugby-league', 'garment' => 'singlet', 'reference_ids' => [$logo->id]])->assertOk();
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/responses') && str_contains(json_encode($r->data()), 'nearest built-in pattern for the editable 3D kit')
            && str_contains(json_encode($r->data()), 'never from skin tones'));
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/images/edits')
            && substr_count($r->body(), 'name="image[]"') === 2
            && str_contains($r->body(), 'large chest centrepiece')
            && str_contains($r->body(), 'neck label'));
    }

    public function test_concepts_use_openai_when_configured_and_analyse_references(): void
    {
        Storage::fake('local');
        $this->fakeOpenAi();
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        Storage::disk('local')->put('assets/'.$user->id.'/ref.png', base64_decode(self::PNG));
        $reference = $user->assets()->create(['name' => 'Ref', 'type' => 'reference', 'path' => 'assets/'.$user->id.'/ref.png', 'mime_type' => 'image/png', 'size' => 68]);

        $response = $this->postJson('/api/v1/concepts', [
            'prompt' => 'A black and cyan rugby jersey for the Mantis club',
            'sport' => 'rugby-league',
            'garment' => 'jersey',
            'reference_ids' => [$reference->id],
        ])->assertOk();

        $response->assertJsonPath('data.provider.is_ai', true)
            ->assertJsonPath('data.reference_images_analyzed', true)
            ->assertJsonCount(4, 'data.concepts')
            ->assertJsonPath('data.concepts.0.design.garment', 'jersey')
            ->assertJsonPath('data.concepts.0.design.logoText', 'MANTIS')
            ->assertJsonPath('data.concepts.0.design.main', '#0B1016')
            ->assertJsonPath('data.concepts.3.design.pattern', 'Chevron')
            ->assertJsonPath('data.concepts.0.motif', 'interlocking chevrons');
        $this->assertStringStartsWith('data:image/jpeg;base64,', $response->json('data.concepts.0.preview'));

        // The brief went to the text model with the reference image attached.
        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/responses')
            && str_contains(json_encode($request->data(), JSON_UNESCAPED_SLASHES), 'data:image/png;base64,'));
        Http::assertSentCount(5);
    }

    public function test_catalog_reports_the_openai_provider_only_when_configured(): void
    {
        $this->getJson('/api/v1/catalog')->assertJsonPath('data.provider.is_ai', false)->assertJsonPath('data.showcase_scenes', []);
        config(['services.openai.key' => 'sk-test']);
        $this->getJson('/api/v1/catalog')->assertJsonPath('data.provider.id', 'openai')->assertJsonCount(4, 'data.showcase_scenes');
    }

    public function test_pattern_and_showcase(): void
    {
        Storage::fake('local');
        $this->fakeOpenAi();
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/ai/pattern', ['motif' => 'sharp chevrons'])
            ->assertOk()
            ->assertJsonPath('data.patternImage', 'data:image/png;base64,'.self::PNG);

        $showcase = $this->postJson('/api/v1/ai/showcase', [
            'image' => 'data:image/png;base64,'.self::PNG,
            'scene' => 'Stadium tunnel',
            'sport' => 'Rugby League',
            'garment' => 'Jersey',
            'logoText' => 'MANTIS',
            'number' => '23',
            'name' => 'Thunder',
        ])->assertCreated();
        $showcase->assertJsonPath('data.asset.type', 'showcase');
        Storage::disk('local')->assertExists($user->assets()->first()->path);
        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/images/edits'));

        $this->postJson('/api/v1/ai/showcase', ['image' => 'data:image/png;base64,'.self::PNG, 'scene' => 'Moon', 'sport' => 'x', 'garment' => 'y'])
            ->assertUnprocessable();
    }

public function test_mockup_edit_and_convert(): void
    {
        Storage::fake('local');
        config(['services.openai.key' => 'sk-test']);
        Http::fake([
            'api.openai.com/v1/images/*' => Http::response(['data' => [['b64_json' => self::PNG]]]),
            'api.openai.com/v1/responses' => Http::sequence()
                ->push($this->direction())
                ->push(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode([
                    'main' => '#aa0000', 'secondary' => '#ffd700', 'accent' => '#ffffff', 'patternColor' => '#ffd700', 'pattern' => 'Stripes',
                    'logoText' => 'mantis', 'backName' => 'smith', 'number' => '#7', 'newPatternMotif' => null, 'reply' => 'Red and gold, number 7 for Smith.',
                ])]]]]])
                ->push(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode([
                    'designName' => 'Seagulls Polo', 'summary' => 'A grey polo.', 'sport' => 'rugby-league', 'garment' => 'polo',
                    'mainColor' => '#888888', 'secondaryColor' => '#000000', 'accentColor' => '#ffffff', 'pattern' => 'Solid',
                    'logoText' => 'Mantis', 'backName' => 'Seagulls', 'number' => '', 'patternMotif' => '',
                ])]]]]]),
        ]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        Storage::disk('local')->put('assets/'.$user->id.'/crest.png', base64_decode(self::PNG));
        $crest = $user->assets()->create(['name' => 'Crest', 'type' => 'reference', 'path' => 'assets/'.$user->id.'/crest.png', 'mime_type' => 'image/png', 'size' => 68]);

        $this->postJson('/api/v1/ai/mockup', ['prompt' => 'A grey oversized polo with a MANTIS wordmark', 'sport' => 'rugby-league', 'garment' => 'polo', 'reference_ids' => [$crest->id]])
            ->assertCreated()->assertJsonPath('data.asset.type', 'mockup')
            ->assertJsonPath('data.direction', "I'll create a BLITZ training singlet in electric blue, black and white.");
        // The client logo and the 3DEEZI logo both went to the image model.
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/images/edits') && substr_count($r->body(), 'name="image[]"') === 2);
        // An attached picture may be the client's finished design: then it is rendered as it is, in the brief's layout.
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/images/edits')
            && str_contains($r->body(), 'If one of them shows a complete garment design, make the garment exactly that design')
            && str_contains($r->body(), 'different layout, angle or background'));

        $this->postJson('/api/v1/ai/edit', ['instruction' => 'red and gold, number 7 for smith', 'design' => ['main' => '#000000', 'pattern' => 'Chevron']])
            ->assertOk()
            ->assertJsonPath('data.design.main', '#AA0000')
            ->assertJsonPath('data.design.logoText', 'MANTIS')
            ->assertJsonPath('data.design.number', '7')
            ->assertJsonPath('data.motif', null);

        $this->postJson('/api/v1/ai/convert', ['image' => 'data:image/png;base64,'.self::PNG])
            ->assertOk()
            ->assertJsonPath('data.garment', 'polo')
            ->assertJsonPath('data.design.backName', 'SEAGULLS')
            ->assertJsonPath('data.motif', null);

        $this->postJson('/api/v1/ai/mockup', ['prompt' => 'short', 'sport' => 'x', 'garment' => 'polo'])->assertUnprocessable();
    }

    public function test_ai_endpoints_need_a_login_and_a_configured_key(): void
    {
        $this->postJson('/api/v1/ai/pattern', ['motif' => 'chevrons'])->assertUnauthorized();
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/ai/pattern', ['motif' => 'chevrons'])->assertStatus(503);
        $this->postJson('/api/v1/ai/edit', ['instruction' => 'make it red', 'design' => ['main' => '#000000']])->assertStatus(503);
    }

    public function test_projects_accept_a_sponsor_logo(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/projects', [
            'name' => 'Sponsored kit',
            'sport' => 'rugby-league',
            'garment' => 'jersey',
            'design' => [
                'garment' => 'jersey', 'main' => '#0b1016', 'secondary' => '#00c2cc', 'accent' => '#36e3ee',
                'pattern' => 'Chevron', 'logoText' => 'MANTIS', 'number' => '23',
                'sponsorImage' => 'data:image/png;base64,'.self::PNG,
            ],
        ])->assertCreated()->assertJsonPath('data.design.sponsorImage', 'data:image/png;base64,'.self::PNG);
    }
}
