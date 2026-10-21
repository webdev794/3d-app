<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** DYO Studio → Colours → GRADIENT PRESETS: gradient fills per colour zone, with every stop, saved with the project. */
class GradientPresetTest extends TestCase
{
    use RefreshDatabase;

    private function design(array $extra = []): array
    {
        return [
            'main' => '#102030', 'secondary' => '#00ccdd', 'accent' => '#ffffff', 'pattern' => 'Chevron',
            // Sunset on the body (Primary): three stops, from and to are the first and last.
            'gradient' => ['from' => '#ff8a00', 'to' => '#7b2ff7', 'angle' => 0, 'preset' => 'sunset', 'stops' => [
                ['color' => '#ff8a00', 'at' => 0], ['color' => '#ff3d7f', 'at' => 0.5], ['color' => '#7b2ff7', 'at' => 1],
            ]],
            'gradients' => [
                'secondary' => ['from' => '#0b0b0f', 'to' => '#d4a017', 'angle' => 90, 'preset' => 'black-gold', 'stops' => [['color' => '#0b0b0f', 'at' => 0], ['color' => '#d4a017', 'at' => 1]]],
                'patternColor' => ['from' => '#12e1f0', 'to' => '#2f6bff', 'angle' => 45],
            ],
            ...$extra,
        ];
    }

    public function test_zone_gradients_with_all_stops_survive_save_reopen_and_a_new_version(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $design = $this->design();
        $id = $this->postJson('/api/v1/projects', ['name' => 'Sunset kit', 'sport' => 'rugby-league', 'garment' => 'fullkit', 'mode' => 'dyo', 'design' => $design])
            ->assertCreated()->json('data.id');
        $this->getJson('/api/v1/projects/'.$id)->assertOk()
            ->assertJsonPath('data.design.gradient', $design['gradient'])
            ->assertJsonPath('data.design.gradients', $design['gradients'])
            ->assertJsonCount(3, 'data.design.gradient.stops');

        // A custom edit: a fourth stop and a new angle; the Secondary zone back to a solid colour.
        $design['gradient']['stops'][] = ['color' => '#2a0a5e', 'at' => 1];
        $design['gradient']['stops'][2]['at'] = 0.8;
        $design['gradient']['to'] = '#2a0a5e';
        $design['gradient']['angle'] = 135;
        $design['gradient']['preset'] = null;
        unset($design['gradients']['secondary']);
        $this->patchJson('/api/v1/projects/'.$id, ['design' => $design])->assertOk();
        $this->getJson('/api/v1/projects/'.$id)->assertOk()
            ->assertJsonPath('data.design.gradient.angle', 135)
            ->assertJsonCount(4, 'data.design.gradient.stops')
            ->assertJsonPath('data.design.gradients', ['patternColor' => $design['gradients']['patternColor']]);
    }

    public function test_the_original_two_colour_gradient_and_no_gradient_are_still_accepted(): void
    {
        Sanctum::actingAs(User::factory()->create());
        foreach ([['from' => '#102030', 'to' => '#334455', 'angle' => 45], null] as $gradient) {
            $this->postJson('/api/v1/projects', ['name' => 'Old kit', 'sport' => 'rugby-league', 'garment' => 'jersey', 'design' => [
                'main' => '#102030', 'secondary' => '#00ccdd', 'accent' => '#ffffff', 'pattern' => 'Solid', 'gradient' => $gradient,
            ]])->assertCreated()->assertJsonPath('data.design.gradient', $gradient);
        }
    }

    public function test_bad_gradients_are_refused(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $stop = fn ($color, $at) => ['color' => $color, 'at' => $at];
        $cases = [
            'design.gradient.stops.1.color' => ['gradient' => ['from' => '#000000', 'to' => '#ffffff', 'angle' => 0, 'stops' => [$stop('#000000', 0), $stop('red', 1)]]],
            'design.gradient.stops.1.at' => ['gradient' => ['from' => '#000000', 'to' => '#ffffff', 'angle' => 0, 'stops' => [$stop('#000000', 0), $stop('#ffffff', 2)]]],
            'design.gradient.stops' => ['gradient' => ['from' => '#000000', 'to' => '#ffffff', 'angle' => 0, 'stops' => array_fill(0, 7, $stop('#000000', 0.5))]],
            'design.gradients' => ['gradients' => ['accent' => ['from' => '#000000', 'to' => '#ffffff', 'angle' => 0]]],
            'design.gradients.secondary.to' => ['gradients' => ['secondary' => ['from' => '#000000', 'angle' => 0]]],
        ];
        foreach ($cases as $field => $extra) {
            $this->postJson('/api/v1/projects', ['name' => 'Bad', 'sport' => 'rugby-league', 'garment' => 'jersey', 'design' => [
                'main' => '#102030', 'secondary' => '#00ccdd', 'accent' => '#ffffff', 'pattern' => 'Solid', ...$extra,
            ]])->assertUnprocessable()->assertJsonValidationErrors($field);
        }
    }
}
