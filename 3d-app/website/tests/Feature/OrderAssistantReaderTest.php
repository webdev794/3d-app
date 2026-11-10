<?php

namespace Tests\Feature;

use App\Services\OrderAnalysis;
use App\Services\OrderAssistantAi;
use App\Services\OrderAssistantReader;
use Mockery;
use Tests\TestCase;

/** The Order Assistant's reading (task TL-3): sheets and typed notes with no AI; photos and loose text by 3DEEZI AI (faked here). */
class OrderAssistantReaderTest extends TestCase
{
    public function test_typed_notes_are_read_without_ai(): void
    {
        $ai = Mockery::mock(OrderAssistantAi::class);
        $ai->shouldNotReceive('read');
        $this->app->instance(OrderAssistantAi::class, $ai);

        $out = app(OrderAssistantReader::class)->read('I need 9 polos: 3 x 4XL, 2 x 2XL and 4 x 5XL. Black with our club logo on the chest.', [], [], true);
        $a = $out['analysis'];
        $this->assertSame(9, $a['totals']['garments']);
        $this->assertSame(['polo' => 9], $a['totals']['by_garment']);
        $this->assertSame(['2XL' => 2, '4XL' => 3, '5XL' => 4], $a['groups'][0]['garments'][0]['sizes']['mens']);
        $this->assertFalse($out['ai_used']);
    }

    public function test_a_photo_of_notes_is_read_by_ai_and_checked_the_same_way(): void
    {
        $ai = Mockery::mock(OrderAssistantAi::class);
        $ai->shouldReceive('available')->andReturn(true);
        $ai->shouldReceive('read')->once()->andReturn(['title' => 'Mantis Music', 'unread' => ['see you Friday'], 'lines' => [
            ['order' => '', 'member' => 'George', 'garment' => 'Day polo', 'type' => '', 'design' => 'Blue', 'size' => 'Men %XL', 'qty' => '1', 'note' => ''],
            ['order' => '', 'member' => '', 'garment' => 'Day polo', 'type' => '', 'design' => 'Blue', 'size' => 'Women 12', 'qty' => '2', 'note' => ''],
        ]]);
        $this->app->instance(OrderAssistantAi::class, $ai);
        $path = tempnam(sys_get_temp_dir(), 'oa').'.jpg';
        file_put_contents($path, 'x');

        $out = app(OrderAssistantReader::class)->read('', [['path' => $path, 'extension' => 'jpg', 'name' => 'notes.jpg']], [], true);
        $a = $out['analysis'];
        $this->assertTrue($out['ai_used']);
        $this->assertSame('Mantis Music', $a['title']);
        $this->assertSame(3, $a['totals']['garments']);
        $this->assertSame(['W12' => 2], $a['groups'][0]['garments'][0]['sizes']['womens']);
        $text = implode("\n", array_column($a['checks'], 'text'));
        $this->assertStringContainsString('George’s Day Polo size reads "Men %XL"', $text);
        $this->assertStringContainsString('"see you Friday"', $text);
        $this->assertSame([['name' => 'notes.jpg', 'how' => 'ai']], $out['sources']);
        @unlink($path);
    }

    /** "football jersey with water logo" (bug 2026-11-06): the sport is kept, as the catalog's model "Football jersey". */
    public function test_the_sport_the_customer_names_is_the_product(): void
    {
        $ai = Mockery::mock(OrderAssistantAi::class);
        $ai->shouldReceive('available')->andReturn(true);
        // As 3DEEZI AI read it: the garment "Jersey", no sport and no size.
        $ai->shouldReceive('read')->once()->andReturn(['title' => '', 'unread' => [], 'lines' => [
            ['order' => '', 'member' => '', 'garment' => 'Jersey', 'type' => '', 'sport' => '', 'design' => 'Water logo', 'size' => '', 'qty' => '1', 'note' => ''],
        ]]);
        $this->app->instance(OrderAssistantAi::class, $ai);

        $a = app(OrderAssistantReader::class)->read('football jersey with water logo', [], [], true)['analysis'];
        $this->assertSame('Football jersey', $a['groups'][0]['garments'][0]['name']);
        $this->assertSame('Water logo', $a['groups'][0]['design']);
        $this->assertSame(['Football jersey' => 1], $a['totals']['by_product']);
        $this->assertSame(['jersey@football' => 'Football jersey'], $a['totals']['columns']);
        $this->assertSame('1 garment: 1 Football jersey.', OrderAnalysis::summaryText($a));
        $this->assertContains('Football jersey: no size given (row 1).', array_column($a['checks'], 'text'));
        $this->assertSame('football', $a['groups'][0]['garments'][0]['sport']);
    }

