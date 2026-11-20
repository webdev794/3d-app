<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\OrderFormReader;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\Support\OrderFormSample;
use Tests\TestCase;

/**
 * "Paste your order here" (ORDERPASTE, client 2026-11-13, order 537): whatever is pasted is read into the order, by
 * 3DEEZI AI for signed-in customers and by the built-in reader otherwise. No real OpenAI calls (canned answers).
 */
class OrderFillTest extends TestCase
{
    use RefreshDatabase;

    private const FABIAN = 'i need XS x 3 , S x 5 , M x 5 , L x 5 , XL x 8 , 2XL x 8 , 3XL x 6 , 4xl x 5 , 5XL x 5';

    private const FIFTY = ['XS' => 3, 'S' => 5, 'M' => 5, 'L' => 5, 'XL' => 8, '2XL' => 8, '3XL' => 6, '4XL' => 5, '5XL' => 5];

    private function notes(string $text): array
    {
        return app(OrderFormReader::class)->notes($text);
    }

    /** Order 537: "SIZE x QTY" on one line with commas was read as 2XL 1, 3XL 1, 4XL 1, 5XL 1 (4 garments, not 50). */
    public function test_a_size_x_quantity_list_on_one_line_is_read_in_full(): void
    {
        $read = $this->notes(self::FABIAN);
        $this->assertCount(1, $read['items']);
        $this->assertSame(self::FIFTY, $read['items'][0]['sizes']);
        $this->assertSame(50, array_sum($read['items'][0]['sizes']));
        $this->assertSame([], $read['unknown']);
    }

    public function test_sizes_and_quantities_in_any_wording(): void
    {
        $want = ['XS' => 3, 'S' => 5, 'M' => 2];
        foreach ([
            'XS x 3, S x 5, M x 2', '3 x XS, 5 x S, 2 x M', 'XS-3, S-5, M-2', 'XS: 3, S: 5, M: 2', '3 XS, 5 S, 2 M', 'XS 3 S 5 M 2',
            "XS x 3\nS x 5\nM x 2", "3 XS\n5 S\n2 M", 'xs x3, s x5, m x2', 'XS × 3; S × 5; M × 2', '3 x XS, S-5, M: 2',
        ] as $text) {
            $read = $this->notes($text);
            $this->assertSame($want, $read['items'][0]['sizes'] ?? null, $text);
        }
        // Glued sizes with their quantity after them, both ways round.
        $this->assertSame(['2XL' => 8, '3XL' => 6], $this->notes('2XL x 8, 3XL x 6')['items'][0]['sizes']);
        $this->assertSame(['2XL' => 8, '3XL' => 6], $this->notes('8 x 2XL, 6 x 3XL')['items'][0]['sizes']);
        // A garment named with the list.
        $read = $this->notes('Polos: XS x 3, S x 5');
        $this->assertSame('polo', $read['items'][0]['garment']);
        $this->assertSame(['XS' => 3, 'S' => 5], $read['items'][0]['sizes']);
    }

