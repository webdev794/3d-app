<?php

use App\Http\Controllers\Admin;
use App\Http\Controllers\AiController;
use App\Http\Controllers\AssetController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ConceptController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\PartnerApplicationController;
use App\Http\Controllers\ProjectController;
use App\Services\OpenAiDesigner;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->middleware('throttle:api')->group(function () {
    Route::get('/presets', fn () => response()->json(['data' => json_decode(
        file_get_contents(public_path('media/presets.json')), true, 512, JSON_THROW_ON_ERROR,
    )]));
    Route::get('/catalog', fn () => response()->json(['data' => array_merge(
        config('catalog'),
        OpenAiDesigner::enabled()
            ? ['provider' => OpenAiDesigner::provider(), 'showcase_scenes' => array_keys(OpenAiDesigner::SCENES)]
            : ['showcase_scenes' => []],
    )]));
    Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:auth');
    Route::post('/partners/apply', [PartnerApplicationController::class, 'store'])->middleware('throttle:auth');
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:auth');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::patch('/auth/me', [AuthController::class, 'update']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/dashboard', [ProjectController::class, 'dashboard']);
        Route::get('/projects/{project}/versions', [ProjectController::class, 'versions'])->whereNumber('project');
        Route::get('/projects/{project}/export', [ProjectController::class, 'export'])->whereNumber('project');
        Route::apiResource('projects', ProjectController::class)->whereNumber('project');
        Route::get('/assets', [AssetController::class, 'index']);
        Route::post('/assets', [AssetController::class, 'store'])->middleware('throttle:uploads');
        Route::get('/assets/{asset}/file', [AssetController::class, 'file'])->whereNumber('asset')->name('assets.file');
        Route::delete('/assets/{asset}', [AssetController::class, 'destroy'])->whereNumber('asset');
        Route::post('/concepts', [ConceptController::class, 'store'])->middleware('throttle:concepts');
        Route::post('/ai/pattern', [AiController::class, 'pattern'])->middleware('throttle:concepts');
        Route::post('/ai/showcase', [AiController::class, 'showcase'])->middleware('throttle:concepts');
        Route::post('/ai/mockup', [AiController::class, 'mockup'])->middleware('throttle:concepts');
        Route::post('/ai/edit', [AiController::class, 'edit'])->middleware('throttle:concepts');
        Route::post('/ai/convert', [AiController::class, 'convert'])->middleware('throttle:concepts');
        Route::get('/orders', [OrderController::class, 'index']);
        Route::post('/orders', [OrderController::class, 'store'])->middleware('throttle:uploads');

        // The admin panel.
        Route::prefix('admin')->name('admin.')->middleware('admin')->group(function () {
            Route::get('/stats', [Admin\OrderController::class, 'stats'])->name('stats');
            Route::apiResource('users', Admin\UserController::class)->whereNumber('user');
            Route::apiResource('orders', Admin\OrderController::class)->except('show')->whereNumber('order');
            Route::apiResource('projects', Admin\ProjectController::class)->only(['index', 'update', 'destroy'])->whereNumber('project');
            Route::apiResource('partners', Admin\PartnerController::class)->only(['index', 'update', 'destroy'])->whereNumber('partner');
            Route::get('/settings', [Admin\SettingsController::class, 'show'])->name('settings');
            Route::put('/settings', [Admin\SettingsController::class, 'update'])->name('settings.update');
            Route::post('/settings/test', [Admin\SettingsController::class, 'test'])->name('settings.test');
            Route::get('/database', [Admin\DatabaseController::class, 'show'])->name('database');
            Route::get('/database/backup', [Admin\DatabaseController::class, 'backup'])->name('database.backup');
            Route::post('/database/clear-cache', [Admin\DatabaseController::class, 'clearCache'])->name('database.cache');
            Route::post('/database/prune-tokens', [Admin\DatabaseController::class, 'pruneTokens'])->name('database.tokens');
        });
    });
});
