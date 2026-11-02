<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Signage & Marquees (client mockups 297 / 298, 2026-11-02): the Marquee Studio saves a marquee as a project (garment
 * 'marquee', its design in design.marquee: size, walls and each zone's colour and layers), opens it again, and orders
 * it as a garment kit is ordered, counted by its size ({"3x3 m": 2}).
 */
class MarqueeTest extends TestCase
{
    use RefreshDatabase;

    private function marquee(array $extra = []): array
    {
        $blades = fn (string $id) => ['id' => $id, 'type' => 'pattern', 'name' => 'Blades', 'color' => '#00c8ff', 'accent' => '#1560ff', 'scale' => 1];

        return [
            'size' => '3x3', 'walls' => 'back', 'halfWall' => true,
            'zones' => [
                'roof' => ['color' => '#05080c', 'layers' => [$blades('roof-pattern'), ['id' => 'roof-logo', 'type' => 'image', 'name' => 'Logo', 'src' => '3deezi:logo', 'x' => 0.5, 'y' => 0.66, 'w' => 0.2]]],
                'valanceFront' => ['color' => '#05080c', 'layers' => [['id' => 'vf-text', 'type' => 'text', 'text' => 'LEOPARDS', 'color' => '#ffffff', 'x' => 0.5, 'y' => 0.5, 'size' => 0.55, 'font' => 'Rajdhani', 'outline' => null]]],
                'wallBack' => ['color' => '#05080c', 'layers' => [$blades('wb-pattern'), ['id' => 'wb-up', 'type' => 'image', 'name' => 'Your artwork', 'src' => 'data:image/png;base64,iVBORw0KGgo=', 'x' => 0.5, 'y' => 0.5, 'w' => 1, 'visible' => false]]],
            ],
            ...$extra,
        ];
    }

    private function project(array $marquee): array
    {
        return ['name' => 'Club marquee', 'sport' => 'training', 'garment' => 'marquee', 'mode' => 'dyo', 'design' => [
            'garment' => 'marquee', 'main' => '#05080c', 'secondary' => '#00c8ff', 'accent' => '#1560ff', 'pattern' => 'Solid',
            'productName' => 'Custom marquee 3 × 3 m', 'sportName' => 'Signage & Marquees', 'marquee' => $marquee,
        ]];
    }

    public function test_a_marquee_saves_reopens_and_changes(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $id = $this->postJson('/api/v1/projects', $this->project($this->marquee()))->assertCreated()
            ->assertJsonPath('data.garment', 'marquee')->json('data.id');
        $this->getJson('/api/v1/projects/'.$id)->assertOk()
            ->assertJsonPath('data.design.marquee.size', '3x3')
            ->assertJsonPath('data.design.marquee.halfWall', true)
            ->assertJsonPath('data.design.marquee.zones.roof.layers.1.src', '3deezi:logo')
            ->assertJsonPath('data.design.marquee.zones.valanceFront.layers.0.text', 'LEOPARDS')
            ->assertJsonPath('data.design.marquee.zones.wallBack.layers.1.visible', false);
        $this->putJson('/api/v1/projects/'.$id, $this->project($this->marquee(['size' => '3x6', 'walls' => 'full'])) + ['expected_version' => 1])->assertOk()
            ->assertJsonPath('data.version', 2)->assertJsonPath('data.design.marquee.walls', 'full');
    }

    public function test_bad_marquee_designs_are_refused(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/projects', $this->project($this->marquee(['size' => '4x8'])))->assertStatus(422)->assertJsonValidationErrors('design.marquee.size');
        $bad = $this->marquee();
        $bad['zones']['roof']['layers'][1]['src'] = 'https://elsewhere.example/logo.png';
        $this->postJson('/api/v1/projects', $this->project($bad))->assertStatus(422)->assertJsonValidationErrors('design.marquee.zones.roof.layers.1.src');
        $bad = $this->marquee();
        $bad['zones']['door'] = ['color' => '#000000', 'layers' => []];
        $this->postJson('/api/v1/projects', $this->project($bad))->assertStatus(422)->assertJsonValidationErrors('design.marquee.zones');
        // A garment is still checked against the catalogue.
        $this->postJson('/api/v1/projects', ['garment' => 'tent'] + $this->project($this->marquee()))->assertStatus(422)->assertJsonValidationErrors('garment');
    }

    public function test_a_marquee_is_ordered_by_its_size(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $id = $this->postJson('/api/v1/projects', $this->project($this->marquee()))->assertCreated()->json('data.id');
        $order = $this->withHeader('Idempotency-Key', 'marquee-test-1')->postJson('/api/v1/orders', [
            'project_id' => $id, 'project_version' => 1, 'design_final' => true, 'names' => 'none', 'sizes' => ['3x3 m' => 2], 'contact_name' => 'Sam Coach',
        ])->assertCreated();
        $order->assertJsonPath('data.quantity', 2);
        $this->assertSame('Custom marquee 3 × 3 m', collect($order->json('data.garments'))->first()['name'] ?? null);
        // Counted as marquees, not garments (cards, admin, invoice).
        $this->assertSame('marquee', collect($order->json('data.garments'))->first()['garment'] ?? null);
        $this->assertSame('2 marquees', \App\Services\Payments\InvoiceService::summaryText([['garment' => 'marquee', 'name' => 'Custom marquee 3 × 3 m', 'quantity' => 2]]));
        // Garment sizes are still the only other sizes.
        $this->withHeader('Idempotency-Key', 'marquee-test-2')->postJson('/api/v1/orders', [
            'project_id' => $id, 'design_final' => true, 'names' => 'none', 'sizes' => ['9x9 m' => 1], 'contact_name' => 'Sam Coach',
        ])->assertStatus(422);
    }
}
