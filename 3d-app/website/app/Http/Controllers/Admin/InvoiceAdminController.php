<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Controllers\InvoiceController;
use App\Jobs\SendBillingEmail;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Payment;
use App\Services\Payments\InvoiceService;
use App\Services\Payments\PaymentService;
use App\Services\Pricing\Money;
use App\Services\Pricing\PricingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * Admin > Invoices: every invoice; pricing "Quote required" orders and issuing their invoice, marking an invoice
 * paid (a bank transfer), resending it, recording a refund, cancelling.
 */
class InvoiceAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate(['status' => ['sometimes', 'nullable', Rule::in(array_keys(Invoice::STATUSES))]]);
        $search = trim((string) $request->query('search', ''));
        $invoices = Invoice::query()
            ->with(['order:id,number,team_name,contact_name,status,quantity', 'user:id,name,email'])
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status))
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q
                ->where('number', 'like', "%{$search}%")
                ->orWhereHas('order', fn ($o) => $o->where('number', 'like', "%{$search}%")->orWhere('team_name', 'like', "%{$search}%")->orWhere('contact_name', 'like', "%{$search}%"))
                ->orWhereHas('user', fn ($u) => $u->where('email', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%"))))
            ->orderByDesc('id')
            ->paginate(min(100, max(5, (int) $request->query('per_page', 20))));
        $invoices->getCollection()->transform(fn (Invoice $i) => $this->row($i));
        $counts = Invoice::query()->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');

        return response()->json(['data' => $invoices->toArray() + ['counts' => $counts]]);
    }

    public function show(Invoice $invoice, InvoiceService $invoices): JsonResponse
    {
        return response()->json(['data' => $this->detail($invoice, $invoices)]);
    }

    public function pdf(Invoice $invoice): Response
    {
        abort_unless($invoice->number, 404, 'This invoice is not issued yet.');

        return InvoiceController::pdfResponse($invoice);
    }

    /** For an admin order page: the order's invoices and its price now. */
    public function billing(Order $order, InvoiceService $invoices): JsonResponse
    {
        return response()->json(['data' => [
            'order' => ['id' => $order->id, 'number' => $order->number],
            'invoices' => $order->invoices()->orderByDesc('id')->get()->map(fn (Invoice $i) => $this->row($i))->values(),
            'quote' => PricingService::present($invoices->preview($order)),
        ]]);
    }

    /** The price with staff's prices filled in (nothing saved). */
    public function preview(Request $request, Order $order, InvoiceService $invoices): JsonResponse
    {
        return response()->json(['data' => PricingService::present($invoices->preview($order, $this->overrides($request)))]);
    }

    /** Issues the order's invoice (a "Quote required" one, or a new one) and emails it with the pay link. */
    public function issue(Request $request, Order $order, InvoiceService $invoices): JsonResponse
    {
        $data = $request->validate(['notes' => ['nullable', 'string', 'max:1000'], 'send_email' => ['sometimes', 'boolean']]);
        $invoice = $invoices->issue($order, $this->overrides($request), filled($data['notes'] ?? null) ? trim($data['notes']) : null, $request->boolean('send_email', true));

        return response()->json(['data' => $this->detail($invoice->refresh(), $invoices)], 201);
    }

    public function markPaid(Request $request, Invoice $invoice, PaymentService $payments, InvoiceService $invoices): JsonResponse
    {
        $data = $request->validate([
            'method' => ['required', Rule::in(['bank_transfer', 'cash', 'card', 'other'])],
            'reference' => ['nullable', 'string', 'max:120'],
            'amount' => ['nullable', 'numeric', 'min:0.01', 'decimal:0,2'],
            'paid_at' => ['nullable', 'date', 'before_or_equal:now'],
        ]);
        $payments->recordManual($invoice, $request->user(), $data);

        return response()->json(['data' => $this->detail($invoice->refresh(), $invoices)]);
    }

    public function resend(Invoice $invoice, InvoiceService $invoices): JsonResponse
    {
        if (in_array($invoice->status, Invoice::PAYABLE, true)) {
            $invoices->emailInvoice($invoice);
            $message = 'Invoice emailed to the customer.';
        } elseif ($invoice->status === 'paid' && ($payment = $invoice->payments()->where('status', 'succeeded')->latest('id')->first())) {
            SendBillingEmail::dispatchAfterResponse($invoice->id, 'receipt', $payment->id);
            $message = 'Receipt emailed to the customer.';
        } else {
            abort(409, 'Only an issued invoice (awaiting payment or paid) can be emailed.');
        }

        return response()->json(['data' => ['message' => $message] + $this->detail($invoice, $invoices)]);
    }

    public function refund(Request $request, Invoice $invoice, InvoiceService $invoices): JsonResponse
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);

        return response()->json(['data' => $this->detail($invoices->refund($invoice, $data['note'] ?? null), $invoices)]);
    }

    public function cancel(Request $request, Invoice $invoice, InvoiceService $invoices): JsonResponse
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);

        return response()->json(['data' => $this->detail($invoices->cancel($invoice, $data['note'] ?? null), $invoices)]);
    }

    /** Staff's prices: lines {"item-1": "40.00"}, shipping, discount, custom_lines [{name, quantity, unit_price}]. */
    private function overrides(Request $request): array
    {
        $data = $request->validate([
            'lines' => ['sometimes', 'nullable', 'array', 'max:60'],
            'lines.*' => ['nullable', 'numeric', 'min:0', 'max:1000000', 'decimal:0,2'],
            'shipping' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:1000000', 'decimal:0,2'],
            'discount' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:1000000', 'decimal:0,2'],
            'custom_lines' => ['sometimes', 'nullable', 'array', 'max:30'],
            'custom_lines.*.name' => ['required', 'string', 'max:120'],
            'custom_lines.*.quantity' => ['required', 'integer', 'min:1', 'max:100000'],
            'custom_lines.*.unit_price' => ['required', 'numeric', 'min:0', 'max:1000000', 'decimal:0,2'],
        ], ['custom_lines.*.name.required' => 'Name each added line.']);
        $lines = [];
        foreach ($data['lines'] ?? [] as $key => $price) {
            if (preg_match('/^item-\d+$/', (string) $key) && $price !== null && $price !== '') {
                $lines[$key] = Money::toCents($price);
            }
        }

        return array_filter([
            'lines' => $lines ?: null,
            'shipping' => isset($data['shipping']) && $data['shipping'] !== '' ? Money::toCents($data['shipping']) : null,
            'discount' => isset($data['discount']) && $data['discount'] !== '' ? Money::toCents($data['discount']) : null,
            'custom_lines' => array_map(fn ($l) => ['name' => $l['name'], 'quantity' => (int) $l['quantity'], 'unit_cents' => Money::toCents($l['unit_price'])], $data['custom_lines'] ?? []) ?: null,
        ], fn ($v) => $v !== null);
    }

    private function row(Invoice $invoice): array
    {
        return Invoice::summary($invoice) + [
            'id' => $invoice->id,
            'order' => $invoice->order ? ['id' => $invoice->order->id, 'number' => $invoice->order->number,
                'name' => $invoice->snapshot['order']['name'] ?? ($invoice->order->team_name ?: $invoice->order->contact_name), 'status' => $invoice->order->status]
                // A 3DEEZI TEAM design request's invoice: the request (TEAM-...) in the order's place.
                : ($invoice->team_request_id ? ['id' => null, 'team_request_id' => $invoice->team_request_id, 'number' => $invoice->snapshot['order']['number'] ?? null,
                    'name' => $invoice->snapshot['order']['name'] ?? null, 'status' => null] : null),
            'customer' => $invoice->user ? ['id' => $invoice->user->id, 'name' => $invoice->user->name, 'email' => $invoice->user->email] : null,
            'created_at' => $invoice->created_at?->toIso8601String(),
            'emailed_at' => $invoice->emailed_at?->toIso8601String(),
        ];
    }

    private function detail(Invoice $invoice, InvoiceService $invoices): array
    {
        $invoice->loadMissing(['order', 'user', 'payments.user']);
        $detail = [
            'staff_notes' => $invoice->notes,
            'account' => $invoice->user ? ['id' => $invoice->user->id, 'name' => $invoice->user->name, 'email' => $invoice->user->email] : null,
            'payments' => $invoice->payments->sortByDesc('id')->values()->map(fn (Payment $p) => $p->present() + ['by' => $p->provider === 'manual' ? $p->user?->name : null]),
        ] + InvoiceController::present($invoice, 'staff') + $this->row($invoice);
        // A quote to price: what is missing now, with the order as it is now (staff may have added sizes since).
        if ($invoice->status === 'quote_required' && $invoice->order) {
            $detail['quote'] = PricingService::present($invoices->preview($invoice->order));
            $detail['reasons'] = $detail['quote']['reasons'];
            $detail['order']['items'] = $invoices->snapshot($invoice->order)['order']['items'];
        }

        return $detail;
    }
}
