<?php

namespace Tests\Feature;

use App\Models\Preset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Presets (task 9.148): 3DEEZI presets for everyone (seeded from presets.json), private "My presets", Admin > Presets. */
class PresetTest extends TestCase
{
    use RefreshDatabase;

    private array $design = ['main' => '#111111', 'secondary' => '#222222', 'accent' => '#333333', 'pattern' => 'Stripes', 'garment' => 'jersey', 'zones' => [], 'layers' => []];

    private string $thumb = 'data:image/png;base64,iVBORw0KGgo=';

    public function test_the_starting_presets_come_from_the_file(): void
    {
        $file = json_decode(file_get_contents(public_path('media/presets.json')), true);
        $this->assertSame(count($file), Preset::query()->whereNull('user_id')->count());
        $data = $this->getJson('/api/v1/presets')->assertOk()->json('data');
        $this->assertSame(array_column($file, 'id'), array_column($data, 'id'));
        $this->assertTrue($data[0]['team']);
        $this->assertStringContainsString('/media/presets/'.$file[0]['id'].'.webp', $data[0]['thumbnail']);
    }

    public function test_the_file_is_the_fallback_while_the_table_is_empty(): void
    {
        Preset::query()->delete();
        $file = json_decode(file_get_contents(public_path('media/presets.json')), true);
        $this->assertSame(array_column($file, 'id'), array_column($this->getJson('/api/v1/presets')->json('data'), 'id'));
    }

    public function test_an_admin_saves_a_team_preset_everyone_sees(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        $id = $this->postJson('/api/v1/presets', ['name' => 'Club Gold', 'design' => $this->design, 'thumbnail' => $this->thumb, 'team' => true])
            ->assertCreated()->assertJsonPath('data.team', true)->json('data.id');
        Sanctum::actingAs(User::factory()->create());
        $this->assertContains($id, array_column($this->getJson('/api/v1/presets')->json('data'), 'id'));
        $this->assertSame([], $this->getJson('/api/v1/presets/mine')->json('data'));
    }

    public function test_a_designer_may_save_team_presets_but_a_customer_may_not(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_designer' => true]));
        $this->postJson('/api/v1/presets', ['name' => 'Team', 'design' => $this->design, 'team' => true])->assertCreated();
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/presets', ['name' => 'Team', 'design' => $this->design, 'team' => true])->assertForbidden();
    }

    public function test_my_presets_are_private_and_can_be_renamed_and_deleted(): void
    {
        $this->postJson('/api/v1/presets', ['name' => 'X', 'design' => $this->design])->assertUnauthorized();
        $alice = User::factory()->create();
        Sanctum::actingAs($alice);
        $saved = $this->postJson('/api/v1/presets', ['name' => 'Alice kit', 'design' => $this->design, 'thumbnail' => $this->thumb])
            ->assertCreated()->assertJsonPath('data.mine', true)->json('data');
        $this->assertNotContains($saved['id'], array_column($this->getJson('/api/v1/presets')->json('data'), 'id'));
        $this->assertSame([$saved['id']], array_column($this->getJson('/api/v1/presets/mine')->json('data'), 'id'));

        Sanctum::actingAs(User::factory()->create());
        $this->assertSame([], $this->getJson('/api/v1/presets/mine')->json('data'));
        $this->patchJson('/api/v1/presets/'.$saved['key'], ['name' => 'Taken'])->assertNotFound();
        $this->deleteJson('/api/v1/presets/'.$saved['key'])->assertNotFound();

        Sanctum::actingAs($alice);
        $this->patchJson('/api/v1/presets/'.$saved['key'], ['name' => 'Alice home'])->assertOk()->assertJsonPath('data.name', 'Alice home');
        $this->deleteJson('/api/v1/presets/'.$saved['key'])->assertOk();
        $this->assertSame([], $this->getJson('/api/v1/presets/mine')->json('data'));
    }

    public function test_a_customer_cannot_change_a_team_preset(): void
    {
        $team = Preset::query()->whereNull('user_id')->first();
        Sanctum::actingAs(User::factory()->create());
        $this->patchJson('/api/v1/presets/'.$team->id, ['name' => 'Mine now'])->assertNotFound();
        $this->deleteJson('/api/v1/presets/'.$team->id)->assertNotFound();
        $this->getJson('/api/v1/admin/presets')->assertForbidden();
    }

    public function test_admin_presets_rename_hide_reorder_and_delete(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        $rows = $this->getJson('/api/v1/admin/presets')->assertOk()->json('data');
        [$a, $b] = [$rows[0], $rows[1]];
        $this->patchJson('/api/v1/admin/presets/'.$a['key'], ['name' => 'Renamed', 'hidden' => true, 'sport' => 'rugby', 'garment' => 'jersey'])
            ->assertOk()->assertJsonPath('data.hidden', true)->assertJsonPath('data.sport', 'rugby');
        $this->assertNotContains($a['id'], array_column($this->getJson('/api/v1/presets')->json('data'), 'id'));
        $order = $this->postJson('/api/v1/admin/presets/order', ['ids' => [$b['key'], $a['key']]])->assertOk()->json('data');
        $this->assertSame($b['key'], $order[0]['key']);
        $this->deleteJson('/api/v1/admin/presets/'.$b['key'])->assertOk();
        $this->assertNull(Preset::query()->find($b['key']));
    }
}