    /** LINKTEST round 1 (2026-11-13): spaced "3 XL", a size before a colon, "2xS", players' numbers; never silently wrong. */
    public function test_spaced_sizes_colons_and_players_are_read_and_the_rest_is_shown_to_check(): void
    {
        // The client's own MANTIS message: "3 XL X 5" is 3XL (was read as XL: XL 13, no 3XL).
        $read = $this->notes('make a order form using these sizes for each garment XS x 5 , S x 5 , M X 6 , L X 6 , XL X 8 , 2XL X 8 , 3 XL X 5 , 4XL X 5 . 5XL X 5');
        $this->assertSame(['XS' => 5, 'S' => 5, 'M' => 6, 'L' => 6, 'XL' => 8, '2XL' => 8, '3XL' => 5, '4XL' => 5, '5XL' => 5], $read['items'][0]['sizes']);
        $this->assertSame([], $read['unknown']);
        // "2 XL x 4" with a quantity after it is 2XL (was 9 XL); "3 XL, 5 L" is still three XL.
        $this->assertSame(['2XL' => 4, '3XL' => 2, '4XL' => 1], $this->notes('jerseys: 2 XL x 4, 3 XL x 2, 4 XL x 1')['items'][0]['sizes']);
        $this->assertSame(['2XL' => 4], $this->notes('2 XL - 4')['items'][0]['sizes']);
        $this->assertSame(['XL' => 3, 'L' => 5], $this->notes('3 XL, 5 L')['items'][0]['sizes']);
        // A size before the colon belongs to the sizes, not the heading (XS 2 was dropped).
        $read = $this->notes('Polo XS: 2, S: 4, 2XL: 1');
        $this->assertSame('polo', $read['items'][0]['garment']);
        $this->assertSame(['XS' => 2, 'S' => 4, '2XL' => 1], $read['items'][0]['sizes']);
        // "2xS 4xM": two S and four M (was XS 2).
        $this->assertSame(['S' => 2, 'M' => 4], $this->notes('jerseys 2xS 4xM')['items'][0]['sizes']);
        // "XS x 3 S x 5" follows the written "x" (never 3 S, 5 M); the last "M x" is shown to check.
        $read = $this->notes('jerseys XS x 3 S x 5 M x');
        $this->assertSame(['XS' => 3, 'S' => 5], $read['items'][0]['sizes']);
        $this->assertStringContainsString('part of this line was not read', implode(' ', $read['unknown']));
        $this->assertStringContainsString('part of this line was not read', implode(' ', $this->notes('jerseys: XS x 3, S x 5, 7')['unknown']));
        // A name, a number and a size is a player: 3 players, not 40 jerseys.
        $read = $this->notes('John Smith 7 M, Jane Doe 10 L, Ari Tane 23 XL');
        $this->assertSame(['M' => 1, 'L' => 1, 'XL' => 1], $read['items'][0]['sizes']);
        $this->assertSame(['John Smith', 'Jane Doe', 'Ari Tane'], array_column($read['items'][0]['players'], 'name'));
        $this->assertSame(['7', '10', '23'], array_column($read['items'][0]['players'], 'number'));
        // Womens and kids sizes with ":" or "=" (ORDERFORMGEN: "W12: 3, 10Y = 2" was 1 kids garment): each in its own fit.
        $read = $this->notes('W12: 3, 10Y = 2');
        $this->assertSame([['womens', ['W12' => 3]], ['youth', ['10Y' => 2]]], array_map(fn ($i) => [$i['fit'] ?? null, $i['sizes']], $read['items']));
        $this->assertSame([], $read['unknown']);
        foreach (['W12 x 3, Y10 x 2', '3 x W12, 2 x 10Y', 'Womens 12: 3, Kids 10 = 2'] as $text) {
            $this->assertSame([['W12' => 3], ['10Y' => 2]], array_column($this->notes($text)['items'], 'sizes'), $text);
        }
        $read = $this->notes('netball dresses W12: 3, W14: 2');
        $this->assertSame(['W12' => 3, 'W14' => 2], $read['items'][0]['sizes']);
        $this->assertSame('Netball dress', $read['items'][0]['label'] ?? null);
        // "U13" is no total; a date is not a size.
        $this->assertSame([], $this->notes('U13 jerseys 3 x M')['unknown']);
        $this->assertSame([], $this->notes('jerseys 3 x M by 12/03/2027')['unknown']);
    }

    /** LINKTEST r2: the raw "Help me add sizes" endpoint reads with the same reader (was XL 9 and 40 jerseys). */
    public function test_the_assist_endpoint_reads_like_the_order_form(): void
    {
        $this->postJson('/api/v1/orders/assist', ['text' => 'jerseys: 2 XL x 4, 3 XL x 2, 4 XL x 1'])->assertOk()
            ->assertJsonPath('data.items.0.sizes', ['2XL' => 4, '3XL' => 2, '4XL' => 1])->assertJsonPath('data.source', 'parser');
        $items = $this->postJson('/api/v1/orders/assist', ['text' => "John Smith 7 M\nJane Doe 10 L\nAri Tane 23 XL"])->assertOk()->json('data.items');
        $this->assertSame(['M' => 1, 'L' => 1, 'XL' => 1], $items[0]['sizes']);
        $this->assertSame(['7', '10', '23'], array_column($items[0]['players'], 'number'));
        $this->postJson('/api/v1/orders/assist', ['text' => '12 jerseys M, 12 shorts L'])->assertOk()
            ->assertJsonPath('data.items.0.sizes', ['M' => 12])->assertJsonPath('data.items.1.garment', 'shorts');
    }

