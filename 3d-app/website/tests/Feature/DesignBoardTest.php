<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DesignBoardTest extends TestCase
{
    use RefreshDatabase;

    private function payload(): array
    {
        return [
            'name' => 'Board design', 'sport' => 'rugby-league', 'garment' => 'fullkit', 'mode' => 'dyo',
            'design' => [
                'main' => '#102030', 'secondary' => '#00ccdd', 'accent' => '#ffffff', 'pattern' => 'Hoops',
                'gradient' => ['from' => '#102030', 'to' => '#334455', 'angle' => 45],
                'zones' => ['sleeves' => 'Tribal', 'hem' => 'Dots'],
                'layers' => [
                    ['id' => 'badge', 'type' => 'image', 'part' => 'top', 'side' => 'front', 'x' => .1, 'y' => .6, 'w' => .07, 'src' => '/media/images/badge.png'],
                    ['id' => 'name', 'type' => 'text', 'part' => 'top', 'side' => 'back', 'x' => 0, 'y' => .6, 'text' => 'FALCONS', 'size' => .06, 'color' => '#ffffff', 'rot' => 15],
                    ['id' => 'panel', 'type' => 'shape', 'part' => 'shorts', 'side' => 'front', 'x' => .15, 'y' => .2, 'w' => .12, 'h' => .05, 'shape' => 'triangle', 'opacity' => .75, 'color' => '#ccaa00'],
                ],
            ],
        ];
    }

    public function test_layers_gradients_and_zone_patterns_survive_save_reopen_version_and_export(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $payload = $this->payload();
        $id = $this->postJson('/api/v1/projects', $payload)->assertCreated()->json('data.id');
        $this->getJson('/api/v1/projects/'.$id)->assertOk()
            ->assertJsonPath('data.design.layers', $payload['design']['layers'])
            ->assertJsonPath('data.design.gradient', $payload['design']['gradient']);
        $payload['design']['layers'][0]['x'] = -.1;
        $this->patchJson('/api/v1/projects/'.$id, ['design' => $payload['design']])->assertOk()
            ->assertJsonPath('data.version', 2)->assertJsonPath('data.design.layers.0.x', -.1);
        $this->getJson('/api/v1/projects/'.$id.'/versions')->assertOk()
            ->assertJsonPath('data.1.design.layers.0.x', .1);
        $export = $this->get('/api/v1/projects/'.$id.'/export')->assertOk()->streamedContent();
        $decoded = json_decode($export, true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame($payload['design']['layers'], $decoded['project']['design']['layers']);
    }

    public function test_bad_layer_sources_coordinates_and_zone_fields_are_rejected(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $payload = $this->payload();
        $payload['design']['layers'][0]['src'] = 'https://external.example/tracker.png';
        $payload['design']['layers'][1]['x'] = 500;
        $payload['design']['layers'][2]['shape'] = 'script';
        $payload['design']['zones']['unknown'] = 'Solid';
        $this->postJson('/api/v1/projects', $payload)->assertUnprocessable()->assertJsonValidationErrors([
            'design.layers.0.src', 'design.layers.1.x', 'design.layers.2.shape', 'design.zones',
        ]);
    }

    public function test_layer_type_requires_its_content_and_ids_are_unique(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $payload = $this->payload();
        unset($payload['design']['layers'][0]['src'], $payload['design']['layers'][1]['text']);
        $payload['design']['layers'][1]['id'] = 'badge';
        $this->postJson('/api/v1/projects', $payload)->assertUnprocessable()->assertJsonValidationErrors([
            'design.layers.0.src', 'design.layers.1.text', 'design.layers.1.id',
        ]);
    }

    public function test_moved_resized_turned_and_hidden_marks_are_saved_and_reopened(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $payload = $this->payload();
        $payload['design']['marks'] = [
            'top_wordmark' => ['side' => 'front', 'x' => 0.02, 'y' => 0.52, 'scale' => 1.4, 'rot' => -8],
            'top_crest' => ['hidden' => true],
            'shorts_number' => ['side' => 'back', 'x' => 0.1, 'y' => 0.2],
        ];
        $id = $this->postJson('/api/v1/projects', $payload)->assertCreated()->json('data.id');
        $this->getJson('/api/v1/projects/'.$id)->assertOk()->assertJsonPath('data.design.marks', $payload['design']['marks']);
        // Reset layout sends no marks at all.
        $payload['design']['marks'] = [];
        $this->patchJson('/api/v1/projects/'.$id, ['design' => $payload['design']])->assertOk()->assertJsonPath('data.design.marks', []);
    }

    public function test_bad_marks_are_rejected(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $payload = $this->payload();
        $payload['design']['marks'] = [
            'top_wordmark' => ['x' => 9, 'scale' => 50, 'side' => 'inside'],
            'top_sleeve' => ['x' => 0],
            'top_name' => ['colour' => '#ffffff'],
        ];
        $this->postJson('/api/v1/projects', $payload)->assertUnprocessable()->assertJsonValidationErrors([
            'design.marks', 'design.marks.top_wordmark.x', 'design.marks.top_wordmark.scale', 'design.marks.top_wordmark.side', 'design.marks.top_name',
        ]);
    }

    public function test_presets_are_public_and_every_preset_can_be_saved(): void
    {
        $presets = $this->getJson('/api/v1/presets')->assertOk()->json('data');
        $this->assertCount(count(json_decode(file_get_contents(public_path('media/presets.json')), true)), $presets);
        $this->assertGreaterThanOrEqual(8, count($presets));
        Sanctum::actingAs(User::factory()->create());
        foreach ($presets as $preset) {
            $payload = $this->payload();
            $payload['design'] = $preset['design'];
            $this->postJson('/api/v1/projects', $payload)->assertCreated();
        }
    }
}
