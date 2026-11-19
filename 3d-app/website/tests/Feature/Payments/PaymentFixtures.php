<?php

namespace Tests\Feature\Payments;

use App\Events\OrderSubmitted;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\PriceRule;
use App\Models\User;
use App\Services\Pricing\BillingSettings;
use Illuminate\Support\Facades\DB;

/** Price lists, customers and orders for the payments tests. */
trait PaymentFixtures
{
    protected function rule(array $attributes): PriceRule
    {
        $rule = new PriceRule;
        $rule->forceFill($attributes + ['active' => true])->save();

        return $rule;
    }

    /** The concept image's prices: jerseys $50, shorts $30, shipping in Australia $100, GST 10%. */
    protected function priceList(): void
    {
        BillingSettings::flush();
        $this->rule(['kind' => 'garment', 'code' => 'jersey', 'name' => 'Jersey', 'amount_cents' => 5000]);
        $this->rule(['kind' => 'garment', 'code' => 'shorts', 'name' => 'Shorts', 'amount_cents' => 3000]);
        $this->rule(['kind' => 'shipping', 'code' => 'AU', 'name' => 'Australia', 'amount_cents' => 10000, 'taxable' => true]);
    }

    protected function customer(string $name = 'Fabian Soutar'): User
    {
        return User::factory()->create(['name' => $name]);
    }

    protected function admin(): User
    {
        $admin = User::factory()->create(['name' => 'Staff Member']);
        $admin->forceFill(['is_admin' => true])->save();

        return $admin;
    }

    /** An order from the order form: 20 jerseys and 20 shorts unless other rows are given. */
    protected function formOrder(User $user, ?array $items = null, ?array $pricing = null, string $address = '1 Park Rd, Sydney NSW 2000'): Order
    {
        $order = new Order(['user_id' => $user->id, 'source' => 'form', 'contact_name' => 'Fabian Soutar', 'team_name' => 'MANTIS Rugby League',
            'contact_email' => 'fabian@example.com', 'phone' => '0400 000 000', 'shipping_address' => $address,
            'items' => $items ?? [
                ['garment' => 'jersey', 'sizes' => ['S' => 4, 'M' => 6, 'L' => 6, 'XL' => 4]],
                ['garment' => 'shorts', 'sizes' => ['S' => 4, 'M' => 6, 'L' => 6, 'XL' => 4]],
            ]]);
        $order->save();
        if ($pricing !== null) {
            DB::table('orders')->where('id', $order->id)->update(['pricing' => json_encode($pricing)]);
            $order->refresh();
        }

        return $order;
    }

    /** Submits it (as the orders feature does) and gives its invoice. */
    protected function submit(Order $order): ?Invoice
    {
        event(new OrderSubmitted($order));

        return $order->invoices()->latest('id')->first();
    }

    protected function issuedInvoice(?User $user = null): Invoice
    {
        $this->priceList();

        return $this->submit($this->formOrder($user ?? $this->customer()));
    }
}
