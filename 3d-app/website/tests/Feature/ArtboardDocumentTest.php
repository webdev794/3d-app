<?php

namespace Tests\Feature;

use App\Models\ArtboardDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** 5.119: the Artboard's designs and templates in the account; 5.66: artwork on a kit remembers its design. */
class ArtboardDocumentTest extends TestCase
{
    use RefreshDatabase;

    private const PREVIEW = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U';

    /** An Artboard document as the Artboard saves it: the page on screen plus, with more pages, every page. */
    private function document(int $pages = 1): string
    {
        $text = ['type' => 'IText', 'text' => 'LIONS', 'left' => 120, 'top' => 120, 'fontFamily' => 'Rajdhani', 'num' => 1];
        $doc = ['page' => [120, 120], 'guides' => [], 'objects' => [$text]];
        if ($pages > 1) {
            $doc['pages'] = array_map(fn ($i) => ['name' => "Page $i", 'objects' => $i === 1 ? null : []], range(1, $pages));
            $doc['current'] = 0;
        }

        return json_encode($doc, JSON_THROW_ON_ERROR);
    }

    public function test_a_design_is_saved_listed_opened_saved_again_and_deleted(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $saved = $this->postJson('/api/v1/artboards', ['name' => 'Lions crest', 'document' => $this->document(2), 'preview' => self::PREVIEW])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Lions crest')
            ->assertJsonPath('data.template', false)
            ->assertJsonPath('data.pages', 2)
            ->assertJsonPath('data.version', 1)
            ->assertJsonMissingPath('data.document');
        $id = $saved->json('data.id');

        // The list has the name, the picture and the page count, never the design itself.
        $this->getJson('/api/v1/artboards?template=0')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $id)
            ->assertJsonPath('data.0.preview', self::PREVIEW)
            ->assertJsonMissingPath('data.0.document');

        // Opening it gives back exactly what was saved, every page included.
        $this->getJson("/api/v1/artboards/$id")->assertOk()
            ->assertJsonPath('data.document', $this->document(2))
            ->assertJsonPath('data.name', 'Lions crest');

        // Saving again (opened at version 1) makes version 2; the same version again is out of date: 409.
        $this->patchJson("/api/v1/artboards/$id", ['name' => 'Lions crest v2', 'document' => $this->document(3), 'expected_version' => 1])
            ->assertOk()->assertJsonPath('data.version', 2)->assertJsonPath('data.pages', 3)->assertJsonPath('data.name', 'Lions crest v2');
        $this->patchJson("/api/v1/artboards/$id", ['document' => $this->document(), 'expected_version' => 1])
            ->assertStatus(409)->assertJsonPath('message', 'This design was changed somewhere else since you opened it (in another tab or in the app).');
        $this->assertSame(3, ArtboardDocument::find($id)->pages);
        // Nothing changed: the version stays.
        $this->patchJson("/api/v1/artboards/$id", ['name' => 'Lions crest v2'])->assertOk()->assertJsonPath('data.version', 2);

