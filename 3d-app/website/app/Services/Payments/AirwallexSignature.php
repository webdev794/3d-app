<?php

namespace App\Services\Payments;

/**
 * Airwallex's webhook signature: x-signature is the hex HMAC-SHA256 of "<x-timestamp><raw body>" (the timestamp in
 * milliseconds, as sent, followed by the unmodified JSON body) with the notification URL's secret. Old timestamps are
 * refused, so a captured request can't be replayed later. (airwallex.com/docs/developer-tools/webhooks/listen-for-webhook-events)
 */
final class AirwallexSignature
{
    public static function verify(string $payload, ?string $timestamp, ?string $signature, string $secret, int $tolerance = 300, ?int $nowMs = null): bool
    {
        $timestamp = trim((string) $timestamp);
        $signature = strtolower(trim((string) $signature));
        if ($secret === '' || $signature === '' || ! ctype_digit($timestamp)) {
            return false;
        }
        $nowMs ??= (int) floor(microtime(true) * 1000);
        if (abs($nowMs - (int) $timestamp) > $tolerance * 1000) {
            return false;
        }

        return hash_equals(hash_hmac('sha256', $timestamp.$payload, $secret), $signature);
    }

    /** The headers Airwallex would send for $payload (tests and local tools). */
    public static function headers(string $payload, string $secret, ?int $timestampMs = null): array
    {
        $timestamp = (string) ($timestampMs ?? (int) floor(microtime(true) * 1000));

        return ['x-timestamp' => $timestamp, 'x-signature' => hash_hmac('sha256', $timestamp.$payload, $secret)];
    }
}
