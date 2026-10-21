<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Ordering a kit: the design confirmed as final, and the names and numbers on the back. */
class OrderNamesTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;

    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->customer = User::factory()->create();
        $this->project = $this->customer->projects()->create([
            'name' => 'Home kit', 'sport' => 'football', 'garment' => 'jersey', 'thumbnail' => 'data:image/jpeg;base64,AAAA',
            'design' => ['main' => '#112233', 'backName' => 'YOUR NAME', 'number' => '23'],
        ]);
        Sanctum::actingAs($this->customer);
    }

    private function order(array $fields): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/v1/orders', $fields + ['project_id' => $this->project->id, 'contact_name' => 'Fab', 'design_final' => true, 'sizes' => ['M' => 10]]);
    }

    private function admin(): User
    {
        $admin = User::factory()->create();
        $admin->is_admin = true;
        $admin->save();
        Sanctum::actingAs($admin);

        return $admin;
    }

    public function test_the_design_must_be_final_and_the_back_chosen(): void
    {
        $base = ['project_id' => $this->project->id, 'contact_name' => 'Fab', 'sizes' => ['M' => 2], 'names' => 'none'];
        $this->postJson('/api/v1/orders', $base)->assertUnprocessable()->assertJsonValidationErrors(['design_final' => 'This design is final']);
        $this->postJson('/api/v1/orders', $base + ['design_final' => false])->assertJsonValidationErrors('design_final');
        $this->order([])->assertJsonValidationErrors(['names' => 'Choose what goes on the back']);
        $this->order(['names' => 'maybe'])->assertJsonValidationErrors('names');
        $this->assertSame(0, Order::count());
        $this->assertSame('draft', $this->project->refresh()->status);
    }

    public function test_the_same_name_and_number_on_every_shirt(): void
    {
        // The design still has the sample name: the customer types the real one in the order form.
        $this->order(['names' => 'same', 'players' => [['name' => 'your name ', 'number' => '23']]])
            ->assertJsonValidationErrors(['players.0.name' => 'Change YOUR NAME to the name to print on every shirt.']);
        $this->order(['names' => 'same'])->assertJsonValidationErrors('players');
        $this->order(['names' => 'same', 'players' => [['name' => '', 'number' => '']]])->assertJsonValidationErrors('players.0');
        $this->order(['names' => 'same', 'players' => [['name' => 'A', 'number' => '1'], ['name' => 'B', 'number' => '2']]])->assertJsonValidationErrors('players');
        $this->order(['names' => 'same', 'players' => [['name' => 'SMITH', 'number' => '1234']]])->assertJsonValidationErrors('players.0.number');
        $this->order(['names' => 'same', 'players' => [['name' => 'SMITH', 'number' => '7A']]])->assertJsonValidationErrors('players.0.number');

        $order = $this->order(['names' => 'same', 'players' => [['name' => ' SMITH ', 'number' => 7, 'size' => 'M']]])
            ->assertCreated()->assertJsonPath('data.names', 'same')->assertJsonPath('data.players', [['name' => 'SMITH', 'number' => '7']])
            ->assertJsonPath('data.quantity', 10)->assertJsonPath('data.project_version', 1)->assertJsonMissingPath('data.design_snapshot')->json('data');

        // Ordering approves the design without making a new version.
        $this->project->refresh();
        $this->assertSame(['approved', 1], [$this->project->status, $this->project->version]);
        $this->assertSame('Home kit', Order::find($order['id'])->design_snapshot['name']);
        // A number on its own is fine.
        $this->order(['names' => 'same', 'players' => [['name' => '', 'number' => '9']]])->assertCreated()->assertJsonPath('data.players.0.number', '9');
    }

    public function test_a_list_of_players_counts_the_sizes(): void
    {
        $players = [['name' => 'SMITH', 'number' => '7', 'size' => 'M'], ['name' => 'JONES', 'number' => '10', 'size' => 'M'], ['name' => '', 'number' => '1', 'size' => 'L'], ['name' => 'Tui', 'number' => '', 'size' => 'Kids']];
        // The sizes sent are ignored: they always follow the list.
        $this->order(['names' => 'list', 'players' => $players, 'sizes' => ['XL' => 50]])->assertCreated()
            ->assertJsonPath('data.sizes', ['M' => 2, 'L' => 1, 'Kids' => 1])->assertJsonPath('data.quantity', 4)
            ->assertJsonPath('data.players.3', ['name' => 'Tui', 'number' => '', 'size' => 'Kids']);
        // No sizes at all is fine too.
        $this->postJson('/api/v1/orders', ['project_id' => $this->project->id, 'contact_name' => 'Fab', 'design_final' => true, 'names' => 'list', 'players' => [['name' => 'A', 'number' => '1', 'size' => 'S']]])
            ->assertCreated()->assertJsonPath('data.sizes', ['S' => 1]);

        $this->order(['names' => 'list', 'players' => []])->assertJsonValidationErrors('players');
        $this->order(['names' => 'list', 'players' => [['name' => 'A', 'number' => '1', 'size' => 'M'], ['name' => 'B', 'number' => '2']]])
            ->assertJsonValidationErrors(['players.1.size' => 'Player 2: choose a size.']);
        $this->order(['names' => 'list', 'players' => [['name' => 'A', 'number' => '1', 'size' => 'XXL']]])->assertJsonValidationErrors('players.0.size');
        $this->order(['names' => 'list', 'players' => [['name' => '', 'number' => '', 'size' => 'M']]])
            ->assertJsonValidationErrors(['players.0' => 'Player 1: add a name or a number.']);
        $this->order(['names' => 'list', 'players' => [['name' => 'A', 'number' => '1', 'size' => 'M'], ['name' => 'Your Name', 'number' => '2', 'size' => 'M']]])
            ->assertJsonValidationErrors(['players.1.name' => 'Player 2: change YOUR NAME']);
        $this->order(['names' => 'list', 'players' => [['name' => str_repeat('A', 41), 'number' => '1', 'size' => 'M']]])->assertJsonValidationErrors('players.0.name');
        $this->order(['names' => 'list', 'players' => [['name' => 'A', 'number' => '-1', 'size' => 'M']]])->assertJsonValidationErrors('players.0.number');
        $this->order(['names' => 'list', 'players' => [['name' => 'A', 'number' => '1', 'size' => 'M', 'price' => 1]]])->assertJsonValidationErrors('players.0');
        $this->order(['names' => 'list', 'players' => ['a' => ['name' => 'A', 'number' => '1', 'size' => 'M']]])->assertJsonValidationErrors('players');

        // Up to 300 players.
        $team = array_map(fn ($i) => ['name' => "PLAYER $i", 'number' => (string) ($i % 1000), 'size' => Order::SIZES[$i % 9]], range(1, 301));
        $this->order(['names' => 'list', 'players' => $team])->assertJsonValidationErrors(['players' => 'up to 300 players']);
        $this->order(['names' => 'list', 'players' => array_slice($team, 0, 300)])->assertCreated()->assertJsonPath('data.quantity', 300)->assertJsonCount(300, 'data.players');
    }

    public function test_no_name_or_number_on_the_back(): void
    {
        $this->order(['names' => 'none', 'players' => [['name' => 'SMITH', 'number' => '7']], 'sizes' => ['S' => 3, 'L' => 2]])->assertCreated()
            ->assertJsonPath('data.names', 'none')->assertJsonPath('data.players', null)->assertJsonPath('data.quantity', 5);
        $this->order(['names' => 'none', 'sizes' => ['S' => 0]])->assertJsonValidationErrors(['sizes' => 'Add at least one garment']);
    }

    public function test_the_kit_is_kept_as_ordered(): void
    {
        $id = $this->order(['names' => 'list', 'players' => [['name' => 'SMITH', 'number' => '7', 'size' => 'M']], 'project_version' => 1])->assertCreated()->json('data.id');
        // The customer changes the kit afterwards.
        $this->project->forceFill(['version' => 2, 'status' => 'draft', 'design' => ['main' => '#ff0000', 'backName' => 'NEW', 'number' => '9'], 'thumbnail' => 'data:image/jpeg;base64,BBBB'])->save();
        // The version the customer saw is checked.
        $this->order(['names' => 'none', 'project_version' => 1])->assertStatus(409)->assertJsonPath('message', 'This kit has changed since you opened it (it is now version 2). Check it, then order again.');
        $this->order(['names' => 'none', 'project_version' => 2])->assertCreated()->assertJsonPath('data.project_version', 2);
        // Lists stay light: no snapshot in them.
        $mine = $this->getJson('/api/v1/orders')->assertOk()->assertJsonCount(2, 'data')->assertJsonMissingPath('data.0.design_snapshot')->assertJsonMissingPath('data.1.design_snapshot')->json('data');
        $first = collect($mine)->firstWhere('id', $id);
        $this->assertSame(['SMITH', 1], [$first['players'][0]['name'], $first['project_version']]);
        // Another customer's kit can't be ordered.
        $theirs = User::factory()->create()->projects()->create(['name' => 'Theirs', 'sport' => 'football', 'garment' => 'jersey', 'design' => ['main' => '#000000']]);
        $this->order(['names' => 'none', 'project_id' => $theirs->id])->assertUnprocessable();
        $this->assertSame('draft', $theirs->refresh()->status);

        $this->admin();
        $this->getJson("/api/v1/admin/orders/{$id}")->assertOk()
            ->assertJsonPath('data.project_version', 1)->assertJsonPath('data.project.version', 2)
            ->assertJsonPath('data.design_snapshot.design.main', '#112233')->assertJsonPath('data.design_snapshot.thumbnail', 'data:image/jpeg;base64,AAAA')
            ->assertJsonPath('data.design_snapshot.name', 'Home kit')->assertJsonPath('data.project.design.main', '#ff0000');
        $listed = $this->getJson('/api/v1/admin/orders')->assertOk()->assertJsonMissingPath('data.data.0.design_snapshot')->assertJsonMissingPath('data.data.1.design_snapshot')->json('data.data');
        $this->assertSame('list', collect($listed)->firstWhere('id', $id)['names']);
        $this->getJson('/api/v1/admin/stats')->assertOk()->assertJsonMissingPath('data.recent.0.design_snapshot');

        // The kit as ordered stays when the project is deleted.
        $this->project->delete();
        $this->getJson("/api/v1/admin/orders/{$id}")->assertOk()->assertJsonPath('data.project', null)->assertJsonPath('data.design_snapshot.design.main', '#112233');
    }

    public function test_admins_see_the_players_and_the_list_keeps_the_sizes(): void
    {
        $players = [['name' => 'SMITH', 'number' => '7', 'size' => 'S'], ['name' => 'JONES', 'number' => '10', 'size' => 'XL']];
        $id = $this->order(['names' => 'list', 'players' => $players])->assertCreated()->json('data.id');
        $this->getJson("/api/v1/admin/orders/{$id}")->assertForbidden();

        $this->admin();
        $this->getJson("/api/v1/admin/orders/{$id}")->assertOk()->assertJsonPath('data.names', 'list')->assertJsonPath('data.players', $players);
        $this->getJson('/api/v1/admin/orders')->assertOk()->assertJsonPath('data.data.0.players.1.name', 'JONES')->assertJsonPath('data.data.0.quantity', 2);
        // Editing a list order: the sizes still follow the list.
        $this->patchJson("/api/v1/admin/orders/{$id}", ['sizes' => ['M' => 40], 'unit_price' => 50, 'status' => 'confirmed'])->assertOk()
            ->assertJsonPath('data.sizes', ['S' => 1, 'XL' => 1])->assertJsonPath('data.total', '100.00');
        $this->patchJson("/api/v1/admin/orders/{$id}", ['players' => [...$players, ['name' => 'NGATA', 'number' => '3']]])->assertJsonValidationErrors(['players.2.size' => 'Player 3']);
        $this->patchJson("/api/v1/admin/orders/{$id}", ['players' => [...$players, ['name' => 'NGATA', 'number' => '3', 'size' => 'S']]])->assertOk()
            ->assertJsonPath('data.sizes', ['S' => 2, 'XL' => 1])->assertJsonPath('data.quantity', 3);
        $this->patchJson("/api/v1/admin/orders/{$id}", ['names' => 'none'])->assertOk()->assertJsonPath('data.players', null)->assertJsonPath('data.quantity', 3);
        // Editing the order keeps the version it was ordered at.
        $this->assertSame(1, Order::find($id)->project_version);

        // A phone order from the admin panel keeps its kit too, and a different kit replaces it.
        $other = $this->customer->projects()->create(['name' => 'Away kit', 'sport' => 'football', 'garment' => 'jersey', 'design' => ['main' => '#ffffff']]);
        $new = $this->postJson('/api/v1/admin/orders', ['user_id' => $this->customer->id, 'project_id' => $this->project->id, 'sizes' => ['L' => 2], 'contact_name' => 'Phone order'])
            ->assertCreated()->assertJsonPath('data.project_version', 1)->assertJsonPath('data.names', null)->json('data.id');
        $this->assertSame('#112233', Order::find($new)->design_snapshot['design']['main']);
        $this->patchJson("/api/v1/admin/orders/{$new}", ['project_id' => $other->id])->assertOk();
        $this->assertSame('#ffffff', Order::find($new)->design_snapshot['design']['main']);
        $this->patchJson("/api/v1/admin/orders/{$new}", ['project_id' => null])->assertOk()->assertJsonPath('data.project_version', null);
        $this->assertNull(Order::find($new)->design_snapshot);
        $this->postJson('/api/v1/admin/orders', ['user_id' => $this->customer->id, 'sizes' => ['L' => 2], 'contact_name' => 'X', 'project_version' => 3])->assertJsonValidationErrors('project_version');
    }
}