    public function test_each_sport_is_its_own_model_and_a_jersey_with_no_sport_is_asked(): void
    {
        $ai = Mockery::mock(OrderAssistantAi::class);
        $ai->shouldNotReceive('read');
        $this->app->instance(OrderAssistantAi::class, $ai);

        $a = app(OrderAssistantReader::class)->read("Football:\nJerseys: 3 x M, 2 x L\nRugby shorts: 4 x XL\nNetball jerseys: 2 x S", [], [], false)['analysis'];
        $this->assertSame(['Football jersey' => 5, 'Rugby playing shorts' => 4, 'Netball dress' => 2], $a['totals']['by_product']);
        $this->assertSame('11 garments: 5 Football jerseys, 4 Rugby playing shorts and 2 Netball dresses.', OrderAnalysis::summaryText($a));

        $a = app(OrderAssistantReader::class)->read('Jerseys: 3 x M, 2 x L', [], [], false)['analysis'];
        $this->assertSame(['Jersey (sport not given)' => 5], $a['totals']['by_product']);
        $this->assertSame('5 garments: 5 jerseys (sport not given).', OrderAnalysis::summaryText($a));
        $this->assertSame('sport', $a['checks'][0]['type']);
        $this->assertStringContainsString('which sport', $a['checks'][0]['text']);
    }

    public function test_a_guest_photo_waits_for_sign_in_and_costs_nothing(): void
    {
        $ai = Mockery::mock(OrderAssistantAi::class);
        $ai->shouldNotReceive('read');
        $this->app->instance(OrderAssistantAi::class, $ai);
        $out = app(OrderAssistantReader::class)->read('', [['path' => __FILE__, 'extension' => 'jpg', 'name' => 'notes.jpg']], [], false);
        $this->assertSame([['name' => 'notes.jpg', 'how' => 'sign_in']], $out['sources']);
        $this->assertSame(0, $out['analysis']['totals']['garments']);
    }

    /** QA8 2026-11-06: 3XL is a size, several players on one line, the sport heading never joins a name, a garment with no size is kept. */
    public function test_typed_notes_sizes_players_and_no_size_lines(): void
    {
        $reader = app(\App\Services\OrderFormReader::class);
        foreach (['2 polo 3XL', '2 polos size 3XL'] as $text) {
            $items = $reader->notes($text)['items'];
            $this->assertSame('polo', $items[0]['garment'], $text);
            $this->assertSame(['3XL' => 2], $items[0]['sizes'], $text);
        }
        $items = $reader->notes('Football jersey: Smith 7 M, Jones 10 L')['items'];
        $this->assertCount(1, $items);
        $this->assertSame('football', $items[0]['sport']);
        $this->assertSame([['name' => 'Smith', 'number' => '7', 'size' => 'M'], ['name' => 'Jones', 'number' => '10', 'size' => 'L']], $items[0]['players']);
        $this->assertSame(2, array_sum($items[0]['sizes']));
        $items = $reader->notes('Football: Smith #7 M')['items'];
        $this->assertSame('Smith', $items[0]['players'][0]['name']);
        $this->assertSame('football', $items[0]['sport']);

        $a = app(OrderAssistantReader::class)->read('10 football jerseys', [], [], false)['analysis'];
        $this->assertSame(['Football jersey' => 10], $a['totals']['by_product']);
        $this->assertContains('Football jersey: no size given (row 1).', array_column($a['checks'], 'text'));
    }

    /** Each garment row of an analysis as name => sizes (all fits), with "?" for the garments counted with no size. */
    private function rows(array $a): array
    {
        $rows = [];
        foreach ($a['groups'] as $g) {
            foreach ($g['garments'] as $r) {
                $sizes = array_merge(...array_values($r['sizes']));
                if ($r['unsure'] > 0) {
                    $sizes['?'] = $r['unsure'];
                }
                $rows[$r['name']] = $sizes;
            }
        }

        return $rows;
    }

