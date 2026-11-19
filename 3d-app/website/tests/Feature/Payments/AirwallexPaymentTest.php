<?php

namespace Tests\Feature\Payments;

use App\Models\Invoice;
use App\Models\Payment;
use App\Notifications\PaymentReceived;
use App\Services\Payments\AirwallexSignature;
use App\Services\Payments\Gateways;
use App\Services\Pricing\BillingSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Airwallex: the provider switch, the cached access token, PaymentIntents for the Hosted Payment Page, the signed
 * webhook (paid once, duplicates do nothing), the check when the customer comes back, and refunds. Every Airwallex
 * call is faked: no network.
 */
class AirwallexPaymentTest extends TestCase
{
    use PaymentFixtures, RefreshDatabase;

    private const SECRET = 'awx_webhook_test_secret';

    private const API = 'https://api-demo.airwallex.com/api/v1';

    protected function setUp(): void
    {
        parent::setUp();
        BillingSettings::flush();
        Bus::withoutDispatchingAfterResponses();
        Http::preventStrayRequests();
    }

    private function airwallex(): void
    {
        config(['payments.airwallex.client_id' => 'awx_client_test', 'payments.airwallex.api_key' => 'awx_key_test',
            'payments.airwallex.webhook_secret' => self::SECRET, 'payments.airwallex.env' => 'demo']);
    }

    private function fakeAirwallex(array $more = []): void
    {
        Http::fake($more + [
            'api-demo.airwallex.com/api/v1/authentication/login' => Http::response(['token' => 'awx_bearer_1', 'expires_at' => now()->addMinutes(30)->format('Y-m-d\TH:i:sO')], 201),
            'api-demo.airwallex.com/api/v1/pa/payment_intents/create' => Http::response(['id' => 'int_123', 'client_secret' => 'awx_cs_abc', 'status' => 'REQUIRES_PAYMENT_METHOD',
                'amount' => 1870, 'currency' => 'AUD', 'merchant_order_id' => 'INV-1001-1'], 201),
        ]);
    }

    /** An Airwallex payment started for the invoice (PaymentIntent int_123). */
    private function airwallexPayment(array $more = []): array
    {
        $this->airwallex();
        $this->fakeAirwallex($more);
        $customer = $this->customer();
        $invoice = $this->issuedInvoice($customer);
        Sanctum::actingAs($customer);
        $payment = $this->postJson('/api/v1/invoices/INV-1001/pay')->assertOk()->json('data.payment');

        return [$customer, $invoice, $payment];
    }

    private function webhook(array $event, ?int $timestampMs = null, ?string $secret = null): TestResponse
    {
        $payload = json_encode($event);
        $headers = AirwallexSignature::headers($payload, $secret ?? self::SECRET, $timestampMs);

        return $this->call('POST', '/api/v1/payments/airwallex/webhook', [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_TIMESTAMP' => $headers['x-timestamp'], 'HTTP_X_SIGNATURE' => $headers['x-signature'],
        ], $payload);
    }

    private function event(string $id, string $name, array $object): array
    {
        return ['id' => $id, 'name' => $name, 'account_id' => 'acct_test', 'data' => ['object' => $object], 'created_at' => now()->toIso8601String(), 'version' => '2024-06-30'];
    }

    private function succeededIntent(string $id = 'int_123', array $method = ['type' => 'card', 'card' => ['brand' => 'mastercard', 'last4' => '4444']]): array
    {
        return ['id' => $id, 'amount' => 1870, 'captured_amount' => 1870, 'currency' => 'AUD', 'status' => 'SUCCEEDED', 'merchant_order_id' => 'INV-1001-1',
            'latest_payment_attempt' => ['id' => 'att_1', 'status' => 'CAPTURE_REQUESTED', 'payment_method' => $method]];
    }

