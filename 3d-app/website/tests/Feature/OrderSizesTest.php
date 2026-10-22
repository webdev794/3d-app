<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderDraft;
use App\Services\OrderAssistant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Payments\PaymentFixtures;
use Tests\TestCase;

/**
 * All the sizes (client price list 2026-10-22, tasks.md 9.12): Mens XS-8XL, Womens W8-W24, Kids 2Y-16Y, one set per
 * fit. A team orders the same garment once per fit; totals, prices and invoices count them all; orders and drafts
 * with the older "Kids" column still open and keep it.
 */
class OrderSizesTest extends TestCase
{
    use PaymentFixtures, RefreshDatabase;

    private function form(array $items, array $extra = []): array
    {
        return ['source' => 'form', 'team_name' => 'MANTIS', 'contact_name' => 'Fabian', 'items' => $items, 'phone' => '0400 000 000',
            'needed_by' => now()->addWeeks(6)->toDateString(), 'delivery' => 'pickup'] + $extra;
    }

    public function test_the_size_sets_cover_the_price_list(): void
    {
        $this->assertSame(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'], Order::MENS_SIZES);
        $this->assertSame(['W8', 'W10', 'W12', 'W14', 'W16', 'W18', 'W20', 'W22', 'W24'], Order::WOMENS_SIZES);
        $this->assertSame(['2Y', '4Y', '6Y', '8Y', '10Y', '12Y', '14Y', '16Y'], Order::KIDS_SIZES);
        $this->assertSame([...Order::MENS_SIZES, ...Order::WOMENS_SIZES, ...Order::KIDS_SIZES, 'Kids'], Order::SIZES);
        $this->assertSame(Order::WOMENS_SIZES, Order::FIT_SIZES['womens']);
        $this->assertSame(Order::KIDS_SIZES, Order::FIT_SIZES['youth']);
        $this->assertSame('Kids', Order::FITS['youth']);
        $this->getJson('/api/v1/orders/options')->assertOk()->assertJsonPath('data.size_sets.youth.0', '2Y')->assertJsonPath('data.rare_sizes', Order::RARE_SIZES);
    }

    public function test_a_mixed_mens_womens_and_kids_order_counts_prices_and_invoices_every_size(): void
    {
        $this->priceList();
        $customer = $this->customer();
        Sanctum::actingAs($customer);
        $items = [
            ['garment' => 'jersey', 'sport' => 'rugby-league', 'fit' => 'mens', 'sizes' => ['M' => 4, '5XL' => 1, '8XL' => 1]],
            ['garment' => 'jersey', 'sport' => 'rugby-league', 'fit' => 'womens', 'sizes' => ['W24' => 1, 'W10' => 3]],
            ['garment' => 'jersey', 'sport' => 'rugby-league', 'fit' => 'youth', 'sizes' => ['16Y' => 2, '2Y' => 1, '10Y' => 2]],
        ];
        // The review's price: every row at the jersey price, each named with its fit.
        $quote = $this->postJson('/api/v1/pricing/quote', ['items' => $items, 'pricing' => ['destination' => 'AU']])->assertOk()->json('data');
        $this->assertSame('priced', $quote['status']);
        $this->assertSame(15, $quote['quantity']);
        $this->assertSame([6, 4, 5], array_column($quote['lines'], 'quantity'));
        $this->assertSame(['Rugby League Jersey · Mens', 'Rugby League Jersey · Womens', 'Rugby League Jersey · Kids'], array_column($quote['lines'], 'name'));
        $this->assertSame('750.00', $quote['garments_total']);

        $order = $this->postJson('/api/v1/orders', $this->form($items, ['pricing' => ['destination' => 'AU']]), ['Idempotency-Key' => 'sizes-mixed-1'])->assertCreated()->json('data');
        $placed = Order::find($order['id']);
        // Each row keeps its sizes in size order; the order's sizes are all of them added up, Mens, Womens, Kids.
        $this->assertSame(['M' => 4, '5XL' => 1, '8XL' => 1], $placed->items[0]['sizes']);
        $this->assertSame(['W10' => 3, 'W24' => 1], $placed->items[1]['sizes']);
        $this->assertSame(['2Y' => 1, '10Y' => 2, '16Y' => 2], $placed->items[2]['sizes']);
        $this->assertSame(['M' => 4, '5XL' => 1, '8XL' => 1, 'W10' => 3, 'W24' => 1, '2Y' => 1, '10Y' => 2, '16Y' => 2], $placed->sizes);
        $this->assertSame(15, $placed->quantity);
        $this->assertSame($quote['total'], $order['invoice']['total']);

        // My Orders and the order's page show them in size order.
        $this->getJson("/api/v1/orders/{$placed->id}")->assertOk()->assertJsonPath('data.items.1.sizes.W10', 3)->assertJsonPath('data.items.2.fit', 'youth');

        // The invoice PDF lists every size of each row.
        $pdf = $this->get('/api/v1/invoices/'.Invoice::first()->number.'/pdf')->assertOk()->getContent();
        $this->assertStringStartsWith('%PDF-', $pdf);
        // The page text is in compressed content streams.
        preg_match_all('/stream
(.*?)
endstream/s', $pdf, $streams);
        $pdf = implode("
", array_map(fn ($s) => @gzuncompress($s) ?: $s, $streams[1]));
        foreach (['M 4', '5XL 1', '8XL 1', 'W10 3', 'W24 1', '2Y 1', '10Y 2', '16Y 2'] as $size) {
            $this->assertStringContainsString($size, $pdf, "invoice shows {$size}");
        }

        // Staff: the admin order page and its options have the sizes in order.
        Sanctum::actingAs($this->admin());
        $admin = $this->getJson("/api/v1/admin/orders/{$placed->id}")->assertOk()->json('data');
        $this->assertSame(['M', '5XL', '8XL', 'W10', 'W24', '2Y', '10Y', '16Y'], array_keys($admin['sizes']));
        $this->assertSame(['2Y', '10Y', '16Y'], array_keys($admin['items'][2]['sizes']));
    }

    public function test_old_orders_and_drafts_with_kids_still_open_and_keep_it(): void
    {
        $customer = $this->customer();
        Sanctum::actingAs($customer);
        // An order placed before the new sizes: XS and the one Kids column.
        $old = new Order(['user_id' => $customer->id, 'source' => 'form', 'contact_name' => 'Fabian', 'team_name' => 'Old club',
            'items' => [['garment' => 'jersey', 'fit' => 'youth', 'sizes' => ['XS' => 1, 'Kids' => 11]]]]);
        $old->save();
        $this->assertSame(['XS' => 1, 'Kids' => 11], $old->fresh()->sizes);
        $this->getJson("/api/v1/orders/{$old->id}")->assertOk()->assertJsonPath('data.items.0.sizes.Kids', 11)->assertJsonPath('data.quantity', 12);
        $this->getJson('/api/v1/orders')->assertOk()->assertJsonPath('data.0.sizes.Kids', 11);

        // A draft saved with Kids opens as it was and can still be sent (Kids is still a size the order takes).
        $draft = $this->postJson('/api/v1/order-drafts', ['kind' => 'form', 'data' => $this->form([['garment' => 'shorts', 'fit' => 'youth', 'sizes' => ['Kids' => 6]]])])->assertCreated()->json('data.id');
        $this->getJson("/api/v1/order-drafts/{$draft}")->assertOk()->assertJsonPath('data.data.items.0.sizes.Kids', 6);
        $sent = $this->postJson("/api/v1/order-drafts/{$draft}/submit", [], ['Idempotency-Key' => 'sizes-old-kids'])->assertCreated()->json('data');
        $this->assertSame(['Kids' => 6], Order::find($sent['id'])->sizes);
        $this->assertNull(OrderDraft::find($draft));
    }

    public function test_only_the_listed_sizes_are_taken(): void
    {
        Sanctum::actingAs($this->customer());
        $this->postJson('/api/v1/orders', $this->form([['garment' => 'jersey', 'sizes' => ['W26' => 2]]]), ['Idempotency-Key' => 'sizes-bad-1'])
            ->assertUnprocessable()->assertJsonPath('errors', fn ($e) => str_contains(json_encode($e), 'XS to 8XL, W8 to W24 or 2Y to 16Y'));
        $this->postJson('/api/v1/orders', $this->form([['garment' => 'jersey', 'sizes' => ['9XL' => 2]]]), ['Idempotency-Key' => 'sizes-bad-2'])->assertUnprocessable();
        $this->postJson('/api/v1/orders', $this->form([['garment' => 'jersey', 'sizes' => ['1Y' => 2]]]), ['Idempotency-Key' => 'sizes-bad-3'])->assertUnprocessable();
        // A player's size is one of the list too.
        $this->postJson('/api/v1/orders', $this->form([['garment' => 'jersey', 'fit' => 'womens', 'sizes' => ['W12' => 1], 'players' => [['name' => 'A', 'number' => '1', 'size' => 'W12']]]]), ['Idempotency-Key' => 'sizes-ok-1'])
            ->assertCreated();
    }

    public function test_help_me_add_sizes_reads_womens_kids_and_big_sizes(): void
    {
        $read = app(OrderAssistant::class)->parse('10 jerseys: 5 W10, 5 w12; 8 shorts 10y; 2 jerseys 6xl, 1 jersey XXXXXL');
        $by = collect($read['items'])->keyBy(fn ($i) => $i['garment'].'|'.($i['fit'] ?? ''));
        $this->assertSame(['W10' => 5, 'W12' => 5], $by['jersey|womens']['sizes']);
        $this->assertSame(['10Y' => 8], $by['shorts|youth']['sizes']);
        $this->assertSame(['5XL' => 1, '6XL' => 2], $by['jersey|']['sizes']);
    }
}
