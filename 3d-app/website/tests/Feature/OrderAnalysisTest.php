<?php

namespace Tests\Feature;

use App\Services\OrderAnalysis;
use Tests\TestCase;

/**
 * The Order Assistant's sheet reader (task TL-3): per-person lines grouped by design / colour and garment, Men /
 * Women / Kids size sets, totals equal to the sheet, and the things to check.
 */
class OrderAnalysisTest extends TestCase
{
    /** A small family reunion sheet shaped like the client's (Order | Registered? | Member | Garment | Type | Colour / Line | Size | Qty). */
    public static function sheet(): array
    {
        $rows = [1 => ['Order', 'Registered family?', 'Member', 'Garment', 'Type', 'Colour / Line', 'Size', 'Qty', 'Note']];
        $data = [
            ['7647', 'Yes', 'Caroline Harrington', 'Line Uniform', 'Polo', 'Teariki - Purple', 'Women 14W', '1'],
            ['7647', 'Yes', 'Caroline Harrington', 'Opening Day Polo', '', '', 'Women 14W', '1'],
            ['7683', 'Yes', 'Geoffrey Charlie', 'Line Uniform', 'Polo', 'Annie More- Torquoise', 'Men 5XL', '1'],
            ['7683', 'Yes', 'Geoffrey Charlie', 'Line Uniform', 'Singlet', 'Annie More- Torquoise', 'Men 5XL', '1'],
            ['7695', 'Yes', 'Atera Sword', 'Line Uniform', 'Polo', 'Annie More- Torquoise', 'Kids 8Y', '1'],
            ['7700', 'Yes', 'Georgina Manuel', 'Opening Day Polo', '', '', 'Men %XL', '1'],
            ['7701', 'Yes', 'Motu Tetevano', 'Line Uniform', 'Polo', 'Charles Iti - Lime Green', 'Women 16W', '1'],
            ['7702', 'Yes', 'Motu Tetevano', 'Line Uniform', 'Polo', 'Charles Iti - Lime Green', 'Women 18W', '1'],
            ['7697', 'No', '(unassigned)', 'Line Uniform', 'Polo', 'John Rio - Baby Blue', 'Men M', '3'],
            ['7697', 'No', '(unassigned)', 'Opening Day Polo', '', '', 'Men 5XL', '3'],
        ];
        foreach ($data as $i => $r) {
            $rows[$i + 2] = $r;
        }

        return $rows;
    }

    public function test_a_sheet_is_read_line_by_line_and_grouped_by_colour_and_garment(): void
    {
        $lines = OrderAnalysis::linesFromTable(self::sheet(), 'reunion.xlsx');
        $this->assertCount(10, $lines);
        $a = OrderAnalysis::analyse($lines, [], 'Reunion');

        $this->assertSame(14, $a['totals']['garments']);
        $this->assertSame(['polo' => 13, 'singlet' => 1], $a['totals']['by_garment']);
        $this->assertSame(7, $a['totals']['orders']);
        $this->assertSame(['Teariki – Purple', 'Annie More – Turquoise', 'Charles Iti – Lime Green', 'John Rio – Baby Blue', 'Opening Day'], array_column($a['groups'], 'design'));
        $annie = $a['groups'][1];
        $this->assertSame(3, $annie['total']);
        $this->assertSame(['Line Uniform Polo', 'Line Uniform Singlet'], array_column($annie['garments'], 'name'));
        $this->assertSame(['8Y' => 1], $annie['garments'][0]['sizes']['youth']);
        $this->assertSame(['5XL' => 1], $annie['garments'][0]['sizes']['mens']);
        $opening = $a['groups'][4];
        $this->assertSame(['W14' => 1], $opening['garments'][0]['sizes']['womens']);
        $this->assertSame(['5XL' => 4], $opening['garments'][0]['sizes']['mens'], 'Men %XL counted as 5XL');

        // The order form: one row per design, garment and fit, with the design in its name.
        $item = collect($a['items'])->firstWhere('label', 'Line Uniform Polo – Annie More – Turquoise');
        $this->assertNotNull($item);
        $this->assertSame('polo', $item['garment']);
        $this->assertSame(14, array_sum(array_map(fn ($i) => array_sum($i['sizes']), $a['items'])));
    }

    public function test_the_things_to_check(): void
    {
        $a = OrderAnalysis::analyse(OrderAnalysis::linesFromTable(self::sheet()), [['name' => 'Committee polos.jpg'], ['name' => 'annie more torquoise.png']]);
        $text = implode("\n", array_column($a['checks'], 'text'));

        $this->assertStringContainsString('Georgina Manuel’s Opening Day Polo size reads "Men %XL", which looks like a typo for Men 5XL', $text);
        $this->assertStringContainsString('Possible double orders: Motu Tetevano has the same garment on more than one line', $text);
        $this->assertStringContainsString('1 person ordered different sizes on different lines. For example, Motu Tetevano has Women 16W and Women 18W.', $text);
        $this->assertStringContainsString('2 lines don’t have a member name.', $text);
        $this->assertStringContainsString('"Annie More- Torquoise" is read as "Annie More – Turquoise".', $text);
        $this->assertStringContainsString('Nobody ordered the design in "Committee polos.jpg".', $text);
        $this->assertStringNotContainsString('annie more torquoise.png', $text, 'a picture named like a colour is that colour’s design');
        $this->assertSame('annie more torquoise.png', $a['groups'][1]['image']);
    }

