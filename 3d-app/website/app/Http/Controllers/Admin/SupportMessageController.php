<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SupportMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Admin > Support: messages sent with the Support page's contact form. */
class SupportMessageController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate(['status' => ['sometimes', 'nullable', Rule::in(SupportMessage::STATUSES)]]);
        abort_unless(SupportMessage::ready(), 503, 'Support messages need a database update: run php artisan migrate --force on the server.');
        $search = trim((string) $request->query('search', ''));
        $messages = SupportMessage::query()
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q->where('name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%")->orWhere('order_reference', 'like', "%{$search}%")
                ->orWhere('message', 'like', "%{$search}%")))
            ->latest()->latest('id')
            ->paginate(min(60, max(6, (int) $request->query('per_page', 12))));

        return response()->json(['data' => $messages]);
    }

    public function update(Request $request, SupportMessage $supportMessage): JsonResponse
    {
        $supportMessage->fill($request->validate(['status' => ['required', Rule::in(SupportMessage::STATUSES)]]))->save();

        return response()->json(['data' => $supportMessage]);
    }

    public function destroy(SupportMessage $supportMessage): JsonResponse
    {
        $supportMessage->delete();

        return response()->json(['data' => ['message' => 'Message deleted.']]);
    }
}