    private function readNotes(string $text): array
    {
        $ai = Mockery::mock(OrderAssistantAi::class);
        $ai->shouldNotReceive('read');
        $this->app->instance(OrderAssistantAi::class, $ai);

        return app(OrderAssistantReader::class)->read($text, [], [], true);
    }

    /** QA9 2026-11-10: several items in one message, split by ". ": none dropped, none renamed. */
    public function test_several_items_in_one_message_are_each_read(): void
    {
        $out = $this->readNotes('Rugby league jerseys: 5 S, 10 M, 8 L, 2 XXL. Netball dress x 12 size 12');
        $a = $out['analysis'];
        $this->assertSame(['Rugby League jersey' => ['S' => 5, 'M' => 10, 'L' => 8, '2XL' => 2], 'Netball dress' => ['W12' => 12]], $this->rows($a));
        $this->assertSame(37, $a['totals']['garments']);
        $this->assertSame([], $out['unread']);
        $this->assertFalse($out['ai_used']);

        // On its own, as before.
        $this->assertSame(['Rugby League jersey' => ['M' => 5]], $this->rows($this->readNotes('Rugby league jersey 5 M')['analysis']));
        // Items split by commas or semicolons too.
        $this->assertSame(['Rugby League jersey' => ['S' => 5, 'M' => 10], 'Netball dress' => ['W12' => 12]],
            $this->rows($this->readNotes('Rugby league jerseys: 5 S, 10 M, Netball dress x 12 size 12')['analysis']));
        $this->assertSame(['Football jersey' => ['M' => 3], 'Football hoodie' => ['L' => 5]], $this->rows($this->readNotes('Football jerseys 3 x M, 5 hoodies L')['analysis']));
        $this->assertSame(['Shorts' => ['M' => 4], 'Socks' => ['L' => 3]], $this->rows($this->readNotes('4 shorts M. 3 socks L')['analysis']));
        $this->assertSame(['Football jersey' => ['M' => 3, 'L' => 2], 'Football hoodie' => ['L' => 5]], $this->rows($this->readNotes('Football: 3 x M, 2 x L. 5 hoodies L')['analysis']));
        // An initial or "St." is no sentence end.
        $this->assertSame(['Football jersey' => ['M' => 1, 'XL' => 1]], $this->rows($this->readNotes('Football jersey: J. Wallace - 12 - XL, Smith 7 M')['analysis']));
        $this->assertSame(['Polo' => ['M' => 3]], $this->rows($this->readNotes('St. Kilda polos 3 x M')['analysis']));
    }

    /** Bug 2026-11-06: "Football jerseys 3 x M" then "5 hoodies" was 8 football hoodies (the one-garment guess overrode the jerseys). */
    public function test_a_jersey_line_and_a_hoodie_line_stay_two_garments(): void
    {
        $a = $this->readNotes("Football jerseys 3 x M\n5 hoodies")['analysis'];
        $this->assertSame(['Football jersey' => ['M' => 3], 'Football hoodie' => ['?' => 5]], $this->rows($a));
        $this->assertSame(8, $a['totals']['garments']);
        $this->assertContains('Football hoodie: no size given (row 2).', array_column($a['checks'], 'text'));
        $this->assertSame(['Football jersey' => ['M' => 3], 'Football hoodie' => ['?' => 5]], $this->rows($this->readNotes('Football jerseys 3 x M; 5 hoodies')['analysis']));
        // The garment the message names is still used when the reader only guessed a jersey ("9 polos: 3 x 4XL…").
        $this->assertSame(['Polo' => ['2XL' => 2, '4XL' => 3, '5XL' => 4]],
            $this->rows($this->readNotes('I need 9 polos: 3 x 4XL, 2 x 2XL and 4 x 5XL. Black with our club logo on the chest.')['analysis']));
        // Two garments run together with no comma: shown to check, never silently one garment.
        $this->assertStringContainsString('several garments on one line', implode(' ', $this->readNotes('Football jerseys 3 x M 5 hoodies L')['unread']));
    }

