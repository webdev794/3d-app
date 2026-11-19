<?php

namespace App\Http\Controllers;

use App\Services\Payments\AirwallexSignature;
use App\Services\Payments\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Airwallex -> us: payment events (paid, failed, processing, cancelled, refunded). No sign-in and no CSRF (an API
 * route); the x-signature header (HMAC SHA-256 of x-timestamp + the raw body, with the webhook's secret) proves it
 * is Airwallex. It is checked before the body is read; old or repeated events change nothing.
 */
class AirwallexWebhookController extends Controller
{
    public function __invoke(Request $request, PaymentService $payments): JsonResponse
    {
        $secret = (string) config('payments.airwallex.webhook_secret');
        if ($secret === '') {
            Log::warning('Airwallex webhook received, but AIRWALLEX_WEBHOOK_SECRET is not set.');

            return response()->json(['message' => 'Webhook not configured.'], 503);
        }
        $payload = $request->getContent();
        if (! AirwallexSignature::verify($payload, $request->header('x-timestamp'), $request->header('x-signature'), $secret, (int) config('payments.airwallex.tolerance', 300))) {
            return response()->json(['message' => 'Invalid signature.'], 401);
        }
        $event = json_decode($payload, true);
        if (! is_array($event)) {
            return response()->json(['message' => 'Invalid payload.'], 400);
        }
        // Airwallex names the event type "name"; its resource is under data.object.
        $event = ['id' => (string) ($event['id'] ?? ''), 'type' => (string) ($event['name'] ?? ''), 'data' => ['object' => $event['data']['object'] ?? null]];

        return response()->json(['received' => true, 'result' => $payments->handleEvent($event, 'airwallex')]);
    }
}
