<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Models\Payment;
use App\Models\User;
use App\Services\Payments\Gateways;
use App\Services\Payments\PayLink;
use App\Services\Payments\PaymentRules;
use App\Services\Payments\PaymentService;
use App\Services\Pdf\InvoicePdf;
use App\Services\Pricing\BillingSettings;
use App\Services\Pricing\Money;
use App\Services\Pricing\PricingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * The customer's invoices and paying them (the Review & Pay page). Only the order's own account (signed in), or
 * the app's short-lived signed link (?key=), sees and pays an invoice; staff may look at it.
 */
class InvoiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $invoices = Invoice::query()->where('user_id', $request->user()->id)->whereNotNull('number')->with('order')->orderByDesc('id')->get();

        return response()->json(['data' => $invoices->map(fn (Invoice $i) => Invoice::summary($i) + [
            'order' => $i->order ? ['id' => $i->order->id, 'number' => $i->order->number, 'name' => $i->snapshot['order']['name'] ?? $i->order->number] : null,
        ])->values()]);
    }

    public function show(Request $request, string $number): JsonResponse
    {
        [$invoice, $viewer] = $this->find($request, $number);

        return response()->json(['data' => self::present($invoice, $viewer)]);
    }

    public function pdf(Request $request, string $number): Response
    {
        [$invoice] = $this->find($request, $number);

        return self::pdfResponse($invoice);
    }

    public static function pdfResponse(Invoice $invoice): Response
    {
        return response(InvoicePdf::render($invoice), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$invoice->number.'.pdf"',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    /** Starts the card payment (or picks up the open one): Stripe's client secret, or a test payment. */
    public function pay(Request $request, string $number, PaymentService $payments): JsonResponse
    {
        $data = $request->validate(['amount' => ['sometimes', Rule::in(['full', 'deposit'])]]);
        [$invoice, $viewer] = $this->find($request, $number, true);
        $payment = $payments->start($invoice, $invoice->user ?? $request->user('sanctum'), $data['amount'] ?? 'full');

        return response()->json(['data' => [
            'payment' => $payment->present() + ['client_secret' => $payment->provider === 'stripe' ? $payment->client_secret : null],
            'invoice' => self::present($invoice->refresh(), $viewer),
        ]]);
    }

    /** After the browser confirmed a card payment: ask Stripe how it stands (the webhook may come later). */
    public function sync(Request $request, Payment $payment, PaymentService $payments): JsonResponse
    {
        [$invoice, $viewer] = $this->find($request, (string) $payment->invoice?->number, true);
        abort_unless($payment->invoice_id === $invoice->id, 404);
        $payments->sync($payment);

        return response()->json(['data' => self::present($invoice->refresh(), $viewer)]);
    }

    /** Test mode only: the TEST form's outcome, through the same handling as Stripe's webhook. */
    public function testComplete(Request $request, Payment $payment, PaymentService $payments): JsonResponse
    {
        abort_unless(Gateways::testAllowed() && $payment->provider === 'test', 404);
        $data = $request->validate(['outcome' => ['required', Rule::in(['succeeded', 'failed'])], 'method' => ['sometimes', Rule::in(['card', 'wallet'])]]);
        [$invoice, $viewer] = $this->find($request, (string) $payment->invoice?->number, true);
        abort_unless($payment->invoice_id === $invoice->id, 404);
        abort_if(in_array($payment->status, ['succeeded', 'refunded', 'cancelled'], true), 409, 'This payment is already finished.');
        $payments->completeTest($payment, $data['outcome'], $data['method'] ?? 'card');

        return response()->json(['data' => self::present($invoice->refresh(), $viewer)]);
    }

    /** The app's pay link: the pay page in the phone's browser for two hours, without signing in there. */
    public function link(Request $request, string $number): JsonResponse
    {
        $invoice = Invoice::query()->where('number', strtoupper($number))->first();
        abort_unless($invoice && $invoice->user_id === $request->user()->id, 404, 'This invoice was not found in your account.');

        return response()->json(['data' => array_intersect_key(PayLink::make($invoice), array_flip(['url', 'expires_at']))]);
    }

    /**
     * The invoice and who is looking: its owner (signed in), the app's signed link, or staff (look only).
     *
     * @return array{0: Invoice, 1: string}
     */
    private function find(Request $request, string $number, bool $paying = false): array
    {
        $invoice = $number === '' ? null : Invoice::query()->where('number', strtoupper($number))->with(['order', 'user'])->first();
        /** @var User|null $user */
        $user = $request->user('sanctum');
        $key = (string) ($request->query('key') ?: $request->header('X-Pay-Key', ''));
        if ($invoice && $user && $invoice->user_id === $user->id) {
            return [$invoice, 'owner'];
        }
        if ($invoice && $key !== '' && PayLink::valid($invoice, $key)) {
            return [$invoice, 'link'];
        }
        if ($invoice && $user?->is_admin) {
            abort_if($paying, 403, 'Only the customer can pay this invoice. Use "Mark paid" in the admin panel for a payment received another way.');

            return [$invoice, 'staff'];
        }
        abort_if(! $user && $key === '', 401, 'Sign in to see this invoice.');
        abort(404, 'This invoice was not found in your account.');
    }

    /** Everything the pay page shows (payments-api.md 4). */
    public static function present(Invoice $invoice, string $viewer = 'owner'): array
    {
        $invoice->loadMissing(['order', 'payments']);
        $snap = $invoice->snapshot ?? [];
        $order = $invoice->order;
        $paid = $invoice->payments->where('status', 'succeeded')->sortByDesc('id')->first();

        return Invoice::summary($invoice) + [
            'id' => $invoice->id,
            'number' => $invoice->number,
            'viewer' => $viewer,
            'order' => [
                'id' => $order?->id ?? ($snap['order']['id'] ?? null),
                'number' => $order?->number ?? ($snap['order']['number'] ?? null),
                'name' => $snap['order']['name'] ?? $order?->team_name,
                'status' => $order?->status,
                'approval' => $order?->approval,
                'quantity' => (int) ($snap['order']['quantity'] ?? $order?->quantity ?? 0),
                'summary' => $snap['order']['summary'] ?? null,
                'items' => $snap['order']['items'] ?? [],
            ],
            'customer' => $snap['customer'] ?? null,
            'seller' => ($snap['seller'] ?? BillingSettings::seller()) + ['logo' => BillingSettings::logoDataUrl()],
            'quote' => PricingService::present($invoice->quote),
            'payments' => $invoice->payments->sortByDesc('id')->values()->map->present(),
            'receipt' => $paid ? [
                'number' => $invoice->number.'-'.$paid->id,
                'amount' => Money::decimal($paid->amount_cents),
                'paid_at' => $paid->paid_at?->toIso8601String(),
                'method' => $paid->method,
                'card' => isset($paid->details['last4']) ? ['brand' => $paid->details['brand'] ?? null, 'last4' => $paid->details['last4']] : null,
            ] : null,
            'gateway' => Gateways::info(),
            'payment_rule' => PaymentRules::rule($invoice),
            'notes' => trim(implode("\n", array_filter([trim((string) ($snap['note'] ?? '')), trim((string) $invoice->notes)]))) ?: null,
        ];
    }
}
