<?php

namespace Tests\Feature;

use App\Mail\SupportMessageReceived;
use App\Models\SupportMessage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** The Support page's contact form (/support) and Admin > Support. */
class SupportMessageTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $email = 'admin@3deezi.test'): User
    {
        $admin = User::factory()->create(['email' => $email]);
        $admin->is_admin = true;
        $admin->save();

        return $admin;
    }

    public function test_the_form_checks_its_fields(): void
    {
        Mail::fake();
        $this->postJson('/api/v1/support', [])->assertUnprocessable()->assertJsonValidationErrors(['name', 'email', 'message']);
        $this->postJson('/api/v1/support', ['name' => 'Sam', 'email' => 'not-an-email', 'message' => 'Short'])
            ->assertUnprocessable()->assertJsonValidationErrors(['email', 'message'])->assertJsonMissingValidationErrors(['name']);
        $this->postJson('/api/v1/support', ['name' => 'Sam', 'email' => 'sam@club.com', 'message' => str_repeat('a', 5001), 'order_reference' => str_repeat('R', 61)])
            ->assertUnprocessable()->assertJsonValidationErrors(['message', 'order_reference']);
        $this->assertSame(0, SupportMessage::count());
        Mail::assertNothingQueued();
    }

    public function test_a_visitor_message_is_saved_and_emailed_to_the_admins(): void
    {
        Mail::fake();
        $this->admin('owner@3deezi.test');
        $this->admin('coach-admin@3deezi.test');
        User::factory()->create(['email' => 'player@club.com']);

        $this->postJson('/api/v1/support', ['name' => 'Sam Lee', 'email' => 'sam@club.com', 'order_reference' => ' 3DZ-1042 ', 'message' => 'Can we change the sizes on our order?'])
            ->assertCreated()->assertJsonPath('data.message', 'Thanks! Your message has reached the 3DEEZI team. We will reply by email.');

        $row = SupportMessage::sole();
        $this->assertSame(['Sam Lee', 'sam@club.com', '3DZ-1042', 'new', null], [$row->name, $row->email, $row->order_reference, $row->status, $row->user_id]);
        Mail::assertQueued(SupportMessageReceived::class, fn (SupportMessageReceived $mail) => $mail->hasTo('owner@3deezi.test')
            && $mail->hasTo('coach-admin@3deezi.test') && ! $mail->hasTo('player@club.com')
            && $mail->hasReplyTo('sam@club.com') && $mail->supportMessage->is($row) && $mail->connection === 'deferred');
        Mail::assertQueuedCount(1);
    }

    public function test_a_signed_in_message_notes_the_account_and_uses_the_support_address(): void
    {
        Mail::fake();
        config(['services.support.email' => 'help@3deezi.test']);
        $this->admin();
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/support', ['name' => $user->name, 'email' => $user->email, 'message' => 'The Artboard does not open on my tablet.'])->assertCreated();

        $this->assertSame($user->id, SupportMessage::sole()->user_id);
        Mail::assertQueued(SupportMessageReceived::class, fn (SupportMessageReceived $mail) => $mail->hasTo('help@3deezi.test') && ! $mail->hasTo('admin@3deezi.test'));
    }

    public function test_the_email_names_the_sender_and_the_reference(): void
    {
        $message = SupportMessage::create(['name' => 'Sam Lee', 'email' => 'sam@club.com', 'order_reference' => '3DZ-1042', 'message' => "Line one\nLine two"]);
        $mail = new SupportMessageReceived($message);

        $mail->assertHasSubject('3DEEZI Support: message from Sam Lee (3DZ-1042)');
        $mail->assertSeeInHtml('sam@club.com');
        $mail->assertSeeInHtml('Line one<br', false);
        $mail->assertSeeInHtml('/admin/support', false);
    }

    public function test_without_its_table_the_form_says_so_instead_of_failing(): void
    {
        Mail::fake();
        Schema::drop('support_messages');
        $this->postJson('/api/v1/support', ['name' => 'Sam', 'email' => 'sam@club.com', 'message' => 'Hello there, team!'])
            ->assertStatus(503)->assertJsonPath('message', 'The contact form is being updated. Please try again later, or ask 3DEEZI ASSIST.');
        Mail::assertNothingQueued();
    }

    public function test_only_admins_list_and_handle_support_messages(): void
    {
        $message = SupportMessage::create(['name' => 'Sam Lee', 'email' => 'sam@club.com', 'message' => 'Where is my order?']);
        SupportMessage::create(['name' => 'Alex', 'email' => 'alex@school.edu', 'message' => 'Do you print netball dresses?']);

        $this->getJson('/api/v1/admin/support-messages')->assertUnauthorized();
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/v1/admin/support-messages')->assertForbidden();
        $this->patchJson("/api/v1/admin/support-messages/{$message->id}", ['status' => 'closed'])->assertForbidden();
        $this->deleteJson("/api/v1/admin/support-messages/{$message->id}")->assertForbidden();

        Sanctum::actingAs($this->admin());
        $this->getJson('/api/v1/admin/support-messages')->assertOk()->assertJsonPath('data.total', 2);
        $this->getJson('/api/v1/admin/support-messages?search=netball')->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.data.0.name', 'Alex');
        $this->patchJson("/api/v1/admin/support-messages/{$message->id}", ['status' => 'answered'])->assertOk()->assertJsonPath('data.status', 'answered');
        $this->patchJson("/api/v1/admin/support-messages/{$message->id}", ['status' => 'lost'])->assertUnprocessable();
        $this->getJson('/api/v1/admin/support-messages?status=answered')->assertOk()->assertJsonPath('data.total', 1);
        $this->deleteJson("/api/v1/admin/support-messages/{$message->id}")->assertOk();
        $this->assertSame(1, SupportMessage::count());
    }
}
