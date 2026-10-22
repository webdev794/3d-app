<?php

namespace App\Http\Controllers;

use App\Models\OrderFile;
use App\Services\OrderFormAi;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * POST /order-drafts/{draft}/read: 3DEEZI AI reads the draft's order forms into a finished order for the customer to
 * check (client 2026-10-22). Called when the customer goes to Review. Each file is read once: the result is kept on the
 * file (meta.suggested, source "ai"; meta.ai = {status, at}) and never asked for again, so viewing the review again
 * costs nothing. When the AI is off or fails, the built-in reading made at upload stays. Answers like GET /order-drafts/{id}.
 */
class OrderFormReadController extends Controller
{
    /** A failed reading may be tried again after this long (a new Review). */
    private const RETRY_AFTER_MINUTES = 10;

    public function __invoke(Request $request, int $draft, OrderFormAi $reader): JsonResponse
    {
        $owned = $request->user()->orderDrafts()->findOrFail($draft);
        if (OrderFormAi::enabled()) {
            @set_time_limit(200);
            foreach ($owned->files()->where('kind', 'order_form')->get() as $file) {
                if (! $this->due($file)) {
                    continue;
                }
                // One reading at a time per file (a double click, two tabs): the second waits and then finds it done.
                $lock = Cache::lock('order-form-ai:'.$file->id, 190);
                try {
                    $lock->block(150);
                    $file->refresh();
                    if ($this->due($file)) {
                        $this->read($file, $reader);
                    }
                } catch (Throwable) {
                    // Still being read elsewhere: the built-in reading is shown meanwhile.
                } finally {
                    $lock->release();
                }
            }
        }

        return app(OrderDraftController::class)->show($request, $draft);
    }

    private function due(OrderFile $file): bool
    {
        $ai = $file->meta['ai'] ?? null;
        if (! is_array($ai)) {
            return true;
        }

        return ($ai['status'] ?? '') === 'failed' && now()->subMinutes(self::RETRY_AFTER_MINUTES)->gt($ai['at'] ?? now());
    }

    private function read(OrderFile $file, OrderFormAi $reader): void
    {
        $result = $reader->readFile($file);
        $meta = is_array($file->meta) ? $file->meta : [];
        if ($result) {
            // The built-in reading is kept beside it, for staff.
            if (isset($meta['suggested']) && ($meta['suggested']['source'] ?? 'reader') !== 'ai') {
                $meta['reader'] = $meta['suggested'];
            }
            $meta['suggested'] = $result;
        }
        $meta['ai'] = ['status' => $result ? 'done' : 'failed', 'at' => now()->toIso8601String(), 'model' => config('services.openai.text_model')];
        $file->meta = $meta;
        $file->save();
    }
}
