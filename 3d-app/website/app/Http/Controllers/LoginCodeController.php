<?php

namespace App\Http\Controllers;

use App\Mail\LoginCode;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * "Forgot password?" on the sign-in window (website and app): a 6-digit code sent by email, then either
 * "Sign in with the code" or "Set a new password". Only a hash of the code is kept (password_reset_tokens), it works
 * for 15 minutes, a new code replaces the old one, and 5 wrong codes use it up. Every answer is the same whether or
 * not an account uses the email, so nobody can find out which addresses have accounts.
 */
class LoginCodeController extends Controller
{
    public const MINUTES = 15;

    public const MAX_TRIES = 5;

    private const SENT = 'If an account uses this email address, we have sent it a 6-digit code. It works for 15 minutes.';

    private const WRONG = 'That code is not correct or has expired. Check the email, or ask for a new code.';

    private const USED_UP = 'Too many wrong codes. Ask for a new code.';

    public function send(Request $request): JsonResponse
    {
        $email = $this->email($request);
        $key = sha1($email);

        // One code a minute and five an hour for each address; twenty an hour from one connection.
        foreach ([
            ['login-code-minute:'.$key, 1, 60, 'We have just sent a code. You can ask for another in :seconds seconds.'],
            ['login-code-hour:'.$key, 5, 3600, 'Too many codes for this email address. Try again in :minutes minutes.'],
            ['login-code-ip:'.$request->ip(), 20, 3600, 'Too many codes asked for. Try again in :minutes minutes.'],
        ] as [$limit, $max, $decay, $message]) {
            if (RateLimiter::tooManyAttempts($limit, $max)) {
                $wait = RateLimiter::availableIn($limit);
                throw ValidationException::withMessages(['email' => [strtr($message, [
                    ':seconds' => (string) max(1, $wait),
                    ':minutes' => (string) max(1, (int) ceil($wait / 60)),
                ])]])->status(429);
            }
        }
        foreach ([['login-code-minute:'.$key, 60], ['login-code-hour:'.$key, 3600], ['login-code-ip:'.$request->ip(), 3600]] as [$limit, $decay]) {
            RateLimiter::hit($limit, $decay);
        }

        // A new code starts a new count of wrong tries (for every address, so the answers stay the same).
        RateLimiter::clear('login-code-tries:'.$key);
        $code = str_pad((string) random_int(0, 999_999), 6, '0', STR_PAD_LEFT);
        $hash = Hash::make($code);

        $user = User::where('email', $email)->first();
        if ($user) {
            DB::table('password_reset_tokens')->updateOrInsert(['email' => $email], ['token' => $hash, 'created_at' => now()]);
            try {
                Mail::to($user->email)->queue(new LoginCode($code, $user->name));
            } catch (Throwable $e) {
                Log::warning('Sign-in code email failed: '.$e->getMessage(), ['user' => $user->id]);
            }
        }

        return response()->json(['data' => ['message' => self::SENT, 'minutes' => self::MINUTES]]);
    }

    /** "Sign in with the code": signs in at once; the code is then used up. */
    public function login(Request $request): JsonResponse
    {
        $request->validate(['device_name' => ['sometimes', 'string', 'max:100']]);
        $user = $this->check($request);
        if (! $user->email_verified_at) {
            $user->forceFill(['email_verified_at' => now()])->save();
        }

        return $this->signedIn($user, $request);
    }

    /** "Set a new password": saves it, signs out every other device, and signs in here. */
    public function reset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'password' => ['required', 'string', 'confirmed', 'max:72', Password::min(8)],
            'device_name' => ['sometimes', 'string', 'max:100'],
        ], ['password.confirmed' => 'The new passwords do not match.']);
        $user = $this->check($request);
        $user->password = $data['password'];
        if (! $user->email_verified_at) {
            $user->email_verified_at = now();
        }
        $user->save();
        $user->tokens()->delete();

        return $this->signedIn($user, $request);
    }

    /** The account whose latest code this is, or a validation error. A correct code is used up. */
    private function check(Request $request): User
    {
        $email = $this->email($request);
        $request->validate(['code' => ['required', 'string']], ['code.required' => 'Enter the 6-digit code from the email.']);
        $code = preg_replace('/\D/', '', (string) $request->input('code'));
        $tries = 'login-code-tries:'.sha1($email);

        if (RateLimiter::tooManyAttempts($tries, self::MAX_TRIES)) {
            DB::table('password_reset_tokens')->where('email', $email)->delete();
            throw ValidationException::withMessages(['code' => [self::USED_UP]]);
        }

        $row = DB::table('password_reset_tokens')->where('email', $email)->first();
        $fresh = $row && $row->created_at && Carbon::parse($row->created_at)->addMinutes(self::MINUTES)->isFuture();
        $user = $fresh && strlen($code) === 6 && Hash::check($code, $row->token)
            ? User::where('email', $email)->first()
            : null;

        if (! $user) {
            RateLimiter::hit($tries, self::MINUTES * 60);
            if (RateLimiter::tooManyAttempts($tries, self::MAX_TRIES)) {
                DB::table('password_reset_tokens')->where('email', $email)->delete();
                throw ValidationException::withMessages(['code' => [self::USED_UP]]);
            }
            throw ValidationException::withMessages(['code' => [self::WRONG]]);
        }

        DB::table('password_reset_tokens')->where('email', $email)->delete();
        RateLimiter::clear($tries);

        return $user;
    }

    private function email(Request $request): string
    {
        if (is_string($request->input('email'))) {
            $request->merge(['email' => mb_strtolower(trim($request->input('email')))]);
        }
        $request->validate(['email' => ['required', 'email', 'max:254']]);

        return $request->input('email');
    }

    /** The same answer as signing in with a password (AuthController). */
    private function signedIn(User $user, Request $request): JsonResponse
    {
        $expiresAt = now()->addDays(30);

        return response()->json(['data' => [
            'user' => $user->fresh(),
            'token' => $user->createToken((string) $request->input('device_name', '3DEEZI client'), ['*'], $expiresAt)->plainTextToken,
            'token_type' => 'Bearer',
            'expires_at' => $expiresAt->toIso8601String(),
        ]]);
    }
}
