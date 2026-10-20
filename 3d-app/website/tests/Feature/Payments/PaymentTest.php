<?php

namespace Tests\Feature\Payments;

use App\Models\Invoice;
use App\Models\Payment;
use App\Notifications\PaymentReceived;
use App\Services\Payments\Gateways;
use App\Services\Payments\StripeSignature;
use App\Services\Pricing\BillingSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Paying: test mode end to end, Stripe PaymentIntents, the signed webhook, paid once, never test mode in production. */
class PaymentTest extends TestCase
{
    use PaymentFixtures, RefreshDatabase;

    private const SECRET = 'whsec_test_secret';

    protected function setUp(): void
    {
        parent::setUp();
        BillingSettings::flush();
        Bus::withoutDispatchingAfterResponses();
        Http::preventStrayRequests();
    }

    private function stripe(): void
    {
        config(['payments.stripe.key' => 'pk_test_123', 'payments.stripe.secret' => 'sk_test_123', 'payments.stripe.webhook_secret' => self::SECRET]);
    }

    private function webhook(array $event, ?int $time = null, ?string $secret = null): \Illuminate\Testing\TestResponse
    {
        $payload = json_encode($event);

        return $this->call('POST', '/api/v1/payments/stripe/webhook', [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
            'HTTP_STRIPE_SIGNATURE' => StripeSignature::header($payload, $secret ?? self::SECRET, $time),
        ], $payload);
    }

    private function intentEvent(string $id, string $type, string $intent, array $object = []): array
    {
        return ['id' => $id, 'type' => $type, 'data' => ['object' => $object + ['id' => $intent, 'object' => 'payment_intent', 'amount' => 187000,
            'amount_received' => $type === 'payment_intent.succeeded' ? 187000 : 0, 'currency' => 'aud',
            'status' => $type === 'payment_intent.succeeded' ? 'succeeded' : 'requires_payment_method']]];
    }

    /** A Stripe payment started for the invoice (PaymentIntent pi_123). */
    private function stripePayment(): array
    {
        $this->stripe();
        Http::fake(['api.stripe.com/v1/payment_intents' => Http::response(['id' => 'pi_123', 'client_secret' => 'pi_123_secret_abc', 'status' => 'requires_payment_method'])]);
        $customer = $this->customer();
        $invoice = $this->issuedInvoice($customer);
        Sanctum::actingAs($customer);
        $this->postJson('/api/v1/invoices/INV-1001/pay')->assertOk();

        return [$customer, $invoice];
    }

    public function test_test_mode_payment_end_to_end_with_a_decline_then_success(): void
    {
        Notification::fake();
        $customer = $this->customer();
        $invoice = $this->issuedInvoice($customer);
        Sanctum::actingAs($customer);

        $page = $this->getJson('/api/v1/invoices/INV-1001')->assertOk()->json('data');
        $this->assertSame(['test', true], [$page['gateway']['provider'], $page['gateway']['test_mode']]);
        $this->assertStringContainsString('TEST MODE', $page['gateway']['banner']);

        $start = $this->postJson('/api/v1/invoices/INV-1001/pay')->assertOk()->json('data.payment');
        $this->assertSame(['test', 'pending', '1870.00', null], [$start['provider'], $start['status'], $start['amount'], $start['client_secret']]);
        // Asking again (a reload) gives the same payment.
        $this->assertSame($start['id'], $this->postJson('/api/v1/invoices/INV-1001/pay')->json('data.payment.id'));

        // Declined: the invoice stays awaiting payment, the attempt is noted, and it can be tried again.
        $declined = $this->postJson("/api/v1/payments/{$start['id']}/test-complete", ['outcome' => 'failed'])->assertOk()->json('data');
        $this->assertSame(['awaiting_payment', 'failed', true], [$declined['status'], $declined['last_attempt']['status'], $declined['can_pay']]);
        $this->assertStringContainsString('declined', $declined['last_attempt']['message']);
        Notification::assertNotSentTo($customer, PaymentReceived::class);

        $retry = $this->postJson('/api/v1/invoices/INV-1001/pay')->json('data.payment.id');
        $this->assertSame($start['id'], $retry);
        $paid = $this->postJson("/api/v1/payments/{$retry}/test-complete", ['outcome' => 'succeeded'])->assertOk()->json('data');
        $this->assertSame(['paid', '1870.00', '0.00', false, true], [$paid['status'], $paid['amount_paid'], $paid['amount_due'], $paid['can_pay'], $paid['production_ready']]);
        $this->assertSame(['INV-1001-'.$start['id'], '1870.00', '4242'], [$paid['receipt']['number'], $paid['receipt']['amount'], $paid['receipt']['card']['last4']]);
        Notification::assertSentToTimes($customer, PaymentReceived::class, 1);
        $this->assertTrue($invoice->order->fresh()->isPaidInFull());

        // Paid: no more paying, and the finished test payment can't be completed again.
        $this->postJson('/api/v1/invoices/INV-1001/pay')->assertStatus(409);
        $this->postJson("/api/v1/payments/{$retry}/test-complete", ['outcome' => 'succeeded'])->assertStatus(409);
    }

