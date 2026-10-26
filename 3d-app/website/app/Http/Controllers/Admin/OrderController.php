<?php

namespace App\Http\Controllers\Admin;

use App\Events\OrderSubmitted;
use App\Http\Controllers\Controller;
use App\Http\Requests\OrderRequest;
use App\Models\Order;
use App\Support\OrderGate;
use App\Support\OrderView;
use App\Models\PartnerApplication;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Admin: every customer's orders, plus the overview numbers. */
class OrderController extends Controller
{
    // The kit's picture (its saved 3D preview), status and version show in the orders list.
    private const WITH = ['user:id,name,email', 'project:id,name,sport,garment,status,version,thumbnail'];

    public function index(Request $request): JsonResponse
    {
        $request->validate(['status' => ['sometimes', 'nullable', Rule::in(Order::STATUSES)]]);
        $search = trim((string) $request->query('search', ''));
        $orders = Order::query()
            ->withoutKit()
            ->with(self::WITH)
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status))
            ->when($request->query('user_id'), fn ($q, $id) => $q->where('user_id', $id))
            // Made by (preferred suppliers): a supplier's id, or 3deezi (with the orders placed before the choice existed).
            ->when($request->query('supplier'), fn ($q, $supplier) => \App\Models\Supplier::filter($q, $supplier))
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q
                ->where('number', 'like', "%{$search}%")
                ->orWhere('contact_name', 'like', "%{$search}%")
                ->orWhere('team_name', 'like', "%{$search}%")
                ->orWhereHas('user', fn ($u) => $u->where('email', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%"))))
            ->latest()
            ->paginate(min(100, max(5, (int) $request->query('per_page', 20))));
        // The Total column: each order's invoice at a glance (total, paid, status), not the whole invoice.
        if (OrderView::hasInvoices()) {
            $orders->getCollection()->load('invoice')->each(function (Order $order) {
                $order->setAttribute('payment', OrderView::payment($order));
                $order->unsetRelation('invoice');
            });
        }

        return response()->json(['data' => $orders]);
    }

    /**
     * One order with its whole kit (design, preview, AI brief) for the admin kit viewer, and the kit as it was
     * ordered (design_snapshot, project_version).
     */
    public function show(Order $order): JsonResponse
    {
        // The board's view of it too: stage, sub-status, garments, files (also internal) and the whole history.
        $order->load(['user:id,name,email', 'project'])->makeVisible('design_snapshot');

        // The saved designs on the order form's rows (with their design), for the kit page's per-garment list.
        $itemIds = collect($order->items ?? [])->pluck('project_id')->filter()->unique()->values();
        $itemProjects = $itemIds->isEmpty() ? [] : Project::whereIn('id', $itemIds)->where('user_id', $order->user_id)
            ->get(['id', 'name', 'sport', 'garment', 'mode', 'status', 'version', 'thumbnail', 'design', 'updated_at'])->toArray();

        return response()->json(['data' => array_merge(OrderView::detail($order, true), [
            'project' => $order->project?->toArray(),
            'user' => $order->user?->only(['id', 'name', 'email']),
            'item_projects' => $itemProjects,
        ])]);
    }

    public function store(OrderRequest $request): JsonResponse
    {
        $data = Arr::except($request->validated(), ['design_final', 'confirm_without_approval', 'confirm_unpaid', 'override_reason']);
        $this->checkProject($data);
        $order = new Order($data);
        $order->source = 'admin';
        \App\Models\Supplier::assign($order, $data['supplier_id'] ?? null, true);
        if (! empty($data['project_id'])) {
            $order->keepKit(Project::find($data['project_id']));
        }
        $order->save();
        OrderSubmitted::dispatch($order);

        return response()->json(['data' => $order->refresh()->load(self::WITH)], 201);
    }

    public function update(OrderRequest $request, Order $order): JsonResponse
    {
        $data = Arr::except($request->validated(), ['design_final', 'confirm_without_approval', 'confirm_unpaid', 'override_reason']);
        $this->checkProject($data + ['user_id' => $order->user_id]);
        $approval = array_key_exists('approval', $data) && $data['approval'] !== $order->approval ? $data['approval'] : null;
        $order->fill($data);
        // Made by: staff may pass the order to any supplier.
        if (array_key_exists('supplier_id', $data)) {
            \App\Models\Supplier::assign($order, $data['supplier_id'], true);
        }
        // Another kit on the order: keep that one as it is now.
        if ($order->isDirty('project_id')) {
            $order->keepKit($order->project_id ? Project::find($order->project_id) : null);
        }
        // Into Production without the customer's approval or full payment: staff confirm it first (see OrderGate).
        $order->activity = OrderGate::check($order, $request->boolean('confirm_without_approval'), $request->boolean('confirm_unpaid'), $request->input('override_reason'));
        $order->save();
        if ($approval) {
            $order->record('approval', ['approval' => $approval]);
        }

        return response()->json(['data' => $order->refresh()->load(self::WITH)]);
    }

    public function destroy(Order $order): JsonResponse
    {
        $order->delete();

        return response()->json(['data' => ['message' => 'Order deleted.']]);
    }

    public function stats(): JsonResponse
    {
        // Kits created and orders placed per day, last 30 days (zero-filled).
        $since = now()->subDays(29)->startOfDay();
        $daily = fn (string $model) => $model::where('created_at', '>=', $since)
            ->selectRaw('date(created_at) as day, count(*) as n')->groupBy('day')->pluck('n', 'day');
        [$kits, $orders] = [$daily(Project::class), $daily(Order::class)];
        $trend = collect(range(0, 29))->map(function ($i) use ($since, $kits, $orders) {
            $day = $since->copy()->addDays($i)->toDateString();

            return ['day' => $day, 'kits' => (int) ($kits[$day] ?? 0), 'orders' => (int) ($orders[$day] ?? 0)];
        });
        PartnerApplication::ensureTable();
        $names = collect(config('catalog.sports'))->pluck('name', 'id');
        $sports = Project::selectRaw('sport, count(*) as n')->groupBy('sport')->orderByDesc('n')->pluck('n', 'sport')
            ->map(fn ($n, $id) => ['sport' => $names[$id] ?? $id, 'count' => (int) $n])->values();

        return response()->json(['data' => [
            'approved' => Project::where('status', 'approved')->count(),
            'quotes' => Order::where('status', 'pending')->whereNull('unit_price')->count(),
            'trend' => $trend,
            'sports' => $sports,
            'users' => User::count(),
            'admins' => User::where('is_admin', true)->count(),
            'projects' => Project::count(),
            'orders' => Order::count(),
            'partners' => PartnerApplication::count(),
            'new_partners' => PartnerApplication::where('status', 'new')->count(),
            'garments' => (int) Order::where('status', '!=', 'cancelled')->sum('quantity'),
            'revenue' => (float) Order::whereNotIn('status', ['cancelled', 'pending'])->sum('total'),
            'by_status' => Order::select('status', DB::raw('count(*) as count'))->groupBy('status')->pluck('count', 'status'),
            'recent' => Order::withoutKit()->with('user:id,name,email')->latest()->limit(6)->get(),
            'statuses' => Order::STATUSES,
            'sizes' => Order::SIZES,
        ]]);
    }

    /** A project on an order must belong to that order's customer. */
    private function checkProject(array $data): void
    {
        if (! empty($data['project_id']) && ! Project::whereKey($data['project_id'])->where('user_id', $data['user_id'])->exists()) {
            abort(422, 'That project belongs to a different customer.');
        }
    }
}
