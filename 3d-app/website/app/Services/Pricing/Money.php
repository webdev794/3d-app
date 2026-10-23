<?php

namespace App\Services\Pricing;

/** Amounts are whole cents everywhere; these turn them into "1870.00" and "A$1,870.00" and back. */
final class Money
{
    /** The price style (task 9.85, as the website's money.ts and the app): "A$1,870.00"; other codes "JPY 1,870.00". */
    private const SYMBOLS = ['AUD' => 'A$', 'NZD' => 'NZ$', 'USD' => 'US$', 'CAD' => 'CA$', 'GBP' => '£', 'EUR' => '€'];

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

    /** 187000 -> "A$1,870.00", -1250 -> "-A$12.50" (the site's one price style, task 9.85). */
    public static function format(?int $cents, string $currency = 'AUD'): string
    {
        if ($cents === null) {
            return 'To be confirmed';
        }
        $currency = strtoupper(trim($currency)) ?: 'AUD';
        $sign = $cents < 0 ? '-' : '';

        return $sign.(self::SYMBOLS[$currency] ?? $currency.' ').number_format(abs($cents) / 100, 2);
    }

    /**
     * A text saved before the one price style (order history, notifications): its "AUD $1,870.00" and "AUD -$12.50"
     * read as "A$1,870.00" and "-A$12.50" when shown; nothing else changes.
     */
    public static function restyle(?string $text): ?string
    {
        if ($text === null || ! str_contains($text, ' ')) {
            return $text;
        }

        return preg_replace_callback('/\b(AUD|NZD|USD|CAD|GBP|EUR) (-?)(?:\$|£|€)(\d[\d,]*(?:\.\d+)?)/u',
            fn (array $m) => $m[2].self::SYMBOLS[$m[1]].$m[3], $text) ?? $text;
    }

    /** $percent of $cents, rounded half up to the cent (10% of 1700.05 = 170.01). */
    public static function percentOf(int $cents, string|float|int $percent): int
    {
        // Basis points (10% = 1000) keep the sum in whole numbers.
        $bp = (int) round((float) $percent * 100);

        return intdiv($cents * $bp + 5000, 10000);
    }
}
