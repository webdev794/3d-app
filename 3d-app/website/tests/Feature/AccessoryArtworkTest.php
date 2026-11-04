<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\OpenAiDesigner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Artwork to 3D for caps and other accessories (CP1, client 2026-11-02, the MANTIS cap sheet): the artwork is read for
 * our 3D model, its parts' colours and where its front, back and side logos are. OpenAI is faked.
 */
class AccessoryArtworkTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    private function reading(array $over = []): array
    {
        $box = fn ($x0, $y0, $x1, $y1, $extra = []) => ['found' => true, 'x0' => $x0, 'y0' => $y0, 'x1' => $x1, 'y1' => $y1, ...$extra];

        return [
            'garment' => 'cap', 'exact' => true, 'name' => 'Mantis Cap',
            'mainColor' => '#0b0b0d', 'trimColor' => '#ffffff', 'brimColor' => '#0b0b0d', 'underColor' => '', 'accentColor' => '#ffffff',
            'frontText' => 'Mantis',
            'front' => $box(0.25, 0.3, 0.42, 0.42), 'back' => $box(0.66, 0.29, 0.72, 0.34),
            'left' => $box(0.27, 0.78, 0.33, 0.82, ['level' => 'low']), 'right' => $box(0.65, 0.73, 0.68, 0.82, ['level' => 'sideways']),
            'frontView' => $box(0.18, 0.2, 0.47, 0.5), 'backView' => ['found' => false, 'x0' => 0, 'y0' => 0, 'x1' => 0, 'y1' => 0],
            ...$over,
        ];
    }

    private function fake(array $reading): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/v1/responses' => Http::response(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode($reading)]]]]])]);
    }

    public function test_a_cap_sheet_gives_the_caps_colours_and_its_logos_places(): void
    {
        $this->fake($this->reading());
        Sanctum::actingAs(User::factory()->create());

        $data = $this->postJson('/api/v1/ai/accessory/read', ['image' => self::PNG, 'garment' => 'cap'])->assertOk()->json('data');

        $this->assertSame('cap', $data['garment']);
        $this->assertSame('Mantis Cap', $data['name']);
        $this->assertSame(['garment' => 'cap', 'main' => '#0B0B0D', 'secondary' => '#FFFFFF', 'accent' => '#FFFFFF', 'pattern' => 'Solid', 'logoText' => 'MANTIS', 'parts' => ['capBrim' => ['colour' => '#0B0B0D'], 'capUnder' => ['colour' => '#0B0B0D']]], $data['design']);
        $this->assertEqualsWithDelta(0.17, $data['marks']['front']['w'], 0.0001);
        $this->assertSame('low', $data['marks']['left']['level']);
        // An unknown height is the side's middle.
        $this->assertSame('middle', $data['marks']['right']['level']);
        $this->assertNull($data['views']['back']);
        Http::assertSent(fn (Request $r) => $r['input'][1]['content'][1]['image_url'] === self::PNG
            && $r['text']['format']['schema']['properties']['garment']['enum'] === array_keys(OpenAiDesigner::ACCESSORIES)
            && str_contains($r['input'][1]['content'][0]['text'], 'the client chose: cap'));
    }

    public function test_the_chosen_model_stays_and_missing_or_silly_boxes_are_left_out(): void
    {
        $this->fake($this->reading(['garment' => 'cap', 'front' => ['found' => true, 'x0' => 0.1, 'y0' => 0.1, 'x1' => 0.9, 'y1' => 0.9], 'back' => ['found' => false, 'x0' => 0, 'y0' => 0, 'x1' => 0, 'y1' => 0], 'frontText' => '3DEEZI']));
        Sanctum::actingAs(User::factory()->create());

        $data = $this->postJson('/api/v1/ai/accessory/read', ['image' => self::PNG, 'garment' => 'bucket-hat'])->assertOk()->json('data');

        $this->assertSame('bucket-hat', $data['garment']);
        $this->assertSame('cap', $data['seen']);
        $this->assertNull($data['marks']['front']);
        $this->assertNull($data['marks']['back']);
        $this->assertSame('', $data['design']['logoText']);
        $this->assertSame(['hatBrim' => ['colour' => '#0B0B0D'], 'hatUnder' => ['colour' => '#0B0B0D']], $data['design']['parts']);
    }

    public function test_only_our_accessories_and_signed_in_users(): void
    {
        $this->fake($this->reading());
        $this->postJson('/api/v1/ai/accessory/read', ['image' => self::PNG, 'garment' => 'cap'])->assertUnauthorized();
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/ai/accessory/read', ['image' => self::PNG, 'garment' => 'jersey'])->assertUnprocessable();
        Http::assertNothingSent();
    }
}
