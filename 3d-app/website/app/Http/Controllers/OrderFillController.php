<?php

namespace App\Http\Controllers;

use App\Services\OrderAnalysis;
use App\Services\OrderFormAi;
use App\Services\OrderFormReader;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * POST /orders/fill: "Paste your order here" on the order form, website and app (ORDERPASTE, client 2026-11-13: "it
 * should be very easy, you should do the process yourself in ChatGPT"). Whatever the customer pasted or typed (notes
 * such as "XS x 3, S x 5", names with numbers and sizes, cells copied from a spreadsheet) comes back as garments with
 * sizes and players, plus the team, contact, date and delivery when written (`form`, AI only).
 *
 * 3DEEZI AI (OrderFormAi::readPasted, one paid call) reads it for signed-in customers. The built-in reading (no AI, no
 * cost) is used when the AI is off or fails and for visitors, and checks the AI's count: when the built-in reading read
 * every line and counts more garments than the AI, the customer is asked to check. Open to visitors, throttled like the chat.
 */
class OrderFillController extends Controller
{
    public function __invoke(Request $request, OrderFormReader $reader, OrderFormAi $ai): JsonResponse
    {
        $data = $request->validate(['text' => ['required', 'string', 'max:20000']], ['text.required' => 'Paste or type your order first, e.g. XS x 3, S x 5, M x 5.']);
        $text = $data['text'];
        $built = $this->builtIn($reader, $text);
        $signedIn = (bool) $request->user('sanctum');
        $status = ! OrderFormAi::enabled() ? 'off' : ($signedIn ? 'failed' : 'sign_in');
        $read = null;
        if ($signedIn && OrderFormAi::enabled()) {
            @set_time_limit(200);
            $read = $ai->readPasted($text);
            $status = $read ? 'used' : 'failed';
        }
        $result = $read ? $read + ['unsized' => []] : $built;
        // Only fewer: a built-in reading can look complete and still miss words it doesn't know ("3 of each size from small
        // to 2xl" read as 3; real call 3, 2026-11-13), but garments it counted are written in the text.
        if ($read && $built['items'] && ! $built['unknown'] && ! $built['unsized'] && self::total($built['items']) > self::total($read['items'])) {
            Log::info('Order fill: 3DEEZI AI counted '.self::total($read['items']).', the built-in reading '.self::total($built['items']).'.');
            $result['unknown'][] = 'Please check the quantities: your text lists '.self::total($built['items']).' garments, the order below has '.self::total($read['items']).'.';
        }
        $result['unknown'] = array_values(array_slice($result['unknown'] ?? [], 0, 20));

        return response()->json(['data' => $result + [
            'ai' => $status,
            // No garment named ("XS x 3, S x 5"): the sizes are for the garment already on the form.
            'garment_named' => OrderAnalysis::garmentsIn($text) !== [] || (bool) array_filter($result['items'], fn ($i) => ($i['garment'] ?? 'jersey') !== 'jersey'),
            'total' => self::total($result['items']),
        ]]);
    }

    /** The built-in reading: pasted spreadsheet cells as a sheet when that reads more, else as notes. */
    private function builtIn(OrderFormReader $reader, string $text): array
    {
        $notes = $reader->notes($text);
        $cells = $reader->cells($text);
        if ($cells && (self::total($cells['items']) > self::total($notes['items'])
            || (self::total($cells['items']) === self::total($notes['items']) && count($cells['unknown']) < count($notes['unknown'])))) {
            return $cells + ['unsized' => []];
        }

        return $notes;
    }

    /** All the garments counted (sizes; players are counted in their sizes). */
    private static function total(array $items): int
    {
        return (int) array_sum(array_map(fn ($i) => array_sum(array_map('intval', (array) ($i['sizes'] ?? []))), $items));
    }
}
