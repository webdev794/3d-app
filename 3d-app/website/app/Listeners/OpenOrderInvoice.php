<?php

namespace App\Listeners;

use App\Events\OrderSubmitted;
use App\Services\Payments\InvoiceService;
use Throwable;

/**
 * A new order is priced straight away: fully priced, its invoice is issued and emailed with the pay link;
 * otherwise it is marked "Quote required" for staff. A problem here never stops the order (it is logged).
 */
class OpenOrderInvoice
{
    public function __construct(private InvoiceService $invoices) {}

    public function handle(OrderSubmitted $event): void
    {
        try {
            $this->invoices->openForOrder($event->order);
        } catch (Throwable $e) {
            report($e);
        }
    }
}