    public function test_the_provider_switch(): void
    {
        // No keys: test mode on a developer's computer (as before).
        $this->assertSame('test', Gateways::mode());
        // Stripe keys only: Stripe, as before.
        config(['payments.stripe.key' => 'pk_test_123', 'payments.stripe.secret' => 'sk_test_123']);
        $this->assertSame('stripe', Gateways::mode());
        // Airwallex keys too: Airwallex is the default...
        $this->airwallex();
        $this->assertSame('airwallex', Gateways::mode());
        $this->assertFalse(Gateways::testAllowed());
        // ...unless PAYMENTS_PROVIDER says Stripe.
        config(['payments.provider' => 'stripe']);
        $this->assertSame('stripe', Gateways::mode());
        config(['payments.provider' => 'airwallex']);
        $this->assertSame('airwallex', Gateways::mode());
        // A chosen provider without its keys is never swapped for another one: no online payment.
        config(['payments.airwallex.client_id' => null, 'payments.airwallex.api_key' => null]);
        $this->assertSame('none', Gateways::mode());
        // Airwallex keys alone also close test mode, and AIRWALLEX_ENV is demo unless it says prod.
        config(['payments.provider' => null, 'payments.stripe.key' => null, 'payments.stripe.secret' => null]);
        $this->airwallex();
        $this->assertFalse(Gateways::testAllowed());
        $this->assertSame('demo', Gateways::airwallexEnv());
        config(['payments.airwallex.env' => 'production?']);
        $this->assertSame('demo', Gateways::airwallexEnv());
        config(['payments.airwallex.env' => 'prod']);
        $this->assertSame(['prod', null], [Gateways::info()['environment'], Gateways::info()['banner']]);
    }

    public function test_an_intent_is_created_once_with_a_cached_token_and_the_pay_page_gets_what_it_needs(): void
    {
        [$customer, , $payment] = $this->airwallexPayment();
        $this->assertSame(['airwallex', 'pending', '1870.00', 'awx_cs_abc', 'int_123'], [$payment['provider'], $payment['status'], $payment['amount'], $payment['client_secret'], $payment['intent_id']]);

        $page = $this->getJson('/api/v1/invoices/INV-1001')->assertOk()->json('data.gateway');
        $this->assertSame(['airwallex', 'demo', 'AU', false, null], [$page['provider'], $page['environment'], $page['country'], $page['test_mode'], $page['publishable_key']]);
        $this->assertStringContainsString('DEMO', $page['banner']);
        // A reload: the same payment, no new PaymentIntent and no new login.
        $this->assertSame($payment['id'], $this->postJson('/api/v1/invoices/INV-1001/pay')->json('data.payment.id'));

        Http::assertSentCount(2);
        Http::assertSent(fn (HttpRequest $r) => $r->url() === self::API.'/authentication/login' && $r->hasHeader('x-client-id', 'awx_client_test') && $r->hasHeader('x-api-key', 'awx_key_test'));
        // Decimal amounts (1870.00 AUD, not cents), the invoice as the merchant order, a unique request id.
        Http::assertSent(fn (HttpRequest $r) => $r->url() === self::API.'/pa/payment_intents/create' && $r->hasHeader('Authorization', 'Bearer awx_bearer_1')
            && (float) $r['amount'] === 1870.0 && $r['currency'] === 'AUD' && str_starts_with($r['merchant_order_id'], 'INV-1001-')
            && $r['request_id'] !== '' && $r['metadata']['invoice'] === 'INV-1001' && str_ends_with($r['return_url'], '/invoices/INV-1001'));
        // Never the API key or the token to the browser.
        $json = json_encode($this->getJson('/api/v1/invoices/INV-1001')->json());
        $this->assertStringNotContainsString('awx_key_test', $json);
        $this->assertStringNotContainsString('awx_bearer_1', $json);
        $this->assertSame($customer->id, Payment::first()->user_id);

        // The test path is closed while Airwallex is set up.
        $this->postJson("/api/v1/payments/{$payment['id']}/test-complete", ['outcome' => 'succeeded'])->assertNotFound();
    }

    public function test_an_old_open_payment_gets_a_new_intent_and_an_expired_token_logs_in_again(): void
    {
        [, , $payment] = $this->airwallexPayment([
            'api-demo.airwallex.com/api/v1/pa/payment_intents/create' => Http::sequence()
                ->push(['id' => 'int_123', 'client_secret' => 'awx_cs_abc', 'status' => 'REQUIRES_PAYMENT_METHOD'], 201)
                ->push(['id' => 'int_456', 'client_secret' => 'awx_cs_new', 'status' => 'REQUIRES_PAYMENT_METHOD'], 201),
            'api-demo.airwallex.com/api/v1/pa/payment_intents/int_123/cancel' => Http::sequence()->push(['code' => 'unauthorized'], 401)->push(['id' => 'int_123', 'status' => 'CANCELLED']),
        ]);
        $this->travel(50)->minutes();
        $next = $this->postJson('/api/v1/invoices/INV-1001/pay')->assertOk()->json('data.payment');
        $this->assertNotSame($payment['id'], $next['id']);
        $this->assertSame(['int_456', 'awx_cs_new'], [$next['intent_id'], $next['client_secret']]);
        $this->assertSame('cancelled', Payment::find($payment['id'])->status);
        // 50 minutes on, the cached token had expired (a new login); the cancel then got a 401: one more login and a retry.
        Http::assertSentCount(7);
        $this->assertCount(3, Http::recorded(fn (HttpRequest $r) => str_ends_with($r->url(), '/authentication/login')));
        $this->assertCount(2, Http::recorded(fn (HttpRequest $r) => str_ends_with($r->url(), '/int_123/cancel')));
    }

