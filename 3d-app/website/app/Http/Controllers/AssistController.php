<?php

namespace App\Http\Controllers;

use App\Services\SiteAssistant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** 3DEEZI ASSIST: the help chat shown on every page (signed in or not). */
class AssistController extends Controller
{
    public function chat(Request $request, SiteAssistant $assistant): JsonResponse
    {
        $data = $request->validate([
            'messages' => ['required', 'array', 'min:1', 'max:30'],
            'messages.*.role' => ['required', 'string', 'in:user,assistant'],
            'messages.*.content' => ['required', 'string', 'max:1500'],
            'page' => ['sometimes', 'nullable', 'string', 'max:200'],
            // What the chat window can do: "commands" when it runs the assistant's commands.
            'can' => ['sometimes', 'array', 'max:10'],
            'can.*' => ['string', 'max:40'],
            // Asked from the website (default) or the 3DEEZI phone app.
            'client' => ['sometimes', 'string', 'in:web,app'],
            // The website's script file the page is running (main-<hash>.js), to spot pages opened before an update.
            'build' => ['sometimes', 'nullable', 'string', 'max:120'],
            // On the Artboard: what is on the page and selected (with their effects), from the page itself.
            'context' => ['sometimes', 'nullable', 'string', 'max:3000'],
        ]);
        $messages = array_map(fn ($m) => ['role' => $m['role'], 'content' => trim($m['content'])], $data['messages']);
        abort_unless(end($messages)['role'] === 'user' && mb_strlen(end($messages)['content']) <= 600, 422, 'Ask a question of up to 600 characters.');
        set_time_limit(90);

        $commands = in_array('commands', $data['can'] ?? [], true);
        // A page opened before the website was updated runs old code: ask for a refresh rather than answer from it.
        $current = $this->currentBuild();
        if ($current && filled($data['build'] ?? null) && basename($data['build']) !== $current) {
            return response()->json(['data' => [
                'reply' => '3DEEZI has just been updated. Refresh this page (Ctrl+F5) and ask again, so I can use the newest tools.',
                'actions' => [], 'source' => 'update', 'outdated' => true,
            ]]);
        }

        return response()->json(['data' => $assistant->reply($messages, $data['page'] ?? null, $commands, ($data['client'] ?? 'web') === 'app', $data['context'] ?? null)]);
    }

    /** The website's current script file (from the Vite manifest), or null without a build. */
    private function currentBuild(): ?string
    {
        $manifest = public_path('build/manifest.json');
        $file = is_file($manifest) ? (json_decode((string) file_get_contents($manifest), true)['resources/js/main.tsx']['file'] ?? null) : null;

        return $file ? basename($file) : null;
    }
}
