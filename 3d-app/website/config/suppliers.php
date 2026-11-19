<?php

/*
 * Preferred suppliers (task 9.118): who makes an order (3DEEZI, Mantis or an approved outside supplier) and the
 * outside suppliers' listings. See App\Models\Supplier.
 */
return [
    /*
     * Shared hosting has no shell for `php artisan migrate`: with this on (the default), the first visit that needs the
     * suppliers table runs the waiting database updates. A developer's computer turns it off (SUPPLIERS_AUTO_SETUP=false
     * in .env) so its own database is only ever changed by hand.
     */
    'auto_setup' => filter_var(env('SUPPLIERS_AUTO_SETUP', true), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? true,

    /** The listing prices until an admin sets them in Admin > Pricing (cents, including GST). */
    'monthly_cents' => 4900,
    'yearly_cents' => 49000,
];
