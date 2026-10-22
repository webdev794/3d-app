<?php

namespace App\Support;

/**
 * Upload Your Order's date required, mobile and delivery (client 2026-10-22): the customer delivers to an address or
 * picks the order up. The address is kept on the order as one text (orders.shipping_address), so every order view,
 * the invoice and the shipping price read it as before. The website (OrderUpload.tsx) and the app (order_entry.dart)
 * check the same rules.
 */
class OrderDelivery
{
    public const METHODS = ['deliver', 'pickup'];

    public const ADDRESS_FIELDS = ['street', 'suburb', 'state', 'postcode', 'country'];

    public const AU_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];

    public const DEFAULT_COUNTRY = 'Australia';

    /** The order's shipping_address for a pick-up (the shipping price reads "Pick up" from it). */
    public const PICKUP_TEXT = 'Pick up from 3DEEZI (no delivery)';

    public const MOBILE_MESSAGE = 'Enter a mobile number, e.g. 0412 345 678 or +61 412 345 678.';

    /** Admin › Settings: the usual production and delivery time in weeks (a date required sooner gets a warning). */
    public const LEAD_WEEKS_SETTING = 'production_lead_weeks';

    public const LEAD_WEEKS_DEFAULT = 4;

    /** The production lead time in weeks (0 to 52), as saved in Admin › Settings, else 4. */
    public static function leadWeeks(): int
    {
        try {
            $value = \App\Models\Setting::whereKey(self::LEAD_WEEKS_SETTING)->value('value');
        } catch (\Throwable) {
            $value = null;   // no settings table yet
        }

        return is_numeric($value) ? max(0, min(52, (int) $value)) : self::LEAD_WEEKS_DEFAULT;
    }

    /**
     * A sensible phone number: Australian (04xx xxx xxx, 02 xxxx xxxx, +61 4xx xxx xxx) or international (+ and 8 to 15
     * digits). Spaces, brackets, dots and dashes are fine.
     */
    public static function validMobile(?string $phone): bool
    {
        $phone = trim((string) $phone);
        if ($phone === '' || strlen($phone) > 40 || ! preg_match('/^\+?[\d\s().-]+$/', $phone)) {
            return false;
        }
        $plain = (string) preg_replace('/[\s().-]/', '', $phone);
        if (str_starts_with($plain, '+61')) {
            return (bool) preg_match('/^\+610?\d{9}$/', $plain);
        }
        if (str_starts_with($plain, '0')) {
            return (bool) preg_match('/^0\d{9}$/', $plain);
        }

        return (bool) preg_match('/^\+?\d{8,15}$/', $plain);
    }

    public static function isAustralia(?string $country): bool
    {
        return in_array(strtolower(trim((string) $country)), ['australia', 'au', 'aus'], true);
    }

    /**
     * What is wrong with a delivery address, by field (empty when it is fine): street, suburb and country always;
     * an Australian address also needs its state and a 4-digit postcode.
     */
    public static function addressErrors(mixed $address): array
    {
        $a = is_array($address) ? $address : [];
        $get = fn (string $k) => trim(is_scalar($a[$k] ?? null) ? (string) $a[$k] : '');
        $errors = [];
        if ($get('street') === '') {
            $errors['street'] = 'Add the street address for delivery.';
        }
        if ($get('suburb') === '') {
            $errors['suburb'] = 'Add the suburb or town.';
        }
        $country = $get('country');
        if ($country === '') {
            $errors['country'] = 'Add the country.';
        }
        if (self::isAustralia($country) || $country === '') {
            if (! in_array(strtoupper($get('state')), self::AU_STATES, true)) {
                $errors['state'] = 'Choose the state.';
            }
            if (! preg_match('/^\d{4}$/', $get('postcode'))) {
                $errors['postcode'] = 'Enter the 4-digit postcode.';
            }
        } elseif ($get('postcode') !== '' && ! preg_match('/^[A-Za-z0-9 -]{2,10}$/', $get('postcode'))) {
            $errors['postcode'] = 'Check the postcode.';
        }

        return $errors;
    }

    /**
     * The price list's destination for the choice: PICKUP, AU, NZ or INTL (PricingService finds the admin's own code for
     * these by name); null when there is no choice or no country.
     */
    public static function destination(?string $method, mixed $address): ?string
    {
        if ($method === 'pickup') {
            return 'PICKUP';
        }
        $country = trim(is_array($address) && is_scalar($address['country'] ?? null) ? (string) $address['country'] : '');
        if ($method !== 'deliver' || $country === '') {
            return null;
        }
        if (self::isAustralia($country)) {
            return 'AU';
        }

        return preg_match('/^(new zealand|nz|aotearoa)$/i', $country) ? 'NZ' : 'INTL';
    }

    /** The order's shipping_address text: the address on three lines, or the pick-up note. */
    public static function text(?string $method, mixed $address): ?string
    {
        if ($method === 'pickup') {
            return self::PICKUP_TEXT;
        }
        if ($method !== 'deliver' || ! is_array($address)) {
            return null;
        }
        $get = fn (string $k) => trim(is_scalar($address[$k] ?? null) ? (string) $address[$k] : '');
        $line2 = trim(implode(' ', array_filter([$get('suburb'), strtoupper($get('state')), $get('postcode')], fn ($v) => $v !== '')));
        $lines = array_filter([$get('street'), $line2, $get('country') ?: self::DEFAULT_COUNTRY], fn ($v) => $v !== '');

        return $lines ? mb_substr(implode("\n", $lines), 0, 1000) : null;
    }
}
