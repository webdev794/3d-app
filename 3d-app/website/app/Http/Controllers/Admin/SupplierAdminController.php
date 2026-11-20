<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Supplier;
use App\Services\Pricing\Money;
use App\Services\SupplierListing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Admin > Suppliers (task 9.118): the applications and listings (approve, hide, edit, logo, paid until), the owner's
 * own entries (3DEEZI and Mantis: edited, never deleted), and the listing prices shown in Admin > Pricing.
 */
class SupplierAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->ready();
        $request->validate(['status' => ['sometimes', 'nullable', Rule::in(Supplier::STATUSES)]]);
        $search = trim((string) $request->query('search', ''));
        $suppliers = Supplier::query()->with(['invoice', 'user:id,name,email'])
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")
                ->orWhere('contact_name', 'like', "%{$search}%")->orWhere('makes', 'like', "%{$search}%")->orWhere('location', 'like', "%{$search}%")))
            ->orderByDesc('owner')->orderByRaw("case status when 'applied' then 0 when 'approved' then 1 else 2 end")->orderBy('sort')->orderByDesc('id')
            ->get();
        $orders = Order::query()->whereNotNull('supplier_id')->selectRaw('supplier_id, count(*) as n')->groupBy('supplier_id')->pluck('n', 'supplier_id');
        $default = $suppliers->firstWhere('slug', Supplier::DEFAULT);
        $older = Order::query()->whereNull('supplier_id')->count();

        return response()->json(['data' => [
            'suppliers' => $suppliers->map(fn (Supplier $s) => $s->forAdmin() + ['orders_count' => (int) ($orders[$s->id] ?? 0) + ($default && $s->id === $default->id ? $older : 0)])->values(),
            'counts' => ['applied' => $suppliers->where('status', 'applied')->count(), 'approved' => $suppliers->where('status', 'approved')->count(), 'hidden' => $suppliers->where('status', 'hidden')->count()],
            'prices' => SupplierListing::pricesForPage(),
        ]]);
    }

    /** An outside supplier added by an admin (a listing given without an application). */
    public function store(Request $request): JsonResponse
    {
        $this->ready();
        $supplier = new Supplier;
        $supplier->fill($this->fields($request, true))->forceFill(['owner' => false])->save();
        $this->approvedNow($supplier);
        if ($request->hasFile('logo')) {
            SupplierListing::storeLogo($supplier, $request->file('logo'));
        }

        return response()->json(['data' => $supplier->refresh()->forAdmin()], 201);
    }

    /** Approve, hide or edit; the paid-until date and plan. 3DEEZI (the default maker) is never hidden. */
    public function update(Request $request, int $supplier): JsonResponse
    {
        $this->ready();
        $found = Supplier::query()->findOrFail($supplier);
        $data = $this->fields($request, false);
        abort_if($found->slug === Supplier::DEFAULT && ($data['status'] ?? 'approved') !== 'approved', 422, '3DEEZI is the default maker of every order: it can’t be hidden.');
        $found->fill($data)->save();
        $this->approvedNow($found);

        return response()->json(['data' => $found->refresh()->load(['invoice', 'user:id,name,email'])->forAdmin()]);
    }

    /** A new logo (POST: PHP reads uploaded files only from POST requests). */
    public function uploadLogo(Request $request, int $supplier): JsonResponse
    {
        $this->ready();
        $found = Supplier::query()->findOrFail($supplier);
        $request->validate(['logo' => ['required', 'file', 'mimes:png,jpg,jpeg,webp', 'max:2048']], ['logo.required' => 'Choose a logo.', 'logo.mimes' => 'Choose a PNG, JPEG or WebP logo.', 'logo.max' => 'The logo can be up to 2 MB.']);
        SupplierListing::storeLogo($found, $request->file('logo'));

        return response()->json(['data' => $found->refresh()->load(['invoice', 'user:id,name,email'])->forAdmin()]);
    }

    public function deleteLogo(int $supplier): JsonResponse
    {
        $this->ready();
        $found = Supplier::query()->findOrFail($supplier);
        SupplierListing::deleteLogo($found);

        return response()->json(['data' => $found->refresh()->forAdmin()]);
    }

    /** An outside supplier is removed (its orders keep the name they were made by). The owner's own entries stay. */
    public function destroy(int $supplier): JsonResponse
    {
        $this->ready();
        $found = Supplier::query()->findOrFail($supplier);
        abort_if($found->owner, 422, 'The owner’s own entries (3DEEZI and Mantis) can be edited or hidden, not deleted.');
        SupplierListing::deleteLogo($found);
        $found->delete();

        return response()->json(['data' => ['message' => $found->name.' removed.']]);
    }

    /** Admin > Pricing: the listing prices (including GST). */
    public function prices(Request $request): JsonResponse
    {
        if ($request->isMethod('put')) {
            $data = $request->validate([
                'monthly' => ['required', 'numeric', 'min:0', 'max:100000', 'decimal:0,2'],
                'yearly' => ['required', 'numeric', 'min:0', 'max:1000000', 'decimal:0,2'],
            ], ['monthly.required' => 'Add the monthly listing price (0 for free).', 'yearly.required' => 'Add the yearly listing price (0 for free).']);
            Supplier::savePrices((int) Money::toCents($data['monthly']), (int) Money::toCents($data['yearly']));
        }

        return response()->json(['data' => SupplierListing::pricesForPage()]);
    }

    private function ready(): void
    {
        abort_unless(Supplier::ready(), 503, 'The suppliers table is not set up yet: run php artisan migrate --force on the server.');
    }

    /** The fields an admin may set (all optional when editing). */
    private function fields(Request $request, bool $creating): array
    {
        $sometimes = $creating ? 'required' : 'sometimes';
        $data = $request->validate([
            'name' => [$sometimes, 'string', 'max:160'],
            'contact_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'email' => ['sometimes', 'nullable', 'email', 'max:190'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'website' => ['sometimes', 'nullable', 'string', 'max:255'],
            'summary' => ['sometimes', 'nullable', 'string', 'max:300'],
            'makes' => ['sometimes', 'nullable', 'string', 'max:300'],
            'location' => ['sometimes', 'nullable', 'string', 'max:160'],
            'message' => ['sometimes', 'nullable', 'string', 'max:3000'],
            'status' => ['sometimes', Rule::in(Supplier::STATUSES)],
            'plan' => ['sometimes', 'nullable', Rule::in(Supplier::PLANS)],
            'paid_until' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'sort' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            'logo' => ['sometimes', 'file', 'mimes:png,jpg,jpeg,webp', 'max:2048'],
        ], ['status.in' => 'Choose applied, approved or hidden.', 'logo.mimes' => 'Choose a PNG, JPEG or WebP logo.', 'logo.max' => 'The logo can be up to 2 MB.']);
        unset($data['logo']);
        foreach ($data as $key => $value) {
            if (is_string($value)) {
                $data[$key] = trim($value) === '' && $key !== 'name' ? null : trim($value);
            }
        }
        if ($creating) {
            $data['status'] ??= 'approved';
        }

        return $data;
    }

    private function approvedNow(Supplier $supplier): void
    {
        if ($supplier->status === 'approved' && ! $supplier->approved_at) {
            $supplier->forceFill(['approved_at' => now()])->save();
        }
    }
}
