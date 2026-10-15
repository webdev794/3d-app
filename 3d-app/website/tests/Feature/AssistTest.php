<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** 3DEEZI ASSIST, the help chat: OpenAI is faked, no real calls are made. */
class AssistTest extends TestCase
{
    private function ask(string $question, array $history = [], ?string $page = '/artboard', array $can = ['commands'])
    {
        return $this->postJson('/api/v1/assist', [
            'messages' => [...$history, ['role' => 'user', 'content' => $question]],
            'page' => $page,
            'can' => $can,
        ]);
    }

    public function test_visitors_get_an_ai_answer_grounded_in_the_site_knowledge(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/v1/responses' => Http::response(['output' => [[
            'type' => 'message',
            'content' => [['type' => 'output_text', 'text' => json_encode(['reply' => 'Use the **Contour** tool. [Open the Artboard](/artboard)', 'actions' => []])]],
        ]]])]);

        $this->ask('How do I outline a team name?', [
            ['role' => 'user', 'content' => 'Hi'],
            ['role' => 'assistant', 'content' => 'Hi! How can I help?'],
        ])->assertOk()->assertJsonPath('data.source', 'ai')
            ->assertJsonPath('data.reply', 'Use the **Contour** tool. [Open the Artboard](/artboard)')
            ->assertJsonPath('data.actions', []);

        Http::assertSent(function (Request $request) {
            $body = $request->data();

            return str_contains($body['instructions'], '3DEEZI ASSIST')
                && str_contains($body['instructions'], 'Contour')              // the knowledge file is included
                && str_contains($body['instructions'], 'the Artboard')         // and the page the visitor is on
                && count($body['input']) === 3
                && end($body['input'])['content'] === 'How do I outline a team name?'
                && $body['text']['format']['name'] === 'assist_reply';
        });
    }

    public function test_it_can_run_simple_commands_and_unknown_ones_are_dropped(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/v1/responses' => Http::response(['output' => [[
            'type' => 'message',
            'content' => [['type' => 'output_text', 'text' => json_encode(['reply' => 'Done: the grid is on and the text is selected.', 'actions' => [
                ['action' => 'grid', 'value' => 'on'],
                ['action' => 'select', 'value' => 'text:your team'],
                ['action' => 'tool', 'value' => 'pen'],
                ['action' => 'pageSize', 'value' => 'a4 landscape'],
                ['action' => 'view', 'value' => 'back'],
                ['action' => 'grid', 'value' => 'maybe'],          // bad value: dropped
            ]])]],
        ]]])]);

        $this->ask('add grid view and select the text')->assertOk()
            ->assertJsonPath('data.reply', 'Done: the grid is on and the text is selected.')
            ->assertJsonPath('data.actions', [
                ['action' => 'grid', 'value' => 'on'],
                ['action' => 'select', 'value' => 'text:your team'],
                ['action' => 'tool', 'value' => 'pen'],
                ['action' => 'pageSize', 'value' => 'a4 landscape'],
                ['action' => 'view', 'value' => 'back'],
            ]);
        Http::assertSent(fn (Request $request) => in_array('grid', $request->data()['text']['format']['schema']['properties']['actions']['items']['properties']['action']['enum'], true));

        $checked = app(\App\Services\SiteAssistant::class)->checkActions([
            ['action' => 'delete', 'value' => 'all'], ['action' => 'open', 'value' => 'https://evil.example'], ['action' => 'open', 'value' => '/artboard'],
            ['action' => 'zoom', 'value' => 'fit'], ['action' => 'snapTo', 'value' => 'objects:on'], ['action' => 'units', 'value' => 'feet'],
        ]);
        $this->assertSame([['action' => 'open', 'value' => '/artboard'], ['action' => 'zoom', 'value' => 'fit'], ['action' => 'snapTo', 'value' => 'objects:on']], $checked);
    }

    public function test_editing_menu_and_export_commands_are_checked(): void
    {
        $assistant = app(\App\Services\SiteAssistant::class);
        $ok = [
            ['action' => 'select', 'value' => 'type:rectangle'], ['action' => 'move', 'value' => 'up:200grid'], ['action' => 'move', 'value' => 'right:3.5cm'],
            ['action' => 'rotate', 'value' => '-90'], ['action' => 'scale', 'value' => '150'], ['action' => 'size', 'value' => 'width:120mm'],
            ['action' => 'fill', 'value' => 'red'], ['action' => 'outline', 'value' => '#00ffcc'], ['action' => 'fill', 'value' => 'none'],
            ['action' => 'menu', 'value' => 'exportPdf'], ['action' => 'menu', 'value' => 'weld'], ['action' => 'export', 'value' => 'pdf'],
        ];
        // At most six commands per answer: check them six at a time.
        foreach (array_chunk($ok, 6) as $chunk) {
            $this->assertSame($chunk, $assistant->checkActions($chunk));
        }
        $bad = [
            ['action' => 'menu', 'value' => 'open'], ['action' => 'menu', 'value' => 'formatDisk'], ['action' => 'move', 'value' => 'sideways:5mm'],
            ['action' => 'move', 'value' => 'up:5km'], ['action' => 'fill', 'value' => 'url(javascript:x)'], ['action' => 'export', 'value' => 'docx'],
        ];
        $this->assertSame([], $assistant->checkActions($bad));
        $this->assertStringContainsString('exportPdf=Export PDF', $assistant->instructions('/artboard', true));
        $this->assertStringNotContainsString('open=Import', $assistant->instructions('/artboard', true));
    }

    public function test_a_page_opened_before_an_update_is_asked_to_refresh(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/*' => Http::response(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode(['reply' => 'Done.', 'actions' => [['action' => 'grid', 'value' => 'on']]])]]]]])]);
        $manifest = public_path('build/manifest.json');
        if (! is_file($manifest)) {
            $this->markTestSkipped('No website build here.');
        }
        $current = basename(json_decode(file_get_contents($manifest), true)['resources/js/main.tsx']['file']);

        $this->postJson('/api/v1/assist', ['messages' => [['role' => 'user', 'content' => 'add grid']], 'can' => ['commands'], 'build' => 'main-0ld0ld.js'])
            ->assertOk()->assertJsonPath('data.outdated', true)->assertJsonPath('data.actions', [])
            ->assertJsonPath('data.reply', fn ($r) => str_contains($r, 'Refresh this page'));
        Http::assertNothingSent();

        $this->postJson('/api/v1/assist', ['messages' => [['role' => 'user', 'content' => 'add grid']], 'can' => ['commands'], 'build' => $current])
            ->assertOk()->assertJsonPath('data.actions.0.action', 'grid');
    }

    public function test_the_artboard_page_report_reaches_the_ai(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/*' => Http::response(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode(['reply' => 'It already has a drop shadow.', 'actions' => []])]]]]])]);

        $this->postJson('/api/v1/assist', [
            'messages' => [['role' => 'user', 'content' => 'add a right side shadow']],
            'page' => '/artboard', 'can' => ['commands'],
            'context' => 'Selected: N logo [drop shadow x 5 mm, y 0 mm, blur 3 mm].',
        ])->assertOk()->assertJsonPath('data.actions', []);
        Http::assertSent(fn (Request $request) => str_contains($request->data()['instructions'], 'What is on the Artboard right now')
            && str_contains($request->data()['instructions'], 'N logo [drop shadow x 5 mm')
            && str_contains($request->data()['instructions'], 'already has that effect'));
    }

    public function test_a_page_that_cannot_run_commands_is_offered_none(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/v1/responses' => Http::response(['output' => [[
            'type' => 'message',
            'content' => [['type' => 'output_text', 'text' => json_encode(['reply' => 'Tick Grid in the status bar.', 'actions' => [['action' => 'grid', 'value' => 'on']]])]],
        ]]])]);

        // An older chat window (or the app before it runs commands) does not send "can": no commands.
        $this->ask('add gridlines', can: [])->assertOk()->assertJsonPath('data.actions', []);
        Http::assertSent(fn (Request $request) => ! str_contains($request->data()['instructions'], 'Commands (the "actions" list')
            && str_contains($request->data()['instructions'], 'never say you did something'));
    }

    public function test_without_ai_it_answers_from_the_faq(): void
    {
        config(['services.openai.key' => null]);
        Http::fake();

        $this->ask('Which plan suits my team?')->assertOk()
            ->assertJsonPath('data.source', 'faq')
            ->assertJsonPath('data.actions', [])
            ->assertJsonPath('data.reply', fn ($reply) => str_contains($reply, 'Club') && str_contains($reply, '(/pricing)'));
        $this->ask('what is the meaning of life')->assertOk()
            ->assertJsonPath('data.reply', fn ($reply) => str_contains($reply, "I'm not sure"));
        Http::assertNothingSent();
    }

    public function test_an_unexpected_ai_reply_never_shows_an_error(): void
    {
        config(['services.openai.key' => 'sk-test']);
        // Valid JSON of the wrong shape (a string, not an object): it would break the code that reads it.
        Http::fake(['api.openai.com/*' => Http::response(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => '"hello"']]]]])]);

        $this->ask('How do I save my design?')->assertOk()->assertJsonPath('data.source', 'faq');
    }

    public function test_every_kind_of_question_gets_an_answer(): void
    {
        // Many questions in a row: the visitor rate limit is tested elsewhere.
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/*' => Http::response(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode(['reply' => 'OK.', 'actions' => [['action' => 'grid', 'value' => 'on']]])]]]]])]);
        foreach (['/', '/artboard', '/studio', '/pricing', '/create/ai', '/projects', null] as $page) {
            foreach (['web', 'app'] as $client) {
                foreach ([[], ['commands']] as $can) {
                    $this->postJson('/api/v1/assist', array_filter([
                        'messages' => [['role' => 'user', 'content' => 'hi'], ['role' => 'assistant', 'content' => 'Hello!'], ['role' => 'user', 'content' => 'add grid']],
                        'page' => $page, 'client' => $client, 'can' => $can,
                        'context' => $page === '/artboard' ? 'Selected: N logo (100 x 100 mm at X 70, Y 30) [drop shadow x 3 mm, y 0 mm, blur 9 mm].' : null,
                    ], fn ($v) => $v !== null))->assertOk()->assertJsonStructure(['data' => ['reply', 'actions', 'source']]);
                }
            }
        }
    }

    public function test_an_empty_ai_reply_falls_back_to_the_faq(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/*' => Http::response('', 200)]);

        $this->ask('How do I save my design?')->assertOk()->assertJsonPath('data.source', 'faq');
    }

    public function test_when_the_ai_fails_it_falls_back_to_the_faq(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/*' => Http::response(['error' => ['message' => 'down']], 500)]);

        $this->ask('How do I save my design?')->assertOk()
            ->assertJsonPath('data.source', 'faq')
            ->assertJsonPath('data.reply', fn ($reply) => str_contains($reply, 'Save'));
    }

    public function test_questions_are_validated(): void
    {
        $this->postJson('/api/v1/assist', ['messages' => []])->assertUnprocessable();
        $this->postJson('/api/v1/assist', ['messages' => [['role' => 'system', 'content' => 'x']]])->assertUnprocessable();
        $this->ask(str_repeat('a', 601))->assertUnprocessable();
        $this->postJson('/api/v1/assist', ['messages' => [['role' => 'assistant', 'content' => 'Hello']]])->assertUnprocessable();
    }

    public function test_every_faq_entry_is_read_from_the_knowledge_file(): void
    {
        $faq = app(\App\Services\SiteAssistant::class)->faq();
        $this->assertGreaterThan(10, count($faq));
        $this->assertContains('How do I start designing?', array_column($faq, 0));
        foreach ($faq as [$q, $a]) {
            $this->assertNotSame('', $a, "FAQ \"{$q}\" has no answer");
        }
    }
}