    /** QA9 2026-11-10: a netball dress's sizes are numbers (womens W8 to W24), "dresses" is read, other plurals stay right. */
    public function test_netball_dress_sizes_and_plurals(): void
    {
        foreach (['Netball dress x 12 size 12', '12 netball dresses size 12', '12 netball dress 12', "Netball:\nDresses x 12 size 12"] as $text) {
            $out = $this->readNotes($text);
            $this->assertSame(['Netball dress' => ['W12' => 12]], $this->rows($out['analysis']), $text);
            $this->assertSame('12 garments: 12 Netball dresses.', OrderAnalysis::summaryText($out['analysis']), $text);
            $this->assertSame([], $out['unread'], $text);
        }
        $this->assertSame(['Netball dress' => ['M' => 4]], $this->rows($this->readNotes('4 netball dresses M')['analysis']));
        $this->assertSame(['Tennis dress' => ['W10' => 2]], $this->rows($this->readNotes('Tennis dress x 2 size 10')['analysis']));
        // No size: kept and asked, named a dress (not "Netball singlet with bib").
        $a = $this->readNotes('Netball dresses x 12')['analysis'];
        $this->assertSame(['Netball dress' => ['?' => 12]], $this->rows($a));
        $this->assertContains('Netball dress: no size given (row 1).', array_column($a['checks'], 'text'));
        // A number size the price list doesn't have: kept, and the check list says so.
        $a = $this->readNotes('12 netball dresses size 6')['analysis'];
        $this->assertSame(['Netball dress' => ['?' => 12]], $this->rows($a));
        $this->assertStringContainsString('has "6" (row 1): not a size we know', implode(' ', array_column($a['checks'], 'text')));
        // Other plurals as before.
        $this->assertSame(['Shorts' => ['M' => 6]], $this->rows($this->readNotes('6 shorts M')['analysis']));
        $this->assertSame(['Polo' => ['3XL' => 2]], $this->rows($this->readNotes('2 polos 3XL')['analysis']));
        $this->assertSame('shorts', OrderAnalysis::garmentOf('Training shorts'));
        // 3DEEZI AI's lines: "Netball dresses" with the size "12" is a Netball dress W12.
        $line = OrderAnalysis::line(['garment' => 'Netball dresses', 'size' => '12', 'qty' => '12']);
        $this->assertSame(['singlet', 'Netball dress', 'W12', 'womens'], [$line['garment'], $line['product'], $line['size'], $line['fit']]);
    }

    /** Nothing a customer wrote disappears: a garment named with nothing ordered, or a garment we don't make, is in the "not read" list. */
    public function test_parts_not_read_are_listed(): void
    {
        $out = $this->readNotes('Rugby league jerseys: 5 S. Netball dresses');
        $this->assertSame(['Rugby League jersey' => ['S' => 5]], $this->rows($out['analysis']));
        $this->assertSame(['Netball dresses (how many, in which sizes?)'], $out['unread']);
        $this->assertStringContainsString('"Netball dresses (how many, in which sizes?)"', implode(' ', array_column($out['analysis']['checks'], 'text')));
        // An empty "Netball dresses" heading never turns the jerseys into netball dresses (its sport is not theirs).
        $out = $this->readNotes("Jerseys: 4 S, 6 M\nNetball dresses");
        $this->assertSame(['Jersey (sport not given)' => ['S' => 4, 'M' => 6]], $this->rows($out['analysis']));
        $this->assertSame(['Netball dresses (how many, in which sizes?)'], $out['unread']);
        $this->assertSame(['Jersey (sport not given)' => ['S' => 4], 'Netball dress' => ['W12' => 12]],
            $this->rows($this->readNotes('Jerseys 4 S. Netball dress x 12 size 12')['analysis']));
        // A sport that keeps the garment's kind is still shared ("Netball dress …" then "5 hoodies L": Netball hoodies).
        $this->assertSame(['Netball dress' => ['W12' => 12], 'Netball hoodie' => ['L' => 5]],
            $this->rows($this->readNotes("Netball dress x 12 size 12\n5 hoodies L")['analysis']));
        // Nothing read (it would go to 3DEEZI AI when signed in): listed as not read.
        $this->assertSame(['12 skirts size 10'], app(OrderAssistantReader::class)->read('12 skirts size 10', [], [], false)['unread']);
    }
}
