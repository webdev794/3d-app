<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Studio › Patterns › My patterns: the user's own pattern pictures (assets of type "pattern") and their use on a kit. */
class OwnPatternTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    public function test_upload_list_and_delete_own_patterns(): void
    {
        Storage::fake('local');
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $id = $this->postJson('/api/v1/assets', ['name' => 'Koru', 'type' => 'pattern', 'file' => UploadedFile::fake()->image('koru.png', 400, 400)])
            ->assertCreated()->assertJsonPath('data.type', 'pattern')->json('data.id');
        $this->getJson('/api/v1/assets')->assertOk()->assertJsonPath('data.0.id', $id)->assertJsonPath('data.0.type', 'pattern');
        $this->get('/api/v1/assets/'.$id.'/file')->assertOk();
        $this->deleteJson('/api/v1/assets/'.$id)->assertOk();
        $this->getJson('/api/v1/assets')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_size_and_type_limits(): void
    {
        Storage::fake('local');
        Sanctum::actingAs(User::factory()->create());
        // Patterns take up to 5 MB (logos keep 10 MB).
        $this->postJson('/api/v1/assets', ['type' => 'pattern', 'file' => UploadedFile::fake()->image('big.jpg')->size(6000)])->assertUnprocessable();
        $this->postJson('/api/v1/assets', ['type' => 'pattern', 'file' => UploadedFile::fake()->image('ok.webp')->size(4000)])->assertCreated();
        $this->postJson('/api/v1/assets', ['type' => 'logo', 'file' => UploadedFile::fake()->image('logo.png')->size(6000)])->assertCreated();
        $this->postJson('/api/v1/assets', ['type' => 'pattern', 'file' => UploadedFile::fake()->create('pattern.pdf', 10, 'application/pdf')])->assertUnprocessable();
        $this->postJson('/api/v1/assets', ['type' => 'pattern', 'file' => UploadedFile::fake()->create('pattern.gif', 10, 'image/gif')])->assertUnprocessable();
    }

    public function test_only_the_owner_sees_and_deletes_them(): void
    {
        Storage::fake('local');
        $owner = User::factory()->create();
        Sanctum::actingAs($owner);
        $id = $this->postJson('/api/v1/assets', ['type' => 'pattern', 'file' => UploadedFile::fake()->image('mine.png')])->assertCreated()->json('data.id');
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/v1/assets')->assertOk()->assertJsonCount(0, 'data');
        $this->get('/api/v1/assets/'.$id.'/file')->assertNotFound();
        $this->deleteJson('/api/v1/assets/'.$id)->assertNotFound();
        $this->postJson('/api/v1/assets', ['type' => 'pattern', 'file' => UploadedFile::fake()->image('x.png')])->assertCreated();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/assets')->assertUnauthorized();
    }

    public function test_a_kit_saves_and_reopens_with_own_patterns_on_the_body_and_areas(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $picture = 'data:image/png;base64,'.self::PNG;
        $design = [
            'garment' => 'jersey', 'main' => '#0b1016', 'secondary' => '#00c2cc', 'accent' => '#ffffff', 'pattern' => 'Solid',
            'patternImage' => $picture, 'patternScale' => 0.45, 'patternBody' => 1,
            'zones' => ['sleeves' => $picture, 'sides' => 'Stripes'],
        ];
        $id = $this->postJson('/api/v1/projects', ['name' => 'Own pattern', 'sport' => 'rugby-league', 'garment' => 'jersey', 'design' => $design])
            ->assertCreated()->json('data.id');
        $this->getJson('/api/v1/projects/'.$id)->assertOk()
            ->assertJsonPath('data.design.zones.sleeves', $picture)->assertJsonPath('data.design.zones.sides', 'Stripes')
            ->assertJsonPath('data.design.patternImage', $picture)->assertJsonPath('data.design.patternScale', 0.45);
        // An area takes only a pattern name or a picture.
        $design['zones'] = ['sleeves' => 'javascript:alert(1)'];
        $this->postJson('/api/v1/projects', ['name' => 'Bad', 'sport' => 'rugby-league', 'garment' => 'jersey', 'design' => $design])->assertUnprocessable();
        $design['zones'] = ['sleeves' => 'Sparkles'];
        $this->postJson('/api/v1/projects', ['name' => 'Bad', 'sport' => 'rugby-league', 'garment' => 'jersey', 'design' => $design])->assertUnprocessable();
    }
}
