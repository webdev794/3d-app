<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A payment provider's event already handled (Stripe's evt_... id): the same event again changes nothing. */
class PaymentEvent extends Model
{
    protected $fillable = ['provider', 'event_id', 'type', 'payment_id'];
}
