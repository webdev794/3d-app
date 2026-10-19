<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Factory print layouts (Studio › Artwork › Factory print layout): the file is kept as an asset, the project keeps how it is used. */
class PrintLayoutTest extends TestCase
{
    use RefreshDatabase;

    private const PDF = "%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n";

    private function uploadPdf(): int
    {
        return $this->postJson('/api/v1/assets', [
            'name' => 'LEOPARDS NEW', 'type' => 'layout',
            'file' => UploadedFile::fake()->createWithContent('LEOPARDS NEW.pdf', self::PDF),
        ])->assertCreated()->assertJsonPath('data.type', 'layout')->assertJsonPath('data.mime_type', 'application/pdf')->json('data.id');
    }

    private function project(array $layout): array
    {
        return [
            'name' => 'Leopards training', 'sport' => 'rugby-league', 'garment' => 'fullkit', 'mode' => 'dyo',
            'design' => ['main' => '#1d2346', 'secondary' => '#00a5c8', 'accent' => '#ffffff', 'pattern' => 'Solid', 'layout' => $layout],
        ];
    }

    public function test_a_print_layout_pdf_or_svg_is_kept_as_an_asset_and_served_without_powers(): void
    {
        Storage::fake('local');
        Sanctum::actingAs(User::factory()->create());
        $id = $this->uploadPdf();
        $this->get('/api/v1/assets/'.$id.'/file')->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        $this->postJson('/api/v1/assets', [
            'type' => 'layout', 'file' => UploadedFile::fake()->createWithContent('layout.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'),
        ])->assertCreated();
        // Only as a layout: a PDF or SVG is still not a logo.
        $this->postJson('/api/v1/assets', [
            'type' => 'logo', 'file' => UploadedFile::fake()->createWithContent('logo.pdf', self::PDF),
        ])->assertUnprocessable()->assertJsonValidationErrors('file');
        $this->postJson('/api/v1/assets', [
            'type' => 'layout', 'file' => UploadedFile::fake()->create('script.php', 2, 'application/x-httpd-php'),
        ])->assertUnprocessable()->assertJsonValidationErrors('file');
    }

    public function test_a_project_keeps_its_print_layout_and_reopens_with_it(): void
    {
        Storage::fake('local');
        Sanctum::actingAs(User::factory()->create());
        $layout = ['asset' => $this->uploadPdf(), 'name' => 'LEOPARDS NEW.pdf', 'roles' => ['neck', 'back', 'front', 'sleeveL', 'sleeveR', 'legR', 'legL'], 'hemFold' => true, 'joinLines' => true, 'parts' => ['shorts', 'raglan']];
        $id = $this->postJson('/api/v1/projects', $this->project($layout))->assertCreated()->json('data.id');
        $this->getJson('/api/v1/projects/'.$id)->assertOk()->assertJsonPath('data.design.layout', $layout);
        // Remove print layout.
        $this->patchJson('/api/v1/projects/'.$id, ['design' => [...$this->project($layout)['design'], 'layout' => null]])->assertOk()->assertJsonPath('data.design.layout', null);
    }

    public function test_a_layout_must_be_the_users_own_file_with_known_parts(): void
    {
        Storage::fake('local');
        Sanctum::actingAs(User::factory()->create());
        $theirs = $this->uploadPdf();
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/projects', $this->project(['asset' => $theirs, 'name' => 'x.pdf', 'roles' => ['front']]))
            ->assertUnprocessable()->assertJsonValidationErrors('design.layout.asset');
        $mine = $this->uploadPdf();
        $this->postJson('/api/v1/projects', $this->project(['asset' => $mine, 'name' => 'x.pdf', 'roles' => ['front', 'cape'], 'parts' => ['skirt'], 'extra' => 1]))
            ->assertUnprocessable()->assertJsonValidationErrors(['design.layout', 'design.layout.roles.1', 'design.layout.parts.0']);
    }

    public function test_administrators_can_read_any_file_others_cannot(): void
    {
        Storage::fake('local');
        Sanctum::actingAs(User::factory()->create());
        $id = $this->uploadPdf();
        Sanctum::actingAs(User::factory()->create());
        $this->get('/api/v1/assets/'.$id.'/file')->assertNotFound();
        $admin = User::factory()->create();
        $admin->is_admin = true;
        $admin->save();
        Sanctum::actingAs($admin);
        $this->get('/api/v1/assets/'.$id.'/file')->assertOk()->assertHeader('Content-Type', 'application/pdf');
        // Reading is all: an administrator does not delete a customer's file through this route.
        $this->deleteJson('/api/v1/assets/'.$id)->assertNotFound();
    }
}
