<?php

namespace App\Services\Payments;

/**
 * Stripe's webhook signature: the Stripe-Signature header "t=<unix time>,v1=<hex HMAC-SHA256 of "<t>.<raw body>"
 * with the endpoint's signing secret>". Old timestamps are refused, so a captured request can't be replayed later.
 */
final class StripeSignature
{
    public static function verify(string $payload, ?string $header, string $secret, int $tolerance = 300, ?int $now = null): bool
    {
        if (! $header || $secret === '') {
            return false;
        }
        $timestamp = null;
        $signatures = [];
        foreach (explode(',', $header) as $part) {
            [$key, $value] = array_pad(explode('=', trim($part), 2), 2, '');
            if ($key === 't' && ctype_digit($value)) {
                $timestamp = (int) $value;
            } elseif ($key === 'v1' && $value !== '') {
                $signatures[] = $value;
            }
        }
        if ($timestamp === null || $signatures === [] || abs(($now ?? time()) - $timestamp) > $tolerance) {
            return false;
        }
        $expected = hash_hmac('sha256', $timestamp.'.'.$payload, $secret);
        foreach ($signatures as $signature) {
            if (hash_equals($expected, $signature)) {
                return true;
            }
        }

        return false;
    }

    /** The header Stripe would send for $payload (tests and local tools). */
    public static function header(string $payload, string $secret, ?int $timestamp = null): string
    {
        $timestamp ??= time();

        return 't='.$timestamp.',v1='.hash_hmac('sha256', $timestamp.'.'.$payload, $secret);
    }
}
