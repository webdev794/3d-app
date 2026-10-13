<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** The admin panel's API and customer orders. */
class AdminTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $admin = User::factory()->create();
        $admin->is_admin = true;
        $admin->save();
        Sanctum::actingAs($admin);

        return $admin;
    }

    public function test_only_admins_reach_the_admin_api(): void
    {
        $this->getJson('/api/v1/admin/users')->assertUnauthorized();
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/v1/admin/users')->assertForbidden();
        $this->getJson('/api/v1/admin/stats')->assertForbidden();
    }

    public function test_admins_add_edit_and_delete_users(): void
    {
        $admin = $this->admin();

        $id = $this->postJson('/api/v1/admin/users', ['name' => 'Coach', 'email' => 'COACH@club.com', 'password' => 'Password123!'])
            ->assertCreated()->assertJsonPath('data.email', 'coach@club.com')->assertJsonPath('data.is_admin', false)->json('data.id');
        $this->getJson('/api/v1/admin/users?search=coach')->assertOk()->assertJsonPath('data.total', 1);

        $this->patchJson("/api/v1/admin/users/{$id}", ['name' => 'Head Coach', 'is_admin' => true])
            ->assertOk()->assertJsonPath('data.name', 'Head Coach')->assertJsonPath('data.is_admin', true);
        // A blank password keeps the old one.
        $this->patchJson("/api/v1/admin/users/{$id}", ['password' => ''])->assertOk();
        $this->postJson('/api/v1/auth/login', ['email' => 'coach@club.com', 'password' => 'Password123!'])->assertOk();

        $this->postJson('/api/v1/admin/users', ['name' => 'Dup', 'email' => 'coach@club.com', 'password' => 'Password123!'])->assertUnprocessable();
        $this->deleteJson("/api/v1/admin/users/{$admin->id}")->assertUnprocessable();
        $this->patchJson("/api/v1/admin/users/{$admin->id}", ['is_admin' => false])->assertUnprocessable();

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/v1/admin/users/{$id}")->assertOk();
        $this->assertDatabaseMissing('users', ['id' => $id]);
    }

    public function test_customers_order_their_kits_and_admins_manage_orders(): void
    {
        $customer = User::factory()->create();
        $project = $customer->projects()->create(['name' => 'Home kit', 'sport' => 'football', 'garment' => 'jersey', 'design' => ['main' => '#000000']]);
        $other = User::factory()->create()->projects()->create(['name' => 'Not mine', 'sport' => 'football', 'garment' => 'jersey', 'design' => ['main' => '#000000']]);
        Sanctum::actingAs($customer);

        $this->postJson('/api/v1/orders', ['project_id' => $other->id, 'sizes' => ['M' => 2], 'contact_name' => 'Fab'])->assertUnprocessable();
        $this->postJson('/api/v1/orders', ['project_id' => $project->id, 'sizes' => ['M' => 0], 'contact_name' => 'Fab'])->assertUnprocessable();
        $this->postJson('/api/v1/orders', ['sizes' => ['M' => 2], 'contact_name' => 'Fab', 'unit_price' => 1])->assertUnprocessable();
        $order = $this->postJson('/api/v1/orders', ['project_id' => $project->id, 'sizes' => ['S' => 4, 'M' => 10], 'contact_name' => 'Fab', 'phone' => '0400 000 000'])
            ->assertCreated()->assertJsonPath('data.quantity', 14)->assertJsonPath('data.status', 'pending')->assertJsonPath('data.total', null)->json('data');
        $this->assertSame(sprintf('3DZ-%05d', $order['id']), $order['number']);
        $this->getJson('/api/v1/orders')->assertJsonCount(1, 'data');

        $this->admin();
        $this->patchJson("/api/v1/admin/orders/{$order['id']}", ['status' => 'confirmed', 'unit_price' => 45.5, 'sizes' => ['S' => 4, 'M' => 10, 'L' => 6]])
            ->assertOk()->assertJsonPath('data.quantity', 20)->assertJsonPath('data.total', '910.00')->assertJsonPath('data.user.email', $customer->email);
        $this->patchJson("/api/v1/admin/orders/{$order['id']}", ['status' => 'lost'])->assertUnprocessable();
        $this->patchJson("/api/v1/admin/orders/{$order['id']}", ['project_id' => $other->id])->assertUnprocessable();

        $new = $this->postJson('/api/v1/admin/orders', ['user_id' => $customer->id, 'sizes' => ['XL' => 3], 'contact_name' => 'Phone order', 'status' => 'in_production', 'unit_price' => 50])
            ->assertCreated()->assertJsonPath('data.total', '150.00')->json('data.id');
        $this->getJson('/api/v1/admin/orders?status=in_production')->assertJsonPath('data.total', 1);
        $this->getJson('/api/v1/admin/stats')->assertOk()->assertJsonPath('data.orders', 2)->assertJsonPath('data.garments', 23);

        $this->deleteJson("/api/v1/admin/orders/{$new}")->assertOk();
        $this->assertSame(1, Order::count());
    }

    public function test_admins_review_projects_settings_and_database(): void
    {
        $owner = User::factory()->create();
        $project = $owner->projects()->create(['name' => 'Kit', 'sport' => 'football', 'garment' => 'jersey', 'design' => ['main' => '#000000']]);
        $this->admin();

        $this->getJson('/api/v1/admin/projects?sport=football')->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.data.0.user.email', $owner->email);
        $this->patchJson("/api/v1/admin/projects/{$project->id}", ['status' => 'approved'])->assertOk()->assertJsonPath('data.status', 'approved');
        $stats = $this->getJson('/api/v1/admin/stats')->assertOk()->assertJsonPath('data.approved', 1)->assertJsonCount(30, 'data.trend')->json('data');
        $this->assertSame([['sport' => 'Football', 'count' => 1]], $stats['sports']);
        $this->assertSame(1, end($stats['trend'])['kits']);

        // The OpenAI key is stored encrypted and overrides .env.
        $this->putJson('/api/v1/admin/settings', ['openai_key' => 'not-a-key'])->assertUnprocessable();
        $this->putJson('/api/v1/admin/settings', ['openai_key' => 'sk-test_ABCDEFGHIJKLMNOPQRSTUVWX1234', 'openai_text_model' => 'gpt-test'])
            ->assertOk()->assertJsonPath('data.configured', true)->assertJsonPath('data.source', 'admin panel')
            ->assertJsonPath('data.masked_key', 'sk-test…1234')->assertJsonPath('data.text_model', 'gpt-test');
        $this->assertStringNotContainsString('ABCDEFGH', (string) \App\Models\Setting::find('openai_key')->value);
        config(['services.openai.key' => '']);
        \App\Models\Setting::applyToConfig();
        $this->assertSame('sk-test_ABCDEFGHIJKLMNOPQRSTUVWX1234', config('services.openai.key'));
        $this->putJson('/api/v1/admin/settings', ['clear_key' => true])->assertOk()->assertJsonPath('data.source', 'none');

        $this->getJson('/api/v1/admin/database')->assertOk()->assertJsonPath('data.driver', 'sqlite');
        $this->postJson('/api/v1/admin/database/prune-tokens')->assertOk();
        $this->deleteJson("/api/v1/admin/projects/{$project->id}")->assertOk();
        $this->assertDatabaseMissing('projects', ['id' => $project->id]);
    }

    public function test_the_admin_command_creates_an_administrator(): void
    {
        $this->artisan('admin:create', ['email' => 'Boss@3deezi.com', '--password' => 'Password123!'])->assertSuccessful();
        $this->assertTrue(User::firstWhere('email', 'boss@3deezi.com')->is_admin);
    }
}
