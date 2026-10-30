<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        if (is_string($request->input('email'))) {
            $request->merge(['email' => mb_strtolower(trim($request->input('email')))]);
        }
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:254', 'unique:users,email'],
            'password' => ['required', 'string', 'confirmed', 'max:72', Password::min(8)],
            'device_name' => ['sometimes', 'string', 'max:100'],
        ]);

        $user = User::create([
            'name' => $data['name'],
            'email' => mb_strtolower($data['email']),
            'password' => $data['password'],
        ]);

        return $this->tokenResponse($user, $data['device_name'] ?? '3DEEZI client', 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['sometimes', 'string', 'max:100'],
        ]);
        $user = User::where('email', mb_strtolower($data['email']))->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => ['The email or password is incorrect.']]);
        }

        return $this->tokenResponse($user, $data['device_name'] ?? '3DEEZI client');
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()]);
    }

    /**
     * Edit profile (website account menu, app Profile): the name, and with the current password also the email
     * address and the password. Only these fields; anything else sent (is_admin, …) is ignored. A new password
     * signs the account out everywhere else (its other tokens are removed); this device stays signed in.
     */
    public function update(Request $request): JsonResponse
    {
        $user = $request->user();
        if (is_string($request->input('email'))) {
            $request->merge(['email' => mb_strtolower(trim($request->input('email')))]);
        }
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:100'],
            'email' => ['sometimes', 'required', 'email', 'max:254', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['sometimes', 'required', 'string', 'confirmed', 'max:72', Password::min(8)],
            'current_password' => ['nullable', 'string'],
        ], [
            'email.unique' => 'Another account already uses this email address.',
            'password.confirmed' => 'The new passwords do not match.',
        ]);

        $newEmail = isset($data['email']) && $data['email'] !== $user->email;
        $newPassword = isset($data['password']);
        if ($newEmail || $newPassword) {
            if (! is_string($data['current_password'] ?? null) || $data['current_password'] === '') {
                throw ValidationException::withMessages(['current_password' => ['Enter your current password to change your email address or password.']]);
            }
            if (! Hash::check($data['current_password'], $user->password)) {
                throw ValidationException::withMessages(['current_password' => ['Your current password is not correct.']]);
            }
        }

        $changes = [];
        if (isset($data['name'])) {
            $changes['name'] = trim($data['name']);
        }
        if ($newEmail) {
            $changes['email'] = $data['email'];
        }
        if ($newPassword) {
            $changes['password'] = $data['password'];
        }
        if ($changes) {
            $user->update($changes);
        }
        if ($newPassword) {
            $current = $user->currentAccessToken();
            $keep = $current instanceof PersonalAccessToken ? $current->getKey() : null;
            $user->tokens()->when($keep, fn ($q) => $q->whereKeyNot($keep))->delete();
        }

        return response()->json(['data' => $user->fresh()]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['data' => ['message' => 'Signed out.']]);
    }

    private function tokenResponse(User $user, string $deviceName, int $status = 200): JsonResponse
    {
        $expiresAt = now()->addDays(30);

        return response()->json(['data' => [
            'user' => $user,
            'token' => $user->createToken($deviceName, ['*'], $expiresAt)->plainTextToken,
            'token_type' => 'Bearer',
            'expires_at' => $expiresAt->toIso8601String(),
        ]], $status);
    }
}
