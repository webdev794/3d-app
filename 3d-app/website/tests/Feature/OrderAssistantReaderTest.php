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
}
