<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** The track suit jacket: a garment of the sports that use it, saved and reopened with its style and area colours. */
class TrackJacketTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_track_jacket_is_a_garment_of_its_sports(): void
    {
        $this->assertContains('trackjacket', array_column(config('catalog.garments'), 'id'));
        $sports = collect(config('catalog.sports'))->keyBy('id');
        foreach (['training', 'teamwear', 'school-leavers', 'athletics', 'football', 'rugby-league', 'rugby-union', 'afl', 'netball', 'basketball'] as $sport) {
            $this->assertContains('trackjacket', $sports[$sport]['garments'], $sport);
        }
        // Ordered on the order form's Jacket row.
        $this->assertSame('jacket', Order::PROJECT_ROWS['trackjacket']);
        $this->assertArrayHasKey('jacket', Order::GARMENTS);
    }

    public function test_it_saves_with_its_style_and_area_colours(): void
    {
        Sanctum::actingAs(User::factory()->create());
        foreach (['collar', 'hood'] as $style) {
            $body = [
                'name' => "Warriors track {$style}", 'sport' => 'training', 'garment' => 'trackjacket', 'mode' => 'dyo',
                'design' => [
                    'garment' => 'trackjacket', 'trackStyle' => $style, 'main' => '#14213d', 'secondary' => '#fca311', 'accent' => '#ffffff',
                    'pattern' => 'Solid', 'logoText' => 'WARRIORS', 'backName' => 'SMITH', 'number' => '7',
                    'zones' => ['hood' => 'Chevron', 'sleeves' => 'Solid'],
                    'zoneColors' => ['body' => '#ffffff', 'shoulder' => '#c8102e', 'side' => '#14213d', 'stripe' => '#fca311', 'collar' => '#14213d', 'cuffs' => '#0b1016', 'zip' => '#c0c0c0'],
                    // Artwork on the collar's (or hood's) own piece, above the back panel on the 2D panels.
                    'layers' => [['id' => 't1', 'type' => 'text', 'part' => 'top', 'side' => 'back', 'x' => 0, 'y' => 1.17, 'text' => 'CREW', 'size' => 0.02]],
                ],
            ];
            $id = $this->postJson('/api/v1/projects', $body)->assertCreated()->json('data.id');
            $this->getJson("/api/v1/projects/{$id}")->assertOk()
                ->assertJsonPath('data.garment', 'trackjacket')
                ->assertJsonPath('data.design.trackStyle', $style)
                ->assertJsonPath('data.design.zones.hood', 'Chevron')
                ->assertJsonPath('data.design.zoneColors.shoulder', '#c8102e')
                ->assertJsonPath('data.design.zoneColors.stripe', '#fca311')
                ->assertJsonPath('data.design.zoneColors.cuffs', '#0b1016')
                ->assertJsonPath('data.design.layers.0.y', 1.17);
        }
    }

    public function test_style_and_area_colours_must_be_known(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $design = ['garment' => 'trackjacket', 'main' => '#14213d', 'secondary' => '#fca311', 'accent' => '#ffffff', 'pattern' => 'Solid'];
        $post = fn (array $extra) => $this->postJson('/api/v1/projects', ['name' => 'Bad', 'sport' => 'training', 'garment' => 'trackjacket', 'mode' => 'dyo', 'design' => [...$design, ...$extra]]);
        $post(['trackStyle' => 'cape'])->assertUnprocessable();
        $post(['zoneColors' => ['stripes' => '#ffffff']])->assertUnprocessable();
        $post(['zoneColors' => ['stripe' => 'white']])->assertUnprocessable();
        $post(['trackStyle' => 'hood', 'zoneColors' => ['stripe' => '#ffffff']])->assertCreated();
    }
}
