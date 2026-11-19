<?php

namespace App\Providers;

use App\Models\Invoice;
use App\Models\Order;
use App\Services\Payments\InvoiceService;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Throwable;

/** Prices, invoices and payments: their routes (routes/payments.php), rate limits, and following order changes. */
class PaymentServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        RateLimiter::for('pricing', fn (Request $request) => Limit::perMinute(60)->by('pricing:'.($request->user('sanctum')?->id ?: $request->ip())));
        RateLimiter::for('payments', fn (Request $request) => Limit::perMinute(20)->by('payments:'.($request->user('sanctum')?->id ?: $request->ip())));

        $this->loadRoutesFrom(base_path('routes/payments.php'));

        // A cancelled order's unpaid invoice is cancelled too (a paid one stays: staff record the refund).
        Order::updated(function (Order $order) {
            if (! $order->wasChanged('status') || $order->status !== 'cancelled') {
                return;
            }
            try {
                $invoice = $order->invoices()->whereIn('status', ['quote_required', 'awaiting_payment'])->where('paid_cents', 0)->latest('id')->first();
                if ($invoice instanceof Invoice) {
                    app(InvoiceService::class)->cancel($invoice, 'The order was cancelled.');
                }
            } catch (Throwable $e) {
                report($e);
            }
        });
    }
}
