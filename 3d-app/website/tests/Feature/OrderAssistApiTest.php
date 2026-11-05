<?php

namespace Tests\Feature;

use App\Models\OrderAssist;
use App\Models\User;
use App\Services\OrderAssistantAi;
use App\Services\OrderFormAi;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/**
 * The Order Assistant's API (task TL-3): a sheet and design pictures in, the reply with the things to check, the
 * summary, the share page data, a branded PDF and an editable Excel out.
 */
class OrderAssistApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $ai = Mockery::mock(OrderAssistantAi::class);
        $ai->shouldReceive('available')->andReturn(false);
        $ai->shouldNotReceive('read');
        $this->app->instance(OrderAssistantAi::class, $ai);
    }

    private function csv(): UploadedFile
    {
        $text = '';
        foreach (OrderAnalysisTest::sheet() as $row) {
            $text .= implode(',', array_map(fn ($v) => '"'.str_replace('"', '""', $v).'"', $row))."\n";
        }

        return UploadedFile::fake()->createWithContent('Reunion 2027 (1).csv', $text);
    }

    public function test_a_visitor_sends_a_sheet_and_gets_the_checks_summary_pdf_and_excel(): void
    {
        $res = $this->post('/api/v1/order-assistant', [
            'message' => 'Please collate this and make it look good',
            'files' => [$this->csv()],
            'designs' => [UploadedFile::fake()->image('Annie More Torquoise.png', 300, 300), UploadedFile::fake()->image('Committee polos.jpg', 200, 200)],
        ], ['Accept' => 'application/json'])->assertCreated();

        $data = $res->json('data');
        $this->assertSame('Reunion 2027', $data['title']);
        $this->assertSame(14, $data['analysis']['totals']['garments']);
        $this->assertStringStartsWith('14 garments from 7 orders: 13 polos', $data['summary']);
        $reply = end($data['messages'])['text'];
        $this->assertStringContainsString('I’ve analysed your order', $reply);
        $this->assertStringContainsString('"Men %XL"', $reply);
        $this->assertStringContainsString('Nobody ordered the design in "Committee polos.jpg"', implode("\n", array_column($data['analysis']['checks'], 'text')));
        $this->assertSame('3DEEZI', $data['made_by']['name']);
        $this->assertCount(2, $data['designs']);
        $token = $data['token'];
        $this->assertSame(40, strlen($token));
        $this->assertStringEndsWith('/orders/summary/'.$token, $data['links']['page']);

        // The share page's data, the picture, the PDF and the Excel open with the token alone.
        $this->getJson('/api/v1/order-assistant/'.$token)->assertOk()->assertJsonPath('data.analysis.totals.garments', 14);
        $this->get('/api/v1/order-assistant/'.$token.'/designs/0')->assertOk();
        $pdf = $this->get('/api/v1/order-assistant/'.$token.'/pdf')->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $pdf->getContent());
        $this->assertStringContainsString('Reunion_2027_Order_Form.pdf', $pdf->headers->get('Content-Disposition'));
        $xlsx = $this->get('/api/v1/order-assistant/'.$token.'/xlsx')->assertOk();
        $path = tempnam(sys_get_temp_dir(), 'oax').'.xlsx';
        file_put_contents($path, $xlsx->getContent());
        $text = (string) app(OrderFormAi::class)->text($path, 'xlsx');
        @unlink($path);
        foreach (['Sheet "Summary"', 'Sheet "Size breakdown"', 'Sheet "Orders"', 'Sheet "Designs"', 'Sheet "Check list"', 'Annie More – Turquoise', 'Georgina Manuel', 'Possible double'] as $want) {
            $this->assertStringContainsString($want, $text);
        }
        $zip = new \ZipArchive;
        $path = tempnam(sys_get_temp_dir(), 'oax');
        file_put_contents($path, $xlsx->getContent());
        $zip->open($path);
        $this->assertStringContainsString('<f>SUM(B5:C5)</f>', (string) $zip->getFromName('xl/worksheets/sheet1.xml'), 'totals are formulas');
        $this->assertStringContainsString('<autoFilter ref="A1:L11"/>', (string) $zip->getFromName('xl/worksheets/sheet3.xml'), 'the orders have filters');
        $this->assertNotFalse($zip->getFromName('xl/media/design1.jpeg'), 'the design picture is in the Designs tab');
        $zip->close();
        @unlink($path);
    }

    public function test_more_messages_add_to_the_same_order_and_only_its_owner_may_add(): void
    {
        $token = $this->post('/api/v1/order-assistant', ['files' => [$this->csv()]], ['Accept' => 'application/json'])->json('data.token');
        $this->post('/api/v1/order-assistant/'.$token, ['message' => 'Also 4 polos: 2 x M, 2 x L'], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.analysis.totals.garments', 18);
        // The same sheet again replaces its lines (no double count).
        $this->post('/api/v1/order-assistant/'.$token, ['files' => [$this->csv()]], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.analysis.totals.garments', 18);

        $owner = User::factory()->create();
        Sanctum::actingAs($owner);
        $this->post('/api/v1/order-assistant/'.$token, ['message' => 'thanks'], ['Accept' => 'application/json'])->assertOk();
        $this->assertSame($owner->id, OrderAssist::query()->where('token', $token)->value('user_id'));
        Sanctum::actingAs(User::factory()->create());
        $this->post('/api/v1/order-assistant/'.$token, ['message' => '2 x XL'], ['Accept' => 'application/json'])->assertForbidden();
        $this->getJson('/api/v1/order-assistant/'.str_repeat('a', 40))->assertNotFound();
    }

    public function test_an_empty_message_or_a_wrong_file_is_turned_down(): void
    {
        $this->postJson('/api/v1/order-assistant', [])->assertStatus(422);
        $this->post('/api/v1/order-assistant', ['files' => [UploadedFile::fake()->create('virus.exe', 10)]], ['Accept' => 'application/json'])->assertStatus(422);
    }
}
