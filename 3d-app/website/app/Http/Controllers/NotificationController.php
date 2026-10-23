<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The signed-in person's notifications in the website (e.g. "Approval needed for 3DZ-00012"). */
class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(['data' => [
            'unread' => $user->unreadNotifications()->count(),
            'items' => $user->notifications()->latest()->limit(30)->get()->map(fn ($n) => [
                'id' => $n->id,
                'type' => class_basename($n->type),
                // Older texts written as "AUD $1,870.00" read "A$1,870.00", as every price on the site (task 9.85).
                'data' => is_array($n->data) ? array_map(fn ($v) => is_string($v) ? \App\Services\Pricing\Money::restyle($v) : $v, $n->data) : $n->data,
                'read_at' => $n->read_at?->toIso8601String(),
                'created_at' => $n->created_at?->toIso8601String(),
            ]),
        ]]);
    }

    /** Marks the given notifications read (all of them without ids). */
    public function read(Request $request): JsonResponse
    {
        $data = $request->validate(['ids' => ['sometimes', 'array', 'max:100'], 'ids.*' => ['string', 'max:64']]);
        $request->user()->unreadNotifications()->when($data['ids'] ?? null, fn ($q, $ids) => $q->whereIn('id', $ids))->update(['read_at' => now()]);

        return response()->json(['data' => ['unread' => $request->user()->unreadNotifications()->count()]]);
    }
}
