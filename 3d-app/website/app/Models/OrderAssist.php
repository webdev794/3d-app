<?php

namespace App\Models;

use App\Services\OrderAnalysis;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * An order the Order Assistant collated (task TL-3): the chat, the files, the reading (App\Services\OrderAnalysis) and
 * the maker whose branding the PDF carries (3DEEZI when none). Opened by its token: the share link.
 */
class OrderAssist extends Model
{
    public const DIR = 'order-assists';

    protected $fillable = ['title', 'messages', 'files', 'analysis', 'supplier_id', 'user_id'];

    protected $hidden = ['user_id', 'id'];

    protected function casts(): array
    {
        return ['messages' => 'array', 'files' => 'array', 'analysis' => 'array'];
    }

    protected static function booted(): void
    {
        static::creating(function (self $assist) {
            $assist->token ??= Str::random(40);
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function getRouteKeyName(): string
    {
        return 'token';
    }

    /** Shared hosting has no shell for `php artisan migrate`, so an uploaded update creates its table on first use. */
    public static function ensureTable(): void
    {
        static $checked = false;
        if (! $checked && ! Schema::hasTable('order_assists')) {
            Artisan::call('migrate', ['--force' => true]);
        }
        $checked = true;
    }

    /** Share links (/order-assistant/{token}) look the order up before the controller runs. */
    public function resolveRouteBinding($value, $field = null)
    {
        self::ensureTable();

        return parent::resolveRouteBinding($value, $field);
    }

    /**
     * The order's name on the PDF and Excel: its own title, else its main garments ("Football jersey order",
     * "Football jersey & shorts order", "Polo + 2 more garments"), else "Your order" (an untitled order read "Order – Order Form").
     */
    public function displayTitle(): string
    {
        $title = trim((string) $this->title);
        if ($title !== '') {
            return $title;
        }
        $t = $this->analysis['totals'] ?? [];
        $counts = $t['by_column'] ?? $t['by_garment'] ?? [];
        arsort($counts);
        $names = [];
        foreach (array_keys($counts) as $column) {
            $garment = explode('@', (string) $column)[0];
            $name = (string) ($t['columns'][$column] ?? OrderAnalysis::PRODUCT_NAMES[$garment] ?? '');
            // "Jersey (sport not given)" is just a jersey here.
            $name = trim((string) preg_replace('/\s*\(.*\)$/', '', $name));
            if ($name !== '' && ! in_array(mb_strtolower($name), array_map('mb_strtolower', $names), true)) {
                $names[] = $name;
            }
        }
        if (! $names) {
            return 'Your order';
        }
        if (count($names) > 2) {
            return $names[0].' + '.(count($names) - 1).' more garments';
        }
        $rest = array_map(fn ($n) => mb_strtolower(mb_substr($n, 0, 1)).mb_substr($n, 1), array_slice($names, 1));

        return implode(' & ', [$names[0], ...$rest]).' order';
    }

    /** Download name: "Reunion_2027_Order_Form", or "3DEEZI_Order_Form_2026-11-06" for an order with no title. */
    public function downloadName(): string
    {
        $name = trim((string) preg_replace('/[^A-Za-z0-9]+/', '_', trim((string) $this->title)), '_');

        return $name !== '' ? $name.'_Order_Form' : '3DEEZI_Order_Form_'.($this->updated_at ?? now())->format('Y-m-d');
    }

    /** The maker named on the PDF and pages: the chosen supplier, else 3DEEZI. */
    public function brandName(): string
    {
        return $this->supplier?->name ?: '3DEEZI';
    }
}
