<?php

namespace App\Services\Payments;

use App\Models\Invoice;
use App\Models\Payment;

/** A payment provider: Airwallex, Stripe, or the built-in test provider (test mode). */
interface PaymentGateway
{
    /** airwallex, stripe or test (the payments' provider column). */
    public function name(): string;

    /**
     * Starts a payment of $payment's amount: the provider's id for it, the secret the browser pays it with (the
     * PaymentIntent's client_secret; null for test payments) and its status.
     *
     * @return array{id: string, client_secret: ?string, status: string}
     */
    public function create(Payment $payment, Invoice $invoice): array;

    /**
     * The payment as the provider has it now, in the shape PaymentService::apply() reads (Stripe's PaymentIntent:
     * status succeeded / processing / canceled / requires_payment_method, amounts in cents), or null.
     */
    public function retrieve(Payment $payment): ?array;

    /** Cancels an unfinished payment (best effort). */
    public function cancel(Payment $payment): void;

    /**
     * Refunds $cents of a paid payment through the provider's API: {id, status} of the refund; null when this
     * provider's refunds are made in its own dashboard (Stripe tells us by webhook) or there is nothing to refund.
     *
     * @return array{id: string, status: string}|null
     */
    public function refund(Payment $payment, int $cents): ?array;
}
