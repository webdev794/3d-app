<?php

namespace App\Services\Team;

use App\Models\Setting;
use App\Models\TeamAllowance;
use App\Models\TeamRequest;
use App\Models\User;
use App\Services\Pricing\BillingSettings;
use App\Services\Pricing\Money;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * 3DEEZI TEAM plans and allowances. Subscriptions are not live yet (the /pricing page is a proposal and there is no
 * subscription table), so each customer's plan is kept in team_allowances and set by admins; when subscriptions go
 * live, the subscription should set team_allowances.plan. The client's values (2026-10-21) are the defaults and stay
 * admin-editable (Admin > 3DEEZI TEAM > Plans & allowances). Prices INCLUDE GST (the tax is the part of the price, at
 * Admin > Pricing's rate), extra revision rounds are A$25 incl. GST, a first draft is due in 3 business days and each
 * revision in 2, and a default designer (an admin or designer) can take every new request automatically.
 */
final class TeamPlans
{
    public const KEY = 'team_plans';

    public const IDS = ['free', 'pro', 'premium', 'business'];

    /** The settings besides the plans, with their defaults (no default designer on a fresh install). */
    public const OPTIONS = ['pay_first' => true, 'default_designer_id' => null, 'extra_revision_cents' => 2500, 'first_draft_days' => 3, 'revision_days' => 2];

    private static ?array $cache = null;

    /**
     * plan => {name, included_per_month, price_cents (incl. GST), revisions, max_open}, and the options. The names
     * match the /pricing plans. The client's answers (2026-10-22): Rookie (Free) pays A$100 a request; Creator (A$19)
     * gets a lower rate, A$49.95; Club (A$49.95 a month) includes 15 requests a month, then A$49.95 each (never more
     * than Creator); Pro Studio includes more than Club: 30 a month, then A$49. The ids stay free / pro / premium /
     * business, and every value stays editable in Admin > 3DEEZI TEAM > Plans & allowances.
     */
    public static function defaults(): array
    {
        return [
            'plans' => [
                'free' => ['name' => 'Rookie (Free)', 'included_per_month' => 0, 'price_cents' => 10000, 'revisions' => 2, 'max_open' => 1],
                'pro' => ['name' => 'Creator', 'included_per_month' => 0, 'price_cents' => 4995, 'revisions' => 3, 'max_open' => 2],
                'premium' => ['name' => 'Club', 'included_per_month' => 15, 'price_cents' => 4995, 'revisions' => 3, 'max_open' => 5],
                'business' => ['name' => 'Pro Studio / Apparel Partner', 'included_per_month' => 30, 'price_cents' => 4900, 'revisions' => 5, 'max_open' => 10],
            ],
        ] + self::OPTIONS;
    }

    public static function config(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $saved = [];
        try {
            if (Schema::hasTable('settings')) {
                $saved = json_decode((string) Setting::query()->whereKey(self::KEY)->value('value'), true) ?: [];
            }
        } catch (Throwable) {
            // No database yet: the defaults.
        }
        $config = self::defaults();
        foreach (self::IDS as $id) {
            $config['plans'][$id] = array_merge($config['plans'][$id], array_intersect_key((array) ($saved['plans'][$id] ?? []), $config['plans'][$id]));
        }
        foreach (self::OPTIONS as $key => $default) {
            if (array_key_exists($key, $saved)) {
                $config[$key] = match ($key) {
                    'pay_first' => (bool) $saved[$key],
                    'default_designer_id' => $saved[$key] ? (int) $saved[$key] : null,
                    default => max(0, (int) $saved[$key]),
                };
            }
        }

        return self::$cache = $config;
    }

    /** Saves plan values and options (pay_first, default_designer_id, extra_revision_cents, first_draft_days, revision_days). */
    public static function save(array $plans, array $options = []): array
    {
        $config = self::config();
        foreach ($plans as $id => $plan) {
            if (in_array($id, self::IDS, true)) {
                $config['plans'][$id] = array_merge($config['plans'][$id], array_intersect_key($plan, $config['plans'][$id]));
            }
        }
        foreach (array_intersect_key($options, self::OPTIONS) as $key => $value) {
            $config[$key] = $value;
        }
        Setting::query()->updateOrCreate(['key' => self::KEY], ['value' => json_encode($config, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]);
        self::flush();

        return self::config();
    }

    /** The default designer, when one is set and is still an admin or designer. */
    public static function defaultDesigner(): ?User
    {
        $id = self::config()['default_designer_id'];
        $user = $id ? User::find($id) : null;

        return $user && ($user->is_admin || $user->is_designer) ? $user : null;
    }

    /** The date $days business days (Monday to Friday) after $from (default today). */
    public static function businessDays(int $days, $from = null): \Carbon\CarbonInterface
    {
        $date = ($from ? \Illuminate\Support\Carbon::parse($from) : now())->startOfDay();

        return $days > 0 ? $date->addWeekdays($days) : $date;
    }

    /** The turnaround promise for the pages: business days for the first draft and for each revision. */
    public static function turnaround(): array
    {
        $c = self::config();

        return ['first_draft_days' => (int) $c['first_draft_days'], 'revision_days' => (int) $c['revision_days']];
    }

    /** An extra revision round's price (incl. GST), as on its invoice. */
    public static function extraRevision(): array
    {
        $cents = (int) self::config()['extra_revision_cents'];

        return ['price' => Money::decimal($cents), 'tax' => Money::decimal(self::includedTax($cents)), 'currency' => BillingSettings::currency(), 'tax_included' => true,
            'tax_name' => self::taxName()];
    }

    public static function taxName(): string
    {
        return (string) (BillingSettings::get('tax_name') ?: 'GST');
    }

    public static function flush(): void
    {
        self::$cache = null;
    }

    public static function plan(string $id): array
    {
        $plans = self::config()['plans'];

        return ($plans[$id] ?? $plans['free']) + ['id' => isset($plans[$id]) ? $id : 'free'];
    }

    /** The plans for the API (prices as decimals). */
    public static function present(): array
    {
        return array_values(array_map(fn ($id) => self::presentPlan($id), self::IDS));
    }

    public static function presentPlan(string $id): array
    {
        $p = self::plan($id);

        return ['id' => $p['id'], 'name' => $p['name'], 'included_per_month' => (int) $p['included_per_month'], 'price' => Money::decimal((int) $p['price_cents']),
            'tax_included' => true, 'revisions' => (int) $p['revisions'], 'max_open' => (int) $p['max_open']];
    }

    /** The customer's allowance row (not saved when they have none: the Free plan). */
    public static function allowanceFor(User $user): TeamAllowance
    {
        return TeamAllowance::query()->where('user_id', $user->id)->first() ?? new TeamAllowance(['user_id' => $user->id, 'plan' => 'free', 'bonus_requests' => 0, 'unlimited' => false]);
    }

    public static function period(): string
    {
        return now()->format('Y-m');
    }

    /** Included requests used this month (not counting ones given back). */
    public static function usedThisMonth(User $user): int
    {
        return TeamRequest::query()->where('user_id', $user->id)->where('period', self::period())->where('billing', 'included')->where('used_bonus', false)->count();
    }

    /**
     * Where the customer stands and what their next request costs (team-api.md 2).
     *
     * @return array<string, mixed>
     */
    public static function status(User $user): array
    {
        $allowance = self::allowanceFor($user);
        $plan = self::plan((string) $allowance->plan);
        $included = $allowance->monthly_included ?? (int) $plan['included_per_month'];
        $used = self::usedThisMonth($user);
        $bonus = (int) $allowance->bonus_requests;
        $remaining = max(0, $included - $used);
        $open = TeamRequest::query()->where('user_id', $user->id)->whereIn('status', TeamRequest::OPEN)->count();
        $maxOpen = (int) $plan['max_open'];
        $next = self::nextBilling($allowance, $plan, $remaining);
        // Prices include GST: the tax is the part of the price.
        $tax = $next['price_cents'] > 0 ? self::includedTax($next['price_cents']) : 0;
        $blocked = ! $allowance->unlimited && $open >= $maxOpen
            ? "You have {$open} request".($open === 1 ? '' : 's')." open: the {$plan['name']} plan allows {$maxOpen} at once. You can send a new one when one is finished."
            : null;

        return [
            'plan' => $plan['id'],
            'plan_name' => $plan['name'],
            'period' => self::period(),
            'included_per_month' => $included,
            'used_this_month' => $used,
            'bonus_remaining' => $bonus,
            'unlimited' => (bool) $allowance->unlimited,
            'remaining_included' => $allowance->unlimited ? null : $remaining + $bonus,
            'next_request' => [
                'billing' => $next['billing'],
                'price' => Money::decimal($next['price_cents']),
                'tax' => Money::decimal($tax),
                'total' => Money::decimal($next['price_cents']),
                'currency' => BillingSettings::currency(),
                'tax_included' => true,
                'tax_name' => self::taxName(),
                'pay_first' => (bool) self::config()['pay_first'],
            ],
            'extra_revision' => self::extraRevision(),
            'turnaround' => self::turnaround(),
            'revisions_per_request' => (int) $plan['revisions'],
            'open_requests' => $open,
            'max_open_requests' => $allowance->unlimited ? null : $maxOpen,
            'can_submit' => $blocked === null,
            'blocked_reason' => $blocked,
            'plans' => self::present(),
        ];
    }

    /** included (allowance or bonus), free (unlimited or no price) or paid. */
    public static function nextBilling(TeamAllowance $allowance, array $plan, int $remaining): array
    {
        if ($allowance->unlimited) {
            return ['billing' => 'free', 'price_cents' => 0, 'bonus' => false];
        }
        if ($remaining > 0) {
            return ['billing' => 'included', 'price_cents' => 0, 'bonus' => false];
        }
        if ((int) $allowance->bonus_requests > 0) {
            return ['billing' => 'included', 'price_cents' => 0, 'bonus' => true];
        }
        $price = (int) $plan['price_cents'];

        return $price > 0 ? ['billing' => 'paid', 'price_cents' => $price, 'bonus' => false] : ['billing' => 'free', 'price_cents' => 0, 'bonus' => false];
    }

    /** The tax inside a price that includes it, at Admin > Pricing's rate (GST 10%: A$100.00 holds A$9.09). */
    public static function includedTax(int $cents): int
    {
        $rate = (float) BillingSettings::get('tax_rate');

        return $rate > 0 ? $cents - (int) round($cents * 100 / (100 + $rate)) : 0;
    }
}
