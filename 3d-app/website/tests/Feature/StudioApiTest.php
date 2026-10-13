<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StudioApiTest extends TestCase
{
    use RefreshDatabase;

    private function project(array $overrides = []): array
    {
        return array_replace([
            'name' => 'Falcons Home',
            'sport' => 'rugby-league',
            'garment' => 'jersey',
            'mode' => 'dyo',
            'design' => [
                'main' => '#07101E',
                'secondary' => '#05D9E8',
                'accent' => '#7757FF',
                'pattern' => 'Chevron',
                'logoText' => 'FALCONS',
                'backName' => 'SMITH',
                'number' => '12',
            ],
        ], $overrides);
    }

    public function test_registration_login_and_token_revocation(): void
    {
        $registration = $this->postJson('/api/v1/auth/register', [
            'name' => 'Team Captain', 'email' => 'Captain@example.test',
            'password' => 'secure-password', 'password_confirmation' => 'secure-password',
        ])->assertCreated()->assertJsonPath('data.user.email', 'captain@example.test');
        $token = $registration->json('data.token');
        $this->assertDatabaseCount('personal_access_tokens', 1);
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.name', 'Team Captain');
        $this->withToken($token)->postJson('/api/v1/auth/logout')->assertOk();
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertUnauthorized();

        $this->postJson('/api/v1/auth/login', ['email' => 'captain@example.test', 'password' => 'wrong'])
            ->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->postJson('/api/v1/auth/login', ['email' => 'CAPTAIN@example.test', 'password' => 'secure-password'])
            ->assertOk()->assertJsonStructure(['data' => ['user', 'token', 'expires_at']]);
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Duplicate', 'email' => 'CAPTAIN@example.test',
            'password' => 'secure-password', 'password_confirmation' => 'secure-password',
        ])->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_authentication_is_required_even_without_accept_header(): void
    {
        $this->get('/api/v1/projects')->assertUnauthorized()->assertJsonPath('message', 'Unauthenticated.');
    }

    public function test_catalogue_and_honest_concept_provider(): void
    {
        $this->getJson('/api/v1/catalog')->assertOk()->assertJsonPath('data.provider.is_ai', false);
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/concepts', [
            'prompt' => 'Black and red striped football shirt',
            'sport' => 'football', 'garment' => 'jersey',
        ])->assertOk()
            ->assertJsonCount(4, 'data.concepts')
            ->assertJsonPath('data.provider.is_ai', false)
            ->assertJsonPath('data.concepts.0.design.pattern', 'Stripes')
            ->assertJsonPath('data.concepts.0.design.main', '#09121E')
            ->assertJsonPath('data.concepts.0.design.secondary', '#EF4444');
    }

    public function test_projects_create_update_version_export_and_delete(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $created = $this->postJson('/api/v1/projects', $this->project())->assertCreated()->assertJsonPath('data.version', 1);
        $id = $created->json('data.id');
        $this->getJson('/api/v1/projects')->assertOk()->assertJsonCount(1, 'data');
        $this->patchJson('/api/v1/projects/'.$id, ['name' => 'Falcons Away', 'expected_version' => 1])
            ->assertOk()->assertJsonPath('data.version', 2);
        $this->patchJson('/api/v1/projects/'.$id, ['name' => 'Stale save', 'expected_version' => 1])->assertConflict();
        $this->patchJson('/api/v1/projects/'.$id, ['status' => 'approved'])->assertOk()->assertJsonPath('data.version', 3);
        $this->getJson('/api/v1/projects/'.$id.'/versions')->assertOk()->assertJsonCount(3, 'data')
            ->assertJsonPath('data.2.name', 'Falcons Home');
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.projects', 1)->assertJsonPath('data.approved', 1);
        $export = $this->get('/api/v1/projects/'.$id.'/export')->assertOk()->assertDownload('3deezi-project-'.$id.'-v3.json');
        $this->assertSame('Falcons Away', json_decode($export->streamedContent(), true)['project']['name']);
        $this->deleteJson('/api/v1/projects/'.$id)->assertOk();
        $this->assertDatabaseCount('project_versions', 0);
        $this->getJson('/api/v1/projects/'.$id)->assertNotFound();
    }

    public function test_other_users_cannot_read_modify_export_or_delete_a_project(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $id = $this->postJson('/api/v1/projects', $this->project())->json('data.id');
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/v1/projects')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/dashboard')->assertJsonPath('data.projects', 0);
        $this->getJson('/api/v1/projects/'.$id)->assertNotFound();
        $this->getJson('/api/v1/projects/'.$id.'/versions')->assertNotFound();
        $this->getJson('/api/v1/projects/'.$id.'/export')->assertNotFound();
        $this->patchJson('/api/v1/projects/'.$id, ['name' => 'Stolen'])->assertNotFound();
        $this->deleteJson('/api/v1/projects/'.$id)->assertNotFound();
    }

    public function test_invalid_designs_and_privilege_fields_are_rejected_or_ignored(): void
    {
        Sanctum::actingAs($owner = User::factory()->create());
        $invalid = $this->project(['sport' => 'not-a-sport', 'status' => 'admin']);
        $invalid['design']['main'] = 'javascript:alert(1)';
        $this->postJson('/api/v1/projects', $invalid)->assertUnprocessable()->assertJsonValidationErrors(['sport', 'status', 'design.main']);
        $withExtraField = $this->project();
        $withExtraField['design']['unexpected'] = 'blocked';
        $this->postJson('/api/v1/projects', $withExtraField)->assertUnprocessable()->assertJsonValidationErrors('design');
        $other = User::factory()->create();
        $id = $this->postJson('/api/v1/projects', $this->project(['user_id' => $other->id, 'version' => 99]))
            ->assertCreated()->assertJsonPath('data.version', 1)->json('data.id');
        $this->assertDatabaseHas('projects', ['id' => $id, 'user_id' => $owner->id]);
    }

    public function test_uploads_are_private_and_owner_scoped(): void
    {
        Storage::fake('local');
        Sanctum::actingAs($owner = User::factory()->create());
        $upload = $this->postJson('/api/v1/assets', [
            'name' => 'Club badge', 'type' => 'logo',
            'file' => UploadedFile::fake()->createWithContent('badge.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')),
        ])->assertCreated()->assertJsonPath('data.mime_type', 'image/png');
        $id = $upload->json('data.id');
        $this->getJson('/api/v1/assets')->assertJsonCount(1, 'data');
        $this->get('/api/v1/assets/'.$id.'/file')->assertOk()->assertHeader('Content-Type', 'image/png');
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/v1/assets')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/assets/'.$id.'/file')->assertNotFound();
        $this->deleteJson('/api/v1/assets/'.$id)->assertNotFound();
        Sanctum::actingAs($owner);
        $this->deleteJson('/api/v1/assets/'.$id)->assertOk();
        $this->assertDatabaseCount('assets', 0);
        $this->assertCount(0, Storage::disk('local')->allFiles());
    }

    public function test_executable_and_svg_uploads_are_rejected(): void
    {
        Storage::fake('local');
        Sanctum::actingAs(User::factory()->create());
        foreach (['malicious.svg' => 'image/svg+xml', 'script.php' => 'application/x-httpd-php'] as $name => $mime) {
            $this->postJson('/api/v1/assets', [
                'type' => 'logo', 'file' => UploadedFile::fake()->create($name, 2, $mime),
            ])->assertUnprocessable()->assertJsonValidationErrors('file');
        }
    }

    public function test_profile_update_does_not_accept_privileged_fields(): void
    {
        Sanctum::actingAs($user = User::factory()->create());
        $this->patchJson('/api/v1/auth/me', ['name' => 'New captain', 'email' => 'other@example.test', 'is_admin' => true])
            ->assertOk()->assertJsonPath('data.name', 'New captain')->assertJsonPath('data.email', $user->email);
    }

    public function test_svg_export_escapes_user_content_and_rejects_unknown_formats(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $project = $this->project(['name' => 'Team <script>alert(1)</script>']);
        $project['design']['logoText'] = '<script>alert(2)</script>';
        $id = $this->postJson('/api/v1/projects', $project)->assertCreated()->json('data.id');
        $svg = $this->get('/api/v1/projects/'.$id.'/export?format=svg')
            ->assertOk()->assertDownload('3deezi-project-'.$id.'-v1.svg')->getContent();
        $this->assertStringContainsString('&lt;script&gt;', $svg);
        $this->assertStringNotContainsString('<script>', $svg);
        $this->assertNotFalse(simplexml_load_string($svg));
        $this->getJson('/api/v1/projects/'.$id.'/export?format=pdf')->assertUnprocessable();
    }

    public function test_concept_references_require_ownership_and_are_not_claimed_to_be_analysed(): void
    {
        Sanctum::actingAs($owner = User::factory()->create());
        $asset = $owner->assets()->create(['name' => 'Reference', 'type' => 'reference', 'path' => 'fake.png', 'mime_type' => 'image/png', 'size' => 10]);
        $brief = ['prompt' => 'A black and cyan home jersey', 'sport' => 'rugby-league', 'garment' => 'jersey', 'reference_ids' => [$asset->id]];
        $this->postJson('/api/v1/concepts', $brief)->assertOk()->assertJsonPath('data.reference_images_analyzed', false);
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/concepts', $brief)->assertUnprocessable()->assertJsonValidationErrors('reference_ids.0');
    }
}
