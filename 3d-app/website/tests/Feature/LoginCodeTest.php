<?php

namespace Tests\Feature;

use App\Mail\LoginCode;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/** "Forgot password?" on the sign-in window: a 6-digit code by email, then sign in with it or set a new password. */
class LoginCodeTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        return User::factory()->create(['name' => 'Sam Taylor', 'email' => 'sam@club.com', 'password' => 'old-password-1']);
    }

    /** Asks for a code and returns the one emailed. */
    private function sendCode(string $email = 'sam@club.com'): string
    {
        $this->travel(61)->seconds(); // one code a minute
        $this->postJson('/api/v1/auth/code', ['email' => $email])->assertOk();
        $code = null;
        Mail::assertQueued(LoginCode::class, function (LoginCode $mail) use (&$code) {
            $code = $mail->code;

            return true;
        });

        return $code;
    }

    public function test_sending_a_code_emails_a_hashed_six_digit_code(): void
    {
        Mail::fake();
        $this->user();
        $reply = $this->postJson('/api/v1/auth/code', ['email' => '  SAM@Club.com '])->assertOk()->json('data');
        $this->assertStringContainsString('6-digit code', $reply['message']);
        $this->assertSame(15, $reply['minutes']);

        Mail::assertQueued(LoginCode::class, fn (LoginCode $mail) => $mail->hasTo('sam@club.com') && preg_match('/^\d{6}$/', $mail->code) === 1);
        $row = DB::table('password_reset_tokens')->where('email', 'sam@club.com')->first();
        $this->assertNotNull($row);
        $mail = Mail::queued(LoginCode::class)->first();
        $this->assertNotSame($mail->code, $row->token);
        $this->assertTrue(Hash::check($mail->code, $row->token));

        // The email: branded, short, the code and how long it works.
        $html = $mail->render();
        $this->assertStringContainsString('DEEZI', $html);
        $this->assertStringContainsString($mail->code, $html);
        $this->assertStringContainsString('15 minutes', $html);
        $this->assertStringContainsString('Hi Sam,', $html);
    }

    public function test_an_unknown_email_gets_the_same_answer_and_no_email(): void
    {
        Mail::fake();
        $this->user();
        $known = $this->postJson('/api/v1/auth/code', ['email' => 'sam@club.com'])->assertOk()->json();
        $unknown = $this->postJson('/api/v1/auth/code', ['email' => 'nobody@club.com'])->assertOk()->json();
        $this->assertSame($known, $unknown);
        Mail::assertQueuedCount(1);
        $this->assertNull(DB::table('password_reset_tokens')->where('email', 'nobody@club.com')->first());

        // Trying codes for it: the same answers as a wrong code for a real account.
        $wrongKnown = $this->postJson('/api/v1/auth/code/login', ['email' => 'sam@club.com', 'code' => '000000'])->assertUnprocessable()->json();
        $wrongUnknown = $this->postJson('/api/v1/auth/code/login', ['email' => 'nobody@club.com', 'code' => '000000'])->assertUnprocessable()->json();
        $this->assertSame($wrongKnown, $wrongUnknown);
        $this->postJson('/api/v1/auth/code/reset', ['email' => 'nobody@club.com', 'code' => '123456', 'password' => 'new-password-2', 'password_confirmation' => 'new-password-2'])
            ->assertUnprocessable()->assertJsonValidationErrors('code');
        $this->assertDatabaseMissing('users', ['email' => 'nobody@club.com']);
    }

    public function test_sign_in_with_the_code(): void
    {
        Mail::fake();
        $user = $this->user();
        $code = $this->sendCode();

        $data = $this->postJson('/api/v1/auth/code/login', ['email' => 'Sam@club.com', 'code' => $code, 'device_name' => 'test'])->assertOk()->json('data');
        $this->assertSame($user->id, $data['user']['id']);
        $this->assertArrayNotHasKey('password', $data['user']);
        $this->withToken($data['token'])->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.email', 'sam@club.com');

        // The password is unchanged, and the code is used up.
        $this->assertTrue(Hash::check('old-password-1', $user->fresh()->password));
        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->postJson('/api/v1/auth/code/login', ['email' => 'sam@club.com', 'code' => $code])->assertUnprocessable()->assertJsonValidationErrors('code');
    }

    public function test_set_a_new_password_with_the_code(): void
    {
        Mail::fake();
        $user = $this->user();
        $user->createToken('old phone');
        $code = $this->sendCode();

        $this->postJson('/api/v1/auth/code/reset', ['email' => 'sam@club.com', 'code' => $code, 'password' => 'short', 'password_confirmation' => 'short'])
            ->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->postJson('/api/v1/auth/code/reset', ['email' => 'sam@club.com', 'code' => $code, 'password' => 'new-password-2', 'password_confirmation' => 'other-password'])
            ->assertUnprocessable()->assertJsonPath('errors.password.0', 'The new passwords do not match.');

        $data = $this->postJson('/api/v1/auth/code/reset', ['email' => 'sam@club.com', 'code' => " $code ", 'password' => 'new-password-2', 'password_confirmation' => 'new-password-2'])
            ->assertOk()->json('data');
        $this->assertNotEmpty($data['token']);
        $this->assertTrue(Hash::check('new-password-2', $user->fresh()->password));
        // Other devices are signed out; this one is signed in.
        $this->assertSame(1, $user->tokens()->count());

        $this->travel(61)->seconds(); // the sign-in limit is 5 a minute
        $this->postJson('/api/v1/auth/login', ['email' => 'sam@club.com', 'password' => 'old-password-1'])->assertUnprocessable();
        $this->postJson('/api/v1/auth/login', ['email' => 'sam@club.com', 'password' => 'new-password-2'])->assertOk();
        // The code is used up.
        $this->postJson('/api/v1/auth/code/login', ['email' => 'sam@club.com', 'code' => $code])->assertUnprocessable();
    }

    public function test_a_wrong_code_is_refused_and_only_the_newest_code_works(): void
    {
        Mail::fake();
        $this->user();
        $first = $this->sendCode();
        $this->postJson('/api/v1/auth/code/login', ['email' => 'sam@club.com', 'code' => $first === '111111' ? '222222' : '111111'])
            ->assertUnprocessable()->assertJsonPath('errors.code.0', 'That code is not correct or has expired. Check the email, or ask for a new code.');
        $this->postJson('/api/v1/auth/code/login', ['email' => 'sam@club.com', 'code' => ''])->assertUnprocessable()->assertJsonValidationErrors('code');

        Mail::fake();
        $second = $this->sendCode();
        if ($first !== $second) {
            $this->postJson('/api/v1/auth/code/login', ['email' => 'sam@club.com', 'code' => $first])->assertUnprocessable();
        }
        $this->postJson('/api/v1/auth/code/login', ['email' => 'sam@club.com', 'code' => $second])->assertOk();
    }

    public function test_an_expired_code_is_refused(): void
    {
        Mail::fake();
        $this->user();
        $code = $this->sendCode();
        $this->travel(16)->minutes();
        $this->postJson('/api/v1/auth/code/login', ['email' => 'sam@club.com', 'code' => $code])
            ->assertUnprocessable()->assertJsonPath('errors.code.0', 'That code is not correct or has expired. Check the email, or ask for a new code.');
    }

    public function test_five_wrong_codes_use_the_code_up(): void
    {
        Mail::fake();
        $this->user();
        $code = $this->sendCode();
        $wrong = $code === '000000' ? '999999' : '000000';
        for ($i = 1; $i <= 4; $i++) {
            $this->travel(13)->seconds(); // the sign-in limit is 5 a minute
            $this->postJson('/api/v1/auth/code/login', ['email' => 'sam@club.com', 'code' => $wrong])->assertUnprocessable()->assertJsonPath('errors.code.0', 'That code is not correct or has expired. Check the email, or ask for a new code.');
        }
        $this->travel(13)->seconds();
        $this->postJson('/api/v1/auth/code/login', ['email' => 'sam@club.com', 'code' => $wrong])->assertJsonPath('errors.code.0', 'Too many wrong codes. Ask for a new code.');
        // Now even the right code needs a new one.
        $this->travel(13)->seconds();
        $this->postJson('/api/v1/auth/code/login', ['email' => 'sam@club.com', 'code' => $code])->assertUnprocessable()->assertJsonPath('errors.code.0', 'Too many wrong codes. Ask for a new code.');
        $this->assertNull(DB::table('password_reset_tokens')->where('email', 'sam@club.com')->first());

        // A new code works again.
        Mail::fake();
        $next = $this->sendCode();
        $this->postJson('/api/v1/auth/code/login', ['email' => 'sam@club.com', 'code' => $next])->assertOk();
    }

    public function test_sending_is_limited_to_one_a_minute_and_five_an_hour(): void
    {
        Mail::fake();
        $this->user();
        $this->postJson('/api/v1/auth/code', ['email' => 'sam@club.com'])->assertOk();
        $this->postJson('/api/v1/auth/code', ['email' => 'sam@club.com'])->assertStatus(429)->assertJsonValidationErrors('email');
        // The same for an address without an account.
        $this->postJson('/api/v1/auth/code', ['email' => 'nobody@club.com'])->assertOk();
        $this->postJson('/api/v1/auth/code', ['email' => 'nobody@club.com'])->assertStatus(429);
        Mail::assertQueuedCount(1);

        for ($i = 2; $i <= 5; $i++) {
            $this->travel(61)->seconds();
            $this->postJson('/api/v1/auth/code', ['email' => 'sam@club.com'])->assertOk();
        }
        $this->travel(61)->seconds();
        $this->postJson('/api/v1/auth/code', ['email' => 'sam@club.com'])->assertStatus(429)
            ->assertJsonPath('errors.email.0', fn (string $m) => str_starts_with($m, 'Too many codes for this email address.'));
        Mail::assertQueuedCount(5);
        $this->postJson('/api/v1/auth/code', ['email' => 'not-an-email'])->assertUnprocessable()->assertJsonValidationErrors('email');
        RateLimiter::clear('login-code-hour:'.sha1('sam@club.com'));
    }
}
