<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\OrderDraft;
use App\Models\OrderFile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Admin › Users › "Remove test accounts": only the test accounts go; every admin and every real email address stays. */
class RemoveTestAccountsTest extends TestCase
{
    use RefreshDatabase;

    private const PREVIEW = '/api/v1/admin/users/test-accounts';

    private const REMOVE = '/api/v1/admin/users/test-accounts/remove';

    private function user(string $name, string $email, bool $admin = false): User
    {
        $user = User::factory()->create(['name' => $name, 'email' => $email]);
        if ($admin) {
            $user->forceFill(['is_admin' => true])->save();
        }

        return $user;
    }

    private function teamRequest(User $user): void
    {
        $n = DB::table('team_requests')->count() + 1001;
        DB::table('team_requests')->insert(['sequence' => $n, 'number' => "TEAM-{$n}", 'user_id' => $user->id, 'name' => 'Club', 'email' => $user->email,
            'sport' => 'football', 'garment' => 'jersey', 'description' => 'A kit', 'period' => now()->format('Y-m'), 'created_at' => now(), 'updated_at' => now()]);
    }

    /** An unsent order upload with one stored file; returns the file's path. */
    private function draftWithFile(User $user): string
    {
        $draft = new OrderDraft(['kind' => 'upload', 'data' => ['team_name' => $user->name]]);
        $draft->user_id = $user->id;
        $draft->save();
        $path = "order-files/draft-{$draft->id}/form.pdf";
        Storage::disk('local')->put($path, '%PDF');
        $file = new OrderFile(['kind' => 'order_form', 'name' => 'form.pdf', 'extension' => 'pdf', 'path' => $path, 'mime_type' => 'application/pdf', 'size' => 4]);
        $file->user_id = $user->id;
        $file->order_draft_id = $draft->id;
        $file->save();

        return $path;
    }

