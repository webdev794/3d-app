<?php

namespace App\Services\Pricing;

use App\Models\Order;
use App\Models\PriceRule;
use Illuminate\Support\Collection;

/**
 * Prices an order with the admin's price list: each garment line (unit price x quantity, a sport's own price first),
 * the extras (names and numbers printing per player, per-garment or per-order extras, automatic or chosen), shipping
 * to the destination, quantity discounts and discount codes, then tax (GST) on the subtotal for taxable destinations.
 * Everything is in whole cents, rounded half up once per amount. Anything without a price makes the quote
 * "quote_required" with a reason for each, so staff price it before an invoice is issued.
 */
class PricingService
{
    /** Garment rows a quote request may hold. */
    public const MAX_ITEMS = 30;

    /** @var Collection<int, PriceRule>|null */
    private ?Collection $rules = null;

    /** Rules for the customer's pricing choices sent with an order (`pricing` in the submit body). */
    public static function choiceRules(string $field = 'pricing'): array
    {
        return [
            $field => ['sometimes', 'nullable', 'array'],
            "$field.destination" => ['sometimes', 'nullable', 'string', 'max:20', 'regex:/^[A-Za-z0-9_-]+$/'],
            "$field.extras" => ['sometimes', 'nullable', 'array', 'max:20'],
            "$field.extras.*" => ['string', 'max:40', 'regex:/^[A-Za-z0-9_-]+$/'],
            "$field.discount_code" => ['sometimes', 'nullable', 'string', 'max:40'],
        ];
    }

    /** The choices tidied for saving: destination and discount code upper case, extra codes lower case; null if none. */
    public static function cleanChoices(mixed $choices): ?array
    {
        if (is_string($choices)) {
            $choices = json_decode($choices, true);
        }
        if (! is_array($choices)) {
            return null;
        }
        $extras = array_values(array_unique(array_filter(array_map(
            fn ($code) => is_string($code) ? strtolower(trim($code)) : null, (array) ($choices['extras'] ?? [])))));
        $clean = array_filter([
            'destination' => filled($choices['destination'] ?? null) ? strtoupper(trim((string) $choices['destination'])) : null,
            'extras' => $extras ?: null,
            'discount_code' => filled($choices['discount_code'] ?? null) ? strtoupper(trim((string) $choices['discount_code'])) : null,
        ], fn ($value) => $value !== null);

        return $clean ?: null;
    }

    /** Garments that can have a price: the order form's and the Studio's (e.g. Full Kit). */
    public static function garments(): array
    {
        $garments = Order::GARMENTS;
        foreach (config('catalog.garments', []) as $garment) {
            $garments[$garment['id']] ??= $garment['name'];
        }

        return $garments;
    }

    /** What a garment row is called: "Rugby League Jersey", or the row's own label. */
    public static function itemName(array $item): string
    {
        if (filled($item['label'] ?? null)) {
            return (string) $item['label'];
        }
        $sport = collect(config('catalog.sports'))->firstWhere('id', $item['sport'] ?? null)['name'] ?? null;

        return trim(($sport ? $sport.' ' : '').(self::garments()[$item['garment'] ?? 'other'] ?? 'Garment'));
    }

