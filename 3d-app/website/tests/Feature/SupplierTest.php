<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\Order;
use App\Models\Supplier;
use App\Models\User;
use App\Services\Pricing\BillingSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use App\Notifications\InvoiceIssued;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Payments\PaymentFixtures;
use Tests\TestCase;

/**
 * Preferred suppliers (task 9.118): the owner's own makers (3DEEZI, Mantis), "Become a preferred supplier" with its
 * listing invoice paid on the usual pay page, Admin > Suppliers, and "Made by" on orders, invoices and the admin lists.
 */
class SupplierTest extends TestCase
{
    use PaymentFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Supplier::forget();
        BillingSettings::flush();
        Bus::withoutDispatchingAfterResponses();
        Storage::fake('local');
    }

    private function makers(): array
    {
        return Supplier::query()->pluck('id', 'slug')->all();
    }

    /** The order form's fields (a delivered order of 12 jerseys). */
    private function form(array $more = []): array
    {
        return [
            'source' => 'form', 'contact_name' => 'Fabian Soutar', 'contact_email' => 'fabian@example.com', 'team_name' => 'Brisbane Bears', 'phone' => '0412 345 678',
            'needed_by' => now()->addWeeks(8)->toDateString(), 'delivery' => 'deliver',
            'address' => ['street' => '12 Smith Street', 'suburb' => 'Brisbane', 'state' => 'QLD', 'postcode' => '4000', 'country' => 'Australia'],
            'items' => [['garment' => 'jersey', 'fit' => 'mens', 'sizes' => ['M' => 6, 'L' => 6]]],
        ] + $more;
    }

    private function apply(User $user, array $more = []): array
    {
        Sanctum::actingAs($user);

        return $this->post('/api/v1/suppliers/apply', array_filter(array_merge([
            'company' => 'Acme Teamwear', 'contact_name' => 'Ana Lee', 'email' => 'ana@acme.test', 'phone' => '0400 111 222', 'website' => 'acme.test',
            'makes' => 'Sublimated jerseys and shorts', 'location' => 'Gold Coast, QLD', 'message' => 'We make 2,000 kits a year.', 'plan' => 'monthly',
            'logo' => UploadedFile::fake()->image('acme.png', 300, 120),
        ], $more), fn ($v) => $v !== null), ['Accept' => 'application/json'])->assertCreated()->json('data');
    }

    public function test_the_owners_own_makers_are_built_in_and_offered_on_the_order_form(): void
    {
        $makers = $this->makers();
        $this->assertSame(['3deezi', 'mantis'], array_keys($makers));
        $options = $this->getJson('/api/v1/orders/options')->assertOk()->json('data');
        $this->assertSame(['3DEEZI', 'Mantis'], array_column($options['suppliers'], 'name'));
        $this->assertSame($makers['3deezi'], $options['default_supplier_id']);
        $this->assertTrue($options['suppliers'][0]['default'] && $options['suppliers'][1]['owner']);

        // The page lists Mantis (3DEEZI is the site itself) and the listing prices (A$49 a month, A$490 a year, incl. GST).
        $page = $this->getJson('/api/v1/suppliers')->assertOk()->json('data');
        $this->assertSame(['Mantis'], array_column($page['suppliers'], 'name'));
        $this->assertSame(['49.00', '490.00', 'A$49.00', 'A$490.00', true], [$page['prices']['monthly'], $page['prices']['yearly'], $page['prices']['monthly_text'], $page['prices']['yearly_text'], $page['prices']['tax_included']]);
    }

    public function test_a_supplier_applies_pays_its_listing_and_shows_once_approved(): void
    {
        $this->postJson('/api/v1/suppliers/apply', ['company' => 'Acme'])->assertUnauthorized();
        $user = $this->customer('Ana Lee');
        Sanctum::actingAs($user);
        $this->postJson('/api/v1/suppliers/apply', ['company' => 'Acme', 'plan' => 'weekly'])->assertUnprocessable()
            ->assertJsonValidationErrors(['contact_name', 'email', 'makes', 'location', 'plan']);

        $applied = $this->apply($user);
        $this->assertSame(['Acme Teamwear', 'applied', false, 'monthly', 'https://acme.test'], [$applied['name'], $applied['status'], $applied['listed'], $applied['plan'], $applied['website']]);
        $this->assertNotNull($applied['logo_url']);
        $number = $applied['invoice']['invoice_number'];
        $this->assertSame(["/invoices/{$number}", '49.00', 'awaiting_payment'], [$applied['pay_path'], $applied['invoice']['total'], $applied['invoice']['status']]);
        $invoice = Invoice::where('number', $number)->firstOrFail();
        $this->assertSame([null, $user->id, 4900, 445, 'supplier'], [$invoice->order_id, $invoice->user_id, $invoice->total_cents, $invoice->tax_cents, $invoice->snapshot['order']['source']]);
        $this->assertStringContainsString('Preferred supplier listing · Acme Teamwear · one month', $invoice->quote['lines'][0]['name']);
        // One listing per account.
        $this->post('/api/v1/suppliers/apply', ['company' => 'Again', 'contact_name' => 'A', 'email' => 'a@a.test', 'makes' => 'x', 'location' => 'y', 'plan' => 'yearly'], ['Accept' => 'application/json'])->assertStatus(409);

        // Not on the page or the order form until approved.
        $this->assertSame(['Mantis'], array_column($this->getJson('/api/v1/suppliers')->json('data.suppliers'), 'name'));
        $this->assertSame(['3DEEZI', 'Mantis'], array_column($this->getJson('/api/v1/orders/options')->json('data.suppliers'), 'name'));
        $this->getJson('/api/v1/suppliers/mine')->assertOk()->assertJsonPath('data.status', 'applied')->assertJsonPath('data.reference', 'SUP-'.str_pad((string) $applied['id'], 4, '0', STR_PAD_LEFT));

        // The usual pay page and invoice PDF; paid in test mode, the listing is paid for a month.
        $this->getJson("/api/v1/invoices/{$number}")->assertOk()->assertJsonPath('data.order.source', 'supplier')->assertJsonPath('data.order.summary', 'Monthly listing');
        $this->assertSame('supplier', collect($this->getJson('/api/v1/invoices')->json('data'))->firstWhere('invoice_number', $number)['order']['source']);
        $this->get("/api/v1/invoices/{$number}/pdf")->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $payment = $this->postJson("/api/v1/invoices/{$number}/pay")->assertOk()->json('data.payment');
        $this->postJson("/api/v1/payments/{$payment['id']}/test-complete", ['outcome' => 'succeeded'])->assertOk()->assertJsonPath('data.status', 'paid');
        $supplier = Supplier::findOrFail($applied['id']);
        $this->assertSame(now()->startOfDay()->addMonthNoOverflow()->toDateString(), $supplier->paid_until->toDateString());
        $this->assertSame('applied', $supplier->status);
        // Paying again for a year adds a year on top.
        $renewed = $this->postJson('/api/v1/suppliers/mine/renew', ['plan' => 'yearly'])->assertOk()->json('data');
        $this->assertSame(['490.00', 'yearly'], [$renewed['invoice']['total'], $renewed['plan']]);
        $payment = $this->postJson("/api/v1/invoices/{$renewed['invoice']['invoice_number']}/pay")->assertOk()->json('data.payment');
        $this->postJson("/api/v1/payments/{$payment['id']}/test-complete", ['outcome' => 'succeeded'])->assertOk();
        $this->assertSame(now()->startOfDay()->addMonthNoOverflow()->addYearNoOverflow()->toDateString(), $supplier->refresh()->paid_until->toDateString());

        // The admin approves it: on the page and in the order form's choice, with its logo.
        $admin = $this->admin();
        Sanctum::actingAs($admin);
        $list = $this->getJson('/api/v1/admin/suppliers')->assertOk()->json('data');
        $row = collect($list['suppliers'])->firstWhere('id', $applied['id']);
        $this->assertSame(['applied', 'paid', 'ana@acme.test', $user->id], [$row['status'], $row['invoice']['status'], $row['email'], $row['account']['id']]);
        $this->assertSame(1, $list['counts']['applied']);
        $this->patchJson("/api/v1/admin/suppliers/{$applied['id']}", ['status' => 'approved'])->assertOk()->assertJsonPath('data.listed', true);
        $this->assertSame(['Mantis', 'Acme Teamwear'], array_column($this->getJson('/api/v1/suppliers')->json('data.suppliers'), 'name'));
        $this->assertSame(['3DEEZI', 'Mantis', 'Acme Teamwear'], array_column($this->getJson('/api/v1/orders/options')->json('data.suppliers'), 'name'));
        $this->get("/api/v1/suppliers/{$applied['id']}/logo")->assertOk()->assertHeader('Content-Type', 'image/png');
        // Admin > Invoices shows the listing's reference.
        $this->assertSame('supplier', collect($this->getJson('/api/v1/admin/invoices')->json('data.data'))->firstWhere('invoice_number', $number)['order']['source']);

        // A lapsed listing leaves the page by itself; hidden ones too.
        $supplier->forceFill(['paid_until' => now()->subDay()->toDateString()])->save();
        $this->assertSame(['Mantis'], array_column($this->getJson('/api/v1/suppliers')->json('data.suppliers'), 'name'));
        $this->patchJson("/api/v1/admin/suppliers/{$applied['id']}", ['paid_until' => now()->addMonth()->toDateString(), 'status' => 'hidden'])->assertOk();
        $this->assertSame(['3DEEZI', 'Mantis'], array_column($this->getJson('/api/v1/orders/options')->json('data.suppliers'), 'name'));
    }

    public function test_orders_keep_who_makes_them_on_the_review_invoice_and_admin_lists(): void
    {
        $this->priceList();
        $makers = $this->makers();
        $outside = new Supplier(['name' => 'Acme Teamwear', 'status' => 'approved', 'makes' => 'Jerseys', 'location' => 'Gold Coast']);
        $outside->save();
        $applied = new Supplier(['name' => 'Waiting Co', 'status' => 'applied']);
        $applied->save();
        $customer = $this->customer();
        Sanctum::actingAs($customer);

        // No choice: 3DEEZI. Mantis and an approved supplier are kept by id and name; an unapproved one is refused.
        $plain = $this->postJson('/api/v1/orders', $this->form(), ['Idempotency-Key' => 'made-by-none'])->assertCreated()->json('data');
        $this->assertSame(['3DEEZI', $makers['3deezi']], [$plain['made_by'], $plain['supplier_id']]);
        $mantis = $this->postJson('/api/v1/orders', $this->form(['supplier_id' => $makers['mantis']]), ['Idempotency-Key' => 'made-by-mantis'])->assertCreated()->json('data');
        $this->assertSame('Mantis', $mantis['made_by']);
        $acme = $this->postJson('/api/v1/orders', $this->form(['supplier_id' => $outside->id]), ['Idempotency-Key' => 'made-by-acme'])->assertCreated()->json('data');
        $this->assertSame(['Acme Teamwear', $outside->id], [$acme['made_by'], $acme['supplier_id']]);
        $this->postJson('/api/v1/orders', $this->form(['supplier_id' => $applied->id]), ['Idempotency-Key' => 'made-by-waiting'])->assertUnprocessable()->assertJsonValidationErrors(['supplier_id']);
        $this->postJson('/api/v1/orders', $this->form(['supplier_id' => 99999]), ['Idempotency-Key' => 'made-by-missing'])->assertUnprocessable()->assertJsonValidationErrors(['supplier_id']);

        // A saved draft keeps the choice when it is sent.
        $draft = $this->postJson('/api/v1/order-drafts', ['kind' => 'form', 'data' => $this->form(['supplier_id' => $makers['mantis']])])->assertCreated()->json('data.id');
        $fromDraft = $this->postJson("/api/v1/order-drafts/{$draft}/submit", [], ['Idempotency-Key' => 'made-by-draft'])->assertCreated()->json('data');
        $this->assertSame('Mantis', $fromDraft['made_by']);

        // The invoice (priced at once) says who makes it, on the pay page and in the PDF.
        $invoice = Order::findOrFail($acme['id'])->invoice;
        $this->assertSame('Acme Teamwear', $invoice->snapshot['order']['made_by']);
        $this->getJson("/api/v1/invoices/{$invoice->number}")->assertOk()->assertJsonPath('data.order.made_by', 'Acme Teamwear');
        $pdf = $this->get("/api/v1/invoices/{$invoice->number}/pdf")->assertOk()->getContent();
        preg_match_all('/stream\r?\n(.*?)\r?\nendstream/s', $pdf, $m);
        $text = implode("\n", array_map(fn ($s) => @gzuncompress($s) ?: $s, $m[1]));
        $this->assertStringContainsString('Made by', $text);
        $this->assertStringContainsString('Acme Teamwear', $text);
        // My orders show it too.
        $this->getJson("/api/v1/orders/{$mantis['id']}")->assertOk()->assertJsonPath('data.made_by', 'Mantis');

        // Admin > Orders and the order board filter by it; orders from before the choice count as 3DEEZI's.
        $old = $this->formOrder($customer);
        $this->assertNull($old->refresh()->supplier_id);
        Sanctum::actingAs($this->admin());
        $ids = fn (string $q) => collect($this->getJson('/api/v1/admin/orders?'.$q)->assertOk()->json('data.data'))->pluck('id')->sort()->values()->all();
        $this->assertSame([$mantis['id'], $fromDraft['id']], $ids('supplier='.$makers['mantis']));
        $this->assertSame([$acme['id']], $ids('supplier='.$outside->id));
        $this->assertSame([$plain['id'], $old->id], $ids('supplier=3deezi'));
        $this->assertCount(5, $ids('per_page=50'));
        $board = $this->getJson('/api/v1/admin/orders/board?supplier='.$outside->id)->assertOk()->json('data');
        $cards = collect($board['stages'])->flatMap(fn ($s) => $s['orders']);
        $this->assertSame([[$acme['id'], 'Acme Teamwear']], $cards->map(fn ($c) => [$c['id'], $c['made_by']])->all());
        $this->assertSame('3DEEZI', $this->getJson("/api/v1/admin/orders/{$old->id}")->assertOk()->json('data.made_by'));
        // Staff may pass an order to any supplier (even one not listed yet); it is noted in the history.
        $this->patchJson("/api/v1/admin/orders/{$plain['id']}", ['supplier_id' => $applied->id])->assertOk();
        $this->assertSame(['Waiting Co', $applied->id], [Order::find($plain['id'])->made_by, Order::find($plain['id'])->supplier_id]);
        $this->assertTrue(Order::find($plain['id'])->updates()->where('kind', 'edit')->get()->contains(fn ($u) => in_array('made by', $u->data['fields'] ?? [], true)));
        $this->postJson('/api/v1/admin/orders', ['user_id' => $customer->id, 'contact_name' => 'Staff made', 'sizes' => ['M' => 3], 'supplier_id' => $makers['mantis']])->assertCreated()->assertJsonPath('data.made_by', 'Mantis');
    }

    public function test_admins_manage_suppliers_and_the_listing_prices(): void
    {
        $makers = $this->makers();
        $this->getJson('/api/v1/admin/suppliers')->assertUnauthorized();
        Sanctum::actingAs($this->customer());
        $this->getJson('/api/v1/admin/suppliers')->assertForbidden();
        $this->putJson('/api/v1/admin/suppliers/prices', ['monthly' => 10, 'yearly' => 100])->assertForbidden();

        Sanctum::actingAs($this->admin());
        // 3DEEZI is never hidden; the owner's entries are never deleted.
        $this->patchJson("/api/v1/admin/suppliers/{$makers['3deezi']}", ['status' => 'hidden'])->assertUnprocessable();
        $this->deleteJson("/api/v1/admin/suppliers/{$makers['mantis']}")->assertUnprocessable();
        $this->patchJson("/api/v1/admin/suppliers/{$makers['mantis']}", ['summary' => 'Our manufacturing arm', 'location' => 'Sydney'])->assertOk()->assertJsonPath('data.location', 'Sydney');
        $this->post("/api/v1/admin/suppliers/{$makers['mantis']}/logo", ['logo' => UploadedFile::fake()->image('m.jpg', 200, 200)], ['Accept' => 'application/json'])->assertOk();
        $this->assertNotNull($this->getJson('/api/v1/suppliers')->json('data.suppliers.0.logo_url'));
        $this->deleteJson("/api/v1/admin/suppliers/{$makers['mantis']}/logo")->assertOk()->assertJsonPath('data.logo_url', null);
        // An admin adds a supplier directly (approved, no payment) and removes it again.
        $made = $this->post('/api/v1/admin/suppliers', ['name' => 'Partner Print', 'makes' => 'Caps', 'location' => 'Perth'], ['Accept' => 'application/json'])->assertCreated()->json('data');
        $this->assertSame(['approved', true], [$made['status'], $made['listed']]);
        $this->deleteJson("/api/v1/admin/suppliers/{$made['id']}")->assertOk();

        // The listing prices (Admin > Pricing); a free listing asks for no payment.
        $this->putJson('/api/v1/admin/suppliers/prices', ['monthly' => 'x', 'yearly' => 100])->assertUnprocessable()->assertJsonValidationErrors(['monthly']);
        $this->putJson('/api/v1/admin/suppliers/prices', ['monthly' => 0, 'yearly' => 250.5])->assertOk()->assertJsonPath('data.yearly', '250.50');
        $this->assertSame('250.50', $this->getJson('/api/v1/suppliers')->json('data.prices.yearly'));
        $free = $this->apply($this->customer('Free Co'), ['plan' => 'monthly']);
        $this->assertSame([null, null], [$free['invoice'], $free['pay_path']]);
        $yearly = $this->apply($this->customer('Yearly Co'), ['plan' => 'yearly', 'logo' => null]);
        $this->assertSame('250.50', $yearly['invoice']['total']);
    }

    public function test_the_listing_invoice_email_speaks_of_the_listing_not_an_order(): void
    {
        Notification::fake();
        $user = $this->customer('Ana Lee');
        $applied = $this->apply($user);
        Notification::assertSentTo($user, InvoiceIssued::class, function (InvoiceIssued $notification) use ($user, $applied) {
            $text = implode("\n", array_merge($notification->toMail($user)->introLines, $notification->toMail($user)->outroLines));

            return str_contains($text, 'Thanks for applying to be a 3DEEZI preferred supplier ('.$applied['reference'].')')
                && str_contains($text, 'We list your company once') && ! str_contains($text, 'Production starts') && ! str_contains($text, 'Artwork approval');
        });
    }

    public function test_before_the_database_update_orders_still_work_and_the_first_visit_sets_it_up(): void
    {
        // As on a live site updated without a shell: the suppliers table and the orders' columns are not there yet.
        Artisan::call('migrate:rollback', ['--path' => 'database/migrations/2026_10_26_100000_create_suppliers_table.php', '--force' => true]);
        $this->assertFalse(Schema::hasTable('suppliers'));
        Supplier::forget();
        config(['suppliers.auto_setup' => false]);
        $this->assertSame([], $this->getJson('/api/v1/orders/options')->assertOk()->json('data.suppliers'));
        Sanctum::actingAs($this->customer());
        $order = $this->postJson('/api/v1/orders', $this->form(), ['Idempotency-Key' => 'before-update'])->assertCreated()->json('data');
        $this->assertNull($order['made_by']);
        $this->getJson("/api/v1/orders/{$order['id']}")->assertOk();
        $this->getJson('/api/v1/suppliers')->assertOk()->assertJsonPath('data.ready', false);

        // With auto setup on (the live default), the next visit creates them.
        Supplier::forget();
        config(['suppliers.auto_setup' => true]);
        $this->assertSame(['3DEEZI', 'Mantis'], array_column($this->getJson('/api/v1/orders/options')->assertOk()->json('data.suppliers'), 'name'));
        $this->assertTrue(Schema::hasColumn('orders', 'made_by'));
        $this->assertSame('3DEEZI', $this->getJson("/api/v1/orders/{$order['id']}")->assertOk()->json('data.made_by'));
    }
}
