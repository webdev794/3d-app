<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Supplier;
use App\Services\Payments\InvoiceService;
use App\Services\Pricing\BillingSettings;
use App\Services\Pricing\Money;
use App\Services\Team\TeamPlans;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * A preferred supplier's listing (task 9.118): its invoice for a month or a year (in the existing invoices, INV-..., no
 * order; paid on the same pay page as orders), what paying it does (the listing is paid until a month or a year
 * later), and the logo.
 */
class SupplierListing
{
    /** The listing price of a plan, in cents including GST. */
    public static function price(string $plan): int
    {
        return Supplier::prices()[$plan === 'yearly' ? 'yearly_cents' : 'monthly_cents'];
    }

    /**
     * The listing's invoice for a plan: one line, paid in full. Prices include GST, like 3DEEZI TEAM's (A$49.00 =
     * A$44.55 + A$4.45 GST). Null when the plan costs nothing (the admin set it to 0). An unpaid one is given back.
     */
    public function issueInvoice(Supplier $supplier, string $plan): ?Invoice
    {
        $open = $supplier->invoice_id ? Invoice::query()->whereKey($supplier->invoice_id)->whereIn('status', Invoice::PAYABLE)->where('paid_cents', 0)->first() : null;
        if ($open && ($open->snapshot['supplier']['plan'] ?? null) === $plan) {
            return $open;
        }
        $total = self::price($plan);
        if ($total <= 0) {
            return null;
        }
        if ($open) {
            app(InvoiceService::class)->cancel($open, 'Listing plan changed to '.$plan.'.');
        }
        $settings = BillingSettings::all();
        $currency = BillingSettings::currency();
        $tax = TeamPlans::includedTax($total);
        $price = $total - $tax;
        $taxName = (string) $settings['tax_name'] ?: 'Tax';
        $period = $plan === 'yearly' ? 'one year' : 'one month';
        $name = "Preferred supplier listing · {$supplier->name} · {$period} · ".Money::format($total, $currency).($tax > 0 ? " incl. {$taxName}" : '');
        $line = ['key' => 'supplier', 'kind' => 'custom', 'garment' => null, 'sport' => null, 'name' => $name,
            'quantity' => 1, 'unit_cents' => $price, 'total_cents' => $price, 'priced' => true];
        $quote = ['status' => 'priced', 'currency' => $currency, 'quantity' => 1, 'lines' => [$line], 'extras' => [], 'garments_total_cents' => $price,
            'extras_total_cents' => 0, 'shipping' => null, 'discounts' => [], 'discount_total_cents' => 0, 'subtotal_cents' => $price,
            'tax' => ['name' => $taxName, 'rate' => (string) (float) $settings['tax_rate'], 'amount_cents' => $tax, 'applies' => (float) $settings['tax_rate'] > 0, 'included' => true],
            'total_cents' => $total, 'reasons' => [], 'discount_code' => null];
        $user = $supplier->user;
        $snapshot = [
            'order' => ['id' => null, 'number' => $supplier->reference(), 'name' => 'Preferred supplier · '.$supplier->name, 'source' => 'supplier', 'quantity' => 0, 'items' => [],
                'summary' => $plan === 'yearly' ? 'Yearly listing' : 'Monthly listing'],
            'customer' => ['name' => $supplier->name, 'contact' => $supplier->contact_name ?: $user?->name, 'email' => $supplier->email ?: $user?->email, 'phone' => $supplier->phone, 'address' => $supplier->location],
            'seller' => BillingSettings::seller(),
            'note' => trim((string) $settings['invoice_note']) === 'Artwork approval is required before production.' ? '' : trim((string) $settings['invoice_note']),
            'bank_details' => trim((string) $settings['bank_details']),
            'payment_rule' => ['rule' => 'full', 'deposit_percent' => 100],
            'supplier' => ['id' => $supplier->id, 'plan' => $plan],
        ];
        $invoice = new Invoice;
        for ($attempt = 1; ; $attempt++) {
            try {
                DB::transaction(function () use ($invoice, $supplier, $quote, $snapshot, $settings, $currency, $price, $tax, $total) {
                    $sequence = max((int) Invoice::query()->lockForUpdate()->max('sequence') + 1, max(1, (int) $settings['invoice_start']));
                    $invoice->forceFill([
                        'order_id' => null, 'user_id' => $supplier->user_id,
                        'sequence' => $sequence, 'number' => 'INV-'.$sequence, 'status' => 'awaiting_payment', 'currency' => $currency,
                        'subtotal_cents' => $price, 'tax_cents' => $tax, 'total_cents' => $total, 'paid_cents' => 0, 'refunded_cents' => 0,
                        'quote' => $quote, 'snapshot' => $snapshot, 'issued_at' => now(),
                        'due_at' => now()->addDays(max(0, (int) $settings['due_days']))->toDateString(),
                    ])->save();
                });
                break;
            } catch (UniqueConstraintViolationException $e) {
                if ($attempt >= 5) {
                    throw $e;
                }
            }
        }
        $supplier->forceFill(['invoice_id' => $invoice->id, 'plan' => $plan])->save();
        app(InvoiceService::class)->emailInvoice($invoice);

        return $invoice;
    }

