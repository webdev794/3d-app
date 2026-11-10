<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * "Custom…" in the Sport and Garment pickers (client 2026-11-02, images/293.jpg): a typed sport is kept in
 * design.sportName (the project's sport stays a catalogue id), a typed garment in design.productName on its nearest
 * 3D garment; order rows take a typed sport. Plain text only, up to 40 characters for a sport.
 */
class CustomChoiceTest extends TestCase
{
    use RefreshDatabase;

    private function design(array $extra = []): array
    {
        return ['garment' => 'cap', 'main' => '#0b1016', 'secondary' => '#00c2cc', 'accent' => '#36e3ee', 'pattern' => 'Solid'] + $extra;
    }

    private function form(array $items): array
    {
        return ['source' => 'form', ...$this->artwork(), 'contact_name' => 'Fab', 'contact_email' => 'fab@example.test', 'phone' => '0400 000 000', 'team_name' => 'Mantis',
            'needed_by' => now()->addWeeks(6)->toDateString(), 'delivery' => 'pickup', 'items' => $items];
    }

    public function test_a_project_keeps_a_typed_sport_and_garment(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        Sanctum::actingAs($admin);
        $id = $this->postJson('/api/v1/projects', ['name' => 'Mantis caps', 'sport' => 'training', 'garment' => 'cap', 'mode' => 'dyo',
            'design' => $this->design(['sportName' => 'Bowling', 'productName' => 'Snapback cap'])])
            ->assertCreated()->assertJsonPath('data.design.sportName', 'Bowling')->assertJsonPath('data.design.productName', 'Snapback cap')->json('data.id');
        $this->getJson("/api/v1/projects/{$id}")->assertOk()->assertJsonPath('data.sport', 'training')->assertJsonPath('data.design.sportName', 'Bowling');
        // Admin › Projects shows the typed names.
        $this->getJson('/api/v1/admin/projects')->assertOk()->assertJsonPath('data.data.0.sport_name', 'Bowling')->assertJsonPath('data.data.0.product_name', 'Snapback cap');
    }

    public function test_a_typed_name_is_plain_text_and_short(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $post = fn (array $extra) => $this->postJson('/api/v1/projects', ['name' => 'Kit', 'sport' => 'training', 'garment' => 'cap', 'mode' => 'dyo', 'design' => $this->design($extra)]);
        $post(['sportName' => '<b>Bowling</b>'])->assertUnprocessable()->assertJsonValidationErrors('design.sportName');
        $post(['sportName' => str_repeat('a', 41)])->assertUnprocessable()->assertJsonValidationErrors('design.sportName');
        $post(['productName' => "Cap\x07"])->assertUnprocessable()->assertJsonValidationErrors('design.productName');
        // The project's own sport is still a catalogue sport.
        $this->postJson('/api/v1/projects', ['name' => 'Kit', 'sport' => 'Bowling', 'garment' => 'cap', 'design' => $this->design()])
            ->assertUnprocessable()->assertJsonValidationErrors('sport');
    }

    public function test_an_order_row_takes_a_typed_sport_and_garment_name(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $order = $this->postJson('/api/v1/orders', $this->form([
            ['garment' => 'cap', 'sport' => 'Bowling', 'sizes' => ['M' => 6]],
            ['garment' => 'other', 'sport' => 'Bowling', 'label' => 'Bowling shirt', 'sizes' => ['L' => 4]],
            ['garment' => 'jersey', 'sport' => 'rugby-league', 'sizes' => ['M' => 2]],
        ]), ['Idempotency-Key' => 'custom-choice-1'])->assertCreated()
            ->assertJsonPath('data.garments.0.name', 'Bowling Cap')
            ->assertJsonPath('data.garments.1.name', 'Bowling shirt')
            ->assertJsonPath('data.garments.2.name', 'Rugby League Jersey')
            ->json('data');
        $this->assertSame('Bowling', $order['items'][0]['sport']);

        $this->postJson('/api/v1/orders', $this->form([['garment' => 'cap', 'sport' => '<script>', 'sizes' => ['M' => 1]]]), ['Idempotency-Key' => 'custom-choice-2'])
            ->assertUnprocessable()->assertJsonValidationErrors('items.0.sport');
    }
}
