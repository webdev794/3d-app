<?php

namespace App\Http\Controllers;

use App\Mail\SupportMessageReceived;
use App\Models\SupportMessage;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/** The contact form on the Support page (/support): open to visitors; a signed-in visitor's account is noted. */
class SupportMessageController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190'],
            'order_reference' => ['nullable', 'string', 'max:60'],
            'message' => ['required', 'string', 'min:10', 'max:5000'],
        ], [
            'message.min' => 'Please tell us a little more (at least 10 characters).',
        ]);
        if (! SupportMessage::ready()) {
            Log::error('Support form: the support_messages table is missing. Run php artisan migrate --force.');
            abort(503, 'The contact form is being updated. Please try again later, or ask 3DEEZI ASSIST.');
        }
        $message = SupportMessage::create([
            ...$data,
            'order_reference' => filled($data['order_reference'] ?? null) ? trim($data['order_reference']) : null,
            'user_id' => $request->user('sanctum')?->id,
        ]);

        // The team's address (SUPPORT_EMAIL), or every administrator when it is not set.
        $to = filled(config('services.support.email'))
            ? [config('services.support.email')]
            : User::query()->where('is_admin', true)->pluck('email')->filter()->all();
        if ($to) {
            try {
                Mail::to($to)->queue(new SupportMessageReceived($message));
            } catch (Throwable $e) {
                // The message is saved and listed in Admin > Support either way.
                Log::warning('Support message email failed: '.$e->getMessage(), ['support_message' => $message->id]);
            }
        }

        return response()->json(['data' => [
            'id' => $message->id,
            'message' => 'Thanks! Your message has reached the 3DEEZI team. We will reply by email.',
        ]], 201);
    }
}
