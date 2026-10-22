<?php

namespace Tests\Feature;

use App\Events\OrderSubmitted;
use App\Models\Order;
use App\Models\User;
use App\Support\OrderDelivery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Upload Your Order (client 2026-10-22): a new submit needs the date required, a mobile number and delivery (with the
 * address) or pick up. Drafts still save without them, and older orders without them still open.
 */
class OrderUploadDeliveryTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Event::fake([OrderSubmitted::class]);
        Mail::fake();
        Notification::fake();
        $this->customer = User::factory()->create(['name' => 'Fabian Soutar']);
        Sanctum::actingAs($this->customer);
    }

    /** An upload draft with its order form, saved with only the details given (as an old draft would be). */
    private function draft(array $data = []): int
    {
        $id = $this->postJson('/api/v1/order-drafts', ['kind' => 'upload', 'data' => $data + ['team_name' => 'Te Arawa', 'contact_name' => 'Fabian', 'contact_email' => 'fab@example.test']])
            ->assertCreated()->json('data.id');
        $this->post("/api/v1/order-drafts/{$id}/files", ['kind' => 'order_form', 'file' => UploadedFile::fake()->createWithContent('order.csv', "Item,Size,Qty\nJersey,M,10\n")], ['Accept' => 'application/json'])
            ->assertCreated();

        return $id;
    }

    private function submitDraft(int $id, array $fields, string $key = 'upload-delivery-1')
    {
        return $this->postJson("/api/v1/order-drafts/{$id}/submit", $fields, ['Idempotency-Key' => $key]);
    }

    private function address(array $over = []): array
    {
        return $over + ['street' => '12 Smith Street', 'suburb' => 'Rotorua', 'state' => 'QLD', 'postcode' => '4000', 'country' => 'Australia'];
    }

    public function test_a_draft_saves_without_the_new_details_but_submitting_needs_them(): void
    {
        // An old or incomplete draft saves and opens as before.
        $id = $this->draft();
        $this->patchJson("/api/v1/order-drafts/{$id}", ['data' => ['team_name' => 'Te Arawa', 'contact_name' => 'Fabian', 'needed_by' => '', 'phone' => '']])->assertOk();
        $this->getJson("/api/v1/order-drafts/{$id}")->assertOk()->assertJsonPath('data.data.team_name', 'Te Arawa');

        // Submitting needs the date required, a mobile and delivery or pick up.
        $this->submitDraft($id, [])->assertUnprocessable()->assertJsonValidationErrors([
            'needed_by' => 'Choose the date you need the order by.',
            'phone' => 'Add a mobile number so we can reach you.',
            'delivery' => 'Choose delivery or pick up.',
        ]);
        $this->assertSame(0, Order::count());

        // Not in the past, a sensible mobile, and the address when delivering.
        $this->submitDraft($id, ['needed_by' => now()->subDay()->toDateString(), 'phone' => '12ab', 'delivery' => 'deliver', 'address' => ['street' => '', 'country' => 'Australia', 'postcode' => '12']])
            ->assertUnprocessable()->assertJsonValidationErrors(['needed_by', 'phone' => OrderDelivery::MOBILE_MESSAGE, 'address.street', 'address.suburb', 'address.state', 'address.postcode']);
        $this->submitDraft($id, ['needed_by' => now()->addWeeks(6)->toDateString(), 'phone' => '1234', 'delivery' => 'post'])
            ->assertUnprocessable()->assertJsonValidationErrors(['phone', 'delivery']);
        $this->assertSame(0, Order::count());
        $this->assertDatabaseHas('order_drafts', ['id' => $id]);
    }

    public function test_an_upload_delivered_to_an_address_keeps_the_date_mobile_and_address(): void
    {
        $due = now()->addWeeks(6)->toDateString();
        // The details saved in the draft count, as if sent with the submit.
        $id = $this->draft(['needed_by' => $due, 'phone' => '+61 412 345 678', 'delivery' => 'deliver', 'address' => $this->address()]);
        $order = $this->submitDraft($id, [])->assertCreated()
            ->assertJsonPath('data.needed_by', $due)->assertJsonPath('data.phone', '+61 412 345 678')
            ->assertJsonPath('data.shipping_address', "12 Smith Street\nRotorua QLD 4000\nAustralia")->json('data');

        // Staff see the same on the admin order.
        $admin = User::factory()->create();
        $admin->is_admin = true;
        $admin->save();
        Sanctum::actingAs($admin);
        $this->getJson("/api/v1/admin/orders/{$order['id']}")->assertOk()
            ->assertJsonPath('data.needed_by', $due)->assertJsonPath('data.phone', '+61 412 345 678')
            ->assertJsonPath('data.shipping_address', "12 Smith Street\nRotorua QLD 4000\nAustralia");
        Mail::assertNothingOutgoing();
    }

    public function test_pick_up_and_international_addresses(): void
    {
        $due = now()->addWeeks(6)->toDateString();
        $this->submitDraft($this->draft(), ['needed_by' => $due, 'phone' => '0412 345 678', 'delivery' => 'pickup'])
            ->assertCreated()->assertJsonPath('data.shipping_address', OrderDelivery::PICKUP_TEXT);
        // A New Zealand address needs no Australian state; its postcode is checked loosely.
        $this->submitDraft($this->draft(), ['needed_by' => $due, 'phone' => '+64 21 123 4567', 'delivery' => 'deliver',
            'address' => ['street' => '5 Queen St', 'suburb' => 'Auckland', 'state' => '', 'postcode' => '1010', 'country' => 'New Zealand']], 'upload-delivery-2')
            ->assertCreated()->assertJsonPath('data.shipping_address', "5 Queen St\nAuckland 1010\nNew Zealand");
    }

    public function test_older_orders_without_the_new_details_still_open_and_other_orders_are_unchanged(): void
    {
        // An order made before these fields (no date, phone or address) still shows to the customer and on the board.
        $old = $this->customer->orders()->create(['source' => 'upload', 'contact_name' => 'Fabian', 'team_name' => 'Old Team', 'sizes' => []]);
        $this->getJson("/api/v1/orders/{$old->id}")->assertOk()->assertJsonPath('data.needed_by', null)->assertJsonPath('data.shipping_address', null);
        $this->getJson('/api/v1/orders/board')->assertOk();
        // The order form (Create Order Form) needs them too (2026-10-22), with the same checks and storage.
        $form = ['source' => 'form', 'contact_name' => 'Fabian', 'team_name' => 'Hawks', 'items' => [['garment' => 'jersey', 'sizes' => ['M' => 2]]]];
        $this->postJson('/api/v1/orders', $form, ['Idempotency-Key' => 'form-no-delivery'])->assertUnprocessable()
            ->assertJsonValidationErrors(['needed_by', 'phone', 'delivery']);
        $this->postJson('/api/v1/orders', $form + ['phone' => '0412 345 678', 'needed_by' => now()->addWeeks(6)->toDateString(), 'delivery' => 'deliver',
            'address' => ['street' => '12 Smith Street', 'suburb' => 'Rotorua', 'country' => 'Australia']], ['Idempotency-Key' => 'form-no-delivery'])
            ->assertUnprocessable()->assertJsonValidationErrors(['address.state', 'address.postcode']);
        $this->postJson('/api/v1/orders', $form + ['phone' => '0412 345 678', 'needed_by' => now()->addWeeks(6)->toDateString(), 'delivery' => 'deliver',
            'address' => ['street' => '12 Smith Street', 'suburb' => 'Rotorua', 'state' => 'QLD', 'postcode' => '4000', 'country' => 'Australia']], ['Idempotency-Key' => 'form-delivery'])
            ->assertCreated()->assertJsonPath('data.shipping_address', "12 Smith Street\nRotorua QLD 4000\nAustralia")->assertJsonPath('data.phone', '0412 345 678');
        // An order form draft saved before today (without them) still opens and saves.
        $old = $this->postJson('/api/v1/order-drafts', ['kind' => 'form', 'data' => ['team_name' => 'Old', 'contact_name' => 'Fabian']])->assertCreated()->json('data.id');
        $this->getJson("/api/v1/order-drafts/{$old}")->assertOk();
        $this->patchJson("/api/v1/order-drafts/{$old}", ['data' => ['team_name' => 'Old', 'contact_name' => 'Fabian', 'notes' => 'x']])->assertOk();
        // Staff create orders without them.
        $admin = User::factory()->create();
        $admin->is_admin = true;
        $admin->save();
        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/orders', ['user_id' => $this->customer->id, 'contact_name' => 'Staff made', 'sizes' => ['M' => 3]])->assertCreated();
    }

    public function test_the_mobile_check(): void
    {
        foreach (['0412 345 678', '0412345678', '+61 412 345 678', '+61 (0)412 345 678', '(02) 9876 5432', '+64 21 123 4567', '+44 7911 123456'] as $ok) {
            $this->assertTrue(OrderDelivery::validMobile($ok), $ok);
        }
        foreach (['', '1234', '0412 345', 'call me', '+61 412', '04123456789', '++61412345678'] as $bad) {
            $this->assertFalse(OrderDelivery::validMobile($bad), $bad);
        }
    }

    public function test_the_production_lead_time_is_an_admin_setting_given_to_the_order_pages(): void
    {
        // Default 4 weeks, on the public options the order pages read.
        $this->getJson('/api/v1/orders/options')->assertOk()->assertJsonPath('data.lead_time_weeks', 4);
        $admin = User::factory()->create();
        $admin->is_admin = true;
        $admin->save();
        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/settings')->assertOk()->assertJsonPath('data.production_lead_weeks', 4);
        $this->putJson('/api/v1/admin/settings', ['production_lead_weeks' => 6])->assertOk()->assertJsonPath('data.production_lead_weeks', 6);
        $this->assertDatabaseHas('settings', ['key' => 'production_lead_weeks', 'value' => '6']);
        $this->getJson('/api/v1/orders/options')->assertJsonPath('data.lead_time_weeks', 6);
        $this->putJson('/api/v1/admin/settings', ['production_lead_weeks' => 60])->assertUnprocessable()->assertJsonValidationErrors('production_lead_weeks');
        // Customers cannot change it.
        Sanctum::actingAs($this->customer);
        $this->putJson('/api/v1/admin/settings', ['production_lead_weeks' => 1])->assertForbidden();
        // A date sooner than the lead time is only a warning: the order is still accepted.
        $id = $this->draft();
        $this->submitDraft($id, ['needed_by' => now()->addDays(3)->toDateString(), 'phone' => '0412 345 678', 'delivery' => 'pickup'], 'soon-lead-1')->assertCreated();
    }
}
