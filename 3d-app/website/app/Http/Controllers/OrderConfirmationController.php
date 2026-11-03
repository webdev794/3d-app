<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\OrderDraft;
use App\Models\Project;
use App\Models\Supplier;
use App\Services\OrderSubmission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\Response;
use ZipArchive;

/**
 * The order confirmation form (client 2026-11-03, images/336 and 338): one page per garment (the 3DEEZI band, ORDER
 * CONFIRMATION FORM, the status badge, order number and version, the team / contact / supplier / delivery / requested
 * date strip, "01 / RUGBY JERSEY", the front and back pictures, the details and size tables, the garment subtotal),
 * then the overall order summary and the approval record. As a printable page (the browser's "Save as PDF") and as an
 * Excel workbook (.xlsx, the same data). The links are signed for 30 minutes, so the app can open them without a
 * sign-in; asking for them needs the customer's own order (or staff).
 */
class OrderConfirmationController extends Controller
{
    /** GET /orders/{order}/confirmation-links: the signed PDF and Excel links. */
    public function links(Request $request, int $order): JsonResponse
    {
        $found = $request->user()->is_admin ? Order::findOrFail($order) : $request->user()->orders()->findOrFail($order);
        // ?share=1: a read-only link to pass on (Share order form): 30 days.
        $until = $request->boolean('share') ? now()->addDays(30) : now()->addMinutes(30);

        return response()->json(['data' => [
            'pdf' => URL::temporarySignedRoute('orders.confirmation', $until, ['order' => $found->id, 'format' => 'pdf']),
            'excel' => URL::temporarySignedRoute('orders.confirmation', $until, ['order' => $found->id, 'format' => 'xlsx']),
            'expires_at' => $until->toIso8601String(),
        ]]);
    }

    /** GET /order-drafts/{draft}/confirmation-links: the same for a draft on the review (DRAFT · AWAITING APPROVAL). */
    public function draftLinks(Request $request, int $draft): JsonResponse
    {
        $found = $request->user()->orderDrafts()->findOrFail($draft);
        $until = $request->boolean('share') ? now()->addDays(30) : now()->addMinutes(30);

        return response()->json(['data' => [
            'pdf' => URL::temporarySignedRoute('orders.draft-confirmation', $until, ['draft' => $found->id, 'format' => 'pdf']),
            'excel' => URL::temporarySignedRoute('orders.draft-confirmation', $until, ['draft' => $found->id, 'format' => 'xlsx']),
            'expires_at' => $until->toIso8601String(),
        ]]);
    }

    /** GET /order-confirmation/{order}.{format} (signed): the form as a printable page or an Excel workbook. */
    public function show(int $order, string $format): Response
    {
        return $this->respond(self::data(Order::findOrFail($order)), $format);
    }

    /** GET /order-draft-confirmation/{draft}.{format} (signed): a draft's form, not yet approved. */
    public function showDraft(int $draft, string $format): Response
    {
        $found = OrderDraft::findOrFail($draft);
        $fields = OrderSubmission::fromDraft($found);
        $order = new Order;
        $order->forceFill(Arr::only($fields, ['contact_name', 'contact_email', 'phone', 'team_name', 'notes']));
        $order->items = is_array($fields['items'] ?? null) ? array_values(array_filter($fields['items'], 'is_array')) : [];
        if (filled($fields['needed_by'] ?? null)) {
            try {
                $order->needed_by = \Illuminate\Support\Carbon::parse($fields['needed_by']);
            } catch (\Throwable) {
                // Not a date: left out.
            }
        }
        $order->shipping_address = isset($fields['delivery']) && is_array($fields['delivery'])
            ? \App\Support\OrderDelivery::text($fields['delivery'], $fields['address'] ?? null) : ($fields['shipping_address'] ?? null);
        $supplier = filled($fields['supplier_id'] ?? null) ? Supplier::find((int) $fields['supplier_id']) : null;
        $data = self::data($order);
        $data['number'] = 'DRAFT-'.$found->id;
        $data['supplier'] = $supplier?->name ?? '3DEEZI';

        return $this->respond($data, $format);
    }

