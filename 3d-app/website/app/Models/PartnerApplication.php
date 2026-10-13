<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;

/** A sportswear company applying to embed 3DEEZI on its own website (Corporate Partner plan). */
class PartnerApplication extends Model
{
    public const STATUSES = ['new', 'contacted', 'onboarding', 'live', 'declined'];

    protected $fillable = ['company', 'name', 'email', 'phone', 'website', 'message', 'status'];

    /** Shared hosting has no shell for `php artisan migrate`, so an uploaded update creates its table on first use. */
    public static function ensureTable(): void
    {
        if (! Schema::hasTable('partner_applications')) {
            Artisan::call('migrate', ['--force' => true]);
        }
    }
}
