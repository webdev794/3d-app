<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\PriceRule;
use App\Services\Payments\Gateways;
use App\Services\Pricing\BillingSettings;
use App\Services\Pricing\Money;
use App\Services\Pricing\PricingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Admin > Pricing: the price list (garments, extras, shipping destinations, discounts), tax and currency, the seller
 * details printed on invoices (business name, ABN, address, email, logo), payment terms, and the online payment
 * setup (Stripe keys are in .env; shown here as set or not).
 */
class PricingAdminController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->state()]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'business_name' => ['required', 'string', 'max:120'],
            'abn' => ['nullable', 'string', 'max:30', 'regex:/^[0-9 ]*$/'],
            'address' => ['nullable', 'string', 'max:500'],
            'email' => ['nullable', 'email', 'max:190'],
            'phone' => ['nullable', 'string', 'max:40'],
            'website' => ['nullable', 'string', 'max:190'],
            'currency' => ['required', Rule::in(Money::CURRENCIES)],
            'tax_name' => ['required', 'string', 'max:20'],
            'tax_rate' => ['required', 'numeric', 'min:0', 'max:50', 'decimal:0,2'],
            'default_destination' => ['nullable', 'string', 'max:20', 'regex:/^[A-Za-z0-9_-]+$/'],
            'invoice_start' => ['required', 'integer', 'min:1', 'max:99999999'],
            'due_days' => ['required', 'integer', 'min:0', 'max:365'],
            'invoice_note' => ['nullable', 'string', 'max:1000'],
            'bank_details' => ['nullable', 'string', 'max:500'],
            'payment_rule' => ['required', Rule::in(BillingSettings::RULES)],
            'deposit_percent' => ['required', 'integer', 'min:1', 'max:99'],
        ], ['abn.regex' => 'The ABN is digits (spaces are fine).']);
        $data = array_map(fn ($v) => is_string($v) ? trim($v) : $v, $data);
        $data['default_destination'] = filled($data['default_destination'] ?? null) ? strtoupper($data['default_destination']) : '';
        $data['tax_rate'] = (string) (float) $data['tax_rate'];
        foreach (['abn', 'address', 'email', 'phone', 'website', 'invoice_note', 'bank_details'] as $key) {
            $data[$key] = (string) ($data[$key] ?? '');
        }
        BillingSettings::save($data);

        return response()->json(['data' => $this->state()]);
    }

    public function storeRule(Request $request): JsonResponse
    {
        $rule = new PriceRule;
        $this->fillRule($rule, $request);

        return response()->json(['data' => $this->presentRule($rule)], 201);
    }

    public function updateRule(Request $request, PriceRule $rule): JsonResponse
    {
        $this->fillRule($rule, $request);

        return response()->json(['data' => $this->presentRule($rule)]);
    }

    public function destroyRule(PriceRule $rule): JsonResponse
    {
        $rule->delete();

        return response()->json(['data' => ['message' => 'Price removed.']]);
    }

    /** The logo printed on invoices: PNG or JPEG, up to 2 MB. Kept as it is, plus a JPEG copy on white for PDFs. */
    public function uploadLogo(Request $request): JsonResponse
    {
        $request->validate(['logo' => ['required', 'file', 'mimes:png,jpg,jpeg', 'max:2048']], ['logo.mimes' => 'Choose a PNG or JPEG picture.']);
        $bytes = (string) file_get_contents($request->file('logo')->getRealPath());
        $info = @getimagesizefromstring($bytes);
        if (! $info || ! in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_JPEG], true)) {
            throw ValidationException::withMessages(['logo' => 'This picture could not be read. Choose a PNG or JPEG.']);
        }
        $path = BillingSettings::LOGO_DIR.'/logo'.($info[2] === IMAGETYPE_PNG ? '.png' : '.jpg');
        // PDFs read JPEG best: a PNG (with transparency) is put on white when the server can (GD).
        if ($info[2] === IMAGETYPE_PNG && function_exists('imagecreatefromstring') && ($image = @imagecreatefromstring($bytes))) {
            [$w, $h] = [imagesx($image), imagesy($image)];
            $scale = min(1, 800 / max(1, $w));
            $canvas = imagecreatetruecolor(max(1, (int) round($w * $scale)), max(1, (int) round($h * $scale)));
            imagefill($canvas, 0, 0, imagecolorallocate($canvas, 255, 255, 255));
            imagecopyresampled($canvas, $image, 0, 0, 0, 0, imagesx($canvas), imagesy($canvas), $w, $h);
            ob_start();
            imagejpeg($canvas, null, 90);
            $bytes = (string) ob_get_clean();
            $path = BillingSettings::LOGO_DIR.'/logo.jpg';
        }
        $old = BillingSettings::get('logo');
        if ($old && $old !== $path) {
            Storage::disk('local')->delete($old);
        }
        Storage::disk('local')->put($path, $bytes);
        BillingSettings::save(['logo' => $path]);

        return response()->json(['data' => $this->state()]);
    }

    public function deleteLogo(): JsonResponse
    {
        if ($old = BillingSettings::get('logo')) {
            Storage::disk('local')->delete($old);
        }
        BillingSettings::save(['logo' => null]);

        return response()->json(['data' => $this->state()]);
    }

    private function fillRule(PriceRule $rule, Request $request): void
    {
        $kind = $rule->exists ? $rule->kind : $request->input('kind');
        $garments = array_keys(PricingService::garments());
        $sports = array_column(config('catalog.sports', []), 'id');
        $money = ['nullable', 'numeric', 'min:0', 'max:1000000', 'decimal:0,2'];
        $data = $request->validate([
            'kind' => [$rule->exists ? 'sometimes' : 'required', Rule::in(PriceRule::KINDS)],
            'name' => [$kind === 'garment' ? 'nullable' : 'required', 'string', 'max:120'],
            'code' => match ($kind) {
                'garment' => ['required', Rule::in($garments)],
                'extra', 'shipping' => ['required', 'string', 'max:40', 'regex:/^[A-Za-z0-9_-]+$/'],
                default => ['nullable', 'string', 'max:40', 'regex:/^[A-Za-z0-9_-]+$/'],
            },
            'sport' => ['nullable', Rule::in($sports)],
            'price' => $kind === 'discount' ? $money : ['required', ...array_slice($money, 1)],
            'per_item' => $money,
            'percent' => ['nullable', 'numeric', 'min:0', 'max:100', 'decimal:0,2'],
            'unit' => [$kind === 'extra' ? 'required' : 'nullable', Rule::in(PriceRule::UNITS)],
            'auto' => ['sometimes', 'boolean'],
            'min_quantity' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'taxable' => ['sometimes', 'boolean'],
            'active' => ['sometimes', 'boolean'],
            'sort' => ['sometimes', 'integer', 'min:0', 'max:100000'],
        ], ['code.in' => 'Choose a garment.', 'code.regex' => 'The code is letters, digits, - or _.', 'price.required' => 'Enter a price.']);

        $code = match ($kind) {
            'garment' => $data['code'],
            'extra' => strtolower(trim($data['code'])),
            default => filled($data['code'] ?? null) ? strtoupper(trim($data['code'])) : null,
        };
        $sport = $kind === 'garment' ? ($data['sport'] ?? null) : null;
        if ($kind === 'discount' && ! filled($data['percent'] ?? null) && ! filled($data['price'] ?? null)) {
            throw ValidationException::withMessages(['percent' => 'Enter a percentage or an amount off.']);
        }
        // One price per garment (and sport), one extra / destination / discount code each.
        $taken = PriceRule::query()->where('kind', $kind)->where('code', $code)->when($kind === 'garment', fn ($q) => $sport ? $q->where('sport', $sport) : $q->whereNull('sport'))
            ->when($rule->exists, fn ($q) => $q->whereKeyNot($rule->id))->exists();
        if ($code !== null && $taken) {
            throw ValidationException::withMessages(['code' => match ($kind) {
                'garment' => 'This garment already has a price'.($sport ? ' for this sport' : ' for every sport').'. Edit that one.',
                'extra' => 'An extra with this code exists.',
                'shipping' => 'This destination already has a rate.',
                default => 'A discount with this code exists.',
            }]);
        }
        $rule->forceFill([
            'kind' => $kind,
            'code' => $code,
            'sport' => $sport,
            'name' => trim((string) ($data['name'] ?? '')) ?: ($kind === 'garment' ? PricingService::itemName(['garment' => $code, 'sport' => $sport]) : (string) $code),
            'amount_cents' => (int) (Money::toCents($data['price'] ?? null) ?? 0),
            'per_item_cents' => $kind === 'shipping' ? (int) (Money::toCents($data['per_item'] ?? null) ?? 0) : 0,
            'percent' => $kind === 'discount' && filled($data['percent'] ?? null) ? $data['percent'] : null,
            'unit' => $kind === 'extra' ? $data['unit'] : null,
            'auto' => $kind === 'extra' ? (bool) ($data['auto'] ?? $rule->auto ?? false) : false,
            'min_quantity' => $kind === 'discount' ? ($data['min_quantity'] ?? null) : null,
            'taxable' => $kind === 'shipping' ? (bool) ($data['taxable'] ?? $rule->taxable ?? true) : true,
            'active' => (bool) ($data['active'] ?? $rule->active ?? true),
            'sort' => (int) ($data['sort'] ?? $rule->sort ?? 0),
        ])->save();
    }

    private function presentRule(PriceRule $rule): array
    {
        return [
            'id' => $rule->id, 'kind' => $rule->kind, 'code' => $rule->code, 'sport' => $rule->sport, 'name' => $rule->name,
            'price' => Money::decimal($rule->amount_cents), 'per_item' => Money::decimal($rule->per_item_cents),
            'percent' => $rule->percent === null ? null : (string) (float) $rule->percent, 'unit' => $rule->unit, 'auto' => $rule->auto,
            'min_quantity' => $rule->min_quantity, 'taxable' => $rule->taxable, 'active' => $rule->active, 'sort' => $rule->sort,
        ];
    }

    private function state(): array
    {
        BillingSettings::flush();
        $mode = Gateways::mode();

        return [
            'rules' => PriceRule::query()->orderBy('kind')->orderBy('sort')->orderBy('id')->get()->map(fn (PriceRule $r) => $this->presentRule($r))->values(),
            'settings' => BillingSettings::all() + ['logo_url' => BillingSettings::logoDataUrl()],
            'garments' => collect(PricingService::garments())->map(fn ($name, $id) => ['id' => $id, 'name' => $name])->values(),
            'sports' => collect(config('catalog.sports', []))->map(fn ($s) => ['id' => $s['id'], 'name' => $s['name']])->values(),
            'currencies' => Money::CURRENCIES,
            'gateway' => [
                'mode' => $mode,
                'stripe_key' => filled(config('payments.stripe.key')),
                'stripe_secret' => filled(config('payments.stripe.secret')),
                'webhook_secret' => filled(config('payments.stripe.webhook_secret')),
                'live' => str_starts_with((string) config('payments.stripe.secret'), 'sk_live_'),
                'webhook_url' => url('/api/v1/payments/stripe/webhook'),
                'events' => ['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.processing', 'payment_intent.canceled', 'charge.refunded'],
                'environment' => app()->environment(),
            ],
        ];
    }
}
