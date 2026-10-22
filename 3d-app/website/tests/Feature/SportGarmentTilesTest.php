<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\User;
use App\Services\Pricing\BillingSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Payments\PaymentFixtures;
use Tests\TestCase;

/** Garments per sport (task 9.99, client visuals images/157.jpg and 160.jpg): config/catalog.php 'tiles'. */
class SportGarmentTilesTest extends TestCase
{
    use PaymentFixtures, RefreshDatabase;

    public function test_every_sport_has_its_own_tiles_on_real_3d_garments_or_coming_soon(): void
    {
        $garments = array_column(config('catalog.garments'), 'id');
        foreach (config('catalog.sports') as $sport) {
            $id = $sport['id'];
            $tiles = $sport['tiles'] ?? [];
            $this->assertGreaterThanOrEqual(6, count($tiles), $id);
            $this->assertLessThanOrEqual(11, count($tiles), $id);
            $names = array_column($tiles, 'name');
            $this->assertSame(count($names), count(array_unique($names)), "$id: tile names are unique");
            foreach ($tiles as $tile) {
                $where = "$id: {$tile['name']}";
                foreach (['name', 'description', 'garment', 'fit', 'image'] as $key) {
                    $this->assertArrayHasKey($key, $tile, "$where: $key");
                }
                $this->assertNotSame('', trim($tile['name']), $where);
                $this->assertNotSame('', trim($tile['description']), $where);
                $this->assertContains($tile['fit'], ['exact', 'nearest', 'soon'], $where);
                if ($tile['fit'] === 'soon') {
                    // Not selectable: no 3D garment, and the garment still to build is named.
                    $this->assertNull($tile['garment'], $where);
                    $this->assertNotEmpty($tile['future'] ?? null, $where);
                } else {
                    $this->assertContains($tile['garment'], $garments, $where);
                }
                if ($tile['fit'] === 'nearest') {
                    $this->assertNotEmpty($tile['future'] ?? null, $where);
                }
                $this->assertFileExists(public_path("media/showroom/garment-{$tile['image']}.webp"), $where);
                $this->assertFileExists(base_path("../assets/images/showroom/garment-{$tile['image']}.webp"), "$where (app)");
            }
            // The sport's garments are worked out from its tiles, in tile order (one list, never two).
            $this->assertSame(array_values(array_unique(array_filter(array_column($tiles, 'garment')))), $sport['garments'], $id);
            $this->assertNotEmpty($sport['garments'], $id);
        }
    }

    public function test_netball_and_rugby_are_the_clients_lists(): void
    {
        $sports = collect(config('catalog.sports'))->keyBy('id');
        $netball = $sports['netball']['tiles'];
        $this->assertSame(['Netball dress', 'Netball skirt', 'Singlet with bib', 'Training singlet', 'Training T-shirt', 'Netball bibs', 'Tracksuit', 'Hoodie'], array_column($netball, 'name'));
        $this->assertSame(['singlet', null, 'singlet', 'singlet', 'tee', 'singlet', 'trackjacket', 'hoodie'], array_column($netball, 'garment'));
        $this->assertSame('Fitted netball dress with skirt hem.', $netball[0]['description']);
        $this->assertSame(['nearest', 'soon'], [$netball[0]['fit'], $netball[1]['fit']]);
        $this->assertNotSame(false, $sports['netball']['more'] ?? true);

        $league = $sports['rugby-league'];
        $this->assertSame(['Rugby League Kit', 'Jersey', 'Playing Shorts', 'Socks', 'Polo', 'Training Tee', 'Training Shorts', 'Hooded Tracksuit', 'Cap', 'Bucket Hat', 'Waterproof Jacket'], array_column($league['tiles'], 'name'));
        $this->assertSame('fullkit', $league['tiles'][0]['garment']);
        $this->assertSame(['trackStyle' => 'hood'], $league['tiles'][7]['design']);
        $this->assertSame([null, null, null], [$league['tiles'][3]['garment'], $league['tiles'][8]['garment'], $league['tiles'][9]['garment']]);
        $this->assertFalse($league['more']);
        // Rugby (union): the same list, under its own heading.
        $union = $sports['rugby-union'];
        $this->assertSame('Rugby', $union['heading']);
        $this->assertSame('Rugby Kit', $union['tiles'][0]['name']);
        $this->assertSame(array_slice(array_column($league['tiles'], 'name'), 1), array_slice(array_column($union['tiles'], 'name'), 1));
    }

    public function test_the_public_catalogue_sends_the_tiles(): void
    {
        $this->getJson('/api/v1/catalog')->assertOk()
            ->assertJsonPath('data.sports.4.id', 'netball')
            ->assertJsonPath('data.sports.4.tiles.0.name', 'Netball dress')
            ->assertJsonPath('data.sports.4.tiles.0.garment', 'singlet')
            ->assertJsonPath('data.sports.4.tiles.1.fit', 'soon');
    }

