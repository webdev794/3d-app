<?php

namespace App\Services\Pdf;

use App\Models\OrderAssist;
use App\Models\Supplier;
use App\Services\OrderAnalysis;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * The Order Assistant's branded PDF order form (task TL-3; as the client's "Strickland_Reunion_2027_Order_Form.pdf"):
 * a cover with the totals, the table by design / colour and the overall size breakdown; one page per design with its
 * picture, its counts and its Kids / Womens / Mens size tables; then the check list. 3DEEZI branding, or the maker's
 * (Made by) name and logo. No names of people: those stay in the Excel's Orders tab.
 */
final class OrderAssistPdf
{
    private const LEFT = 40;

    private const RIGHT = PdfDocument::WIDTH - 40;

    private const INK = '#111827';

    private const MUTED = '#6b7280';

    private const TEAL = '#0ea5b7';

    private const DARK = '#0b0f14';

    private const WARN = '#b45309';

    private PdfDocument $pdf;

    private array $a;

    private float $y = 0;

    /** @var array{bytes:string}|null */
    private ?array $logo = null;

    private string $brand;

    public function __construct(private OrderAssist $assist)
    {
        $this->a = $assist->analysis ?? [];
        $this->brand = $assist->brandName();
        $this->pdf = new PdfDocument($assist->displayTitle().' – Order Form', $this->brand);
        $this->logo = $this->brandLogo();
    }

    public function render(): string
    {
        $this->cover();
        foreach ($this->a['groups'] ?? [] as $g) {
            $this->groupPage($g);
        }
        $this->checkPage();
        $this->footers();

        return $this->pdf->output();
    }

    /* ------------------------------------------------------------------------------------------------ pages */

