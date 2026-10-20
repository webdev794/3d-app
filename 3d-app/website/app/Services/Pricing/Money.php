<?php

namespace App\Services\Pricing;

/** Amounts are whole cents everywhere; these turn them into "1870.00" and "AUD $1,870.00" and back. */
final class Money
{
    private const SYMBOLS = ['AUD' => '$', 'NZD' => '$', 'USD' => '$', 'CAD' => '$', 'GBP' => '£', 'EUR' => '€'];

    /** Supported invoice currencies (Stripe takes them all). */
    public const CURRENCIES = ['AUD', 'NZD', 'USD', 'GBP', 'EUR', 'CAD'];

    /** "1870.5", "1,870.50" or 1870.5 -> 187050 cents (rounded half up to the cent). */
    public static function toCents(string|int|float|null $amount): ?int
    {
        if ($amount === null || $amount === '') {
            return null;
        }
        $value = is_string($amount) ? str_replace([',', ' ', '$'], '', $amount) : $amount;
        if (! is_numeric($value)) {
            return null;
        }

        return (int) round((float) $value * 100, 0, PHP_ROUND_HALF_UP);
    }

    /** 187050 -> "1870.50" (what the API sends: like the order's decimal fields). */
    public static function decimal(?int $cents): ?string
    {
        return $cents === null ? null : number_format($cents / 100, 2, '.', '');
    }

    /** 187000 -> "AUD $1,870.00". */
    public static function format(?int $cents, string $currency = 'AUD'): string
    {
        if ($cents === null) {
            return 'To be confirmed';
        }
        $currency = strtoupper($currency);
        $sign = $cents < 0 ? '-' : '';

        return $currency.' '.$sign.(self::SYMBOLS[$currency] ?? '').number_format(abs($cents) / 100, 2);
    }

    /** $percent of $cents, rounded half up to the cent (10% of 1700.05 = 170.01). */
    public static function percentOf(int $cents, string|float|int $percent): int
    {
        // Basis points (10% = 1000) keep the sum in whole numbers.
        $bp = (int) round((float) $percent * 100);

        return intdiv($cents * $bp + 5000, 10000);
    }
}
