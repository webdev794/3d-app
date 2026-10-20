<?php

namespace Tests\Feature\Payments;

use App\Jobs\SendBillingEmail;
use App\Models\Invoice;
use App\Models\PriceRule;
use App\Notifications\InvoiceIssued;
use App\Services\Payments\InvoiceService;
use App\Services\Payments\PaymentRules;
use App\Services\Pricing\BillingSettings;
use App\Services\Pricing\PricingService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/** Invoices: issued on submission, numbers, the agreed snapshot, the PDF, the email, access and staff actions. */
class InvoiceTest extends TestCase
{
    use PaymentFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        BillingSettings::flush();
        // Billing emails go after the response; in tests, straight away.
        Bus::withoutDispatchingAfterResponses();
    }

    public function test_a_priced_order_gets_its_invoice_on_submission_and_the_customer_is_emailed(): void
    {
        Notification::fake();
        $this->priceList();
        $customer = $this->customer();
        $invoice = $this->submit($this->formOrder($customer));

        $this->assertSame(['INV-1001', 'awaiting_payment', 'AUD'], [$invoice->number, $invoice->status, $invoice->currency]);
        $this->assertSame([170000, 17000, 187000, 0], [$invoice->subtotal_cents, $invoice->tax_cents, $invoice->total_cents, $invoice->paid_cents]);
        $this->assertSame('MANTIS Rugby League', $invoice->snapshot['customer']['name']);
        $this->assertSame('20 jerseys · 20 shorts', $invoice->snapshot['order']['summary']);
        $this->assertSame('full', $invoice->snapshot['payment_rule']['rule']);
        $this->assertNotNull($invoice->issued_at);
        $this->assertSame(now()->addDays(14)->toDateString(), $invoice->due_at->toDateString());

        // The order card's summary.
        $summary = Invoice::summary($invoice->order->invoice);
        $this->assertSame(['INV-1001', 'awaiting_payment', 'Awaiting payment', 'amber', '1870.00', true, false], [$summary['invoice_number'], $summary['status'],
            $summary['label'], $summary['tone'], $summary['amount_due'], $summary['can_pay'], $summary['production_ready']]);
        $this->assertStringEndsWith('/invoices/INV-1001', $summary['pay_url']);
        $this->assertSame('/invoices/INV-1001/pdf', $summary['pdf']);

        // The email: the pay link and the PDF attached.
        Notification::assertSentTo($customer, InvoiceIssued::class, function (InvoiceIssued $notification) use ($customer) {
            $mail = $notification->toMail($customer);

            return $mail->actionUrl === url('/invoices/INV-1001') && str_contains($mail->subject, 'INV-1001')
                && $mail->rawAttachments[0]['name'] === 'INV-1001.pdf' && str_starts_with($mail->rawAttachments[0]['data'], '%PDF-');
        });
        $this->assertNotNull($invoice->fresh()->emailed_at);
        // In the customer's order history (R5), without a second email from the order updates.
        $entry = $invoice->order->updates()->where('kind', 'payment')->first();
        $this->assertSame(['customer', 'Invoice INV-1001 issued: AUD $1,870.00.'], [$entry->visibility, $entry->text()]);
        Notification::assertNotSentTo($customer, \App\Notifications\OrderUpdateNotification::class);
        // Once per order: the same event again changes nothing.
        $this->submit($invoice->order);
        $this->assertSame(1, Invoice::count());
    }

    public function test_the_email_is_sent_after_the_response(): void
    {
        Bus::fake();
        $invoice = $this->issuedInvoice();
        Bus::assertDispatchedAfterResponse(SendBillingEmail::class, fn (SendBillingEmail $job) => $job->invoiceId === $invoice->id && $job->type === 'invoice');
    }

    public function test_an_unpriced_order_waits_for_staff_who_price_and_issue_it(): void
    {
        Notification::fake();
        $this->priceList();
        $customer = $this->customer();
        $order = $this->formOrder($customer, [['garment' => 'jersey', 'sizes' => ['M' => 10]], ['garment' => 'hoodie', 'sizes' => ['L' => 5]]]);
        $invoice = $this->submit($order);

        $this->assertSame(['quote_required', null], [$invoice->status, $invoice->number]);
        $summary = Invoice::summary($invoice);
        $this->assertSame(['quote_required', 'Quote required', null, false], [$summary['status'], $summary['label'], $summary['pay_url'], $summary['can_pay']]);
        $this->assertSame('garment_unpriced', $summary['reasons'][0]['code']);
        Notification::assertNothingSent();

        Sanctum::actingAs($this->admin());
        $this->getJson('/api/v1/admin/invoices?status=quote_required')->assertOk()->assertJsonPath('data.total', 1);
        $this->getJson("/api/v1/admin/orders/{$order->id}/billing")->assertOk()->assertJsonPath('data.quote.status', 'quote_required');
        // Still unpriced: refused with the reason.
        $this->postJson("/api/v1/admin/orders/{$order->id}/invoice", [])->assertUnprocessable()->assertJsonValidationErrors('prices');
        // 10 x 50 + 5 x 45 = 725, shipping 100 -> 825, GST 82.50.
        $this->postJson("/api/v1/admin/orders/{$order->id}/billing/preview", ['lines' => ['item-1' => '45.00']])->assertOk()->assertJsonPath('data.total', '907.50');
        // 10 x 50 + 5 x 45 = 725, an added design fee 50, shipping 100 -> 875, GST 87.50.
        $issued = $this->postJson("/api/v1/admin/orders/{$order->id}/invoice", [
            'lines' => ['item-1' => '45.00'], 'custom_lines' => [['name' => 'Design fee', 'quantity' => 1, 'unit_price' => '50.00']], 'notes' => 'Hoodies priced by our team.',
        ])->assertCreated()->json('data');
        $this->assertSame(['INV-1001', 'awaiting_payment', '962.50'], [$issued['number'], $issued['status'], $issued['total']]);
        $this->assertSame($invoice->id, $issued['id']);
        Notification::assertSentTo($customer, InvoiceIssued::class);
        // Issued once: a second time is refused.
        $this->postJson("/api/v1/admin/orders/{$order->id}/invoice", ['lines' => ['item-1' => '45.00']])->assertStatus(409);
    }

    public function test_invoice_numbers_are_unique_even_when_two_requests_race(): void
    {
        $this->priceList();
        $first = $this->submit($this->formOrder($this->customer()));
        $this->assertSame('INV-1001', $first->number);

        // The database refuses a second INV-1001 outright.
        try {
            DB::table('invoices')->insert(['number' => 'INV-1001', 'sequence' => 1001, 'status' => 'awaiting_payment', 'currency' => 'AUD', 'created_at' => now(), 'updated_at' => now()]);
            $this->fail('A duplicate invoice number was saved.');
        } catch (UniqueConstraintViolationException) {
            $this->assertSame(1, Invoice::count());
        }

        // Another request took 1001 at the same moment: this one sees it taken and moves on to 1002.
        $service = Mockery::mock(InvoiceService::class, [app(PricingService::class)])->makePartial()->shouldAllowMockingProtectedMethods();
        $service->shouldReceive('nextSequence')->twice()->andReturn(1001, 1002);
        $this->app->instance(InvoiceService::class, $service);
        $second = $this->submit($this->formOrder($this->customer('Second Club')));
        $this->assertSame('INV-1002', $second->number);
        $this->assertSame(['INV-1001', 'INV-1002'], Invoice::orderBy('id')->pluck('number')->all());

        // The admin's starting number.
        $this->app->forgetInstance(InvoiceService::class);
        BillingSettings::save(['invoice_start' => 5000]);
        $this->assertSame('INV-5000', $this->submit($this->formOrder($this->customer('Third Club')))->number);
    }

    public function test_the_invoice_keeps_the_agreed_prices_when_prices_change_later(): void
    {
        $customer = $this->customer();
        $invoice = $this->issuedInvoice($customer);
        PriceRule::query()->where('code', 'jersey')->update(['amount_cents' => 9900]);
        PriceRule::query()->where('code', 'AU')->update(['amount_cents' => 50]);
        BillingSettings::save(['business_name' => 'Renamed Pty Ltd', 'tax_rate' => '15', 'payment_rule' => 'none']);

        Sanctum::actingAs($customer);
        $data = $this->getJson('/api/v1/invoices/INV-1001')->assertOk()->json('data');
        $this->assertSame(['1870.00', '1700.00', '170.00', '50.00', '100.00'], [$data['total'], $data['quote']['subtotal'], $data['quote']['tax']['amount'],
            $data['quote']['lines'][0]['unit_price'], $data['quote']['shipping']['amount']]);
        $this->assertSame('3DEEZI', $data['seller']['name']);
        $this->assertSame('full', $data['payment_rule']['rule']);
        $this->assertSame(187000, $invoice->fresh()->total_cents);
        // A new order uses the new prices: 20 x 99 + 20 x 30 + 0.50 shipping = 2580.50, 15% GST 387.08 (half up).
        $this->assertSame(296758, $this->submit($this->formOrder($customer))->total_cents);
    }

    public function test_the_pdf_is_made_for_the_owner_and_staff(): void
    {
        $customer = $this->customer();
        $this->issuedInvoice($customer);
        // A logo with transparency (PNG) on the invoice.
        $admin = $this->admin();
        Sanctum::actingAs($admin);
        $png = imagecreatetruecolor(120, 40);
        imagesavealpha($png, true);
        imagefill($png, 0, 0, imagecolorallocatealpha($png, 0, 0, 0, 127));
        imagefilledrectangle($png, 10, 10, 110, 30, imagecolorallocate($png, 0, 200, 230));
        ob_start();
        imagepng($png);
        $file = \Illuminate\Http\UploadedFile::fake()->createWithContent('logo.png', (string) ob_get_clean());
        $this->post('/api/v1/admin/pricing/logo', ['logo' => $file], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('data.settings.logo', 'billing/logo.jpg');

        Sanctum::actingAs($customer);
        $response = $this->get('/api/v1/invoices/INV-1001/pdf')->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $pdf = $response->getContent();
        $this->assertStringStartsWith('%PDF-1.4', $pdf);
        $this->assertStringContainsString('/Title (Invoice INV-1001)', $pdf);
        $this->assertStringContainsString('/Subtype /Image', $pdf);
        $this->assertStringEndsWith("%%EOF\n", $pdf);
        $this->assertStringContainsString('attachment; filename="INV-1001.pdf"', $response->headers->get('Content-Disposition'));
        // The cross-reference table points at each object.
        preg_match('/startxref\n(\d+)/', $pdf, $m);
        $this->assertSame('xref', substr($pdf, (int) $m[1], 4));

        Sanctum::actingAs($admin);
        $this->get('/api/v1/admin/invoices/'.Invoice::first()->id.'/pdf')->assertOk()->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_customers_only_see_and_pay_their_own_invoices(): void
    {
        $owner = $this->customer();
        $invoice = $this->issuedInvoice($owner);

        $this->getJson('/api/v1/invoices/INV-1001')->assertUnauthorized();
        Sanctum::actingAs($this->customer('Someone Else'));
        $this->getJson('/api/v1/invoices/INV-1001')->assertNotFound();
        $this->get('/api/v1/invoices/INV-1001/pdf', ['Accept' => 'application/json'])->assertNotFound();
        $this->postJson('/api/v1/invoices/INV-1001/pay')->assertNotFound();
        $this->postJson('/api/v1/invoices/INV-1001/link')->assertNotFound();
        $this->getJson('/api/v1/invoices')->assertOk()->assertJsonCount(0, 'data');

        Sanctum::actingAs($owner);
        $this->getJson('/api/v1/invoices')->assertOk()->assertJsonPath('data.0.invoice_number', 'INV-1001');
        $this->getJson('/api/v1/invoices/inv-1001')->assertOk()->assertJsonPath('data.viewer', 'owner')->assertJsonPath('data.order.summary', '20 jerseys · 20 shorts');
        $link = $this->postJson('/api/v1/invoices/INV-1001/link')->assertOk()->json('data.url');

        // Staff may look, not pay.
        Sanctum::actingAs($this->admin());
        $this->getJson('/api/v1/invoices/INV-1001')->assertOk()->assertJsonPath('data.viewer', 'staff');
        $this->postJson('/api/v1/invoices/INV-1001/pay')->assertForbidden();

        // The app's signed link works signed out, for this invoice only, until it expires.
        $this->app['auth']->forgetGuards();
        $key = substr($link, strpos($link, 'key=') + 4);
        $this->getJson('/api/v1/invoices/INV-1001?key='.$key)->assertOk()->assertJsonPath('data.viewer', 'link');
        $this->getJson('/api/v1/invoices/INV-1001?key='.substr($key, 0, -1).'0')->assertNotFound();
        $other = $this->submit($this->formOrder($this->customer('Other Club')));
        $this->getJson('/api/v1/invoices/'.$other->number.'?key='.$key)->assertNotFound();
        $this->travel(3)->hours();
        $this->getJson('/api/v1/invoices/INV-1001?key='.$key)->assertNotFound();
        $this->assertSame($owner->id, $invoice->user_id);
    }

    public function test_only_admins_change_prices_and_invoice_settings(): void
    {
        $this->getJson('/api/v1/admin/pricing')->assertUnauthorized();
        Sanctum::actingAs($this->customer());
        $this->getJson('/api/v1/admin/pricing')->assertForbidden();
        $this->putJson('/api/v1/admin/pricing/settings', ['business_name' => 'Hacked'])->assertForbidden();
        $this->postJson('/api/v1/admin/pricing/rules', ['kind' => 'garment', 'code' => 'jersey', 'price' => '1.00'])->assertForbidden();
        $this->getJson('/api/v1/admin/invoices')->assertForbidden();

        Sanctum::actingAs($this->admin());
        $state = $this->getJson('/api/v1/admin/pricing')->assertOk()->json('data');
        $this->assertSame(['full', 'test'], [$state['settings']['payment_rule'], $state['gateway']['mode']]);
        $this->assertStringEndsWith('/api/v1/payments/stripe/webhook', $state['gateway']['webhook_url']);

        $rule = $this->postJson('/api/v1/admin/pricing/rules', ['kind' => 'garment', 'code' => 'jersey', 'price' => '50'])->assertCreated()->json('data');
        $this->assertSame(['Jersey', '50.00', null], [$rule['name'], $rule['price'], $rule['sport']]);
        $this->postJson('/api/v1/admin/pricing/rules', ['kind' => 'garment', 'code' => 'jersey', 'price' => '60'])->assertUnprocessable()->assertJsonValidationErrors('code');
        $this->postJson('/api/v1/admin/pricing/rules', ['kind' => 'garment', 'code' => 'jersey', 'sport' => 'rugby-league', 'price' => '55'])->assertCreated();
        $this->postJson('/api/v1/admin/pricing/rules', ['kind' => 'extra', 'code' => 'Names_Numbers', 'name' => 'Names & numbers', 'unit' => 'player', 'auto' => true, 'price' => '5'])
            ->assertCreated()->assertJsonPath('data.code', 'names_numbers');
        $this->postJson('/api/v1/admin/pricing/rules', ['kind' => 'shipping', 'code' => 'nz', 'name' => 'New Zealand', 'price' => '60', 'per_item' => '2', 'taxable' => false])
            ->assertCreated()->assertJsonPath('data.code', 'NZ')->assertJsonPath('data.taxable', false);
        $this->postJson('/api/v1/admin/pricing/rules', ['kind' => 'discount', 'name' => 'Nothing off'])->assertUnprocessable()->assertJsonValidationErrors('percent');
        $this->postJson('/api/v1/admin/pricing/rules', ['kind' => 'garment', 'code' => 'spaceship', 'price' => '5'])->assertUnprocessable();
        $this->patchJson("/api/v1/admin/pricing/rules/{$rule['id']}", ['code' => 'jersey', 'price' => '52.50', 'active' => false])->assertOk()->assertJsonPath('data.price', '52.50');
        $this->deleteJson("/api/v1/admin/pricing/rules/{$rule['id']}")->assertOk();

        $settings = ['business_name' => '3DEEZI Pty Ltd', 'abn' => '12 345 678 901', 'address' => '1 Test St, Sydney NSW 2000', 'email' => 'accounts@3deezi.test',
            'phone' => '', 'website' => '', 'currency' => 'AUD', 'tax_name' => 'GST', 'tax_rate' => '10', 'default_destination' => 'au', 'invoice_start' => 1048,
            'due_days' => 7, 'invoice_note' => 'Artwork approval is required before production.', 'bank_details' => 'BSB 000-000 Account 12345678',
            'payment_rule' => 'deposit', 'deposit_percent' => 30];
        $saved = $this->putJson('/api/v1/admin/pricing/settings', $settings)->assertOk()->json('data.settings');
        $this->assertSame(['3DEEZI Pty Ltd', 'AU', 1048, 'deposit', 30], [$saved['business_name'], $saved['default_destination'], $saved['invoice_start'], $saved['payment_rule'], $saved['deposit_percent']]);
        $this->putJson('/api/v1/admin/pricing/settings', ['abn' => 'ABC'] + $settings)->assertUnprocessable()->assertJsonValidationErrors('abn');
        $this->putJson('/api/v1/admin/pricing/settings', ['payment_rule' => 'sometimes'] + $settings)->assertUnprocessable();
    }

    public function test_staff_mark_paid_resend_refund_and_cancel(): void
    {
        Notification::fake();
        $customer = $this->customer();
        $invoice = $this->issuedInvoice($customer);
        Sanctum::actingAs($this->admin());

        $this->postJson("/api/v1/admin/invoices/{$invoice->id}/resend")->assertOk()->assertJsonPath('data.message', 'Invoice emailed to the customer.');
        Notification::assertSentToTimes($customer, InvoiceIssued::class, 2);
        $this->postJson("/api/v1/admin/invoices/{$invoice->id}/mark-paid", ['method' => 'bank_transfer', 'amount' => '2000.00'])->assertUnprocessable();
        $paid = $this->postJson("/api/v1/admin/invoices/{$invoice->id}/mark-paid", ['method' => 'bank_transfer', 'reference' => 'NAB 7781'])->assertOk()->json('data');
        $this->assertSame(['paid', '1870.00', '0.00', 'manual', 'bank_transfer', 'NAB 7781', 'Staff Member'], [$paid['status'], $paid['amount_paid'], $paid['amount_due'],
            $paid['payments'][0]['provider'], $paid['payments'][0]['method'], $paid['payments'][0]['reference'], $paid['payments'][0]['by']]);
        Notification::assertSentTo($customer, \App\Notifications\PaymentReceived::class);
        $this->assertTrue($invoice->order->fresh()->isPaidInFull());
        $this->assertNull(PaymentRules::productionWarning($invoice->order));

        $this->postJson("/api/v1/admin/invoices/{$invoice->id}/cancel")->assertStatus(409);
        $this->postJson("/api/v1/admin/invoices/{$invoice->id}/refund", ['note' => 'Club folded.'])->assertOk()->assertJsonPath('data.status', 'refunded');
        $this->assertFalse($invoice->order->fresh()->isPaidInFull());
        $this->postJson("/api/v1/admin/invoices/{$invoice->id}/refund")->assertStatus(409);

        // An unpaid invoice is cancelled; so is one whose order is cancelled.
        $second = $this->submit($this->formOrder($customer));
        $this->postJson("/api/v1/admin/invoices/{$second->id}/cancel", ['note' => 'Duplicate order.'])->assertOk()->assertJsonPath('data.status', 'cancelled');
        $third = $this->submit($this->formOrder($customer));
        $third->order->update(['status' => 'cancelled']);
        $this->assertSame('cancelled', $third->fresh()->status);
    }

    public function test_the_rule_before_production_paid_in_full_by_default(): void
    {
        $customer = $this->customer();
        $invoice = $this->issuedInvoice($customer);
        $order = $invoice->order;
        $this->assertSame('Invoice INV-1001 is not paid in full yet.', PaymentRules::productionWarning($order));
        $this->assertFalse($order->isPaidInFull());
        $unpriced = $this->formOrder($customer, [['garment' => 'hoodie', 'sizes' => ['M' => 2]]]);
        $this->submit($unpriced);
        $this->assertStringStartsWith('This order has no invoice yet', PaymentRules::productionWarning($unpriced));

        // With a 30% deposit rule (for invoices issued from then on).
        BillingSettings::save(['payment_rule' => 'deposit', 'deposit_percent' => 30]);
        $deposit = $this->submit($this->formOrder($customer));
        $this->assertSame('561.00', Invoice::summary($deposit)['deposit_due']);
        $this->assertSame('The 30% deposit for invoice INV-1002 is not paid yet.', PaymentRules::productionWarning($deposit->order));
        // No rule at all.
        BillingSettings::save(['payment_rule' => 'none']);
        $this->assertNull(PaymentRules::productionWarning($this->submit($this->formOrder($customer))->order));
    }
}