    public function test_a_total_that_the_sizes_do_not_add_up_to_is_shown_to_check(): void
    {
        $read = $this->notes('i need 48 jerseys '.substr(self::FABIAN, 7));
        $this->assertSame(self::FIFTY, $read['items'][0]['sizes']);
        $this->assertContains('You wrote 48, but the sizes add up to 50: please check the quantities.', $read['unknown']);
        $this->assertSame([], $this->notes('i need 50 jerseys '.substr(self::FABIAN, 7))['unknown']);
    }

    public function test_pasted_spreadsheet_cells(): void
    {
        $reader = app(OrderFormReader::class);
        // A size grid copied from Excel (tabs between cells).
        $grid = $reader->cells("Garment\tXS\tS\tM\tL\nJersey\t3\t5\t5\t5\nShorts\t\t2\t4\t");
        $this->assertSame(['jersey', 'shorts'], array_column($grid['items'], 'garment'));
        $this->assertSame(['XS' => 3, 'S' => 5, 'M' => 5, 'L' => 5], $grid['items'][0]['sizes']);
        $this->assertSame(['S' => 2, 'M' => 4], $grid['items'][1]['sizes']);
        // A players list with a heading row.
        $players = $reader->cells("Name\tNumber\tSize\nSmith\t7\tM\nJones\t10\tL\nBrown\t12\tM");
        $this->assertSame(['M' => 2, 'L' => 1], $players['items'][0]['sizes']);
        $this->assertSame(['name' => 'Jones', 'number' => '10', 'size' => 'L'], $players['items'][0]['players'][1]);
        // Not cells: plain notes.
        $this->assertNull($reader->cells(self::FABIAN));
    }

    public function test_a_visitor_gets_the_built_in_reading_and_no_ai_call(): void
    {
        config(['services.openai.key' => 'test-key']);
        Http::fake();
        $this->postJson('/api/v1/orders/fill', ['text' => self::FABIAN])->assertOk()
            ->assertJsonPath('data.items.0.sizes', self::FIFTY)
            ->assertJsonPath('data.total', 50)
            ->assertJsonPath('data.ai', 'sign_in')
            ->assertJsonPath('data.garment_named', false)
            ->assertJsonPath('data.source', 'notes');
        Http::assertNothingSent();
        // Pasted cells go through the sheet reading.
        $this->postJson('/api/v1/orders/fill', ['text' => "Garment\tS\tM\nPolo\t2\t3"])->assertOk()
            ->assertJsonPath('data.items.0.garment', 'polo')->assertJsonPath('data.items.0.sizes', ['S' => 2, 'M' => 3])->assertJsonPath('data.garment_named', true);
        $this->postJson('/api/v1/orders/fill', ['text' => ''])->assertStatus(422);
    }

