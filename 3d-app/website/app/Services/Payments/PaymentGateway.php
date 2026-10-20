<?php

namespace App\Services\Payments;

use App\Models\Invoice;
use App\Models\Payment;

/** A payment provider: Stripe, or the built-in test provider (test mode). */
interface PaymentGateway
{
    /** stripe or test (the payments' provider column). */
    public function name(): string;

    /**
     * Starts a payment of $payment's amount: the provider's id for it, the secret the browser confirms it with
     * (Stripe's client_secret; null for test payments) and its status.
     *
     * @return array{id: string, client_secret: ?string, status: string}
     */
    public function create(Payment $payment, Invoice $invoice): array;

    /** The payment as the provider has it now (Stripe's PaymentIntent), or null. */
    public function retrieve(Payment $payment): ?array;

    /** Cancels an unfinished payment (best effort). */
    public function cancel(Payment $payment): void;
}
