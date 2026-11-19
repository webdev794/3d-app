<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Who makes an order (task 9.118). 3DEEZI (the default) and Mantis are the owner's own entries (`owner`, slugs
 * 3deezi and mantis: Mantis owns 3DEEZI). Other companies apply with "Become a preferred supplier" (status applied),
 * pay a monthly or yearly listing (`plan`, `paid_until`, their invoice) and are approved by an admin: then they show on
 * the Preferred suppliers page (/suppliers) and in the order form's "Made by" choice. Hidden ones show nowhere.
 * The admin passes an outside supplier's orders on to them for now (supplier logins come later).
 */
class Supplier extends Model
{
    public const STATUSES = ['applied', 'approved', 'hidden'];

    public const PLANS = ['monthly', 'yearly'];

    /** The default maker. */
    public const DEFAULT = '3deezi';

    /** Where logos are kept (local disk: storage/app/private/suppliers). */
    public const LOGO_DIR = 'suppliers';

    /** Settings key of the listing prices (Admin > Pricing). */
    public const PRICES_KEY = 'supplier_listing';

    protected $fillable = ['name', 'contact_name', 'email', 'phone', 'website', 'summary', 'makes', 'location', 'message', 'status', 'plan', 'paid_until', 'sort'];

    protected $hidden = ['user_id', 'logo', 'message', 'paid_invoice_id'];

