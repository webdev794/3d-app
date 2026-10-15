<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** 3DEEZI ASSIST, the help chat: OpenAI is faked, no real calls are made. */
class AssistTest extends TestCase
{
    private function ask(string $question, array $history = [], ?string $page = '/artboard')
    {
        return $this->postJson('/api/v1/assist', [
            'messages' => [...$history, ['role' => 'user', 'content' => $question]],
            'page' => $page,
        ]);
    }

    public function test_visitors_get_an_ai_answer_grounded_in_the_site_knowledge(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/v1/responses' => Http::response(['output' => [[
            'type' => 'message',
            'content' => [['type' => 'output_text', 'text' => 'Use the **Contour** tool. [Open the Artboard](/artboard)']],
        ]]])]);

        $this->ask('How do I outline a team name?', [
            ['role' => 'user', 'content' => 'Hi'],
            ['role' => 'assistant', 'content' => 'Hi! How can I help?'],
        ])->assertOk()->assertJsonPath('data.source', 'ai')
            ->assertJsonPath('data.reply', 'Use the **Contour** tool. [Open the Artboard](/artboard)');

        Http::assertSent(function (Request $request) {
            $body = $request->data();

            return str_contains($body['instructions'], '3DEEZI ASSIST')
                && str_contains($body['instructions'], 'Contour')              // the knowledge file is included
                && str_contains($body['instructions'], 'the Artboard')         // and the page the visitor is on
                && count($body['input']) === 3
                && end($body['input'])['content'] === 'How do I outline a team name?';
        });
    }

    public function test_without_ai_it_answers_from_the_faq(): void
    {
        config(['services.openai.key' => null]);
        Http::fake();

        $this->ask('Which plan suits my team?')->assertOk()
            ->assertJsonPath('data.source', 'faq')
            ->assertJsonPath('data.reply', fn ($reply) => str_contains($reply, 'Club') && str_contains($reply, '(/pricing)'));
        $this->ask('what is the meaning of life')->assertOk()
            ->assertJsonPath('data.reply', fn ($reply) => str_contains($reply, "I'm not sure"));
        Http::assertNothingSent();
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