    public function test_a_signed_webhook_marks_the_invoice_paid_once_and_a_bad_signature_is_refused(): void
    {
        Notification::fake();
        [$customer] = $this->airwallexPayment();
        $event = $this->event('evt_awx_1', 'payment_intent.succeeded', $this->succeededIntent());

        $this->webhook($event, null, 'wrong_secret')->assertStatus(401);
        $this->call('POST', '/api/v1/payments/airwallex/webhook', [], [], [], ['CONTENT_TYPE' => 'application/json'], json_encode($event))->assertStatus(401);
        $this->webhook($event, (int) (microtime(true) * 1000) - 600_000)->assertStatus(401);
        $this->assertSame('awaiting_payment', Invoice::first()->status);

        $this->webhook($event)->assertOk()->assertJsonPath('result', 'handled');
        $invoice = Invoice::first();
        $this->assertSame(['paid', 187000], [$invoice->status, $invoice->paid_cents]);
        $this->assertSame(['succeeded', '4444', 'mastercard'], [Payment::first()->status, Payment::first()->details['last4'], Payment::first()->details['brand']]);
        $this->assertTrue($invoice->order->fresh()->isPaidInFull());

        // Delivered twice (Airwallex retries): nothing the second time.
        $this->webhook($event)->assertOk()->assertJsonPath('result', 'duplicate');
        $this->webhook(['id' => 'evt_awx_2'] + $event)->assertOk()->assertJsonPath('result', 'handled');
        $this->assertSame([187000, 'paid'], [Invoice::first()->paid_cents, Invoice::first()->status]);
        Notification::assertSentToTimes($customer, PaymentReceived::class, 1);
        // A late failure never undoes it; others' payments and other events are left alone.
        $this->webhook($this->event('evt_awx_3', 'payment_attempt.authorization_failed', ['id' => 'att_2', 'payment_intent_id' => 'int_123', 'status' => 'FAILED', 'failure_code' => 'issuer_declined']))->assertOk();
        $this->assertSame('succeeded', Payment::first()->status);
        $this->webhook($this->event('evt_awx_4', 'payment_intent.succeeded', $this->succeededIntent('int_someone_else')))->assertOk()->assertJsonPath('result', 'unknown');
        $this->webhook($this->event('evt_awx_5', 'customer.created', ['id' => 'cus_1']))->assertOk()->assertJsonPath('result', 'ignored');
        Http::assertSentCount(2);
    }

    public function test_a_failed_attempt_then_the_check_when_the_customer_comes_back(): void
    {
        [, , $payment] = $this->airwallexPayment([
            'api-demo.airwallex.com/api/v1/pa/payment_intents/int_123' => Http::sequence()
                ->push(['id' => 'int_123', 'amount' => 1870, 'currency' => 'AUD', 'status' => 'PENDING'])
                ->push($this->succeededIntent('int_123', ['type' => 'applepay', 'applepay' => ['card' => ['brand' => 'visa', 'last4' => '1881']]])),
        ]);
        $this->webhook($this->event('evt_f', 'payment_attempt.authorization_failed', ['id' => 'att_1', 'payment_intent_id' => 'int_123', 'status' => 'FAILED', 'failure_code' => 'insufficient_funds']))->assertOk();
        $summary = Invoice::summary(Invoice::first());
        $this->assertSame(['awaiting_payment', 'failed', 'Your card has insufficient funds.', true], [$summary['status'], $summary['last_attempt']['status'], $summary['last_attempt']['message'], $summary['can_pay']]);

        // Back from the Hosted Payment Page: still processing, then paid by Apple Pay.
        $this->assertSame('processing', $this->postJson("/api/v1/payments/{$payment['id']}/sync")->assertOk()->json('data.last_attempt.status'));
        $synced = $this->postJson("/api/v1/payments/{$payment['id']}/sync")->assertOk()->json('data');
        $this->assertSame(['paid', 'wallet', '1881'], [$synced['status'], $synced['receipt']['method'], $synced['receipt']['card']['last4']]);
        Http::assertSent(fn (HttpRequest $r) => $r->method() === 'GET' && $r->url() === self::API.'/pa/payment_intents/int_123' && $r->hasHeader('Authorization', 'Bearer awx_bearer_1'));
    }

