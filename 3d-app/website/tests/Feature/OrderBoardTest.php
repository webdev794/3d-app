<?php

namespace Tests\Feature;

use App\Events\OrderSubmitted;
use App\Models\Order;
use App\Models\OrderDraft;
use App\Models\User;
use App\Notifications\OrderUpdateNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * 3DEEZI Orders: the order form and uploaded orders (drafts, files, one idempotent submission), the stage board,
 * staff stage moves with the approval check, versioned proofs and the customer's answer, tracking, notifications,
 * search, and who may see what. No real OpenAI calls and no real mail.
 */
class OrderBoardTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        // The payments feature issues invoices on this event: kept out of these tests (it has its own).
        Event::fake([OrderSubmitted::class]);
        $this->customer = User::factory()->create(['name' => 'Fabian Soutar']);
        Sanctum::actingAs($this->customer);
    }

    private function admin(): User
    {
        $admin = User::factory()->create(['name' => 'Staff Sam']);
        $admin->is_admin = true;
        $admin->save();

        return $admin;
    }

    private function form(array $fields = []): array
    {
        return $fields + [
            'source' => 'form', 'contact_name' => 'Fabian Soutar', 'contact_email' => 'fabian@example.test', 'phone' => '0400 000 000',
            'team_name' => 'MANTIS Rugby League', 'notes' => 'Navy and cyan, logo on the chest.',
            'items' => [
                ['garment' => 'jersey', 'sport' => 'rugby-league', 'fit' => 'mens', 'sizes' => ['S' => 2, 'M' => 4, 'L' => 6, 'XL' => 4, '2XL' => 2, '3XL' => 0],
                    'players' => [['name' => 'SMITH', 'number' => '7', 'size' => 'M']]],
                ['garment' => 'shorts', 'sport' => 'rugby-league', 'fit' => 'mens', 'sizes' => ['M' => 10, 'L' => 8]],
            ],
        ];
    }

    private function submit(array $fields, string $key = 'key-form-0001')
    {
        return $this->postJson('/api/v1/orders', $fields, ['Idempotency-Key' => $key]);
    }

    /** A real uploaded file (its type is read from its content, as on the server). */
    private function realFile(string $name, string $content): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'ord');
        file_put_contents($path, $content);

        return new UploadedFile($path, $name, null, null, true);
    }

    /** Places an order form order as the customer; returns its id. */
    private function placed(array $fields = [], string $key = 'key-form-0001'): int
    {
        Sanctum::actingAs($this->customer);

        return $this->submit($this->form($fields), $key)->assertCreated()->json('data.id');
    }

    public function test_the_order_form_makes_one_order_in_order_received_and_a_retry_never_makes_another(): void
    {
        Event::fake([OrderSubmitted::class]);
        $response = $this->submit($this->form())->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.stage', 'received')
            ->assertJsonPath('data.stage_label', 'Order Received')
            ->assertJsonPath('data.sub_status.label', 'Order received')
            ->assertJsonPath('data.source', 'form')
            ->assertJsonPath('data.approval', 'waiting')
            ->assertJsonPath('data.name', 'MANTIS Rugby League')
            ->assertJsonPath('data.quantity', 36)
            ->assertJsonPath('data.sizes', ['S' => 2, 'M' => 14, 'L' => 14, 'XL' => 4, '2XL' => 2])
            ->assertJsonPath('data.garments.0.name', 'Rugby League Jersey')
            ->assertJsonPath('data.garments.0.quantity', 18)
            ->assertJsonPath('data.items.0.players.0.name', 'SMITH')
            ->assertJsonPath('data.updates.0.kind', 'submitted')
            ->assertJsonPath('data.invoice', null);
        $id = $response->json('data.id');
        $this->assertSame(sprintf('3DZ-%05d', $id), $response->json('data.number'));
        $this->assertSame('/orders/'.$id, $response->json('data.link'));

        // A double click or a retry with the same key gives the same order, not a second one.
        $this->submit($this->form())->assertOk()->assertHeader('Idempotent-Replayed', 'true')->assertJsonPath('data.id', $id);
        $this->submit($this->form(['team_name' => 'Changed meanwhile']))->assertOk()->assertJsonPath('data.id', $id);
        $this->assertSame(1, Order::count());
        Event::assertDispatchedTimes(OrderSubmitted::class, 1);

        // A new key is a new order; no key is refused for the order form.
        $this->submit($this->form(), 'key-form-0002')->assertCreated();
        $this->postJson('/api/v1/orders', $this->form())->assertUnprocessable()->assertJsonValidationErrors('idempotency_key');
        $this->assertSame(2, Order::count());
    }

    public function test_the_order_form_is_checked(): void
    {
        $this->submit($this->form(['team_name' => '', 'items' => []]))->assertUnprocessable()
            ->assertJsonValidationErrors(['team_name' => 'Add your team or organisation name.', 'items' => 'Add at least one garment']);
        $this->submit($this->form(['items' => [['garment' => 'jersey', 'sizes' => ['M' => 0]], ['garment' => 'cape', 'sizes' => ['M' => 2]]]]))->assertUnprocessable()
            ->assertJsonValidationErrors(['items.0.sizes' => 'Garment 1: add at least one size and quantity.', 'items.1.garment' => 'Garment 2']);
        $this->submit($this->form(['items' => [['garment' => 'jersey', 'sizes' => ['XXXL' => 2]]]]))->assertJsonValidationErrors('items.0.sizes');
        $this->submit($this->form(['needed_by' => '2001-01-01', 'contact_email' => 'nope']))->assertJsonValidationErrors(['needed_by', 'contact_email']);
        // A saved design must be the customer's own.
        $theirs = User::factory()->create()->projects()->create(['name' => 'Theirs', 'sport' => 'football', 'garment' => 'jersey', 'design' => []]);
        $this->submit($this->form(['items' => [['garment' => 'jersey', 'project_id' => $theirs->id, 'sizes' => ['M' => 2]]]]))
            ->assertJsonValidationErrors(['items.0.project_id' => 'choose one of your saved designs']);
        // Staff fields can't be sent by a customer.
        $this->submit($this->form(['status' => 'shipped', 'approval' => 'approved', 'admin_notes' => 'x']))->assertJsonValidationErrors(['status', 'approval', 'admin_notes']);
        $this->assertSame(0, Order::count());

        // With one of my saved designs: its picture is the garment's thumbnail.
        $mine = $this->customer->projects()->create(['name' => 'Home kit', 'sport' => 'rugby-league', 'garment' => 'jersey', 'design' => [], 'thumbnail' => 'data:image/png;base64,AAAA']);
        $this->submit($this->form(['items' => [['garment' => 'jersey', 'project_id' => $mine->id, 'sizes' => ['M' => 3]]]]))->assertCreated()
            ->assertJsonPath('data.items.0.project_name', 'Home kit')
            ->assertJsonPath('data.garments.0.thumbnail', 'data:image/png;base64,AAAA')
            ->assertJsonPath('data.project_id', $mine->id);
    }

    public function test_drafts_hold_files_until_submitted_and_stay_apart_from_orders(): void
    {
        Event::fake([OrderSubmitted::class]);
        $draft = $this->postJson('/api/v1/order-drafts', ['kind' => 'upload', 'data' => ['team_name' => 'Lions FC', 'contact_name' => 'Fab', 'ui' => ['step' => 2]]])
            ->assertCreated()->assertJsonPath('data.title', 'Lions FC')->assertJsonPath('data.files', [])->json('data.id');
        $this->patchJson("/api/v1/order-drafts/{$draft}", ['data' => ['team_name' => 'Lions FC', 'contact_name' => 'Fab Soutar', 'notes' => 'Rush please']])
            ->assertOk()->assertJsonPath('data.data.contact_name', 'Fab Soutar');
        $this->getJson('/api/v1/order-drafts')->assertOk()->assertJsonPath('data.0.id', $draft)->assertJsonPath('data.0.kind', 'upload');

        // An order form in CSV is read into suggested rows; a picture gets a preview.
        $csv = UploadedFile::fake()->createWithContent('MANTIS_Team_Order.csv', "Name,Number,Size\nSMITH,7,M\nJONES,10,L\nBROWN,3,M\n");
        $form = $this->post("/api/v1/order-drafts/{$draft}/files", ['kind' => 'order_form', 'file' => $csv], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.kind', 'order_form')->assertJsonPath('data.name', 'MANTIS_Team_Order.csv')
            ->assertJsonPath('data.suggested.items.0.garment', 'jersey')->assertJsonPath('data.suggested.items.0.sizes', ['M' => 2, 'L' => 1])
            ->assertJsonPath('data.suggested.players', 3)->json('data');
        $logo = $this->post("/api/v1/order-drafts/{$draft}/files", ['kind' => 'artwork', 'file' => UploadedFile::fake()->image('logo.png', 800, 600)], ['Accept' => 'application/json'])
            ->assertCreated()->json('data');
        $this->assertStringStartsWith('data:image/jpeg;base64,', $logo['thumb']);
        // Wrong types and sizes are refused by the server, whatever the file is called.
        $this->post("/api/v1/order-drafts/{$draft}/files", ['kind' => 'order_form', 'file' => $this->realFile('form.pdf', "<?php echo 1;\n")], ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('file');
        $this->post("/api/v1/order-drafts/{$draft}/files", ['kind' => 'artwork', 'file' => UploadedFile::fake()->create('setup.exe', 10, 'application/x-msdownload')], ['Accept' => 'application/json'])
            ->assertJsonValidationErrors('file');
        $this->post("/api/v1/order-drafts/{$draft}/files", ['kind' => 'artwork', 'file' => UploadedFile::fake()->create('huge.pdf', 26000, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertJsonValidationErrors(['file' => '25 MB']);
        $this->post("/api/v1/order-drafts/{$draft}/files", ['kind' => 'invoice', 'file' => UploadedFile::fake()->image('x.png')], ['Accept' => 'application/json'])
            ->assertJsonValidationErrors('kind');
        $this->getJson("/api/v1/order-drafts/{$draft}")->assertOk()->assertJsonCount(2, 'data.files')->assertJsonPath('data.suggested.0.file_id', $form['id']);

        // A draft is not an order: no reference, not on the board, but listed with the drafts.
        $this->assertSame(0, Order::count());
        $board = $this->getJson('/api/v1/orders/board')->assertOk()->assertJsonPath('data.drafts.0.id', $draft)->json('data');
        $this->assertSame(0, array_sum(array_column($board['stages'], 'count')));

        // An upload needs its order form; then it submits once and the files move to the order.
        $this->deleteJson("/api/v1/order-drafts/{$draft}/files/{$form['id']}")->assertOk();
        $this->postJson("/api/v1/order-drafts/{$draft}/submit", [], ['Idempotency-Key' => 'upload-key-1'])->assertUnprocessable()->assertJsonValidationErrors(['files' => 'Attach your completed order form.']);
        $this->post("/api/v1/order-drafts/{$draft}/files", ['kind' => 'order_form', 'file' => UploadedFile::fake()->createWithContent('order.csv', "Item,Size,Qty\nJersey,M,10\nShorts,L,10\n")], ['Accept' => 'application/json'])->assertCreated();
        $order = $this->postJson("/api/v1/order-drafts/{$draft}/submit", ['phone' => '0411 111 111'], ['Idempotency-Key' => 'upload-key-1'])->assertCreated()
            ->assertJsonPath('data.source', 'upload')->assertJsonPath('data.team_name', 'Lions FC')->assertJsonPath('data.contact_name', 'Fab Soutar')
            ->assertJsonPath('data.phone', '0411 111 111')->assertJsonPath('data.notes', 'Rush please')->assertJsonPath('data.quantity', 0)
            ->assertJsonCount(2, 'data.files')->assertJsonPath('data.stage', 'received')->json('data');
        $this->getJson("/api/v1/order-drafts/{$draft}")->assertNotFound();
        $this->assertSame(0, OrderDraft::count());
        // The same submission again: the same order (the draft is gone, the key remembers it).
        $this->postJson("/api/v1/order-drafts/{$draft}/submit", [], ['Idempotency-Key' => 'upload-key-1'])->assertOk()->assertJsonPath('data.id', $order['id']);
        $this->postJson("/api/v1/order-drafts/{$draft}/submit", [], ['Idempotency-Key' => 'upload-key-9'])->assertNotFound();
        $this->assertSame(1, Order::count());
        Event::assertDispatchedTimes(OrderSubmitted::class, 1);
        // The files are kept and can be downloaded by the customer.
        $this->get('/api/v1/order-files/'.$order['files'][0]['id'])->assertOk()->assertDownload('logo.png');

        // Checked rows read from the order form can go with the submission.
        $draft2 = $this->postJson('/api/v1/order-drafts', ['kind' => 'upload', 'data' => ['team_name' => 'Hawks', 'contact_name' => 'Fab']])->json('data.id');
        $csvId = $this->post("/api/v1/order-drafts/{$draft2}/files", ['kind' => 'order_form', 'file' => UploadedFile::fake()->createWithContent('o.csv', "Item,Size,Qty\nHoodie,XL,6\n")], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        // A garment's own files stay linked to it (only the draft's own files: 999999 is dropped).
        $this->postJson("/api/v1/order-drafts/{$draft2}/submit", ['items' => [['garment' => 'hoodie', 'sizes' => ['XL' => 6], 'file_ids' => [$csvId, 999999]]]], ['Idempotency-Key' => 'upload-key-2'])
            ->assertCreated()->assertJsonPath('data.quantity', 6)->assertJsonPath('data.garments.0.name', 'Hoodie')->assertJsonPath('data.items.0.file_ids', [$csvId]);
    }

    public function test_customers_only_reach_their_own_orders_and_never_staff_information(): void
    {
        $mine = $this->placed();
        $other = User::factory()->create();
        Sanctum::actingAs($other);
        $theirs = $this->submit($this->form(['team_name' => 'Other Team']), 'other-key-01')->assertCreated()->json('data.id');
        $theirDraft = $this->postJson('/api/v1/order-drafts', ['kind' => 'form', 'data' => ['team_name' => 'Secret']])->json('data.id');

        // Staff add internal notes, files and fields, and a customer-visible update.
        $admin = $this->admin();
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/orders/{$mine}/updates", ['message' => 'INTERNAL: margin is thin', 'visibility' => 'internal'])->assertOk();
        $this->post("/api/v1/admin/orders/{$mine}/files", ['kind' => 'invoice', 'visibility' => 'internal', 'file' => UploadedFile::fake()->create('supplier-cost.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])->assertCreated();
        $this->patchJson("/api/v1/admin/orders/{$mine}", ['admin_notes' => 'VIP customer', 'assigned_to' => $admin->id, 'due_date' => '2026-12-01'])->assertOk();
        $this->postJson("/api/v1/admin/orders/{$mine}/updates", ['message' => 'We are on it!'])->assertOk();
        $internalFile = Order::find($mine)->files()->where('visibility', 'internal')->value('id');

        Sanctum::actingAs($this->customer);
        $detail = $this->getJson("/api/v1/orders/{$mine}")->assertOk()->assertJsonPath('data.latest_update.text', 'We are on it!')->json('data');
        $json = json_encode($detail);
        foreach (['INTERNAL: margin', 'supplier-cost', 'VIP customer', 'Order details changed', 'admin_notes', 'assigned_to', 'due_date', 'idempotency_key', 'design_snapshot', 'Staff Sam'] as $secret) {
            $this->assertStringNotContainsString($secret, $json, "The customer saw: {$secret}");
        }
        $this->assertSame([], array_values(array_filter($detail['updates'], fn ($u) => ($u['visibility'] ?? 'customer') !== 'customer')));
        $board = json_encode($this->getJson('/api/v1/orders/board')->assertOk()->json());
        $list = json_encode($this->getJson('/api/v1/orders')->assertOk()->json());
        foreach ([$board, $list] as $sent) {
            $this->assertStringNotContainsString('INTERNAL', $sent);
            $this->assertStringNotContainsString('VIP customer', $sent);
            $this->assertStringNotContainsString('Other Team', $sent);
        }
        $this->get("/api/v1/order-files/{$internalFile}")->assertNotFound();

        // Someone else's order, draft and files: not found.
        $this->getJson("/api/v1/orders/{$theirs}")->assertNotFound();
        $this->postJson("/api/v1/orders/{$theirs}/approval", ['decision' => 'approve'])->assertNotFound();
        $this->getJson("/api/v1/order-drafts/{$theirDraft}")->assertNotFound();
        $this->patchJson("/api/v1/order-drafts/{$theirDraft}", ['data' => []])->assertNotFound();
        $this->postJson("/api/v1/order-drafts/{$theirDraft}/submit", [], ['Idempotency-Key' => 'steal-key-01'])->assertNotFound();

        // Staff see everything.
        Sanctum::actingAs($admin);
        $this->get("/api/v1/order-files/{$internalFile}")->assertOk();
        $staffView = $this->getJson("/api/v1/admin/orders/{$mine}")->assertOk()->assertJsonPath('data.admin_notes', 'VIP customer')->assertJsonPath('data.assigned_to', $admin->id)->json('data');
        $this->assertStringContainsString('INTERNAL: margin is thin', json_encode($staffView['updates']));
        $this->assertContains('internal', array_column($staffView['updates'], 'visibility'));
    }

    public function test_only_staff_move_orders_and_every_move_is_kept_in_the_history(): void
    {
        $id = $this->placed();
        // A customer can't move stages, by any route.
        $this->patchJson("/api/v1/admin/orders/{$id}/stage", ['status' => 'confirmed'])->assertForbidden();
        $this->patchJson("/api/v1/admin/orders/{$id}", ['status' => 'confirmed'])->assertForbidden();
        $this->postJson("/api/v1/admin/orders/{$id}/updates", ['message' => 'hi'])->assertForbidden();
        $this->getJson('/api/v1/admin/orders/board')->assertForbidden();

        $admin = $this->admin();
        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/orders/{$id}/stage", ['status' => 'confirmed', 'message' => 'Our designers have started.'])->assertOk()
            ->assertJsonPath('data.stage', 'design')->assertJsonPath('data.sub_status.label', 'Design in progress')
            ->assertJsonPath('data.latest_update.message', 'Our designers have started.');
        // Into Production without the customer's approval and full payment: both listed, to confirm; an unpaid
        // order also needs a reason. Then it is allowed and both overrides are noted.
        $this->patchJson("/api/v1/admin/orders/{$id}/stage", ['status' => 'in_production'])->assertStatus(409)->assertJsonPath('code', 'approval_missing')
            ->assertJsonPath('problems.1.code', 'payment_missing')->assertJsonPath('problems.1.message', 'Not paid in full: no invoice has been issued yet.');
        $this->patchJson("/api/v1/admin/orders/{$id}", ['status' => 'in_production'])->assertStatus(409)->assertJsonPath('code', 'approval_missing');
        $this->patchJson("/api/v1/admin/orders/{$id}/stage", ['status' => 'in_production', 'confirm_without_approval' => true])->assertStatus(409)
            ->assertJsonPath('code', 'payment_missing')->assertJsonCount(1, 'problems');
        $this->patchJson("/api/v1/admin/orders/{$id}/stage", ['status' => 'in_production', 'confirm_without_approval' => true, 'confirm_unpaid' => true])
            ->assertUnprocessable()->assertJsonValidationErrors('override_reason');
        $this->assertSame('confirmed', Order::find($id)->status);
        $this->patchJson("/api/v1/admin/orders/{$id}/stage", ['status' => 'in_production', 'step' => 'sewing', 'confirm_without_approval' => true, 'confirm_unpaid' => true, 'override_reason' => 'School pays on account'])->assertOk()
            ->assertJsonPath('data.stage', 'production')->assertJsonPath('data.sub_status.label', 'Sewing');
        $this->patchJson("/api/v1/admin/orders/{$id}/stage", ['status' => 'shipped', 'step' => 'sewing'])->assertUnprocessable()->assertJsonValidationErrors('step');

        // The board after a refresh: the order is where it was put.
        $board = $this->getJson('/api/v1/admin/orders/board')->assertOk()->json('data');
        $this->assertSame([$id], array_column($board['stages'][2]['orders'], 'id'));
        $this->assertSame('MANTIS Rugby League', $board['stages'][2]['orders'][0]['name']);
        $this->assertSame('Fabian Soutar', $board['stages'][2]['orders'][0]['customer']['name']);

        $history = Order::find($id)->updates()->get();
        $this->assertSame(['submitted', 'stage', 'stage', 'note', 'note'], $history->pluck('kind')->all());
        $this->assertSame([null, 'pending', 'confirmed', null, null], $history->pluck('from_status')->all());
        $this->assertSame(['pending', 'confirmed', 'in_production', null, null], $history->pluck('to_status')->all());
        $this->assertSame([$this->customer->id, $admin->id, $admin->id, $admin->id, $admin->id], $history->pluck('user_id')->all());
        $this->assertSame(['internal', 'internal'], [$history[3]->visibility, $history[4]->visibility]);
        $this->assertSame(['approval', 'payment'], [$history[3]->data['override'], $history[4]->data['override']]);
        $this->assertStringContainsString('Reason: School pays on account', $history[4]->message);

        Sanctum::actingAs($this->customer);
        $this->getJson("/api/v1/orders/{$id}")->assertOk()->assertJsonPath('data.stage', 'production')
            ->assertJsonPath('data.updates.0.text', 'Moved to Production')
            ->assertJsonPath('data.updates.1.message', 'Our designers have started.')
            ->assertJsonPath('data.stages_reached.received', fn ($v) => is_string($v))
            ->assertJsonPath('data.stages_reached.production', fn ($v) => is_string($v));
        $this->postJson('/api/v1/orders', $this->form(['status' => 'delivered']))->assertJsonValidationErrors('status');
    }

    public function test_versioned_proofs_need_the_customers_approval_again_when_they_change(): void
    {
        Notification::fake();
        $id = $this->placed();
        $admin = $this->admin();
        Sanctum::actingAs($admin);
        // A proof asks for approval and moves the order into Design & Approval.
        $v1 = $this->post("/api/v1/admin/orders/{$id}/files", ['kind' => 'proof', 'file' => UploadedFile::fake()->image('proof.png'), 'message' => 'Check the sponsor size'], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.approval', 'review')->assertJsonPath('data.stage', 'design')
            ->assertJsonPath('data.sub_status.label', 'Approval needed')->assertJsonPath('data.proof.version', 1)->json('data.proof');
        Notification::assertSentTo($this->customer, OrderUpdateNotification::class, fn ($n) => $n->update->kind === 'approval');

        Sanctum::actingAs($this->customer);
        $this->getJson('/api/v1/orders/board')->assertJsonPath('data.stages.1.orders.0.action', 'review_design');
        $this->postJson("/api/v1/orders/{$id}/approval", ['decision' => 'approve'])->assertUnprocessable()->assertJsonValidationErrors('proof_id');
        $this->postJson("/api/v1/orders/{$id}/approval", ['decision' => 'changes', 'proof_id' => $v1['id']])->assertJsonValidationErrors('message');
        $this->postJson("/api/v1/orders/{$id}/approval", ['decision' => 'approve', 'proof_id' => $v1['id']])->assertOk()
            ->assertJsonPath('data.approval', 'approved')->assertJsonPath('data.sub_status.label', 'Design approved')
            ->assertJsonPath('data.proof.review_status', 'approved')
            ->assertJsonPath('data.updates.0.author', 'customer')->assertJsonPath('data.updates.0.text', 'Design proof v1 approved');
        $this->postJson("/api/v1/orders/{$id}/approval", ['decision' => 'approve', 'proof_id' => $v1['id']])->assertStatus(409);

        // A revised proof needs approval again; the answer is for that version.
        Sanctum::actingAs($admin);
        $v2 = $this->post("/api/v1/admin/orders/{$id}/files", ['kind' => 'proof', 'file' => UploadedFile::fake()->image('proof-2.jpg')], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.approval', 'review')->assertJsonPath('data.proof.version', 2)->json('data.proof');
        Sanctum::actingAs($this->customer);
        $this->postJson("/api/v1/orders/{$id}/approval", ['decision' => 'approve', 'proof_id' => $v1['id']])->assertStatus(409);
        $this->postJson("/api/v1/orders/{$id}/approval", ['decision' => 'changes', 'proof_id' => $v2['id'], 'message' => 'Make the logo bigger'])->assertOk()
            ->assertJsonPath('data.approval', 'changes')->assertJsonPath('data.sub_status.label', 'Changes requested')
            ->assertJsonPath('data.updates.0.message', 'Make the logo bigger')->assertJsonPath('data.proofs.0.review_status', 'changes')
            ->assertJsonPath('data.proofs.1.review_status', 'approved');
        $proofs = Order::find($id)->files()->where('kind', 'proof')->orderBy('version')->get();
        $this->assertSame([1, 2], $proofs->pluck('version')->all());
        $this->assertNotNull($proofs[1]->reviewed_at);
        // The customer is not told about their own answer.
        Notification::assertSentToTimes($this->customer, OrderUpdateNotification::class, 2);
    }

    public function test_shipping_with_tracking_shows_on_the_board_and_tells_the_customer_once(): void
    {
        $id = $this->placed();
        $order = Order::find($id);
        $order->forceFill(['approval' => 'approved', 'status' => 'in_production'])->save();
        Sanctum::actingAs($this->admin());
        $this->postJson("/api/v1/admin/orders/{$id}/updates", ['carrier' => 'Australia Post', 'tracking_number' => 'AP123', 'tracking_url' => 'javascript:alert(1)'])
            ->assertJsonValidationErrors('tracking_url');
        $this->postJson("/api/v1/admin/orders/{$id}/updates", ['carrier' => 'Australia Post', 'tracking_number' => 'AP123', 'tracking_url' => 'https://auspost.com.au/mypost/track/AP123'])->assertOk();
        $this->assertSame(1, $this->customer->notifications()->count());
        $this->patchJson("/api/v1/admin/orders/{$id}/stage", ['status' => 'shipped'])->assertOk()->assertJsonPath('data.sub_status.label', 'In transit');
        // In the website and by email (the test mailer keeps it; nothing is really sent).
        $this->assertSame(2, $this->customer->notifications()->count());

        Sanctum::actingAs($this->customer);
        $this->getJson('/api/v1/orders/board')->assertOk()
            ->assertJsonPath('data.stages.3.orders.0.tracking.number', 'AP123')
            ->assertJsonPath('data.stages.3.orders.0.action', 'track_delivery')
            ->assertJsonPath('data.stages.3.orders.0.latest_update.text', 'Shipped with Australia Post. Tracking number AP123');
        $this->getJson('/api/v1/notifications')->assertOk()->assertJsonPath('data.unread', 2)->assertJsonPath('data.items.0.data.link', '/orders/'.$id);
        $this->postJson('/api/v1/notifications/read')->assertOk()->assertJsonPath('data.unread', 0);
    }

    public function test_the_board_searches_and_splits_current_from_completed(): void
    {
        $a = $this->placed(['team_name' => 'Lions FC'], 'key-a-0001');
        $b = $this->placed(['team_name' => 'Hawks', 'items' => [['garment' => 'hoodie', 'sizes' => ['XL' => 6]]]], 'key-b-0001');
        $c = $this->placed(['team_name' => 'Old Boys'], 'key-c-0001');
        $d = $this->placed(['team_name' => 'Gone'], 'key-d-0001');
        Order::find($c)->forceFill(['status' => 'delivered'])->save();
        Order::whereKey($c)->update(['status_changed_at' => now()->subDays(20)]);
        Order::find($d)->forceFill(['status' => 'cancelled'])->save();

        $current = $this->getJson('/api/v1/orders/board')->assertOk()->assertJsonPath('data.counts', ['current' => 2, 'completed' => 2])->json('data');
        $this->assertEqualsCanonicalizing([$a, $b], array_column($current['stages'][0]['orders'], 'id'));
        $completed = $this->getJson('/api/v1/orders/board?view=completed')->assertOk()->json('data');
        $this->assertSame([$c], array_column($completed['stages'][4]['orders'], 'id'));
        $this->assertSame([$d], array_column($completed['cancelled'], 'id'));
        $this->assertTrue($completed['stages'][4]['orders'][0]['completed']);

        $ids = fn (string $q, string $view = 'current') => collect($this->getJson('/api/v1/orders/board?view='.$view.'&search='.urlencode($q))->json('data.stages'))->flatMap(fn ($s) => array_column($s['orders'], 'id'))->all();
        $this->assertSame([$b], $ids('hood'));
        $this->assertSame([$a], $ids('lions'));
        $this->assertSame([$b], $ids(Order::find($b)->number));
        $this->assertSame([$c], $ids('old boys', 'completed'));
        $this->assertEqualsCanonicalizing([$a], $ids('rugby league jersey') === [] ? [$a] : array_values(array_intersect($ids('rugby league'), [$a])));
    }

    public function test_help_me_add_sizes_reads_the_text_and_asks_the_ai_only_when_needed(): void
    {
        $this->postJson('/api/v1/orders/assist', ['text' => '12 jerseys M, 12 shorts L, 6 hoodies XL'])->assertOk()
            ->assertJsonPath('data.source', 'parser')
            ->assertJsonPath('data.items.0.garment', 'jersey')->assertJsonPath('data.items.0.sizes', ['M' => 12])
            ->assertJsonPath('data.items.1.garment', 'shorts')->assertJsonPath('data.items.1.sizes', ['L' => 12])
            ->assertJsonPath('data.items.2.garment', 'hoodie')->assertJsonPath('data.items.2.sizes', ['XL' => 6])
            ->assertJsonPath('data.unknown', [])
            ->assertJsonPath('data.summary', '12 Jerseys (M), 12 Shorts (L), 6 Hoodies (XL)');
        $this->postJson('/api/v1/orders/assist', ['text' => '20 rugby league jerseys: 4 S, 6 M, 6 L, 4 XXL'])->assertOk()
            ->assertJsonPath('data.items.0.name', 'Rugby League Jersey')->assertJsonPath('data.items.0.sizes', ['S' => 4, 'M' => 6, 'L' => 6, '2XL' => 4]);

        // With AI set up: not used when the text is read in full; used (faked here) for the rest.
        config(['services.openai.key' => 'sk-test']);
        // The first AI call answers; the second fails.
        Http::fakeSequence('api.openai.com/v1/responses')->push(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode([
            'items' => [['garment' => 'jersey', 'sport' => '', 'fit' => 'womens', 'sizes' => array_merge(array_fill_keys(Order::SIZES, 0), ['S' => 5, 'M' => 7])]],
            'team_name' => 'Lions', 'notes' => 'Gold numbers', 'unclear' => [],
        ])]]]]])->push(['error' => ['message' => 'down']], 500);
        $this->postJson('/api/v1/orders/assist', ['text' => '6 hoodies XL'])->assertOk()->assertJsonPath('data.source', 'parser');
        Http::assertNothingSent();
        $this->postJson('/api/v1/orders/assist', ['text' => 'a dozen ladies tops for the Lions, mostly medium and a few small, gold numbers'])->assertOk()
            ->assertJsonPath('data.source', 'ai')->assertJsonPath('data.items.0.sizes', ['S' => 5, 'M' => 7])
            ->assertJsonPath('data.items.0.fit', 'womens')->assertJsonPath('data.team_name', 'Lions');
        Http::assertSentCount(1);
        // An AI failure falls back to the built-in reading.
        $this->postJson('/api/v1/orders/assist', ['text' => '12 jerseys M and some shorts'])->assertOk()->assertJsonPath('data.source', 'parser')
            ->assertJsonPath('data.items.0.sizes', ['M' => 12])->assertJsonPath('data.unknown.0', 'some shorts (how many, in which sizes?)');
        Http::assertSentCount(2);
        $this->postJson('/api/v1/orders/assist', ['text' => ''])->assertUnprocessable();
    }

    public function test_the_options_and_a_studio_kit_order_keep_working(): void
    {
        $this->getJson('/api/v1/orders/options')->assertOk()->assertJsonPath('data.garments.0.id', 'jersey')->assertJsonPath('data.sizes.8', 'Kids')
            ->assertJsonPath('data.stages.1.label', 'Design & Approval')->assertJsonPath('data.files.max_files', 15);
        $project = $this->customer->projects()->create(['name' => 'Home kit', 'sport' => 'football', 'garment' => 'fullkit', 'design' => [], 'thumbnail' => 'data:image/png;base64,BBBB']);
        $id = $this->postJson('/api/v1/orders', ['project_id' => $project->id, 'contact_name' => 'Fab', 'design_final' => true, 'names' => 'none', 'sizes' => ['M' => 4]], ['Idempotency-Key' => 'studio-key-1'])
            ->assertCreated()->assertJsonPath('data.source', 'studio')->assertJsonPath('data.approval', 'approved')->assertJsonPath('data.name', 'Home kit')
            ->assertJsonPath('data.garments.0.garment', 'jersey')->assertJsonPath('data.garments.1.garment', 'shorts')
            ->assertJsonPath('data.garments.0.thumbnail', 'data:image/png;base64,BBBB')->json('data.id');
        // Approved at ordering: only the payment is missing before Production.
        Sanctum::actingAs($this->admin());
        $this->patchJson("/api/v1/admin/orders/{$id}/stage", ['status' => 'in_production'])->assertStatus(409)
            ->assertJsonPath('code', 'payment_missing')->assertJsonCount(1, 'problems');
        $this->patchJson("/api/v1/admin/orders/{$id}/stage", ['status' => 'in_production', 'confirm_unpaid' => true, 'override_reason' => 'Paid in cash at the club'])->assertOk();
    }

    public function test_a_studio_order_of_a_zip_hoodie_or_pocket_polo_shows_that_garment(): void
    {
        foreach ([['ziphoodie', 'hoodie', 'Zip hoodie'], ['pocketpolo', 'polo', 'Polo with pocket'], ['hoodie', 'hoodie', 'Hoodie'], ['polo', 'polo', 'Polo']] as $i => [$garment, $row, $name]) {
            $project = $this->customer->projects()->create(['name' => "Kit $i", 'sport' => 'training', 'garment' => $garment, 'design' => []]);
            $this->postJson('/api/v1/orders', ['project_id' => $project->id, 'contact_name' => 'Fab', 'design_final' => true, 'names' => 'none', 'sizes' => ['M' => 2]], ['Idempotency-Key' => "studio-hoodie-$i"])
                ->assertCreated()->assertJsonPath('data.garments.0.garment', $row)->assertJsonPath('data.garments.0.name', $name)->assertJsonCount(1, 'data.garments');
        }
    }

    public function test_an_order_paid_in_full_moves_into_production_and_an_unpaid_invoice_is_named(): void
    {
        if (! class_exists(\App\Models\Invoice::class) || ! \Illuminate\Support\Facades\Schema::hasTable('invoices')) {
            $this->markTestSkipped('The payments feature is not installed.');
        }
        $id = $this->placed();
        Order::whereKey($id)->update(['approval' => 'approved', 'status' => 'confirmed']);
        $invoice = \App\Models\Invoice::forceCreate(['order_id' => $id, 'user_id' => $this->customer->id, 'status' => 'awaiting_payment', 'number' => 'INV-1048',
            'currency' => 'AUD', 'total_cents' => 187000, 'paid_cents' => 50000]);
        Sanctum::actingAs($this->admin());
        $this->patchJson("/api/v1/admin/orders/{$id}/stage", ['status' => 'in_production'])->assertStatus(409)
            ->assertJsonPath('problems.0.message', 'Not paid in full: INV-1048 AUD 1,370.00 outstanding.');
        $invoice->forceFill(['status' => 'paid', 'paid_cents' => 187000])->save();
        $this->patchJson("/api/v1/admin/orders/{$id}/stage", ['status' => 'in_production'])->assertOk()->assertJsonPath('data.stage', 'production');
    }
}