    private function cover(): void
    {
        $pdf = $this->pdf;
        $pdf->addPage();
        $t = $this->a['totals'] ?? [];
        // The header band: dark, the logo on the left, the title and the maker's line.
        $pdf->rect(self::LEFT, 40, self::RIGHT - self::LEFT, 92, self::DARK);
        $x = self::LEFT + 16;
        if ($this->logo && ($info = PdfDocument::imageInfo($this->logo['bytes']))) {
            $scale = min(150 / max(1, $info['w']), 56 / max(1, $info['h']));
            if ($pdf->image($this->logo['bytes'], $x, 58, $info['w'] * $scale, $info['h'] * $scale)) {
                $x += $info['w'] * $scale + 18;
            }
        }
        $title = $this->assist->displayTitle();
        $size = 20;
        while ($size > 12 && $pdf->width($title, $size, true) > self::RIGHT - $x - 16) {
            $size--;
        }
        $pdf->text($x, 82, $title, $size, true, '#ffffff');
        $pdf->text($x, 102, 'Order Form & Production Breakdown', 10, false, '#5eead4');
        $pdf->rect(self::LEFT, 132, self::RIGHT - self::LEFT, 16, self::TEAL);
        $pdf->text(self::RIGHT - 10, 143.5, mb_strtoupper('Made by '.$this->brand), 7.5, true, '#ffffff', 'right');

        // The totals: all garments, each garment / collection, and the lines to check.
        $tiles = [['TOTAL GARMENTS', (string) ($t['garments'] ?? 0), self::DARK]];
        foreach (array_slice($t['by_product'] ?? [], 0, 3, true) as $name => $n) {
            $tiles[] = [mb_strtoupper(OrderAnalysis::pluralName(preg_replace('/^Line Uniform /i', 'Line ', $name) ?? $name)), (string) $n, self::DARK];
        }
        $tiles[] = ['TO CHECK', (string) ($t['to_check'] ?? 0), self::WARN];
        $w = (self::RIGHT - self::LEFT) / count($tiles);
        foreach ($tiles as $i => [$label, $value, $fill]) {
            $tx = self::LEFT + $i * $w;
            $pdf->rect($tx, 160, $w, 56, $fill);
            $pdf->text($tx + $w / 2, 176, $label, 6.5, true, $fill === self::WARN ? '#ffffff' : '#5eead4', 'center');
            $pdf->text($tx + $w / 2, 205, $value, 20, true, '#ffffff', 'center');
        }
        $this->y = 240;

        // By design / colour: a column per garment (each sport's model on its own: "Football jersey"), then the total.
        $byColumn = $t['by_column'] ?? $t['by_garment'] ?? [];
        $garments = array_keys($byColumn);
        $this->heading('By design / colour');
        $cols = [...array_map(fn ($g) => $t['columns'][$g] ?? OrderAnalysis::PRODUCT_NAMES[$g] ?? ucfirst($g), $garments), 'Total', 'Page'];
        $first = 210;
        $cw = (self::RIGHT - self::LEFT - $first) / count($cols);
        $this->row(['Design – colour', ...$cols], $first, $cw, self::DARK, '#ffffff', true);
        foreach ($this->a['groups'] ?? [] as $i => $g) {
            $counts = [];
            foreach ($garments as $garment) {
                $n = array_sum(array_map(fn ($r) => ($r['column'] ?? $r['garment']) === $garment ? $r['total'] : 0, $g['garments']));
                $counts[] = $n ?: '·';
            }
            $colour = $g['colour'] ?? '#2f6fd6';
            $this->row([$g['design'], ...$counts, $g['total'], 'p. '.($i + 2)], $first, $cw, self::tint($colour, .82), self::INK, false, $colour);
        }
        $this->row(['GRAND TOTAL', ...array_map(fn ($g) => $byColumn[$g], $garments), $t['garments'] ?? 0, ''], $first, $cw, self::DARK, '#ffffff', true);
        $this->y += 14;

        // The overall size breakdown (all groups), one table per size set.
        $this->heading('Overall size breakdown (all groups)');
        $byName = [];
        foreach ($this->a['groups'] ?? [] as $g) {
            foreach ($g['garments'] as $r) {
                foreach ($r['sizes'] as $fit => $sizes) {
                    foreach ($sizes as $s => $n) {
                        $byName[$r['name']][$fit][$s] = ($byName[$r['name']][$fit][$s] ?? 0) + $n;
                    }
                }
                $byName[$r['name']]['unsure'] = ($byName[$r['name']]['unsure'] ?? 0) + $r['unsure'];
            }
        }
        $this->sizeTables(array_map(fn ($name) => ['name' => $name, 'sizes' => $byName[$name]], array_keys($byName)));
        $unsure = array_sum(array_column($byName, 'unsure'));
        $sizeChecks = count(array_filter($this->a['checks'] ?? [], fn ($c) => $c['type'] === 'size'));
        if ($sizeChecks) {
            $this->y += 4;
            $pdf->text(self::LEFT, $this->y, sprintf('Sizes to check (see the check list): %d%s', $sizeChecks, $unsure ? sprintf(' · %d garments with no size', $unsure) : ''), 8, false, self::WARN);
            $this->y += 12;
        }
        $unused = array_filter($this->a['designs'] ?? [], fn ($d) => ! $d['used']);
        if ($unused) {
            $pdf->text(self::LEFT, $this->y, 'Designs with no orders on this form: '.implode(', ', array_map(fn ($d) => pathinfo($d['name'], PATHINFO_FILENAME), $unused)).'.', 8, false, self::MUTED);
        }
    }

