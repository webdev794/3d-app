<?php

namespace Tests\Feature\Payments;

use App\Models\Payment;
use App\Notifications\InvoiceIssued;
use App\Notifications\PaymentReceived;
use App\Services\Pricing\BillingSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * One price style (task 9.85): "A$1,870.00" in the invoice email, the website's notifications, the order history and
 * the invoice PDF (every row and total), never "AUD $1,870.00".
 */
class PriceStyleTest extends TestCase
{
    use PaymentFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        BillingSettings::flush();
        // Billing emails go after the response; in tests, straight away.
        Bus::withoutDispatchingAfterResponses();
    }

    /** The PDF's text (its compressed page streams). */
    private function pdfText(string $pdf): string
    {
        preg_match_all('/stream\r?\n(.*?)\r?\nendstream/s', $pdf, $m);

        return implode("\n", array_map(fn ($s) => @gzuncompress($s) ?: $s, $m[1]));
    }

    public function test_the_invoice_email_notifications_history_and_pdf_say_a_dollars(): void
    {
        Notification::fake();
        $customer = $this->customer();
        // 20 jerseys at A$50, 20 shorts at A$30, shipping A$100, GST 10%: A$1,870.00.
        $invoice = $this->issuedInvoice($customer);

        Notification::assertSentTo($customer, InvoiceIssued::class, function (InvoiceIssued $n) use ($customer) {
            $mail = $n->toMail($customer);
            $lines = implode("\n", $mail->introLines);
            $this->assertSame('3DEEZI · Invoice INV-1001 · A$1,870.00', $mail->subject);
            $this->assertStringContainsString('Amount due: A$1,870.00 (includes GST A$170.00).', $lines);
            $this->assertSame('Invoice INV-1001 is ready: A$1,870.00 to pay', $n->toArray($customer)['text']);
            $this->assertStringNotContainsString('AUD', $mail->subject.$lines.$n->toArray($customer)['text']);

            return true;
        });
        $this->assertSame('Invoice INV-1001 issued: A$1,870.00.', $invoice->order->updates()->where('kind', 'payment')->first()->text());

        // The PDF: unit prices, row totals, the totals and the TOTAL all as A$.
        Sanctum::actingAs($customer);
        $text = $this->pdfText($this->get('/api/v1/invoices/INV-1001/pdf')->assertOk()->getContent());
        foreach (['(A$50.00)', '(A$30.00)', '(A$1,000.00)', '(A$600.00)', '(A$1,600.00)', '(A$100.00)', '(A$1,700.00)', '(A$170.00)', '(A$1,870.00)'] as $amount) {
            $this->assertStringContainsString($amount, $text, $amount);
        }
        $this->assertStringNotContainsString('AUD $', $text);
        $this->assertStringNotContainsString('($', $text, 'no bare "$" amounts');

        // Paid: the receipt notification and the history line.
        $payment = $this->postJson('/api/v1/invoices/INV-1001/pay')->assertOk()->json('data.payment');
        $this->postJson("/api/v1/payments/{$payment['id']}/test-complete", ['outcome' => 'succeeded'])->assertOk();
        $paid = Payment::query()->findOrFail($payment['id']);
        $note = (new PaymentReceived($invoice->fresh(), $paid))->toArray($customer);
        $this->assertSame('Payment received: A$1,870.00 for invoice INV-1001', $note['text']);
        $mail = (new PaymentReceived($invoice->fresh(), $paid))->toMail($customer);
        $this->assertStringContainsString('We received your payment of A$1,870.00', implode("\n", $mail->introLines));
        $history = $invoice->order->updates()->orderBy('id')->get()->map(fn ($u) => $u->kind.': '.$u->text())->all();
        $this->assertContains('payment: Payment received: A$1,870.00 (invoice INV-1001 paid in full).', $history, implode(' | ', $history));
        // The paid PDF: "Paid -A$1,870.00" and the amount due A$0.00.
        $text = $this->pdfText($this->get('/api/v1/invoices/INV-1001/pdf')->assertOk()->getContent());
        $this->assertStringContainsString('(-A$1,870.00)', $text);
        $this->assertStringContainsString('(A$0.00)', $text);
    }

    public function test_texts_saved_in_the_old_style_read_in_a_dollars(): void
    {
        $customer = $this->customer();
        $order = $this->formOrder($customer);
        $order->record('payment', ['message' => 'Payment received: AUD $198.00 (invoice INV-1003 paid in full).', 'visibility' => 'customer', 'data' => ['billing' => true]]);
        \Illuminate\Support\Facades\DB::table('notifications')->insert(['id' => (string) \Illuminate\Support\Str::uuid(), 'type' => InvoiceIssued::class,
            'notifiable_type' => $customer->getMorphClass(), 'notifiable_id' => $customer->id, 'created_at' => now(), 'updated_at' => now(),
            'data' => json_encode(['kind' => 'invoice', 'text' => 'Invoice INV-1001 is ready: AUD $1,870.00 to pay', 'link' => '/invoices/INV-1001'])]);
        Sanctum::actingAs($customer);

        $this->getJson('/api/v1/orders')->assertOk()->assertJsonPath('data.0.latest_update.text', 'Payment received: A$198.00 (invoice INV-1003 paid in full).');
        $updates = collect($this->getJson("/api/v1/orders/{$order->id}")->assertOk()->json('data.updates'))->pluck('text')->all();
        $this->assertContains('Payment received: A$198.00 (invoice INV-1003 paid in full).', $updates);
        $this->getJson('/api/v1/notifications')->assertOk()->assertJsonPath('data.items.0.data.text', 'Invoice INV-1001 is ready: A$1,870.00 to pay');
        // Only the money changes; the saved row stays as it was.
        $this->assertSame('Payment received: AUD $198.00 (invoice INV-1003 paid in full).', \Illuminate\Support\Facades\DB::table('order_updates')->where('kind', 'payment')->value('message'));
        $this->assertSame(['-A$12.50 refunded', 'NZ$5.00, £3.00', 'AUD 1,370.00', 'no money'], array_map([\App\Services\Pricing\Money::class, 'restyle'], ['AUD -$12.50 refunded', 'NZD $5.00, GBP £3.00', 'AUD 1,370.00', 'no money']));
    }
}
