<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** The varsity (letterman) jacket: a garment of its own, offered for the sports that wear one, saved with its area colours. */
class VarsityTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_varsity_jacket_is_a_garment_for_its_sports(): void
    {
        $garment = collect(config('catalog.garments'))->firstWhere('id', 'varsity');
        $this->assertSame('Varsity jacket', $garment['name'] ?? null);
        $sports = collect(config('catalog.sports'))->keyBy('id');
        foreach (['teamwear', 'school-leavers', 'training', 'american-football', 'basketball', 'softball'] as $id) {
            $this->assertContains('varsity', $sports[$id]['garments'], $id);
        }
        $this->assertNotContains('varsity', $sports['netball']['garments']);
    }

    public function test_a_varsity_jacket_saves_and_reopens_with_its_area_colours_and_rib_artwork(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $colours = ['body' => '#14213d', 'sleeves' => '#fca311', 'rib' => '#14213d', 'ribStripe' => '#ffffff', 'snaps' => '#c0c0c0', 'pocketTrim' => '#fca311', 'lining' => '#9d0208'];
        $body = [
            'name' => 'Warriors letterman', 'sport' => 'school-leavers', 'garment' => 'varsity', 'mode' => 'dyo',
            'design' => [
                'garment' => 'varsity', 'main' => '#14213d', 'secondary' => '#fca311', 'accent' => '#ffffff',
                'pattern' => 'Solid', 'logoText' => 'WARRIORS', 'backName' => 'SMITH', 'number' => '26',
                'zones' => ['sleeves' => 'Solid'], 'zoneColors' => $colours,
                // Artwork on the collar's own piece (above the back panel on the 2D panels).
                'layers' => [['id' => 'v1', 'type' => 'text', 'part' => 'top', 'side' => 'back', 'x' => 0, 'y' => 0.89, 'text' => 'CLASS OF 26', 'size' => 0.03]],
            ],
        ];
        $id = $this->postJson('/api/v1/projects', $body)->assertCreated()->json('data.id');
        $this->getJson("/api/v1/projects/{$id}")->assertOk()
            ->assertJsonPath('data.garment', 'varsity')
            ->assertJsonPath('data.design.zoneColors', $colours)
            ->assertJsonPath('data.design.layers.0.y', 0.89);
    }

    public function test_an_order_of_a_varsity_design_is_a_jacket_named_as_the_studio_names_it(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $project = $user->projects()->create(['name' => 'Letterman', 'sport' => 'teamwear', 'garment' => 'varsity', 'design' => []]);
        $this->postJson('/api/v1/orders', ['project_id' => $project->id, 'contact_name' => 'Fab', 'design_final' => true, 'names' => 'none', 'sizes' => ['M' => 2]], ['Idempotency-Key' => 'studio-varsity-1'])
            ->assertCreated()->assertJsonPath('data.garments.0.garment', 'jacket')->assertJsonPath('data.garments.0.name', 'Varsity jacket')->assertJsonCount(1, 'data.garments');
    }

    public function test_varsity_area_colours_must_be_known_areas_and_hex(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $design = ['garment' => 'varsity', 'main' => '#14213d', 'secondary' => '#fca311', 'accent' => '#ffffff', 'pattern' => 'Solid'];
        $post = fn (array $extra) => $this->postJson('/api/v1/projects', ['name' => 'Bad', 'sport' => 'teamwear', 'garment' => 'varsity', 'mode' => 'dyo', 'design' => [...$design, ...$extra]]);
        $post(['zoneColors' => ['buttons' => '#ffffff']])->assertUnprocessable();
        $post(['zoneColors' => ['snaps' => 'silver']])->assertUnprocessable();
        $post(['zoneColors' => ['ribStripe' => '#ffffff']])->assertCreated();
    }
}
