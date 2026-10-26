<?php

namespace Tests\Feature;

use App\Http\Controllers\AiController;
use App\Models\User;
use App\Services\OpenAiDesigner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The AI designer's fixed rules (client 2026-10-26, images/175.jpg: a huge 3DEEZI logo across the chest and "TEAM 01" on
 * the back of netball dresses): netball has no player names or numbers but the playing position letters; every sport gets
 * the club's symbol on the chest at crest size and only a small 3DEEZI word mark under the back collar. OpenAI is faked.
 */
class AiSportRulesTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    private const POSITIONS = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'];

    /** The chest symbol and the back word mark: in every design prompt, for every sport. */
    private function assertBrandRules(string $prompt, string $why): void
    {
        $this->assertStringContainsString('the club\'s symbol goes on the chest at a normal crest size', $prompt, $why);
        $this->assertStringContainsString('the client\'s own logo when one is attached, otherwise a simple original crest', $prompt, $why);
        $this->assertStringContainsString('Never put a large 3DEEZI logo, the 3DEEZI emblem or the words "AI SPORTSWEAR DESIGNER" on the chest', $prompt, $why);
        $this->assertStringContainsString('only as a small 3DEEZI word mark at the top of the back, just under the collar, and nowhere else', $prompt, $why);
        // The old rules that put 3DEEZI (or the logo) large on the chest are gone.
        $this->assertStringNotContainsString('3DEEZI wordmark across the chest', $prompt, $why);
        $this->assertStringNotContainsString('emblem as the crest', $prompt, $why);
        $this->assertStringNotContainsString('large centrepiece', $prompt, $why);
        $this->assertStringNotContainsString('neck label', $prompt, $why);
    }

    private function assertNetballRules(string $prompt, string $why = 'netball'): void
    {
        $this->assertStringContainsString('no player names and no numbers: never put a player name or any number anywhere on the garment', $prompt, $why);
        $this->assertStringContainsString('playing position letters, as on real bibs ('.implode(', ', self::POSITIONS).')', $prompt, $why);
        $this->assertStringContainsString('large bold athletic lettering centred on the front', $prompt, $why);
        $this->assertStringContainsString('again large on the back below the word mark', $prompt, $why);
        // Not even the team name on the back ("TEAM 01" in 175.jpg; a live test put PANTHERS above GS).
        $this->assertStringContainsString('The back shows only the small word mark and the position letters: no team name, player name or number', $prompt, $why);
        $this->assertStringNotContainsString('team name in bold athletic lettering over a large player number', $prompt, $why);
        $this->assertStringNotContainsString('(for example 01)', $prompt, $why);
    }

    public function test_the_catalogue_holds_the_rules_per_sport(): void
    {
        $netball = collect(config('catalog.sports'))->firstWhere('id', 'netball');
        $this->assertFalse($netball['names']);
        $this->assertFalse($netball['numbers']);
        $this->assertSame(self::POSITIONS, $netball['positions']);
        // Found by id, name or the name with its style hint; every other sport keeps names and numbers.
        $rules = ['names' => false, 'numbers' => false, 'positions' => self::POSITIONS];
        $this->assertSame($rules, OpenAiDesigner::sportMarkings('netball'));
        $this->assertSame($rules, OpenAiDesigner::sportMarkings('Netball'));
        $this->assertSame($rules, OpenAiDesigner::sportMarkings(AiController::sportForAi('netball')));
        $this->assertSame(['names' => true, 'numbers' => true, 'positions' => []], OpenAiDesigner::sportMarkings('Rugby League'));
        $this->assertSame(['names' => true, 'numbers' => true, 'positions' => []], OpenAiDesigner::sportMarkings(AiController::sportForAi('golf')));
        $this->assertSame(['names' => true, 'numbers' => true, 'positions' => []], OpenAiDesigner::sportMarkings('Unknown sport'));
        // The site's catalogue (the app and the Create page read it) carries them too.
        $sports = collect($this->getJson('/api/v1/catalog')->assertOk()->json('data.sports'));
        $this->assertSame(self::POSITIONS, $sports->firstWhere('id', 'netball')['positions']);
    }

    public function test_every_sport_gets_the_chest_symbol_and_back_word_mark_rules(): void
    {
        foreach (config('catalog.sports') as $sport) {
            $name = AiController::sportForAi($sport['id']);
            foreach ([0, 1] as $logos) {
                foreach (['presentation', 'front'] as $view) {
                    $prompt = OpenAiDesigner::mockupPrompt('A black and gold kit for the Panthers', $name, 'Singlet', $logos, null, $view);
                    $this->assertBrandRules($prompt, "{$sport['id']} {$logos} {$view}");
                }
            }
            $this->assertStringContainsString('do NOT put 3DEEZI on the chest or anywhere on the front', OpenAiDesigner::mockupPrompt('A kit', $name, 'Jersey', 0));
            $preview = OpenAiDesigner::conceptPreviewPrompt($name, 'Jersey', 'Black body with gold shards.', '3DEEZI', 0);
            $this->assertStringContainsString('crest at a normal crest size', $preview, $sport['id']);
            $this->assertStringContainsString('never put 3DEEZI on the front', $preview, $sport['id']);
            $this->assertStringNotContainsString('reads exactly "3DEEZI"', $preview, $sport['id']);
            $this->assertStringContainsString('reads exactly "PANTHERS"', OpenAiDesigner::conceptPreviewPrompt($name, 'Jersey', 'Black body.', 'PANTHERS', 1));
            // Netball (and any later sport without names) gets its own lettering; the others keep names and numbers.
            $marks = OpenAiDesigner::sportMarkings($sport['id']);
            $prompt = OpenAiDesigner::mockupPrompt('A kit', $name, 'Jersey', 1);
            if ($marks['positions']) {
                $this->assertNetballRules($prompt, $sport['id']);
            } else {
                $this->assertStringContainsString('the back carries the team name in bold athletic lettering over a large player number (for example 01)', $prompt, $sport['id']);
            }
        }
    }

    public function test_netball_designs_have_position_letters_and_no_names_or_numbers(): void
    {
        Storage::fake('local');
        config(['services.openai.key' => 'sk-test']);
        $kit = fn (string $name) => ['designName' => $name, 'summary' => "I'll create {$name}.", 'mainColor' => '#0a0c12', 'secondaryColor' => '#d4a017', 'accentColor' => '#ffffff', 'pattern' => 'Velocity', 'logoText' => 'panthers', 'patternMotif' => 'gold swirls'];
        Http::fake([
            'api.openai.com/v1/responses' => Http::response(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode([
                'brief' => $kit('Gold Panthers'),
                'directions' => array_map(fn (int $i) => [...$kit("Option {$i}"), 'score' => 80 - $i, 'bodyColour' => ['black #0A0C12', 'white #FFFFFF', 'gold #D4A017'][$i], 'layout' => ['all-over graphics', 'diagonal sash', 'hoops'][$i],
                    'palette' => 'black, gold, white', 'theme' => 'gold swirls', 'front' => "FRONT-{$i}: crest on the chest, GS below", 'back' => 'word mark, GS', 'graphics' => 'swirls', 'trims' => 'gold'], range(0, 2)),
            ])]]]]]),
            'api.openai.com/v1/images/*' => Http::response(['data' => [['b64_json' => self::PNG]]]),
        ]);
        Sanctum::actingAs(User::factory()->create());
        $brief = ['prompt' => 'Black and gold netball dresses for the Panthers', 'sport' => 'netball', 'garment' => 'singlet'];

        $directions = $this->postJson('/api/v1/ai/designs', $brief)->assertOk()->assertJsonPath('data.planned', true)->json('data.directions');
        // The Studio and the order form start with no back name and no number.
        foreach ($directions as $d) {
            $this->assertSame('', $d['design']['number'], $d['name']);
            $this->assertSame('', $d['design']['backName'], $d['name']);
            $this->assertSame('PANTHERS', $d['design']['logoText']);
        }
        // The planner is told the netball rules, and its field guides ask for position letters, not names and numbers.
        $plan = json_encode(Http::recorded(fn (Request $r) => str_ends_with($r->url(), '/responses'))->first()[0]->data());
        $this->assertStringContainsString('no player names and no numbers', $plan);
        $this->assertStringContainsString('treatment of the position letters', $plan);
        $this->assertStringContainsString('the same position letters large', $plan);
        $this->assertStringNotContainsString('large white player number', $plan);
        $this->assertStringContainsString('the club\'s symbol goes on the chest at a normal crest size', $plan);

        // Each picture: the netball rules, the brand rules and the 3DEEZI word mark (not the full logo) as the image input.
        foreach ($directions as $d) {
            $this->postJson('/api/v1/ai/designs/render', [...$brief, 'rank' => $d['rank'], 'direction' => $d['direction']])->assertCreated();
        }
        $edits = Http::recorded(fn (Request $r) => str_ends_with($r->url(), '/images/edits'))->map(fn ($pair) => $pair[0]->body())->values();
        $this->assertCount(4, $edits);
        $wordMark = file_get_contents(public_path(OpenAiDesigner::WORD_MARK));
        $fullLogo = file_get_contents(public_path('media/images/logo_full.png'));
        foreach ($edits as $i => $body) {
            $this->assertNetballRules($body, "picture {$i}");
            $this->assertBrandRules($body, "picture {$i}");
            $this->assertTrue(str_contains($body, $wordMark), "picture {$i}: the 3DEEZI word mark goes in");
            $this->assertFalse(str_contains($body, $fullLogo), "picture {$i}: not the full 3DEEZI logo");
        }

        // Ready-made designs (the planner failed) keep the rules too.
        $ready = app(OpenAiDesigner::class)->readyDirections('Black and gold netball dresses', 'Singlet', 'Netball');
        $this->assertSame(['', ''], [$ready[0]['design']['number'], $ready[0]['design']['backName']]);
        $this->assertSame('23', app(OpenAiDesigner::class)->readyDirections('A rugby jersey', 'Jersey', 'Rugby League')[0]['design']['number']);
    }

    public function test_rugby_designs_keep_names_and_numbers_with_the_new_brand_rules(): void
    {
        $prompt = OpenAiDesigner::mockupPrompt('A navy BLITZ rugby league jersey', AiController::sportForAi('rugby-league'), 'Jersey', 1, ['front' => 'Navy body']);
        $this->assertBrandRules($prompt, 'rugby');
        $this->assertStringContainsString('Below the word mark, the back carries the team name in bold athletic lettering over a large player number (for example 01)', $prompt);
        $this->assertStringNotContainsString('position letters', $prompt);
        $this->assertStringContainsString('the small 3DEEZI word mark just under the collar, then the team name', OpenAiDesigner::directionFields('Rugby League')['back']);
        $this->assertStringContainsString('at a normal crest size', OpenAiDesigner::directionFields('Rugby League')['front']);
        $this->assertSame(['number' => '23', 'backName' => 'BLITZ'], OpenAiDesigner::kitBack('Rugby League', 'BLITZ'));
        $this->assertSame(['number' => '', 'backName' => ''], OpenAiDesigner::kitBack('Netball', 'BLITZ'));
    }

    public function test_print_sheets_and_showcases_add_no_netball_numbers(): void
    {
        $front = OpenAiDesigner::printSheetPrompt('Netball', 'Singlet', 0, true);
        $this->assertStringContainsString('the small 3DEEZI word mark just under the collar, the same position letters large, no team name, no player name and no number', $front);
        $this->assertStringNotContainsString('over a large number', $front);
        $this->assertStringContainsString('the team name in bold lettering over a large number', OpenAiDesigner::printSheetPrompt('Rugby League', 'Jersey', 0, true));

        Storage::fake('local');
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/v1/images/*' => Http::response(['data' => [['b64_json' => self::PNG]]])]);
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/ai/showcase', ['image' => 'data:image/png;base64,'.self::PNG, 'scene' => 'Studio podium', 'sport' => 'Netball', 'garment' => 'Singlet', 'logoText' => 'PANTHERS', 'number' => '', 'back' => true, 'name' => 'Panthers'])->assertCreated();
        $body = Http::recorded()->first()[0]->body();
        $this->assertStringContainsString('reads exactly "PANTHERS", with no number', $body);
        $this->assertStringNotContainsString('the number reads', $body);
    }

    public function test_preview_concepts_and_saved_kits_keep_netball_without_a_name_or_number(): void
    {
        config(['services.openai.key' => null]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $netball = $this->postJson('/api/v1/concepts', ['prompt' => 'Black and gold netball dress', 'sport' => 'netball', 'garment' => 'singlet'])->assertOk()->json('data.concepts');
        foreach ($netball as $c) {
            $this->assertSame(['', ''], [$c['design']['number'], $c['design']['backName']]);
        }
        $rugby = $this->postJson('/api/v1/concepts', ['prompt' => 'Black and gold rugby jersey', 'sport' => 'rugby-league', 'garment' => 'jersey'])->assertOk()->json('data.concepts');
        $this->assertSame(['01', 'YOUR NAME'], [$rugby[0]['design']['number'], $rugby[0]['design']['backName']]);

        // A kit saved without a number stays without one (Laravel would make it null, which the 3D kit shows as 23).
        $project = ['name' => 'Panthers netball', 'sport' => 'netball', 'garment' => 'singlet', 'mode' => 'ai', 'design' => ['main' => '#0A0C12', 'secondary' => '#D4A017', 'accent' => '#FFFFFF', 'pattern' => 'Velocity', 'logoText' => 'PANTHERS', 'backName' => '', 'number' => '']];
        $id = $this->postJson('/api/v1/projects', $project)->assertCreated()->assertJsonPath('data.design.number', '')->json('data.id');
        $this->getJson("/api/v1/projects/{$id}")->assertJsonPath('data.design.number', '');
        $this->putJson("/api/v1/projects/{$id}", ['design' => [...$project['design'], 'number' => '7']])->assertOk()->assertJsonPath('data.design.number', '7');
        $this->putJson("/api/v1/projects/{$id}", ['design' => [...$project['design'], 'number' => '']])->assertOk()->assertJsonPath('data.design.number', '');
    }
}
