<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Garment style (the Studio's Style tool, NK1 2026-11-02): the neck style (round / V), a rugby jersey's collar from the
 * rugby collar library and its fit are saved with the design, reopen, update, stay in a preset and are checked.
 */
class GarmentStyleTest extends TestCase
{
    use RefreshDatabase;

    private function design(array $extra = []): array
    {
        return ['garment' => 'jersey', 'main' => '#27282a', 'secondary' => '#16b4f0', 'accent' => '#16b4f0', 'pattern' => 'Solid', 'logoText' => '3DEEZI', 'number' => '23', ...$extra];
    }

    public function test_the_neck_style_collar_and_fit_save_and_reopen(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $body = ['name' => 'Tigers', 'sport' => 'rugby-league', 'garment' => 'jersey', 'mode' => 'dyo',
            'design' => $this->design(['neck' => 'rc006', 'fit' => 'tight', 'parts' => ['collar' => ['colour' => '#ffffff']]])];
        $id = $this->postJson('/api/v1/projects', $body)->assertCreated()->json('data.id');
        $this->getJson("/api/v1/projects/{$id}")->assertOk()
            ->assertJsonPath('data.design.neck', 'rc006')
            ->assertJsonPath('data.design.fit', 'tight')
            ->assertJsonPath('data.design.parts.collar.colour', '#ffffff');
        // Changed to a plain V-neck, the garment's own fit.
        $this->putJson("/api/v1/projects/{$id}", [...$body, 'design' => $this->design(['neck' => 'v', 'fit' => null])])->assertOk();
        $this->getJson("/api/v1/projects/{$id}")->assertOk()->assertJsonPath('data.design.neck', 'v')->assertJsonPath('data.design.fit', null);
        // A tee with a V-neck, a singlet with a round neck.
        foreach (['tee' => 'v', 'singlet' => 'round', 'netball-dress' => 'v'] as $garment => $neck) {
            $this->postJson('/api/v1/projects', ['name' => "Kit {$garment}", 'sport' => 'netball', 'garment' => $garment, 'mode' => 'dyo', 'design' => $this->design(['garment' => $garment, 'neck' => $neck])])
                ->assertCreated()->assertJsonPath('data.design.neck', $neck);
        }
    }

    public function test_unknown_necks_and_fits_are_refused(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $post = fn (array $extra) => $this->postJson('/api/v1/projects', ['name' => 'Bad', 'sport' => 'rugby-union', 'garment' => 'jersey', 'mode' => 'dyo', 'design' => $this->design($extra)]);
        $post(['neck' => 'turtle'])->assertUnprocessable();
        $post(['neck' => 'rc011'])->assertUnprocessable();
        $post(['fit' => 'baggy'])->assertUnprocessable();
        $post(['neck' => 'shallow-v', 'fit' => 'classic'])->assertCreated();
    }

    public function test_a_preset_keeps_the_neck_style(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $id = $this->postJson('/api/v1/presets', ['name' => 'My V kit', 'design' => $this->design(['neck' => 'v', 'fit' => 'classic'])])->assertCreated()->json('data.id');
        $mine = collect($this->getJson('/api/v1/presets/mine')->assertOk()->json('data'))->firstWhere('id', $id);
        $this->assertSame('v', $mine['design']['neck']);
        $this->assertSame('classic', $mine['design']['fit']);
    }
}
