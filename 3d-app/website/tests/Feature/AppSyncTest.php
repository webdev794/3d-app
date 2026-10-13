<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects saved by the mobile apps through the same API as the website. */
class AppSyncTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    public function test_app_projects_keep_renders_thumbnail_and_app_details(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $body = [
            'name' => 'Mantis Home',
            'sport' => 'football',
            'garment' => 'fullkit',
            'mode' => 'ai',
            'thumbnail' => self::PNG,
            'design' => [
                'garment' => 'fullkit', 'main' => '#0b1016', 'secondary' => '#00c2cc', 'accent' => '#36e3ee',
                'pattern' => 'Velocity', 'logoText' => 'MANTIS', 'backName' => 'SMITH', 'number' => '7',
                'patternImage' => self::PNG, 'renderFront' => self::PNG, 'renderBack' => null,
                'app' => ['schema' => 1, 'id' => 'p123', 'sport' => 'Soccer', 'fabric' => 'Mesh', 'spec' => null],
            ],
        ];

        $id = $this->postJson('/api/v1/projects', $body)->assertCreated()
            ->assertJsonPath('data.thumbnail', self::PNG)
            ->assertJsonPath('data.design.app.fabric', 'Mesh')
            ->assertJsonPath('data.design.renderFront', self::PNG)
            ->json('data.id');

        $body['design']['number'] = '9';
        $this->patchJson("/api/v1/projects/{$id}", $body)->assertOk()->assertJsonPath('data.version', 2);
        $this->getJson('/api/v1/projects')->assertJsonPath('data.0.design.number', '9')
            ->assertJsonPath('data.0.thumbnail', self::PNG);
    }

    public function test_renders_must_be_images(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/projects', [
            'name' => 'Bad', 'sport' => 'football', 'garment' => 'jersey',
            'design' => ['main' => '#000000', 'secondary' => '#000000', 'accent' => '#000000', 'pattern' => 'Solid', 'renderFront' => 'https://evil.example/x.png'],
        ])->assertUnprocessable()->assertJsonValidationErrors('design.renderFront');
    }
}