    /** A test account with everything an account can own: projects, an upload, an Artboard design, a draft, sign-ins. */
    private function busyAccount(User $user): string
    {
        foreach (['Kit A', 'Kit B'] as $name) {
            $user->projects()->create(['name' => $name, 'sport' => 'football', 'garment' => 'jersey', 'design' => ['main' => '#000000']]);
        }
        $user->assets()->create(['name' => 'Logo', 'type' => 'reference', 'path' => "assets/{$user->id}/logo.png", 'mime_type' => 'image/png', 'size' => 4]);
        Storage::disk('local')->put("assets/{$user->id}/logo.png", 'png!');
        $user->artboardDocuments()->create(['name' => 'Poster', 'document' => '{"pages":[]}']);
        $user->createToken('qa');
        DB::table('notifications')->insert(['id' => (string) Str::uuid(), 'type' => 'App\\Notifications\\Test', 'notifiable_type' => $user->getMorphClass(),
            'notifiable_id' => $user->id, 'data' => '{}', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('sessions')->insert(['id' => 'session-'.$user->id, 'user_id' => $user->id, 'payload' => '', 'last_activity' => time()]);

        return $this->draftWithFile($user);
    }

    public function test_only_admins_preview_and_remove_test_accounts(): void
    {
        $this->getJson(self::PREVIEW)->assertUnauthorized();
        $this->postJson(self::REMOVE, ['confirm' => true])->assertUnauthorized();
        $qa = $this->user('Journey Tester', 'journey.tester@example.test');
        Sanctum::actingAs($this->user('Real Customer', 'coach@club.com.au'));
        $this->getJson(self::PREVIEW)->assertForbidden();
        $this->postJson(self::REMOVE, ['confirm' => true])->assertForbidden();
        // A test account cannot clear the others either.
        Sanctum::actingAs($qa);
        $this->getJson(self::PREVIEW)->assertForbidden();
        $this->postJson(self::REMOVE, ['confirm' => true])->assertForbidden();
        $this->assertSame(2, User::count());
    }

    public function test_the_preview_lists_the_test_accounts_and_the_removal_keeps_admins_real_emails_and_customers(): void
    {
        Storage::fake('local');
        // Kept: every admin (with a test email too), real email addresses (look-alikes too), accounts with an order or a
        // 3DEEZI TEAM request, and the demo customers.
        $me = $this->user('3DEEZI Admin', 'admin@example.test', admin: true);
        $kept = [
            $me,
            $this->user('QA Admin', 'qa.admin@example.com', admin: true),
            $this->user('Manoj Caresort', 'manoj@caresort.com.au', admin: true),
            $customer = $this->user('Real Customer', 'coach@club.com.au'),
            $this->user('Look Alike', 'team@example.com.au'),
            $buyer = $this->user('Pay Tester', 'pay.tester.1@example.com'),
            $team = $this->user('Team Tester', 'team.tester@example.test'),
            $this->user('Sample Club', 'sample-club@example.test'),
        ];
        Order::create(['user_id' => $buyer->id, 'contact_name' => 'Pay Tester', 'sizes' => ['M' => 2]]);
        $this->teamRequest($team);
        $customer->assets()->create(['name' => 'Crest', 'type' => 'reference', 'path' => "assets/{$customer->id}/crest.png", 'mime_type' => 'image/png', 'size' => 4]);
        Storage::disk('local')->put("assets/{$customer->id}/crest.png", 'png!');
        $customerDraft = $this->draftWithFile($customer);
        // Removed: test emails (any case) without orders or TEAM requests, one of them with projects and uploads.
        $plain = $this->user('CDR QA', 'cdr.qa.1@example.com');
        $upper = $this->user('Layout QA', 'Layout.QA.2@EXAMPLE.TEST');
        $busy = $this->user('Garment QA', 'garment.qa.3@example.test');
        $busyDraft = $this->busyAccount($busy);

        Sanctum::actingAs($me);
        $preview = $this->getJson(self::PREVIEW)->assertOk()->assertJsonPath('data.remove_count', 3)->assertJsonPath('data.keep_count', 8)->json('data.remove');
        $this->assertSame([$plain->id, $upper->id, $busy->id], array_column($preview, 'id'));
        $this->assertSame(['id' => $busy->id, 'name' => 'Garment QA', 'email' => 'garment.qa.3@example.test', 'projects_count' => 2], $preview[2]);

        // Nothing goes without the confirm flag.
        $this->postJson(self::REMOVE)->assertUnprocessable();
        $this->postJson(self::REMOVE, ['confirm' => false])->assertUnprocessable();
        $this->assertSame(11, User::count());

        // Only the accounts the admin was shown, and only test accounts among them.
        $this->postJson(self::REMOVE, ['confirm' => true, 'ids' => [$plain->id, $customer->id, $buyer->id, $kept[1]->id]])->assertOk()
            ->assertJsonPath('data.removed', 1)->assertJsonPath('data.kept', 10)->assertJsonPath('data.message', 'Removed 1 test account. 10 accounts kept.');
        $this->assertDatabaseMissing('users', ['id' => $plain->id]);

        $this->postJson(self::REMOVE, ['confirm' => true])->assertOk()
            ->assertJsonPath('data.removed', 2)->assertJsonPath('data.kept', 8)->assertJsonPath('data.projects', 2)->assertJsonPath('data.assets', 1)
            ->assertJsonPath('data.artboard_documents', 1)->assertJsonPath('data.tokens', 1)->assertJsonPath('data.notifications', 1)
            ->assertJsonPath('data.sessions', 1)->assertJsonPath('data.asset_folders', 1)->assertJsonPath('data.draft_files', 1)
            ->assertJsonPath('data.message', 'Removed 2 test accounts. 8 accounts kept.');

        $this->assertEqualsCanonicalizing(array_map(fn (User $u) => $u->id, $kept), User::pluck('id')->all());
        foreach (['projects', 'assets', 'artboard_documents', 'order_drafts'] as $table) {
            $this->assertSame(0, DB::table($table)->where('user_id', $busy->id)->count(), $table);
        }
        $this->assertSame(0, DB::table('personal_access_tokens')->count());
        $this->assertSame(0, DB::table('notifications')->count());
        $this->assertSame(0, DB::table('sessions')->count());
        $this->assertDatabaseMissing('order_files', ['path' => $busyDraft]);
        Storage::disk('local')->assertMissing("assets/{$busy->id}");
        Storage::disk('local')->assertMissing($busyDraft);
        // The kept accounts keep their order, TEAM request, uploads and drafts.
        $this->assertSame(1, Order::count());
        $this->assertSame(1, DB::table('team_requests')->count());
        $this->assertSame(1, DB::table('assets')->where('user_id', $customer->id)->count());
        Storage::disk('local')->assertExists("assets/{$customer->id}/crest.png");
        $this->assertDatabaseHas('order_files', ['path' => $customerDraft, 'user_id' => $customer->id]);
        Storage::disk('local')->assertExists($customerDraft);

        // Nothing is left to remove.
        $this->getJson(self::PREVIEW)->assertOk()->assertJsonPath('data.remove_count', 0)->assertJsonPath('data.remove', [])->assertJsonPath('data.keep_count', 8);
        $this->postJson(self::REMOVE, ['confirm' => true])->assertOk()->assertJsonPath('data.removed', 0)->assertJsonPath('data.kept', 8);
    }
}
