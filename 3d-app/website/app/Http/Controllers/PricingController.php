<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Services\Pricing\PricingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Prices for the order form (public): the price list's options, and a quote for the review step. */
class PricingController extends Controller
{
    public function options(PricingService $pricing): JsonResponse
    {
        return response()->json(['data' => $pricing->options()]);
    }

    /** The review step's breakdown: the order form's garments and choices, priced with the saved price list. */
    public function quote(Request $request, PricingService $pricing): JsonResponse
    {
        $data = $request->validate([
            'items' => ['present', 'array', 'max:'.PricingService::MAX_ITEMS],
            'items.*' => ['array'],
            'items.*.garment' => ['required', 'string', 'max:20', 'regex:/^[a-z0-9_-]+$/'],
            'items.*.sport' => ['nullable', 'string', 'max:40'],
            'items.*.fit' => ['nullable', 'string', 'max:20'],
            'items.*.label' => ['nullable', 'string', 'max:60'],
            'items.*.sizes' => ['sometimes', 'nullable', 'array'],
            'items.*.sizes.*' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'items.*.quantity' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100000'],
            'items.*.players' => ['sometimes', 'nullable', 'array', 'max:'.Order::MAX_PLAYERS],
            'items.*.players.*.name' => ['nullable', 'string', 'max:40'],
            'items.*.players.*.number' => ['nullable', 'string', 'max:3'],
            'shipping_address' => ['sometimes', 'nullable', 'string', 'max:1000'],
            ...PricingService::choiceRules(),
        ], ['items.*.garment.required' => 'Choose a garment for each row.']);

        // Only known sizes count, as on the order itself.
        foreach ($data['items'] as &$item) {
            if (isset($item['sizes'])) {
                $item['sizes'] = array_intersect_key($item['sizes'], array_flip(Order::SIZES));
            }
        }
        unset($item);

        return response()->json(['data' => PricingService::present($pricing->quote($data))]);
    }
}