    public function test_a_deposit_can_be_paid_when_that_is_the_rule(): void
    {
        BillingSettings::save(['payment_rule' => 'deposit', 'deposit_percent' => 50]);
        $customer = $this->customer();
        $this->issuedInvoice($customer);
        Sanctum::actingAs($customer);
        $deposit = $this->postJson('/api/v1/invoices/INV-1001/pay', ['amount' => 'deposit'])->assertOk()->json('data.payment');
        $this->assertSame(['935.00', 'deposit'], [$deposit['amount'], $deposit['kind']]);
        $part = $this->postJson("/api/v1/payments/{$deposit['id']}/test-complete", ['outcome' => 'succeeded'])->json('data');
        $this->assertSame(['part_paid', 'Deposit paid', '935.00', true, null], [$part['status'], $part['label'], $part['amount_due'], $part['production_ready'], $part['deposit_due']]);
        $balance = $this->postJson('/api/v1/invoices/INV-1001/pay')->json('data.payment');
        $this->assertSame(['935.00', 'balance'], [$balance['amount'], $balance['kind']]);
        $this->postJson("/api/v1/payments/{$balance['id']}/test-complete", ['outcome' => 'succeeded'])->assertJsonPath('data.status', 'paid');
    }

    public function test_stripe_payment_intents_are_created_once_with_the_invoice_amount(): void
    {
        [$customer] = $this->stripePayment();
        $page = $this->getJson('/api/v1/invoices/INV-1001')->json('data');
        $this->assertSame(['stripe', 'pk_test_123', false, null], [$page['gateway']['provider'], $page['gateway']['publishable_key'], $page['gateway']['test_mode'], $page['gateway']['banner']]);
        $again = $this->postJson('/api/v1/invoices/INV-1001/pay')->assertOk()->json('data.payment');
        $this->assertSame(['stripe', 'pi_123_secret_abc'], [$again['provider'], $again['client_secret']]);

        Http::assertSentCount(1);
        Http::assertSent(fn (HttpRequest $r) => $r->url() === 'https://api.stripe.com/v1/payment_intents' && $r->hasHeader('Authorization', 'Bearer sk_test_123')
            && $r['amount'] === 187000 && $r['currency'] === 'aud' && $r['metadata']['invoice'] === 'INV-1001' && $r->hasHeader('Idempotency-Key'));
        // The test path is closed while Stripe is set up.
        $this->postJson("/api/v1/payments/{$again['id']}/test-complete", ['outcome' => 'succeeded'])->assertNotFound();
        $this->assertSame('awaiting_payment', Invoice::first()->status);
        $this->assertSame($customer->id, Payment::first()->user_id);
    }

