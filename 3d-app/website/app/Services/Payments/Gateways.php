<?php

namespace App\Services\Payments;

use App\Services\Pricing\BillingSettings;

/**
 * Which payment provider takes payments: Stripe when its keys are set; else test mode where it is allowed (APP_ENV
 * local or testing, or PAYMENTS_TEST_MODE=true on purpose, with a TEST banner); else none (pay by bank transfer).
 * With Stripe keys set, test mode can never run.
 */
final class Gateways
{
    public static function mode(): string
    {
        if (self::stripeReady()) {
            return 'stripe';
        }

        return self::testAllowed() ? 'test' : 'none';
    }

    public static function stripeReady(): bool
    {
        return filled(config('payments.stripe.secret')) && filled(config('payments.stripe.key'));
    }

    public static function testAllowed(): bool
    {
        if (filled(config('payments.stripe.secret'))) {
            return false;
        }
        $flag = self::flag(config('payments.test_mode'));
        if ($flag === false) {
            return false;
        }

        return app()->environment(['local', 'testing']) || $flag === true;
    }

    /** true, false or null (not set) from PAYMENTS_TEST_MODE. */
    private static function flag(mixed $value): ?bool
    {
        if (is_bool($value)) {
            return $value;
        }
        if ($value === null || $value === '') {
            return null;
        }

        return filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    }

    public static function current(): ?PaymentGateway
    {
        return self::for(self::mode());
    }

    /** The gateway of a provider, only while it may be used. */
    public static function for(string $provider): ?PaymentGateway
    {
        return match (true) {
            $provider === 'stripe' && self::stripeReady() => new StripeGateway,
            $provider === 'test' && self::testAllowed() => new TestGateway,
            default => null,
        };
    }

    /** What the pay page needs to know. */
    public static function info(): array
    {
        $mode = self::mode();

        return [
            'provider' => $mode,
            'publishable_key' => $mode === 'stripe' ? (string) config('payments.stripe.key') : null,
            'test_mode' => $mode === 'test',
            'banner' => $mode === 'test' ? 'TEST MODE: payments are simulated. No card is charged and no money is taken.' : null,
            'wallets' => $mode !== 'none',
            'bank_details' => trim((string) BillingSettings::get('bank_details')) ?: null,
        ];
    }
}