    /**
     * The quote request for an order as it is now: its garment rows (or, for "Order this kit", the kit's garment and
     * sizes), the printed names, the customer's choices and the delivery address.
     */
    public function requestFor(Order $order): array
    {
        $items = [];
        if (is_array($order->items) && $order->items !== []) {
            foreach ($order->items as $item) {
                $items[] = $item + ['quantity' => array_sum(array_map('intval', (array) ($item['sizes'] ?? [])))];
            }
        } elseif ((int) $order->quantity > 0 && ($order->design_snapshot || $order->project_id || $order->source === 'studio' || $order->source === 'admin')) {
            $kit = $order->design_snapshot ?: ($order->project ? $order->project->only(['name', 'garment', 'sport']) : []);
            $players = is_array($order->players) ? $order->players : [];
            $named = fn ($p) => filled($p['name'] ?? null) || filled($p['number'] ?? null);
            $names = match ($order->names) {
                'same' => isset($players[0]) && $named($players[0]) ? (int) $order->quantity : 0,
                'list' => count(array_filter($players, $named)),
                default => 0,
            };
            // The sport's garment tile the kit was made as ("Netball dress", task 9.99) names the line.
            $items[] = ['garment' => $kit['garment'] ?? 'jersey', 'sport' => $kit['sport'] ?? null] + (filled($kit['design']['productName'] ?? null) ? ['label' => (string) $kit['design']['productName']] : []) + ['kit' => $kit['name'] ?? null,
                'quantity' => (int) $order->quantity, 'names' => $names];
        }

        return [
            'items' => $items,
            'pricing' => self::cleanChoices($order->getAttributes()['pricing'] ?? null),
            'shipping_address' => $order->shipping_address,
            // A unit price staff typed on the order (the older way of quoting) wins over the price list.
            'unit_price_cents' => $order->unit_price === null ? null : Money::toCents((string) $order->unit_price),
        ];
    }

    /**
     * Prices a request: {items: [{garment, sport, label, sizes|quantity, players|names}], pricing: {destination,
     * extras, discount_code}, shipping_address, unit_price_cents}. Staff overrides (when issuing an invoice):
     * lines => [line key => unit cents], shipping => cents, custom_lines => [{name, quantity, unit_cents}],
     * discount => cents off. Amounts in the result are cents; present() turns them into the API's shape.
     */
    public function quote(array $request, array $overrides = []): array
    {
        $settings = BillingSettings::all();
        $currency = BillingSettings::currency();
        $choices = self::cleanChoices($request['pricing'] ?? null) ?? [];
        $reasons = [];
        $lines = [];
        $quantity = 0;
        $names = 0;

        // The same garment in more than one fit (a team's mens, womens and kids rows) names its fit on each line.
        $sameName = array_count_values(array_map(fn ($item) => is_array($item) ? self::itemName($item) : '', array_values($request['items'] ?? [])));
        foreach (array_values($request['items'] ?? []) as $i => $item) {
            if (! is_array($item)) {
                continue;
            }
            $key = "item-$i";
            $fit = Order::FITS[$item['fit'] ?? ''] ?? null;
            $count = $this->count($item);
            $quantity += $count;
            $names += $this->names($item, $count);
            $garment = (string) ($item['garment'] ?? 'other');
            $sport = filled($item['sport'] ?? null) ? (string) $item['sport'] : null;
            $name = self::itemName($item).($fit && ($sameName[self::itemName($item)] ?? 0) > 1 ? " · {$fit}" : '').(filled($item['kit'] ?? null) ? ' ('.$item['kit'].')' : '');
            $unit = $overrides['lines'][$key] ?? $request['unit_price_cents'] ?? $this->garmentPrice($garment, $sport)?->amount_cents;
            if ($unit === null) {
                $reasons[] = $garment === 'other'
                    ? ['code' => 'custom_garment', 'message' => "“{$name}” is a custom garment: we will price it for you.", 'key' => $key]
                    : ['code' => 'garment_unpriced', 'message' => "No price is set for {$name} yet.", 'key' => $key];
            }
            $lines[] = ['key' => $key, 'kind' => 'garment', 'garment' => $garment, 'sport' => $sport, 'name' => $name, 'quantity' => $count,
                'unit_cents' => $unit === null ? null : (int) $unit, 'total_cents' => $unit === null ? null : (int) $unit * $count, 'priced' => $unit !== null];
        }
        foreach (array_values($overrides['custom_lines'] ?? []) as $i => $custom) {
            $count = max(1, (int) ($custom['quantity'] ?? 1));
            $unit = (int) ($custom['unit_cents'] ?? 0);
            $lines[] = ['key' => "custom-$i", 'kind' => 'custom', 'garment' => null, 'sport' => null, 'name' => mb_substr(trim((string) ($custom['name'] ?? 'Item')), 0, 120) ?: 'Item',
                'quantity' => $count, 'unit_cents' => $unit, 'total_cents' => $unit * $count, 'priced' => true];
            if (($custom['garments'] ?? true) !== false) {
                $quantity += $count;
            }
        }
        if ($lines === []) {
            $reasons[] = ['code' => 'no_items', 'message' => 'Our team will read your order form and price it for you.'];
        } elseif ($quantity < 1) {
            $reasons[] = ['code' => 'no_quantity', 'message' => 'Add the sizes and quantities so we can price your order.'];
        }

        $extras = $this->extras($choices['extras'] ?? [], $quantity, $names, $reasons);
        $garmentsTotal = $this->sum($lines);
        $extrasTotal = $this->sum($extras);
        $goods = $garmentsTotal + $extrasTotal;

        // Nothing to price yet (an uploaded order form): staff price it all, so no more reasons.
        $shipping = $this->shipping($request, $choices, $quantity, $settings, $overrides, $lines !== [], $reasons);
        $discounts = $this->discounts($choices['discount_code'] ?? null, $quantity, $goods, $overrides);
        $discountTotal = min($goods, array_sum(array_column($discounts['lines'], 'amount_cents')));

        $priced = $reasons === [];
        $subtotal = $priced ? $goods + ($shipping['amount_cents'] ?? 0) - $discountTotal : null;
        $rate = (string) (float) $settings['tax_rate'];
        $taxApplies = (float) $rate > 0 && ($shipping['taxable'] ?? true);
        $tax = $subtotal === null ? null : ($taxApplies ? Money::percentOf($subtotal, $rate) : 0);

        return [
            'status' => $priced ? 'priced' : 'quote_required',
            'currency' => $currency,
            'quantity' => $quantity,
            'lines' => $lines,
            'extras' => $extras,
            'garments_total_cents' => $garmentsTotal,
            'extras_total_cents' => $extrasTotal,
            'shipping' => $shipping,
            'discounts' => $discounts['lines'],
            'discount_total_cents' => $discountTotal,
            'subtotal_cents' => $subtotal,
            'tax' => ['name' => (string) $settings['tax_name'] ?: 'Tax', 'rate' => $rate, 'amount_cents' => $tax, 'applies' => $taxApplies],
            'total_cents' => $subtotal === null ? null : $subtotal + $tax,
            'reasons' => $reasons,
            'discount_code' => $discounts['code'],
        ];
    }

