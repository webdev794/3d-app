<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Hoodies (pull-over and full zip): saved and reopened with their own area colours, hood pattern and hood artwork. */
class HoodieTest extends TestCase
{
    use RefreshDatabase;

    public function test_hoodies_are_garments_and_save_with_their_area_colours(): void
    {
        $ids = array_column(config('catalog.garments'), 'id');
        $this->assertContains('hoodie', $ids);
        $this->assertContains('ziphoodie', $ids);

        Sanctum::actingAs(User::factory()->create());
        foreach (['hoodie', 'ziphoodie'] as $garment) {
            $body = [
                'name' => "Warriors {$garment}", 'sport' => 'training', 'garment' => $garment, 'mode' => 'dyo',
                'design' => [
                    'garment' => $garment, 'main' => '#14213d', 'secondary' => '#fca311', 'accent' => '#ffffff',
                    'pattern' => 'Solid', 'logoText' => 'WARRIORS', 'backName' => 'SMITH', 'number' => '7',
                    'zones' => ['hood' => 'Chevron', 'pocket' => 'Solid'],
                    'zoneColors' => ['hood' => '#123456', 'lining' => '#fca311', 'rib' => '#0b1016', 'pocket' => '#ffffff', 'zip' => '#c0c0c0'],
                    // Artwork on the hood's own piece (above the back panel on the 2D panels).
                    'layers' => [['id' => 'h1', 'type' => 'text', 'part' => 'top', 'side' => 'back', 'x' => 0, 'y' => 1.05, 'text' => 'CREW', 'size' => 0.05]],
                ],
            ];
            $id = $this->postJson('/api/v1/projects', $body)->assertCreated()->json('data.id');
            $this->getJson("/api/v1/projects/{$id}")->assertOk()
                ->assertJsonPath('data.garment', $garment)
                ->assertJsonPath('data.design.zones.hood', 'Chevron')
                ->assertJsonPath('data.design.zoneColors.lining', '#fca311')
                ->assertJsonPath('data.design.zoneColors.zip', '#c0c0c0')
                ->assertJsonPath('data.design.layers.0.y', 1.05);
        }
    }

    public function test_area_colours_must_be_known_areas_and_hex(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $design = ['garment' => 'hoodie', 'main' => '#14213d', 'secondary' => '#fca311', 'accent' => '#ffffff', 'pattern' => 'Solid'];
        $post = fn (array $extra) => $this->postJson('/api/v1/projects', ['name' => 'Bad', 'sport' => 'training', 'garment' => 'hoodie', 'mode' => 'dyo', 'design' => [...$design, ...$extra]]);
        $post(['zoneColors' => ['sleeve' => '#ffffff']])->assertUnprocessable();
        $post(['zoneColors' => ['hood' => 'red']])->assertUnprocessable();
        $post(['zones' => ['hood' => 'Glitter']])->assertUnprocessable();
    }
}
