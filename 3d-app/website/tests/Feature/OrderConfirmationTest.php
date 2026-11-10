<?php

namespace Tests\Feature;

use App\Events\OrderSubmitted;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The order confirmation form (client 2026-11-03, images/336 and 338): signed PDF (printable page) and Excel links
 * for a draft on the review and for a sent order; sending is the approval (approved by, approved at, version 1); a
 * later change to the garments or sizes makes the next version.
 */
class OrderConfirmationTest extends TestCase
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

    private function draft(): int
    {
        $id = $this->postJson('/api/v1/order-drafts', ['kind' => 'upload', 'data' => [
            'team_name' => 'Te Arawa', 'contact_name' => 'Fabian', 'contact_email' => 'fab@example.test',
            'needed_by' => now()->addWeeks(6)->toDateString(), 'phone' => '+61 412 345 678', 'delivery' => 'pickup',
            'items' => [['garment' => 'jersey', 'sport' => 'rugby-league', 'fit' => 'mens', 'sizes' => ['M' => 6, 'L' => 4]]],
        ]])->assertCreated()->json('data.id');
        $this->addArtwork($id);
        $this->post("/api/v1/order-drafts/{$id}/files", ['kind' => 'order_form', 'file' => UploadedFile::fake()->createWithContent('order.csv', "Item,Size,Qty\nJersey,M,6\nJersey,L,4\n")], ['Accept' => 'application/json'])
            ->assertCreated();

        return $id;
    }

    public function test_a_draft_has_its_confirmation_as_a_page_and_a_workbook(): void
    {
        $id = $this->draft();
        $links = $this->getJson("/api/v1/order-drafts/{$id}/confirmation-links")->assertOk()->json('data');
        $page = $this->get($links['pdf'])->assertOk();
        $page->assertSee('ORDER CONFIRMATION FORM')->assertSee('DRAFT · AWAITING APPROVAL')->assertSee('01')->assertSee('RUGBY LEAGUE JERSEY')
            ->assertSee('Te Arawa')->assertSee('OVERALL ORDER SUMMARY')->assertSee('Page 1 of 2');
        $sheet = $this->get($links['excel'])->assertOk();
        $this->assertStringStartsWith('PK', $sheet->getContent());
        $this->assertStringContainsString('spreadsheetml', $sheet->headers->get('Content-Type'));
        // Signed: without the signature, or another customer's draft, nothing.
        $this->get(strtok($links['pdf'], '?'))->assertForbidden();
        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/v1/order-drafts/{$id}/confirmation-links")->assertNotFound();
    }

    public function test_sending_approves_version_1_and_a_change_makes_version_2(): void
    {
        $id = $this->draft();
        $order = $this->postJson("/api/v1/order-drafts/{$id}/submit", [], ['Idempotency-Key' => 'confirmation-key-1'])->assertCreated()->json('data');
        $this->assertSame(1, (int) $order['version']);
        $this->assertSame('Fabian Soutar', $order['approved_by']);
        $this->assertNotNull($order['approved_at']);

        $links = $this->getJson("/api/v1/orders/{$order['id']}/confirmation-links")->assertOk()->json('data');
        $this->get($links['pdf'])->assertOk()->assertSee('APPROVED')->assertSee('Fabian Soutar')->assertSee('version 1');

        $saved = Order::findOrFail($order['id']);
        $saved->items = [['garment' => 'jersey', 'sport' => 'rugby-league', 'fit' => 'mens', 'sizes' => ['M' => 8, 'L' => 4]]];
        $saved->save();
        $this->assertSame(2, (int) $saved->fresh()->version);
    }
}