    public function test_a_signed_in_customer_gets_3deezi_ai_in_one_call(): void
    {
        config(['services.openai.key' => 'test-key', 'services.openai.text_model' => 'gpt-test']);
        Sanctum::actingAs(User::factory()->create());
        $answer = OrderFormSample::aiAnswer([
            'team_name' => 'Mantis', 'contact_name' => '', 'date_required_text' => '', 'unmapped' => [],
            'garments' => [[
                'garment' => 'jersey', 'sport' => '', 'fit' => '', 'label' => '', 'players' => [],
                'quantities' => array_map(fn ($s, $n) => ['form_size' => $s === '4XL' ? '4xl' : $s, 'size' => $s, 'quantity' => $n], array_keys(self::FIFTY), self::FIFTY),
            ]],
        ]);
        Http::fake(['api.openai.com/v1/responses' => Http::response(OrderFormSample::response($answer))]);
        $this->postJson('/api/v1/orders/fill', ['text' => self::FABIAN])->assertOk()
            ->assertJsonPath('data.source', 'ai')
            ->assertJsonPath('data.ai', 'used')
            ->assertJsonPath('data.items.0.sizes', self::FIFTY)
            ->assertJsonPath('data.total', 50)
            ->assertJsonPath('data.form.team_name', 'Mantis')
            ->assertJsonPath('data.unknown', []);
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $r) => str_contains(json_encode($r->data()), 'XS x 3 , S x 5') && str_contains((string) ($r->data()['instructions'] ?? ''), '"2XL x 8" means 8 in size 2XL'));
    }

    public function test_the_ai_count_is_checked_against_a_clean_built_in_reading(): void
    {
        config(['services.openai.key' => 'test-key']);
        Sanctum::actingAs(User::factory()->create());
        // A model that misreads the glued sizes (the old mistake): the customer is asked to check.
        $answer = OrderFormSample::aiAnswer(['unmapped' => [], 'garments' => [[
            'garment' => 'jersey', 'sport' => '', 'fit' => '', 'label' => '', 'players' => [],
            'quantities' => [['form_size' => '2XL', 'size' => '2XL', 'quantity' => 1], ['form_size' => '3XL', 'size' => '3XL', 'quantity' => 1]],
        ]]]);
        Http::fake(['api.openai.com/v1/responses' => Http::response(OrderFormSample::response($answer))]);
        $unknown = $this->postJson('/api/v1/orders/fill', ['text' => self::FABIAN])->assertOk()->assertJsonPath('data.source', 'ai')->json('data.unknown');
        $this->assertContains('Please check the quantities: your text lists 50 garments, the order below has 2.', $unknown);
    }

    /** Real call 3 (2026-11-13): "3 of each size from small to 2xl and 2 4xl" is 17 polos; the built-in reading's 3 is no reason to ask. */
    public function test_more_garments_from_the_ai_than_the_built_in_reading_need_no_check(): void
    {
        config(['services.openai.key' => 'test-key']);
        Sanctum::actingAs(User::factory()->create());
        $sizes = ['S' => 3, 'M' => 3, 'L' => 3, 'XL' => 3, '2XL' => 3, '4XL' => 2];
        $answer = OrderFormSample::aiAnswer(['unmapped' => [], 'garments' => [[
            'garment' => 'polo', 'sport' => '', 'fit' => '', 'label' => '', 'players' => [],
            'quantities' => array_map(fn ($s, $n) => ['form_size' => $s, 'size' => $s, 'quantity' => $n], array_keys($sizes), $sizes),
        ]]]);
        Http::fake(['api.openai.com/v1/responses' => Http::response(OrderFormSample::response($answer))]);
        $this->postJson('/api/v1/orders/fill', ['text' => 'can i get polos 3 of each size from small to 2xl and 2 4xl'])->assertOk()
            ->assertJsonPath('data.items.0.sizes', $sizes)->assertJsonPath('data.total', 17)->assertJsonPath('data.unknown', [])->assertJsonPath('data.garment_named', true);
    }

    public function test_when_the_ai_fails_or_is_off_the_built_in_reading_fills_the_order(): void
    {
        Sanctum::actingAs(User::factory()->create());
        config(['services.openai.key' => 'test-key']);
        Http::fake(['api.openai.com/v1/responses' => Http::response(['error' => ['message' => 'Server busy']], 500)]);
        $this->postJson('/api/v1/orders/fill', ['text' => self::FABIAN])->assertOk()
            ->assertJsonPath('data.ai', 'failed')->assertJsonPath('data.source', 'notes')->assertJsonPath('data.items.0.sizes', self::FIFTY);

        config(['services.openai.key' => '']);
        $this->postJson('/api/v1/orders/fill', ['text' => "Smith 7 M\nJones 10 L"])->assertOk()
            ->assertJsonPath('data.ai', 'off')
            ->assertJsonPath('data.items.0.players.1', ['name' => 'Jones', 'number' => '10', 'size' => 'L'])
            ->assertJsonPath('data.total', 2);
    }
}