    private function groupPage(array $g): void
    {
        $pdf = $this->pdf;
        $pdf->addPage();
        $colour = $g['colour'] ?? '#2f6fd6';
        $ink = self::readableOn($colour);
        $pdf->rect(self::LEFT, 40, self::RIGHT - self::LEFT, 48, $colour);
        $pdf->rect(self::LEFT, 88, self::RIGHT - self::LEFT, 3, self::DARK);
        $pdf->text(self::LEFT + 14, 70, mb_strtoupper($g['design']), 16, true, $ink);
        if ($this->logo && ($info = PdfDocument::imageInfo($this->logo['bytes']))) {
            $scale = min(90 / max(1, $info['w']), 30 / max(1, $info['h']));
            $pdf->rect(self::RIGHT - 14 - $info['w'] * $scale - 8, 49, $info['w'] * $scale + 16, 30, self::DARK, null, 4);
            $pdf->image($this->logo['bytes'], self::RIGHT - 14 - $info['w'] * $scale, 49 + (30 - $info['h'] * $scale) / 2, $info['w'] * $scale, $info['h'] * $scale);
        }
        // The design picture on the left, the counts on the right.
        $boxW = 290;
        $boxH = 300;
        $pdf->rect(self::LEFT, 104, $boxW, $boxH, '#f3f4f6');
        $picture = $g['image'] ? $this->designBytes($g['image']) : null;
        $drawn = false;
        if ($picture && ($info = PdfDocument::imageInfo($picture))) {
            $scale = min(($boxW - 20) / max(1, $info['w']), ($boxH - 20) / max(1, $info['h']));
            $w = $info['w'] * $scale;
            $h = $info['h'] * $scale;
            $drawn = $pdf->image($picture, self::LEFT + ($boxW - $w) / 2, 104 + ($boxH - $h) / 2, $w, $h);
        }
        if (! $drawn) {
            $pdf->text(self::LEFT + $boxW / 2, 250, $g['design'], 14, true, $colour === '#e9eef2' ? self::INK : $colour, 'center');
            $pdf->text(self::LEFT + $boxW / 2, 268, 'Add the design picture to show it here', 8, false, self::MUTED, 'center');
        }
        $tiles = [];
        foreach ($g['garments'] as $r) {
            $tiles[] = [mb_strtoupper(OrderAnalysis::pluralName($r['name'])), (string) $r['total'], self::DARK];
        }
        if (count($g['garments']) > 1) {
            $tiles[] = ['TOTAL GARMENTS', (string) $g['total'], '#2b2f36'];
        }
        $tiles[] = ['ORDER LINES', (string) $g['lines'], self::DARK];
        $tiles[] = ['LINES TO CHECK', (string) $g['check_lines'], $g['check_lines'] ? self::WARN : '#2b2f36'];
        $tiles = array_slice($tiles, 0, 6);
        $tx = self::LEFT + $boxW + 14;
        $tw = self::RIGHT - $tx;
        $th = min(54, ($boxH - 6 * (count($tiles) - 1)) / count($tiles));
        foreach ($tiles as $i => [$label, $value, $fill]) {
            $ty = 104 + $i * ($th + 6);
            $pdf->rect($tx, $ty, 10, $th, $colour);
            $pdf->rect($tx + 10, $ty, $tw - 10, $th, $fill);
            $pdf->text($tx + 10 + ($tw - 10) / 2, $ty + 15, $label, 6.5, true, $fill === self::WARN ? '#ffffff' : '#5eead4', 'center');
            $pdf->text($tx + 10 + ($tw - 10) / 2, $ty + $th - 12, $value, 18, true, '#ffffff', 'center');
        }
        $this->y = 104 + $boxH + 26;
        $this->heading('Size breakdown');
        $this->sizeTables(array_map(fn ($r) => ['name' => $r['name'], 'sizes' => $r['sizes'] + ['unsure' => $r['unsure']]], $g['garments']));
    }

    private function checkPage(): void
    {
        $checks = $this->a['checks'] ?? [];
        $pdf = $this->pdf;
        $pdf->addPage();
        $this->y = 60;
        $pdf->text(self::LEFT, $this->y, 'Check list', 18, true, self::INK);
        $this->y += 10;
        $pdf->rect(self::LEFT, $this->y, self::RIGHT - self::LEFT, 2, self::TEAL);
        $this->y += 22;
        if (! $checks) {
            $pdf->text(self::LEFT, $this->y, 'Nothing to check: every line was read.', 10, false, self::MUTED);

            return;
        }
        foreach ($checks as $c) {
            $lines = $pdf->wrap($c['text'], self::RIGHT - self::LEFT - 22, 9.5);
            if ($this->y + 13 * count($lines) > PdfDocument::HEIGHT - 60) {
                $pdf->addPage();
                $this->y = 60;
            }
            $pdf->rect(self::LEFT, $this->y - 8, 8, 8, ($c['counts'] ?? true) ? self::WARN : self::TEAL, null, 4);
            foreach ($lines as $l) {
                $pdf->text(self::LEFT + 16, $this->y, $l, 9.5, false, self::INK);
                $this->y += 13;
            }
            // The people behind a check (double orders, different sizes), a short list.
            foreach (array_slice($c['people'] ?? [], 0, 30) as $p) {
                if ($this->y > PdfDocument::HEIGHT - 60) {
                    $pdf->addPage();
                    $this->y = 60;
                }
                $pdf->text(self::LEFT + 28, $this->y, '– '.$p, 8.5, false, self::MUTED);
                $this->y += 11;
            }
            $this->y += 6;
        }
    }

