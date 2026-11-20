<?php

namespace Tests\Feature;

use App\Models\OrderAssist;
use App\Models\User;
use App\Services\OpenAiDesigner;
use App\Services\OrderAssistantAi;
use App\Services\OrderDesignForm;
use App\Services\OrderFormAi;
use App\Services\OrderFormMaker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Mockery;
use RuntimeException;
use Tests\TestCase;

/**
 * The order form maker (client 2026-11-13, the MANTIS example): five design pictures (front and back) and one prompt
 * ("these sizes for each garment") make a 265-piece Basketball singlet order of five named designs, 53 each, with the
 * design order form PDF; the customer corrects names and sizes in place; without 3DEEZI AI each picture is a design.
 * The paid call (OrderFormMaker::ask) is replaced by a canned answer.
 */
class OrderFormMakerTest extends TestCase
{
    use RefreshDatabase;

    public const PROMPT = 'make a order form using these sizes for each garment XS x 5 , S x 5 , M X 6 , L X 6 , XL X 8 , 2XL X 8 , 3 XL X 5 , 4XL X 5 . 5XL X 5';

    private const SIZES = ['XS' => 5, 'S' => 5, 'M' => 6, 'L' => 6, 'XL' => 8, '2XL' => 8, '3XL' => 5, '4XL' => 5, '5XL' => 5];

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $old = Mockery::mock(OrderAssistantAi::class);
        $old->shouldReceive('available')->andReturn(false);
        $this->app->instance(OrderAssistantAi::class, $old);
    }

    /** What 3DEEZI AI answers for the client's five MANTIS pictures and prompt. */
    public static function canned(): array
    {
        $sizes = array_map(fn ($s, $q) => ['size' => $s, 'qty' => $q], array_keys(self::SIZES), self::SIZES);
        $design = fn (int $picture, string $name, string $colourway, string $hex) => ['pictures' => [['picture' => $picture, 'view' => 'front_back']], 'name' => $name,
            'colourway' => $colourway, 'colour' => $hex, 'sizes' => $sizes, 'note' => ''];

        return ['brand' => 'MANTIS', 'garment' => 'Basketball singlet', 'garment_type' => 'singlet', 'sport' => 'basketball', 'title' => 'MANTIS Basketball Singlet', 'notes' => '', 'unclear' => [],
            'designs' => [$design(1, 'Tonga', 'Red', '#c8102e'), $design(2, 'Fiji', 'Sky Blue', '#6cace4'), $design(3, 'Samoa', 'Royal Blue', '#002b7f'),
                $design(4, 'Cook Islands', 'Black/Green', '#121212'), $design(5, 'Cook Islands', 'Green/Yellow', '#009a44')]];
    }

    private function maker(?array $answer = null, ?\Throwable $error = null): \Mockery\MockInterface
    {
        $maker = Mockery::mock(OrderFormMaker::class, [app(OpenAiDesigner::class)])->makePartial();
        $maker->shouldReceive('available')->andReturn(true);
        $ask = $maker->shouldReceive('ask');
        $error ? $ask->andThrow($error) : $ask->andReturn($answer ?? self::canned());
        $this->app->instance(OrderFormMaker::class, $maker);

        return $maker;
    }

    private function pictures(): array
    {
        return array_map(fn ($n) => UploadedFile::fake()->image($n.'.jpg', 620, 320), ['676', '679', '685', '682', '682 (2)']);
    }

    public function test_five_pictures_and_one_prompt_make_the_mantis_order_form(): void
    {
        $this->maker();
        Sanctum::actingAs(User::factory()->create());
        $data = $this->post('/api/v1/order-assistant', ['message' => self::PROMPT, 'designs' => $this->pictures()], ['Accept' => 'application/json'])->assertCreated()->json('data');

        $a = $data['analysis'];
        $this->assertSame(265, $a['totals']['garments']);
        $this->assertSame(['Tonga – Red', 'Fiji – Sky Blue', 'Samoa – Royal Blue', 'Cook Islands – Black/Green', 'Cook Islands – Green/Yellow'], array_column($a['groups'], 'design'));
        $this->assertSame([53, 53, 53, 53, 53], array_column($a['groups'], 'total'));
        $this->assertSame(self::SIZES, $a['groups'][0]['garments'][0]['sizes']['mens']);
        $this->assertSame('Basketball singlet', $a['groups'][0]['garments'][0]['product']);
        $this->assertSame('#c8102e', $a['groups'][0]['colour']);
        // Every picture is on its design: nothing to check.
        $this->assertSame([], $a['checks']);
        $this->assertSame(['676.jpg', '679.jpg', '685.jpg', '682.jpg', '682 (2).jpg'], array_column($a['groups'], 'image'));
        $form = $a['form'];
        $this->assertSame('MANTIS', $form['brand']);
        $this->assertTrue($form['same_sizes']);
        $this->assertSame(265, $form['total']);
        $this->assertSame([1, 2, 3, 4, 5], array_column($form['designs'], 'number'));
        $this->assertSame('MANTIS Basketball Singlet', $data['title']);
        $reply = end($data['messages'])['text'];
        $this->assertStringContainsString('5 designs', $reply);
        $this->assertStringContainsString('Grand total: 265', $reply);
        // The order form's rows (Edit order / Review & Approve) carry each design.
        $this->assertCount(5, $a['items']);
        $this->assertSame('Basketball singlet – Tonga – Red', $a['items'][0]['label']);

        // The design order form: 3 pages (two designs a page), named as the client's file; the Excel as before.
        $pdf = $this->get('/api/v1/order-assistant/'.$data['token'].'/pdf')->assertOk();
        $this->assertStringContainsString('MANTIS_Basketball_Singlet_Order_Form.pdf', $pdf->headers->get('Content-Disposition'));
        $bytes = $pdf->getContent();
        $this->assertSame(3, preg_match_all('#/Type /Page\b(?!s)#', $bytes));
        // A4 landscape, the two designs side by side (as the client's).
        $this->assertSame(3, substr_count($bytes, '/MediaBox [0 0 841.89 595.28]'));
        $xlsx = $this->get('/api/v1/order-assistant/'.$data['token'].'/xlsx')->assertOk();
        $path = tempnam(sys_get_temp_dir(), 'ofm').'.xlsx';
        file_put_contents($path, $xlsx->getContent());
        $text = (string) app(OrderFormAi::class)->text($path, 'xlsx');
        @unlink($path);
        foreach (['Tonga – Red', 'Cook Islands – Green/Yellow', '265'] as $want) {
            $this->assertStringContainsString($want, $text);
        }
    }

    public function test_the_customer_corrects_names_and_sizes_in_place(): void
    {
        $this->maker();
        $owner = User::factory()->create();
        Sanctum::actingAs($owner);
        $data = $this->post('/api/v1/order-assistant', ['message' => self::PROMPT, 'designs' => $this->pictures()], ['Accept' => 'application/json'])->json('data');
        $designs = $data['analysis']['form']['designs'];
        $edits = array_map(fn ($d) => ['key' => $d['key'], 'name' => $d['name'], 'colourway' => $d['colourway'], 'sizes' => $d['sizes']], $designs);
        $edits[1]['name'] = 'Viti';
        $edits[2]['sizes']['M'] = 10;
        $edits[2]['sizes']['XS'] = 0;
        unset($edits[4]);

        $after = $this->postJson('/api/v1/order-assistant/'.$data['token'].'/form', ['garment' => 'Basketball singlet', 'designs' => array_values($edits)])->assertOk()->json('data');
        $form = $after['analysis']['form'];
        $this->assertSame(['Tonga – Red', 'Viti – Sky Blue', 'Samoa – Royal Blue', 'Cook Islands – Black/Green'], array_column($form['designs'], 'label'));
        $this->assertSame(53 * 3 + 52, $form['total']);
        $this->assertStringStartsWith('Saved. Your order form', end($after['messages'])['text']);
        $this->assertSame($form['total'], $after['analysis']['totals']['garments']);
        $this->assertFalse($form['same_sizes']);
        $this->assertArrayNotHasKey('XS', $form['designs'][2]['sizes']);
        // The design taken off: its picture is listed to check.
        $this->assertSame(['682 (2).jpg'], $form['unplaced']);
        $this->assertStringContainsString('682 (2).jpg', implode(' ', array_column($after['analysis']['checks'], 'text')));
        $this->assertStringStartsWith('%PDF', $this->get('/api/v1/order-assistant/'.$data['token'].'/pdf')->assertOk()->getContent());

        // Another account may not change it; an order with no design form says so.
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/order-assistant/'.$data['token'].'/form', ['designs' => []])->assertForbidden();
        Sanctum::actingAs($owner);
        $plain = $this->postJson('/api/v1/order-assistant', ['message' => 'Football: 3 x M'])->json('data.token');
        $this->postJson('/api/v1/order-assistant/'.$plain.'/form', ['designs' => []])->assertStatus(422);
    }

    public function test_a_follow_up_message_goes_to_the_ai_with_the_form_so_far(): void
    {
        $changed = self::canned();
        $changed['designs'][2]['sizes'] = [['size' => 'M', 'qty' => 12]];
        $maker = Mockery::mock(OrderFormMaker::class, [app(OpenAiDesigner::class)])->makePartial();
        $maker->shouldReceive('available')->andReturn(true);
        $maker->shouldReceive('ask')->once()->ordered()->withArgs(fn ($prompt, $pictures, $before) => $prompt === self::PROMPT && $before === null)->andReturn(self::canned());
        $maker->shouldReceive('ask')->once()->ordered()->withArgs(fn ($prompt, $pictures, $before) => str_contains($prompt, 'Earlier messages') && str_contains($prompt, 'Samoa only 12 M')
            && count($pictures) === 5 && ($before['designs'][2]['name'] ?? '') === 'Samoa')->andReturn($changed);
        $this->app->instance(OrderFormMaker::class, $maker);
        Sanctum::actingAs(User::factory()->create());
        $token = $this->post('/api/v1/order-assistant', ['message' => self::PROMPT, 'designs' => $this->pictures()], ['Accept' => 'application/json'])->json('data.token');

        $data = $this->postJson('/api/v1/order-assistant/'.$token, ['message' => 'Samoa only 12 M'])->assertOk()->json('data');
        $this->assertSame(53 * 4 + 12, $data['analysis']['totals']['garments']);
        $this->assertSame(['M' => 12], $data['analysis']['form']['designs'][2]['sizes']);
        $this->assertStringStartsWith('I’ve updated your order form', end($data['messages'])['text']);
    }

    public function test_without_the_ai_each_picture_is_a_design_with_the_prompts_sizes(): void
    {
        // A visitor: no paid call, the sizes for each design from the prompt, and a word about signing in.
        $maker = Mockery::mock(OrderFormMaker::class, [app(OpenAiDesigner::class)])->makePartial();
        $maker->shouldNotReceive('ask');
        $this->app->instance(OrderFormMaker::class, $maker);
        $data = $this->post('/api/v1/order-assistant', ['message' => self::PROMPT.' basketball singlets', 'designs' => $this->pictures()], ['Accept' => 'application/json'])->assertCreated()->json('data');
        $form = $data['analysis']['form'];
        $this->assertSame(['676', '679', '685', '682', '682 (2)'], array_column($form['designs'], 'name'));
        $this->assertSame(265, $form['total']);
        $this->assertSame('singlet', $form['garment_id']);
        $this->assertSame('basketball', $form['sport']);
        $this->assertStringContainsString('Sign in so 3DEEZI AI can read the names', $data['messages'][1]['text']);
        $this->assertSame('sign_in', $data['analysis']['sources'][1]['how']);

        // Sizes corrected by hand stay when a later message gives no sizes; a message with sizes applies them.
        $designs = array_map(fn ($d) => ['key' => $d['key'], 'name' => $d['name'], 'colourway' => $d['colourway'], 'sizes' => $d['sizes']], $form['designs']);
        $designs[0]['sizes'] = ['M' => 2];
        $this->postJson('/api/v1/order-assistant/'.$data['token'].'/form', ['designs' => $designs])->assertOk();
        $later = $this->postJson('/api/v1/order-assistant/'.$data['token'], ['message' => 'thanks, looks good'])->assertOk()->json('data.analysis.form');
        $this->assertSame(['M' => 2], $later['designs'][0]['sizes']);
        $this->assertSame(53, $later['designs'][1]['total']);
        $again = $this->postJson('/api/v1/order-assistant/'.$data['token'], ['message' => 'make it S x 1, M x 1 for each'])->assertOk()->json('data.analysis.form');
        $this->assertSame(10, $again['total']);
    }

    public function test_with_the_ai_turned_off_the_mantis_prompt_is_53_per_design(): void
    {
        // No OpenAI key (as in tests): the order form's own size reading (OrderFormReader) applies the sizes to each picture.
        Sanctum::actingAs(User::factory()->create());
        $data = $this->post('/api/v1/order-assistant', ['message' => self::PROMPT, 'designs' => $this->pictures()], ['Accept' => 'application/json'])->assertCreated()->json('data');
        $form = $data['analysis']['form'];
        $this->assertSame([53, 53, 53, 53, 53], array_column($form['designs'], 'total'));
        $this->assertSame(self::SIZES, $form['designs'][4]['sizes']);
        $this->assertSame(265, $data['analysis']['totals']['garments']);
        $this->assertStringContainsString('3DEEZI AI is not available right now', $data['messages'][1]['text']);
    }

    public function test_an_ai_error_still_makes_the_form(): void
    {
        $this->maker(error: new RuntimeException('The AI service sent an unexpected reply.'));
        Sanctum::actingAs(User::factory()->create());
        $data = $this->post('/api/v1/order-assistant', ['message' => self::PROMPT, 'designs' => $this->pictures()], ['Accept' => 'application/json'])->assertCreated()->json('data');
        $this->assertSame(265, $data['analysis']['totals']['garments']);
        $this->assertStringContainsString('could not read your pictures just now', $data['messages'][1]['text']);
    }

    public function test_an_order_sheet_with_pictures_is_read_as_before(): void
    {
        $maker = Mockery::mock(OrderFormMaker::class, [app(OpenAiDesigner::class)])->makePartial();
        $maker->shouldNotReceive('make');
        $this->app->instance(OrderFormMaker::class, $maker);
        $data = $this->post('/api/v1/order-assistant', ['files' => [UploadedFile::fake()->createWithContent('team.csv', "Name,Garment,Size\nAna,Polo,M\nBen,Polo,L\n")],
            'designs' => [UploadedFile::fake()->image('Polo.png', 100, 100)]], ['Accept' => 'application/json'])->assertCreated()->json('data');
        $this->assertSame(2, $data['analysis']['totals']['garments']);
        $this->assertArrayNotHasKey('form', $data['analysis']);
    }

    public function test_the_sizes_in_the_prompt_and_the_form_rules(): void
    {
        $this->assertSame(self::SIZES, OrderDesignForm::sizesInText(self::PROMPT));
        $this->assertSame(['S' => 4, 'M' => 6, '2XL' => 1], OrderDesignForm::sizesInText('4 x S, 6 x M and 1 x XXL'));
        // The order form's own size reading (OrderFormReader) in every wording; "3 XL X 5" is 3XL, "3 XL, 2 L" is 3 of XL.
        $this->assertSame(['XS' => 3, 'S' => 5, 'M' => 6], OrderDesignForm::sizesInText('XS-3, S: 5, 6 M'));
        $this->assertSame(['L' => 2, 'XL' => 3], OrderDesignForm::sizesInText('3 XL, 2 L'));
        $this->assertSame([], OrderDesignForm::sizesInText('thanks, looks good'));
        // Two designs with the same name and colourway stay two; a picture the AI left out is kept to place.
        $out = self::canned();
        $out['designs'][1]['name'] = 'Tonga';
        $out['designs'][1]['colourway'] = 'Red';
        $out['designs'] = array_slice($out['designs'], 0, 2);
        $form = OrderDesignForm::fromAi($out, ['a.jpg', 'b.jpg', 'c.jpg']);
        $this->assertSame(['Tonga – Red', 'Tonga – Red (2)'], array_column($form['designs'], 'label'));
        $this->assertSame(['c.jpg'], $form['unplaced']);
        $this->assertSame(2, OrderDesignForm::analysis($form)['totals']['groups']);
        $this->assertSame('MANTIS Basketball Singlet', OrderDesignForm::title(['title' => 'MANTIS Basketball Singlet Order Form'] + $form));
    }
}