    public function test_a_project_keeps_the_tile_name_and_its_orders_use_it(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $design = ['garment' => 'singlet', 'main' => '#0b1016', 'secondary' => '#00c2cc', 'accent' => '#36e3ee', 'pattern' => 'Solid', 'productName' => 'Netball dress'];
        $id = $this->postJson('/api/v1/projects', ['name' => 'Firebirds', 'sport' => 'netball', 'garment' => 'singlet', 'mode' => 'dyo', 'design' => $design])
            ->assertCreated()->assertJsonPath('data.garment', 'singlet')->assertJsonPath('data.design.productName', 'Netball dress')->json('data.id');
        $this->postJson('/api/v1/projects', ['name' => 'Too long', 'sport' => 'netball', 'garment' => 'singlet', 'design' => ['productName' => str_repeat('x', 61)] + $design])
            ->assertJsonValidationErrors('design.productName');

        // The order form: the row is named after the design's garment.
        $form = ['source' => 'form', 'contact_name' => 'Fab', 'contact_email' => 'fab@example.test', 'phone' => '0400 000 000', 'team_name' => 'Firebirds',
            'needed_by' => now()->addWeeks(6)->toDateString(), 'delivery' => 'pickup',
            'items' => [['garment' => 'singlet', 'sport' => 'netball', 'fit' => 'womens', 'project_id' => $id, 'sizes' => ['M' => 3]], ['garment' => 'shorts', 'sport' => 'netball', 'sizes' => ['M' => 3]]]];
        $this->postJson('/api/v1/orders', $form, ['Idempotency-Key' => 'tile-form-1'])->assertCreated()
            ->assertJsonPath('data.items.0.label', 'Netball dress')
            ->assertJsonPath('data.garments.0.name', 'Netball dress')
            ->assertJsonPath('data.garments.1.name', 'Netball Shorts');

        // "Order this kit" in the Studio: the kit is named after it too.
        $this->postJson('/api/v1/orders', ['project_id' => $id, 'contact_name' => 'Fab', 'design_final' => true, 'names' => 'none', 'sizes' => ['M' => 2]], ['Idempotency-Key' => 'tile-kit-1'])
            ->assertCreated()->assertJsonPath('data.garments.0.garment', 'singlet')->assertJsonPath('data.garments.0.name', 'Netball dress');
        $this->getJson('/api/v1/orders')->assertOk()->assertJsonPath('data.0.garments.0.name', 'Netball dress');
    }

    public function test_the_invoice_and_its_pdf_name_the_tile(): void
    {
        Bus::withoutDispatchingAfterResponses();
        BillingSettings::flush();
        $this->rule(['kind' => 'garment', 'code' => 'singlet', 'name' => 'Singlet', 'amount_cents' => 4000]);
        $this->rule(['kind' => 'shipping', 'code' => 'AU', 'name' => 'Australia', 'amount_cents' => 1000, 'taxable' => true]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $design = ['garment' => 'singlet', 'main' => '#0b1016', 'secondary' => '#00c2cc', 'accent' => '#36e3ee', 'pattern' => 'Solid', 'productName' => 'Netball bibs'];
        $id = $this->postJson('/api/v1/projects', ['name' => 'Firebirds', 'sport' => 'netball', 'garment' => 'singlet', 'mode' => 'dyo', 'design' => $design])->assertCreated()->json('data.id');

        // The order form, sent: its invoice line, the pay page's invoice and the PDF say "Netball bibs".
        $form = ['source' => 'form', 'contact_name' => 'Fab', 'contact_email' => 'fab@example.test', 'phone' => '0400 000 000', 'team_name' => 'Firebirds',
            'needed_by' => now()->addWeeks(6)->toDateString(), 'delivery' => 'pickup',
            'items' => [['garment' => 'singlet', 'sport' => 'netball', 'project_id' => $id, 'sizes' => ['M' => 5]]]];
        $this->postJson('/api/v1/orders', $form, ['Idempotency-Key' => 'tile-invoice-1'])->assertCreated();
        $invoice = Invoice::latest('id')->first();
        $this->assertNotNull($invoice, 'a priced order gets its invoice');
        $this->assertStringContainsString('Netball bibs', json_encode($invoice->snapshot));
        $this->getJson("/api/v1/invoices/{$invoice->number}")->assertOk()->assertSee('Netball bibs');
        $pdf = $this->get("/api/v1/invoices/{$invoice->number}/pdf")->assertOk()->getContent();
        $this->assertSame(1, preg_match('/stream\n(.*?)\nendstream/s', $pdf, $page));
        $this->assertStringContainsString('(Netball bibs', (string) gzuncompress($page[1]), 'the PDF line');

        // My projects: the search finds it by the tile name (the list carries the design).
        $this->getJson('/api/v1/projects')->assertOk()->assertJsonPath('data.0.design.productName', 'Netball bibs');
    }
}
