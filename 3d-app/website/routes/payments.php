<?php

use App\Http\Controllers\Admin\InvoiceAdminController;
use App\Http\Controllers\Admin\PricingAdminController;
use App\Http\Controllers\AirwallexWebhookController;
use App\Http\Controllers\InvoiceController;
use App\Http\Controllers\PricingController;
use App\Http\Controllers\StripeWebhookController;
use Illuminate\Support\Facades\Route;

/*
 * Prices, invoices and payments (loaded by App\Providers\PaymentServiceProvider). See payments-api.md.
 */
Route::prefix('api/v1')->middleware('api')->group(function () {
    // Stripe -> us. No sign-in, CSRF or rate limit: the Stripe-Signature header proves it is Stripe.
    Route::post('/payments/stripe/webhook', StripeWebhookController::class)->name('payments.stripe.webhook');
    // Airwallex -> us: the x-signature header (with x-timestamp) proves it is Airwallex.
    Route::post('/payments/airwallex/webhook', AirwallexWebhookController::class)->name('payments.airwallex.webhook');

    Route::middleware('throttle:api')->group(function () {
        // The order form's prices and the review step's breakdown (open to visitors).
        Route::get('/pricing/options', [PricingController::class, 'options']);
        Route::post('/pricing/quote', [PricingController::class, 'quote'])->middleware('throttle:pricing');

        // The Review & Pay page: the order's own account (signed in) or the app's signed link (?key=).
        $number = '[Ii][Nn][Vv]-[0-9]{1,10}';
        Route::get('/invoices/{number}', [InvoiceController::class, 'show'])->where('number', $number);
        Route::get('/invoices/{number}/pdf', [InvoiceController::class, 'pdf'])->where('number', $number);
        Route::post('/invoices/{number}/pay', [InvoiceController::class, 'pay'])->where('number', $number)->middleware('throttle:payments');
        Route::post('/payments/{payment}/sync', [InvoiceController::class, 'sync'])->whereNumber('payment')->middleware('throttle:payments');
        Route::post('/payments/{payment}/test-complete', [InvoiceController::class, 'testComplete'])->whereNumber('payment')->middleware('throttle:payments');

        Route::middleware('auth:sanctum')->group(function () use ($number) {
            Route::get('/invoices', [InvoiceController::class, 'index']);
            Route::post('/invoices/{number}/link', [InvoiceController::class, 'link'])->where('number', $number);

            Route::prefix('admin')->name('admin.')->middleware('admin')->group(function () {
                Route::get('/pricing', [PricingAdminController::class, 'show'])->name('pricing');
                Route::put('/pricing/settings', [PricingAdminController::class, 'updateSettings'])->name('pricing.settings');
                Route::post('/pricing/rules', [PricingAdminController::class, 'storeRule'])->name('pricing.rules.store');
                Route::patch('/pricing/rules/{rule}', [PricingAdminController::class, 'updateRule'])->whereNumber('rule')->name('pricing.rules.update');
                Route::delete('/pricing/rules/{rule}', [PricingAdminController::class, 'destroyRule'])->whereNumber('rule')->name('pricing.rules.destroy');
                Route::post('/pricing/logo', [PricingAdminController::class, 'uploadLogo'])->name('pricing.logo');
                Route::delete('/pricing/logo', [PricingAdminController::class, 'deleteLogo'])->name('pricing.logo.delete');

                Route::get('/invoices', [InvoiceAdminController::class, 'index'])->name('invoices');
                Route::get('/invoices/{invoice}', [InvoiceAdminController::class, 'show'])->whereNumber('invoice')->name('invoices.show');
                Route::get('/invoices/{invoice}/pdf', [InvoiceAdminController::class, 'pdf'])->whereNumber('invoice')->name('invoices.pdf');
                Route::post('/invoices/{invoice}/mark-paid', [InvoiceAdminController::class, 'markPaid'])->whereNumber('invoice')->name('invoices.paid');
                Route::post('/invoices/{invoice}/resend', [InvoiceAdminController::class, 'resend'])->whereNumber('invoice')->name('invoices.resend');
                Route::post('/invoices/{invoice}/refund', [InvoiceAdminController::class, 'refund'])->whereNumber('invoice')->name('invoices.refund');
                Route::post('/invoices/{invoice}/cancel', [InvoiceAdminController::class, 'cancel'])->whereNumber('invoice')->name('invoices.cancel');
                Route::get('/orders/{order}/billing', [InvoiceAdminController::class, 'billing'])->whereNumber('order')->name('orders.billing');
                Route::post('/orders/{order}/billing/preview', [InvoiceAdminController::class, 'preview'])->whereNumber('order')->name('orders.billing.preview');
                Route::post('/orders/{order}/invoice', [InvoiceAdminController::class, 'issue'])->whereNumber('order')->name('orders.invoice');
            });
        });
    });
});
