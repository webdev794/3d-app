<?php

namespace Tests\Feature;

use App\Http\Requests\ProjectRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Every Studio save is taken (QA10 2026-11-11): the app's Rugby League Kit (its socks' parts, sweeps, raglan and the
 * shorts' "3" in the jersey font) was refused with 422 while the app showed it saved. Every garment tile's starting look,
 * as the website and the app put it on the kit, must save.
 */
class StudioSaveShapesTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    /** The app's Rugby League Kit as lib/project_sync.dart toServer sends it (the QA10 payload's shape). */
    private function appRugbyKit(): array
    {
        return [
            'name' => 'Rugby League Kit', 'sport' => 'rugby-league', 'garment' => 'fullkit', 'mode' => 'dyo', 'thumbnail' => self::PNG,
            'design' => [
                'garment' => 'fullkit', 'main' => '#27282a', 'secondary' => '#00a2e8', 'accent' => '#16b4f0', 'pattern' => 'Solid',
                'logoText' => '3DEEZI', 'backName' => '', 'number' => '23', 'patternImage' => null, 'logoImage' => null, 'sponsorImage' => null,
                'layers' => [
                    ['id' => 'tile-shorts-mark', 'name' => 'Shorts mark', 'type' => 'text', 'part' => 'shorts', 'side' => 'front', 'x' => 0.15, 'y' => 0.11, 'text' => '3', 'size' => 0.06, 'color' => '#00a2e8', 'font' => 'JerseyBlock'],
                    ['id' => 'tile-shorts-word', 'name' => 'Shorts wordmark', 'type' => 'text', 'part' => 'shorts', 'side' => 'front', 'x' => 0.15, 'y' => 0.06, 'text' => '3DEEZI', 'size' => 0.032, 'color' => '#ffffff'],
                ],
                'zones' => [],
                'zoneColors' => ['raglan' => '#00a2e8', 'sweep' => '#00a2e8', 'sweepDeep' => '#0262f6', 'sockToeLine' => '#2b91c1', 'sockMark' => '#0a93ee'],
                'patternColor' => '#16b4f0', 'patternColorOwn' => true,
                'parts' => [
                    'shortsSides' => ['colour' => '#00a2e8'], 'shortsHem' => ['colour' => '#27282a'],
                    'sockBand' => ['colour' => '#0b95dd'], 'sockHoops' => ['colour' => '#0b95dd'], 'sockFoot' => ['colour' => '#16b4f0'],
                ],
                'productName' => 'Rugby League Kit', 'gradient' => null,
                'marks' => ['top_wordmark' => ['y' => 0.505], 'shorts_number' => ['hidden' => true], 'shorts_crest' => ['hidden' => true]],
                'renderFront' => null, 'renderBack' => null,
                'app' => ['schema' => 1, 'id' => 'p1731', 'sport' => 'Rugby League', 'garment' => 'Full kit', 'fabric' => 'Standard', 'version' => 1, 'updated' => '2026-11-11T10:00:00.000', 'spec' => null],
            ],
        ];
    }

    public function test_the_apps_rugby_league_kit_with_socks_sweeps_raglan_and_a_shorts_number_saves_and_reopens(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $body = $this->appRugbyKit();
        $id = $this->postJson('/api/v1/projects', $body)->assertCreated()
            ->assertJsonPath('data.design.parts.sockFoot.colour', '#16b4f0')
            ->assertJsonPath('data.design.zoneColors.sweepDeep', '#0262f6')
            ->assertJsonPath('data.design.layers.0.font', 'JerseyBlock')
            ->json('data.id');

        // Saved again (PATCH, as the app's next save) and opened on the website.
        $body['design']['zoneColors']['raglan'] = '#ff0000';
        $this->patchJson("/api/v1/projects/{$id}", $body)->assertOk()->assertJsonPath('data.version', 2);
        $this->getJson("/api/v1/projects/{$id}")->assertOk()
            ->assertJsonPath('data.design.zoneColors.raglan', '#ff0000')
            ->assertJsonPath('data.design.parts.sockBand.colour', '#0b95dd')
            ->assertJsonPath('data.design.layers.0.id', 'tile-shorts-mark');
    }

    public function test_every_garment_tiles_starting_look_saves_from_the_studio(): void
    {
        Sanctum::actingAs(User::factory()->create());
        // (Over a hundred saves: past the API's rate limit.)
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $base = ['garment' => 'jersey', 'main' => '#0b1016', 'secondary' => '#00c2cc', 'accent' => '#36e3ee', 'pattern' => 'Solid', 'logoText' => 'CLUB', 'number' => '7', 'backName' => 'SMITH', 'layers' => [], 'zones' => [], 'marks' => []];
        $saved = 0;
        foreach (config('catalog.sports') as $sport) {
            foreach ($sport['tiles'] as $tile) {
                if ($tile['fit'] === 'soon' || ! isset($tile['design'])) {
                    continue;
                }
                // As the website's Design Your Own puts a tile on the draft ({...draft.design, ...tile.design}).
                $design = [...$base, ...$tile['design'], 'garment' => $tile['garment'], 'productName' => $tile['name']];
                $this->postJson('/api/v1/projects', ['name' => $tile['name'], 'sport' => $sport['id'], 'garment' => $tile['garment'], 'mode' => 'dyo', 'design' => $design])
                    ->assertCreated();
                // As the app sends it (lib/project_sync.dart: no 'None' pattern, no empty values).
                $app = array_filter([...$design, 'pattern' => $design['pattern'] === 'None' ? 'Solid' : $design['pattern']], fn ($v) => $v !== null);
                $this->postJson('/api/v1/projects', ['name' => $tile['name'], 'sport' => $sport['id'], 'garment' => $tile['garment'], 'mode' => 'dyo', 'design' => $app])
                    ->assertCreated();
                $saved++;
            }
        }
        $this->assertGreaterThan(50, $saved);
    }

    public function test_every_part_the_viewer_paints_on_its_own_is_allowed(): void
    {
        // The viewer's part lists (zones.js TOP_PARTS / SHORTS_PARTS, sockprint.js, skirtprint.js, bballprint.js,
        // capprint.js, hatprint.js, beanieprint.js).
        $viewer = (string) file_get_contents(base_path('viewer/src/zones.js'));
        foreach (glob(base_path('viewer/src/*print.js')) as $file) {
            $viewer .= file_get_contents($file);
        }
        preg_match_all('/export const [A-Z_]*PARTS = \[([^\]]*)\]/', $viewer, $lists);
        $this->assertNotEmpty($lists[1]);
        foreach ($lists[1] as $list) {
            preg_match_all("/'([A-Za-z]+)'/", $list, $names);
            foreach ($names[1] as $part) {
                $this->assertContains($part, ProjectRequest::PARTS, "viewer part $part");
            }
        }
        // Every colour area the viewer reads (design.zoneColors.x, zc.x).
        $all = implode("\n", array_map('file_get_contents', glob(base_path('viewer/src/*.js'))));
        preg_match_all('/(?:zoneColors\??\.|\bzc\.)([A-Za-z][A-Za-z0-9]*)/', $all, $areas);
        $this->assertNotEmpty($areas[1]);
        foreach (array_unique($areas[1]) as $area) {
            $this->assertContains($area, ProjectRequest::ZONE_COLORS, "viewer colour area $area");
        }
    }

    public function test_unknown_or_unsafe_values_are_still_refused(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $post = function (array $design) {
            $body = $this->appRugbyKit();
            $body['design'] = array_replace_recursive($body['design'], $design);

            return $this->postJson('/api/v1/projects', $body);
        };
        $post(['parts' => ['notAPart' => ['colour' => '#ffffff']]])->assertUnprocessable()->assertJsonValidationErrors('design.parts');
        $post(['zoneColors' => ['sweep' => 'red']])->assertUnprocessable()->assertJsonValidationErrors('design.zoneColors.sweep');
        $post(['zoneColors' => ['<script>' => '#ffffff']])->assertUnprocessable()->assertJsonValidationErrors('design.zoneColors');
        $post(['layers' => [['font' => 'Comic Sans']]])->assertUnprocessable()->assertJsonValidationErrors('design.layers.0.font');
        $post(['layers' => [['narrow' => 9]]])->assertUnprocessable()->assertJsonValidationErrors('design.layers.0.narrow');
        $post(['layers' => [['look' => ['style' => 'glitter']]]])->assertUnprocessable()->assertJsonValidationErrors('design.layers.0.look.style');
        $post(['layers' => [['onclick' => 'x']]])->assertUnprocessable()->assertJsonValidationErrors('design.layers.0');
    }
}
