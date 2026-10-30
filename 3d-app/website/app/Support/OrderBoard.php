<?php

namespace App\Support;

use App\Models\Order;
use Illuminate\Contracts\Database\Eloquent\Builder;

/**
 * The order board: orders in their five stages, current or completed (cancelled, or delivered over
 * Order::COMPLETED_AFTER_DAYS days ago), with a search by reference, name or garment. The same board for the customer
 * (their own orders) and staff (everyone's).
 */
final class OrderBoard
{
    /** Cards per stage at most (staff boards can grow; the newest arrivals are kept). */
    private const LIMIT = 200;

    public static function build(Builder $orders, bool $staff, string $view, string $search, ?int $ownerId = null): array
    {
        $searched = clone $orders;
        if ($search !== '') {
            self::search($searched, $search, $staff);
        }
        $cutoff = now()->subDays(Order::COMPLETED_AFTER_DAYS);
        $completed = fn (Builder $q) => $q->where(fn ($q) => $q->where('orders.status', 'cancelled')
            ->orWhere(fn ($q) => $q->where('orders.status', 'delivered')->where('orders.status_changed_at', '<', $cutoff)));
        $current = fn (Builder $q) => $q->where('orders.status', '!=', 'cancelled')
            ->where(fn ($q) => $q->where('orders.status', '!=', 'delivered')->orWhereNull('orders.status_changed_at')->orWhere('orders.status_changed_at', '>=', $cutoff));

        $counts = ['current' => $current(clone $searched)->count(), 'completed' => $completed(clone $searched)->count()];
        $query = ($view === 'completed' ? $completed : $current)(clone $searched);
        // Newest arrival first in each stage: the card moved last is on top.
        $orders = OrderView::forCards($query, $staff)->orderByDesc('orders.status_changed_at')->orderByDesc('orders.id')->limit(self::LIMIT * 6)->get();
        $projects = OrderView::itemProjects($orders, $ownerId);
        $cards = $orders->map(fn (Order $o) => OrderView::card($o, $staff, $projects));

        $stages = array_map(function (string $status) use ($cards) {
            $in = $cards->where('status', $status)->values();

            return [
                'key' => OrderStages::key($status),
                'status' => $status,
                'label' => OrderStages::label($status),
                'tone' => OrderStages::STAGES[$status][2],
                'count' => $in->count(),
                'orders' => $in->take(self::LIMIT)->all(),
            ];
        }, OrderStages::BOARD);

        return [
            'view' => $view,
            'search' => $search,
            'completed_after_days' => Order::COMPLETED_AFTER_DAYS,
            'updated_at' => now()->toIso8601String(),
            'counts' => $counts,
            'stages' => $stages,
            'cancelled' => $cards->where('status', 'cancelled')->values()->take(self::LIMIT)->all(),
        ];
    }

    /** Reference (3DZ-00012 or 12), name (team, kit, contact), garment or sport; staff also the customer. */
    public static function search(Builder $query, string $search, bool $staff): void
    {
        $text = mb_strtolower($search);
        $like = '%'.$search.'%';
        $digits = preg_replace('/\D/', '', $search) ?? '';
        // Garments and sports by name, for searches of 3 letters or more ("hood", "rugby").
        $words = mb_strlen($text) >= 3;
        $garments = ! $words ? [] : array_keys(array_filter(Order::GARMENTS + ['fullkit' => 'Full kit'],
            fn ($label, $key) => str_contains(mb_strtolower($label), $text) || str_contains($text, $key) || str_contains($text, mb_strtolower(rtrim($label, 's'))), ARRAY_FILTER_USE_BOTH));
        $sports = ! $words ? [] : array_column(array_filter(config('catalog.sports'), fn ($s) => str_contains(mb_strtolower($s['name']), $text) || str_contains($text, mb_strtolower($s['name']))), 'id');

        $query->where(function ($q) use ($like, $digits, $garments, $sports, $staff) {
            $q->where('orders.number', 'like', $like)
                ->orWhere('orders.team_name', 'like', $like)
                ->orWhere('orders.contact_name', 'like', $like)
                ->orWhere('orders.items', 'like', $like)
                ->orWhereHas('project', fn ($p) => $p->where('name', 'like', $like));
            if ($digits !== '' && strlen($digits) <= 7) {
                $q->orWhere('orders.id', (int) $digits);
            }
            foreach ($garments as $garment) {
                $q->orWhere('orders.items', 'like', '%"garment":"'.$garment.'"%')->orWhereHas('project', fn ($p) => $p->where('garment', $garment));
            }
            foreach ($sports as $sport) {
                $q->orWhere('orders.items', 'like', '%"sport":"'.$sport.'"%')->orWhereHas('project', fn ($p) => $p->where('sport', $sport));
            }
            if ($staff) {
                $q->orWhereHas('user', fn ($u) => $u->where('name', 'like', $like)->orWhere('email', 'like', $like));
            }
        });
    }
}
