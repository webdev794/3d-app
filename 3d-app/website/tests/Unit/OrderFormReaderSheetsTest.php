<?php

namespace Tests\Unit;

use App\Services\OrderFormReader;
use Tests\TestCase;

/** Real-world order sheets: title rows, garment section headings, sizes as columns, a Size column per player, .xls. */
class OrderFormReaderSheetsTest extends TestCase
{
    private function read(string $name): array
    {
        $file = base_path('tests/fixtures/order-sheets/'.$name);

        return app(OrderFormReader::class)->suggest($file, pathinfo($file, PATHINFO_EXTENSION));
    }

    public function test_an_xls_team_order_with_title_rows_and_garment_sections(): void
    {
        $read = $this->read('team-title.xls');
        $this->assertSame(['jersey', 'shorts'], array_column($read['items'], 'garment'));
        $this->assertSame(['M' => 2, 'L' => 1, 'XL' => 1, '10Y' => 1], $read['items'][0]['sizes']);
        $this->assertSame('WALKER', $read['items'][0]['players'][2]['name']);
        $this->assertSame(8, $read['players']);
        $this->assertNotEmpty($read['unknown']);
    }

    public function test_sizes_as_columns_under_a_title_row(): void
    {
        $read = $this->read('sizes-columns.xlsx');
        $this->assertCount(3, $read['items']);
        $this->assertSame(['M' => 4, 'L' => 4, 'XL' => 2], $read['items'][2]['sizes']);
    }

    public function test_a_player_list_with_a_size_column(): void
    {
        $read = $this->read('player-list.csv');
        $this->assertSame(['S' => 1, 'M' => 2, 'L' => 1, 'XL' => 1], $read['items'][0]['sizes']);
        $this->assertCount(5, $read['items'][0]['players']);
        $this->assertStringContainsString('huge', $read['unknown'][0]);
    }

    public function test_size_x_quantity_garment_lines(): void
    {
        $read = app(OrderFormReader::class)->notes("2xl x 10 singlets
3xl x 20 tees");
        $this->assertSame(['2XL' => 10], $read['items'][0]['sizes']);
        $this->assertSame(['3XL' => 20], $read['items'][1]['sizes']);
    }

    public function test_typed_notes_are_built_into_garments_sizes_and_players(): void
    {
        $read = app(OrderFormReader::class)->notes(implode("
", ['Polo', '3 x 4XL', '2 x 2XL', '4 x 5XL', '', 'Jerseys:', '4XL x 3', 'm - 2', 'J. Wallace 12 XL', 'Smith 7 M', 'Shorts', 'L 4, XL 2', 'something odd here']));
        $this->assertSame(['polo', 'jersey', 'shorts'], array_column($read['items'], 'garment'));
        $this->assertSame(['4XL' => 3, '2XL' => 2, '5XL' => 4], $read['items'][0]['sizes']);
        $this->assertSame(['4XL' => 3, 'M' => 3, 'XL' => 1], $read['items'][1]['sizes']);
        $this->assertSame('Smith', $read['items'][1]['players'][1]['name']);
        $this->assertSame(['L' => 4, 'XL' => 2], $read['items'][2]['sizes']);
        $this->assertSame(['something odd here'], $read['unknown']);
    }
}
