<?php

namespace App\Services\Payments;

use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * Airwallex Payments over its REST API (no SDK). The server creates a PaymentIntent; the pay page sends the customer
 * to Airwallex's Hosted Payment Page (Airwallex.js redirectToCheckout), which takes the card, Apple Pay or Google Pay,
 * so card numbers never reach this server. Airwallex amounts are decimals in the currency's major unit (1870.00 AUD),
 * so cents are converted both ways here. The access token (30 minutes) is cached and reused, never logged.
 *
 * Docs: airwallex.com/docs/api/authentication/api_access_token, airwallex.com/docs/api/payments/payment_intents,
 * airwallex.com/docs/api/payments/refunds, airwallex.com/docs/payments/reference/payments-webhooks.
 */
class AirwallexGateway implements PaymentGateway
{
    /** payment_attempt events that mean this try failed (the customer may try again on the same PaymentIntent). */
    public const ATTEMPT_FAILURES = ['payment_attempt.authentication_failed', 'payment_attempt.authorization_failed', 'payment_attempt.risk_declined',
        'payment_attempt.failed_to_process', 'payment_attempt.capture_failed', 'payment_attempt.expired'];

    /** The webhook events to enable in Airwallex (Developer > Webhooks). */
    public const EVENTS = ['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.pending', 'payment_intent.cancelled',
        'payment_attempt.authorization_failed', 'payment_attempt.failed_to_process', 'refund.accepted', 'refund.settled', 'refund.failed'];

    /** Airwallex's PaymentIntent client_secret is short-lived: an open payment older than this gets a new intent. */
    public const REUSE_MINUTES = 45;

    public function name(): string
    {
        return 'airwallex';
    }

    public static function baseUrl(): string
    {
        $env = Gateways::airwallexEnv();

        return rtrim((string) (config("payments.airwallex.api.{$env}") ?: ($env === 'prod' ? 'https://api.airwallex.com' : 'https://api-demo.airwallex.com')), '/');
    }

    private function url(string $path): string
    {
        return self::baseUrl().'/api/v1'.$path;
    }

    private function cacheKey(): string
    {
        return 'payments.airwallex.token.'.hash('sha256', Gateways::airwallexEnv().'|'.config('payments.airwallex.client_id').'|'.config('payments.airwallex.account_id'));
    }

    /** The bearer token: cached until shortly before it expires (Airwallex: 30 minutes; log in again only then). */
    public function token(bool $fresh = false): string
    {
        $key = $this->cacheKey();
        if (! $fresh && is_string($cached = Cache::get($key)) && $cached !== '') {
            return $cached;
        }
        $headers = ['x-client-id' => (string) config('payments.airwallex.client_id'), 'x-api-key' => (string) config('payments.airwallex.api_key')];
        if (filled(config('payments.airwallex.account_id'))) {
            $headers['x-login-as'] = (string) config('payments.airwallex.account_id');
        }
        $response = Http::withHeaders($headers)->acceptJson()->timeout(20)->connectTimeout(10)
            ->withBody('{}', 'application/json')->post($this->url('/authentication/login'));
        if (! $response->successful() || ! is_string($response->json('token')) || $response->json('token') === '') {
            Log::warning('Airwallex login failed', ['status' => $response->status(), 'code' => $response->json('code')]);

            throw new RuntimeException('Airwallex: the login was refused (HTTP '.$response->status().'). Check AIRWALLEX_CLIENT_ID, AIRWALLEX_API_KEY and AIRWALLEX_ENV.');
        }
        $token = (string) $response->json('token');
        $expires = strtotime((string) $response->json('expires_at')) ?: time() + 1800;
        Cache::put($key, $token, max(60, min(1800, $expires - time() - 120)));

        return $token;
    }

    /** An authorised request; a 401 (the token expired early) logs in once more and tries again. */
    private function send(string $method, string $path, array $body = []): Response
    {
        $request = fn (string $token): Response => $method === 'GET'
            ? $this->http($token)->get($this->url($path))
            : $this->http($token)->withBody(json_encode((object) $body, JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION), 'application/json')->post($this->url($path));
        $response = $request($this->token());
        if ($response->status() === 401) {
            Cache::forget($this->cacheKey());
            $response = $request($this->token(true));
        }

        return $response;
    }

