<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Models\Order;
use App\Models\Project;
use App\Models\User;
use App\Services\Payments\PayLink;
use App\Support\OrderDelivery;
use App\Support\OrderView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * COMPLETE YOUR PAYMENT (/orders/3DZ-00008/pay) and its Confirmation (/orders/3DZ-00008/confirmation): the step
 * after the customer approves the order. Everything the page shows in one answer: the order (garments with their
 * pictures, sizes, contact and delivery), its invoice as on the Review & Pay page (InvoiceController::present) and
 * the billing address. Paying itself goes through the invoice endpoints (/invoices/{number}/pay, test-complete,
 * sync), so card details never reach this site: Airwallex's own page takes them.
 *
 * Who may look: the order's own account (signed in), the app's signed pay link for the order's invoice (?key=),
 * or staff (look only, like the invoice page).
 */
class OrderCheckoutController extends Controller
{
    public function show(Request $request, string $ref): JsonResponse
    {
        [$order, $invoice, $viewer] = $this->find($request, $ref);

        return response()->json(['data' => self::present($order, $invoice, $viewer)]);
    }

    /**
     * The order (by its number, 3DZ-00008, or its id) and its invoice: the one named by ?invoice= when it belongs to
     * the order (the app's pay link and old pay links name it), else the order's latest.
     *
     * @return array{0: Order, 1: Invoice|null, 2: string}
     */
    private function find(Request $request, string $ref): array
    {
        $order = ctype_digit($ref) ? Order::query()->find((int) $ref) : Order::query()->where('number', strtoupper($ref))->first();
        /** @var User|null $user */
        $user = $request->user('sanctum');
        $key = (string) ($request->query('key') ?: $request->header('X-Pay-Key', ''));
        abort_if(! $user && $key === '', 401, 'Sign in to pay for this order.');
        abort_unless($order, 404, 'This order was not found in your account.');

        $named = strtoupper(trim((string) $request->query('invoice', '')));
        $invoice = $named !== '' ? $order->invoices()->where('number', $named)->first() : null;
        $invoice ??= $order->invoice()->first();

        if ($user && $order->user_id === $user->id) {
            return [$order, $invoice, 'owner'];
        }
        if ($invoice && $key !== '' && PayLink::valid($invoice, $key)) {
            return [$order, $invoice, 'link'];
        }
        if ($user?->is_admin) {
            return [$order, $invoice, 'staff'];
        }
        abort(404, 'This order was not found in your account.');
    }

    /**
     * What the payment and confirmation pages show: the order as on My Orders (OrderView::detail, the customer's
     * view), its garment rows (a Studio kit order's garments with the order's sizes), the saved designs they are made
     * from (for the approved order PDF's mockups), the invoice and the billing address.
     */
    public static function present(Order $order, ?Invoice $invoice, string $viewer = 'owner'): array
    {
        $detail = OrderView::detail($order, false);
        $projects = OrderView::itemProjects([$order], $order->user_id);
        $rows = [];
        foreach ((array) ($order->items ?? []) as $item) {
            $sizes = array_filter(array_map('intval', (array) ($item['sizes'] ?? [])));
            $rows[] = $item + [
                'name' => Order::itemName($item),
                'quantity' => (int) ($item['quantity'] ?? array_sum($sizes)),
                'thumbnail' => isset($item['project_id']) ? ($projects[$item['project_id']]->thumbnail ?? null) : null,
            ] + ['fit_name' => isset($item['fit']) ? (Order::FITS[$item['fit']] ?? null) : null];
        }
        if ($rows === []) {
            // An order of a Studio kit: its garments (a full kit is a jersey and shorts), each with the order's sizes.
            $sizes = array_filter(array_map('intval', (array) ($order->sizes ?? [])));
            foreach (OrderView::garments($order, $projects) as $garment) {
                $rows[] = $garment + ['sizes' => $sizes, 'project_id' => $order->project_id, 'fit' => null, 'fit_name' => null,
                    'sport' => $order->project?->sport, 'players' => is_array($order->players) ? $order->players : null];
            }
        }
        $ids = array_values(array_unique(array_filter(array_merge(array_column($rows, 'project_id'), [$order->project_id]))));
        $designs = $ids === [] || ! $order->user_id ? collect() : Project::query()->where('user_id', $order->user_id)->whereIn('id', $ids)->get();
        $address = trim((string) $order->shipping_address);
        $billing = $invoice ? InvoiceController::billingOf($invoice) : null;
        // A pick-up order delivers nothing, so the pay page asks for a billing address: start from the customer's own.
        if ($billing && $address === OrderDelivery::PICKUP_TEXT && ($billing['same'] ?? true)) {
            $hint = self::customerAddress($order, $invoice);
            if ($hint) {
                $billing['hint'] = $hint;
            }
        }

        return [
            'viewer' => $viewer,
            'order' => array_merge($detail, [
                'name' => $order->displayName(),
                'contact_name' => $order->contact_name ?: $order->user?->name,
                'contact_email' => $order->contact_email ?: $order->user?->email,
                'delivery' => $address === '' ? null : ($address === OrderDelivery::PICKUP_TEXT ? 'pickup' : 'deliver'),
                'link' => '/orders?order='.$order->id,
            ]),
            'items' => $rows,
            'projects' => $designs->values(),
            'invoice' => $invoice ? InvoiceController::present($invoice, $viewer) : null,
            'billing' => $billing,
        ];
    }

    /**
     * The customer's address from earlier orders (street, suburb, state, postcode, country), or null: the billing
     * address they gave on another invoice, else the address of their latest delivered-to order.
     */
    private static function customerAddress(Order $order, Invoice $invoice): ?array
    {
        if (! $order->user_id) {
            return null;
        }
        $earlier = Invoice::query()->where('user_id', $order->user_id)->whereKeyNot($invoice->id)->latest('id')->limit(20)->get(['id', 'snapshot']);
        foreach ($earlier as $other) {
            $fields = $other->snapshot['billing']['fields'] ?? null;
            if (is_array($fields) && filled($fields['street'] ?? null)) {
                return array_map(fn ($v) => (string) $v, array_intersect_key($fields, array_flip(OrderDelivery::ADDRESS_FIELDS)));
            }
        }
        $text = Order::query()->where('user_id', $order->user_id)->whereNotNull('shipping_address')
            ->where('shipping_address', '!=', OrderDelivery::PICKUP_TEXT)->where('shipping_address', '!=', '')->latest('id')->value('shipping_address');
        $lines = array_values(array_filter(array_map('trim', explode("\n", (string) $text)), fn ($l) => $l !== ''));
        if (count($lines) === 1 && preg_match('/^(.+?),\s*(.+?\s+[A-Za-z]{2,3}\s+\d{4})$/', $lines[0], $m)) {
            $lines = [$m[1], $m[2]];   // an older one-line address: "1 Park Rd, Sydney NSW 2000"
        }
        if (count($lines) < 2) {
            return null;
        }
        // OrderDelivery::text(): "street", "suburb STATE postcode", "country".
        $fields = ['street' => $lines[0], 'suburb' => '', 'state' => '', 'postcode' => '', 'country' => $lines[2] ?? OrderDelivery::DEFAULT_COUNTRY];
        if (preg_match('/^(.*?)\s+([A-Za-z]{2,3})\s+(\d{4})$/', $lines[1], $m)) {
            [$fields['suburb'], $fields['state'], $fields['postcode']] = [$m[1], strtoupper($m[2]), $m[3]];
        } else {
            $fields['suburb'] = $lines[1];
        }

        return $fields;
    }
}
