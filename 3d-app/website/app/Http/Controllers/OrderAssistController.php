<?php

namespace App\Http\Controllers;

use App\Models\OrderAssist;
use App\Models\Supplier;
use App\Services\OrderAnalysis;
use App\Services\OrderAssistantReader;
use App\Services\Pdf\OrderAssistPdf;
use App\Services\OrderAssistXlsx;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * The Order Assistant (task TL-3, client 2026-11-05): the customer sends a message with order sheets, notes, photos
 * and design pictures; the assistant reads them (OrderAssistantReader), answers with the things to check and the
 * order summary, and keeps it all behind a secret token: the share page (/orders/summary/{token}), the branded PDF
 * order form and the editable Excel. Visitors may use it with sheets and typed notes (no AI); photos, PDFs and loose
 * notes are read by 3DEEZI AI for signed-in customers.
 *
 * POST /order-assistant (new) and POST /order-assistant/{token} (more to the same order): message, files[] (the
 * order), designs[] (design pictures), supplier_id (Made by). GET /order-assistant/{token} (+ /pdf, /xlsx,
 * /designs/{n}).
 */
class OrderAssistController extends Controller
{
    public const ORDER_TYPES = ['xlsx', 'xls', 'ods', 'csv', 'tsv', 'txt', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic'];

    public const DESIGN_TYPES = ['png', 'jpg', 'jpeg', 'webp', 'pdf'];

    private const MAX_FILES = 6;

    private const MAX_DESIGNS = 20;

    public function store(Request $request, OrderAssistantReader $reader): JsonResponse
    {
        OrderAssist::ensureTable();
        $assist = new OrderAssist(['user_id' => $request->user('sanctum')?->id, 'messages' => [], 'files' => [], 'analysis' => null]);

        return $this->take($request, $reader, $assist, 201);
    }

    public function append(Request $request, OrderAssistantReader $reader, OrderAssist $assist): JsonResponse
    {
        $user = $request->user('sanctum');
        abort_if($assist->user_id && $assist->user_id !== $user?->id, 403, 'This order belongs to another account.');
        if (! $assist->user_id && $user) {
            $assist->user_id = $user->id;
        }

        return $this->take($request, $reader, $assist, 200);
    }

    public function show(OrderAssist $assist): JsonResponse
    {
        return response()->json(['data' => $this->resource($assist)]);
    }

    /** The signed-in customer's collated orders, newest first. */
    public function index(Request $request): JsonResponse
    {
        OrderAssist::ensureTable();
        $rows = OrderAssist::query()->where('user_id', $request->user()->id)->latest('updated_at')->limit(30)->get();

        return response()->json(['data' => $rows->map(fn (OrderAssist $a) => ['token' => $a->token, 'title' => $a->title,
            'garments' => (int) ($a->analysis['totals']['garments'] ?? 0), 'updated_at' => $a->updated_at?->toIso8601String()])]);
    }

    public function pdf(OrderAssist $assist): Response
    {
        abort_unless($assist->analysis, 404);
        $bytes = (new OrderAssistPdf($assist))->render();

        return response($bytes, 200, ['Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$assist->downloadName().'.pdf"', 'Cache-Control' => 'private, no-store']);
    }

    public function xlsx(OrderAssist $assist): Response
    {
        abort_unless($assist->analysis, 404);
        $bytes = (new OrderAssistXlsx($assist))->render();

        return response($bytes, 200, ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => 'attachment; filename="'.$assist->downloadName().'.xlsx"', 'Cache-Control' => 'private, no-store']);
    }

    /** A design picture the customer added (by its place in the list). */
    public function design(OrderAssist $assist, int $n): Response
    {
        $designs = array_values(array_filter($assist->files ?? [], fn ($f) => ($f['kind'] ?? '') === 'design'));
        $file = $designs[$n] ?? null;
        abort_unless($file && Storage::disk('local')->exists($file['path']), 404);

        return response(Storage::disk('local')->get($file['path']), 200, ['Content-Type' => $file['mime'] ?? 'application/octet-stream', 'Cache-Control' => 'private, max-age=3600']);
    }

    private function take(Request $request, OrderAssistantReader $reader, OrderAssist $assist, int $status): JsonResponse
    {
        $request->validate([
            'message' => ['nullable', 'string', 'max:8000'],
            'files' => ['nullable', 'array', 'max:'.self::MAX_FILES],
            'files.*' => ['file', 'max:25600'],
            'designs' => ['nullable', 'array', 'max:'.self::MAX_DESIGNS],
            'designs.*' => ['file', 'max:15360'],
            'supplier_id' => ['nullable', 'integer'],
            'title' => ['nullable', 'string', 'max:120'],
            'assign' => ['nullable', 'array', 'max:40'],
        ]);
        $orderFiles = (array) $request->file('files', []);
        $designFiles = (array) $request->file('designs', []);
        foreach ($orderFiles as $f) {
            $this->allowed($f, self::ORDER_TYPES, 'Order files can be Excel, CSV, PDF or photos.');
        }
        foreach ($designFiles as $f) {
            $this->allowed($f, self::DESIGN_TYPES, 'Design pictures can be PNG, JPG, WebP or PDF.');
        }
        $message = trim((string) $request->input('message', ''));
        abort_if($message === '' && ! $orderFiles && ! $designFiles && ! $request->has('supplier_id') && ! $request->has('assign'), 422, 'Write your order or add a file first.');
        if ($request->has('supplier_id')) {
            $id = $request->input('supplier_id');
            $assist->supplier_id = $id ? Supplier::query()->listed()->find($id)?->id : null;
        }
        if (! $assist->exists) {
            $assist->save();
        }
        $stored = [];
        foreach ($orderFiles as $f) {
            $stored[] = $this->keep($assist, $f, 'order');
        }
        foreach ($designFiles as $f) {
            $stored[] = $this->keep($assist, $f, 'design');
        }
        $files = array_merge(array_values(array_filter($assist->files ?? [], fn ($old) => ! in_array($old['name'], array_column($stored, 'name'), true))), $stored);
        $newOrder = array_values(array_filter($stored, fn ($f) => $f['kind'] === 'order'));
        // The customer's own choice of group for a picture ("assign[picture name]" = a group key, or "none").
        foreach ((array) $request->input('assign', []) as $name => $group) {
            foreach ($files as &$f) {
                if ($f['kind'] === 'design' && $f['name'] === (string) $name) {
                    $f['group'] = $group === null || $group === '' ? null : mb_substr((string) $group, 0, 80);
                }
            }
            unset($f);
        }
        $designs = array_map(fn ($f) => ['name' => $f['name'], 'colour' => $f['colour'] ?? null, 'group' => $f['group'] ?? null], array_values(array_filter($files, fn ($f) => $f['kind'] === 'design')));

        $read = $reader->read($message, array_map(fn ($f) => ['path' => Storage::disk('local')->path($f['path']), 'extension' => $f['extension'], 'name' => $f['name']], $newOrder),
            $designs, (bool) $request->user('sanctum'), (string) $request->input('title', ''));
        // Earlier lines stay, except those of a file sent again (read afresh).
        $replaced = array_column($newOrder, 'name');
        $kept = array_values(array_filter($assist->analysis['lines'] ?? [], fn ($l) => ! in_array($l['source'] ?? '', $replaced, true)));
        $lines = array_merge($kept, $read['analysis']['lines']);
        $title = trim((string) $request->input('title', '')) ?: ($assist->title ?: $read['analysis']['title']);
        $analysis = OrderAnalysis::analyse($lines, $designs, $title);
        // Notes the reader could not follow stay listed.
        $unread = array_values(array_unique(array_merge($assist->analysis['unread'] ?? [], $read['unread'])));
        $analysis['unread'] = $unread;
        if ($unread) {
            $analysis['checks'][] = ['type' => 'unread', 'text' => 'These parts were not read as orders: '.implode('; ', array_map(fn ($u) => '"'.mb_substr($u, 0, 80).'"', array_slice($unread, 0, 6))).(count($unread) > 6 ? ' and '.(count($unread) - 6).' more' : '').'.', 'lines' => [], 'counts' => false];
        }
        // No design picture yet (user 2026-11-06): the answer said "nothing looks wrong… review and approve", and the
        // order form then stopped at "Add your artwork". Say it first, before the customer goes to approve.
        if (! $designs && ($analysis['totals']['garments'] ?? 0) > 0) {
            array_unshift($analysis['checks'], ['type' => 'artwork', 'text' => 'No design picture yet: add your design or artwork before you review and approve.', 'lines' => [], 'counts' => false]);
        }
        $analysis['sources'] = array_values(array_merge(array_filter($assist->analysis['sources'] ?? [], fn ($s) => ! in_array($s['name'], array_column($read['sources'], 'name'), true)), $read['sources']));

        $messages = $assist->messages ?? [];
        $messages[] = ['role' => 'user', 'text' => $message, 'files' => array_map(fn ($f) => ['name' => $f['name'], 'kind' => $f['kind']], $stored), 'at' => now()->toIso8601String()];
        $messages[] = ['role' => 'assistant', 'text' => self::reply($analysis, $read['sources']), 'at' => now()->toIso8601String()];
        $assist->fill(['title' => mb_substr($title, 0, 120), 'files' => $files, 'analysis' => $analysis, 'messages' => array_slice($messages, -60)]);
        $assist->save();

        return response()->json(['data' => $this->resource($assist->fresh())], $status);
    }

    private function allowed(UploadedFile $f, array $types, string $message): void
    {
        abort_unless(in_array(strtolower($f->getClientOriginalExtension()), $types, true), 422, $message);
    }

    private function keep(OrderAssist $assist, UploadedFile $f, string $kind): array
    {
        $ext = strtolower($f->getClientOriginalExtension());
        $name = mb_substr(preg_replace('/[\x00-\x1F\/\\\\]+/', ' ', $f->getClientOriginalName()) ?? 'file', 0, 120);
        $path = $f->storeAs(OrderAssist::DIR.'/'.$assist->id, Str::random(16).'.'.$ext, 'local');

        // A design picture's main colour, to find its group when its name does not say.
        $colour = $kind === 'design' && $ext !== 'pdf' ? OrderAnalysis::mainColour((string) file_get_contents($f->getRealPath())) : null;

        return ['name' => $name, 'kind' => $kind, 'extension' => $ext, 'path' => $path, 'size' => $f->getSize(), 'mime' => $f->getMimeType(), 'colour' => $colour, 'group' => null];
    }

    /** The assistant's answer: what it read, the things to check, then the summary (as the client's design). */
    public static function reply(array $a, array $sources): string
    {
        $t = $a['totals'];
        if ($t['garments'] === 0) {
            if (in_array('sign_in', array_column($sources, 'how'), true)) {
                return 'Sign in and send it again: 3DEEZI AI reads photos, PDFs and notes for signed-in customers. Order sheets (Excel, CSV) and typed orders like “9 polos: 3 × 4XL, 2 × 2XL” work straight away.';
            }

            return 'I couldn’t find garments and sizes yet. Send your order sheet, a photo of your notes, or type it like “9 polos: 3 × 4XL, 2 × 2XL and 4 × 5XL”.';
        }
        $checks = array_values(array_filter($a['checks'], fn ($c) => $c['type'] !== 'spelling'));
        $text = $checks ? "I’ve analysed your order and highlighted a few things to check before production:\n".implode("\n", array_map(fn ($c) => '• '.$c['text'], array_slice($checks, 0, 8)))
            : 'I’ve analysed your order: nothing looks wrong. Check the summary, then review and approve.';

        return $text."\n\n".OrderAnalysis::summaryText($a);
    }

    private function resource(OrderAssist $assist): array
    {
        $designs = array_values(array_filter($assist->files ?? [], fn ($f) => ($f['kind'] ?? '') === 'design'));
        $base = url('/api/v1/order-assistant/'.$assist->token);
        $a = $assist->analysis;

        return [
            'token' => $assist->token,
            'title' => $assist->title,
            'made_by' => ['supplier_id' => $assist->supplier_id, 'name' => $assist->brandName(), 'logo_url' => $assist->supplier?->logoUrl()],
            'messages' => $assist->messages ?? [],
            'analysis' => $a,
            'summary' => $a ? OrderAnalysis::summaryText($a) : '',
            'files' => array_map(fn ($f) => ['name' => $f['name'], 'kind' => $f['kind']], $assist->files ?? []),
            'designs' => array_map(fn ($f, $i) => ['name' => $f['name'], 'url' => $base.'/designs/'.$i] + (collect($a['designs'] ?? [])->firstWhere('name', $f['name']) ?? []), $designs, array_keys($designs)),
            'links' => ['page' => url('/orders/summary/'.$assist->token), 'pdf' => $base.'/pdf', 'xlsx' => $base.'/xlsx'],
            'updated_at' => $assist->updated_at?->toIso8601String(),
        ];
    }
}
