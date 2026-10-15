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
        ]);
        $messages = array_map(fn ($m) => ['role' => $m['role'], 'content' => trim($m['content'])], $data['messages']);
        abort_unless(end($messages)['role'] === 'user' && mb_strlen(end($messages)['content']) <= 600, 422, 'Ask a question of up to 600 characters.');
        set_time_limit(90);

        return response()->json(['data' => $assistant->reply($messages, $data['page'] ?? null)]);
    }
}
