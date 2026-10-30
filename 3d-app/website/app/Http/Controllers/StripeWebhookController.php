<?php

namespace App\Http\Controllers;

use App\Services\Payments\PaymentService;
use App\Services\Payments\StripeSignature;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Stripe -> us: payment events (paid, failed, cancelled, refunded). No sign-in and no CSRF (an API route); the
 * Stripe-Signature header (HMAC SHA-256 with the endpoint's signing secret) proves it is Stripe, and old or repeated
 * events change nothing.
 */
class StripeWebhookController extends Controller
{
    public function __invoke(Request $request, PaymentService $payments): JsonResponse
    {
        $secret = (string) config('payments.stripe.webhook_secret');
        if ($secret === '') {
            Log::warning('Stripe webhook received, but STRIPE_WEBHOOK_SECRET is not set.');

            return response()->json(['message' => 'Webhook not configured.'], 503);
        }
        $payload = $request->getContent();
        if (! StripeSignature::verify($payload, $request->header('Stripe-Signature'), $secret, (int) config('payments.stripe.tolerance', 300))) {
            return response()->json(['message' => 'Invalid signature.'], 400);
        }
        $event = json_decode($payload, true);
        if (! is_array($event)) {
            return response()->json(['message' => 'Invalid payload.'], 400);
        }

        return response()->json(['received' => true, 'result' => $payments->handleEvent($event, 'stripe')]);
    }
}
