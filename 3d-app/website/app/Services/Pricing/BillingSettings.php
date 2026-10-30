<?php

namespace App\Services\Pricing;

use App\Models\Setting;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * The seller details printed on invoices and the billing options, set under Admin > Pricing: business name, ABN,
 * address, email, phone, logo, currency, tax (GST 10%), the default delivery destination, invoice numbers and
 * payment terms, bank details for transfers, and the rule for paying before production.
 * Kept as one JSON value in the settings table (key "billing").
 */
final class BillingSettings
{
    public const KEY = 'billing';

    /** Where the logo is kept (local disk: storage/app/private). */
    public const LOGO_DIR = 'billing';

    /** Paying before Production: no rule, a deposit, or the whole invoice. */
    public const RULES = ['none', 'deposit', 'full'];

    private static ?array $cache = null;

    public static function defaults(): array
    {
        return [
            'business_name' => (string) config('app.name', '3DEEZI'),
            'abn' => '',
            'address' => '',
            'email' => '',
            'phone' => '',
            'website' => '',
            'logo' => null,
            'currency' => 'AUD',
            'tax_name' => 'GST',
            'tax_rate' => '10',
            'default_destination' => 'AU',
            'invoice_start' => 1001,
            'due_days' => 14,
            'invoice_note' => 'Artwork approval is required before production.',
            'bank_details' => '',
            // The client's rule: orders are paid in full before Production (staff can change it).
            'payment_rule' => 'full',
            'deposit_percent' => 50,
        ];
    }

    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $saved = [];
        try {
            if (Schema::hasTable('settings')) {
                $saved = json_decode((string) Setting::query()->whereKey(self::KEY)->value('value'), true) ?: [];
            }
        } catch (Throwable) {
            // No database yet: the defaults.
        }

        return self::$cache = array_merge(self::defaults(), array_intersect_key($saved, self::defaults()));
    }

    public static function get(string $key): mixed
    {
        return self::all()[$key] ?? null;
    }

    /** Saves the given values over the current ones; returns them all. */
    public static function save(array $values): array
    {
        $merged = array_merge(self::all(), array_intersect_key($values, self::defaults()));
        Setting::query()->updateOrCreate(['key' => self::KEY], ['value' => json_encode($merged, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]);
        self::$cache = null;

        return self::all();
    }

    /** Forgets the values read in this request (tests, and after a save). */
    public static function flush(): void
    {
        self::$cache = null;
    }

    public static function currency(): string
    {
        $currency = strtoupper((string) self::get('currency'));

        return in_array($currency, Money::CURRENCIES, true) ? $currency : 'AUD';
    }

    /** The seller as printed on an invoice. */
    public static function seller(): array
    {
        $all = self::all();

        return ['name' => $all['business_name'] ?: (string) config('app.name', '3DEEZI'), 'abn' => $all['abn'], 'address' => $all['address'],
            'email' => $all['email'], 'phone' => $all['phone'], 'website' => $all['website']];
    }

    /** The logo file's bytes and type, or null. */
    public static function logo(): ?array
    {
        $path = self::get('logo');
        try {
            if (! $path || ! Storage::disk('local')->exists($path)) {
                return null;
            }
            $bytes = Storage::disk('local')->get($path);
        } catch (Throwable) {
            return null;
        }
        $type = str_ends_with($path, '.png') ? 'image/png' : 'image/jpeg';

        return $bytes === null ? null : ['bytes' => $bytes, 'type' => $type];
    }

    public static function logoDataUrl(): ?string
    {
        $logo = self::logo();

        return $logo ? 'data:'.$logo['type'].';base64,'.base64_encode($logo['bytes']) : null;
    }
}
