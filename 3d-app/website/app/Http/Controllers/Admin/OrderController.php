<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\OrderRequest;
use App\Models\Order;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Admin: every customer's orders, plus the overview numbers. */
class OrderController extends Controller
{
    private const WITH = ['user:id,name,email', 'project:id,name,sport,garment'];

    public function index(Request $request): JsonResponse
    {
        $request->validate(['status' => ['sometimes', 'nullable', Rule::in(Order::STATUSES)]]);
        $search = trim((string) $request->query('search', ''));
        $orders = Order::query()
            ->with(self::WITH)
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status))
            ->when($request->query('user_id'), fn ($q, $id) => $q->where('user_id', $id))
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q
                ->where('number', 'like', "%{$search}%")
                ->orWhere('contact_name', 'like', "%{$search}%")
                ->orWhereHas('user', fn ($u) => $u->where('email', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%"))))
            ->latest()
            ->paginate(min(100, max(5, (int) $request->query('per_page', 20))));

        return response()->json(['data' => $orders]);
    }

    public function store(OrderRequest $request): JsonResponse
    {
        $data = $request->validated();
        $this->checkProject($data);
        $order = Order::create($data);

        return response()->json(['data' => $order->refresh()->load(self::WITH)], 201);
    }

    public function update(OrderRequest $request, Order $order): JsonResponse
    {
        $data = $request->validated();
        $this->checkProject($data + ['user_id' => $order->user_id]);
        $order->update($data);

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
            'garments' => (int) Order::where('status', '!=', 'cancelled')->sum('quantity'),
            'revenue' => (float) Order::whereNotIn('status', ['cancelled', 'pending'])->sum('total'),
            'by_status' => Order::select('status', DB::raw('count(*) as count'))->groupBy('status')->pluck('count', 'status'),
            'recent' => Order::with('user:id,name,email')->latest()->limit(6)->get(),
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