    /** A quote in the API's shape: amounts as "1870.00" strings. */
    public static function present(?array $quote): ?array
    {
        if ($quote === null) {
            return null;
        }
        $line = fn (array $l) => array_diff_key($l, array_flip(['unit_cents', 'total_cents'])) + ['unit_price' => Money::decimal($l['unit_cents']), 'total' => Money::decimal($l['total_cents'])];
        $shipping = $quote['shipping'];

        return [
            'status' => $quote['status'],
            'currency' => $quote['currency'],
            'quantity' => $quote['quantity'],
            'lines' => array_map($line, $quote['lines']),
            'extras' => array_map($line, $quote['extras']),
            'garments_total' => Money::decimal($quote['garments_total_cents']),
            'extras_total' => Money::decimal($quote['extras_total_cents']),
            'shipping' => $shipping ? ['destination' => $shipping['destination'], 'name' => $shipping['name'], 'amount' => Money::decimal($shipping['amount_cents']),
                'priced' => $shipping['priced'], 'taxable' => $shipping['taxable']] : null,
            'discounts' => array_map(fn ($d) => ['name' => $d['name'], 'code' => $d['code'], 'amount' => Money::decimal($d['amount_cents'])], $quote['discounts']),
            'discount_total' => Money::decimal($quote['discount_total_cents']),
            'subtotal' => Money::decimal($quote['subtotal_cents']),
            'tax' => ['name' => $quote['tax']['name'], 'rate' => $quote['tax']['rate'], 'amount' => Money::decimal($quote['tax']['amount_cents']),
                'included' => false, 'applies' => $quote['tax']['applies']],
            'total' => Money::decimal($quote['total_cents']),
            'reasons' => array_values($quote['reasons']),
            'discount_code' => $quote['discount_code'],
        ];
    }