    public function test_the_webhook_needs_a_valid_signature_and_ignores_replays(): void
    {
        Notification::fake();
        [$customer] = $this->stripePayment();
        $event = $this->intentEvent('evt_1', 'payment_intent.succeeded', 'pi_123', ['payment_method' => ['card' => ['brand' => 'mastercard', 'last4' => '4444']]]);

        // Wrong secret, no header, or an old timestamp: refused, nothing changes.
        $this->webhook($event, null, 'whsec_wrong')->assertStatus(400);
        $this->call('POST', '/api/v1/payments/stripe/webhook', [], [], [], ['CONTENT_TYPE' => 'application/json'], json_encode($event))->assertStatus(400);
        $this->webhook($event, time() - 600)->assertStatus(400);
        $this->assertSame('awaiting_payment', Invoice::first()->status);

        $this->webhook($event)->assertOk()->assertJsonPath('result', 'handled');
        $invoice = Invoice::first();
        $this->assertSame(['paid', 187000], [$invoice->status, $invoice->paid_cents]);
        $this->assertSame(['succeeded', '4444'], [Payment::first()->status, Payment::first()->details['last4']]);

        // The same event again (Stripe retries): handled once only.
        $this->webhook($event)->assertOk()->assertJsonPath('result', 'duplicate');
        // Another event for the same payment: still paid once.
        $this->webhook(['id' => 'evt_2'] + $event)->assertOk()->assertJsonPath('result', 'handled');
        $this->assertSame([187000, 'paid'], [Invoice::first()->paid_cents, Invoice::first()->status]);
        Notification::assertSentToTimes($customer, PaymentReceived::class, 1);
        // A late failure never undoes the payment; events for other payments are ignored.
        $this->webhook($this->intentEvent('evt_3', 'payment_intent.payment_failed', 'pi_123', ['last_payment_error' => ['message' => 'Declined']]))->assertOk();
        $this->assertSame('succeeded', Payment::first()->status);
        $this->webhook($this->intentEvent('evt_4', 'payment_intent.succeeded', 'pi_someone_else'))->assertOk()->assertJsonPath('result', 'unknown');
        $this->webhook(['id' => 'evt_5', 'type' => 'customer.created', 'data' => ['object' => ['id' => 'cus_1']]])->assertOk()->assertJsonPath('result', 'ignored');

        // Refunded in Stripe's dashboard: recorded.
        $this->webhook(['id' => 'evt_6', 'type' => 'charge.refunded', 'data' => ['object' => ['id' => 'ch_1', 'object' => 'charge', 'payment_intent' => 'pi_123',
            'amount' => 187000, 'amount_refunded' => 187000, 'refunded' => true]]])->assertOk();
        $this->assertSame(['refunded', 187000], [Invoice::first()->status, Invoice::first()->refunded_cents]);
    }

    public function test_a_failed_card_payment_keeps_the_invoice_awaiting_payment(): void
    {
        $this->stripePayment();
        $this->webhook($this->intentEvent('evt_f', 'payment_intent.payment_failed', 'pi_123', ['last_payment_error' => ['message' => 'Your card has insufficient funds.']]))->assertOk();
        $summary = Invoice::summary(Invoice::first());
        $this->assertSame(['awaiting_payment', 'failed', 'Your card has insufficient funds.', true], [$summary['status'], $summary['last_attempt']['status'], $summary['last_attempt']['message'], $summary['can_pay']]);

        // The browser's check after confirming: Stripe says it succeeded (the webhook may be late).
        Http::fake(['api.stripe.com/v1/payment_intents/pi_123*' => Http::response(['id' => 'pi_123', 'status' => 'succeeded', 'amount' => 187000, 'amount_received' => 187000,
            'currency' => 'aud', 'payment_method' => ['card' => ['brand' => 'visa', 'last4' => '1881', 'wallet' => ['type' => 'apple_pay']]]])]);
        $synced = $this->postJson('/api/v1/payments/'.Payment::first()->id.'/sync')->assertOk()->json('data');
        $this->assertSame(['paid', 'wallet'], [$synced['status'], $synced['receipt']['method']]);
    }

    public function test_test_mode_can_never_run_in_production(): void
    {
        $customer = $this->customer();
        $this->issuedInvoice($customer);
        Sanctum::actingAs($customer);
        $payment = $this->postJson('/api/v1/invoices/INV-1001/pay')->json('data.payment');

        $this->app['env'] = 'production';
        $this->assertSame('none', Gateways::mode());
        $this->assertFalse(Gateways::testAllowed());
        $this->postJson("/api/v1/payments/{$payment['id']}/test-complete", ['outcome' => 'succeeded'])->assertNotFound();
        $this->postJson('/api/v1/invoices/INV-1001/pay')->assertStatus(503);
        $this->assertSame('none', $this->getJson('/api/v1/invoices/INV-1001')->json('data.gateway.provider'));
        $this->assertSame('awaiting_payment', Invoice::first()->status);

        // Only an explicit PAYMENTS_TEST_MODE=true turns it on there, with the TEST banner...
        config(['payments.test_mode' => true]);
        $this->assertSame('test', Gateways::mode());
        $this->assertNotNull(Gateways::info()['banner']);
        // ...and never once Stripe keys are set.
        $this->stripe();
        $this->assertSame('stripe', Gateways::mode());
        $this->assertFalse(Gateways::testAllowed());
        $this->postJson("/api/v1/payments/{$payment['id']}/test-complete", ['outcome' => 'succeeded'])->assertNotFound();
        // PAYMENTS_TEST_MODE=false turns it off even on a developer's computer.
        config(['payments.stripe.key' => null, 'payments.stripe.secret' => null, 'payments.test_mode' => 'false']);
        $this->app['env'] = 'local';
        $this->assertSame('none', Gateways::mode());
    }
}
