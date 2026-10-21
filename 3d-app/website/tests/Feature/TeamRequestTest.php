<?php

namespace Tests\Feature;

use App\Models\Asset;
use App\Models\Invoice;
use App\Models\OrderFile;
use App\Models\TeamAllowance;
use App\Models\TeamRequest;
use App\Models\User;
use App\Notifications\TeamRequestNotification;
use App\Services\Pricing\BillingSettings;
use App\Services\Team\TeamPlans;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** 3DEEZI TEAM (team-api.md): the workflow, permissions, allowances and invoices, notifications and uploads. */
class TeamRequestTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Notification::fake();
        Bus::withoutDispatchingAfterResponses();
        Http::preventStrayRequests();
        BillingSettings::flush();
        TeamPlans::flush();
    }

    private function admin(): User
    {
        $user = User::factory()->create(['name' => 'Ada Admin']);
        $user->forceFill(['is_admin' => true])->save();

        return $user;
    }

    private function designer(string $name = 'Sam Designer', bool $all = false): User
    {
        $user = User::factory()->create(['name' => $name]);
        $user->forceFill(['is_designer' => true, 'designer_all' => $all])->save();

        return $user;
    }

    private function plan(User $user, string $plan, array $extra = []): void
    {
        TeamAllowance::create(['user_id' => $user->id, 'plan' => $plan] + $extra);
    }

    private function brief(array $extra = []): array
    {
        return $extra + [
            'name' => 'Northside Hawks', 'email' => 'coach@example.com', 'sport' => 'rugby-league', 'garment' => 'jersey', 'category' => 'Teamwear',
            'description' => 'A bold navy and gold jersey with a hawk across the chest.', 'colours' => ['navy', '#ffcc00'], 'instructions' => 'Club logo on the left chest.',
        ];
    }

    private function pdf(string $name = 'brief.pdf'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
    }

    private function submit(User $customer, array $extra = [], array $files = []): \Illuminate\Testing\TestResponse
    {
        Sanctum::actingAs($customer);

        return $this->post('/api/v1/team/requests', $this->brief($extra) + $files, ['Accept' => 'application/json']);
    }

    private function sent(User $user, string $kind): void
    {
        Notification::assertSentTo($user, TeamRequestNotification::class, fn (TeamRequestNotification $n) => $n->kind === $kind);
    }

    public function test_the_whole_workflow_from_brief_to_studio_and_order(): void
    {
        $admin = $this->admin();
        $designer = $this->designer();
        $customer = User::factory()->create(['name' => 'Coach Kim']);
        $this->plan($customer, 'premium');

        $created = $this->submit($customer, [], ['logos' => [UploadedFile::fake()->image('logo.png', 200, 200)], 'references' => [UploadedFile::fake()->image('ref.jpg', 300, 200), $this->pdf()]])
            ->assertCreated()->json('data');
        $this->assertSame(['TEAM-1001', 'received', 'included', 0], [$created['number'], $created['status'], $created['billing'], $created['stage_index']]);
        $this->assertCount(3, $created['files']);
        $this->assertNotNull($created['files'][0]['thumb']);
        $this->assertSame(['navy', '#ffcc00'], $created['colours']);
        $id = $created['id'];
        $this->sent($customer, 'received');
        $this->sent($admin, 'new_request');
        $this->assertSame(1, $this->getJson('/api/v1/team/allowance')->json('data.used_this_month'));

        // The admin assigns a designer.
        Sanctum::actingAs($admin);
        $this->assertSame(1, $this->getJson('/api/v1/team-admin/requests')->assertOk()->json('counts.received'));
        $this->patchJson("/api/v1/team-admin/requests/{$id}/assign", ['designer_id' => $designer->id])->assertOk()->assertJsonPath('data.status', 'assigned');
        $this->sent($designer, 'assigned');
        $this->sent($customer, 'assigned');

        // The designer works and sends version 1 for review.
        Sanctum::actingAs($designer);
        $this->patchJson("/api/v1/team-admin/requests/{$id}/status", ['status' => 'review'])->assertStatus(422);
        $this->patchJson("/api/v1/team-admin/requests/{$id}/status", ['status' => 'in_progress'])->assertOk()->assertJsonPath('data.status', 'in_progress');
        $this->post("/api/v1/team-admin/requests/{$id}/deliveries", ['files' => [UploadedFile::fake()->image('front-back.png', 800, 400)], 'note' => 'First draft', 'send' => '1'], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.status', 'review')->assertJsonPath('data.latest_version', 1);
        $this->sent($customer, 'review');
        $this->postJson("/api/v1/team-admin/requests/{$id}/messages", ['body' => 'Internal: check the gold', 'internal' => true])->assertCreated();

        // The customer asks for a revision, then chats.
        Sanctum::actingAs($customer);
        $view = $this->getJson("/api/v1/team/requests/{$id}")->assertOk()->json('data');
        $this->assertSame([true, true], [$view['can']['approve'], $view['can']['revise']]);
        $this->assertCount(1, $view['deliveries']);
        $this->assertSame([], $view['messages'], 'Internal notes are never shown to the customer.');
        $this->postJson("/api/v1/team/requests/{$id}/revisions", ['message' => 'Thinner stripes please'])->assertOk()->assertJsonPath('data.status', 'revision')->assertJsonPath('data.revisions_used', 1);
        $this->sent($designer, 'revision');
        $this->post("/api/v1/team/requests/{$id}/messages", ['body' => 'Also a gold collar', 'files' => [UploadedFile::fake()->image('collar.png', 50, 50)]], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.role', 'customer')->assertJsonCount(1, 'data.files');
        $this->sent($designer, 'message');

        // Version 2, approved: saved to the customer's assets, into the Studio and an order draft.
        Sanctum::actingAs($designer);
        $staffView = $this->getJson("/api/v1/team-admin/requests/{$id}")->assertOk()->json('data');
        $this->assertSame(1, $staffView['internal_notes_count']);
        $this->assertSame(1, $staffView['unread']);
        $this->postJson("/api/v1/team-admin/requests/{$id}/messages", ['body' => 'On it!'])->assertCreated();
        $this->sent($customer, 'message');
        $this->post("/api/v1/team-admin/requests/{$id}/deliveries", ['files' => [UploadedFile::fake()->image('v2.png', 800, 400), UploadedFile::fake()->image('mockup.jpg', 400, 400)], 'send' => '1'], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.latest_version', 2);

        Sanctum::actingAs($customer);
        $approved = $this->postJson("/api/v1/team/requests/{$id}/approve")->assertOk()->json('data');
        $this->assertSame(['approved', 2, 4], [$approved['status'], $approved['final']['version'], $approved['stage_index']]);
        $this->assertCount(2, $approved['final']['assets']);
        $this->sent($customer, 'approved');
        $this->sent($designer, 'approved');
        $asset = Asset::findOrFail($approved['final']['studio_asset_id']);
        $this->assertSame([$customer->id, 'reference'], [$asset->user_id, $asset->type]);
        $this->assertStringStartsWith('3DEEZI TEAM · TEAM-1001', $asset->name);
        $this->getJson('/api/v1/assets')->assertOk()->assertJsonFragment(['id' => $asset->id]);
        $this->get("/api/v1/assets/{$asset->id}/file")->assertOk();
        $this->postJson("/api/v1/team/requests/{$id}/to-studio")->assertOk()->assertJsonPath('data.asset_id', $asset->id)->assertJsonPath('data.garment', 'jersey');
        $draft = $this->postJson("/api/v1/team/requests/{$id}/order-draft")->assertCreated()->json('data');
        $this->assertSame('/orders/new?draft='.$draft['draft_id'], $draft['link']);
        $opened = $this->getJson("/api/v1/order-drafts/{$draft['draft_id']}")->assertOk()->json('data');
        $this->assertSame('TEAM-1001', $opened['data']['items'][0]['label']);
        $this->assertSame(2, OrderFile::where('order_draft_id', $draft['draft_id'])->count());

        // The history is complete and the customer's list shows it.
        $history = collect($approved['history'])->pluck('to')->filter()->values()->all();
        $this->assertSame(['received', 'assigned', 'in_progress', 'review', 'revision', 'review', 'approved'], $history);
        $this->getJson('/api/v1/team/requests')->assertOk()->assertJsonPath('data.0.number', 'TEAM-1001');
    }

    public function test_designers_see_only_their_requests_and_customers_only_their_own(): void
    {
        $admin = $this->admin();
        $sam = $this->designer('Sam');
        $lee = $this->designer('Lee');
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $a = $this->submit($alice, [], ['logos' => [UploadedFile::fake()->image('a.png', 20, 20)]])->assertCreated()->json('data');
        $b = $this->submit($bob)->assertCreated()->json('data');
        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/team-admin/requests/{$a['id']}/assign", ['designer_id' => $sam->id])->assertOk();
        $this->patchJson("/api/v1/team-admin/requests/{$b['id']}/assign", ['designer_id' => $lee->id])->assertOk();
        $this->assertCount(2, $this->getJson('/api/v1/team-admin/requests')->json('data'));

        Sanctum::actingAs($sam);
        $this->assertSame([$a['id']], array_column($this->getJson('/api/v1/team-admin/requests')->assertOk()->json('data'), 'id'));
        $this->getJson("/api/v1/team-admin/requests/{$b['id']}")->assertNotFound();
        $this->postJson("/api/v1/team-admin/requests/{$b['id']}/messages", ['body' => 'hi'])->assertNotFound();
        $this->get('/api/v1/team/files/'.$a['files'][0]['id'])->assertOk();
        $this->patchJson("/api/v1/team-admin/requests/{$a['id']}/assign", ['designer_id' => $sam->id])->assertForbidden();
        $this->patchJson("/api/v1/team-admin/requests/{$a['id']}/status", ['status' => 'closed'])->assertForbidden();
        $this->getJson('/api/v1/team-admin/allowances')->assertForbidden();
        $board = $this->getJson('/api/v1/team-admin/board')->assertOk()->json('data.columns');
        $this->assertSame(1, collect($board)->sum(fn ($c) => count($c['requests'])));

        // A designer with "see all requests".
        $sam->forceFill(['designer_all' => true])->save();
        $this->getJson("/api/v1/team-admin/requests/{$b['id']}")->assertOk();

        // Customers: only their own, never the staff API.
        Sanctum::actingAs($bob);
        $this->getJson("/api/v1/team/requests/{$a['id']}")->assertNotFound();
        $this->get('/api/v1/team/files/'.$a['files'][0]['id'])->assertNotFound();
        $this->postJson("/api/v1/team/requests/{$a['id']}/approve")->assertNotFound();
        $this->getJson('/api/v1/team-admin/requests')->assertForbidden();
        $this->assertSame([$b['id']], array_column($this->getJson('/api/v1/team/requests')->json('data'), 'id'));

        // Staff-only files stay staff-only.
        Sanctum::actingAs($admin);
        $this->post("/api/v1/team-admin/requests/{$a['id']}/files", ['files' => [UploadedFile::fake()->image('working.png', 20, 20)], 'visibility' => 'internal'], ['Accept' => 'application/json'])->assertCreated();
        $internal = \App\Models\TeamFile::where('kind', 'working')->firstOrFail();
        Sanctum::actingAs($alice);
        $this->get('/api/v1/team/files/'.$internal->id)->assertNotFound();
        $this->assertNotContains($internal->id, array_column($this->getJson("/api/v1/team/requests/{$a['id']}")->json('data.files'), 'id'));

        $this->getJson('/api/v1/team-admin/requests')->assertForbidden();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/team/requests')->assertUnauthorized();
    }

    public function test_included_requests_are_deducted_then_extra_ones_are_invoiced_and_start_once_paid(): void
    {
        $admin = $this->admin();
        $customer = User::factory()->create();
        $this->plan($customer, 'premium');
        Sanctum::actingAs($customer);
        $allowance = $this->getJson('/api/v1/team/allowance')->assertOk()->json('data');
        $this->assertSame(['premium', 2, 2, 'included'], [$allowance['plan'], $allowance['included_per_month'], $allowance['remaining_included'], $allowance['next_request']['billing']]);

        $this->submit($customer)->assertCreated()->assertJsonPath('data.billing', 'included');
        $this->submit($customer)->assertCreated()->assertJsonPath('data.billing', 'included');
        $next = $this->getJson('/api/v1/team/allowance')->json('data');
        // Prices include GST (client 2026-10-21): A$69.00 holds A$6.27 GST.
        $this->assertSame([0, 'paid', '69.00', '6.27', '69.00', true], [$next['remaining_included'], $next['next_request']['billing'], $next['next_request']['price'], $next['next_request']['tax'], $next['next_request']['total'], $next['next_request']['tax_included']]);

        $third = $this->submit($customer)->assertCreated()->json('data');
        $this->assertSame(['awaiting_payment', 'paid', '69.00'], [$third['status'], $third['billing'], $third['price']]);
        $number = $third['invoice']['invoice_number'];
        $this->assertMatchesRegularExpression('/^INV-\d+$/', $number);
        $this->assertSame(['69.00', true], [$third['invoice']['total'], $third['invoice']['can_pay']]);
        $invoice = Invoice::where('number', $number)->firstOrFail();
        $this->assertSame([$third['id'], null, 6900, 627, 6273], [$invoice->team_request_id, $invoice->order_id, $invoice->total_cents, $invoice->tax_cents, $invoice->subtotal_cents]);
        $this->assertStringContainsString('incl. GST', $invoice->quote['lines'][0]['name']);
        Notification::assertNotSentTo($admin, TeamRequestNotification::class, fn ($n) => $n->request->id === $third['id']);

        // The customer's invoices and the pay page show it; paid in test mode, the request starts.
        $this->getJson('/api/v1/invoices')->assertOk()->assertJsonPath('data.0.order.number', $third['number']);
        $this->getJson("/api/v1/invoices/{$number}")->assertOk()->assertJsonPath('data.order.number', $third['number']);
        $this->get("/api/v1/invoices/{$number}/pdf")->assertOk();
        $payment = $this->postJson("/api/v1/invoices/{$number}/pay")->assertOk()->json('data.payment');
        $this->postJson("/api/v1/payments/{$payment['id']}/test-complete", ['outcome' => 'succeeded'])->assertOk()->assertJsonPath('data.status', 'paid');
        $this->assertSame('received', TeamRequest::findOrFail($third['id'])->status);
        Notification::assertSentTo($admin, TeamRequestNotification::class, fn ($n) => $n->request->id === $third['id'] && $n->kind === 'new_request');

        // Admin > Invoices lists it with the request's number.
        Sanctum::actingAs($admin);
        $row = collect($this->getJson('/api/v1/admin/invoices')->assertOk()->json('data.data'))->firstWhere('invoice_number', $number);
        $this->assertSame($third['number'], $row['order']['number']);
        $this->getJson("/api/v1/admin/invoices/{$invoice->id}")->assertOk()->assertJsonPath('data.invoice_number', $number);
        $this->get("/api/v1/admin/invoices/{$invoice->id}/pdf")->assertOk();
        // The staff view shows the paid invoice.
        $this->getJson("/api/v1/team-admin/requests/{$third['id']}")->assertOk()->assertJsonPath('data.invoice.status', 'paid');
    }

    public function test_free_plan_pays_for_every_request_and_mark_paid_starts_it(): void
    {
        $admin = $this->admin();
        $customer = User::factory()->create();
        $first = $this->submit($customer)->assertCreated()->json('data');
        $this->assertSame(['awaiting_payment', '99.00', '99.00'], [$first['status'], $first['price'], $first['invoice']['total']]);
        // Staff can't work on it before it is paid, unless they confirm.
        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/team-admin/requests/{$first['id']}/status", ['status' => 'in_progress'])->assertStatus(409);
        $invoice = Invoice::where('team_request_id', $first['id'])->firstOrFail();
        $this->postJson("/api/v1/admin/invoices/{$invoice->id}/mark-paid", ['method' => 'bank_transfer'])->assertOk();
        $this->assertSame('received', TeamRequest::findOrFail($first['id'])->status);
    }

    public function test_unpaid_requests_can_be_cancelled_and_the_allowance_is_given_back(): void
    {
        $customer = User::factory()->create();
        $this->plan($customer, 'premium', ['bonus_requests' => 0]);
        $included = $this->submit($customer)->assertCreated()->json('data');
        $this->assertSame(1, $this->getJson('/api/v1/team/allowance')->json('data.used_this_month'));
        $this->postJson("/api/v1/team/requests/{$included['id']}/cancel")->assertOk()->assertJsonPath('data.status', 'closed');
        $this->assertSame(0, $this->getJson('/api/v1/team/allowance')->json('data.used_this_month'));

        // A paid one: its unpaid invoice is cancelled.
        TeamAllowance::where('user_id', $customer->id)->update(['plan' => 'free']);
        $paid = $this->submit($customer)->assertCreated()->json('data');
        $this->postJson("/api/v1/team/requests/{$paid['id']}/cancel")->assertOk();
        $this->assertSame('cancelled', Invoice::where('team_request_id', $paid['id'])->value('status'));

        // Once the designer has started, the customer can't cancel (assigned but not started: they still can).
        TeamAllowance::where('user_id', $customer->id)->update(['plan' => 'premium']);
        $started = $this->submit($customer)->assertCreated()->json('data');
        TeamRequest::whereKey($started['id'])->update(['designer_id' => $this->designer()->id, 'status' => 'in_progress']);
        Sanctum::actingAs($customer);
        $this->assertFalse($this->getJson("/api/v1/team/requests/{$started['id']}")->json('data.can.cancel'));
        $this->postJson("/api/v1/team/requests/{$started['id']}/cancel")->assertStatus(409);
    }

    public function test_bonus_requests_open_limits_and_unlimited_only_by_an_admin(): void
    {
        $admin = $this->admin();
        $customer = User::factory()->create();
        $this->plan($customer, 'pro', ['bonus_requests' => 1]);
        $this->submit($customer)->assertCreated()->assertJsonPath('data.billing', 'included')->assertJsonPath('data.status', 'received');
        $this->assertSame(0, TeamAllowance::where('user_id', $customer->id)->value('bonus_requests'));
        $this->submit($customer)->assertCreated()->assertJsonPath('data.billing', 'paid')->assertJsonPath('data.price', '79.00');
        // The Pro plan allows 2 open requests at once (Free 1, Premium 3, Business 10).
        $this->submit($customer)->assertStatus(422)->assertJsonValidationErrors('allowance');

        // The customer can't make themselves unlimited: there is no customer API for it; the staff one is admins only.
        $this->putJson("/api/v1/team-admin/allowances/users/{$customer->id}", ['unlimited' => true])->assertForbidden();
        Sanctum::actingAs($admin);
        $this->putJson("/api/v1/team-admin/allowances/users/{$customer->id}", ['unlimited' => true, 'note' => 'Partner trial'])->assertOk()->assertJsonPath('data.unlimited', true);
        $this->assertSame($admin->id, TeamAllowance::where('user_id', $customer->id)->value('unlimited_by'));
        $this->submit($customer)->assertCreated()->assertJsonPath('data.billing', 'free');
        $this->assertNull($this->getJson('/api/v1/team/allowance')->json('data.max_open_requests'));
    }

    public function test_admins_configure_plans_and_the_revision_limit_holds(): void
    {
        $admin = $this->admin();
        Sanctum::actingAs($admin);
        $plans = $this->putJson('/api/v1/team-admin/allowances/plans', ['plans' => ['free' => ['price' => '120.50', 'revisions' => 1], 'pro' => ['included_per_month' => 1]], 'pay_first' => false])
            ->assertOk()->json('data');
        $this->assertSame(['120.50', 1, 1, false], [$plans['plans']['free']['price'], $plans['plans']['free']['revisions'], $plans['plans']['pro']['included_per_month'], $plans['pay_first']]);

        $designer = $this->designer();
        $customer = User::factory()->create();
        // Pay first is off: a paid request starts at once, its invoice still issued.
        $r = $this->submit($customer)->assertCreated()->json('data');
        $this->assertSame(['received', 'paid', 1], [$r['status'], $r['billing'], $r['revisions_allowed']]);
        // The price includes GST: the invoice total is the price.
        $this->assertSame(12050, Invoice::where('team_request_id', $r['id'])->value('total_cents'));

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/team-admin/requests/{$r['id']}/assign", ['designer_id' => $designer->id])->assertOk();
        $this->post("/api/v1/team-admin/requests/{$r['id']}/deliveries", ['files' => [UploadedFile::fake()->image('v1.png', 40, 40)], 'send' => '1'], ['Accept' => 'application/json'])->assertCreated();
        Sanctum::actingAs($customer);
        $this->postJson("/api/v1/team/requests/{$r['id']}/revisions", ['message' => 'Change it'])->assertOk();
        Sanctum::actingAs($designer);
        $this->patchJson("/api/v1/team-admin/requests/{$r['id']}/status", ['status' => 'review'])->assertOk();
        $this->patchJson("/api/v1/team-admin/requests/{$r['id']}/status", ['status' => 'approved'])->assertForbidden();
        Sanctum::actingAs($customer);
        $this->postJson("/api/v1/team/requests/{$r['id']}/revisions", ['message' => 'Again'])->assertStatus(422)->assertJsonValidationErrors('revisions');
        // The admin can raise the limit for this request.
        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/team-admin/requests/{$r['id']}", ['revisions_allowed' => 2])->assertOk();
        Sanctum::actingAs($customer);
        $this->postJson("/api/v1/team/requests/{$r['id']}/revisions", ['message' => 'Again'])->assertOk();
    }

    public function test_uploads_are_checked(): void
    {
        $customer = User::factory()->create();
        // Not a picture, whatever it is called.
        $fake = tempnam(sys_get_temp_dir(), 'team');
        file_put_contents($fake, "<?php echo 'not a picture';");
        $this->submit($customer, [], ['logos' => [new UploadedFile($fake, 'logo.png', null, null, true)]])->assertStatus(422)->assertJsonValidationErrors('logos.0');
        @unlink($fake);
        $this->submit($customer, [], ['references' => [UploadedFile::fake()->create('run.exe', 5)]])->assertStatus(422)->assertJsonValidationErrors('references.0');
        $this->submit($customer, [], ['logos' => [UploadedFile::fake()->image('big.png')->size(21000)]])->assertStatus(422);
        $this->submit($customer, ['description' => 'short'])->assertStatus(422)->assertJsonValidationErrors('description');
        $this->assertSame(0, TeamRequest::count());
        // A document is fine as a reference; the same key twice makes one request.
        $this->submit($customer, ['idempotency_key' => 'abc'], ['references' => [$this->pdf()]])->assertCreated();
        $this->submit($customer, ['idempotency_key' => 'abc'])->assertOk();
        $this->assertSame(1, TeamRequest::count());
    }

    public function test_admins_mark_users_as_designers(): void
    {
        $admin = $this->admin();
        $user = User::factory()->create();
        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/users/{$user->id}", ['is_designer' => true])->assertOk()->assertJsonPath('data.is_designer', true);
        $this->assertTrue($user->fresh()->is_designer);
        $this->assertContains($user->id, array_column($this->getJson('/api/v1/team-admin/designers')->assertOk()->json('data'), 'id'));
        // Still works for the other fields, and the list returns the flag.
        $this->patchJson("/api/v1/admin/users/{$user->id}", ['name' => 'New Name'])->assertOk()->assertJsonPath('data.is_designer', true);
        Sanctum::actingAs($user->fresh());
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.is_designer', true);
        $this->getJson('/api/v1/team-admin/requests')->assertOk();
        $this->getJson('/api/v1/admin/users')->assertForbidden();
    }

    public function test_notifications_show_in_the_notifications_list(): void
    {
        Notification::swap(new \Illuminate\Notifications\ChannelManager($this->app));
        config(['mail.default' => 'array']);
        $customer = User::factory()->create();
        $this->plan($customer, 'premium');
        $this->submit($customer)->assertCreated();
        $items = $this->getJson('/api/v1/notifications')->assertOk()->json('data.items');
        $request = TeamRequest::firstOrFail();
        $this->assertSame(['TeamRequestNotification', 'received', null, '/team/requests/'.$request->id], [$items[0]['type'], $items[0]['data']['kind'], $items[0]['data']['order_id'], $items[0]['data']['link']]);
        // The app's bell opens the request from team_request_id; the reference and name are shown.
        $this->assertSame([$request->id, 'TEAM-1001', 'Northside Hawks'], [$items[0]['data']['team_request_id'], $items[0]['data']['number'], $items[0]['data']['name']]);
    }

    public function test_assist_can_open_the_team_pages(): void
    {
        $this->assertContains('/team', \App\Services\SiteAssistant::PAGES);
        $this->assertContains('/team/requests', \App\Services\SiteAssistant::PAGES);
    }

    // ---------------------------------------------------------------- the client's answers (2026-10-21)

    private function pay(string $number): void
    {
        $payment = $this->postJson("/api/v1/invoices/{$number}/pay")->assertOk()->json('data.payment');
        $this->postJson("/api/v1/payments/{$payment['id']}/test-complete", ['outcome' => 'succeeded'])->assertOk()->assertJsonPath('data.status', 'paid');
    }

    /** Up to review with version 1, by $staff (an admin or the designer). */
    private function toReview(User $staff, int $id): void
    {
        Sanctum::actingAs($staff);
        $this->post("/api/v1/team-admin/requests/{$id}/deliveries", ['files' => [UploadedFile::fake()->image('v.png', 40, 40)], 'send' => '1'], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.status', 'review');
    }

    public function test_the_default_designer_takes_new_requests_and_an_admin_can_be_the_designer(): void
    {
        $owner = $this->admin();
        $other = $this->admin();
        $plain = User::factory()->create();
        Sanctum::actingAs($owner);
        // A fresh install has no default designer; only an admin or a designer can be chosen.
        $this->assertNull($this->getJson('/api/v1/team-admin/allowances')->assertOk()->json('data.default_designer_id'));
        $this->putJson('/api/v1/team-admin/allowances/plans', ['default_designer_id' => $plain->id])->assertStatus(422);
        $this->putJson('/api/v1/team-admin/allowances/plans', ['default_designer_id' => $owner->id])->assertOk()->assertJsonPath('data.default_designer_id', $owner->id);

        // An included request: assigned to the owner at once.
        $customer = User::factory()->create();
        $this->plan($customer, 'premium');
        $r = $this->submit($customer)->assertCreated()->json('data');
        $this->assertSame(['assigned', $owner->id], [$r['status'], $r['designer']['id']]);
        Notification::assertSentTo($owner, TeamRequestNotification::class, fn ($n) => $n->kind === 'assigned' && in_array('mail', $n->via($owner), true));
        Notification::assertNotSentTo($owner, TeamRequestNotification::class, fn ($n) => $n->kind === 'new_request');
        $this->sent($other, 'new_request');
        $this->sent($customer, 'assigned');

        // A paid one waits for payment unassigned, then the owner gets it.
        $free = User::factory()->create();
        $paid = $this->submit($free)->assertCreated()->json('data');
        $this->assertSame(['awaiting_payment', null], [$paid['status'], $paid['designer']]);
        $this->pay($paid['invoice']['invoice_number']);
        $this->assertSame([$owner->id, 'assigned'], [TeamRequest::find($paid['id'])->designer_id, TeamRequest::find($paid['id'])->status]);

        // The owner does the designer's work from Admin > 3DEEZI TEAM: draft, chat, and the customer's news reaches them.
        Sanctum::actingAs($owner);
        $this->assertSame([$r['id'], $paid['id']], array_reverse(array_column($this->getJson('/api/v1/team-admin/requests?mine=1')->assertOk()->json('data'), 'id')));
        $this->postJson("/api/v1/team-admin/requests/{$r['id']}/messages", ['body' => 'Hi, I am on it'])->assertCreated()->assertJsonPath('data.role', 'designer');
        $this->toReview($owner, $r['id']);
        Sanctum::actingAs($customer);
        $this->postJson("/api/v1/team/requests/{$r['id']}/revisions", ['message' => 'Bigger logo'])->assertOk();
        Notification::assertSentTo($owner, TeamRequestNotification::class, fn ($n) => $n->kind === 'revision' && in_array('mail', $n->via($owner), true) && $n->toArray($owner)['link'] === '/admin/team/'.$r['id']);

        // Separate designer accounts keep working: a designer can be the default too, and sees only their own.
        $sam = $this->designer('Sam');
        Sanctum::actingAs($owner);
        $this->putJson('/api/v1/team-admin/allowances/plans', ['default_designer_id' => $sam->id])->assertOk();
        $next = $this->submit($customer)->assertCreated()->json('data');
        $this->assertSame($sam->id, $next['designer']['id']);
        Sanctum::actingAs($sam);
        $this->assertSame([$next['id']], array_column($this->getJson('/api/v1/team-admin/requests')->json('data'), 'id'));
        // None again: requests wait for an admin.
        Sanctum::actingAs($owner);
        $this->putJson('/api/v1/team-admin/allowances/plans', ['default_designer_id' => null])->assertOk()->assertJsonPath('data.default_designer_id', null);
        $this->plan($last = User::factory()->create(), 'business');
        $this->submit($last)->assertCreated()->assertJsonPath('data.status', 'received')->assertJsonPath('data.designer', null);
    }

    public function test_due_dates_count_business_days(): void
    {
        $this->assertSame('2026-10-28', TeamPlans::businessDays(3, '2026-10-23')->toDateString(), 'Friday + 3 business days is Wednesday.');
        $this->assertSame('2026-10-26', TeamPlans::businessDays(2, '2026-10-22')->toDateString(), 'Thursday + 2 business days is Monday.');
        $this->assertSame('2026-10-27', TeamPlans::businessDays(2, '2026-10-24')->toDateString(), 'Saturday + 2 business days is Tuesday.');

        $admin = $this->admin();
        $customer = User::factory()->create();
        $this->plan($customer, 'premium');
        $this->travelTo(\Illuminate\Support\Carbon::parse('2026-10-23 10:00'));
        $r = $this->submit($customer)->assertCreated()->json('data');
        $this->assertSame('2026-10-28', $r['due_date']);
        $this->toReview($admin, $r['id']);
        $this->travelTo(\Illuminate\Support\Carbon::parse('2026-10-29 09:00'));
        Sanctum::actingAs($customer);
        $this->postJson("/api/v1/team/requests/{$r['id']}/revisions", ['message' => 'Thinner stripes'])->assertOk()->assertJsonPath('data.due_date', '2026-11-02');
        // Admins set the numbers, and can still change the date by hand.
        Sanctum::actingAs($admin);
        $this->putJson('/api/v1/team-admin/allowances/plans', ['first_draft_days' => 5, 'revision_days' => 1])->assertOk()->assertJsonPath('data.first_draft_days', 5);
        $this->patchJson("/api/v1/team-admin/requests/{$r['id']}", ['due_date' => '2026-11-10'])->assertOk()->assertJsonPath('data.due_date', '2026-11-10');
        Sanctum::actingAs($customer);
        $this->assertSame(['first_draft_days' => 5, 'revision_days' => 1], $this->getJson('/api/v1/team/allowance')->json('data.turnaround'));
        $this->submit($customer)->assertCreated()->assertJsonPath('data.due_date', '2026-11-05');
        $this->travelBack();
    }

    public function test_extra_revision_rounds_are_invoiced_and_start_once_paid_or_waived(): void
    {
        $admin = $this->admin();
        $designer = $this->designer();
        $customer = User::factory()->create();
        $this->plan($customer, 'premium');
        $r = $this->submit($customer)->assertCreated()->json('data');
        $id = $r['id'];
        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/team-admin/requests/{$id}/assign", ['designer_id' => $designer->id])->assertOk();
        $this->patchJson("/api/v1/team-admin/requests/{$id}", ['revisions_allowed' => 0])->assertOk();
        $this->toReview($designer, $id);

        Sanctum::actingAs($customer);
        $view = $this->getJson("/api/v1/team/requests/{$id}")->json('data');
        $this->assertSame([false, true, '25.00', '2.27'], [$view['can']['revise'], $view['can']['extra_revision'], $view['extra_revision_price']['price'], $view['extra_revision_price']['tax']]);
        $this->postJson("/api/v1/team/requests/{$id}/revisions", ['message' => 'One more change'])->assertStatus(422)->assertJsonValidationErrors('revisions');
        $asked = $this->postJson("/api/v1/team/requests/{$id}/revisions", ['message' => 'One more change', 'extra' => true])->assertOk()->json('data');
        $this->assertSame(['review', 0, true], [$asked['status'], $asked['revisions_used'], $asked['can']['pay_revision']]);
        $number = $asked['pending_revision']['invoice']['invoice_number'];
        $invoice = Invoice::where('number', $number)->firstOrFail();
        $this->assertSame(['revision', 2500, 227, $id], [$invoice->team_purpose, $invoice->total_cents, $invoice->tax_cents, $invoice->team_request_id]);
        $this->assertStringContainsString('extra revision round 1', $invoice->quote['lines'][0]['name']);
        $this->assertStringContainsString('incl. GST', $invoice->quote['lines'][0]['name']);
        $this->assertNull($asked['invoice'], 'The included request has no invoice of its own: the revision invoice is separate.');
        $this->postJson("/api/v1/team/requests/{$id}/revisions", ['message' => 'Again', 'extra' => true])->assertStatus(409);

        // Paid: the revision starts, the designer hears about it with the message.
        $this->pay($number);
        $after = TeamRequest::findOrFail($id);
        $this->assertSame(['revision', 1, 1, 1, null], [$after->status, $after->revisions_used, $after->revisions_allowed, $after->extra_revisions, $after->pending_revision_message_id]);
        Notification::assertSentTo($designer, TeamRequestNotification::class, fn ($n) => $n->kind === 'revision' && $n->message === 'One more change');

        // A second extra round, waived by an admin: its invoice is cancelled and the revision starts.
        $this->toReview($designer, $id);
        Sanctum::actingAs($customer);
        $second = $this->postJson("/api/v1/team/requests/{$id}/revisions", ['message' => 'Last tweak', 'extra' => true])->assertOk()->json('data');
        Sanctum::actingAs($designer);
        $this->postJson("/api/v1/team-admin/requests/{$id}/free-revision")->assertForbidden();
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/team-admin/requests/{$id}/free-revision")->assertOk()->assertJsonPath('data.status', 'revision')->assertJsonPath('data.extra_revisions', 2);
        $this->assertSame('cancelled', Invoice::where('number', $second['pending_revision']['invoice']['invoice_number'])->value('status'));

        // Without a waiting round, a free revision adds one; approving drops a waiting round's unpaid invoice.
        $this->toReview($designer, $id);
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/team-admin/requests/{$id}/free-revision")->assertOk()->assertJsonPath('data.revisions_allowed', 3)->assertJsonPath('data.status', 'review');
        Sanctum::actingAs($customer);
        $this->assertTrue($this->getJson("/api/v1/team/requests/{$id}")->json('data.can.revise'));
        $this->patchJson('/api/v1/team-admin/requests/'.$id, ['revisions_allowed' => 0])->assertForbidden();
        TeamRequest::whereKey($id)->update(['revisions_allowed' => 2]);
        $third = $this->postJson("/api/v1/team/requests/{$id}/revisions", ['message' => 'Then this', 'extra' => true])->assertOk()->json('data');
        $this->postJson("/api/v1/team/requests/{$id}/approve")->assertOk()->assertJsonPath('data.status', 'approved')->assertJsonPath('data.pending_revision', null);
        $this->assertSame('cancelled', Invoice::where('number', $third['pending_revision']['invoice']['invoice_number'])->value('status'));
    }

    public function test_a_paid_request_cancelled_before_work_starts_is_marked_refund_due(): void
    {
        $admin = $this->admin();
        $customer = User::factory()->create();
        $r = $this->submit($customer)->assertCreated()->json('data');
        $this->pay($r['invoice']['invoice_number']);
        // Assigned but not started: the customer can still cancel, and the refund is due.
        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/team-admin/requests/{$r['id']}/assign", ['designer_id' => $admin->id])->assertOk();
        Sanctum::actingAs($customer);
        $this->assertTrue($this->getJson("/api/v1/team/requests/{$r['id']}")->json('data.can.cancel'));
        $this->postJson("/api/v1/team/requests/{$r['id']}/cancel")->assertOk()->assertJsonPath('data.status', 'closed')->assertJsonPath('data.refund_status', 'due');
        $this->assertSame('paid', Invoice::where('team_request_id', $r['id'])->value('status'), 'No automatic refund.');

        // The board keeps it until the admin refunds by hand and ticks "Refunded".
        Sanctum::actingAs($admin);
        $closed = collect($this->getJson('/api/v1/team-admin/board')->json('data.columns'))->firstWhere('status', 'closed');
        $this->assertSame('due', $closed['requests'][0]['refund_status']);
        $this->patchJson("/api/v1/team-admin/requests/{$r['id']}/refund", ['refund_status' => 'refunded'])->assertOk()->assertJsonPath('data.refund_status', 'refunded');
        $this->assertSame(['refunded', 9900], [Invoice::where('team_request_id', $r['id'])->value('status'), (int) Invoice::where('team_request_id', $r['id'])->value('refunded_cents')]);
        Http::assertNothingSent();

        // After work started (a draft delivered) there is no refund due; an unpaid request has nothing to refund.
        $this->plan($second = User::factory()->create(), 'free');
        $s = $this->submit($second)->assertCreated()->json('data');
        $this->pay($s['invoice']['invoice_number']);
        $this->toReview($admin, $s['id']);
        $this->patchJson("/api/v1/team-admin/requests/{$s['id']}/status", ['status' => 'closed'])->assertOk()->assertJsonPath('data.refund_status', null);
        $u = $this->submit(User::factory()->create())->assertCreated()->json('data');
        $this->postJson("/api/v1/team/requests/{$u['id']}/cancel")->assertOk()->assertJsonPath('data.refund_status', null);
        // An admin can still mark one due by hand (3DEEZI could not deliver), but only with a paid invoice.
        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/team-admin/requests/{$s['id']}/refund", ['refund_status' => 'due'])->assertOk()->assertJsonPath('data.refund_status', 'due');
        $this->patchJson("/api/v1/team-admin/requests/{$u['id']}/refund", ['refund_status' => 'due'])->assertStatus(422);
    }

    public function test_the_header_bell_lists_marks_read_and_links_each_item(): void
    {
        Notification::swap(new \Illuminate\Notifications\ChannelManager($this->app));
        config(['mail.default' => 'array']);
        $customer = User::factory()->create();
        $this->plan($customer, 'premium');
        $this->submit($customer)->assertCreated();
        $list = $this->getJson('/api/v1/notifications')->assertOk()->json('data');
        $this->assertSame(1, $list['unread']);
        $this->assertStringStartsWith('/team/requests/', $list['items'][0]['data']['link']);
        $this->postJson('/api/v1/notifications/read', ['ids' => [$list['items'][0]['id']]])->assertOk()->assertJsonPath('data.unread', 0);
        $this->assertNotNull($this->getJson('/api/v1/notifications')->json('data.items.0.read_at'));
    }

    public function test_plan_defaults_are_the_clients_values_incl_gst(): void
    {
        $plans = collect(TeamPlans::present())->keyBy('id');
        $this->assertSame(['99.00', '79.00', '69.00', '49.00'], $plans->pluck('price')->values()->all());
        $this->assertSame([0, 0, 2, 6], $plans->pluck('included_per_month')->values()->all());
        $this->assertSame([2, 3, 3, 5], $plans->pluck('revisions')->values()->all());
        $this->assertSame([1, 2, 3, 10], $plans->pluck('max_open')->values()->all());
        $this->assertSame(['pay_first' => true, 'default_designer_id' => null, 'extra_revision_cents' => 2500, 'first_draft_days' => 3, 'revision_days' => 2],
            array_intersect_key(TeamPlans::config(), TeamPlans::OPTIONS));
        $this->assertSame(900, TeamPlans::includedTax(9900));
    }

    public function test_the_migration_updates_only_old_placeholder_values(): void
    {
        $old = ['plans' => ['free' => ['name' => 'Free / Entry', 'included_per_month' => 0, 'price_cents' => 9900, 'revisions' => 2, 'max_open' => 2],
            'pro' => ['name' => 'Pro', 'included_per_month' => 0, 'price_cents' => 6900, 'revisions' => 3, 'max_open' => 3],
            'premium' => ['name' => 'Premium', 'included_per_month' => 2, 'price_cents' => 5500, 'revisions' => 3, 'max_open' => 5]], 'pay_first' => true];
        \App\Models\Setting::query()->updateOrCreate(['key' => 'team_plans'], ['value' => json_encode($old)]);
        $migration = require database_path('migrations/2026_10_21_700000_team_client_answers.php');
        $migration->updatePlans();
        TeamPlans::flush();
        $plans = TeamPlans::config()['plans'];
        $this->assertSame([1, 7900, 2, 5500, 3], [$plans['free']['max_open'], $plans['pro']['price_cents'], $plans['pro']['max_open'], $plans['premium']['price_cents'], $plans['premium']['max_open']],
            "An admin's own value (Premium A\$55) stays; the old placeholders change.");
    }
}
