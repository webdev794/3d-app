<?php

namespace App\Services\Payments;

use App\Models\Invoice;

/**
 * A short-lived pay link for the app: the pay page opened in the phone's browser, where the customer is not signed
 * in. The key is signed with the app key for this invoice and its owner, and expires (2 hours by default).
 */
final class PayLink
{
    /** @return array{url: string, key: string, expires_at: string} */
    public static function make(Invoice $invoice, ?int $minutes = null): array
    {
        $expires = now()->addMinutes($minutes ?? (int) config('payments.link_minutes', 120))->getTimestamp();
        $key = $expires.'.'.self::sign($invoice, $expires);

        return ['url' => $invoice->payUrl().'?key='.$key, 'key' => $key, 'expires_at' => date(DATE_ATOM, $expires)];
    }

    public static function valid(Invoice $invoice, ?string $key): bool
    {
        if (! $key || ! preg_match('/^(\d{9,12})\.([a-f0-9]{64})$/', $key, $m) || ! $invoice->user_id) {
            return false;
        }

        return (int) $m[1] >= time() && hash_equals(self::sign($invoice, (int) $m[1]), $m[2]);
    }

    private static function sign(Invoice $invoice, int $expires): string
    {
        return hash_hmac('sha256', "pay|{$invoice->id}|{$invoice->number}|{$invoice->user_id}|{$expires}", (string) config('app.key'));
    }
}
