<?php

namespace Tests\Feature;

use App\Events\OrderSubmitted;
use App\Models\Order;
use App\Models\OrderFile;
use App\Models\User;
use App\Services\OrderFormAi;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\OrderFormSample;
use Tests\TestCase;

/**
 * Upload Your Order, read by 3DEEZI AI (client 2026-10-22: "our AI should analyse the form and create a final form for
 * review"): a club form shaped like Te Arawa's becomes Jersey rows with youth sizes in Kids, the players and the date
 * words; the result is kept on the file and never asked for twice; a failing or missing AI keeps the built-in reading,
 * which now reads such a form too; and the order goes through without the customer typing sizes. No real OpenAI calls.
 */
class OrderFormAiTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Event::fake([OrderSubmitted::class]);
        Mail::fake();
        Notification::fake();
        config(['services.openai.key' => 'test-key', 'services.openai.text_model' => 'gpt-6-luna']);
        $this->customer = User::factory()->create(['name' => 'Fabian Soutar']);
        Sanctum::actingAs($this->customer);
    }

    private function sample(?array $rows = null, string $name = 'Te Arawa U13 Mantis Order Form V3.xlsx'): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'frm').'.xlsx';
        OrderFormSample::xlsx($path, $rows);

        return new UploadedFile($path, $name, null, null, true);
    }

    /** An upload draft with the sample form; returns [draft id, file id]. */
    private function draftWithForm(?UploadedFile $file = null): array
    {
        $id = $this->postJson('/api/v1/order-drafts', ['kind' => 'upload', 'data' => ['team_name' => 'Te Arawa', 'contact_name' => 'Fabian', 'contact_email' => 'fab@example.test']])
            ->assertCreated()->json('data.id');
        $file = $this->post("/api/v1/order-drafts/{$id}/files", ['kind' => 'order_form', 'file' => $file ?? $this->sample()], ['Accept' => 'application/json'])
            ->assertCreated()->json('data.id');

        return [$id, $file];
    }

    private function fakeAi(array $answer): void
    {
        Http::fake(['api.openai.com/v1/responses' => Http::response(OrderFormSample::response($answer))]);
    }

    public function test_the_ai_reads_a_club_form_into_jersey_rows_youth_sizes_and_players_once(): void
    {
        $this->fakeAi(OrderFormSample::aiAnswer());
        [$draft, $file] = $this->draftWithForm();
        Http::assertNothingSent();   // uploading never calls the AI: Review does

        $read = $this->postJson("/api/v1/order-drafts/{$draft}/read")->assertOk()
            ->assertJsonPath('data.suggested.0.file_id', $file)
            ->assertJsonPath('data.suggested.0.source', 'ai')
            ->assertJsonPath('data.suggested.0.file_name', 'Te Arawa U13 Mantis Order Form V3.xlsx')
            ->assertJsonPath('data.suggested.0.items.0.garment', 'jersey')
            ->assertJsonPath('data.suggested.0.items.0.sport', 'rugby-league')
            ->assertJsonPath('data.suggested.0.items.0.name', 'Rugby League Jersey')
            ->assertJsonPath('data.suggested.0.players', 13)
            ->assertJsonPath('data.suggested.0.form.team_name', 'RIVERBEND RUGBY LEAGUE U13')
            ->assertJsonPath('data.suggested.0.form.needed_by', '')
            ->assertJsonPath('data.suggested.0.form.needed_by_text', 'ASAP')
            ->json('data.suggested.0');

        // Youth sizes go in Kids; the sizes as written stay beside the row; quantities add up to the players with a size.
        $this->assertSame(['XS' => 1, 'Kids' => 11], $read['items'][0]['sizes']);
        $this->assertSame(['10Y' => 3, '12Y' => 4, '14Y' => 3, '16Y' => 1], $read['details'][0]['form_sizes']);
        $this->assertSame(12, array_sum($read['items'][0]['sizes']));
        $players = $read['items'][0]['players'];
        $this->assertCount(13, $players);
        $this->assertSame(['name' => 'WALKER', 'number' => '1', 'size' => 'Kids'], $players[0]);
        $this->assertSame(['name' => 'FERRIS', 'number' => '8', 'size' => 'XS'], $players[7]);
        $this->assertNull($players[3]['size']);   // PARKER has no size on the form
        $this->assertSame('12Y', $read['details'][0]['player_sizes'][1]);
        $this->assertSame(12, count(array_filter(array_column($players, 'size'))));
        // Only the line it really could not place is listed.
        $this->assertContains('Jersey: PARKER 4 (size missing)', $read['unknown']);
        $this->assertNotContains('Date required ASAP', $read['unknown']);

        Http::assertSent(function (Request $request) {
            $text = $request['input'][0]['content'][0]['text'] ?? '';

            return $request['model'] === 'gpt-6-luna' && $request['text']['format']['type'] === 'json_schema' && $request['text']['format']['strict'] === true
                && str_contains($text, 'R2: CLUB / TEAM | RIVERBEND RUGBY LEAGUE U13 |  | 10Y | WALKER | 1')
                && str_contains($text, 'R5:  |  |  |  | PARKER | 4');
        });

        // Kept on the file: the review, the draft and a second Review cost nothing more.
        $this->postJson("/api/v1/order-drafts/{$draft}/read")->assertOk()->assertJsonPath('data.suggested.0.source', 'ai');
        $this->getJson("/api/v1/order-drafts/{$draft}")->assertOk()->assertJsonPath('data.suggested.0.source', 'ai');
        Http::assertSentCount(1);
        $meta = OrderFile::find($file)->meta;
        $this->assertSame('done', $meta['ai']['status']);
        $this->assertSame('reader', $meta['reader']['source']);   // the built-in reading is kept for staff
    }

    public function test_the_checked_rows_place_the_order_without_typing_sizes_and_staff_see_the_ai_reading(): void
    {
        $this->fakeAi(OrderFormSample::aiAnswer());
        [$draft, $file] = $this->draftWithForm();
        $read = $this->postJson("/api/v1/order-drafts/{$draft}/read")->assertOk()->json('data.suggested.0');

        // What the review sends: the rows as read (with their names), the date and delivery from section 1.
        $order = $this->postJson("/api/v1/order-drafts/{$draft}/submit", [
            'items' => $read['items'], 'phone' => '0411 111 111', 'needed_by' => now()->addDays(30)->toDateString(), 'delivery' => 'pickup',
        ], ['Idempotency-Key' => 'ai-read-0001'])->assertCreated()->json('data');
        $placed = Order::find($order['id']);
        $this->assertSame(['XS' => 1, 'Kids' => 11], $placed->sizes);
        $this->assertSame(12, $placed->quantity);
        $this->assertCount(13, $placed->items[0]['players']);
        $this->assertSame('upload', $placed->source);

        // Staff: the order's form file carries the AI reading (garments, sizes as written, players).
        $admin = User::factory()->create();
        $admin->is_admin = true;
        $admin->save();
        Sanctum::actingAs($admin);
        $files = $this->getJson("/api/v1/admin/orders/{$order['id']}")->assertOk()->json('data.files');
        $form = collect($files)->firstWhere('id', $file);
        $this->assertSame('ai', $form['meta']['suggested']['source']);
        $this->assertSame(['10Y' => 3, '12Y' => 4, '14Y' => 3, '16Y' => 1], $form['meta']['suggested']['details'][0]['form_sizes']);
        $this->assertStringContainsString('/order-files/', $form['download']);
    }

    public function test_when_the_ai_fails_the_built_in_reading_stays_and_now_reads_the_club_form(): void
    {
        Http::fake(['api.openai.com/v1/responses' => Http::response(['error' => ['message' => 'Server busy']], 500)]);
        [$draft, $file] = $this->draftWithForm();
        $read = $this->postJson("/api/v1/order-drafts/{$draft}/read")->assertOk()
            ->assertJsonPath('data.suggested.0.source', 'reader')
            ->assertJsonPath('data.suggested.0.items.0.garment', 'jersey')
            ->json('data.suggested.0');
        $this->assertSame(['XS' => 1, 'Kids' => 11], $read['items'][0]['sizes']);
        $this->assertCount(13, $read['items'][0]['players']);
        $this->assertSame(['PARKER 4 (no size)'], $read['unknown']);
        $this->assertSame('failed', OrderFile::find($file)->meta['ai']['status']);

        // Not asked again at once (another Review within 10 minutes).
        $this->postJson("/api/v1/order-drafts/{$draft}/read")->assertOk();
        Http::assertSentCount(1);
        // A later Review tries once more.
        $this->travel(11)->minutes();
        $this->postJson("/api/v1/order-drafts/{$draft}/read")->assertOk();
        Http::assertSentCount(2);
    }

    public function test_an_unusable_answer_or_no_ai_key_keeps_the_built_in_reading(): void
    {
        // Strict JSON that has no garment with a quantity: unusable.
        $this->fakeAi(OrderFormSample::aiAnswer(['garments' => [['garment' => 'jersey', 'sport' => '', 'fit' => '', 'label' => '', 'quantities' => [], 'players' => []]]]));
        [$draft] = $this->draftWithForm();
        $this->postJson("/api/v1/order-drafts/{$draft}/read")->assertOk()->assertJsonPath('data.suggested.0.source', 'reader');

        config(['services.openai.key' => null]);
        Http::fake();
        [$other] = $this->draftWithForm();
        $this->postJson("/api/v1/order-drafts/{$other}/read")->assertOk()->assertJsonPath('data.suggested.0.source', 'reader');
        Http::assertNothingSent();
    }

    public function test_the_answer_is_checked_before_it_is_used(): void
    {
        $reader = app(OrderFormAi::class);
        $date = now()->addDays(20)->toDateString();
        $out = $reader->checked(OrderFormSample::aiAnswer([
            'date_required' => $date, 'phone' => '0400 123 456', 'contact_email' => 'not an email',
            'delivery' => ['method' => 'deliver', 'street' => '1 Club Rd', 'suburb' => 'Rotorua', 'state' => '', 'postcode' => '3010', 'country' => 'New Zealand'],
            'garments' => [
                ['garment' => 'shorts', 'sport' => 'not-a-sport', 'fit' => 'youth', 'label' => '', 'players' => [],
                    'quantities' => [['form_size' => 'Y12', 'size' => '', 'quantity' => 5], ['form_size' => 'XXL', 'size' => '', 'quantity' => 2], ['form_size' => '?', 'size' => '', 'quantity' => 3],
                        ['form_size' => 'M', 'size' => 'M', 'quantity' => 0], ['form_size' => 'L', 'size' => 'L', 'quantity' => -4]]],
                ['garment' => 'cape', 'sport' => '', 'fit' => '', 'label' => 'Supporter scarf', 'players' => [], 'quantities' => [['form_size' => 'One size', 'size' => 'M', 'quantity' => 4]]],
                ['garment' => 'socks', 'sport' => '', 'fit' => '', 'label' => '', 'players' => [], 'quantities' => []],
                ['garment' => 'jersey', 'sport' => '', 'fit' => '', 'label' => '', 'quantities' => [],
                    'players' => [['name' => 'A', 'number' => '1234', 'form_size' => 'M', 'size' => ''], ['name' => 'B', 'number' => '7', 'form_size' => '10', 'size' => 'Kids']]],
            ],
            'unmapped' => ['Socks: sizes not given'],
        ]), 'form.xlsx');

        $this->assertCount(3, $out['items']);
        [$shorts, $other, $jersey] = $out['items'];
        $this->assertSame(['2XL' => 2, 'Kids' => 5], $shorts['sizes']);
        $this->assertArrayNotHasKey('sport', $shorts);
        $this->assertSame('youth', $shorts['fit']);
        $this->assertSame(['garment' => 'other', 'label' => 'Supporter scarf', 'sizes' => ['M' => 4], 'name' => 'Supporter scarf'], $other);
        $this->assertSame(['M' => 1, 'Kids' => 1], $jersey['sizes']);   // counted from the players
        $this->assertSame([['name' => 'A', 'number' => '', 'size' => 'M'], ['name' => 'B', 'number' => '7', 'size' => 'Kids']], $jersey['players']);
        $this->assertContains('Shorts: ? × 3', $out['unknown']);
        $this->assertContains('A number 1234', $out['unknown']);
        $this->assertContains('Socks: sizes not given', $out['unknown']);
        $this->assertSame($date, $out['form']['needed_by']);
        $this->assertSame('', $out['form']['contact_email']);
        $this->assertSame('0400 123 456', $out['form']['phone']);
        $this->assertSame('deliver', $out['form']['delivery']);
        $this->assertSame('1 Club Rd', $out['form']['address']['street']);

        // A past date or a non-date is not a date required.
        $this->assertSame('', $reader->checked(OrderFormSample::aiAnswer(['date_required' => '2020-01-01']), 'f')['form']['needed_by']);
        $this->assertSame('', $reader->checked(OrderFormSample::aiAnswer(['date_required' => '2026-02-31']), 'f')['form']['needed_by']);
        $this->assertNull($reader->checked('nonsense', 'f'));
    }

    public function test_a_totals_table_read_as_nameless_players_is_left_out_and_listed(): void
    {
        // Real call 2 (2026-10-22): the size totals table beside the players came back as five players without names,
        // and the quantities counted them too (18 instead of 13).
        $players = array_map(fn ($p) => ['name' => $p[1], 'number' => (string) $p[2], 'form_size' => $p[0] ?: '14Y', 'size' => $p[0] === 'XS' ? 'XS' : 'Kids'], OrderFormSample::PLAYERS);
        foreach (OrderFormSample::TOTALS as $size => $n) {
            $players[] = ['name' => '', 'number' => (string) $n, 'form_size' => $size, 'size' => $size === 'XS' ? 'XS' : 'Kids'];
        }
        $answer = OrderFormSample::aiAnswer(['garments' => [[
            'garment' => 'jersey', 'sport' => 'rugby-league', 'fit' => '', 'label' => '', 'players' => $players,
            'quantities' => [['form_size' => '10Y', 'size' => 'Kids', 'quantity' => 4], ['form_size' => '12Y', 'size' => 'Kids', 'quantity' => 5], ['form_size' => '14Y', 'size' => 'Kids', 'quantity' => 5],
                ['form_size' => '16Y', 'size' => 'Kids', 'quantity' => 2], ['form_size' => 'XS', 'size' => 'XS', 'quantity' => 2]],
        ]], 'unmapped' => []]);
        $out = app(OrderFormAi::class)->checked($answer, 'form.xlsx');
        $jersey = $out['items'][0];
        $this->assertCount(13, $jersey['players']);
        $this->assertSame(['XS' => 1, 'Kids' => 12], $jersey['sizes']);   // counted again from the named players
        $this->assertCount(13, $out['details'][0]['player_sizes']);
        $this->assertContains('Jersey: 5 lines with a size and a number but no name were not taken as players (a size totals table?): 10Y 3 · 12Y 4 · 14Y 3 · 16Y 1 · XS 1', $out['unknown']);

        // Quantities that differ from the players (here spares) stay, with a line to check.
        $spares = OrderFormSample::aiAnswer();
        $spares['garments'][0]['quantities'][] = ['form_size' => 'M', 'size' => 'M', 'quantity' => 2];
        $out = app(OrderFormAi::class)->checked($spares, 'form.xlsx');
        $this->assertSame(['XS' => 1, 'M' => 2, 'Kids' => 11], $out['items'][0]['sizes']);
        $this->assertContains('Jersey: the sizes add up to 14, the players list has 12 with a size', $out['unknown']);
    }

    public function test_the_sheet_cells_have_the_last_word_on_each_players_size(): void
    {
        // Real call 3 (2026-10-22): PARKER, who has no size on the form, got the 16Y of the totals table in his row,
        // and the model then noted a 16Y difference that this caused.
        $answer = OrderFormSample::aiAnswer(['unmapped' => ['Size totals on the form: 16Y 1, the players list has 2', 'Size totals on the form: 14Y 4, the players list has 3']]);
        $answer['garments'][0]['players'][3] = ['name' => 'PARKER', 'number' => '4', 'form_size' => '16Y', 'size' => 'Kids'];
        $answer['garments'][0]['quantities'][3]['quantity'] = 2;   // 16Y counted twice
        $reader = app(OrderFormAi::class);
        $path = tempnam(sys_get_temp_dir(), 'frm').'.xlsx';
        OrderFormSample::xlsx($path);
        $checked = $reader->checked($answer, 'form.xlsx');
        $this->assertSame(['XS' => 1, 'Kids' => 12], $checked['items'][0]['sizes']);

        $out = $reader->againstSheet($checked, $reader->text($path, 'xlsx'));
        $this->assertSame(['XS' => 1, 'Kids' => 11], $out['items'][0]['sizes']);
        $this->assertSame(['10Y' => 3, '12Y' => 4, '14Y' => 3, '16Y' => 1], $out['details'][0]['form_sizes']);
        $this->assertNull($out['items'][0]['players'][3]['size']);
        $this->assertSame('', $out['details'][0]['player_sizes'][3]);
        $this->assertContains('Jersey: PARKER 4 (size missing)', $out['unknown']);
        $this->assertNotContains('Size totals on the form: 16Y 1, the players list has 2', $out['unknown']);   // explained: dropped
        $this->assertContains('Size totals on the form: 14Y 4, the players list has 3', $out['unknown']);      // a real difference: kept
        // A reading that agrees with the sheet is left as it is.
        $this->assertSame($reader->checked(OrderFormSample::aiAnswer(), 'f')['items'], $reader->againstSheet($reader->checked(OrderFormSample::aiAnswer(), 'f'), $reader->text($path, 'xlsx'))['items']);
        @unlink($path);
    }

    public function test_sizes_as_written_map_to_the_site_columns(): void
    {
        foreach (['10Y' => 'Kids', '16 yrs' => 'Kids', 'Y12' => 'Kids', 'YS' => 'Kids', 'Youth M' => 'Kids', 'kids' => 'Kids', 'XS' => 'XS', 'small' => 'S', 'Med' => 'M',
            'XXL' => '2XL', 'xxxl' => '3XL', '4XL' => '4XL', 'Mens L' => 'L', '10' => null, 'One size' => null, '' => null] as $written => $site) {
            $this->assertSame($site, OrderFormAi::siteSize((string) $written), "size {$written}");
        }
    }

    public function test_photos_and_pdfs_are_sent_to_the_model_and_documents_as_text(): void
    {
        $reader = app(OrderFormAi::class);
        $dir = sys_get_temp_dir();
        $pdf = $dir.'/form-test.pdf';
        file_put_contents($pdf, "%PDF-1.4\n%fake\n");
        $parts = $reader->input($pdf, 'pdf', 'form.pdf');
        $this->assertSame('input_file', $parts[1]['type']);
        $this->assertStringStartsWith('data:application/pdf;base64,', $parts[1]['file_data']);

        $png = $dir.'/form-test.png';
        imagepng(imagecreatetruecolor(40, 30), $png);
        $parts = $reader->input($png, 'png', 'photo.png');
        $this->assertSame('input_image', $parts[1]['type']);
        $this->assertStringStartsWith('data:image/png;base64,', $parts[1]['image_url']);

        $csv = $dir.'/form-test.csv';
        file_put_contents($csv, "Size,Name,No\n10Y,WALKER,1\n");
        $this->assertStringContainsString('10Y,WALKER,1', $reader->input($csv, 'csv', 'f.csv')[0]['text']);

        $docx = $dir.'/form-test.docx';
        $zip = new \ZipArchive;
        $zip->open($docx, \ZipArchive::CREATE | \ZipArchive::OVERWRITE);
        $zip->addFromString('word/document.xml', '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Team: Lions</w:t></w:r></w:p>'
            .'<w:tbl><w:tr><w:tc><w:p><w:r><w:t>12Y</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>SMITH</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');
        $zip->close();
        $text = $reader->text($docx, 'docx');
        $this->assertStringContainsString('Team: Lions', $text);
        $this->assertStringContainsString('12Y', $text);
        $this->assertStringContainsString('SMITH', $text);

        // HEIC photos and unknown files can't be sent: the built-in reading stays.
        $this->assertNull($reader->input($csv, 'heic', 'photo.heic'));
        foreach ([$pdf, $png, $csv, $docx] as $f) {
            @unlink($f);
        }
    }

    public function test_another_customer_cannot_read_the_draft(): void
    {
        $this->fakeAi(OrderFormSample::aiAnswer());
        [$draft] = $this->draftWithForm();
        Sanctum::actingAs(User::factory()->create());
        $this->postJson("/api/v1/order-drafts/{$draft}/read")->assertNotFound();
        Http::assertNothingSent();
    }
}