    private function respond(array $data, string $format): Response
    {
        if ($format === 'xlsx') {
            return response(self::xlsx($data), 200, [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition' => 'attachment; filename="'.$data['number'].'-v'.$data['version'].'-confirmation.xlsx"',
            ]);
        }

        // The page's own "Download Excel": the same form as .xlsx, signed until the page's own link ends.
        $route = request()->route();
        $expires = (int) request()->query('expires');
        $excel = $route && $route->getName() && $expires > time()
            ? URL::temporarySignedRoute($route->getName(), \Illuminate\Support\Carbon::createFromTimestamp($expires), ['format' => 'xlsx'] + \Illuminate\Support\Arr::except($route->parameters(), ['format']))
            : null;

        return response()->view('order-confirmation', $data + ['excelUrl' => $excel])->header('X-Robots-Tag', 'noindex');
    }

    /** Everything the form shows, the same for the page and the workbook. */
    public static function data(Order $order): array
    {
        $items = is_array($order->items) && $order->items ? $order->items : [[
            'garment' => $order->design_snapshot['garment'] ?? 'jersey', 'sport' => $order->design_snapshot['sport'] ?? null,
            'project_id' => $order->project_id, 'project_name' => $order->design_snapshot['name'] ?? null, 'sizes' => $order->sizes ?? [],
        ]];
        $projects = Project::whereIn('id', collect($items)->pluck('project_id')->filter()->all())->get(['id', 'name', 'thumbnail', 'design', 'sport', 'garment'])->keyBy('id');
        $garments = [];
        foreach (array_values($items) as $i => $item) {
            $project = isset($item['project_id']) ? $projects->get($item['project_id']) : null;
            $sizes = array_filter(array_map('intval', (array) ($item['sizes'] ?? [])));
            $ordered = [];
            foreach (Order::SIZES as $size) {
                if (isset($sizes[$size])) {
                    $ordered[$size] = $sizes[$size];
                }
            }
            $ordered += $sizes;
            $design = is_array($project?->design) ? $project->design : [];
            $sport = trim((string) ($item['sport'] ?? $project?->sport ?? ''));
            $garment = Order::GARMENTS[$item['garment'] ?? 'other'] ?? ucfirst((string) ($item['garment'] ?? 'Garment'));
            $title = trim(($sport !== '' ? ucwords(str_replace('-', ' ', $sport)).' ' : '').$garment);
            $garments[] = [
                'no' => str_pad((string) ($i + 1), 2, '0', STR_PAD_LEFT),
                'title' => $title,
                'name' => $item['label'] ?? $item['project_name'] ?? $project?->name ?? $title,
                // The design's own front and back renders when it has them (the studio's / AI's), else its saved picture.
                'front' => self::picture(self::isPicture($design['renderFront'] ?? null) ? $design['renderFront'] : $project?->thumbnail),
                'back' => self::isPicture($design['renderBack'] ?? null) ? self::picture($design['renderBack']) : null,
                'details' => array_filter([
                    'Product' => $title,
                    'Design' => $item['project_name'] ?? $project?->name,
                    'Fabric' => $design['fabric'] ?? null,
                    'Fit' => Order::FITS[$item['fit'] ?? ''] ?? null,
                    'Neck' => isset($design['neck']) && is_string($design['neck']) ? ucwords(str_replace('-', ' ', $design['neck'])) : null,
                    'Sleeve' => isset($design['sleeve']) && is_string($design['sleeve']) ? ucwords(str_replace('-', ' ', $design['sleeve'])) : null,
                    'Colour' => self::colours($design),
                ], fn ($v) => filled($v)),
                'sizes' => $ordered,
                'total' => array_sum($ordered),
                'players' => is_array($item['players'] ?? null) ? $item['players'] : [],
            ];
        }
        $attributes = $order->getAttributes();
        $approvedAt = $attributes['approved_at'] ?? null;

        return [
            'number' => $order->number,
            'version' => (int) ($attributes['version'] ?? 1),
            'status' => $approvedAt ? 'APPROVED' : 'DRAFT · AWAITING APPROVAL',
            'approved' => (bool) $approvedAt,
            'team' => $order->team_name ?: ($order->design_snapshot['name'] ?? '—'),
            'contact' => trim(implode(' · ', array_filter([$order->contact_name, $order->contact_email, $order->phone]))) ?: '—',
            'supplier' => Supplier::madeByOf($order) ?? '3DEEZI',
            'delivery' => $order->shipping_address ?: '—',
            'requested' => $order->needed_by ? $order->needed_by->format('j M Y') : '—',
            'garments' => $garments,
            'total' => array_sum(array_column($garments, 'total')),
            'approved_by' => $attributes['approved_by'] ?? null,
            'approved_at' => $approvedAt ? \Illuminate\Support\Carbon::parse($approvedAt)->format('j M Y, g:i a') : null,
            'notes' => $order->notes,
            'logo' => url('/media/images/brand-wordmark.png'),
        ];
    }

