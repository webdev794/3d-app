<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\OrderDraft;
use App\Models\OrderFile;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/** Admin: list, add, edit and delete user accounts. */
class UserController extends Controller
{
    /** The demo customers kept by "Remove test accounts" even without an order (user 2026-10-23, cleanup-users-1023.php). */
    private const DEMO_CUSTOMERS = ['sample-club@example.test', 'pay.tester.1792490307989@example.com', 'form.tester.1792490361646@example.com'];

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
        // 3DEEZI TEAM designers (see only the requests assigned to them, or all with designer_all).
        $user->is_designer = (bool) ($data['is_designer'] ?? false);
        $user->designer_all = (bool) ($data['designer_all'] ?? false);
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
        foreach (['is_designer', 'designer_all'] as $flag) {
            if (array_key_exists($flag, $data)) {
                $user->{$flag} = (bool) $data[$flag];
            }
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

    /** Admin › Users › "Remove test accounts", step 1: the test accounts it would remove and how many accounts stay. */
    public function testAccounts(Request $request): JsonResponse
    {
        $remove = $this->testAccountQuery($request)->select(['id', 'name', 'email'])->withCount('projects')->orderBy('id')->get();

        return response()->json(['data' => [
            'remove' => $remove->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'projects_count' => (int) $u->projects_count])->values(),
            'remove_count' => $remove->count(),
            'keep_count' => User::count() - $remove->count(),
        ]]);
    }

    /**
     * Step 2 (confirm: true): removes them in one transaction (with `ids`, only those of them the admin was shown), each
     * the way destroy() removes one user: sign-in tokens first, then the user, whose projects, uploads, Artboard designs
     * and order drafts go by the database's cascades. Their notifications, sessions and unsent order drafts' files go too;
     * once that is final, their uploaded files (storage/app/private/assets/<id>).
     */
    public function removeTestAccounts(Request $request): JsonResponse
    {
        $data = $request->validate([
            'confirm' => ['accepted'],
            'ids' => ['sometimes', 'array', 'max:1000'],
            'ids.*' => ['integer'],
        ]);
        $sessions = Schema::hasTable('sessions');
        $notifications = Schema::hasTable('notifications');
        [$counts, $ids, $files] = DB::transaction(function () use ($request, $data, $sessions, $notifications) {
            $users = $this->testAccountQuery($request)
                ->when(array_key_exists('ids', $data), fn (Builder $q) => $q->whereKey($data['ids']))
                ->withCount(['projects', 'assets', 'artboardDocuments'])->get();
            $ids = $users->modelKeys();
            $counts = ['projects' => (int) $users->sum('projects_count'), 'assets' => (int) $users->sum('assets_count'),
                'artboard_documents' => (int) $users->sum('artboard_documents_count'), 'tokens' => 0, 'notifications' => 0, 'sessions' => 0];
            // A draft's files are its own copies; the cascade would only unlink them from the draft.
            $draftFiles = OrderFile::whereNull('order_id')->whereIn('order_draft_id', OrderDraft::whereIn('user_id', $ids)->select('id'))->get(['id', 'path']);
            OrderFile::whereKey($draftFiles->modelKeys())->delete();
            foreach ($users as $user) {
                $counts['tokens'] += $user->tokens()->delete();
                $counts['notifications'] += $notifications ? $user->notifications()->delete() : 0;
                $counts['sessions'] += $sessions ? DB::table('sessions')->where('user_id', $user->id)->delete() : 0;
                $user->delete();
            }

            return [$counts, $ids, $draftFiles->pluck('path')->filter()->all()];
        });
        $disk = Storage::disk('local');
        $folders = 0;
        foreach ($ids as $id) {
            if ($disk->directoryExists("assets/{$id}")) {
                $folders += (int) $disk->deleteDirectory("assets/{$id}");
            }
        }
        if ($files) {
            $disk->delete($files);
        }
        $removed = count($ids);
        $kept = User::count();
        Log::info('Admin removed test accounts.', ['admin_id' => $request->user()->id, 'removed' => $removed, 'kept' => $kept]);
        $plural = fn (int $n, string $word) => $n.' '.$word.($n === 1 ? '' : 's');

        return response()->json(['data' => $counts + [
            'removed' => $removed,
            'kept' => $kept,
            'asset_folders' => $folders,
            'draft_files' => count($files),
            'message' => 'Removed '.$plural($removed, 'test account').'. '.$plural($kept, 'account').' kept.',
        ]]);
    }

    /**
     * The test accounts: not an admin, an @example.test or @example.com email, no order, no 3DEEZI TEAM request, not one
     * of the demo customers and not the signed-in admin. Every admin and every real email address always stays.
     */
    private function testAccountQuery(Request $request): Builder
    {
        return User::query()
            ->where('is_admin', false)
            ->where(fn (Builder $q) => $q->whereRaw('lower(email) like ?', ['%@example.test'])->orWhereRaw('lower(email) like ?', ['%@example.com']))
            ->whereNotIn(DB::raw('lower(email)'), self::DEMO_CUSTOMERS)
            ->whereDoesntHave('orders')
            ->whereDoesntHave('teamRequests')
            ->whereKeyNot($request->user()->getKey());
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
            'is_designer' => ['sometimes', 'boolean'],
            'designer_all' => ['sometimes', 'boolean'],
        ]);
    }
}
