<?php

/*
 * Online payments for invoices (the Review & Pay page): Airwallex (the client's provider) or Stripe. Card numbers
 * never reach this server: Airwallex's Hosted Payment Page, or Stripe.js in the browser, collects them.
 */
return [

    /*
     * Which provider takes payments: airwallex or stripe. Not set: Airwallex when its keys are set, else Stripe when
     * its keys are set, else test mode (see test_mode) or none (bank transfer only).
     */
    'provider' => env('PAYMENTS_PROVIDER'),

    'airwallex' => [
        // Airwallex web app > Settings > Developer > API keys: the Client ID and an API key (server only, never sent
        // to the browser). Demo (sandbox) keys and live keys are different pairs.
        'client_id' => env('AIRWALLEX_CLIENT_ID'),
        'api_key' => env('AIRWALLEX_API_KEY'),
        // Developer > Webhooks: the secret of our notification URL (signs every webhook: x-timestamp, x-signature).
        'webhook_secret' => env('AIRWALLEX_WEBHOOK_SECRET'),
        // demo (Airwallex's sandbox, test cards, no real money) or prod (live).
        'env' => env('AIRWALLEX_ENV', 'demo'),
        // Only for a key that covers several Airwallex accounts: the account the payments go to (x-login-as).
        'account_id' => env('AIRWALLEX_ACCOUNT_ID'),
        // The shopper country the Hosted Payment Page offers payment methods for (Apple Pay, Google Pay).
        'country' => env('AIRWALLEX_COUNTRY', 'AU'),
        'api' => [
            'demo' => 'https://api-demo.airwallex.com',
            'prod' => 'https://api.airwallex.com',
        ],
        // Signed webhooks older than this many seconds are refused (replays).
        'tolerance' => 300,
    ],

    'stripe' => [
        // Publishable key (pk_live_... or pk_test_...): sent to the browser.
        'key' => env('STRIPE_KEY'),
        // Secret key (sk_live_... or sk_test_...): server only.
        'secret' => env('STRIPE_SECRET'),
        // The signing secret of the webhook endpoint (whsec_...), from Stripe > Developers > Webhooks.
        'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
        'api' => 'https://api.stripe.com/v1',
        // The API version our requests use.
        'version' => '2024-06-20',
        // Signed webhook events older than this many seconds are refused (replays).
        'tolerance' => 300,
    ],

    /*
     * Test payments (no real money, no provider): a clearly labelled TEST form marks an invoice paid through the same
     * code as the providers' webhooks. With no Airwallex or Stripe keys it is on only when APP_ENV is local or
     * testing, or when PAYMENTS_TEST_MODE=true is set on purpose (the pay page then shows a TEST banner). With a
     * provider's keys it is never used. PAYMENTS_TEST_MODE=false turns it off everywhere.
     */
    'test_mode' => env('PAYMENTS_TEST_MODE'),

    // How long the app's pay link (opened in the phone's browser without signing in) works.
    'link_minutes' => 120,
];
