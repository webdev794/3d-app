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
use App\Http\Controllers\PresetController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\SupportMessageController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\TeamRequestController;
use App\Http\Middleware\EnsureTeamStaff;
use App\Services\OpenAiDesigner;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->middleware('throttle:api')->group(function () {
    // Preset designs (task 9.148): the 3DEEZI presets; the own ones and saving are under auth below.
    Route::get('/presets', [PresetController::class, 'index']);
    Route::get('/catalog', fn () => response()->json(['data' => array_merge(
        config('catalog'),
        OpenAiDesigner::enabled()
            ? ['provider' => OpenAiDesigner::provider(), 'showcase_scenes' => array_keys(OpenAiDesigner::SCENES)]
            : ['showcase_scenes' => []],
    )]));
    Route::get('/convert/formats', [ConvertController::class, 'formats']);
    Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:auth');
    Route::post('/partners/apply', [PartnerApplicationController::class, 'store'])->middleware('throttle:auth');
    // Preferred suppliers (task 9.118): the page's list with the listing prices, and their logos (public).
    Route::get('/suppliers', [SupplierController::class, 'index']);
    Route::get('/suppliers/{supplier}/logo', [SupplierController::class, 'logo'])->whereNumber('supplier');
    // The Support page's contact form (/support): open to visitors; saved for Admin > Support and emailed to the team.
    Route::post('/support', [SupportMessageController::class, 'store'])->middleware('throttle:auth');
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:auth');
    // "Forgot password?": a 6-digit code by email, then sign in with it or set a new password (LoginCodeController).
    Route::post('/auth/code', [\App\Http\Controllers\LoginCodeController::class, 'send'])->middleware('throttle:auth');
    Route::post('/auth/code/login', [\App\Http\Controllers\LoginCodeController::class, 'login'])->middleware('throttle:auth');
    Route::post('/auth/code/reset', [\App\Http\Controllers\LoginCodeController::class, 'reset'])->middleware('throttle:auth');
    // 3DEEZI ASSIST, the help chat on every page: open to visitors too.
    Route::post('/assist', [AssistController::class, 'chat'])->middleware('throttle:assist');
    // 3DEEZI Orders: the order forms' choices, and "Help me add sizes" (open to visitors, who fill the form before signing in).
    Route::get('/orders/options', [OrderController::class, 'options']);
    Route::post('/orders/assist', [OrderController::class, 'assist'])->middleware('throttle:assist');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::get('/presets/mine', [PresetController::class, 'mine']);
        Route::post('/presets', [PresetController::class, 'store'])->middleware('throttle:uploads');
        Route::patch('/presets/{preset}', [PresetController::class, 'update'])->whereNumber('preset');
        Route::delete('/presets/{preset}', [PresetController::class, 'destroy'])->whereNumber('preset');
        Route::patch('/auth/me', [AuthController::class, 'update'])->middleware('throttle:auth');
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
        // See it on a player (9.128 C): the kit on a photoreal athlete; saved to Assets only on request.
        Route::post('/ai/player', [\App\Http\Controllers\PlayerShotController::class, 'make'])->middleware('throttle:concepts');
        Route::post('/ai/player/save', [\App\Http\Controllers\PlayerShotController::class, 'save'])->middleware('throttle:uploads');
        Route::post('/ai/mockup', [AiController::class, 'mockup'])->middleware('throttle:concepts');
        // The Studio's Mockup: studio product photos of the design (one view per call), and Save to my assets.
        Route::post('/ai/product-mockup', [\App\Http\Controllers\MockupController::class, 'generate'])->middleware('throttle:concepts');
        Route::post('/ai/product-mockup/save', [\App\Http\Controllers\MockupController::class, 'save'])->middleware('throttle:uploads');
        // The AI designer's results: four ranked directions, then one render each (PRIMARY HD, options medium).
        Route::post('/ai/designs', [AiController::class, 'designs'])->middleware('throttle:concepts');
        Route::post('/ai/designs/render', [AiController::class, 'renderDesign'])->middleware('throttle:concepts');
        Route::post('/ai/print-sheet', [AiController::class, 'printSheet'])->middleware('throttle:concepts');
        Route::post('/ai/designs/read', [AiController::class, 'readDesign'])->middleware('throttle:concepts');
        Route::post('/ai/edit', [AiController::class, 'edit'])->middleware('throttle:concepts');
        Route::post('/ai/image-edit', [AiController::class, 'imageEdit'])->middleware('throttle:concepts');
        Route::post('/ai/convert', [AiController::class, 'convert'])->middleware('throttle:concepts');
        // Recent designs on the AI Designer page: each brief with its four designs, reopened with no new AI call.
        Route::get('/ai/sessions', [\App\Http\Controllers\AiSessionController::class, 'index']);
        Route::post('/ai/sessions', [\App\Http\Controllers\AiSessionController::class, 'store'])->middleware('throttle:uploads');
        Route::get('/ai/sessions/{session}', [\App\Http\Controllers\AiSessionController::class, 'show'])->whereNumber('session');
        Route::put('/ai/sessions/{session}', [\App\Http\Controllers\AiSessionController::class, 'update'])->whereNumber('session')->middleware('throttle:uploads');
        Route::delete('/ai/sessions/{session}', [\App\Http\Controllers\AiSessionController::class, 'destroy'])->whereNumber('session');
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
        // 3DEEZI AI reads the draft's order forms (once per file; called on Review).
        Route::post('/order-drafts/{draft}/read', \App\Http\Controllers\OrderFormReadController::class)->whereNumber('draft')->middleware('throttle:concepts');
        Route::get('/order-drafts/{draft}/files', [OrderDraftController::class, 'files'])->whereNumber('draft');
        Route::post('/order-drafts/{draft}/files', [OrderDraftController::class, 'storeFile'])->whereNumber('draft')->middleware('throttle:uploads');
        Route::delete('/order-drafts/{draft}/files/{file}', [OrderDraftController::class, 'destroyFile'])->whereNumber(['draft', 'file']);
        Route::get('/order-files/{file}', [OrderFileController::class, 'show'])->whereNumber('file');
        // Become a preferred supplier: apply (with the logo and plan), my listing, pay for another month or year.
        Route::post('/suppliers/apply', [SupplierController::class, 'apply'])->middleware('throttle:uploads');
        Route::get('/suppliers/mine', [SupplierController::class, 'mine']);
        Route::post('/suppliers/mine/renew', [SupplierController::class, 'renew'])->middleware('throttle:payments');
        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::post('/notifications/read', [NotificationController::class, 'read']);

        // 3DEEZI TEAM, the human designer service (team-api.md): customers' requests, then the designers' and admins' API.
        Route::get('/team/allowance', [TeamRequestController::class, 'allowance']);
        Route::get('/team/requests', [TeamRequestController::class, 'index']);
        Route::post('/team/requests', [TeamRequestController::class, 'store'])->middleware('throttle:uploads');
        Route::get('/team/requests/{id}', [TeamRequestController::class, 'show'])->whereNumber('id');
        Route::post('/team/requests/{id}/messages', [TeamRequestController::class, 'message'])->whereNumber('id')->middleware('throttle:uploads');
        Route::post('/team/requests/{id}/approve', [TeamRequestController::class, 'approve'])->whereNumber('id');
        Route::post('/team/requests/{id}/revisions', [TeamRequestController::class, 'revise'])->whereNumber('id')->middleware('throttle:uploads');
        Route::post('/team/requests/{id}/cancel', [TeamRequestController::class, 'cancel'])->whereNumber('id');
        Route::post('/team/requests/{id}/to-studio', [TeamRequestController::class, 'toStudio'])->whereNumber('id');
        Route::post('/team/requests/{id}/order-draft', [TeamRequestController::class, 'orderDraft'])->whereNumber('id');
        Route::get('/team/files/{file}', [TeamRequestController::class, 'file'])->whereNumber('file')->name('team.files');
        Route::prefix('team-admin')->name('team-admin.')->middleware(EnsureTeamStaff::class)->group(function () {
            Route::get('/requests', [Admin\TeamAdminController::class, 'index'])->name('requests');
            Route::get('/board', [Admin\TeamAdminController::class, 'board'])->name('board');
            Route::get('/designers', [Admin\TeamAdminController::class, 'designers'])->name('designers');
            Route::get('/requests/{id}', [Admin\TeamAdminController::class, 'show'])->whereNumber('id')->name('show');
            Route::patch('/requests/{id}', [Admin\TeamAdminController::class, 'update'])->whereNumber('id')->name('update');
            Route::patch('/requests/{id}/assign', [Admin\TeamAdminController::class, 'assign'])->whereNumber('id')->name('assign');
            Route::patch('/requests/{id}/status', [Admin\TeamAdminController::class, 'status'])->whereNumber('id')->name('status');
            Route::post('/requests/{id}/deliveries', [Admin\TeamAdminController::class, 'deliver'])->whereNumber('id')->middleware('throttle:uploads')->name('deliveries');
            Route::post('/requests/{id}/messages', [Admin\TeamAdminController::class, 'message'])->whereNumber('id')->middleware('throttle:uploads')->name('messages');
            Route::post('/requests/{id}/files', [Admin\TeamAdminController::class, 'storeFiles'])->whereNumber('id')->middleware('throttle:uploads')->name('files');
            Route::delete('/requests/{id}/files/{file}', [Admin\TeamAdminController::class, 'destroyFile'])->whereNumber(['id', 'file'])->name('files.destroy');
            Route::get('/allowances', [Admin\TeamAdminController::class, 'allowances'])->name('allowances');
            Route::post('/requests/{id}/free-revision', [Admin\TeamAdminController::class, 'freeRevision'])->whereNumber('id')->name('free-revision');
            Route::patch('/requests/{id}/refund', [Admin\TeamAdminController::class, 'refund'])->whereNumber('id')->name('refund');
            Route::put('/allowances/plans', [Admin\TeamAdminController::class, 'updatePlans'])->name('allowances.plans');
            Route::get('/allowances/users', [Admin\TeamAdminController::class, 'allowanceUsers'])->name('allowances.users');
            Route::put('/allowances/users/{user}', [Admin\TeamAdminController::class, 'updateAllowance'])->whereNumber('user')->name('allowances.user');
        });

        // The admin panel.
        Route::prefix('admin')->name('admin.')->middleware('admin')->group(function () {
            Route::get('/stats', [Admin\OrderController::class, 'stats'])->name('stats');
            // Users › "Remove test accounts": the preview, then the removal (confirm: true).
            Route::get('/users/test-accounts', [Admin\UserController::class, 'testAccounts'])->name('users.test-accounts');
            Route::post('/users/test-accounts/remove', [Admin\UserController::class, 'removeTestAccounts'])->name('users.test-accounts.remove');
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
            // Admin > Suppliers and the listing prices (Admin > Pricing).
            Route::get('/suppliers/prices', [Admin\SupplierAdminController::class, 'prices'])->name('suppliers.prices');
            Route::put('/suppliers/prices', [Admin\SupplierAdminController::class, 'prices'])->name('suppliers.prices.update');
            Route::get('/suppliers', [Admin\SupplierAdminController::class, 'index'])->name('suppliers');
            Route::post('/suppliers', [Admin\SupplierAdminController::class, 'store'])->name('suppliers.store');
            Route::patch('/suppliers/{supplier}', [Admin\SupplierAdminController::class, 'update'])->whereNumber('supplier')->name('suppliers.update');
            Route::post('/suppliers/{supplier}/logo', [Admin\SupplierAdminController::class, 'uploadLogo'])->whereNumber('supplier')->name('suppliers.logo');
            Route::delete('/suppliers/{supplier}/logo', [Admin\SupplierAdminController::class, 'deleteLogo'])->whereNumber('supplier')->name('suppliers.logo.delete');
            Route::delete('/suppliers/{supplier}', [Admin\SupplierAdminController::class, 'destroy'])->whereNumber('supplier')->name('suppliers.destroy');
            // Admin > Presets (task 9.148): the 3DEEZI presets.
            Route::get('/presets', [Admin\PresetAdminController::class, 'index'])->name('presets');
            Route::post('/presets/order', [Admin\PresetAdminController::class, 'reorder'])->name('presets.order');
            Route::patch('/presets/{preset}', [Admin\PresetAdminController::class, 'update'])->whereNumber('preset')->name('presets.update');
            Route::delete('/presets/{preset}', [Admin\PresetAdminController::class, 'destroy'])->whereNumber('preset')->name('presets.destroy');
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