    /** What the order form shows: prices, extras, destinations, discounts, tax and the payment rule. */
    public function options(): array
    {
        $rules = $this->rules();
        $settings = BillingSettings::all();

        return [
            'currency' => BillingSettings::currency(),
            'tax' => ['name' => $settings['tax_name'], 'rate' => (string) (float) $settings['tax_rate'], 'included' => false],
            'garments' => $rules->where('kind', 'garment')->map(fn (PriceRule $r) => ['garment' => $r->code, 'sport' => $r->sport,
                'name' => self::itemName(['garment' => $r->code, 'sport' => $r->sport]), 'unit_price' => Money::decimal($r->amount_cents)])->values(),
            'extras' => $rules->where('kind', 'extra')->map(fn (PriceRule $r) => ['code' => $r->code, 'name' => $r->name, 'unit' => $r->unit ?: 'order',
                'unit_price' => Money::decimal($r->amount_cents), 'auto' => $r->auto])->values(),
            'destinations' => $rules->where('kind', 'shipping')->map(fn (PriceRule $r) => ['code' => $r->code, 'name' => $r->name])->values(),
            'default_destination' => $settings['default_destination'] ?: null,
            'discount_codes' => $rules->where('kind', 'discount')->whereNotNull('code')->isNotEmpty(),
            'tiers' => $rules->where('kind', 'discount')->whereNull('code')->sortBy('min_quantity')
                ->map(fn (PriceRule $r) => ['name' => $r->name, 'min_quantity' => $r->min_quantity ?? 0, 'percent' => $r->percent === null ? null : (string) (float) $r->percent,
                    'amount' => $r->percent === null ? Money::decimal($r->amount_cents) : null])->values(),
            'payment_rule' => ['rule' => $settings['payment_rule'], 'deposit_percent' => (int) $settings['deposit_percent']],
        ];
    }

    /** The active price list, read once. */
    private function rules(): Collection
    {
        return $this->rules ??= PriceRule::query()->active()->orderBy('kind')->orderBy('sort')->orderBy('id')->get();
    }

    private function garmentPrice(string $garment, ?string $sport): ?PriceRule
    {
        $rules = $this->rules()->where('kind', 'garment')->where('code', $garment);

        return ($sport ? $rules->firstWhere('sport', $sport) : null) ?? $rules->first(fn (PriceRule $r) => $r->sport === null);
    }

    /** A row's garments: its quantity, or its sizes added up (0 to 10000 each). */
    private function count(array $item): int
    {
        if (isset($item['sizes']) && is_array($item['sizes'])) {
            return array_sum(array_map(fn ($n) => max(0, min(10000, (int) $n)), $item['sizes']));
        }

        return max(0, min(100000, (int) ($item['quantity'] ?? 0)));
    }

    /** Names and numbers to print on a row: its players with a name or a number (at most one per garment). */
    private function names(array $item, int $count): int
    {
        if (isset($item['names'])) {
            return max(0, (int) $item['names']);
        }
        $players = is_array($item['players'] ?? null) ? $item['players'] : [];
        $named = count(array_filter($players, fn ($p) => is_array($p) && (filled($p['name'] ?? null) || filled($p['number'] ?? null))));

        return $count > 0 ? min($named, $count) : $named;
    }

