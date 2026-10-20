<?php

/*
 * Online payments for invoices (the Review & Pay page). Stripe takes the card and wallet payments; card numbers never
 * reach this server (Stripe.js collects them in the browser).
 */
return [

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
     * Test payments (no real money, no Stripe): a clearly labelled TEST form marks an invoice paid through the same
     * code as Stripe's webhook. With no Stripe keys it is on only when APP_ENV is local or testing, or when
     * PAYMENTS_TEST_MODE=true is set on purpose (the pay page then shows a TEST banner). With Stripe keys it is
     * never used. PAYMENTS_TEST_MODE=false turns it off everywhere.
     */
    'test_mode' => env('PAYMENTS_TEST_MODE'),

    // How long the app's pay link (opened in the phone's browser without signing in) works.
    'link_minutes' => 120,
];
