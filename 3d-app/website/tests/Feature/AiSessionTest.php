<?php

namespace Tests\Feature;

use App\Models\AiSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Recent designs on the AI Designer page (client 2026-10-30): briefs with their four designs, reopened without AI. */
class AiSessionTest extends TestCase
{
    use RefreshDatabase;

    private function picture(int $r = 10): string
    {
        $im = imagecreatetruecolor(60, 90);
        imagefill($im, 0, 0, imagecolorallocate($im, $r, 200, 220));
        ob_start();
        imagejpeg($im);

        return 'data:image/jpeg;base64,'.base64_encode((string) ob_get_clean());
    }

    private function body(): array
    {
        return [
            'prompt' => 'Black and cyan rugby league jersey with Maori patterns',
            'sport' => 'rugby-league', 'garment' => 'jersey', 'source' => 'web', 'reference_ids' => [999],
            'options' => array_map(fn ($i) => [
                'image' => $this->picture($i * 40), 'name' => "Design {$i}", 'description' => 'A look', 'quality' => 'medium',
                'view' => 'presentation', 'direction' => ['front' => 'stripes'], 'design' => ['main' => '#000000', 'garment' => 'jersey'],
            ], [1, 2, 3, 4]),
        ];
    }

    public function test_a_session_is_saved_listed_and_reopened_with_its_pictures(): void
    {
        Storage::fake('local');
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $id = $this->postJson('/api/v1/ai/sessions', $this->body())->assertCreated()->assertJsonPath('data.count', 4)->json('data.id');

        $list = $this->getJson('/api/v1/ai/sessions')->assertOk()->json('data');
        $this->assertCount(1, $list['sessions']);
        $this->assertSame(['Design 1', 'Design 2', 'Design 3', 'Design 4'], $list['sessions'][0]['names']);
        $this->assertStringStartsWith('data:image/jpeg;base64,', $list['sessions'][0]['thumbs'][0]);
        $this->assertSame([], $list['projects']);

        $full = $this->getJson("/api/v1/ai/sessions/{$id}")->assertOk()->json('data');
        $this->assertSame('Black and cyan rugby league jersey with Maori patterns', $full['prompt']);
        $this->assertCount(4, $full['options']);
        $this->assertStringStartsWith('data:image/jpeg;base64,', $full['options'][2]['image']);
        $this->assertSame(['front' => 'stripes'], $full['options'][0]['direction']);
        $this->assertArrayNotHasKey('file', $full['options'][0]);
        // A reference no longer in Assets is not sent back.
        $this->assertSame([], $full['reference_ids']);
    }

    public function test_an_update_keeps_unchanged_pictures_and_replaces_changed_ones(): void
    {
        Storage::fake('local');
        Sanctum::actingAs(User::factory()->create());
        $id = $this->postJson('/api/v1/ai/sessions', $this->body())->json('data.id');
        $before = AiSession::find($id)->options;
        $options = array_map(fn ($o) => collect($o)->except('image')->all(), $this->body()['options']);
        $options[1]['image'] = $this->picture(250);
        $options[1]['quality'] = 'high';
        $this->putJson("/api/v1/ai/sessions/{$id}", ['options' => $options])->assertOk();
        $after = AiSession::find($id)->options;
        $this->assertSame($before[0]['file'], $after[0]['file']);
        $this->assertNotSame($before[1]['file'], $after[1]['file']);
        $this->assertSame('high', $after[1]['quality']);
        $this->assertSame(['Design 1', 'Design 2', 'Design 3', 'Design 4'], array_column($after, 'name'));
        Storage::disk('local')->assertMissing($before[1]['file']);
        Storage::disk('local')->assertExists($after[1]['file']);
    }

    public function test_sessions_are_private_and_deleting_removes_the_pictures(): void
    {
        Storage::fake('local');
        $owner = User::factory()->create();
        Sanctum::actingAs($owner);
        $id = $this->postJson('/api/v1/ai/sessions', $this->body())->json('data.id');
        $file = AiSession::find($id)->options[0]['file'];

        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/v1/ai/sessions/{$id}")->assertNotFound();
        $this->deleteJson("/api/v1/ai/sessions/{$id}")->assertNotFound();
        $this->assertSame([], $this->getJson('/api/v1/ai/sessions')->json('data.sessions'));

        Sanctum::actingAs($owner);
        $this->deleteJson("/api/v1/ai/sessions/{$id}")->assertNoContent();
        Storage::disk('local')->assertMissing($file);
    }

    public function test_guests_and_unreadable_pictures_are_refused(): void
    {
        $this->getJson('/api/v1/ai/sessions')->assertUnauthorized();
        Storage::fake('local');
        Sanctum::actingAs(User::factory()->create());
        $body = $this->body();
        $body['options'] = [['image' => 'data:image/png;base64,'.base64_encode('not a picture'), 'name' => 'X']];
        $this->postJson('/api/v1/ai/sessions', $body)->assertStatus(422);
        $this->postJson('/api/v1/ai/sessions', ['prompt' => 'x'])->assertStatus(422);
    }

    public function test_the_latest_projects_come_with_the_strip(): void
    {
        $user = User::factory()->create();
        $user->projects()->create(['name' => 'Club kit', 'sport' => 'soccer', 'garment' => 'jersey', 'mode' => 'dyo', 'status' => 'draft', 'design' => ['main' => '#111111'], 'version' => 1]);
        Sanctum::actingAs($user);
        $this->getJson('/api/v1/ai/sessions')->assertOk()->assertJsonPath('data.projects.0.name', 'Club kit');
    }
}
