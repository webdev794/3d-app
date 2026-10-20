<?php

namespace Tests\Feature\Payments;

use App\Models\User;
use App\Services\Pricing\BillingSettings;
use App\Services\Pricing\Money;
use App\Services\Pricing\PricingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Pricing an order with the admin's price list: quantities, extras, shipping, discounts, GST, cents, quotes. */
class PricingTest extends TestCase
{
    use PaymentFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        BillingSettings::flush();
    }

    private function quote(array $body): array
    {
        return $this->postJson('/api/v1/pricing/quote', $body)->assertOk()->json('data');
    }

    public function test_the_concept_image_order_is_priced_with_gst_in_aud(): void
    {
        $this->priceList();
        $quote = $this->quote(['items' => [
            ['garment' => 'jersey', 'sizes' => ['S' => 4, 'M' => 6, 'L' => 6, 'XL' => 4]],
            ['garment' => 'shorts', 'sizes' => ['S' => 4, 'M' => 6, 'L' => 6, 'XL' => 4]],
        ], 'shipping_address' => '1 Park Rd, Sydney NSW 2000']);

        $this->assertSame('priced', $quote['status']);
        $this->assertSame('AUD', $quote['currency']);
        $this->assertSame(40, $quote['quantity']);
        $this->assertSame(['Jersey', 'Shorts'], array_column($quote['lines'], 'name'));
        $this->assertSame([20, 20], array_column($quote['lines'], 'quantity'));
        $this->assertSame(['50.00', '30.00'], array_column($quote['lines'], 'unit_price'));
        $this->assertSame(['1000.00', '600.00'], array_column($quote['lines'], 'total'));
        $this->assertSame('1600.00', $quote['garments_total']);
        $this->assertSame(['AU', '100.00'], [$quote['shipping']['destination'], $quote['shipping']['amount']]);
        $this->assertSame('1700.00', $quote['subtotal']);
        $this->assertSame(['GST', '10', '170.00'], [$quote['tax']['name'], $quote['tax']['rate'], $quote['tax']['amount']]);
        $this->assertSame('1870.00', $quote['total']);
        $this->assertSame([], $quote['reasons']);
    }

    public function test_sport_prices_extras_quantity_tiers_and_discount_codes(): void
    {
        $this->priceList();
        $this->rule(['kind' => 'garment', 'code' => 'jersey', 'sport' => 'rugby-league', 'name' => 'RL jersey', 'amount_cents' => 5500]);
        $this->rule(['kind' => 'extra', 'code' => 'names_numbers', 'name' => 'Names & numbers printing', 'unit' => 'player', 'auto' => true, 'amount_cents' => 500]);
        $this->rule(['kind' => 'extra', 'code' => 'express', 'name' => 'Express production', 'unit' => 'order', 'auto' => false, 'amount_cents' => 15000]);
        $this->rule(['kind' => 'extra', 'code' => 'socks', 'name' => 'Matching socks', 'unit' => 'garment', 'auto' => false, 'amount_cents' => 900]);
        $this->rule(['kind' => 'discount', 'name' => '5% off 50+ garments', 'percent' => 5, 'min_quantity' => 50]);
        $this->rule(['kind' => 'discount', 'code' => 'TEAM10', 'name' => 'Team 10%', 'percent' => 10, 'min_quantity' => 10]);
        $players = array_map(fn ($i) => ['name' => 'PLAYER '.$i, 'number' => (string) $i, 'size' => 'M'], range(1, 15));
        $players[] = ['name' => '', 'number' => '', 'size' => 'M'];

        $quote = $this->quote([
            'items' => [
                ['garment' => 'jersey', 'sport' => 'rugby-league', 'sizes' => ['M' => 20], 'players' => $players],
                ['garment' => 'shorts', 'sport' => 'rugby-league', 'sizes' => ['M' => 20]],
            ],
            'pricing' => ['destination' => 'au', 'extras' => ['EXPRESS'], 'discount_code' => 'team10'],
        ]);

        // The sport's own jersey price; shorts fall back to the price for every sport.
        $this->assertSame(['Rugby League Jersey', 'Rugby League Shorts'], array_column($quote['lines'], 'name'));
        $this->assertSame(['1100.00', '600.00'], array_column($quote['lines'], 'total'));
        // Names: one per player with a name or number (15, not the blank row); express once; socks not chosen.
        $this->assertSame([['names_numbers', 15, '75.00'], ['express', 1, '150.00']], array_map(fn ($e) => [$e['code'], $e['quantity'], $e['total']], $quote['extras']));
        $this->assertSame('225.00', $quote['extras_total']);
        // 40 garments: no 50+ tier; TEAM10 is 10% of the goods (1925.00).
        $this->assertSame([['Team 10%', 'TEAM10', '192.50']], array_map(fn ($d) => [$d['name'], $d['code'], $d['amount']], $quote['discounts']));
        $this->assertTrue($quote['discount_code']['valid']);
        $this->assertSame('1832.50', $quote['subtotal']);
        $this->assertSame('183.25', $quote['tax']['amount']);
        $this->assertSame('2015.75', $quote['total']);

        // 60 garments: the 5% tier and the code both apply to the goods.
        $big = $this->quote(['items' => [['garment' => 'jersey', 'sizes' => ['M' => 60]]], 'pricing' => ['discount_code' => 'TEAM10']]);
        $this->assertSame(['150.00', '300.00'], array_column($big['discounts'], 'amount'));
        $this->assertSame('2650.00', $big['subtotal']);
        $this->assertSame('2915.00', $big['total']);

        // A wrong code, or too few garments for it: still priced, the code explained.
        $wrong = $this->quote(['items' => [['garment' => 'jersey', 'sizes' => ['M' => 5]]], 'pricing' => ['discount_code' => 'NOPE']]);
        $this->assertSame(['priced', false, 'This discount code is not valid.'], [$wrong['status'], $wrong['discount_code']['valid'], $wrong['discount_code']['message']]);
        $few = $this->quote(['items' => [['garment' => 'jersey', 'sizes' => ['M' => 5]]], 'pricing' => ['discount_code' => 'TEAM10']]);
        $this->assertSame('This code needs at least 10 garments.', $few['discount_code']['message']);
        $this->assertSame([], $few['discounts']);
    }

    public function test_every_amount_rounds_half_up_to_the_cent(): void
    {
        $this->rule(['kind' => 'garment', 'code' => 'tee', 'name' => 'Tee', 'amount_cents' => 3333]);
        $this->rule(['kind' => 'garment', 'code' => 'polo', 'name' => 'Polo', 'amount_cents' => 9745]);
        $this->rule(['kind' => 'shipping', 'code' => 'AU', 'name' => 'Australia', 'amount_cents' => 1001]);
        $this->rule(['kind' => 'shipping', 'code' => 'PICKUP', 'name' => 'Pick up', 'amount_cents' => 0]);
        $this->rule(['kind' => 'discount', 'name' => '12.5% off', 'percent' => 12.5, 'min_quantity' => 3]);

        // 3 x 33.33 = 99.99; 12.5% = 12.49875 -> 12.50; 99.99 - 12.50 + 10.01 = 97.50; GST 9.75.
        $tees = $this->quote(['items' => [['garment' => 'tee', 'sizes' => ['M' => 3]]]]);
        $this->assertSame(['99.99', '12.50', '97.50', '9.75', '107.25'], [$tees['garments_total'], $tees['discount_total'], $tees['subtotal'], $tees['tax']['amount'], $tees['total']]);
        // GST on 97.45 is 9.745: half up to 9.75 (not 9.74).
        $polo = $this->quote(['items' => [['garment' => 'polo', 'quantity' => 1]], 'pricing' => ['destination' => 'PICKUP']]);
        $this->assertSame(['97.45', '9.75', '107.20'], [$polo['subtotal'], $polo['tax']['amount'], $polo['total']]);

        $this->assertSame(1, Money::percentOf(5, 10));
        $this->assertSame(0, Money::percentOf(4, 10));
        $this->assertSame(187000, Money::toCents('1,870.00'));
        $this->assertSame(1999, Money::toCents('19.99'));
        $this->assertSame('AUD $1,870.00', Money::format(187000, 'AUD'));
        $this->assertSame('1870.00', Money::decimal(187000));
    }

    public function test_anything_without_a_price_needs_a_quote(): void
    {
        $this->priceList();
        $quote = $this->quote([
            'items' => [
                ['garment' => 'jersey', 'sizes' => ['M' => 10]],
                ['garment' => 'hoodie', 'sizes' => ['L' => 5]],
                ['garment' => 'other', 'label' => 'Long-sleeve jersey', 'sizes' => ['M' => 3]],
            ],
            'pricing' => ['destination' => 'NZ', 'extras' => ['embroidery']],
        ]);
        $this->assertSame('quote_required', $quote['status']);
        $this->assertSame(['garment_unpriced', 'custom_garment', 'extra_unpriced', 'shipping_unpriced'], array_column($quote['reasons'], 'code'));
        $this->assertSame('No price is set for Hoodie yet.', $quote['reasons'][0]['message']);
        $this->assertSame([null, null, null], [$quote['subtotal'], $quote['tax']['amount'], $quote['total']]);
        // What has a price still shows it.
        $this->assertSame(['500.00', null, null], array_column($quote['lines'], 'total'));

        // An uploaded order form (no rows yet): staff price it all.
        $upload = $this->quote(['items' => []]);
        $this->assertSame(['quote_required', ['no_items']], [$upload['status'], array_column($upload['reasons'], 'code')]);
        // Rows without quantities.
        $empty = $this->quote(['items' => [['garment' => 'jersey', 'sizes' => ['M' => 0]]]]);
        $this->assertSame(['no_quantity'], array_column($empty['reasons'], 'code'));

        // No delivery rate for the default destination either.
        $this->rule(['kind' => 'garment', 'code' => 'tee', 'name' => 'Tee', 'amount_cents' => 1000]);
        BillingSettings::save(['default_destination' => 'INTL']);
        $intl = $this->quote(['items' => [['garment' => 'tee', 'quantity' => 2]]]);
        $this->assertSame(['shipping_unpriced'], array_column($intl['reasons'], 'code'));
    }

    public function test_the_destination_comes_from_the_choice_the_address_or_the_default(): void
    {
        $this->priceList();
        $this->rule(['kind' => 'shipping', 'code' => 'NZ', 'name' => 'New Zealand', 'amount_cents' => 6000, 'per_item_cents' => 200, 'taxable' => false]);
        $this->rule(['kind' => 'shipping', 'code' => 'FJ', 'name' => 'Fiji', 'amount_cents' => 9000, 'taxable' => false]);
        $items = [['garment' => 'jersey', 'sizes' => ['M' => 10]]];

        // New Zealand: $60 + $2 a garment, no GST on exports.
        $nz = $this->quote(['items' => $items, 'shipping_address' => '5 Queen St, Auckland 1010, New Zealand']);
        $this->assertSame(['NZ', '80.00', false, '0.00', '580.00'], [$nz['shipping']['destination'], $nz['shipping']['amount'], $nz['tax']['applies'], $nz['tax']['amount'], $nz['total']]);
        $this->assertSame('FJ', $this->quote(['items' => $items, 'shipping_address' => '12 Beach Rd, Nadi, Fiji'])['shipping']['destination']);
        $this->assertSame('AU', $this->quote(['items' => $items, 'shipping_address' => ''])['shipping']['destination']);
        // The customer's choice wins over the address.
        $this->assertSame('AU', $this->quote(['items' => $items, 'shipping_address' => 'Auckland, New Zealand', 'pricing' => ['destination' => 'AU']])['shipping']['destination']);

        $this->assertSame('AU', PricingService::destinationFromAddress('Unit 2, 10 Smith St, Parramatta NSW 2150'));
        $this->assertSame('AU', PricingService::destinationFromAddress('10 Smith St, Parramatta, New South Wales'));
        $this->assertSame('NZ', PricingService::destinationFromAddress('Wellington NZ'));
        $this->assertSame('INTL', PricingService::destinationFromAddress('221B Baker Street, London, United Kingdom'));
        $this->assertNull(PricingService::destinationFromAddress('Somewhere 12'));
    }

    public function test_the_order_form_options_and_quote_checks(): void
    {
        $this->priceList();
        $this->rule(['kind' => 'extra', 'code' => 'express', 'name' => 'Express production', 'unit' => 'order', 'amount_cents' => 15000]);
        $this->rule(['kind' => 'garment', 'code' => 'hoodie', 'name' => 'Hoodie', 'amount_cents' => 4500, 'active' => false]);

        $options = $this->getJson('/api/v1/pricing/options')->assertOk()->json('data');
        $this->assertSame('AUD', $options['currency']);
        $this->assertSame(['jersey', 'shorts'], array_column($options['garments'], 'garment'));
        $this->assertSame([['code' => 'AU', 'name' => 'Australia']], $options['destinations']);
        $this->assertSame('express', $options['extras'][0]['code']);
        $this->assertSame('full', $options['payment_rule']['rule']);

        $this->postJson('/api/v1/pricing/quote', ['items' => [['garment' => 'JERSEY!', 'sizes' => ['M' => 1]]]])->assertUnprocessable()->assertJsonValidationErrors('items.0.garment');
        $this->postJson('/api/v1/pricing/quote', ['items' => [['garment' => 'jersey', 'sizes' => ['M' => -1]]]])->assertUnprocessable();
        $this->postJson('/api/v1/pricing/quote', [])->assertUnprocessable()->assertJsonValidationErrors('items');
        // Signed in or not, the same answer.
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/pricing/quote', ['items' => [['garment' => 'jersey', 'sizes' => ['M' => 2, 'BOGUS' => 50]]]])->assertOk()->assertJsonPath('data.quantity', 2);
    }
}