    private function footers(): void
    {
        $pdf = $this->pdf;
        $count = $pdf->pageCount();
        for ($i = 0; $i < $count; $i++) {
            $pdf->usePage($i);
            $pdf->text(self::RIGHT, 24, $this->assist->displayTitle().' · Order Form', 7.5, false, self::MUTED, 'right');
            $pdf->line(self::LEFT, PdfDocument::HEIGHT - 34, self::RIGHT, PdfDocument::HEIGHT - 34, '#e5e7eb');
            $pdf->text(self::LEFT, PdfDocument::HEIGHT - 22, 'Made by '.$this->brand.($this->brand === '3DEEZI' ? ' · AI Sportswear Designer · 3deezi.com' : ''), 7.5, false, self::MUTED);
            $pdf->text(self::RIGHT, PdfDocument::HEIGHT - 22, sprintf('Page %d of %d', $i + 1, $count), 7.5, false, self::MUTED, 'right');
        }
    }

    /* ------------------------------------------------------------------------------------------------ parts */

    private function heading(string $text): void
    {
        $this->pdf->text(self::LEFT, $this->y, $text, 12, true, self::INK);
        $this->y += 6;
    }

    /** One table row: the first cell $first wide, the rest $cw each; a coloured name cell when $swatch is given. */
    private function row(array $cells, float $first, float $cw, string $fill, string $ink, bool $bold = false, ?string $swatch = null): void
    {
        $pdf = $this->pdf;
        $h = 17;
        $pdf->rect(self::LEFT, $this->y, self::RIGHT - self::LEFT, $h, $fill, '#ffffff', 0, 0.8);
        if ($swatch) {
            $pdf->rect(self::LEFT, $this->y, $first, $h, $swatch, '#ffffff', 0, 0.8);
        }
        $name = (string) $cells[0];
        while ($pdf->width($name, 9, true) > $first - 10 && mb_strlen($name) > 4) {
            $name = mb_substr($name, 0, -2).'…';
        }
        $pdf->text(self::LEFT + 5, $this->y + 12, $name, 9, true, $swatch ? self::readableOn($swatch) : $ink);
        foreach (array_slice($cells, 1) as $i => $v) {
            // A long garment name ("Jersey (sport not given)") in a smaller type to fit its column, on two lines if need be.
            $v = (string) $v;
            $x = self::LEFT + $first + $cw * ($i + .5);
            $fits = fn (string $s, float $size) => $pdf->width($s, $size, $bold) <= $cw - 4;
            $size = 9;
            while ($size > 6.5 && ! $fits($v, $size)) {
                $size -= .5;
            }
            $cut = mb_strrpos(mb_substr($v, 0, (int) ceil(mb_strlen($v) / 2) + 1), ' ');
            if (! $fits($v, $size) && $cut !== false) {
                [$top, $bottom] = [mb_substr($v, 0, $cut), mb_substr($v, $cut + 1)];
                $size = 7;
                while ($size > 5 && (! $fits($top, $size) || ! $fits($bottom, $size))) {
                    $size -= .5;
                }
                $pdf->text($x, $this->y + 7.5, $top, $size, $bold, $ink, 'center');
                $pdf->text($x, $this->y + 14.5, $bottom, $size, $bold, $ink, 'center');

                continue;
            }
            $pdf->text($x, $this->y + 12, $v, $size, $bold, $ink, 'center');
        }
        $this->y += $h;
    }

    /**
     * Kids, Womens and Mens tables (the size columns the order uses), a row per garment; a set nobody ordered in is
     * left out. $rows: [{name, sizes: {youth, womens, mens, unsure}}].
     */
    private function sizeTables(array $rows): void
    {
        $columns = $this->a['size_columns'] ?? [];
        $pdf = $this->pdf;
        $first = 130;
        foreach (['youth' => 'KIDS', 'womens' => 'WOMEN', 'mens' => 'MEN'] as $fit => $label) {
            $cols = $columns[$fit] ?? [];
            $used = array_filter($rows, fn ($r) => array_sum($r['sizes'][$fit] ?? []) > 0);
            if (! $cols || ! $used) {
                continue;
            }
            if ($this->y + 17 * (count($rows) + 1) > PdfDocument::HEIGHT - 50) {
                $pdf->addPage();
                $this->y = 60;
            }
            $cw = (self::RIGHT - self::LEFT - $first) / max(count($cols) + 1, 9);
            $shown = array_map(fn ($s) => $fit === 'womens' ? substr($s, 1).'W' : $s, $cols);
            $this->row([$label, ...$shown, 'Total'], $first, $cw, '#1f2937', '#ffffff', true);
            foreach ($rows as $i => $r) {
                $sizes = $r['sizes'][$fit] ?? [];
                $this->row([$r['name'], ...array_map(fn ($s) => ($sizes[$s] ?? 0) ?: '·', $cols), array_sum($sizes) ?: '·'], $first, $cw, $i % 2 ? '#f9fafb' : '#ffffff', self::INK);
            }
            $this->y += 6;
        }
    }

