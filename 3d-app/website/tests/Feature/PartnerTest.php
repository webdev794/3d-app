<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Corporate Partner applications from the pricing page. */
class PartnerTest extends TestCase
{
    use RefreshDatabase;

    public function test_visitors_apply_and_admins_manage_applications(): void
    {
        $this->postJson('/api/v1/partners/apply', ['company' => 'Acme Sport'])->assertUnprocessable()->assertJsonValidationErrors(['name', 'email']);
        $this->postJson('/api/v1/partners/apply', ['company' => 'Acme Sport', 'name' => 'Jo', 'email' => 'jo@acme.test', 'website' => 'acme.test', 'message' => 'Rugby kits'])
            ->assertCreated();

        $this->getJson('/api/v1/admin/partners')->assertUnauthorized();
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/v1/admin/partners')->assertForbidden();

        $admin = User::factory()->create();
        $admin->is_admin = true;
        $admin->save();
        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/stats')->assertOk()->assertJsonPath('data.new_partners', 1);
        $id = $this->getJson('/api/v1/admin/partners?search=acme')->assertOk()->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.status', 'new')->json('data.data.0.id');
        $this->patchJson("/api/v1/admin/partners/{$id}", ['status' => 'bogus'])->assertUnprocessable();
        $this->patchJson("/api/v1/admin/partners/{$id}", ['status' => 'contacted'])->assertOk()->assertJsonPath('data.status', 'contacted');
        $this->getJson('/api/v1/admin/partners?status=new')->assertOk()->assertJsonPath('data.total', 0);
        $this->deleteJson("/api/v1/admin/partners/{$id}")->assertOk();
        $this->assertDatabaseCount('partner_applications', 0);
    }
}