    public function test_staff_refund_goes_through_airwallex_and_its_webhooks_change_nothing_more(): void
    {
        [, $invoice] = $this->airwallexPayment([
            'api-demo.airwallex.com/api/v1/pa/refunds/create' => Http::response(['id' => 'rfd_1', 'payment_intent_id' => 'int_123', 'amount' => 1870, 'currency' => 'AUD', 'status' => 'RECEIVED'], 201),
        ]);
        $this->webhook($this->event('evt_paid', 'payment_intent.succeeded', $this->succeededIntent()))->assertOk();
        Sanctum::actingAs($this->admin());

        $this->postJson("/api/v1/admin/invoices/{$invoice->id}/refund", ['note' => 'Club folded.'])->assertOk()->assertJsonPath('data.status', 'refunded');
        Http::assertSent(fn (HttpRequest $r) => $r->url() === self::API.'/pa/refunds/create' && $r['payment_intent_id'] === 'int_123' && (float) $r['amount'] === 1870.0 && $r['request_id'] !== '');
        $invoice->refresh();
        $this->assertSame(['refunded', 187000, 'refunded'], [$invoice->status, $invoice->refunded_cents, Payment::first()->status]);

        // Airwallex then reports the same refund (accepted, settled): counted once.
        $refund = ['id' => 'rfd_1', 'payment_intent_id' => 'int_123', 'amount' => 1870, 'currency' => 'AUD', 'status' => 'ACCEPTED'];
        $this->webhook($this->event('evt_r1', 'refund.accepted', $refund))->assertOk()->assertJsonPath('result', 'handled');
        $this->webhook($this->event('evt_r2', 'refund.settled', ['status' => 'SETTLED'] + $refund))->assertOk();
        $this->assertSame([187000, 'refunded'], [Invoice::first()->refunded_cents, Invoice::first()->status]);
        $this->postJson("/api/v1/admin/invoices/{$invoice->id}/refund")->assertStatus(409);
        Http::assertSentCount(3);
    }

    public function test_a_refund_made_in_airwallex_is_recorded_and_a_failed_one_is_taken_back(): void
    {
        $this->airwallexPayment();
        $this->webhook($this->event('evt_paid', 'payment_intent.succeeded', $this->succeededIntent()))->assertOk();

        $refund = ['id' => 'rfd_9', 'payment_intent_id' => 'int_123', 'amount' => 500, 'currency' => 'AUD', 'status' => 'ACCEPTED'];
        $this->webhook($this->event('evt_r1', 'refund.accepted', $refund))->assertOk();
        $this->webhook($this->event('evt_r2', 'refund.settled', $refund))->assertOk();
        $this->assertSame([50000, 'paid'], [Invoice::first()->refunded_cents, Invoice::first()->status]);

        $this->webhook($this->event('evt_r3', 'refund.failed', ['status' => 'FAILED', 'failure_reason' => 'Insufficient balance'] + $refund))->assertOk();
        $invoice = Invoice::first();
        $this->assertSame([0, 'paid', 'refund_failed'], [$invoice->refunded_cents, $invoice->status, $invoice->last_attempt['status']]);
        $this->assertSame('succeeded', Payment::first()->status);
    }

    public function test_admin_pricing_shows_the_airwallex_setup_without_secrets(): void
    {
        $this->airwallex();
        Sanctum::actingAs($this->admin());
        $gateway = $this->getJson('/api/v1/admin/pricing')->assertOk()->json('data.gateway');
        $this->assertSame(['airwallex', true, true, true, false, 'demo'], [$gateway['mode'], $gateway['airwallex']['client_id'], $gateway['airwallex']['api_key'],
            $gateway['airwallex']['webhook_secret'], $gateway['airwallex']['account_id'], $gateway['airwallex']['env']]);
        $this->assertStringEndsWith('/api/v1/payments/airwallex/webhook', $gateway['airwallex']['webhook_url']);
        $this->assertContains('payment_intent.succeeded', $gateway['airwallex']['events']);
        $this->assertContains('refund.accepted', $gateway['airwallex']['events']);
        $json = json_encode($gateway);
        foreach (['awx_client_test', 'awx_key_test', self::SECRET] as $secret) {
            $this->assertStringNotContainsString($secret, $json);
        }
    }
}