    private function http(string $token): PendingRequest
    {
        return Http::withToken($token)->acceptJson()->timeout(25)->connectTimeout(10);
    }

    public function create(Payment $payment, Invoice $invoice): array
    {
        $order = $invoice->order?->number;
        $response = $this->send('POST', '/pa/payment_intents/create', [
            // Unique per payment and amount: a retried request can't make a second PaymentIntent.
            'request_id' => 'pay-'.$payment->id.'-'.$payment->amount_cents.'-'.substr(hash('sha256', (string) config('app.key').$payment->id), 0, 12),
            'amount' => self::decimal($payment->amount_cents),
            'currency' => strtoupper($payment->currency),
            'merchant_order_id' => mb_substr($invoice->number.'-'.$payment->id, 0, 64),
            'descriptor' => mb_substr('3DEEZI '.$invoice->number, 0, 32),
            'return_url' => $invoice->payUrl(),
            'metadata' => array_filter(['invoice' => $invoice->number, 'invoice_id' => (string) $invoice->id, 'payment_id' => (string) $payment->id,
                'order' => $order, 'kind' => $payment->kind]),
        ]);
        $this->check($response, 'create');

        return ['id' => (string) $response->json('id'), 'client_secret' => $response->json('client_secret'), 'status' => strtolower((string) $response->json('status'))];
    }

    public function retrieve(Payment $payment): ?array
    {
        if (! $payment->provider_id) {
            return null;
        }
        $response = $this->send('GET', '/pa/payment_intents/'.rawurlencode($payment->provider_id));
        $this->check($response, 'retrieve');

        return self::intentState((array) $response->json());
    }

    public function cancel(Payment $payment): void
    {
        if (! $payment->provider_id) {
            return;
        }
        try {
            $this->send('POST', '/pa/payment_intents/'.rawurlencode($payment->provider_id).'/cancel', [
                'request_id' => 'cancel-'.$payment->id.'-'.substr(hash('sha256', (string) $payment->provider_id), 0, 12),
                'cancellation_reason' => 'Replaced by a new payment, or the invoice was cancelled',
            ]);
        } catch (Throwable $e) {
            Log::info('Airwallex: could not cancel payment '.$payment->id.': '.$e->getMessage());
        }
    }

    public function refund(Payment $payment, int $cents): ?array
    {
        if (! $payment->provider_id || $cents <= 0) {
            return null;
        }
        $before = (int) ($payment->details['refunded_cents'] ?? 0);
        $response = $this->send('POST', '/pa/refunds/create', [
            'request_id' => 'refund-'.$payment->id.'-'.$before.'-'.$cents,
            'payment_intent_id' => $payment->provider_id,
            'amount' => self::decimal($cents),
            'reason' => 'Refund of invoice '.($payment->invoice?->number ?? $payment->invoice_id),
            'metadata' => ['payment_id' => (string) $payment->id],
        ]);
        $this->check($response, 'refund');

        return ['id' => (string) $response->json('id'), 'status' => strtolower((string) $response->json('status'))];
    }

    private function check(Response $response, string $what): void
    {
        if ($response->successful()) {
            return;
        }
        // Airwallex errors: {code, message, source}. Never the token or the keys.
        Log::warning("Airwallex {$what} failed", ['status' => $response->status(), 'code' => $response->json('code'), 'error' => $response->json('message')]);

        throw new RuntimeException('Airwallex: '.($response->json('message') ?: 'HTTP '.$response->status()));
    }

    /** Cents -> Airwallex's decimal amount (AUD, NZD and our other currencies have 2 decimals). */
    public static function decimal(int $cents): float
    {
        return round($cents / 100, 2);
    }

    /** Airwallex's decimal amount -> cents. */
    public static function cents(mixed $amount): int
    {
        return is_numeric($amount) ? (int) round(((float) $amount) * 100) : 0;
    }

