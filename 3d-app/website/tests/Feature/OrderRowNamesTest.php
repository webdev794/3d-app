<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\Order;
use App\Models\User;
use App\Services\Pricing\BillingSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Payments\PaymentFixtures;
use Tests\TestCase;

/**
 * Order rows named after a saved design (task 9.97, QA U 2026-10-23): a design's product name ("Netball bibs") names
 * only rows of its own garment; a row of another garment keeps its own name ("Rugby League Jersey") in the order, its
 * invoice lines and the invoice PDF.
 */
class OrderRowNamesTest extends TestCase
{
    use PaymentFixtures, RefreshDatabase;

    private function project(string $name, string $sport, string $garment, string $product, array $design = []): int
    {
        return $this->postJson('/api/v1/projects', ['name' => $name, 'sport' => $sport, 'garment' => $garment, 'mode' => 'dyo',
            'design' => $design + ['garment' => $garment, 'main' => '#0b1016', 'secondary' => '#00c2cc', 'accent' => '#36e3ee', 'pattern' => 'Solid', 'productName' => $product]])
            ->assertCreated()->json('data.id');
    }

    private function form(array $items): array
    {
        return ['source' => 'form', 'contact_name' => 'Fab', 'contact_email' => 'fab@example.test', 'phone' => '0400 000 000', 'team_name' => 'Firebirds',
            'needed_by' => now()->addWeeks(6)->toDateString(), 'delivery' => 'pickup', 'items' => $items];
    }

    public function test_a_design_names_only_rows_of_its_own_garment_in_the_order_invoice_and_pdf(): void
    {
        Bus::withoutDispatchingAfterResponses();
        BillingSettings::flush();
        $this->rule(['kind' => 'garment', 'code' => 'jersey', 'name' => 'Jersey', 'amount_cents' => 5000]);
        $this->rule(['kind' => 'garment', 'code' => 'singlet', 'name' => 'Singlet', 'amount_cents' => 4000]);
        $this->rule(['kind' => 'shipping', 'code' => 'AU', 'name' => 'Australia', 'amount_cents' => 1000, 'taxable' => true]);
        Sanctum::actingAs(User::factory()->create());
        $bibs = $this->project('Firebirds bibs', 'netball', 'singlet', 'Netball bibs');

        // The same "Netball bibs" design on a Rugby League jersey row and on a Netball singlet row.
        $order = $this->postJson('/api/v1/orders', $this->form([
            ['garment' => 'jersey', 'sport' => 'rugby-league', 'project_id' => $bibs, 'sizes' => ['M' => 6]],
            ['garment' => 'singlet', 'sport' => 'netball', 'project_id' => $bibs, 'sizes' => ['M' => 5]],
        ]), ['Idempotency-Key' => 'row-names-1'])->assertCreated()
            ->assertJsonPath('data.garments.0.name', 'Rugby League Jersey')
            ->assertJsonPath('data.garments.1.name', 'Netball bibs')
            ->json('data');
        $this->assertArrayNotHasKey('label', $order['items'][0], 'the jersey row takes no product name');
        $this->assertSame('Netball bibs', $order['items'][1]['label']);
        // Both rows still name the design they use.
        $this->assertSame(['Firebirds bibs', 'Firebirds bibs'], array_column($order['items'], 'project_name'));
        $this->getJson('/api/v1/orders')->assertOk()->assertJsonPath('data.0.garments.0.name', 'Rugby League Jersey');

        // The invoice lines and the pay page's invoice: "Rugby League Jersey 6 × A$50.00" and "Netball bibs 5 × A$40.00".
        $invoice = Invoice::latest('id')->first();
        $this->assertNotNull($invoice, 'a priced order gets its invoice');
        $lines = collect($invoice->quote['lines'])->map(fn ($l) => [$l['name'], $l['quantity'], $l['unit_cents']])->all();
        $this->assertSame([['Rugby League Jersey', 6, 5000], ['Netball bibs', 5, 4000]], $lines);
        $this->getJson("/api/v1/invoices/{$invoice->number}")->assertOk()
            ->assertJsonPath('data.quote.lines.0.name', 'Rugby League Jersey')->assertJsonPath('data.quote.lines.1.name', 'Netball bibs');

        // The PDF: one "Netball bibs" line (the singlet), the jersey as itself.
        $pdf = $this->get("/api/v1/invoices/{$invoice->number}/pdf")->assertOk()->getContent();
        $this->assertSame(1, preg_match('/stream\n(.*?)\nendstream/s', $pdf, $page));
        $text = (string) gzuncompress($page[1]);
        $this->assertStringContainsString('(Rugby League Jersey)', $text);
        $this->assertSame(1, substr_count($text, '(Netball bibs)'), 'only the singlet line says Netball bibs');
    }

    public function test_a_full_kit_names_no_single_row_and_a_listed_garment_keeps_its_design_name(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $kit = $this->project('Mantis kit', 'rugby-league', 'fullkit', 'Rugby League Kit');
        $tracksuit = $this->project('Mantis tracksuit', 'rugby-league', 'trackjacket', 'Hooded Tracksuit', ['trackStyle' => 'hood']);

        $this->postJson('/api/v1/orders', $this->form([
            // A full kit's jersey and shorts keep their own names.
            ['garment' => 'jersey', 'sport' => 'rugby-league', 'project_id' => $kit, 'sizes' => ['L' => 4]],
            ['garment' => 'shorts', 'sport' => 'rugby-league', 'project_id' => $kit, 'sizes' => ['L' => 4]],
            // A track jacket design is ordered on the Jacket row, under its name; its pants are track pants.
            ['garment' => 'jacket', 'sport' => 'rugby-league', 'project_id' => $tracksuit, 'sizes' => ['L' => 2]],
            ['garment' => 'pants', 'sport' => 'rugby-league', 'project_id' => $tracksuit, 'sizes' => ['L' => 2]],
            // A row's own label wins.
            ['garment' => 'other', 'label' => 'Kit bag', 'project_id' => $kit, 'sizes' => ['M' => 1]],
        ]), ['Idempotency-Key' => 'row-names-2'])->assertCreated()
            ->assertJsonPath('data.garments.0.name', 'Rugby League Jersey')
            ->assertJsonPath('data.garments.1.name', 'Rugby League Shorts')
            ->assertJsonPath('data.garments.2.name', 'Hooded Tracksuit')
            ->assertJsonPath('data.garments.3.name', 'Rugby League Track pants')
            ->assertJsonPath('data.garments.4.name', 'Kit bag');
    }

    public function test_the_rule(): void
    {
        $this->assertTrue(Order::isDesignRow('singlet', 'singlet'));
        $this->assertFalse(Order::isDesignRow('singlet', 'jersey'));
        $this->assertTrue(Order::isDesignRow('ziphoodie', 'hoodie'));
        $this->assertTrue(Order::isDesignRow('pocketpolo', 'polo'));
        $this->assertTrue(Order::isDesignRow('varsity', 'jacket'));
        $this->assertFalse(Order::isDesignRow('fullkit', 'jersey'));
        $this->assertFalse(Order::isDesignRow('fullkit', 'shorts'));
        $this->assertFalse(Order::isDesignRow(null, 'jersey'));
        $this->assertFalse(Order::isDesignRow('jersey', null));
    }
}
