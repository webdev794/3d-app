<?php

use App\Http\Controllers\Admin;
use App\Http\Controllers\AiController;
use App\Http\Controllers\ArtboardDocumentController;
use App\Http\Controllers\AssistController;
use App\Http\Controllers\AssetController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ConceptController;
use App\Http\Controllers\ConvertController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\OrderDraftController;
use App\Http\Controllers\OrderFileController;
use App\Http\Controllers\PartnerApplicationController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\SupportMessageController;
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
    Route::get('/convert/formats', [ConvertController::class, 'formats']);
    Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:auth');
    Route::post('/partners/apply', [PartnerApplicationController::class, 'store'])->middleware('throttle:auth');
    // The Support page's contact form (/support): open to visitors; saved for Admin > Support and emailed to the team.
    Route::post('/support', [SupportMessageController::class, 'store'])->middleware('throttle:auth');
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:auth');
    // 3DEEZI ASSIST, the help chat on every page: open to visitors too.
    Route::post('/assist', [AssistController::class, 'chat'])->middleware('throttle:assist');
    // 3DEEZI Orders: the order forms' choices, and "Help me add sizes" (open to visitors, who fill the form before signing in).
    Route::get('/orders/options', [OrderController::class, 'options']);
    Route::post('/orders/assist', [OrderController::class, 'assist'])->middleware('throttle:assist');

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
        // The Artboard's designs and templates (File > Save to my account, Open from my account, templates).
        Route::get('/artboards', [ArtboardDocumentController::class, 'index']);
        Route::post('/artboards', [ArtboardDocumentController::class, 'store'])->middleware('throttle:uploads');
        Route::get('/artboards/{artboard}', [ArtboardDocumentController::class, 'show'])->whereNumber('artboard');
        Route::patch('/artboards/{artboard}', [ArtboardDocumentController::class, 'update'])->whereNumber('artboard')->middleware('throttle:uploads');
        Route::delete('/artboards/{artboard}', [ArtboardDocumentController::class, 'destroy'])->whereNumber('artboard');
        Route::post('/concepts', [ConceptController::class, 'store'])->middleware('throttle:concepts');
        Route::post('/convert/cdr', [ConvertController::class, 'cdr'])->middleware('throttle:uploads');
        Route::post('/ai/pattern', [AiController::class, 'pattern'])->middleware('throttle:concepts');
        Route::post('/ai/showcase', [AiController::class, 'showcase'])->middleware('throttle:concepts');
        Route::post('/ai/mockup', [AiController::class, 'mockup'])->middleware('throttle:concepts');
        Route::post('/ai/print-sheet', [AiController::class, 'printSheet'])->middleware('throttle:concepts');
        Route::post('/ai/edit', [AiController::class, 'edit'])->middleware('throttle:concepts');
        Route::post('/ai/image-edit', [AiController::class, 'imageEdit'])->middleware('throttle:concepts');
        Route::post('/ai/convert', [AiController::class, 'convert'])->middleware('throttle:concepts');
        Route::get('/orders', [OrderController::class, 'index']);
        Route::post('/orders', [OrderController::class, 'store'])->middleware('throttle:uploads');
        // 3DEEZI Orders: my board, one order, design approval; drafts with their files; file downloads; notifications.
        Route::get('/orders/board', [OrderController::class, 'board']);
        Route::get('/orders/{order}', [OrderController::class, 'show'])->whereNumber('order');
        Route::post('/orders/{order}/approval', [OrderController::class, 'approval'])->whereNumber('order');
        Route::get('/order-drafts', [OrderDraftController::class, 'index']);
        Route::post('/order-drafts', [OrderDraftController::class, 'store']);
        Route::get('/order-drafts/{draft}', [OrderDraftController::class, 'show'])->whereNumber('draft');
        Route::patch('/order-drafts/{draft}', [OrderDraftController::class, 'update'])->whereNumber('draft');
        Route::delete('/order-drafts/{draft}', [OrderDraftController::class, 'destroy'])->whereNumber('draft');
        Route::post('/order-drafts/{draft}/submit', [OrderDraftController::class, 'submit'])->whereNumber('draft')->middleware('throttle:uploads')->name('order-drafts.submit');
        Route::get('/order-drafts/{draft}/files', [OrderDraftController::class, 'files'])->whereNumber('draft');
        Route::post('/order-drafts/{draft}/files', [OrderDraftController::class, 'storeFile'])->whereNumber('draft')->middleware('throttle:uploads');
        Route::delete('/order-drafts/{draft}/files/{file}', [OrderDraftController::class, 'destroyFile'])->whereNumber(['draft', 'file']);
        Route::get('/order-files/{file}', [OrderFileController::class, 'show'])->whereNumber('file');
        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::post('/notifications/read', [NotificationController::class, 'read']);

        // The admin panel.
        Route::prefix('admin')->name('admin.')->middleware('admin')->group(function () {
            Route::get('/stats', [Admin\OrderController::class, 'stats'])->name('stats');
            Route::apiResource('users', Admin\UserController::class)->whereNumber('user');
            // The order board (before the orders resource, so "board" and "staff" are not read as an order).
            Route::get('/orders/board', [Admin\OrderBoardController::class, 'board'])->name('orders.board');
            Route::get('/orders/staff', [Admin\OrderBoardController::class, 'staff'])->name('orders.staff');
            Route::patch('/orders/{order}/stage', [Admin\OrderBoardController::class, 'stage'])->whereNumber('order')->name('orders.stage');
            Route::post('/orders/{order}/updates', [Admin\OrderBoardController::class, 'post'])->whereNumber('order')->name('orders.updates');
            Route::post('/orders/{order}/files', [Admin\OrderBoardController::class, 'storeFile'])->whereNumber('order')->middleware('throttle:uploads')->name('orders.files');
            Route::delete('/orders/{order}/files/{file}', [Admin\OrderBoardController::class, 'destroyFile'])->whereNumber(['order', 'file'])->name('orders.files.destroy');
            Route::apiResource('orders', Admin\OrderController::class)->whereNumber('order');
            Route::apiResource('projects', Admin\ProjectController::class)->only(['index', 'update', 'destroy'])->whereNumber('project');
            Route::apiResource('partners', Admin\PartnerController::class)->only(['index', 'update', 'destroy'])->whereNumber('partner');
            Route::apiResource('support-messages', Admin\SupportMessageController::class)->only(['index', 'update', 'destroy'])->whereNumber('support_message');
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
