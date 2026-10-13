<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Admin: database health, backups and housekeeping. */
class DatabaseController extends Controller
{
    private const TABLES = ['users', 'projects', 'project_versions', 'orders', 'assets', 'personal_access_tokens', 'sessions', 'cache', 'settings'];

    public function show(): JsonResponse
    {
        $driver = DB::connection()->getDriverName();
        $file = $driver === 'sqlite' ? DB::connection()->getDatabaseName() : null;
        $uploads = collect(Storage::disk('local')->allFiles('assets'))->sum(fn ($f) => Storage::disk('local')->size($f));

        return response()->json(['data' => [
            'driver' => $driver,
            'size' => $file && is_file($file) ? filesize($file) : null,
            'uploads' => $uploads,
            'tables' => collect(self::TABLES)->filter(fn ($t) => Schema::hasTable($t))->map(fn ($t) => ['name' => $t, 'rows' => DB::table($t)->count()])->values(),
            'expired_tokens' => PersonalAccessToken::where('expires_at', '<', now())->count(),
            'php' => PHP_VERSION,
            'laravel' => app()->version(),
            'backup' => $driver === 'sqlite',
        ]]);
    }

    /** A consistent copy of the SQLite database (VACUUM INTO). */
    public function backup(): BinaryFileResponse
    {
        abort_unless(DB::connection()->getDriverName() === 'sqlite', 422, 'Backups from the panel are available for SQLite. Use your host\'s MySQL backup tool.');
        $path = storage_path('app/private/backup-'.now()->format('Ymd-His').'.sqlite');
        @mkdir(dirname($path), 0775, true);
        DB::statement('VACUUM INTO ?', [$path]);

        return response()->download($path, '3deezi-database-'.now()->format('Y-m-d-His').'.sqlite')->deleteFileAfterSend();
    }

    public function clearCache(): JsonResponse
    {
        Artisan::call('optimize:clear');

        return response()->json(['data' => ['message' => 'Caches cleared.']]);
    }

    public function pruneTokens(): JsonResponse
    {
        $count = PersonalAccessToken::where('expires_at', '<', now())->delete();

        return response()->json(['data' => ['message' => "Removed {$count} expired sign-in sessions."]]);
    }
}
