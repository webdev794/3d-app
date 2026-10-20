<?php

namespace App\Services\Payments;

use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * Stripe PaymentIntents over Stripe's REST API (no SDK). The browser confirms the payment with Stripe.js, so card
 * numbers go straight to Stripe and never reach this server.
 */
final class StripeGateway implements PaymentGateway
{
    public function name(): string
    {
        return 'stripe';
    }

    private function http(): PendingRequest
    {
        return Http::withToken((string) config('payments.stripe.secret'))
            ->withHeaders(['Stripe-Version' => (string) config('payments.stripe.version')])
            ->asForm()->acceptJson()->timeout(25)->connectTimeout(10);
    }

    private function url(string $path): string
    {
        return rtrim((string) config('payments.stripe.api', 'https://api.stripe.com/v1'), '/').$path;
    }

    public function create(Payment $payment, Invoice $invoice): array
    {
        $order = $invoice->order?->number;
        $response = $this->http()
            // The same payment never makes two PaymentIntents, even when a request is retried.
            ->withHeaders(['Idempotency-Key' => 'payment-'.$payment->id.'-'.$payment->amount_cents])
            ->post($this->url('/payment_intents'), [
                'amount' => $payment->amount_cents,
                'currency' => strtolower($payment->currency),
                'payment_method_types' => ['card'],
                'description' => 'Invoice '.$invoice->number.($order ? ' (order '.$order.')' : ''),
                'metadata' => array_filter(['invoice' => $invoice->number, 'invoice_id' => (string) $invoice->id,
                    'payment_id' => (string) $payment->id, 'order' => $order, 'kind' => $payment->kind]),
            ]);
        $this->check($response, 'create');

        return ['id' => (string) $response->json('id'), 'client_secret' => $response->json('client_secret'), 'status' => (string) $response->json('status')];
    }

    public function retrieve(Payment $payment): ?array
    {
        if (! $payment->provider_id) {
            return null;
        }
        $response = $this->http()->get($this->url('/payment_intents/'.rawurlencode($payment->provider_id)), ['expand' => ['payment_method']]);
        $this->check($response, 'retrieve');

        return $response->json();
    }

    public function cancel(Payment $payment): void
    {
        if (! $payment->provider_id) {
            return;
        }
        try {
            $this->http()->post($this->url('/payment_intents/'.rawurlencode($payment->provider_id).'/cancel'));
        } catch (Throwable $e) {
            Log::info('Stripe: could not cancel '.$payment->provider_id.': '.$e->getMessage());
        }
    }

    private function check(Response $response, string $what): void
    {
        if ($response->successful()) {
            return;
        }
        Log::warning("Stripe {$what} failed", ['status' => $response->status(), 'error' => $response->json('error.message'), 'type' => $response->json('error.type')]);

        throw new RuntimeException('Stripe: '.($response->json('error.message') ?: 'HTTP '.$response->status()));
    }
}
