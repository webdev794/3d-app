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
            $this->assertLessThanOrEqual(16, count($tiles), $id);
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
        // The dress is its own 3D garment since task 9.126.
        $this->assertSame(['netball-dress', null, 'singlet', 'singlet', 'tee', 'singlet', 'trackjacket', 'hoodie'], array_column($netball, 'garment'));
        $this->assertSame('Fitted netball dress with skirt hem.', $netball[0]['description']);
        $this->assertSame(['exact', 'soon'], [$netball[0]['fit'], $netball[1]['fit']]);
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

    /** The client's own tile pictures (images/161.jpg, 157.jpg), cut out on a transparent background (no CSS edge fade). */
    public function test_rugby_and_netball_show_the_clients_own_pictures(): void
    {
        $sports = collect(config('catalog.sports'))->keyBy('id');
        foreach (['rugby-league' => 'rugby-', 'rugby-union' => 'rugby-', 'netball' => 'netball-', 'american-football' => 'nfl-'] as $id => $prefix) {
            $images = array_column($sports[$id]['tiles'], 'image');
            $this->assertSame(count($images), count(array_unique($images)), "$id: one picture per tile");
            foreach ($images as $image) {
                $this->assertStringStartsWith($prefix, $image, $id);
                $file = public_path("media/showroom/garment-$image.webp");
                $this->assertFileEquals($file, base_path("../assets/images/showroom/garment-$image.webp"), "$id: $image (app copy)");
                $this->assertSame('VP8X', substr((string) file_get_contents($file, false, null, 12, 4), 0, 4), "$id: $image has an alpha channel");
            }
        }
        $this->assertSame('rugby-kit', $sports['rugby-league']['tiles'][0]['image']);
        $this->assertSame('rugby-socks', $sports['rugby-league']['tiles'][3]['image']);
    }

    /** American Football (client visual images/165.jpg): 16 tiles, names only, its own subtitle, hint and field background. */
    public function test_american_football_is_the_clients_list_with_its_own_step_settings(): void
    {
        $sports = collect(config('catalog.sports'))->keyBy('id');
        $nfl = $sports['american-football'];
        $this->assertSame(['Game Kit', 'Game Jersey', 'Game Pants', 'Practice Jersey', 'Training Tee', 'Training Shorts', 'Compression Top', 'Compression Shorts',
            'Game Socks', 'Hoodie', 'Varsity Jacket', 'Hooded Tracksuit', 'Waterproof Jacket', 'Cap', 'Bucket Hat', 'Beanie'], array_column($nfl['tiles'], 'name'));
        $this->assertSame(['fullkit', 'jersey', null, 'jersey', 'tee', 'shorts', 'tee', null, null, 'hoodie', 'varsity', 'trackjacket', 'trackjacket', null, null, null],
            array_column($nfl['tiles'], 'garment'));
        // Coming soon: pants, compression shorts, socks, cap, bucket hat, beanie, each naming the garment still to build.
        foreach ([2 => 'nfl-pants', 7 => 'compression-shorts', 8 => 'socks', 13 => 'cap', 14 => 'bucket-hat', 15 => 'beanie'] as $i => $future) {
            $this->assertSame(['soon', $future], [$nfl['tiles'][$i]['fit'], $nfl['tiles'][$i]['future']], $nfl['tiles'][$i]['name']);
        }
        $this->assertSame(['trackStyle' => 'hood'], $nfl['tiles'][11]['design']);
        $this->assertSame('Choose your game uniform, practice wear or sideline apparel.', $nfl['subtitle']);
        $this->assertSame('Select a garment to customise.', $nfl['select_hint']);
        $this->assertFalse($nfl['descriptions']);
        $this->assertFalse($nfl['more']);
        $this->assertFileExists(public_path("media/showroom/{$nfl['backdrop']}.webp"));
        $this->assertFileEquals(public_path("media/showroom/{$nfl['backdrop']}.webp"), base_path("../assets/images/showroom/{$nfl['backdrop']}.webp"));
        // Every other sport keeps the shared defaults (descriptions, stadium, no hint) unless it sets its own.
        foreach (['netball', 'rugby-league', 'rugby-union', 'football'] as $id) {
            $this->assertNotSame(false, $sports[$id]['descriptions'] ?? true, $id);
            $this->assertArrayNotHasKey('subtitle', $sports[$id], $id);
            $this->assertArrayNotHasKey('select_hint', $sports[$id], $id);
            $this->assertArrayNotHasKey('backdrop', $sports[$id], $id);
        }
        $this->getJson('/api/v1/catalog')->assertOk()
            ->assertJsonPath('data.sports.7.id', 'american-football')
            ->assertJsonPath('data.sports.7.tiles.1.name', 'Game Jersey')
            ->assertJsonPath('data.sports.7.descriptions', false)
            ->assertJsonPath('data.sports.7.select_hint', 'Select a garment to customise.');

        // A Game Jersey project (on the jersey 3D garment) keeps its name into the order line.
        Sanctum::actingAs(User::factory()->create());
        $design = ['garment' => 'jersey', 'main' => '#0b1016', 'secondary' => '#00c2cc', 'accent' => '#36e3ee', 'pattern' => 'Solid', 'productName' => 'Game Jersey'];
        $id = $this->postJson('/api/v1/projects', ['name' => 'Wildcats', 'sport' => 'american-football', 'garment' => 'jersey', 'mode' => 'dyo', 'design' => $design])
            ->assertCreated()->assertJsonPath('data.design.productName', 'Game Jersey')->json('data.id');
        $form = ['source' => 'form', 'contact_name' => 'Fab', 'contact_email' => 'fab@example.test', 'phone' => '0400 000 000', 'team_name' => 'Wildcats',
            'needed_by' => now()->addWeeks(6)->toDateString(), 'delivery' => 'pickup',
            'items' => [['garment' => 'jersey', 'sport' => 'american-football', 'project_id' => $id, 'sizes' => ['L' => 4]]]];
        $this->postJson('/api/v1/orders', $form, ['Idempotency-Key' => 'nfl-form-1'])->assertCreated()
            ->assertJsonPath('data.items.0.label', 'Game Jersey')
            ->assertJsonPath('data.garments.0.name', 'Game Jersey');
    }

    public function test_the_public_catalogue_sends_the_tiles(): void
    {
        $this->getJson('/api/v1/catalog')->assertOk()
            ->assertJsonPath('data.sports.4.id', 'netball')
            ->assertJsonPath('data.sports.4.tiles.0.name', 'Netball dress')
            ->assertJsonPath('data.sports.4.tiles.0.garment', 'netball-dress')
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