    private static function isPicture(mixed $v): bool
    {
        return is_string($v) && (str_starts_with($v, 'data:image/') || str_starts_with($v, 'http') || str_starts_with($v, '/'));
    }

    /** The design's colours as plain names, as the client's form shows them ("Black / cyan"): main, then accent. */
    public static function colours(array $design): ?string
    {
        $names = [];
        foreach (['main', 'accent', 'secondary'] as $key) {
            $name = self::colourName($design[$key] ?? null);
            if ($name && ! in_array($name, $names, true)) {
                $names[] = $name;
            }
        }
        $names = array_slice($names, 0, 2);
        if (! $names) {
            return null;
        }
        $names[0] = ucfirst($names[0]);

        return implode(' / ', $names);
    }

    /** The nearest simple colour name for a #rrggbb colour. */
    public static function colourName(mixed $hex): ?string
    {
        if (! is_string($hex) || ! preg_match('/^#?([0-9a-f]{6})$/i', trim($hex), $m)) {
            return null;
        }
        [$r, $g, $b] = array_map('hexdec', str_split($m[1], 2));
        $palette = ['black' => [20, 20, 22], 'white' => [245, 245, 245], 'grey' => [128, 128, 128], 'silver' => [192, 192, 192],
            'navy' => [20, 30, 90], 'blue' => [30, 90, 220], 'sky blue' => [110, 180, 240], 'cyan' => [22, 190, 240], 'teal' => [0, 128, 128],
            'green' => [30, 150, 60], 'lime' => [150, 220, 40], 'yellow' => [245, 215, 30], 'gold' => [212, 170, 40], 'orange' => [245, 130, 30],
            'red' => [210, 30, 40], 'maroon' => [120, 20, 35], 'pink' => [240, 120, 180], 'purple' => [110, 50, 160], 'brown' => [120, 75, 40]];
        $best = null;
        $bestD = INF;
        foreach ($palette as $name => [$pr, $pg, $pb]) {
            // Weighted distance (closer to how the eye sees it).
            $d = 2 * ($r - $pr) ** 2 + 4 * ($g - $pg) ** 2 + 3 * ($b - $pb) ** 2;
            if ($d < $bestD) {
                $bestD = $d;
                $best = $name;
            }
        }

        return $best;
    }

    /** A design picture as an <img> source: a data URL as it is, a stored path as a site URL. */
    private static function picture(?string $thumbnail): ?string
    {
        if (blank($thumbnail)) {
            return null;
        }

        return str_starts_with($thumbnail, 'data:') || str_starts_with($thumbnail, 'http') ? $thumbnail : url('/storage/'.ltrim($thumbnail, '/'));
    }