    /** Called when an invoice is paid (InvoiceService::paymentReceived): the listing is paid a month or a year further. */
    public function invoicePaid(Invoice $invoice): void
    {
        $id = $invoice->snapshot['supplier']['id'] ?? null;
        $supplier = $id ? Supplier::find($id) : null;
        if (! $supplier || $invoice->status !== 'paid' || (int) $supplier->paid_invoice_id === $invoice->id) {
            return;
        }
        $plan = ($invoice->snapshot['supplier']['plan'] ?? 'monthly') === 'yearly' ? 'yearly' : 'monthly';
        $from = $supplier->paid_until && $supplier->paid_until->gte(now()->startOfDay()) ? $supplier->paid_until->copy() : now()->startOfDay();
        $supplier->forceFill([
            'plan' => $plan,
            'paid_until' => ($plan === 'yearly' ? $from->addYearNoOverflow() : $from->addMonthNoOverflow())->toDateString(),
            'paid_invoice_id' => $invoice->id,
        ])->save();
    }

    /** The logo: PNG, JPEG or WebP up to 2 MB, kept on the local disk (shown by GET /suppliers/{id}/logo). */
    public static function storeLogo(Supplier $supplier, UploadedFile $file): void
    {
        $bytes = (string) file_get_contents($file->getRealPath());
        $info = @getimagesizefromstring($bytes);
        $types = [IMAGETYPE_PNG => 'png', IMAGETYPE_JPEG => 'jpg', IMAGETYPE_WEBP => 'webp'];
        if (! $info || ! isset($types[$info[2]])) {
            throw ValidationException::withMessages(['logo' => 'This picture could not be read. Choose a PNG, JPEG or WebP logo.']);
        }
        $path = Supplier::LOGO_DIR.'/logo-'.$supplier->id.'-'.substr(sha1($bytes), 0, 10).'.'.$types[$info[2]];
        $old = $supplier->logo;
        Storage::disk('local')->put($path, $bytes);
        $supplier->forceFill(['logo' => $path])->save();
        if ($old && $old !== $path) {
            Storage::disk('local')->delete($old);
        }
    }

    public static function deleteLogo(Supplier $supplier): void
    {
        if ($supplier->logo) {
            Storage::disk('local')->delete($supplier->logo);
        }
        $supplier->forceFill(['logo' => null])->save();
    }

    /** The listing prices for the page and the app (decimal, with the currency). */
    public static function pricesForPage(): array
    {
        $prices = Supplier::prices();
        $currency = BillingSettings::currency();

        return [
            'currency' => $currency,
            'monthly' => Money::decimal($prices['monthly_cents']),
            'yearly' => Money::decimal($prices['yearly_cents']),
            'monthly_text' => Money::format($prices['monthly_cents'], $currency),
            'yearly_text' => Money::format($prices['yearly_cents'], $currency),
            'tax_included' => true,
            'tax_name' => (string) BillingSettings::get('tax_name') ?: 'GST',
        ];
    }
}
