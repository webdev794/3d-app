<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * DYO Studio → Parts (task 9.134): one part of the kit (a sleeve, the front, the collar…) with its own colour, a fade,
 * a pattern of its own and objects on that part only, kept with the project; a design without parts as before.
 */
class PartsTest extends TestCase
{
    use RefreshDatabase;

    private function design(array $extra = []): array
    {
        return ['garment' => 'fullkit', 'main' => '#102030', 'secondary' => '#00ccdd', 'accent' => '#ffffff', 'pattern' => 'Chevron', ...$extra];
    }

    private function parts(): array
    {
        return [
            'leftSleeve' => ['colour' => '#ff0000'],
            'front' => ['fade' => ['from' => '#ffcc00', 'to' => null, 'angle' => 90]],
            'back' => ['pattern' => 'Hoops', 'patternColour' => '#00ff00', 'patternOpacity' => 0.6],
            'rightSleeve' => ['patternOpacity' => 0],
            'collar' => ['colour' => '#ffffff'],
            'shortsSides' => ['colour' => '#ff00ff', 'fade' => ['from' => '#ff00ff', 'to' => '#000000', 'angle' => 0]],
        ];
    }

    public function test_parts_and_objects_on_one_part_survive_save_and_reopen(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $layers = [['id' => 'l1', 'type' => 'text', 'text' => 'CAPTAIN', 'part' => 'top', 'side' => 'front', 'x' => 0.37, 'y' => 0.6, 'size' => 0.04, 'opacity' => 0.7, 'clip' => 'leftSleeve']];
        $id = $this->postJson('/api/v1/projects', ['name' => 'Parts kit', 'sport' => 'rugby-league', 'garment' => 'fullkit', 'mode' => 'dyo', 'design' => $this->design(['parts' => $this->parts(), 'layers' => $layers])])
            ->assertCreated()->json('data.id');
        $this->getJson('/api/v1/projects/'.$id)->assertOk()
            ->assertJsonPath('data.design.parts.leftSleeve.colour', '#ff0000')
            ->assertJsonPath('data.design.parts.front.fade.angle', 90)
            ->assertJsonPath('data.design.parts.front.fade.to', null)
            ->assertJsonPath('data.design.parts.back.patternOpacity', 0.6)
            ->assertJsonPath('data.design.parts.shortsSides.fade.to', '#000000')
            ->assertJsonPath('data.design.layers.0.clip', 'leftSleeve');

        // Back to the kit's look: no parts at all.
        $this->patchJson('/api/v1/projects/'.$id, ['design' => $this->design(['parts' => null])])->assertOk();
        $this->getJson('/api/v1/projects/'.$id)->assertOk()->assertJsonPath('data.design.parts', null);
    }

    public function test_designs_without_parts_still_save_and_bad_parts_are_refused(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/projects', ['name' => 'Old kit', 'sport' => 'rugby-league', 'garment' => 'jersey', 'design' => $this->design(['garment' => 'jersey'])])
            ->assertCreated()->assertJsonMissingPath('data.design.parts');
        $bad = [
            ['parts' => ['elbow' => ['colour' => '#ff0000']]],
            ['parts' => ['front' => ['colour' => 'red']]],
            ['parts' => ['front' => ['fade' => ['to' => '#ffffff', 'angle' => 0]]]],
            ['parts' => ['front' => ['patternOpacity' => 2]]],
            ['parts' => ['front' => ['pattern' => 'javascript:alert(1)']]],
            ['parts' => ['front' => ['glow' => true]]],
            ['layers' => [['id' => 'l1', 'type' => 'text', 'text' => 'X', 'side' => 'front', 'x' => 0, 'y' => 0.5, 'clip' => 'elbow']]],
        ];
        foreach ($bad as $extra) {
            $this->postJson('/api/v1/projects', ['name' => 'Bad', 'sport' => 'rugby-league', 'garment' => 'jersey', 'design' => $this->design(['garment' => 'jersey', ...$extra])])
                ->assertStatus(422);
        }
    }
}
