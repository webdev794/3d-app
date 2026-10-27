<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * DYO Studio → Colours → PATTERN (or a tap on the pattern): the user's own Pattern colour (design.patternColorOwn) is
 * kept with the project, so the built-in and area patterns stay in that colour after save and reopen.
 */
class PatternColourTest extends TestCase
{
    use RefreshDatabase;

    private function design(array $extra = []): array
    {
        return ['main' => '#102030', 'secondary' => '#00ccdd', 'accent' => '#ffffff', 'pattern' => 'Chevron', 'patternColor' => '#ff3300', 'zones' => ['sleeves' => 'Hoops'], ...$extra];
    }

    public function test_the_own_pattern_colour_survives_save_and_reopen(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $id = $this->postJson('/api/v1/projects', ['name' => 'Red pattern', 'sport' => 'rugby-league', 'garment' => 'jersey', 'mode' => 'dyo', 'design' => $this->design(['patternColorOwn' => true])])
            ->assertCreated()->json('data.id');
        $this->getJson('/api/v1/projects/'.$id)->assertOk()
            ->assertJsonPath('data.design.patternColorOwn', true)
            ->assertJsonPath('data.design.patternColor', '#ff3300');

        // A palette or preset afterwards clears it (the pattern follows the kit colours again).
        $this->patchJson('/api/v1/projects/'.$id, ['design' => $this->design(['patternColorOwn' => null])])->assertOk();
        $this->getJson('/api/v1/projects/'.$id)->assertOk()->assertJsonPath('data.design.patternColorOwn', null);
    }

    public function test_older_designs_without_it_are_still_accepted_and_a_bad_value_is_refused(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/projects', ['name' => 'Old kit', 'sport' => 'rugby-league', 'garment' => 'jersey', 'design' => $this->design()])
            ->assertCreated()->assertJsonMissingPath('data.design.patternColorOwn');
        $this->postJson('/api/v1/projects', ['name' => 'Bad', 'sport' => 'rugby-league', 'garment' => 'jersey', 'design' => $this->design(['patternColorOwn' => 'red'])])
            ->assertStatus(422)->assertJsonValidationErrors('design.patternColorOwn');
    }
}
