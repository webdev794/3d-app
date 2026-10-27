<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Studio → Colours → FABRIC TYPE (website and apps): the kit's fabric (design.fabric: Standard, Mesh, Pro or Eco; the 3D
 * viewer shows it) is kept with the project, so it is the same after save and reopen. Designs without it (Standard)
 * are still accepted, and an unknown fabric is refused.
 */
class FabricTypeTest extends TestCase
{
    use RefreshDatabase;

    private function design(array $extra = []): array
    {
        return ['main' => '#2463c9', 'secondary' => '#f4f6f8', 'accent' => '#ffd21f', 'pattern' => 'Chevron', 'logoText' => 'LEOPARDS', 'number' => '9', ...$extra];
    }

    public function test_the_fabric_survives_save_and_reopen_and_can_change(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $id = $this->postJson('/api/v1/projects', ['name' => 'Mesh kit', 'sport' => 'rugby-league', 'garment' => 'jersey', 'mode' => 'dyo', 'design' => $this->design(['fabric' => 'Mesh'])])
            ->assertCreated()->json('data.id');
        $this->getJson('/api/v1/projects/'.$id)->assertOk()->assertJsonPath('data.design.fabric', 'Mesh');

        foreach (['Pro', 'Eco', 'Standard'] as $fabric) {
            $this->patchJson('/api/v1/projects/'.$id, ['design' => $this->design(['fabric' => $fabric])])->assertOk();
            $this->getJson('/api/v1/projects/'.$id)->assertOk()->assertJsonPath('data.design.fabric', $fabric);
        }
        // Each change is a new version (the fabric is part of the design).
        $this->getJson('/api/v1/projects/'.$id)->assertOk()->assertJsonPath('data.version', 4);
    }

    public function test_designs_without_a_fabric_are_still_accepted_and_an_unknown_one_is_refused(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/projects', ['name' => 'Old kit', 'sport' => 'rugby-league', 'garment' => 'jersey', 'design' => $this->design()])
            ->assertCreated()->assertJsonMissingPath('data.design.fabric');
        $this->postJson('/api/v1/projects', ['name' => 'Cleared', 'sport' => 'rugby-league', 'garment' => 'tee', 'design' => $this->design(['fabric' => null])])
            ->assertCreated();
        $this->postJson('/api/v1/projects', ['name' => 'Silk', 'sport' => 'rugby-league', 'garment' => 'jersey', 'design' => $this->design(['fabric' => 'Silk'])])
            ->assertStatus(422)->assertJsonValidationErrors('design.fabric');
    }

    public function test_an_app_project_keeps_its_fabric_in_both_places(): void
    {
        // The apps send design.fabric (when not Standard) and keep their own copy in design.app.fabric.
        Sanctum::actingAs(User::factory()->create());
        $id = $this->postJson('/api/v1/projects', ['name' => 'App kit', 'sport' => 'rugby-league', 'garment' => 'jersey', 'design' => $this->design(['fabric' => 'Eco', 'app' => ['schema' => 1, 'fabric' => 'Eco']])])
            ->assertCreated()->json('data.id');
        $this->getJson('/api/v1/projects/'.$id)->assertOk()
            ->assertJsonPath('data.design.fabric', 'Eco')
            ->assertJsonPath('data.design.app.fabric', 'Eco');
    }
}