    protected function casts(): array
    {
        return ['owner' => 'boolean', 'paid_until' => 'date:Y-m-d', 'approved_at' => 'datetime', 'sort' => 'integer', 'user_id' => 'integer', 'invoice_id' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** The latest listing invoice. */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    private static bool $ready = false;

    private static bool $tried = false;

    /**
     * Whether the suppliers table and the orders' "Made by" columns are there. Shared hosting has no shell for
     * `php artisan migrate`, so the first request that needs them runs the waiting database updates (config
     * suppliers.auto_setup; off on a developer's computer, whose database is only changed by hand).
     */
    public static function ready(): bool
    {
        if (self::$ready) {
            return true;
        }
        // Checked once per request: a board of many orders asks for every card.
        if (self::$tried) {
            return false;
        }
        self::$tried = true;
        $has = fn () => Schema::hasTable('suppliers') && Schema::hasColumn('orders', 'made_by');
        try {
            if ($has()) {
                return self::$ready = true;
            }
            if (config('suppliers.auto_setup', true)) {
                Artisan::call('migrate', ['--force' => true]);

                return self::$ready = $has();
            }
        } catch (Throwable $e) {
            report($e);
        }

        return false;
    }

    /** Forgets the check (tests). */
    public static function forget(): void
    {
        self::$ready = false;
        self::$tried = false;
    }

    /** On the page and in the order form: approved, and an outside supplier's listing paid up (or given free by an admin). */
    public function scopeListed(Builder $query): void
    {
        $query->where('status', 'approved')->where(fn ($q) => $q->where('owner', true)->orWhereNull('paid_until')->orWhereDate('paid_until', '>=', now()->toDateString()));
    }

    public function isListed(): bool
    {
        return $this->status === 'approved' && ($this->owner || ! $this->paid_until || $this->paid_until->gte(now()->startOfDay()));
    }

    /** The default maker (3DEEZI). */
    public static function default(): ?self
    {
        return self::ready() ? self::query()->where('slug', self::DEFAULT)->first() : null;
    }

    /** The "Made by" choices for an order: 3DEEZI first, then Mantis, then the listed outside suppliers. */
    public static function choices(): Collection
    {
        if (! self::ready()) {
            return collect();
        }

        return self::query()->listed()->orderByDesc('owner')->orderBy('sort')->orderBy('name')->get();
    }

    /**
     * The supplier an order is made by: the one chosen (a listed one; staff may pass any), else 3DEEZI. Null when the
     * suppliers table is not there yet.
     */
    public static function forOrder(mixed $id, bool $staff = false): ?self
    {
        if (! self::ready()) {
            return null;
        }
        if ($id === null || $id === '' || $id === 0 || $id === '0') {
            return self::default();
        }
        $supplier = self::query()->find((int) $id);

        return $supplier && ($staff || $supplier->isListed()) ? $supplier : null;
    }

    /** Puts the maker on an order (its id and name as it is now). */
    public static function assign(Order $order, mixed $id, bool $staff = false): void
    {
        $supplier = self::forOrder($id, $staff);
        if ($supplier) {
            $order->forceFill(['supplier_id' => $supplier->id, 'made_by' => $supplier->name]);
        }
    }

    /** "3DEEZI" for an order without a maker (placed before the choice existed); null before the columns exist. */
    public static function madeByOf(Order $order): ?string
    {
        $attributes = $order->getAttributes();
        if (! array_key_exists('made_by', $attributes) && ! self::ready()) {
            return null;
        }

        return filled($attributes['made_by'] ?? null) ? (string) $attributes['made_by'] : '3DEEZI';
    }

    /** An orders query for one maker: an id, or "3deezi" (orders without one count as 3DEEZI's). */
    public static function filter(Builder $orders, mixed $value): void
    {
        if ($value === null || $value === '' || ! self::ready()) {
            return;
        }
        $default = self::default();
        $id = $value === self::DEFAULT ? $default?->id : (int) $value;
        if ($default && $id === $default->id) {
            $orders->where(fn ($q) => $q->where('orders.supplier_id', $default->id)->orWhereNull('orders.supplier_id'));
        } else {
            $orders->where('orders.supplier_id', $id);
        }
    }

    /** SUP-0007: the listing's reference on its invoices. */
    public function reference(): string
    {
        return 'SUP-'.str_pad((string) $this->id, 4, '0', STR_PAD_LEFT);
    }

    /** The link with its https:// (people type "acme.com"). */
    public function link(): ?string
    {
        $site = trim((string) $this->website);
        if ($site === '') {
            return null;
        }

        return preg_match('#^https?://#i', $site) ? $site : 'https://'.$site;
    }

    public function logoUrl(): ?string
    {
        return $this->logo ? url('/api/v1/suppliers/'.$this->id.'/logo').'?v='.($this->updated_at?->getTimestamp() ?? 0) : null;
    }

    /** For the page, the order form and the app. */
    public function present(): array
    {
        return [
            'id' => $this->id,
            'slug' => $this->slug,
            'name' => $this->name,
            'owner' => (bool) $this->owner,
            'summary' => $this->summary,
            'makes' => $this->makes,
            'location' => $this->location,
            'website' => $this->link(),
            'logo_url' => $this->logoUrl(),
            'default' => $this->slug === self::DEFAULT,
        ];
    }

    /** Admin > Suppliers: everything, with the listing's invoice at a glance. */
    public function forAdmin(): array
    {
        $invoice = $this->invoice_id ? $this->invoice : null;

        return $this->present() + [
            'status' => $this->status,
            'listed' => $this->isListed(),
            'contact_name' => $this->contact_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'website_text' => $this->website,
            'message' => $this->message,
            'plan' => $this->plan,
            'paid_until' => $this->paid_until?->toDateString(),
            'expired' => ! $this->owner && $this->paid_until && $this->paid_until->lt(now()->startOfDay()),
            'invoice' => Invoice::summary($invoice),
            'account' => $this->user ? ['id' => $this->user->id, 'name' => $this->user->name, 'email' => $this->user->email] : null,
            'sort' => $this->sort,
            'approved_at' => $this->approved_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    /** The listing prices set in Admin > Pricing, in cents including GST. */
    public static function prices(): array
    {
        $saved = [];
        try {
            if (Schema::hasTable('settings')) {
                $saved = json_decode((string) Setting::query()->whereKey(self::PRICES_KEY)->value('value'), true) ?: [];
            }
        } catch (Throwable) {
            // No database yet: the defaults.
        }

        return [
            'monthly_cents' => max(0, (int) ($saved['monthly_cents'] ?? config('suppliers.monthly_cents', 4900))),
            'yearly_cents' => max(0, (int) ($saved['yearly_cents'] ?? config('suppliers.yearly_cents', 49000))),
        ];
    }

    public static function savePrices(int $monthly, int $yearly): array
    {
        Setting::query()->updateOrCreate(['key' => self::PRICES_KEY], ['value' => json_encode(['monthly_cents' => $monthly, 'yearly_cents' => $yearly])]);

        return self::prices();
    }
}
