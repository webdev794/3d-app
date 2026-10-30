<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Models\Supplier;
use App\Services\SupplierListing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

/**
 * Preferred suppliers (task 9.118): the public page's list (/suppliers, and the app), the logos, and "Become a
 * preferred supplier": a company applies with its account, pays the listing on the usual pay page, and an admin
 * approves it (Admin > Suppliers). One listing per account.
 */
class SupplierController extends Controller
{
    /** The page: Mantis and the listed outside suppliers (3DEEZI itself is the site), and the listing prices. */
    public function index(): JsonResponse
    {
        $ready = Supplier::ready();
        $suppliers = $ready ? Supplier::choices()->reject(fn (Supplier $s) => $s->slug === Supplier::DEFAULT)->values()->map->present() : collect();

        return response()->json(['data' => ['suppliers' => $suppliers, 'prices' => SupplierListing::pricesForPage(), 'ready' => $ready]]);
    }

    /** A supplier's logo (public: it is shown on the page). */
    public function logo(int $supplier): Response
    {
        abort_unless(Supplier::ready(), 404);
        $found = Supplier::query()->find($supplier);
        abort_unless($found && $found->logo && Storage::disk('local')->exists($found->logo), 404);
        $type = match (strtolower(pathinfo($found->logo, PATHINFO_EXTENSION))) {
            'png' => 'image/png', 'webp' => 'image/webp', default => 'image/jpeg',
        };

        return response(Storage::disk('local')->get($found->logo), 200, ['Content-Type' => $type, 'Cache-Control' => 'public, max-age=604800', 'X-Content-Type-Options' => 'nosniff']);
    }

    /** My listing (signed in): the application, its status and its invoice; null when I have none. */
    public function mine(Request $request): JsonResponse
    {
        abort_unless(Supplier::ready(), 503, 'Preferred suppliers are being set up. Please try again in a minute.');
        $supplier = Supplier::query()->where('user_id', $request->user()->id)->latest('id')->first();

        return response()->json(['data' => $supplier ? self::mineView($supplier) : null]);
    }

    /**
     * "Become a preferred supplier": the company's details, logo and plan. Its listing invoice is issued at once
     * (unless the admin set the price to 0): the reply has the pay page to open next.
     */
    public function apply(Request $request, SupplierListing $listing): JsonResponse
    {
        abort_unless(Supplier::ready(), 503, 'Preferred suppliers are being set up. Please try again in a minute.');
        $data = $request->validate([
            'company' => ['required', 'string', 'max:160'],
            'contact_name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190'],
            'phone' => ['nullable', 'string', 'max:40'],
            'website' => ['nullable', 'string', 'max:255'],
            'makes' => ['required', 'string', 'max:300'],
            'location' => ['required', 'string', 'max:160'],
            'summary' => ['nullable', 'string', 'max:300'],
            'message' => ['nullable', 'string', 'max:3000'],
            'plan' => ['required', Rule::in(Supplier::PLANS)],
            'logo' => ['nullable', 'file', 'mimes:png,jpg,jpeg,webp', 'max:2048'],
        ], [
            'company.required' => 'Add your company name.',
            'contact_name.required' => 'Add a contact name.',
            'email.required' => 'Add an email address.',
            'makes.required' => 'Say what you make, e.g. sublimated jerseys and shorts.',
            'location.required' => 'Add where you are, e.g. Brisbane, QLD.',
            'plan.in' => 'Choose a monthly or a yearly listing.',
            'logo.mimes' => 'Choose a PNG, JPEG or WebP logo.',
            'logo.max' => 'The logo can be up to 2 MB.',
        ]);
        $user = $request->user();
        $supplier = DB::transaction(function () use ($user, $data) {
            $existing = Supplier::query()->where('user_id', $user->id)->lockForUpdate()->exists();
            abort_if($existing, 409, 'Your account already has a supplier listing. Open it on the Preferred suppliers page.');
            $supplier = new Supplier;
            $supplier->fill([
                'name' => trim($data['company']), 'contact_name' => trim($data['contact_name']), 'email' => trim($data['email']),
                'phone' => self::text($data['phone'] ?? null), 'website' => self::text($data['website'] ?? null), 'makes' => trim($data['makes']),
                'location' => trim($data['location']), 'summary' => self::text($data['summary'] ?? null), 'message' => self::text($data['message'] ?? null),
                'status' => 'applied', 'plan' => $data['plan'],
            ]);
            $supplier->forceFill(['user_id' => $user->id, 'owner' => false])->save();

            return $supplier;
        });
        if ($request->hasFile('logo')) {
            SupplierListing::storeLogo($supplier, $request->file('logo'));
        }
        $invoice = $listing->issueInvoice($supplier, $data['plan']);

        return response()->json(['data' => self::mineView($supplier->refresh()) + [
            'message' => $invoice ? 'Thanks! Pay your listing now: we check your application and list you once it is approved.'
                : 'Thanks! We check your application and list you once it is approved.',
        ]], 201);
    }

    /** Pays for another month or year (or changes the plan of an unpaid listing): the invoice to pay. */
    public function renew(Request $request, SupplierListing $listing): JsonResponse
    {
        abort_unless(Supplier::ready(), 503, 'Preferred suppliers are being set up. Please try again in a minute.');
        $data = $request->validate(['plan' => ['required', Rule::in(Supplier::PLANS)]], ['plan.in' => 'Choose a monthly or a yearly listing.']);
        $supplier = Supplier::query()->where('user_id', $request->user()->id)->latest('id')->first();
        abort_unless($supplier, 404, 'Your account has no supplier listing yet.');
        abort_if($supplier->status === 'hidden', 409, 'Your listing is switched off. Contact 3DEEZI to switch it back on.');
        $invoice = $listing->issueInvoice($supplier, $data['plan']);
        abort_unless($invoice, 409, 'Listings are free at the moment: nothing to pay.');

        return response()->json(['data' => self::mineView($supplier->refresh())]);
    }

    /** My listing as its owner sees it. */
    public static function mineView(Supplier $supplier): array
    {
        $invoice = $supplier->invoice_id ? Invoice::find($supplier->invoice_id) : null;

        return $supplier->present() + [
            'status' => $supplier->status,
            'listed' => $supplier->isListed(),
            'reference' => $supplier->reference(),
            'contact_name' => $supplier->contact_name,
            'email' => $supplier->email,
            'phone' => $supplier->phone,
            'plan' => $supplier->plan,
            'paid_until' => $supplier->paid_until?->toDateString(),
            'invoice' => Invoice::summary($invoice),
            // The pay page for an unpaid listing invoice (the website's /invoices/INV-...; the app asks for its pay link).
            'pay_path' => $invoice && $invoice->canPay() ? '/invoices/'.$invoice->number : null,
            'created_at' => $supplier->created_at?->toIso8601String(),
        ];
    }

    private static function text(?string $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }
}
