<?php

namespace App\Services\Payments;

use App\Services\Pricing\BillingSettings;

/**
 * Which payment provider takes payments. PAYMENTS_PROVIDER (airwallex or stripe) picks one when its keys are set;
 * not set, Airwallex when its keys are set, else Stripe when its keys are set. Without a provider: test mode where it
 * is allowed (APP_ENV local or testing, or PAYMENTS_TEST_MODE=true on purpose, with a TEST banner); else none (pay
 * by bank transfer). With a provider's keys set, test mode can never run.
 */
final class Gateways
{
    public const PROVIDERS = ['airwallex', 'stripe'];

    public static function mode(): string
    {
        $chosen = strtolower(trim((string) config('payments.provider')));
        if (in_array($chosen, self::PROVIDERS, true)) {
            if (self::ready($chosen)) {
                return $chosen;
            }
        } else {
            foreach (self::PROVIDERS as $provider) {
                if (self::ready($provider)) {
                    return $provider;
                }
            }
        }

        return self::testAllowed() ? 'test' : 'none';
    }

    public static function ready(string $provider): bool
    {
        return match ($provider) {
            'airwallex' => self::airwallexReady(),
            'stripe' => self::stripeReady(),
            default => false,
        };
    }

    public static function airwallexReady(): bool
    {
        return filled(config('payments.airwallex.client_id')) && filled(config('payments.airwallex.api_key'));
    }

    public static function stripeReady(): bool
    {
        return filled(config('payments.stripe.secret')) && filled(config('payments.stripe.key'));
    }

    /** demo or prod (anything but prod is the demo environment, so a typo never takes real money). */
    public static function airwallexEnv(): string
    {
        return strtolower(trim((string) config('payments.airwallex.env'))) === 'prod' ? 'prod' : 'demo';
    }

    public static function testAllowed(): bool
    {
        if (filled(config('payments.stripe.secret')) || filled(config('payments.airwallex.api_key'))) {
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

    /** The gateway of a provider, only while it may be used (its keys are set; test mode allowed). */
    public static function for(string $provider): ?PaymentGateway
    {
        return match (true) {
            $provider === 'airwallex' && self::airwallexReady() => app(AirwallexGateway::class),
            $provider === 'stripe' && self::stripeReady() => new StripeGateway,
            $provider === 'test' && self::testAllowed() => new TestGateway,
            default => null,
        };
    }

    /** What the pay page needs to know (no secrets). */
    public static function info(): array
    {
        $mode = self::mode();

        return [
            'provider' => $mode,
            'publishable_key' => $mode === 'stripe' ? (string) config('payments.stripe.key') : null,
            // Airwallex.js: the environment (demo or prod) and the shopper country for the Hosted Payment Page.
            'environment' => $mode === 'airwallex' ? self::airwallexEnv() : null,
            'country' => $mode === 'airwallex' ? strtoupper((string) config('payments.airwallex.country', 'AU')) : null,
            'test_mode' => $mode === 'test',
            'banner' => match (true) {
                $mode === 'test' => 'TEST MODE: payments are simulated. No card is charged and no money is taken.',
                $mode === 'airwallex' && self::airwallexEnv() === 'demo' => 'AIRWALLEX DEMO: use Airwallex test cards. No real money is taken.',
                default => null,
            },
            'wallets' => $mode !== 'none',
            'bank_details' => trim((string) BillingSettings::get('bank_details')) ?: null,
        ];
    }
}
