<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use App\Services\OpenAiDesigner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The netball dress (tasks.md 9.126): a women's fitted dress, its own 3D garment. The Netball dress tile uses it,
 * designs on it save and reopen (with a design picture on it), the AI reading can name it and orders list it on a
 * singlet row named "Netball dress".
 */
class NetballDressTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_netball_dress_is_a_garment_and_the_netball_tile_uses_it(): void
    {
        $this->assertContains('netball-dress', array_column(config('catalog.garments'), 'id'));
        $netball = collect(config('catalog.sports'))->firstWhere('id', 'netball');
        $this->assertSame(['name' => 'Netball dress', 'garment' => 'netball-dress', 'fit' => 'exact'], array_intersect_key($netball['tiles'][0], array_flip(['name', 'garment', 'fit'])));
        $this->assertSame('netball-dress', $netball['garments'][0]);
        // Netball keeps its marking rules: no names or numbers, the position letters instead.
        $this->assertArrayHasKey('netball-dress', OpenAiDesigner::READ_GARMENTS);
    }

    public function test_a_netball_dress_saves_and_reopens_with_its_design_picture(): void
    {
        Storage::fake('local');
        Sanctum::actingAs(User::factory()->create());
        // The print sheet, kept as one of the user's assets (as the AI designer keeps it).
        $asset = $this->postJson('/api/v1/assets', ['name' => 'Panthers print sheet', 'type' => 'reference', 'file' => UploadedFile::fake()->image('sheet.png', 60, 40)])
            ->assertCreated()->json('data.id');
        $design = [
            'garment' => 'netball-dress', 'main' => '#0b0b0b', 'secondary' => '#f2b230', 'accent' => '#ffffff', 'pattern' => 'Velocity',
            'logoText' => 'PANTHERS', 'backName' => '', 'number' => 'GS', 'productName' => 'Netball dress',
            'zones' => ['sides' => 'Solid', 'hem' => 'Solid'],
            'layers' => [['id' => 'position-front', 'name' => 'Position letters', 'type' => 'text', 'part' => 'top', 'side' => 'front', 'x' => 0, 'y' => 0.5, 'text' => 'GS', 'size' => 0.17]],
            'layout' => ['asset' => $asset, 'name' => 'Panthers print sheet', 'roles' => ['back', 'front'], 'kind' => 'drawing', 'parts' => ['netball-dress']],
        ];
        $id = $this->postJson('/api/v1/projects', ['name' => 'Panthers', 'sport' => 'netball', 'garment' => 'netball-dress', 'mode' => 'ai', 'design' => $design])
            ->assertCreated()->json('data.id');
        $this->getJson("/api/v1/projects/{$id}")->assertOk()
            ->assertJsonPath('data.garment', 'netball-dress')
            ->assertJsonPath('data.design.garment', 'netball-dress')
            ->assertJsonPath('data.design.layout.parts.0', 'netball-dress')
            ->assertJsonPath('data.design.layers.0.y', 0.5)
            ->assertJsonPath('data.design.productName', 'Netball dress');
    }

    public function test_orders_list_the_dress_on_a_singlet_row_named_netball_dress(): void
    {
        $this->assertSame('singlet', Order::PROJECT_ROWS['netball-dress']);
        $this->assertTrue(Order::isDesignRow('netball-dress', 'singlet'));
        $this->assertFalse(Order::isDesignRow('netball-dress', 'jersey'));
    }
}