    /** The maker's logo (Made by), else the 3DEEZI wordmark. */
    private function brandLogo(): ?array
    {
        try {
            $supplier = $this->assist->supplier;
            if ($supplier instanceof Supplier && $supplier->logo && Storage::disk('local')->exists($supplier->logo)) {
                $raw = (string) Storage::disk('local')->get($supplier->logo);
                $bytes = str_starts_with($raw, "PNG") ? self::smallPng($raw, 420) : self::asJpegOrPng($raw);

                return $bytes ? ['bytes' => $bytes] : null;
            }
            $path = public_path('media/images/brand-final.png');

            return is_file($path) ? ['bytes' => self::smallPng((string) file_get_contents($path), 420)] : null;
        } catch (Throwable) {
            return null;
        }
    }

    private function designBytes(string $name): ?string
    {
        foreach ($this->assist->files ?? [] as $f) {
            if (($f['kind'] ?? '') === 'design' && $f['name'] === $name && Storage::disk('local')->exists($f['path'])) {
                return self::asJpegOrPng((string) Storage::disk('local')->get($f['path']), 1000);
            }
        }

        return null;
    }

    /** A picture the PDF can hold: JPEG, or any GD picture (WebP, PNG) made a JPEG at most $max wide on white. */
    public static function asJpegOrPng(string $bytes, int $max = 600): ?string
    {
        if (str_starts_with($bytes, "\xFF\xD8") && (@getimagesizefromstring($bytes)[0] ?? 0) <= $max * 2) {
            return $bytes;
        }
        if (! function_exists('imagecreatefromstring')) {
            return PdfDocument::imageInfo($bytes) ? $bytes : null;
        }
        $img = @imagecreatefromstring($bytes);
        if (! $img) {
            return null;
        }
        $w = imagesx($img);
        $h = imagesy($img);
        $scale = min(1, $max / max(1, $w));
        $out = imagecreatetruecolor(max(1, (int) round($w * $scale)), max(1, (int) round($h * $scale)));
        imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
        imagecopyresampled($out, $img, 0, 0, 0, 0, imagesx($out), imagesy($out), $w, $h);
        ob_start();
        imagejpeg($out, null, 86);
        $jpeg = (string) ob_get_clean();
        imagedestroy($img);
        imagedestroy($out);

        return $jpeg !== '' ? $jpeg : null;
    }

    /** A PNG made at most $max wide, transparency kept (the PDF writer decodes every pixel: small is quick). */
    public static function smallPng(string $bytes, int $max): string
    {
        $img = function_exists('imagecreatefromstring') ? @imagecreatefromstring($bytes) : false;
        if (! $img || imagesx($img) <= $max) {
            return $bytes;
        }
        $w = $max;
        $h = max(1, (int) round(imagesy($img) * $max / imagesx($img)));
        $out = imagecreatetruecolor($w, $h);
        imagealphablending($out, false);
        imagesavealpha($out, true);
        imagefill($out, 0, 0, imagecolorallocatealpha($out, 0, 0, 0, 127));
        imagecopyresampled($out, $img, 0, 0, 0, 0, $w, $h, imagesx($img), imagesy($img));
        ob_start();
        imagepng($out);
        $png = (string) ob_get_clean();
        imagedestroy($img);
        imagedestroy($out);

        return $png !== '' ? $png : $bytes;
    }

    /** $hex mixed with white by $amount (0 none, 1 white). */
    public static function tint(string $hex, float $amount): string
    {
        [$r, $g, $b] = sscanf(ltrim($hex, '#'), '%02x%02x%02x');

        return sprintf('#%02x%02x%02x', (int) round($r + (255 - $r) * $amount), (int) round($g + (255 - $g) * $amount), (int) round($b + (255 - $b) * $amount));
    }

    /** Black or white text, whichever reads on $hex. */
    public static function readableOn(string $hex): string
    {
        [$r, $g, $b] = sscanf(ltrim($hex, '#'), '%02x%02x%02x');

        return (0.299 * $r + 0.587 * $g + 0.114 * $b) > 150 ? '#111111' : '#ffffff';
    }
}