    public function test_design_pictures_find_their_group_by_choice_name_colour_word_or_colour(): void
    {
        $designs = [
            ['name' => 'Annie More - Torquoise.png', 'colour' => null, 'group' => null],
            ['name' => 'baby blue polo.jpg', 'colour' => null, 'group' => null],
            ['name' => 'IMG_2041.jpg', 'colour' => '#7e40c6', 'group' => null],
            ['name' => 'Committee brown.jpg', 'colour' => '#7a4b2a', 'group' => null],
            ['name' => 'front.png', 'colour' => '#000000', 'group' => 'charles-iti-lime-green'],
        ];
        $a = OrderAnalysis::analyse(OrderAnalysis::linesFromTable(self::sheet()), $designs);
        $images = array_column($a['groups'], 'image', 'design');
        $this->assertSame('Annie More - Torquoise.png', $images['Annie More – Turquoise']);
        $this->assertSame('baby blue polo.jpg', $images['John Rio – Baby Blue']);
        $this->assertSame('IMG_2041.jpg', $images['Teariki – Purple'], "by the picture’s colour");
        $this->assertSame('front.png', $images['Charles Iti – Lime Green'], "the customer’s choice");
        $this->assertNull($images['Opening Day']);
        $this->assertSame(['name', 'name', 'colour', null, 'chosen'], array_column($a['designs'], 'how'));
        $this->assertStringContainsString('Nobody ordered the design in "Committee brown.jpg"', implode("\n", array_column($a['checks'], 'text')));
    }

    public function test_sizes_titles_and_garment_words(): void
    {
        $this->assertSame(['W14', 'womens', null], OrderAnalysis::size('Women 14W'));
        $this->assertSame(['8Y', 'youth', null], OrderAnalysis::size('Kids 8Y'));
        $this->assertSame(['W12', 'womens', null], OrderAnalysis::size('Ladies 12'));
        $this->assertSame([null, 'mens', '5XL'], OrderAnalysis::size('Men %XL'));
        $this->assertSame('polo', OrderAnalysis::garmentOf('Opening Day Polo'));
        $this->assertSame('singlet', OrderAnalysis::garmentOf('Tank top'));
        $this->assertSame('Strickland Family Reunion', OrderAnalysis::titleFrom('Strickland Family Reuion 20th Oct 2026 at 9pm (1).xlsx'));
        $this->assertNull(OrderAnalysis::linesFromTable([1 => ['Hello'], 2 => ['3 x 4XL polos']]), 'no header row: 3DEEZI AI reads it');
    }

    public function test_a_csv_sheet(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'oa').'.csv';
        file_put_contents($path, "Name,Item,Size,Qty\nSmith,Jersey,M,2\nJones,Jersey,XXL,1\n,Shorts,L,4\n");
        $a = OrderAnalysis::analyse(OrderAnalysis::linesFromTable(OrderAnalysis::tableRows($path, 'csv')));
        $this->assertSame(7, $a['totals']['garments']);
        $this->assertSame(['jersey' => 3, 'shorts' => 4], $a['totals']['by_garment']);
        $this->assertSame(['M' => 2, '2XL' => 1], $a['groups'][0]['garments'][0]['sizes']['mens']);
        @unlink($path);
    }

    /**
     * The client's real sheet (kept out of the code: set STRICKLAND_SHEET to its path): 527 lines, 90 orders and 555
     * garments = 482 polos (227 Opening Day, 255 family-line) and 73 singlets, as counted by hand and in the client's
     * own PDF.
     */
    public function test_the_strickland_sheet_totals(): void
    {
        $path = (string) getenv('STRICKLAND_SHEET');
        if ($path === '' || ! is_file($path)) {
            $this->markTestSkipped('Set STRICKLAND_SHEET to the client’s Strickland sheet to run this.');
        }
        $a = OrderAnalysis::analyse(OrderAnalysis::linesFromTable(OrderAnalysis::tableRows($path, 'xlsx')));
        $this->assertSame(555, $a['totals']['garments']);
        $this->assertSame(527, $a['totals']['lines']);
        $this->assertSame(90, $a['totals']['orders']);
        $this->assertSame(['polo' => 482, 'singlet' => 73], $a['totals']['by_garment']);
        $this->assertSame(227, $a['totals']['by_product']['Opening Day Polo']);
        $this->assertSame(255, $a['totals']['by_product']['Line Uniform Polo']);
        $this->assertCount(12, $a['groups']);
        $byDesign = array_column($a['groups'], 'total', 'design');
        $this->assertSame(79, $byDesign['Annie More – Turquoise']);
        $this->assertSame(80, $byDesign['Lilly – Yellow/Gold']);
        $opening = collect($a['groups'])->firstWhere('design', 'Opening Day')['garments'][0]['sizes'];
        // The client's PDF: M 8, L 11, XL 22, 2XL 31, 3XL 16, 4XL 11, 5XL 10, 6XL 9, 7XL 2, 8XL 1 and one unrecognised
        // ("Men %XL"), which is counted here as 5XL (and listed to check).
        $this->assertSame(['M' => 8, 'L' => 11, 'XL' => 22, '2XL' => 31, '3XL' => 16, '4XL' => 11, '5XL' => 11, '6XL' => 9, '7XL' => 2, '8XL' => 1], $opening['mens']);
        $this->assertSame(122, array_sum($opening['mens']));
        $this->assertSame(87, array_sum($opening['womens']));
        $this->assertSame(18, array_sum($opening['youth']));
        $this->assertSame(555, array_sum(array_map(fn ($i) => array_sum($i['sizes']), $a['items'])));
        $text = implode("\n", array_column($a['checks'], 'text'));
        $this->assertStringContainsString('"Men %XL"', $text);
        $this->assertStringContainsString('18 people ordered different sizes on different lines', $text);
        $this->assertStringContainsString('116 lines don’t have a member name.', $text);
    }
}
