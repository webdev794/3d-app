<?php

namespace Tests\Feature;

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

    public function test_a_guest_photo_waits_for_sign_in_and_costs_nothing(): void
    {
        $ai = Mockery::mock(OrderAssistantAi::class);
        $ai->shouldNotReceive('read');
        $this->app->instance(OrderAssistantAi::class, $ai);
        $out = app(OrderAssistantReader::class)->read('', [['path' => __FILE__, 'extension' => 'jpg', 'name' => 'notes.jpg']], [], false);
        $this->assertSame([['name' => 'notes.jpg', 'how' => 'sign_in']], $out['sources']);
        $this->assertSame(0, $out['analysis']['totals']['garments']);
    }
}
