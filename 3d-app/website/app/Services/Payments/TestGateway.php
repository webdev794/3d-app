<?php

namespace App\Services\Payments;

use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Support\Str;

/**
 * Test mode: payments with no money and no Stripe. The pay page's TEST form asks for an outcome (paid or declined),
 * and PaymentService::completeTest() runs it through the same event handling as Stripe's webhook.
 */
final class TestGateway implements PaymentGateway
{
    public function name(): string
    {
        return 'test';
    }

    public function create(Payment $payment, Invoice $invoice): array
    {
        return ['id' => 'test_pi_'.Str::lower(Str::random(24)), 'client_secret' => null, 'status' => 'requires_payment_method'];
    }

    public function retrieve(Payment $payment): ?array
    {
        return null;
    }

    public function cancel(Payment $payment): void {}
}