        $this->deleteJson("/api/v1/artboards/$id")->assertOk();
        $this->getJson("/api/v1/artboards/$id")->assertNotFound();
        $this->assertDatabaseCount('artboard_documents', 0);
    }

    public function test_templates_are_kept_apart_from_designs(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/artboards', ['name' => 'Home crest', 'document' => $this->document()])->assertCreated();
        $this->postJson('/api/v1/artboards', ['name' => 'Club badge layout', 'document' => $this->document(), 'template' => true])
            ->assertCreated()->assertJsonPath('data.template', true);

        $this->getJson('/api/v1/artboards?template=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Club badge layout');
        $this->getJson('/api/v1/artboards?template=0')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Home crest');
        $this->getJson('/api/v1/artboards')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_each_account_sees_and_changes_only_its_own_designs(): void
    {
        $owner = User::factory()->create();
        Sanctum::actingAs($owner);
        $id = $this->postJson('/api/v1/artboards', ['name' => 'Private crest', 'document' => $this->document()])->json('data.id');

        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/v1/artboards')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/artboards/$id")->assertNotFound();
        $this->patchJson("/api/v1/artboards/$id", ['name' => 'Taken'])->assertNotFound();
        $this->deleteJson("/api/v1/artboards/$id")->assertNotFound();
        $this->assertSame('Private crest', ArtboardDocument::find($id)->name);
    }

    public function test_signed_out_visitors_are_refused(): void
    {
        $this->getJson('/api/v1/artboards')->assertUnauthorized();
        $this->postJson('/api/v1/artboards', ['name' => 'X', 'document' => $this->document()])->assertUnauthorized();
    }

    public function test_only_artboard_designs_are_accepted(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $refused = fn (array $body, string $field) => $this->postJson('/api/v1/artboards', $body + ['name' => 'Crest', 'document' => $this->document()])
            ->assertUnprocessable()->assertJsonValidationErrors($field);

        $refused(['document' => '{not json'], 'document');
        $refused(['document' => '[1, 2]'], 'document');
        $refused(['document' => '{"page": [120, 120]}'], 'document');
        $refused(['document' => '{"objects": {"a": 1}}'], 'document');
        $refused(['document' => '{"objects": [], "page": "A4"}'], 'document');
        $refused(['document' => '{"objects": [], "pages": "two"}'], 'document');
        $refused(['name' => ''], 'name');
        $refused(['name' => str_repeat('x', 121)], 'name');
        $refused(['preview' => 'https://example.com/crest.png'], 'preview');
        $refused(['preview' => 'data:image/svg+xml;base64,PHN2Zz4='], 'preview');
        $this->postJson('/api/v1/artboards', ['name' => 'Crest'])->assertUnprocessable()->assertJsonValidationErrors('document');

        // Too big for the account: says so in plain words.
        $big = '{"objects": [], "x": "'.str_repeat('a', ArtboardDocument::MAX_DOCUMENT).'"}';
        $this->postJson('/api/v1/artboards', ['name' => 'Huge', 'document' => $big])
            ->assertUnprocessable()->assertJsonPath('errors.document.0', 'This design is too large to keep in your account (over 20 MB). Make the big pictures in it smaller, or delete some, and save again.');
        $this->assertDatabaseCount('artboard_documents', 0);
    }

    public function test_an_account_keeps_a_limited_number_of_designs(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $now = now();
        ArtboardDocument::insert(array_map(fn ($i) => ['user_id' => $user->id, 'name' => "Design $i", 'document' => '{"objects":[]}', 'created_at' => $now, 'updated_at' => $now], range(1, ArtboardDocument::MAX_PER_USER)));

        $this->postJson('/api/v1/artboards', ['name' => 'One more', 'document' => $this->document()])
            ->assertUnprocessable()->assertJsonPath('message', 'Your account keeps up to 300 Artboard designs and templates. Delete some you no longer need (File > Open from my account), then save again.');
    }

    public function test_artwork_on_a_kit_remembers_its_artboard_design(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $layer = ['id' => 'art-1', 'type' => 'image', 'name' => 'Lions crest', 'part' => 'top', 'side' => 'front', 'x' => 0.105, 'y' => 0.6, 'w' => 0.075, 'src' => 'data:image/png;base64,iVBORw0KGgo=', 'artboard' => 7];
        $project = [
            'name' => 'Lions Home', 'sport' => 'rugby-league', 'garment' => 'jersey', 'mode' => 'dyo',
            'design' => ['main' => '#07101E', 'secondary' => '#05D9E8', 'accent' => '#7757FF', 'pattern' => 'Chevron', 'logoText' => 'LIONS', 'number' => '9', 'layers' => [$layer]],
        ];
        $id = $this->postJson('/api/v1/projects', $project)->assertCreated()->assertJsonPath('data.design.layers.0.artboard', 7)->json('data.id');
        $this->getJson("/api/v1/projects/$id")->assertOk()->assertJsonPath('data.design.layers.0.artboard', 7);

        $project['design']['layers'][0]['artboard'] = 'crest';
        $this->postJson('/api/v1/projects', $project)->assertUnprocessable()->assertJsonValidationErrors('design.layers.0.artboard');
    }
}