    /** The extras that apply: automatic ones (when they apply) and the ones the customer chose. */
    private function extras(array $chosen, int $quantity, int $names, array &$reasons): array
    {
        $extras = [];
        $rules = $this->rules()->where('kind', 'extra');
        foreach ($rules as $rule) {
            $unit = $rule->unit ?: 'order';
            $picked = in_array(strtolower((string) $rule->code), $chosen, true);
            if (! $rule->auto && ! $picked) {
                continue;
            }
            $count = match ($unit) {
                'player' => $names,
                'garment' => $quantity,
                default => 1,
            };
            if ($count < 1) {
                continue;
            }
            $extras[] = ['key' => 'extra-'.$rule->code, 'kind' => 'extra', 'code' => $rule->code, 'name' => $rule->name, 'unit' => $unit, 'quantity' => $count,
                'unit_cents' => $rule->amount_cents, 'total_cents' => $rule->amount_cents * $count, 'priced' => true];
        }
        $known = $rules->pluck('code')->map(fn ($c) => strtolower((string) $c))->all();
        foreach (array_diff($chosen, $known) as $code) {
            $reasons[] = ['code' => 'extra_unpriced', 'message' => "The extra “{$code}” has no price yet: we will price it for you.", 'key' => 'extra-'.$code];
            $extras[] = ['key' => 'extra-'.$code, 'kind' => 'extra', 'code' => $code, 'name' => $code, 'unit' => 'order', 'quantity' => 1,
                'unit_cents' => null, 'total_cents' => null, 'priced' => false];
        }

        return $extras;
    }

    /** Shipping to the chosen destination, else the one the address names, else the default destination. */
    private function shipping(array $request, array $choices, int $quantity, array $settings, array $overrides, bool $explain, array &$reasons): array
    {
        $rules = $this->rules()->where('kind', 'shipping');
        $code = $choices['destination']
            ?? self::destinationFromAddress((string) ($request['shipping_address'] ?? ''), $rules->pluck('name', 'code')->all())
            ?? (filled($settings['default_destination']) ? strtoupper((string) $settings['default_destination']) : null);
        $rule = $code ? $rules->first(fn (PriceRule $r) => strtoupper((string) $r->code) === $code) : null;
        // The admin may use another code for a known place ("AUS" for Australia): match it by name.
        if (! $rule && isset(self::DESTINATIONS[$code])) {
            $rule = $rules->first(fn (PriceRule $r) => strcasecmp(trim($r->name), self::DESTINATIONS[$code]) === 0);
            $code = $rule ? strtoupper((string) $rule->code) : $code;
        }
        $amount = $rule ? $rule->amount_cents + $rule->per_item_cents * $quantity : null;
        // Picking the order up (Upload Your Order's Pick up) costs nothing to ship, unless the price list prices it.
        if (! $rule && $code === 'PICKUP') {
            $amount = 0;
        }
        if (isset($overrides['shipping']) && $overrides['shipping'] !== null) {
            $amount = (int) $overrides['shipping'];
        }
        $name = $rule?->name ?? ($code ? (self::DESTINATIONS[$code] ?? $code) : 'Delivery');
        if ($amount === null && $explain) {
            $reasons[] = ['code' => 'shipping_unpriced', 'message' => $code ? "No delivery price is set for {$name} yet: we will price it for you." : 'Choose where the order is delivered.', 'key' => 'shipping'];
        }

        return ['destination' => $code, 'name' => $name, 'amount_cents' => $amount, 'priced' => $amount !== null, 'taxable' => $rule ? $rule->taxable : true];
    }

    /** Names for destination codes the admin has not named. */
    public const DESTINATIONS = ['AU' => 'Australia', 'NZ' => 'New Zealand', 'INTL' => 'International', 'PICKUP' => 'Pick up'];

