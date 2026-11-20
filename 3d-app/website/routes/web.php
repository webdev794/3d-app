<?php

use Illuminate\Support\Facades\Route;

// The order confirmation form (signed links from GET /api/v1/orders/{order}/confirmation-links): a printable page or Excel.
Route::get('/order-confirmation/{order}.{format}', [\App\Http\Controllers\OrderConfirmationController::class, 'show'])
    ->whereNumber('order')->where('format', 'pdf|xlsx')->middleware('signed')->name('orders.confirmation');
Route::get('/order-draft-confirmation/{draft}.{format}', [\App\Http\Controllers\OrderConfirmationController::class, 'showDraft'])
    ->whereNumber('draft')->where('format', 'pdf|xlsx')->middleware('signed')->name('orders.draft-confirmation');

Route::view('/{path?}', 'app')->where('path', '^(?!api(?:/|$)).*');