    /** The workbook: one sheet per garment (details, sizes, subtotal), then "Summary" (each garment, the total, the approval). */
    public static function xlsx(array $data): string
    {
        $sheets = [];
        foreach ($data['garments'] as $g) {
            $rows = [
                ['ORDER CONFIRMATION FORM'],
                ['Order no', $data['number'], 'Version', $data['version'], 'Status', $data['status']],
                ['Team', $data['team']], ['Contact', $data['contact']], ['Supplier', $data['supplier']],
                ['Delivery details', $data['delivery']], ['Requested date', $data['requested']],
                [],
                [$g['no'].' / '.strtoupper($g['title'])],
            ];
            foreach ($g['details'] as $k => $v) {
                $rows[] = [$k, $v];
            }
            $rows[] = [];
            $rows[] = array_merge(['Size'], array_keys($g['sizes']), ['Total']);
            $rows[] = array_merge(['Quantity'], array_values($g['sizes']), [$g['total']]);
            if ($g['players']) {
                $rows[] = [];
                $rows[] = ['Name', 'Number', 'Size'];
                foreach ($g['players'] as $p) {
                    $rows[] = [$p['name'] ?? '', $p['number'] ?? '', $p['size'] ?? ''];
                }
            }
            $rows[] = [];
            $rows[] = ['Garment subtotal', $g['total']];
            $sheets[] = [substr($g['no'].' '.preg_replace('/[^A-Za-z0-9 ]/', '', $g['title']), 0, 31), $rows];
        }
        $summary = [['OVERALL ORDER SUMMARY'], ['Order no', $data['number'], 'Version', $data['version']], [], ['#', 'Garment', 'Design', 'Pieces']];
        foreach ($data['garments'] as $g) {
            $summary[] = [$g['no'], $g['title'], $g['name'], $g['total']];
        }
        $summary[] = ['', 'TOTAL', '', $data['total']];
        $summary[] = [];
        $summary[] = ['APPROVAL RECORD'];
        $summary[] = ['Status', $data['status']];
        $summary[] = ['Approved by', $data['approved_by'] ?? '—'];
        $summary[] = ['Approved at', $data['approved_at'] ?? '—'];
        $sheets[] = ['Summary', $summary];

        return self::workbook($sheets);
    }

    /** A minimal .xlsx (inline strings, no styles) from [name, rows] pairs, built with ZipArchive. */
    private static function workbook(array $sheets): string
    {
        $esc = fn ($v) => htmlspecialchars((string) $v, ENT_XML1 | ENT_QUOTES, 'UTF-8');
        $col = function (int $i): string {
            $s = '';
            for ($i++; $i > 0; $i = intdiv($i - 1, 26)) {
                $s = chr(65 + ($i - 1) % 26).$s;
            }

            return $s;
        };
        $tmp = tempnam(sys_get_temp_dir(), 'xlsx');
        $zip = new ZipArchive;
        $zip->open($tmp, ZipArchive::OVERWRITE);
        $types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
        $wbSheets = $wbRels = '';
        foreach ($sheets as $n => [$name, $rows]) {
            $k = $n + 1;
            $types .= '<Override PartName="/xl/worksheets/sheet'.$k.'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
            $wbSheets .= '<sheet name="'.$esc($name ?: 'Sheet'.$k).'" sheetId="'.$k.'" r:id="rId'.$k.'"/>';
            $wbRels .= '<Relationship Id="rId'.$k.'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'.$k.'.xml"/>';
            $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
            foreach ($rows as $r => $cells) {
                $xml .= '<row r="'.($r + 1).'">';
                foreach (array_values($cells) as $c => $v) {
                    $ref = $col($c).($r + 1);
                    $xml .= is_int($v) || is_float($v) ? '<c r="'.$ref.'"><v>'.$v.'</v></c>' : '<c r="'.$ref.'" t="inlineStr"><is><t xml:space="preserve">'.$esc($v).'</t></is></c>';
                }
                $xml .= '</row>';
            }
            $zip->addFromString('xl/worksheets/sheet'.$k.'.xml', $xml.'</sheetData></worksheet>');
        }
        $zip->addFromString('[Content_Types].xml', $types.'</Types>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
        $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'.$wbSheets.'</sheets></workbook>');
        $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'.$wbRels.'</Relationships>');
        $zip->close();
        $bytes = (string) file_get_contents($tmp);
        @unlink($tmp);

        return $bytes;
    }
}
