<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('auth', fn (Request $request) => [
            Limit::perMinute(8)->by($request->ip()),
            Limit::perMinute(5)->by(mb_strtolower((string) $request->input('email')).'|'.$request->ip()),
        ]);
        RateLimiter::for('uploads', fn (Request $request) => Limit::perMinute(20)->by($request->user()->id));
        RateLimiter::for('concepts', fn (Request $request) => Limit::perMinute(12)->by($request->user()->id));
        // The help chat is public: a few questions a minute and a daily cap per visitor keep AI costs bounded.
        RateLimiter::for('assist', fn (Request $request) => [
            Limit::perMinute(10)->by('assist:'.($request->user('sanctum')?->id ?: $request->ip())),
            Limit::perDay(200)->by('assist-day:'.($request->user('sanctum')?->id ?: $request->ip())),
        ]);

        // Settings saved in the admin panel override .env.
        if (! $this->app->runningUnitTests()) {
            \App\Models\Setting::applyToConfig();
        }
    }
}
