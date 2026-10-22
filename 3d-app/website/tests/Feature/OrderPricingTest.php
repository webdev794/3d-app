<?php

namespace Tests\Feature;

use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Payments\PaymentFixtures;
use Tests\TestCase;

/**
 * The review step's price choices go with the order: the destination, extras and discount code chosen on the review
 * are kept with the submitted order and its invoice matches the quote the customer saw (a real submission, with the
 * payments feature issuing the invoice).
 */
class OrderPricingTest extends TestCase
{
    use PaymentFixtures, RefreshDatabase;

    public function test_the_invoice_matches_the_reviewed_quote_with_destination_extras_and_code(): void
    {
        $this->priceList();
        $this->rule(['kind' => 'shipping', 'code' => 'NZ', 'name' => 'New Zealand', 'amount_cents' => 25000, 'taxable' => true]);
        $this->rule(['kind' => 'extra', 'code' => 'express', 'name' => 'Express production', 'unit' => 'order', 'auto' => false, 'amount_cents' => 15000]);
        $this->rule(['kind' => 'discount', 'code' => 'TEAM10', 'name' => 'Team 10%', 'percent' => 10, 'min_quantity' => 10]);
        $customer = $this->customer();
        Sanctum::actingAs($customer);
        $items = [['garment' => 'jersey', 'sizes' => ['M' => 10, 'L' => 10]], ['garment' => 'shorts', 'sizes' => ['M' => 20]]];
        $pricing = ['destination' => 'NZ', 'extras' => ['express'], 'discount_code' => 'TEAM10'];

        // What the review step shows (a wrong code is named, not applied).
        $wrong = $this->postJson('/api/v1/pricing/quote', ['items' => $items, 'pricing' => ['discount_code' => 'NOPE']])->assertOk()->json('data');
        $this->assertFalse($wrong['discount_code']['valid']);
        $quote = $this->postJson('/api/v1/pricing/quote', ['items' => $items, 'pricing' => $pricing])->assertOk()->json('data');
        $this->assertSame('priced', $quote['status']);
        $this->assertTrue($quote['discount_code']['valid']);
        $this->assertSame('New Zealand', $quote['shipping']['name']);
        $this->assertNotSame($wrong['total'], $quote['total']);

        // Confirmed with the same choices: kept with the order; the invoice is the reviewed total.
        $draft = $this->postJson('/api/v1/order-drafts', ['kind' => 'form', 'data' => ['team_name' => 'MANTIS', 'contact_name' => 'Fabian', 'items' => $items, 'pricing' => $pricing,
            'phone' => '0400 000 000', 'needed_by' => now()->addWeeks(6)->toDateString(), 'delivery' => 'deliver',
            'address' => ['street' => '1 Park Rd', 'suburb' => 'Sydney', 'state' => 'NSW', 'postcode' => '2000', 'country' => 'Australia']]])->json('data.id');
        $order = $this->postJson("/api/v1/order-drafts/{$draft}/submit", [], ['Idempotency-Key' => 'pricing-key-1'])->assertCreated()->json('data');
        $this->assertSame(['destination' => 'NZ', 'extras' => ['express'], 'discount_code' => 'TEAM10'], Order::find($order['id'])->pricing);
        $this->assertSame($quote['total'], $order['invoice']['total']);
        $this->assertSame('awaiting_payment', $order['invoice']['status']);

        // Sent directly with the submission too (the app does), and a bad code is refused by nobody: it just doesn't apply.
        $direct = $this->postJson('/api/v1/orders', ['source' => 'form', 'team_name' => 'MANTIS', 'contact_name' => 'Fabian', 'items' => $items, 'pricing' => ['destination' => 'AU'],
            'phone' => '0400 000 000', 'needed_by' => now()->addWeeks(6)->toDateString(), 'delivery' => 'pickup'], ['Idempotency-Key' => 'pricing-key-2'])
            ->assertCreated()->json('data');
        $au = $this->postJson('/api/v1/pricing/quote', ['items' => $items, 'pricing' => ['destination' => 'AU']])->json('data');
        $this->assertSame($au['total'], $direct['invoice']['total']);
        $this->postJson('/api/v1/orders', ['source' => 'form', 'team_name' => 'X', 'contact_name' => 'F', 'items' => $items, 'pricing' => ['extras' => ['bad code!']],
            'phone' => '0400 000 000', 'needed_by' => now()->addWeeks(6)->toDateString(), 'delivery' => 'pickup'], ['Idempotency-Key' => 'pricing-key-3'])
            ->assertUnprocessable()->assertJsonValidationErrors('pricing.extras.0');
    }
}
