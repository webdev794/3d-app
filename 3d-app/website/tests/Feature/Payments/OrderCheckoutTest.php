<?php

namespace Tests\Feature\Payments;

use App\Models\Invoice;
use App\Models\TeamRequest;
use App\Models\User;
use App\Notifications\InvoiceIssued;
use App\Services\Payments\PayLink;
use App\Services\Pricing\BillingSettings;
use App\Services\Team\TeamPlans;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * COMPLETE YOUR PAYMENT (/orders/3DZ-…/pay) and its Confirmation: the page's data (the order, its invoice and real
 * prices), who may see it, a test-mode payment marking the invoice and the order paid, the billing address (saved
 * and printed under BILL TO), and 3DEEZI TEAM invoices working as before. No real payments, no emails, no network.
 */
class OrderCheckoutTest extends TestCase
{
    use PaymentFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        BillingSettings::flush();
        TeamPlans::flush();
        Notification::fake();
        Bus::withoutDispatchingAfterResponses();
        Http::preventStrayRequests();
    }

    /** An order of 20 jerseys and 20 shorts with its invoice INV-1001 (A$1,870.00), and its customer. */
    private function paidLater(): array
    {
        $customer = $this->customer();
        $invoice = $this->issuedInvoice($customer);

        return [$customer, $invoice, $invoice->order];
    }

    /** The text of a PDF made by App\Services\Pdf\PdfDocument (its page streams are compressed). */
    private function pdfText(string $pdf): string
    {
        preg_match_all('/stream\r?\n(.*?)\r?\nendstream/s', $pdf, $m);

        return implode("\n", array_map(fn ($s) => @gzuncompress($s) ?: $s, $m[1]));
    }

    public function test_the_pay_page_has_the_order_its_invoice_and_the_real_prices(): void
    {
        [$customer, $invoice, $order] = $this->paidLater();
        Sanctum::actingAs($customer);

        $data = $this->getJson("/api/v1/orders/{$order->number}/checkout")->assertOk()->json('data');
        $this->assertSame('owner', $data['viewer']);
        $this->assertSame([$order->id, $order->number, 'MANTIS Rugby League', 'Fabian Soutar', 'fabian@example.com', 'deliver', '/orders?order='.$order->id],
            [$data['order']['id'], $data['order']['number'], $data['order']['name'], $data['order']['contact_name'], $data['order']['contact_email'], $data['order']['delivery'], $data['order']['link']]);
        $this->assertSame(['Jersey', 'Shorts'], array_column($data['items'], 'name'));
        $this->assertSame([20, 20], array_column($data['items'], 'quantity'));
        $this->assertSame(['S' => 4, 'M' => 6, 'L' => 6, 'XL' => 4], $data['items'][0]['sizes']);

        // The invoice as agreed: garments $1,600, shipping $100, GST $170, total $1,870 (AUD).
        $pay = $data['invoice'];
        $this->assertSame(['INV-1001', 'awaiting_payment', 'AUD', true, 'test'], [$pay['number'], $pay['status'], $pay['currency'], $pay['can_pay'], $pay['gateway']['provider']]);
        $this->assertSame(['1600.00', '100.00', '170.00', '1870.00'], [$pay['quote']['garments_total'], $pay['quote']['shipping']['amount'], $pay['quote']['tax']['amount'], $pay['total']]);
        $this->assertSame(['same' => true], $data['billing']);

        // The order's id works too, and the invoice can be named (old pay links and the app's link name it).
        $this->getJson("/api/v1/orders/{$order->id}/checkout?invoice=inv-1001")->assertOk()->assertJsonPath('data.invoice.number', 'INV-1001');
        $this->getJson('/api/v1/orders/3DZ-99999/checkout')->assertNotFound();
    }

    public function test_only_the_owner_the_apps_pay_link_or_staff_see_it(): void
    {
        [, $invoice, $order] = $this->paidLater();
        $url = "/api/v1/orders/{$order->number}/checkout";

        $this->getJson($url)->assertUnauthorized();
        $key = PayLink::make($invoice)['key'];
        $this->getJson($url.'?key='.$key)->assertOk()->assertJsonPath('data.viewer', 'link')->assertJsonPath('data.invoice.number', 'INV-1001');
        $this->getJson($url.'?key=123456789.'.str_repeat('a', 64))->assertNotFound();

        Sanctum::actingAs($this->customer('Someone Else'));
        $this->getJson($url)->assertNotFound();
        Sanctum::actingAs($this->admin());
        $this->getJson($url)->assertOk()->assertJsonPath('data.viewer', 'staff');
        // Staff look only: they never pay or change the billing address for the customer.
        $this->putJson('/api/v1/invoices/INV-1001/billing', ['same' => true])->assertForbidden();
    }

    public function test_a_test_mode_payment_marks_the_invoice_and_the_order_paid_and_the_confirmation_shows_it(): void
    {
        [$customer, $invoice, $order] = $this->paidLater();
        Sanctum::actingAs($customer);

        // Declined first: nothing changes, the customer can try again.
        $payment = $this->postJson('/api/v1/invoices/INV-1001/pay', ['amount' => 'full'])->assertOk()->json('data.payment');
        $this->postJson("/api/v1/payments/{$payment['id']}/test-complete", ['outcome' => 'failed'])->assertOk()->assertJsonPath('data.status', 'awaiting_payment');
        $this->getJson("/api/v1/orders/{$order->number}/checkout")->assertJsonPath('data.invoice.last_attempt.status', 'failed')->assertJsonPath('data.invoice.can_pay', true);

        $payment = $this->postJson('/api/v1/invoices/INV-1001/pay', ['amount' => 'full'])->assertOk()->json('data.payment');
        $this->assertSame(['test', '1870.00'], [$payment['provider'], $payment['amount']]);
        $paid = $this->postJson("/api/v1/payments/{$payment['id']}/test-complete", ['outcome' => 'succeeded'])->assertOk()->json('data');
        $this->assertSame(['paid', '0.00', false], [$paid['status'], $paid['amount_due'], $paid['can_pay']]);

        // The confirmation: paid, with the receipt.
        $page = $this->getJson("/api/v1/orders/{$order->number}/checkout")->assertOk()->json('data');
        $this->assertSame(['paid', 'Paid', 'INV-1001-'.$payment['id'], '1870.00'], [$page['invoice']['status'], $page['invoice']['label'], $page['invoice']['receipt']['number'], $page['invoice']['receipt']['amount']]);
        $this->assertSame('paid', $invoice->fresh()->status);
        $this->assertTrue($order->fresh()->isPaidInFull());

        // My Orders shows it paid (the list and the board's card).
        $mine = collect($this->getJson('/api/v1/orders')->assertOk()->json('data'))->firstWhere('id', $order->id);
        $this->assertSame(['paid', 'Paid'], [$mine['payment']['status'], $mine['payment']['label']]);
        $this->getJson("/api/v1/orders/{$order->id}")->assertOk()->assertJsonPath('data.payment.status', 'paid');

        // Paying again is refused; the receipt went out through a notification (faked here: no real email).
        $this->postJson('/api/v1/invoices/INV-1001/pay')->assertStatus(409);
        $this->putJson('/api/v1/invoices/INV-1001/billing', ['same' => true])->assertStatus(409);
        Notification::assertSentTo($customer, \App\Notifications\PaymentReceived::class);
    }

    public function test_the_apps_pay_link_pays_without_signing_in(): void
    {
        [, , $order] = $this->paidLater();
        $key = PayLink::make(Invoice::query()->firstOrFail())['key'];

        $this->getJson("/api/v1/orders/{$order->number}/checkout?key={$key}")->assertOk()->assertJsonPath('data.invoice.can_pay', true);
        $payment = $this->postJson("/api/v1/invoices/INV-1001/pay?key={$key}")->assertOk()->json('data.payment');
        $this->postJson("/api/v1/payments/{$payment['id']}/test-complete?key={$key}", ['outcome' => 'succeeded'])->assertOk()->assertJsonPath('data.status', 'paid');
        $this->getJson("/api/v1/orders/{$order->number}/checkout?key={$key}")->assertOk()->assertJsonPath('data.invoice.status', 'paid');
    }

    public function test_the_billing_address_is_the_delivery_address_or_one_the_customer_gives(): void
    {
        [$customer, $invoice, $order] = $this->paidLater();
        Sanctum::actingAs($customer);

        $this->putJson('/api/v1/invoices/INV-1001/billing', ['same' => false, 'address' => ['street' => '9 Bill St', 'suburb' => 'Parramatta', 'state' => 'nsw', 'postcode' => '21', 'country' => 'Australia']])
            ->assertStatus(422)->assertJsonValidationErrors(['address.postcode']);
        $this->putJson('/api/v1/invoices/INV-1001/billing', ['same' => false])->assertStatus(422)->assertJsonValidationErrors(['address']);

        $saved = $this->putJson('/api/v1/invoices/INV-1001/billing', ['same' => false, 'name' => 'Accounts Team', 'company' => 'MANTIS Clothing Pty Ltd',
            'address' => ['street' => '9 Bill St', 'suburb' => 'Parramatta', 'state' => 'nsw', 'postcode' => '2150', 'country' => 'Australia']])->assertOk()->json('data');
        $this->assertSame([false, 'Accounts Team', 'MANTIS Clothing Pty Ltd', "9 Bill St\nParramatta NSW 2150\nAustralia"], [$saved['same'], $saved['name'], $saved['company'], $saved['address']]);
        $this->getJson("/api/v1/orders/{$order->number}/checkout")->assertJsonPath('data.billing.address', "9 Bill St\nParramatta NSW 2150\nAustralia");
        // The rest of the invoice as agreed is unchanged.
        $this->assertSame(['1 Park Rd, Sydney NSW 2000', 187000], [$invoice->fresh()->snapshot['customer']['address'], $invoice->fresh()->total_cents]);

        // Printed under BILL TO on the invoice PDF.
        $text = $this->pdfText($this->get('/api/v1/invoices/INV-1001/pdf')->assertOk()->getContent());
        $this->assertStringContainsString('MANTIS Clothing Pty Ltd', $text);
        $this->assertStringContainsString('9 Bill St', $text);

        // Back to the delivery address.
        $this->putJson('/api/v1/invoices/INV-1001/billing', ['same' => true])->assertOk()->assertExactJson(['data' => ['same' => true]]);
        $this->assertArrayNotHasKey('billing', $invoice->fresh()->snapshot);
        $this->assertStringContainsString('1 Park Rd', $this->pdfText($this->get('/api/v1/invoices/INV-1001/pdf')->getContent()));
        // An order's invoice keeps "Garments" (a 3DEEZI TEAM invoice says "Design request": TeamRequestTest).
        $this->assertStringContainsString('Garments', $this->pdfText($this->get('/api/v1/invoices/INV-1001/pdf')->getContent()));
        $this->getJson('/api/v1/invoices/INV-1001')->assertOk()->assertJsonPath('data.order.source', 'order');
    }

    public function test_an_order_without_an_invoice_or_with_a_price_pending_has_nothing_to_pay(): void
    {
        $customer = $this->customer();
        $this->priceList();
        Sanctum::actingAs($customer);

        // Not priced yet (no invoice): the page still opens.
        $plain = $this->formOrder($customer);
        $this->getJson("/api/v1/orders/{$plain->number}/checkout")->assertOk()->assertJsonPath('data.invoice', null)->assertJsonPath('data.billing', null);

        // A garment with no price: "quote required", no number, nothing to pay.
        $custom = $this->submit($this->formOrder($customer, [['garment' => 'other', 'label' => 'Custom bag', 'sizes' => ['M' => 5]]]));
        $page = $this->getJson("/api/v1/orders/{$custom->order->number}/checkout")->assertOk()->json('data');
        $this->assertSame(['quote_required', null, false], [$page['invoice']['status'], $page['invoice']['number'], $page['invoice']['can_pay']]);
        $this->assertNotEmpty($page['invoice']['reasons']);
    }

    public function test_bank_transfer_only_and_stripe_are_told_to_the_page(): void
    {
        [$customer, , $order] = $this->paidLater();
        Sanctum::actingAs($customer);
        BillingSettings::save(['bank_details' => 'BSB 000-000 Account 1234 5678']);
        BillingSettings::flush();

        // No provider keys and test mode off: bank transfer only.
        config(['payments.test_mode' => false]);
        $this->app['env'] = 'production';
        $page = $this->getJson("/api/v1/orders/{$order->number}/checkout")->assertOk()->json('data');
        $this->assertSame(['none', 'BSB 000-000 Account 1234 5678'], [$page['invoice']['gateway']['provider'], $page['invoice']['gateway']['bank_details']]);
        $this->postJson('/api/v1/invoices/INV-1001/pay')->assertStatus(503);

        // Stripe keys (never called here): the page sends the customer on to the invoice page's Stripe card fields.
        config(['payments.stripe.key' => 'pk_test_x', 'payments.stripe.secret' => 'sk_test_x', 'payments.provider' => 'stripe']);
        $this->getJson("/api/v1/orders/{$order->number}/checkout")->assertOk()->assertJsonPath('data.invoice.gateway.provider', 'stripe');
        $this->getJson('/api/v1/invoices/INV-1001')->assertOk()->assertJsonPath('data.gateway.provider', 'stripe')->assertJsonPath('data.order.status', 'pending');
    }

    public function test_a_deposit_then_the_balance_recorded_by_staff(): void
    {
        BillingSettings::save(['payment_rule' => 'deposit', 'deposit_percent' => 50]);
        [$customer, $invoice, $order] = $this->paidLater();
        Sanctum::actingAs($customer);
        $this->getJson("/api/v1/orders/{$order->number}/checkout")->assertJsonPath('data.invoice.deposit_due', '935.00');

        $deposit = $this->postJson('/api/v1/invoices/INV-1001/pay', ['amount' => 'deposit'])->assertOk()->json('data.payment');
        $this->postJson("/api/v1/payments/{$deposit['id']}/test-complete", ['outcome' => 'succeeded'])->assertOk()->assertJsonPath('data.status', 'part_paid');
        $page = $this->getJson("/api/v1/orders/{$order->number}/checkout")->json('data.invoice');
        $this->assertSame(['part_paid', '935.00', '935.00', true, null], [$page['status'], $page['amount_paid'], $page['amount_due'], $page['can_pay'], $page['deposit_due']]);

        // Staff record the rest as a bank transfer: paid in full, also on the staff order board.
        Sanctum::actingAs($this->admin());
        $this->postJson("/api/v1/admin/invoices/{$invoice->id}/mark-paid", ['method' => 'bank_transfer', 'reference' => 'EFT 42', 'amount' => '935.00'])->assertOk();
        $this->assertSame('paid', $invoice->fresh()->status);
        $board = json_encode($this->getJson('/api/v1/admin/orders/board')->assertOk()->json('data'));
        $this->assertStringContainsString('"invoice_number":"INV-1001","status":"paid"', $board);
        Sanctum::actingAs($customer);
        $this->getJson("/api/v1/orders/{$order->number}/checkout")->assertJsonPath('data.invoice.status', 'paid')->assertJsonPath('data.invoice.receipt.method', 'bank_transfer');
    }

    public function test_paying_leaves_a_notification_that_opens_the_invoice_link(): void
    {
        [$customer, , $order] = $this->paidLater();
        Sanctum::actingAs($customer);
        $payment = $this->postJson('/api/v1/invoices/INV-1001/pay')->json('data.payment');
        $this->postJson("/api/v1/payments/{$payment['id']}/test-complete", ['outcome' => 'succeeded'])->assertOk();
        $note = (new \App\Notifications\PaymentReceived($order->invoice()->first(), \App\Models\Payment::query()->findOrFail($payment['id'])))->toArray($customer);
        $this->assertSame(['payment', '/invoices/INV-1001'], [$note['kind'], $note['link']]);
    }

    public function test_orders_from_a_saved_design_show_its_picture(): void
    {
        $customer = $this->customer();
        $this->priceList();
        $project = $customer->projects()->create(['name' => 'MANTIS 86', 'sport' => 'basketball', 'garment' => 'fullkit', 'mode' => 'dyo', 'status' => 'approved',
            'design' => ['main' => '#111111', 'secondary' => '#00d9ed'], 'thumbnail' => 'data:image/png;base64,iVBORw0KGgo=', 'version' => 1]);
        // "Order this kit" in the Studio: the kit with its sizes.
        $kit = new \App\Models\Order(['user_id' => $customer->id, 'project_id' => $project->id, 'source' => 'studio', 'contact_name' => 'Fabian Soutar', 'sizes' => ['M' => 10, 'L' => 5]]);
        $kit->save();
        // The Create Order Form with a row from the saved design.
        $form = $this->formOrder($customer, [['garment' => 'jersey', 'project_id' => $project->id, 'sizes' => ['M' => 3]], ['garment' => 'shorts', 'sizes' => ['M' => 3]]]);
        Sanctum::actingAs($customer);

        $studio = $this->getJson("/api/v1/orders/{$kit->number}/checkout")->assertOk()->json('data');
        $this->assertSame(['Jersey', 'Shorts'], array_column($studio['items'], 'name'));
        $this->assertSame($project->thumbnail, $studio['items'][0]['thumbnail']);
        $this->assertSame(['M' => 10, 'L' => 5], $studio['items'][0]['sizes']);
        $this->assertSame([$project->id], array_column($studio['projects'], 'id'));

        $rows = $this->getJson("/api/v1/orders/{$form->number}/checkout")->assertOk()->json('data');
        $this->assertSame([$project->thumbnail, null], array_column($rows['items'], 'thumbnail'));
        $this->assertSame('#00d9ed', $rows['projects'][0]['design']['secondary']);
    }

    public function test_team_invoices_work_as_before_and_reach_the_team_bell(): void
    {
        $customer = User::factory()->create();
        Sanctum::actingAs($customer);
        $request = $this->post('/api/v1/team/requests', ['name' => 'Northside Hawks', 'email' => 'coach@example.com', 'sport' => 'rugby-league', 'garment' => 'jersey',
            'category' => 'Teamwear', 'description' => 'A bold navy and gold jersey with a hawk across the chest.', 'colours' => ['navy', '#ffcc00']], ['Accept' => 'application/json'])
            ->assertCreated()->json('data');
        $invoice = Invoice::query()->where('team_request_id', $request['id'])->firstOrFail();

        // The Review & Pay page (/invoices/INV-…) shows it with no order, and test mode pays it as before.
        $page = $this->getJson("/api/v1/invoices/{$invoice->number}")->assertOk()->json('data');
        $this->assertSame([null, null], [$page['order']['id'], $page['order']['status']]);
        $payment = $this->postJson("/api/v1/invoices/{$invoice->number}/pay")->assertOk()->json('data.payment');
        $this->postJson("/api/v1/payments/{$payment['id']}/test-complete", ['outcome' => 'succeeded'])->assertOk()->assertJsonPath('data.status', 'paid');

        // Its notification names the TEAM request, from the snapshot, else from the request itself.
        $team = TeamRequest::query()->findOrFail($request['id']);
        $note = (new InvoiceIssued($invoice->fresh()))->toArray($customer);
        $this->assertSame([$team->id, null, $team->number, 'invoice'], [$note['team_request_id'], $note['order_id'], $note['number'], $note['kind']]);
        $bare = $invoice->fresh();
        $bare->snapshot = array_merge($bare->snapshot, ['order' => []]);
        $note = (new InvoiceIssued($bare))->toArray($customer);
        $this->assertSame([$team->id, $team->number, $team->name], [$note['team_request_id'], $note['number'], $note['name']]);
        // An order's invoice has none.
        [, $orderInvoice] = $this->paidLater();
        $this->assertNull((new InvoiceIssued($orderInvoice))->toArray($customer)['team_request_id']);
    }
}
