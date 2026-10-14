<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConvertCdrTest extends TestCase
{
    use RefreshDatabase;

    private function cdrFile(string $head = 'RIFF'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('kit-art.cdr', $head.'xxxxCDRAvrsn'.str_repeat('0', 200));
    }

    public function test_formats_say_whether_cdr_conversion_is_available_without_signing_in(): void
    {
        config(['services.cdr' => ['converter_url' => null, 'soffice' => null, 'cloudconvert' => null]]);
        $this->getJson('/api/v1/convert/formats')->assertOk()->assertJsonPath('data.cdr', false);
        config(['services.cdr.cloudconvert' => 'test-key']);
        $this->getJson('/api/v1/convert/formats')->assertOk()->assertJsonPath('data.cdr', true);
    }

    public function test_requires_authentication(): void
    {
        $this->postJson('/api/v1/convert/cdr', ['file' => $this->cdrFile()])->assertUnauthorized();
    }

    public function test_rejects_non_cdr_files(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/convert/cdr', ['file' => UploadedFile::fake()->create('logo.png', 10)])
            ->assertStatus(422);
        $this->postJson('/api/v1/convert/cdr', ['file' => UploadedFile::fake()->createWithContent('fake.cdr', 'not a riff file at all')])
            ->assertStatus(422);
    }

    public function test_explains_when_no_converter_is_configured(): void
    {
        config(['services.cdr' => ['converter_url' => null, 'soffice' => null, 'cloudconvert' => null]]);
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/convert/cdr', ['file' => $this->cdrFile()])
            ->assertStatus(503)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'Export the file as SVG'));
    }

    public function test_converts_via_microservice_and_strips_scripts(): void
    {
        config(['services.cdr.converter_url' => 'https://convert.test/cdr']);
        Http::fake(['https://convert.test/*' => Http::response('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>')]);
        Sanctum::actingAs(User::factory()->create());
        $response = $this->postJson('/api/v1/convert/cdr', ['file' => $this->cdrFile()])->assertOk();
        $this->assertStringContainsString('<svg', $response->json('data.svg'));
        $this->assertStringContainsString('<rect', $response->json('data.svg'));
        $this->assertStringNotContainsString('<script', $response->json('data.svg'));
        $this->assertSame('kit-art', $response->json('data.name'));
    }

    public function test_reports_unreadable_files_from_the_converter(): void
    {
        config(['services.cdr.converter_url' => 'https://convert.test/cdr']);
        Http::fake(['https://convert.test/*' => Http::response('ERROR: unsupported version')]);
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/convert/cdr', ['file' => $this->cdrFile()])
            ->assertStatus(502)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'version compatibility'));
    }
}
