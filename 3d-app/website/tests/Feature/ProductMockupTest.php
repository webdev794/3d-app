<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ProductMockup;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** The Studio's Mockup button (studio product photos) with a faked OpenAI: no real calls. */
class ProductMockupTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    private function body(array $extra = []): array
    {
        return ['front' => self::PNG, 'back' => self::PNG, 'view' => 'front', 'sport' => 'Rugby League', 'garment' => 'Jersey', 'logoText' => 'MANTIS', 'backName' => 'SMITH', 'number' => '7', 'colors' => ['#0b1016', '#00c2cc'], ...$extra];
    }

    private function fake(): void
    {
        config(['services.openai.key' => 'test-key']);
        Http::fake(['api.openai.com/v1/images/edits' => Http::response(['data' => [['b64_json' => base64_encode("\xFF\xD8\xFFjpeg")]]])]);
    }

    public function test_signed_out_is_asked_to_sign_in(): void
    {
        $this->postJson('/api/v1/ai/product-mockup', $this->body())->assertUnauthorized();
        $this->postJson('/api/v1/ai/product-mockup/save', ['images' => []])->assertUnauthorized();
    }

    public function test_three_views_use_the_right_captures_and_prompt(): void
    {
        $this->fake();
        Sanctum::actingAs(User::factory()->create());
        foreach (['front' => 1, 'back' => 1, 'three-quarter' => 2] as $view => $images) {
            $this->postJson('/api/v1/ai/product-mockup', $this->body(['view' => $view, 'background' => 'white']))
                ->assertCreated()->assertJsonPath('data.view', $view)
                ->assertJsonPath('data.image', 'data:image/jpeg;base64,'.base64_encode("\xFF\xD8\xFFjpeg"));
        }
        $sent = Http::recorded()->map(fn ($pair) => $pair[0]);
        $this->assertCount(3, $sent);
        $this->assertSame([1, 2, 2], $sent->map(fn (Request $r) => count(array_filter($r->data(), fn ($p) => ($p['name'] ?? '') === 'image[]')))->values()->all());
        $prompts = $sent->map(fn (Request $r) => collect($r->data())->firstWhere('name', 'prompt')['contents'])->all();
        $this->assertStringContainsString('ghost-mannequin', $prompts[0]);
        $this->assertStringContainsString('pure-white', $prompts[0]);
        $this->assertStringContainsString('"MANTIS"', $prompts[0]);
        $this->assertStringContainsString('"SMITH"', $prompts[1]);
        $this->assertStringContainsString('"7"', $prompts[1]);
        $this->assertStringContainsString('three-quarter', $prompts[2]);
        $this->assertStringContainsString('#0b1016, #00c2cc', $prompts[0]);
        // The small "3D" shield is named so the model does not write "30"; the back view has no badge.
        $this->assertStringContainsString('reads the letters 3D (three-D, not the number 30)', $prompts[0]);
        $this->assertStringContainsString('reads the letters 3D (three-D, not the number 30)', $prompts[2]);
        $this->assertStringNotContainsString('the number 30', $prompts[1]);
        $this->assertStringContainsString('the team wordmark on the chest reads exactly "MANTIS"', ProductMockup::prompt('front', 'white', ['logoText' => 'Mantis']));
        $this->postJson('/api/v1/ai/product-mockup', $this->body(['colors' => ['red']]))->assertUnprocessable();
    }

    public function test_bad_input_is_refused(): void
    {
        $this->fake();
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/ai/product-mockup', $this->body(['view' => 'side']))->assertUnprocessable();
        $this->postJson('/api/v1/ai/product-mockup', $this->body(['background' => 'pink']))->assertUnprocessable();
        $this->postJson('/api/v1/ai/product-mockup', $this->body(['front' => 'not-an-image']))->assertUnprocessable();
        Http::assertNothingSent();
    }

    public function test_ai_off_and_ai_errors(): void
    {
        Sanctum::actingAs(User::factory()->create());
        config(['services.openai.key' => null]);
        $this->postJson('/api/v1/ai/product-mockup', $this->body())->assertStatus(503);
        config(['services.openai.key' => 'test-key']);
        Http::fake(['api.openai.com/*' => Http::response(['error' => ['message' => 'busy']], 500)]);
        $this->postJson('/api/v1/ai/product-mockup', $this->body())->assertStatus(502);
    }

    public function test_save_to_my_assets(): void
    {
        Storage::fake('local');
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $jpeg = 'data:image/jpeg;base64,'.base64_encode("\xFF\xD8\xFFjpeg");
        $this->postJson('/api/v1/ai/product-mockup/save', ['name' => 'Thunder', 'images' => [['image' => $jpeg, 'view' => 'front'], ['image' => $jpeg, 'view' => 'three-quarter']]])
            ->assertCreated()->assertJsonCount(2, 'data.assets')->assertJsonPath('data.assets.1.name', 'Thunder mockup · 3/4');
        $this->assertSame(2, $user->assets()->count());
        Storage::disk('local')->assertExists($user->assets()->first()->path);
        $this->postJson('/api/v1/ai/product-mockup/save', ['images' => [['image' => 'data:image/jpeg;base64,'.base64_encode('nope'), 'view' => 'front']]])->assertUnprocessable();
        $this->assertSame(2, $user->assets()->count());
    }

    public function test_every_background_has_a_prompt(): void
    {
        foreach (array_keys(ProductMockup::BACKGROUNDS) as $bg) {
            $this->assertStringContainsString(ProductMockup::BACKGROUNDS[$bg], ProductMockup::prompt('front', $bg, ['sport' => 'Hoodie', 'garment' => 'Hoodie']));
        }
    }
}
