<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Controllers\TeamRequestController;
use App\Models\TeamAllowance;
use App\Models\TeamFile;
use App\Models\TeamRequest;
use App\Models\User;
use App\Services\Pricing\Money;
use App\Services\Team\TeamPlans;
use App\Services\Team\TeamService;
use App\Services\Team\TeamView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Admin > 3DEEZI TEAM and the designer view (team-api.md 4): every request (designers: the ones assigned to them),
 * the board by status, assignment, status, deliveries, the conversation, staff files, and the allowances.
 */
class TeamAdminController extends Controller
{
    public function __construct(private TeamService $team) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['sometimes', 'nullable', Rule::in(array_keys(TeamRequest::STATUSES))],
            'designer_id' => ['sometimes', 'nullable', 'integer'],
            'search' => ['sometimes', 'nullable', 'string', 'max:120'],
            'outstanding' => ['sometimes', 'boolean'],
            'mine' => ['sometimes', 'boolean'],
        ]);
        $user = $request->user();
        $base = TeamRequest::query()->visibleTo($user)->when($request->boolean('mine'), fn ($q) => $q->where('designer_id', $user->id));
        $search = trim((string) ($filters['search'] ?? ''));
        $requests = (clone $base)
            ->when($filters['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($filters['designer_id'] ?? null, fn ($q, $d) => $q->where('designer_id', $d))
            ->when($request->boolean('outstanding'), fn ($q) => $q->whereIn('status', TeamRequest::OPEN))
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q->where('number', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")))
            ->with(['designer:id,name', 'user:id,name,email', 'invoice'])->orderByDesc('id')->limit(300)->get();
        $counts = (clone $base)->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');

        return response()->json([
            'data' => $requests->map(fn (TeamRequest $r) => TeamView::summary($r, true))->values(),
            'counts' => (object) $counts->map(fn ($n) => (int) $n)->all(),
        ]);
    }

    public function board(Request $request): JsonResponse
    {
        $requests = TeamRequest::query()->visibleTo($request->user())
            // "Assigned to me": an admin who is also the designer.
            ->when($request->boolean('mine'), fn ($q) => $q->where('designer_id', $request->user()->id))
            ->where(fn ($q) => $q->where('status', '!=', 'closed')->orWhere('closed_at', '>=', now()->subDays(30))
                // A refund still to make stays on the board.
                ->when(TeamRequest::answersReady(), fn ($q) => $q->orWhere('refund_status', 'due')))
            ->with(['designer:id,name', 'user:id,name,email', 'invoice'])->orderByDesc('status_changed_at')->limit(500)->get()->groupBy('status');
        $columns = [];
        foreach (TeamRequest::STATUSES as $status => [$label]) {
            $columns[] = ['status' => $status, 'label' => $label, 'requests' => ($requests[$status] ?? collect())->map(fn ($r) => TeamView::summary($r, true))->values()];
        }

        return response()->json(['data' => ['columns' => $columns]]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $found = $this->find($request, $id);
        $data = TeamView::detail($found, $request->user(), true);
        $found->forceFill(['staff_read_at' => now()])->saveQuietly();

        return response()->json(['data' => $data]);
    }

    public function assign(Request $request, int $id): JsonResponse
    {
        $this->adminOnly($request);
        $found = $this->find($request, $id);
        $data = $request->validate(['designer_id' => ['present', 'nullable', 'integer', Rule::exists('users', 'id')]]);
        $designer = $data['designer_id'] ? User::find($data['designer_id']) : null;

        return $this->detail($request, $this->team->assign($found, $designer, $request->user()));
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $found = $this->find($request, $id);
        $data = $request->validate([
            'status' => ['required', Rule::in(array_keys(TeamRequest::STATUSES))],
            'note' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'force' => ['sometimes', 'boolean'],
        ]);
        $force = $request->user()->is_admin && $request->boolean('force');

        return $this->detail($request, $this->team->changeStatus($found, $data['status'], $request->user(), filled($data['note'] ?? null) ? trim($data['note']) : null, $force));
    }

    public function deliver(Request $request, int $id): JsonResponse
    {
        $found = $this->find($request, $id);
        $data = $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:10'],
            'files.*' => TeamFile::rules('delivery'),
            'kind' => ['sometimes', Rule::in(TeamFile::DELIVERY_KINDS)],
            'note' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'send' => ['sometimes', 'boolean'],
        ], ['files.required' => 'Choose the artwork or mockups to upload.', 'files.*.max' => 'Files can be up to 30 MB.']);
        $updated = $this->team->deliver($found, (array) $request->file('files'), $data['kind'] ?? 'artwork', $request->user(), filled($data['note'] ?? null) ? trim($data['note']) : null, $request->boolean('send'));

        return $this->detail($request, $updated, 201);
    }

    public function message(Request $request, int $id): JsonResponse
    {
        $found = $this->find($request, $id);
        $data = TeamRequestController::validateMessage($request);
        $message = $this->team->message($found, $request->user(), $data['body'] ?? null, (array) $request->file('files', []), $request->boolean('internal'));

        return response()->json(['data' => TeamView::message($message, $found)], 201);
    }

    /** Staff working files (customer-visible or internal), without a message. */
    public function storeFiles(Request $request, int $id): JsonResponse
    {
        $found = $this->find($request, $id);
        $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:10'],
            'files.*' => TeamFile::rules('reference'),
            'visibility' => ['sometimes', Rule::in(['customer', 'internal'])],
        ]);
        foreach ((array) $request->file('files') as $upload) {
            $file = TeamFile::fromUpload($upload, 'working', $found->id);
            $file->forceFill(['user_id' => $request->user()->id, 'visibility' => $request->input('visibility', 'internal')]);
            $found->files()->save($file);
        }
        $found->log('note', ['user_id' => $request->user()->id, 'role' => $this->team->role($request->user(), $found), 'visibility' => 'internal', 'body' => 'Files added.']);

        return $this->detail($request, $found->refresh(), 201);
    }

    public function destroyFile(Request $request, int $id, int $file): JsonResponse
    {
        $found = $this->find($request, $id);
        $target = $found->files()->findOrFail($file);
        abort_unless($request->user()->is_admin || ($target->user_id === $request->user()->id && $found->status !== 'approved'), 403, 'Only an administrator can remove this file.');
        abort_if($found->status === 'approved' && $target->version === $found->final_version && in_array($target->kind, TeamFile::DELIVERY_KINDS, true), 409, 'This file is part of the approved design.');
        $name = $target->name;
        $target->delete();
        $found->log('note', ['user_id' => $request->user()->id, 'role' => $this->team->role($request->user(), $found), 'visibility' => 'internal', 'body' => "File removed: {$name}"]);

        return $this->detail($request, $found->refresh());
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->adminOnly($request);
        $found = $this->find($request, $id);
        $data = $request->validate([
            'due_date' => ['sometimes', 'nullable', 'date'],
            'revisions_allowed' => ['sometimes', 'integer', 'min:0', 'max:50'],
            'priority' => ['sometimes', Rule::in(['normal', 'high'])],
        ]);
        $found->fill($data)->save();
        $found->log('note', ['user_id' => $request->user()->id, 'role' => 'admin', 'visibility' => 'internal', 'body' => 'Details changed: '.implode(', ', array_keys($data)).'.']);

        return $this->detail($request, $found->refresh());
    }

    /** (A) A free revision: starts a waiting extra revision (its invoice cancelled) or adds one more. */
    public function freeRevision(Request $request, int $id): JsonResponse
    {
        $this->adminOnly($request);

        return $this->detail($request, $this->team->freeRevision($this->find($request, $id), $request->user()));
    }

    /** (A) The refund mark: due, refunded (after refunding by hand in Airwallex or Stripe) or none. */
    public function refund(Request $request, int $id): JsonResponse
    {
        $this->adminOnly($request);
        $data = $request->validate(['refund_status' => ['present', 'nullable', Rule::in(['due', 'refunded'])]]);

        return $this->detail($request, $this->team->setRefund($this->find($request, $id), $data['refund_status'], $request->user()));
    }

    public function designers(Request $request): JsonResponse
    {
        $me = $request->user()->id;
        $people = User::query()->where(fn ($q) => $q->where('is_designer', true)->orWhere('is_admin', true))->orderBy('name')->get(['id', 'name', 'email', 'is_admin', 'is_designer', 'designer_all']);
        $open = TeamRequest::query()->whereIn('status', TeamRequest::OPEN)->whereNotNull('designer_id')->selectRaw('designer_id, count(*) as n')->groupBy('designer_id')->pluck('n', 'designer_id');

        return response()->json(['data' => $people->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'is_admin' => (bool) $u->is_admin,
            'is_designer' => (bool) $u->is_designer, 'designer_all' => (bool) $u->designer_all, 'open' => (int) ($open[$u->id] ?? 0), 'is_me' => $u->id === $me])->values()]);
    }

    // ---------------------------------------------------------------- allowances (admins)

    public function allowances(Request $request): JsonResponse
    {
        $this->adminOnly($request);
        $config = TeamPlans::config();

        return response()->json(['data' => [
            'plans' => array_map(fn ($id) => TeamPlans::presentPlan($id), array_combine(TeamPlans::IDS, TeamPlans::IDS)),
            'pay_first' => (bool) $config['pay_first'],
            'default_designer_id' => TeamPlans::defaultDesigner()?->id,
            'extra_revision_price' => Money::decimal((int) $config['extra_revision_cents']),
            'first_draft_days' => (int) $config['first_draft_days'],
            'revision_days' => (int) $config['revision_days'],
            'tax_included' => true,
            'customers' => TeamAllowance::query()->with('user:id,name,email')->orderByDesc('updated_at')->limit(200)->get()
                ->filter(fn (TeamAllowance $a) => $a->user)->map(fn (TeamAllowance $a) => $this->allowanceRow($a->user, $a))->values(),
        ]]);
    }

    public function updatePlans(Request $request): JsonResponse
    {
        $this->adminOnly($request);
        $rules = ['plans' => ['sometimes', 'array'], 'pay_first' => ['sometimes', 'boolean'],
            // Any admin or designer, or none (null).
            'default_designer_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')],
            'extra_revision_price' => ['sometimes', 'numeric', 'min:0', 'max:100000'],
            'first_draft_days' => ['sometimes', 'integer', 'min:0', 'max:60'],
            'revision_days' => ['sometimes', 'integer', 'min:0', 'max:60']];
        foreach (TeamPlans::IDS as $id) {
            $rules["plans.$id"] = ['sometimes', 'array'];
            $rules["plans.$id.name"] = ['sometimes', 'string', 'max:60'];
            $rules["plans.$id.included_per_month"] = ['sometimes', 'integer', 'min:0', 'max:1000'];
            $rules["plans.$id.price"] = ['sometimes', 'numeric', 'min:0', 'max:100000'];
            $rules["plans.$id.revisions"] = ['sometimes', 'integer', 'min:0', 'max:50'];
            $rules["plans.$id.max_open"] = ['sometimes', 'integer', 'min:1', 'max:1000'];
        }
        $data = $request->validate($rules);
        $plans = [];
        foreach ($data['plans'] ?? [] as $id => $plan) {
            if (array_key_exists('price', $plan)) {
                $plan['price_cents'] = (int) Money::toCents((string) $plan['price']);
            }
            unset($plan['price']);
            $plans[$id] = $plan;
        }
        $options = array_intersect_key($data, array_flip(['pay_first', 'default_designer_id', 'first_draft_days', 'revision_days']));
        if (array_key_exists('default_designer_id', $options)) {
            $options['default_designer_id'] = $options['default_designer_id'] ? (int) $options['default_designer_id'] : null;
            $chosen = $options['default_designer_id'] ? User::find($options['default_designer_id']) : null;
            abort_if($chosen && ! $chosen->is_admin && ! $chosen->is_designer, 422, 'Choose an administrator or a designer (mark the account as a designer in Admin > Users).');
        }
        if (array_key_exists('extra_revision_price', $data)) {
            $options['extra_revision_cents'] = (int) Money::toCents((string) $data['extra_revision_price']);
        }
        TeamPlans::save($plans, $options);

        return $this->allowances($request);
    }

    public function allowanceUsers(Request $request): JsonResponse
    {
        $this->adminOnly($request);
        $search = trim((string) $request->query('search', ''));
        $users = User::query()->when($search !== '', fn ($q) => $q->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")))
            ->orderBy('name')->limit(30)->get();
        $allowances = TeamAllowance::query()->whereIn('user_id', $users->pluck('id'))->get()->keyBy('user_id');

        return response()->json(['data' => $users->map(fn (User $u) => $this->allowanceRow($u, $allowances[$u->id] ?? null))->values()]);
    }

    public function updateAllowance(Request $request, User $user): JsonResponse
    {
        $this->adminOnly($request);
        $data = $request->validate([
            'plan' => ['sometimes', Rule::in(TeamPlans::IDS)],
            'monthly_included' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000'],
            'bonus_requests' => ['sometimes', 'integer', 'min:0', 'max:1000'],
            'unlimited' => ['sometimes', 'boolean'],
            'note' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);
        $allowance = TeamAllowance::query()->firstOrNew(['user_id' => $user->id], ['plan' => 'free']);
        $allowance->fill(array_diff_key($data, ['unlimited' => 1]));
        if (array_key_exists('unlimited', $data)) {
            // Unlimited only ever by an administrator's decision, with who made it kept.
            $allowance->unlimited = (bool) $data['unlimited'];
            $allowance->unlimited_by = $data['unlimited'] ? $request->user()->id : null;
        }
        $allowance->save();

        return response()->json(['data' => $this->allowanceRow($user, $allowance)]);
    }

    private function allowanceRow(User $user, ?TeamAllowance $a): array
    {
        $status = TeamPlans::status($user);

        return ['user' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email], 'plan' => $a?->plan ?? 'free',
            'monthly_included' => $a?->monthly_included, 'bonus_requests' => (int) ($a?->bonus_requests ?? 0), 'unlimited' => (bool) ($a?->unlimited ?? false),
            'note' => $a?->note, 'used_this_month' => $status['used_this_month'], 'included_per_month' => $status['included_per_month'],
            'open_requests' => $status['open_requests'], 'next_billing' => $status['next_request']['billing']];
    }

    // ---------------------------------------------------------------- helpers

    private function find(Request $request, int $id): TeamRequest
    {
        return TeamRequest::query()->visibleTo($request->user())->findOrFail($id);
    }

    private function detail(Request $request, TeamRequest $r, int $code = 200): JsonResponse
    {
        return response()->json(['data' => TeamView::detail($r->fresh(), $request->user(), true)], $code);
    }

    private function adminOnly(Request $request): void
    {
        abort_unless($request->user()->is_admin, 403, 'Only an administrator can do this.');
    }
}
