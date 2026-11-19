<?php

namespace App\Support;

use App\Models\Order;

/**
 * The order board: five stages (the existing order statuses), each with a sub-status shown as a pill on the card.
 * Staff choose the sub-status (the order's step); in Design & Approval it follows the design approval instead.
 */
final class OrderStages
{
    /** status => [stage key, label, colour]; cancelled orders are not on the board. */
    public const STAGES = [
        'pending' => ['received', 'Order Received', 'blue'],
        'confirmed' => ['design', 'Design & Approval', 'amber'],
        'in_production' => ['production', 'Production', 'violet'],
        'shipped' => ['shipped', 'Shipped', 'blue'],
        'delivered' => ['delivered', 'Delivered', 'green'],
        'cancelled' => ['cancelled', 'Cancelled', 'grey'],
    ];

    /** The board's columns, in order. */
    public const BOARD = ['pending', 'confirmed', 'in_production', 'shipped', 'delivered'];

    /** Sub-statuses staff can choose in each stage: step => [label, latest-update text]. The first is the default. */
    public const STEPS = [
        'pending' => ['received' => ['Order received', 'Order received'], 'reviewing' => ['Checking your order', 'We are checking your order']],
        'confirmed' => [],
        'in_production' => [
            'in_production' => ['In production', 'In production'], 'printing' => ['Printing', 'Printing underway'],
            'cutting' => ['Cutting', 'Cutting underway'], 'sewing' => ['Sewing', 'Sewing underway'],
            'quality_check' => ['Quality check', 'Quality check underway'], 'packing' => ['Packing', 'Packing your order'],
        ],
        'shipped' => ['in_transit' => ['In transit', 'On its way to you'], 'out_for_delivery' => ['Out for delivery', 'Out for delivery today']],
        'delivered' => ['delivered' => ['Delivered', 'Delivered']],
        'cancelled' => ['cancelled' => ['Cancelled', 'Order cancelled']],
    ];

    /** Design & Approval's sub-status, from the design approval: approval => [key, label, colour]. */
    public const APPROVAL_STEPS = [
        'waiting' => ['design_in_progress', 'Design in progress', 'violet'],
        'review' => ['approval_needed', 'Approval needed', 'amber'],
        'changes' => ['changes_requested', 'Changes requested', 'amber'],
        'approved' => ['design_approved', 'Design approved', 'green'],
    ];

    /** The statuses at or after Production: an order going there should have its design approved. */
    public const MAKING = ['in_production', 'shipped', 'delivered'];

    public static function key(string $status): string
    {
        return self::STAGES[$status][0] ?? 'received';
    }

    public static function label(string $status): string
    {
        return self::STAGES[$status][1] ?? $status;
    }

    /** The status of a stage key (received => pending), or null. */
    public static function statusOf(string $key): ?string
    {
        foreach (self::STAGES as $status => [$stage]) {
            if ($stage === $key) {
                return $status;
            }
        }

        return null;
    }

    /** Whether a step can be chosen in this status. */
    public static function validStep(string $status, ?string $step): bool
    {
        return $step === null || array_key_exists($step, self::STEPS[$status] ?? []);
    }

    /** @return array{key: string, label: string, tone: string} */
    public static function subStatus(Order $order): array
    {
        $status = (string) $order->status;
        if ($status === 'confirmed') {
            [$key, $label, $tone] = self::APPROVAL_STEPS[$order->approval ?? 'waiting'] ?? self::APPROVAL_STEPS['waiting'];

            return compact('key', 'label', 'tone');
        }
        $steps = self::STEPS[$status] ?? [];
        $key = $order->step && isset($steps[$order->step]) ? $order->step : (array_key_first($steps) ?? $status);
        $tone = match ($status) {
            'in_production' => 'violet',
            'delivered' => 'green',
            'cancelled' => 'grey',
            default => 'blue',
        };

        return ['key' => $key, 'label' => $steps[$key][0] ?? self::label($status), 'tone' => $tone];
    }

    /** The latest-update text for a step ("Sewing underway"). */
    public static function stepText(string $status, string $step): string
    {
        return self::STEPS[$status][$step][1] ?? self::STEPS[$status][$step][0] ?? $step;
    }

    /** For the forms and the board: every stage with its sub-statuses. */
    public static function all(): array
    {
        return array_map(fn (string $status) => [
            'key' => self::key($status),
            'status' => $status,
            'label' => self::label($status),
            'tone' => self::STAGES[$status][2],
            'steps' => $status === 'confirmed'
                ? array_values(array_map(fn ($s) => ['key' => $s[0], 'label' => $s[1]], self::APPROVAL_STEPS))
                : array_map(fn ($key, $s) => ['key' => $key, 'label' => $s[0]], array_keys(self::STEPS[$status]), self::STEPS[$status]),
        ], array_keys(self::STAGES));
    }
}
