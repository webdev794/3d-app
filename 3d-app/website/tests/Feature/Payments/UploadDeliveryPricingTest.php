<?php

namespace Tests\Feature\Payments;

use App\Models\Order;
use App\Services\Pdf\InvoicePdf;
use App\Support\OrderDelivery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Upload Your Order's Deliver / Pick up and the price (2026-10-22): the shipping destination follows the choice and the
 * country (unless one was chosen on the review), picking up costs no shipping, and the invoice shows the address on
 * its lines. No real mail.
 */
class UploadDeliveryPricingTest extends TestCase
{
    use PaymentFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Mail::fake();
        Notification::fake();
        // As the live price list: jerseys and shorts, and shipping to Australia only.
        $this->priceList();
    }

    /** An upload draft with its order form, submitted with checked rows (10 jerseys) and the details given. */
    private function place(array $details, string $key): array
    {
        $user = $this->customer();
        Sanctum::actingAs($user);
        $id = $this->postJson('/api/v1/order-drafts', ['kind' => 'upload', 'data' => ['team_name' => 'Te Arawa', 'contact_name' => 'Fabian', 'contact_email' => 'fab@example.test']])->json('data.id');
        $this->post("/api/v1/order-drafts/{$id}/files", ['kind' => 'order_form', 'file' => UploadedFile::fake()->createWithContent('order.csv', "Item,Size,Qty\nJersey,M,10\n")], ['Accept' => 'application/json'])->assertCreated();

        return $this->postJson("/api/v1/order-drafts/{$id}/submit", $details + ['phone' => '0412 345 678', 'needed_by' => now()->addWeeks(6)->toDateString(),
            'items' => [['garment' => 'jersey', 'sizes' => ['M' => 10]]]], ['Idempotency-Key' => $key])->assertCreated()->json('data');
    }

    private function quote(string $destination): array
    {
        return $this->postJson('/api/v1/pricing/quote', ['items' => [['garment' => 'jersey', 'sizes' => ['M' => 10]]], 'pricing' => ['destination' => $destination]])->assertOk()->json('data');
    }

    public function test_pick_up_costs_no_shipping_on_the_review_and_the_invoice(): void
    {
        // The review's quote (the page sends PICKUP for a pick-up): no pick-up price set, so nothing to ship.
        $q = $this->quote('PICKUP');
        $this->assertSame(['priced', '0.00', 'Pick up'], [$q['status'], $q['shipping']['amount'], $q['shipping']['name']]);
        $this->assertSame('500.00', $q['subtotal']);

        $order = $this->place(['delivery' => 'pickup'], 'pickup-price-1');
        $this->assertSame(OrderDelivery::PICKUP_TEXT, $order['shipping_address']);
        $placed = Order::findOrFail($order['id']);
        $this->assertSame('PICKUP', $placed->pricing['destination'] ?? null);
        $invoice = $placed->invoices()->latest('id')->first();
        $this->assertNotNull($invoice);
        $this->assertSame(0, data_get($invoice->quote, 'shipping.amount_cents'));
        $this->assertSame(55000, $invoice->total_cents, '10 jerseys at $50 and GST, no shipping');
        // A price list with its own pick-up price uses it.
        $this->rule(['kind' => 'shipping', 'code' => 'PICKUP', 'name' => 'Pick up', 'amount_cents' => 500, 'taxable' => true]);
        $this->assertSame('5.00', $this->quote('PICKUP')['shipping']['amount']);
        // An older pick-up order without a saved destination is read from its address.
        $this->assertSame('PICKUP', \App\Services\Pricing\PricingService::destinationFromAddress(OrderDelivery::PICKUP_TEXT, ['AU' => 'Australia']));
    }

    public function test_the_country_chooses_the_destination_and_each_gets_its_price(): void
    {
        $this->rule(['kind' => 'shipping', 'code' => 'NZ', 'name' => 'New Zealand', 'amount_cents' => 25000, 'taxable' => false]);
        $this->rule(['kind' => 'shipping', 'code' => 'INTL', 'name' => 'International', 'amount_cents' => 40000, 'taxable' => false]);
        $cases = [
            ['Australia', ['street' => '12 Smith Street', 'suburb' => 'Parramatta', 'state' => 'NSW', 'postcode' => '2150'], 'AU', 10000, "12 Smith Street\nParramatta NSW 2150\nAustralia"],
            ['New Zealand', ['street' => '5 Queen St', 'suburb' => 'Auckland', 'postcode' => '1010'], 'NZ', 25000, "5 Queen St\nAuckland 1010\nNew Zealand"],
            // A country the address reader does not know is still international.
            ['Brazil', ['street' => 'Rua A 1', 'suburb' => 'Recife'], 'INTL', 40000, "Rua A 1\nRecife\nBrazil"],
        ];
        foreach ($cases as $i => [$country, $address, $code, $shipping, $text]) {
            $order = $this->place(['delivery' => 'deliver', 'address' => $address + ['country' => $country]], "country-price-$i");
            $this->assertSame($text, $order['shipping_address']);
            $placed = Order::findOrFail($order['id']);
            $this->assertSame($code, $placed->pricing['destination'] ?? null, $country);
            $this->assertSame($shipping, data_get($placed->invoices()->latest('id')->first()->quote, 'shipping.amount_cents'), $country);
        }
        // A destination chosen on the review wins over the address.
        $order = $this->place(['delivery' => 'deliver', 'address' => $cases[0][1] + ['country' => 'Australia'], 'pricing' => ['destination' => 'NZ']], 'chosen-dest-1');
        $this->assertSame('NZ', Order::findOrFail($order['id'])->pricing['destination']);
    }

    public function test_without_a_price_for_the_destination_it_is_quoted_not_charged_as_australia(): void
    {
        // The live price list has Australia only: New Zealand is priced by 3DEEZI (quote required), not as Australia.
        $q = $this->quote('NZ');
        $this->assertSame('quote_required', $q['status']);
        $this->assertNull($q['shipping']['amount'] === '100.00' ? 'charged as Australia' : null);
        $order = $this->place(['delivery' => 'deliver', 'address' => ['street' => '5 Queen St', 'suburb' => 'Auckland', 'postcode' => '1010', 'country' => 'New Zealand']], 'nz-unpriced-1');
        $this->assertSame('NZ', Order::findOrFail($order['id'])->pricing['destination']);
    }

    public function test_the_invoice_shows_the_delivery_address_on_its_lines(): void
    {
        $order = $this->place(['delivery' => 'deliver', 'address' => ['street' => '12 Smith Street', 'suburb' => 'Parramatta', 'state' => 'nsw', 'postcode' => '2150', 'country' => 'Australia']], 'pdf-address-1');
        $invoice = Order::findOrFail($order['id'])->invoices()->latest('id')->first();
        $this->assertSame("12 Smith Street\nParramatta NSW 2150\nAustralia", $invoice->snapshot['customer']['address']);
        $raw = InvoicePdf::render($invoice);
        $this->assertStringStartsWith('%PDF', $raw);
        // The page's drawing (FlateDecode streams, unpacked).
        preg_match_all('/stream\r?\n(.*?)\r?\nendstream/s', $raw, $streams);
        $pdf = implode("\n", array_map(fn ($s) => @gzuncompress($s) ?: $s, $streams[1]));
        // Each address line is drawn as its own text (never one line with the breaks in it).
        foreach (['12 Smith Street', 'Parramatta NSW 2150', 'Australia'] as $line) {
            $this->assertStringContainsString("({$line})", $pdf, $line);
        }
        $this->assertStringNotContainsString('Street\\nParramatta', $pdf);
    }
}
