<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\PlayerShot;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** "See it on a player" with a faked OpenAI: no real calls. */
class PlayerShotTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    private function body(array $extra = []): array
    {
        return $extra + ['images' => [self::PNG, self::PNG], 'sport' => 'Rugby League', 'garment' => 'Jersey', 'player' => 'male', 'pose' => 'action',
            'colours' => ['navy #0A1F44', 'gold #F2B705'], 'logoText' => 'TITANS', 'backName' => 'SMITH', 'number' => '9'];
    }

    public function test_signed_out_users_are_asked_to_sign_in(): void
    {
        $this->postJson('/api/v1/ai/player', $this->body())->assertUnauthorized();
        $this->postJson('/api/v1/ai/player/save', ['image' => 'data:image/jpeg;base64,/9j/'])->assertUnauthorized();
    }

    public function test_it_sends_both_kit_pictures_to_the_edit_model_and_does_not_save_until_asked(): void
    {
        Storage::fake('local');
        config(['services.openai.key' => 'sk-test', 'services.openai.image_model' => 'gpt-image-2']);
        $jpeg = base64_encode("\xFF\xD8\xFFfake");
        Http::fake(['api.openai.com/v1/images/edits' => Http::response(['data' => [['b64_json' => $jpeg]]])]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/ai/player', $this->body())->assertCreated()
            ->assertJsonPath('data.image', 'data:image/jpeg;base64,'.$jpeg)->assertJsonPath('data.player', 'male');
        $this->assertSame(0, $user->assets()->count());
        Http::assertSent(function (Request $r) {
            $parts = collect($r->data());
            $prompt = (string) $parts->firstWhere('name', 'prompt')['contents'];

            return str_contains($r->url(), '/images/edits') && $parts->where('name', 'image[]')->count() === 2
                && str_contains($prompt, 'rugby field') && str_contains($prompt, '"TITANS"') && str_contains($prompt, '"SMITH"')
                && str_contains($prompt, 'navy #0A1F44') && str_contains($prompt, 'male athlete')
                && $parts->firstWhere('name', 'size')['contents'] === '1024x1536';
        });

        $this->postJson('/api/v1/ai/player/save', ['image' => 'data:image/jpeg;base64,'.$jpeg, 'name' => 'Titans'])->assertCreated()
            ->assertJsonPath('data.asset.name', 'Titans on a player');
        $this->assertSame(1, $user->assets()->count());
        Storage::disk('local')->assertExists($user->assets()->first()->path);
    }

    public function test_a_netball_dress_is_always_worn_by_a_female_player_on_a_court(): void
    {
        $this->assertSame('female', PlayerShot::player('male', 'Netball dress'));
        $prompt = PlayerShot::prompt(['sport' => 'Netball', 'garment' => 'Netball dress', 'player' => 'male', 'pose' => 'team'], 1);
        $this->assertStringContainsString('female athlete', $prompt);
        $this->assertStringContainsString('netball court', $prompt);
        $this->assertStringContainsString('team photo', $prompt);
        $this->assertStringContainsString('in a modern gym', PlayerShot::prompt(['sport' => 'Gymwear', 'garment' => 'Hoodie'], 1));
    }

    public function test_the_3d_captures_name_the_3d_badge_and_the_lettering(): void
    {
        $meta = ['sport' => 'Rugby League', 'garment' => 'Jersey', 'pose' => 'action', 'logoText' => 'Titans', 'backName' => 'Smith', 'number' => '9'];
        $three = PlayerShot::prompt($meta, 2);
        $this->assertStringContainsString('reads the letters 3D (three-D, not the number 30)', $three);
        $this->assertStringContainsString('the team wordmark on the chest reads exactly "TITANS"', $three);
        $this->assertStringContainsString('"SMITH" with the number "9"', $three);
        $this->assertStringContainsString('reads the letters 3D (three-D, not the number 30)', PlayerShot::personPrompt($meta, 2));
        // A single AI design picture has its own crest: no "3D" badge.
        $this->assertStringNotContainsString('the number 30', PlayerShot::prompt($meta, 1));
        $this->assertStringNotContainsString('the number 30', PlayerShot::personPrompt($meta, 1));
    }

    public function test_it_validates_and_needs_ai(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/ai/player', $this->body(['pose' => 'dance']))->assertUnprocessable();
        $this->postJson('/api/v1/ai/player', $this->body(['images' => ['not-an-image']]))->assertUnprocessable();
        config(['services.openai.key' => '']);
        $this->postJson('/api/v1/ai/player', $this->body())->assertStatus(503);
    }

    private function personCheck(bool $person): array
    {
        return ['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode(['person' => $person])]]]]];
    }

    public function test_your_own_photo_goes_first_and_is_not_kept(): void
    {
        Storage::fake('local');
        config(['services.openai.key' => 'sk-test', 'services.openai.image_model' => 'gpt-image-2']);
        Http::fake([
            'api.openai.com/v1/responses' => Http::response($this->personCheck(true)),
            'api.openai.com/v1/images/edits' => Http::response(['data' => [['b64_json' => base64_encode("\xFF\xD8\xFFx")]]]),
        ]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $this->postJson('/api/v1/ai/player', $this->body(['person' => self::PNG, 'garment' => 'Full Kit']))->assertCreated();
        Http::assertSent(function (Request $r) {
            if (! str_contains($r->url(), '/images/edits')) {
                return false;
            }
            $parts = collect($r->data());
            $prompt = (string) $parts->firstWhere('name', 'prompt')['contents'];

            return $parts->where('name', 'image[]')->count() === 3 && $parts->where('name', 'image[]')->first()['filename'] === 'kit-0.png'
                && str_contains($prompt, 'Image 1 is a photo of a real person') && str_contains($prompt, "Keep the person's face")
                && str_contains($prompt, 'matching shorts') && $parts->firstWhere('name', 'size')['contents'] === '1024x1024';
        });
        $this->assertSame([], Storage::disk('local')->allFiles());
        $this->assertSame(0, $user->assets()->count());
    }

    public function test_a_photo_without_a_person_is_refused_kindly(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/v1/responses' => Http::response($this->personCheck(false))]);
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/ai/player', $this->body(['person' => self::PNG]))->assertStatus(422)
            ->assertJsonPath('message', 'That photo does not show a person. Choose a photo of someone standing, with their upper body in view.');
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), '/images/'));
        $this->postJson('/api/v1/ai/player', $this->body(['person' => 'data:image/gif;base64,R0lG']))->assertStatus(422)
            ->assertJsonPath('errors.person.0', 'Choose a JPG, PNG or WebP photo.');
    }

    public function test_an_ai_failure_is_a_friendly_error(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/*' => Http::response(['error' => ['message' => 'busy']], 500)]);
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/ai/player', $this->body())->assertStatus(502)->assertJsonPath('message', 'AI error: busy');
    }
}
