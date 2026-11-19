<?php

namespace App\Events;

use App\Models\Order;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * A new order was placed: by a customer (Order this kit, the order form or an uploaded order) or by staff in the
 * admin panel ($order->source says which). Dispatched once, after the order is saved; never for a repeated
 * submission with the same idempotency key. The payments feature listens to it to issue the invoice.
 */
class OrderSubmitted
{
    use Dispatchable, SerializesModels;

    public function __construct(public Order $order) {}
}