    /** The PaymentIntent an event is about: its own id, or payment_intent_id on attempts and refunds; null = not ours to handle. */
    public static function intentIdOf(string $type, array $object): ?string
    {
        return match (true) {
            str_starts_with($type, 'payment_intent.') => (string) ($object['id'] ?? ''),
            str_starts_with($type, 'payment_attempt.'), str_starts_with($type, 'refund.') => (string) ($object['payment_intent_id'] ?? ''),
            default => null,
        };
    }

    /**
     * An Airwallex PaymentIntent in the shape PaymentService::apply() reads: status succeeded (SUCCEEDED), processing
     * (PENDING, PENDING_REVIEW, REQUIRES_CAPTURE), canceled (CANCELLED) or requires_payment_method (with the error
     * when the latest attempt failed); amounts in cents; the card brand, last 4 digits and wallet.
     */
    public static function intentState(array $intent): array
    {
        $status = strtoupper((string) ($intent['status'] ?? ''));
        $attempt = is_array($intent['latest_payment_attempt'] ?? null) ? $intent['latest_payment_attempt'] : [];
        $failed = $status === 'REQUIRES_PAYMENT_METHOD' && $attempt !== []
            && (filled($attempt['failure_code'] ?? null) || in_array(strtoupper((string) ($attempt['status'] ?? '')), ['FAILED', 'EXPIRED', 'CANCELLED'], true));

        return [
            'id' => (string) ($intent['id'] ?? ''),
            'status' => match ($status) {
                'SUCCEEDED' => 'succeeded',
                'PENDING', 'PENDING_REVIEW', 'REQUIRES_CAPTURE' => 'processing',
                'CANCELLED' => 'canceled',
                'REQUIRES_PAYMENT_METHOD' => 'requires_payment_method',
                default => strtolower($status),
            },
            'amount' => self::cents($intent['amount'] ?? 0),
            'amount_received' => $status === 'SUCCEEDED' ? (self::cents($intent['captured_amount'] ?? 0) ?: self::cents($intent['amount'] ?? 0)) : 0,
            'currency' => strtolower((string) ($intent['currency'] ?? '')),
            'last_payment_error' => $failed ? ['code' => $attempt['failure_code'] ?? null, 'message' => self::failureMessage($attempt['failure_code'] ?? null)] : null,
            'payment_method' => self::method($attempt['payment_method'] ?? null),
        ];
    }

    /** A failed payment attempt (payment_attempt.authorization_failed and the like) as a failed PaymentIntent. */
    public static function attemptFailure(array $attempt): array
    {
        return [
            'id' => (string) ($attempt['payment_intent_id'] ?? ''),
            'status' => 'requires_payment_method',
            'last_payment_error' => ['code' => $attempt['failure_code'] ?? null, 'message' => self::failureMessage($attempt['failure_code'] ?? null)],
        ];
    }

    private static function failureMessage(?string $code): string
    {
        return match ((string) $code) {
            'issuer_declined', 'card_declined', 'do_not_honor' => 'Your card was declined.',
            'insufficient_funds' => 'Your card has insufficient funds.',
            'expired_card' => 'Your card has expired.',
            'authentication_failed', '3ds_failed' => 'The card check (3D Secure) did not complete.',
            'risk_declined', 'rejected_by_routing_rules' => 'The payment was declined by the security check.',
            default => 'The payment did not go through.',
        };
    }

    /** card / applepay / googlepay -> {type, card: {brand, last4, wallet: {type: apple_pay|google_pay}}}. */
    private static function method(mixed $method): ?array
    {
        if (! is_array($method)) {
            return null;
        }
        $type = strtolower((string) ($method['type'] ?? 'card'));
        $card = $method['card'] ?? ($method[$type]['card'] ?? ($method[$type] ?? []));
        $card = is_array($card) ? $card : [];
        $wallet = match ($type) {
            'applepay', 'apple_pay' => 'apple_pay',
            'googlepay', 'google_pay' => 'google_pay',
            default => null,
        };

        return ['type' => 'card', 'card' => ['brand' => isset($card['brand']) ? strtolower((string) $card['brand']) : null,
            'last4' => isset($card['last4']) ? (string) $card['last4'] : null, 'wallet' => $wallet ? ['type' => $wallet] : null]];
    }
}
