<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** The pocket polo (pool and darts shirts): saved and reopened with its chest pocket colour zone and moved crest. */
class PocketPoloTest extends TestCase
{
    use RefreshDatabase;

    public function test_pocket_polo_saves_and_reopens_with_its_pocket_zone(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $body = [
            'name' => 'Bullseye DC',
            'sport' => 'darts',
            'garment' => 'pocketpolo',
            'mode' => 'dyo',
            'design' => [
                'garment' => 'pocketpolo', 'main' => '#101a2e', 'secondary' => '#d4a017', 'accent' => '#ffffff',
                'pattern' => 'Solid', 'logoText' => 'BULLSEYE DC', 'backName' => 'THE POWER', 'number' => '180',
                'zones' => ['pocket' => 'Solid'],
                'marks' => ['top_crest' => ['y' => 0.655, 'scale' => 0.6]],
            ],
        ];
        $id = $this->postJson('/api/v1/projects', $body)->assertCreated()->json('data.id');
        $this->getJson("/api/v1/projects/{$id}")->assertOk()
            ->assertJsonPath('data.garment', 'pocketpolo')
            ->assertJsonPath('data.design.zones.pocket', 'Solid')
            ->assertJsonPath('data.design.marks.top_crest.y', 0.655);
    }

    public function test_the_pocket_zone_takes_only_known_patterns(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/projects', [
            'name' => 'Bad', 'sport' => 'darts', 'garment' => 'pocketpolo', 'mode' => 'dyo',
            'design' => ['garment' => 'pocketpolo', 'main' => '#101a2e', 'secondary' => '#d4a017', 'accent' => '#ffffff', 'pattern' => 'Solid', 'zones' => ['pocket' => 'Glitter']],
        ])->assertUnprocessable();
    }
}