    /**
     * The destination an address names: one of the admin's destinations named in full ([code => name], e.g.
     * "Fiji"), else New Zealand, else Australia (the word, or a state with a 4-digit postcode); null if none.
     */
    public static function destinationFromAddress(string $address, array $destinations = []): ?string
    {
        $text = ' '.strtoupper(trim((string) preg_replace('/[^A-Za-z0-9]+/', ' ', $address))).' ';
        if (trim($text) === '') {
            return null;
        }
        foreach ($destinations as $code => $name) {
            $name = strtoupper(trim((string) preg_replace('/[^A-Za-z0-9]+/', ' ', (string) $name)));
            if (strlen($name) >= 4 && str_contains($text, ' '.$name.' ')) {
                return strtoupper((string) $code);
            }
        }
        // Upload Your Order's pick-up note (App\Support\OrderDelivery::PICKUP_TEXT).
        if (str_starts_with($text, ' PICK UP FROM 3DEEZI ')) {
            return 'PICKUP';
        }
        if (str_contains($text, ' NEW ZEALAND ') || preg_match('/ (NZ|AOTEAROA) /', $text)) {
            return 'NZ';
        }
        if (str_contains($text, ' AUSTRALIA') || preg_match('/ (NSW|VIC|QLD|TAS|ACT|NT|SA|WA) [0-9]{4} /', $text) || preg_match('/ (NSW|VIC|QLD|TAS) /', $text)
            || preg_match('/ (NEW SOUTH WALES|VICTORIA|QUEENSLAND|TASMANIA|NORTHERN TERRITORY|AUSTRALIAN CAPITAL TERRITORY) /', $text)) {
            return 'AU';
        }
        // Another country: international (priced only if the admin has an INTL rate; else a quote).
        if (preg_match('/ ('.implode('|', self::ABROAD).') /', $text)) {
            return 'INTL';
        }

        return null;
    }

    /** Countries an address may name that are neither Australia nor New Zealand (words in upper case). */
    private const ABROAD = ['FIJI', 'SAMOA', 'TONGA', 'PAPUA NEW GUINEA', 'PNG', 'COOK ISLANDS', 'VANUATU', 'SOLOMON ISLANDS', 'NEW CALEDONIA',
        'UNITED KINGDOM', 'UK', 'ENGLAND', 'SCOTLAND', 'IRELAND', 'FRANCE', 'GERMANY', 'ITALY', 'SPAIN', 'NETHERLANDS',
        'UNITED STATES', 'USA', 'CANADA', 'SOUTH AFRICA', 'SINGAPORE', 'MALAYSIA', 'INDONESIA', 'PHILIPPINES', 'JAPAN', 'CHINA',
        'HONG KONG', 'INDIA', 'THAILAND', 'VIETNAM', 'KOREA', 'UAE', 'UNITED ARAB EMIRATES'];

    /** The best quantity discount that applies, a valid discount code, and a discount staff typed. */
    private function discounts(?string $code, int $quantity, int $goods, array $overrides): array
    {
        $lines = [];
        $rules = $this->rules()->where('kind', 'discount');
        $amountOf = fn (PriceRule $r) => $r->percent !== null ? Money::percentOf($goods, (string) $r->percent) : min($goods, $r->amount_cents);
        $tier = $rules->whereNull('code')->filter(fn (PriceRule $r) => $quantity >= (int) ($r->min_quantity ?? 0) && $quantity > 0)
            ->sortByDesc(fn (PriceRule $r) => [(int) $r->min_quantity, $amountOf($r)])->first();
        if ($tier && $amountOf($tier) > 0) {
            $lines[] = ['name' => $tier->name, 'code' => null, 'amount_cents' => $amountOf($tier)];
        }
        $result = null;
        if ($code) {
            $rule = $rules->first(fn (PriceRule $r) => $r->code !== null && strtoupper($r->code) === strtoupper($code));
            if (! $rule) {
                $result = ['code' => $code, 'valid' => false, 'message' => 'This discount code is not valid.'];
            } elseif ($quantity < (int) ($rule->min_quantity ?? 0)) {
                $result = ['code' => $code, 'valid' => false, 'message' => "This code needs at least {$rule->min_quantity} garments."];
            } else {
                $result = ['code' => $code, 'valid' => true, 'message' => null];
                if ($amountOf($rule) > 0) {
                    $lines[] = ['name' => $rule->name, 'code' => strtoupper($rule->code), 'amount_cents' => $amountOf($rule)];
                }
            }
        }
        if (! empty($overrides['discount'])) {
            $lines[] = ['name' => 'Discount', 'code' => null, 'amount_cents' => min($goods, (int) $overrides['discount'])];
        }

        return ['lines' => $lines, 'code' => $result];
    }

    private function sum(array $lines): int
    {
        return array_sum(array_map(fn ($l) => (int) ($l['total_cents'] ?? 0), $lines));
    }
}
