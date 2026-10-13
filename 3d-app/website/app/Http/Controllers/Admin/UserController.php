<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/** Admin: list, add, edit and delete user accounts. */
class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $users = User::query()
            ->withCount(['projects', 'orders'])
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")))
            ->latest()
            ->paginate(min(100, max(5, (int) $request->query('per_page', 20))));

        return response()->json(['data' => $users]);
    }

    public function show(User $user): JsonResponse
    {
        return response()->json(['data' => $user->loadCount(['projects', 'orders'])->load('projects:id,user_id,name,sport,garment,updated_at')]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $user = new User(['name' => $data['name'], 'email' => $data['email'], 'password' => $data['password']]);
        $user->is_admin = (bool) ($data['is_admin'] ?? false);
        $user->save();

        return response()->json(['data' => $user->loadCount(['projects', 'orders'])], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $this->validated($request, $user);
        if ($user->is($request->user()) && array_key_exists('is_admin', $data) && ! $data['is_admin']) {
            abort(422, 'You cannot remove your own administrator access.');
        }
        foreach (['name', 'email', 'password'] as $field) {
            if (filled($data[$field] ?? null)) {
                $user->{$field} = $data[$field];
            }
        }
        if (array_key_exists('is_admin', $data)) {
            $user->is_admin = (bool) $data['is_admin'];
        }
        $user->save();

        return response()->json(['data' => $user->loadCount(['projects', 'orders'])]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        abort_if($user->is($request->user()), 422, 'You cannot delete your own account here.');
        $user->tokens()->delete();
        $user->delete();

        return response()->json(['data' => ['message' => 'User deleted.']]);
    }

    private function validated(Request $request, ?User $user = null): array
    {
        if (is_string($request->input('email'))) {
            $request->merge(['email' => mb_strtolower(trim($request->input('email')))]);
        }
        $required = $user ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$required, 'string', 'max:100'],
            'email' => [$required, 'email', 'max:254', Rule::unique('users', 'email')->ignore($user?->id)],
            'password' => [$user ? 'nullable' : 'required', 'string', 'max:72', Password::min(8)],
            'is_admin' => ['sometimes', 'boolean'],
        ]);
    }
}
