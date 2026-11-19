<?php

namespace App\Services\Pdf;

use App\Models\Order;
use App\Models\OrderAssist;
use Illuminate\Support\Facades\Storage;

/**
 * The order form maker's PDF (client 2026-11-13, as the client's ChatGPT "MANTIS_Basketball_Singlet_Order_Form.pdf"):
 * A4 landscape. On every page a dark header bar with the team's brand from the artwork (teal, italic) and "BASKETBALL
 * SINGLET ORDER FORM"; two designs side by side, each with its front and back pictures together, a light grey label bar
 * under it ("01 ■ Tonga – Red") and "53 PCS · Front & Back artwork"; one size table across the page under them (SIZE /
 * QTY / TOTAL, "Quantities shown apply to EACH design on this page"); on the last page the ORDER SUMMARY to the right of
 * the last design (or under the table when the last page has two designs); "Page 1 of 3 | MANTIS" and a small "Made
 * with 3DEEZI" (or the chosen maker) in the footer. Never another brand's logo as ours.
 */
final class DesignOrderPdf
{
    private const L = 28;

    private const TOP = 74;

    private const COLUMN_GAP = 18;

    /** The picture box's height: as tall as the page's pictures need, within these. */
    private const PICTURE_MIN = 190;

    private const PICTURE_MAX = 318;

    /** A design block below its picture box: the label bar and the "53 PCS" line. */
    private const UNDER = 50;

    private const GAP = 14;

    /** The summary band under the last size table (a last page with two designs). */
    private const BAND = 108;

    private const INK = '#111827';

    private const MUTED = '#6b7280';

    private const TEAL = '#14b8a6';

    private const TEAL_DARK = '#0f766e';

    private const DARK = '#0b0f14';

    private const BAR = '#e5e7eb';

    private const WARN = '#b45309';

    private PdfDocument $pdf;

    private array $form;

    private array $checks;

    /** @var array<string, ?string> picture name => bytes the PDF can hold (trimmed), read once */
    private array $bytes = [];

    private float $w;

    private float $h;

    public function __construct(private OrderAssist $assist)
    {
        $this->form = $assist->analysis['form'] ?? [];
        $this->checks = $assist->analysis['checks'] ?? [];
        $this->pdf = (new PdfDocument($assist->displayTitle().' – Order Form', ($this->form['brand'] ?? '') ?: $assist->brandName()))->landscape();
        $this->w = $this->pdf->pageWidth();
        $this->h = $this->pdf->pageHeight();
    }

    private function right(): float
    {
        return $this->w - self::L;
    }

    public function render(): string
    {
        $designs = $this->form['designs'] ?? [];
        $pages = array_chunk($designs, 2) ?: [[]];
        $width = $this->right() - self::L;
        $column = ($width - self::COLUMN_GAP) / 2;
        foreach ($pages as $i => $page) {
            $last = $i === count($pages) - 1;
            $alone = $last && count($page) === 1;
            $this->pdf->addPage();
            $this->header();
            $y = self::TOP;
            if (! $page) {
                $this->pdf->text($this->w / 2, 200, 'No designs yet: add your design pictures.', 12, true, self::MUTED, 'center');
                $this->summary(self::L, 240, $width, self::BAND, true);

                continue;
            }
            // The picture boxes as tall as this page's pictures need; on a last page with two designs, room for the summary.
            $ph = max(self::PICTURE_MIN, min(self::PICTURE_MAX, max(array_map(fn ($d) => $this->neededHeight($d, $column), $page))));
            if ($last && ! $alone) {
                $ph = max(150, min($ph, $this->h - 44 - self::BAND - 12 - $this->tableHeight($page) - self::GAP - self::UNDER - self::TOP));
            }
            foreach ($page as $k => $d) {
                $this->design($d, self::L + $k * ($column + self::COLUMN_GAP), $y, $column, $ph);
            }
            if ($alone) {
                // The last design alone: the ORDER SUMMARY to its right (as the client's example).
                $this->summary(self::L + $column + self::COLUMN_GAP, $y, $column, $ph + self::UNDER - 12, false);
            }
            $y = $this->sizeTable($page, $y + $ph + self::UNDER + self::GAP);
            if ($last && ! $alone) {
                $this->summary(self::L, $y + 8, $width, self::BAND, true);
            }
        }
        $this->footers();

        return $this->pdf->output();
    }

    /* ------------------------------------------------------------------------------------------------ parts */

    private function header(): void
    {
        $pdf = $this->pdf;
        $pdf->rect(0, 0, $this->w, 54, self::DARK);
        $pdf->rect(0, 54, $this->w, 3, self::TEAL);
        $brand = mb_strtoupper($this->form['brand'] ?? '');
        $garment = mb_strtoupper((string) ($this->form['garment'] ?? 'Garment'));
        [$left, $right] = $brand !== '' ? [$brand, $garment.' ORDER FORM'] : [$garment, 'ORDER FORM'];
        $size = 26;
        while ($size > 14 && $pdf->width($left, $size, true) > 360) {
            $size--;
        }
        $pdf->text(self::L, 37, $left, $size, true, self::TEAL, 'left', 0.2);
        $room = $this->right() - self::L - $pdf->width($left, $size, true) - 40;
        $rs = 14;
        while ($rs > 7 && $pdf->width($right, $rs, true) > $room) {
            $rs -= .5;
        }
        $pdf->text($this->right(), 34, $right, $rs, true, '#ffffff', 'right');
    }

    /** The design's pictures in the order shown: front and back together first, then front, back, other (3 at most). */
    private static function shown(array $d): array
    {
        $rank = ['front_back' => 0, 'front' => 1, 'back' => 2, 'other' => 3];
        $pictures = $d['pictures'] ?? [];
        usort($pictures, fn ($a, $b) => ($rank[$a['view']] ?? 3) <=> ($rank[$b['view']] ?? 3));

        return array_slice($pictures, 0, 3);
    }

    /** How tall the design's pictures are when they fill the column's width (the box's height they need). */
    private function neededHeight(array $d, float $w): float
    {
        $pictures = self::shown($d);
        $pw = $w / max(1, count($pictures));
        $need = 0;
        foreach ($pictures as $p) {
            $info = ($b = $this->pictureBytes($p['name'])) ? PdfDocument::imageInfo($b) : null;
            if ($info) {
                $need = max($need, ($pw - 16) / max(1, $info['w']) * $info['h'] + 16);
            }
        }

        return $need ?: self::PICTURE_MIN;
    }

    /** One design: its pictures (front and back side by side), the label bar, then "53 PCS" and what the artwork shows. */
    private function design(array $d, float $x, float $y, float $w, float $ph): void
    {
        $pdf = $this->pdf;
        $pdf->rect($x, $y, $w, $ph, '#ffffff', '#e5e7eb', 6, 0.8);
        $pictures = self::shown($d);
        $drawn = 0;
        $pw = $w / max(1, count($pictures));
        foreach ($pictures as $i => $p) {
            $bytes = $this->pictureBytes($p['name']);
            $info = $bytes ? PdfDocument::imageInfo($bytes) : null;
            if (! $info) {
                continue;
            }
            $scale = min(($pw - 16) / max(1, $info['w']), ($ph - 16) / max(1, $info['h']));
            [$iw, $ih] = [$info['w'] * $scale, $info['h'] * $scale];
            if ($pdf->image($bytes, $x + $i * $pw + ($pw - $iw) / 2, $y + ($ph - $ih) / 2, $iw, $ih)) {
                $drawn++;
                if (count($pictures) > 1 && in_array($p['view'], ['front', 'back'], true)) {
                    $pdf->text($x + $i * $pw + 10, $y + 16, mb_strtoupper($p['view']), 7, true, self::MUTED);
                }
            }
        }
        if (! $drawn) {
            $pdf->text($x + $w / 2, $y + $ph / 2, 'No picture yet', 11, true, self::MUTED, 'center');
        }
        // The label bar (light grey, dark text, as the client's): the number, a swatch of the design's colour, the name.
        $ly = $y + $ph + 6;
        $pdf->rect($x, $ly, $w, 26, self::BAR, null, 3);
        $pdf->text($x + 10, $ly + 17.5, sprintf('%02d', $d['number']), 12.5, true, self::INK);
        $pdf->rect($x + 36, $ly + 7, 12, 12, ($d['colour'] ?? null) ?: '#9ca3af', '#ffffff', 2, 1);
        $label = (string) $d['label'];
        $size = 12.5;
        while ($size > 8 && $pdf->width($label, $size, true) > $w - 66) {
            $size -= .5;
        }
        $pdf->text($x + 56, $ly + 17.5, $label, $size, true, self::INK);
        // "53 PCS" and "Front & Back artwork".
        $py = $ly + 26 + 15;
        $total = (int) ($d['total'] ?? 0);
        $pdf->text($x, $py, $total > 0 ? $total.' PCS' : 'Sizes to add', 12, true, $total > 0 ? self::INK : self::WARN);
        $pdf->text($x + $w, $py, self::artwork($pictures), 9, false, self::MUTED, 'right');
    }

    /** Whether the page's designs share one set of sizes (one QTY row), else a row per design. */
    private static function sameOnPage(array $designs): bool
    {
        return count(array_unique(array_map(fn ($d) => json_encode($d['sizes']), $designs))) === 1;
    }

    private function tableHeight(array $designs): float
    {
        return 20 + 20 * (self::sameOnPage($designs) ? 1 : count($designs)) + 20;
    }

    /**
     * The size table across the page under its designs: one QTY row when they share their sizes ("Quantities shown
     * apply to EACH design on this page"), else a row per design. Returns the y below it.
     */
    private function sizeTable(array $designs, float $y): float
    {
        $pdf = $this->pdf;
        $rank = array_flip(Order::SIZES);
        $sizes = [];
        foreach ($designs as $d) {
            $sizes += $d['sizes'];
        }
        uksort($sizes, fn ($a, $b) => ($rank[$a] ?? 99) <=> ($rank[$b] ?? 99));
        $cols = array_keys($sizes);
        if (! $cols) {
            return $y;
        }
        $same = self::sameOnPage($designs);
        $rows = $same ? [['QTY', $designs[0]['sizes'], $designs[0]['total']]]
            : array_map(fn ($d) => [sprintf('%02d %s', $d['number'], $d['label']), $d['sizes'], $d['total']], $designs);
        $left = self::L;
        $width = $this->right() - $left;
        $first = $same ? 70 : 190;
        $cw = ($width - $first) / (count($cols) + 1);
        $h = 20;
        $font = $cw < 30 ? 8 : 10;
        $pdf->rect($left, $y, $width, $h, self::DARK);
        $pdf->text($left + 10, $y + 13.5, $same ? 'SIZE' : 'DESIGN', 9, true, '#ffffff');
        foreach ([...$cols, 'TOTAL'] as $i => $c) {
            $pdf->text($left + $first + $cw * ($i + .5), $y + 13.5, (string) $c, $font, true, $c === 'TOTAL' ? self::TEAL : '#ffffff', 'center');
        }
        $y += $h;
        foreach ($rows as $r => [$name, $qty, $total]) {
            $pdf->rect($left, $y, $width, $h, $r % 2 ? '#ffffff' : '#f3f4f6', '#e5e7eb', 0, 0.5);
            while ($pdf->width($name, 9, true) > $first - 14 && mb_strlen($name) > 4) {
                $name = mb_substr($name, 0, -2).'…';
            }
            $pdf->text($left + 10, $y + 13.5, $name, 9, true, self::INK);
            foreach ($cols as $i => $c) {
                $pdf->text($left + $first + $cw * ($i + .5), $y + 13.5, (string) ($qty[$c] ?? '·'), $font, false, self::INK, 'center');
            }
            $pdf->text($left + $first + $cw * (count($cols) + .5), $y + 13.5, (string) $total, $font, true, self::TEAL_DARK, 'center');
            $y += $h;
        }
        $note = $same ? (count($designs) > 1 ? 'Quantities shown apply to EACH design on this page.' : sprintf('Quantities for design %02d.', $designs[0]['number'])) : 'Quantities per design.';
        $pdf->text($left, $y + 13, $note, 8.5, false, self::MUTED, 'left', 0.15);

        return $y + 20;
    }

    /**
     * The ORDER SUMMARY: garment, designs, quantity per design, the grand total and what to confirm. Wide: a band under
     * the last size table; else a box to the right of the last design.
     */
    private function summary(float $x, float $y, float $w, float $h, bool $wide): void
    {
        $pdf = $this->pdf;
        $f = $this->form;
        $designs = $f['designs'] ?? [];
        $totals = array_column($designs, 'total');
        $n = count($designs);
        $pdf->rect($x, $y, $w, $h, '#ffffff', '#d1d5db', 6, 0.8);
        $pdf->rect($x, $y, $w, 24, self::DARK);
        $pdf->text($x + 12, $y + 16, 'ORDER SUMMARY', 10.5, true, '#ffffff');
        $perDesign = ! $totals ? '0' : (count(array_unique($totals)) === 1 ? (string) $totals[0] : sprintf('varies (%d to %d)', min($totals), max($totals)));
        $rows = [['Garment type', (string) ($f['garment'] ?? 'Garment')], ['Designs / colourways', (string) $n], ['Quantity per design', $perDesign]];
        $grand = (int) ($f['total'] ?? array_sum($totals)).' PCS';
        $same = ($f['same_sizes'] ?? false) && $n > 1;
        $note = $same ? sprintf('All %d designs use the same size quantities. Confirm artwork and sizes before production.', $n)
            : ($n > 1 ? 'Each design has its own sizes (see the size tables). Confirm artwork and sizes before production.' : 'Confirm artwork and sizes before production.');
        $notes = ($f['notes'] ?? '') !== '' ? 'Notes: '.$f['notes'] : '';
        $fit = function (string $text, float $size, float $room) use ($pdf): string {
            while ($pdf->width($text, $size, true) > $room && mb_strlen($text) > 4) {
                $text = mb_substr($text, 0, -2).'…';
            }

            return $text;
        };
        $ry = $y + ($wide ? 40 : 42);
        $valueX = $x + 140;
        foreach ($rows as [$label, $value]) {
            $pdf->text($x + 12, $ry, $label.':', 9.5, false, self::MUTED);
            $pdf->text($valueX, $ry, $fit($value, 10.5, ($wide ? $w * .55 : $w) - 152), 10.5, true, self::INK);
            $ry += $wide ? 15 : 17;
        }
        if ($wide) {
            $pdf->text($x + $w - 16, $y + 44, 'GRAND TOTAL', 9, true, self::MUTED, 'right');
            $pdf->text($x + $w - 16, $y + 74, $grand, 24, true, self::TEAL_DARK, 'right');
            $lines = [$note];
            if ($notes !== '') {
                $one = $pdf->wrap($notes, $w - 24, 8.5);
                $lines[] = $one[0].(count($one) > 1 ? '…' : '');
            }
            $ry += 2;
        } else {
            $ry += 4;
            $pdf->rect($x + 12, $ry - 4, $w - 24, 46, '#ecfdf5', null, 4);
            $pdf->text($x + 24, $ry + 24, 'GRAND TOTAL:', 12, true, self::INK);
            $pdf->text($x + $w - 24, $ry + 27, $grand, 22, true, self::TEAL_DARK, 'right');
            $ry += 62;
            $lines = [...$pdf->wrap($note, $w - 24, 9), ...($notes !== '' ? $pdf->wrap($notes, $w - 24, 9) : [])];
        }
        foreach ($lines as $line) {
            if ($ry > $y + $h - 6) {
                break;
            }
            $pdf->text($x + 12, $ry, $line, $wide ? 8.5 : 9, false, self::INK);
            $ry += $wide ? 11 : 12;
        }
        // What is still open (sizes to add, a picture on no design), in the box's room.
        foreach ($wide ? [] : array_filter($this->checks, fn ($c) => in_array($c['type'], ['size', 'unused', 'unread', 'artwork'], true)) as $c) {
            foreach ($pdf->wrap('To check: '.$c['text'], $w - 24, 8) as $line) {
                if ($ry > $y + $h - 8) {
                    break 2;
                }
                $pdf->text($x + 12, $ry + 4, $line, 8, false, self::WARN);
                $ry += 10;
            }
        }
    }

    private function footers(): void
    {
        $pdf = $this->pdf;
        $count = $pdf->pageCount();
        $brand = ($this->form['brand'] ?? '') !== '' ? $this->form['brand'] : $this->assist->displayTitle();
        $maker = $this->assist->brandName();
        for ($i = 0; $i < $count; $i++) {
            $pdf->usePage($i);
            $pdf->line(self::L, $this->h - 34, $this->right(), $this->h - 34, '#e5e7eb');
            $pdf->text(self::L, $this->h - 20, sprintf('Page %d of %d | %s', $i + 1, $count, $brand), 8, false, self::MUTED);
            $pdf->text($this->right(), $this->h - 20, $maker === '3DEEZI' ? 'Made with 3DEEZI' : 'Made by '.$maker, 7, false, '#9ca3af', 'right');
        }
    }

    /** "Front & Back artwork", "Front artwork", "Back artwork" or "Artwork". */
    private static function artwork(array $pictures): string
    {
        $views = array_column($pictures, 'view');
        $front = in_array('front', $views, true);
        $back = in_array('back', $views, true);

        return match (true) {
            in_array('front_back', $views, true) || ($front && $back) => 'Front & Back artwork',
            $front => 'Front artwork',
            $back => 'Back artwork',
            default => $pictures ? 'Artwork' : 'Artwork to add',
        };
    }

    /** A design picture as the PDF holds it: its white margins trimmed (the garments as large as they fit), read once. */
    private function pictureBytes(string $name): ?string
    {
        if (array_key_exists($name, $this->bytes)) {
            return $this->bytes[$name];
        }
        foreach ($this->assist->files ?? [] as $f) {
            if (($f['kind'] ?? '') === 'design' && $f['name'] === $name && Storage::disk('local')->exists($f['path'])) {
                return $this->bytes[$name] = OrderAssistPdf::asJpegOrPng(self::trimmed((string) Storage::disk('local')->get($f['path'])), 1400);
            }
        }

        return $this->bytes[$name] = null;
    }

    /** The picture without its plain white (or transparent) margins, a little room kept; as it was when nothing to trim. */
    private static function trimmed(string $bytes): string
    {
        $img = function_exists('imagecropauto') ? @imagecreatefromstring($bytes) : false;
        if (! $img) {
            return $bytes;
        }
        [$w, $h] = [imagesx($img), imagesy($img)];
        // On white (a PNG's transparent margins are white once flattened).
        $flat = imagecreatetruecolor($w, $h);
        imagefill($flat, 0, 0, imagecolorallocate($flat, 255, 255, 255));
        imagecopy($flat, $img, 0, 0, 0, 0, $w, $h);
        imagedestroy($img);
        $crop = @imagecropauto($flat, IMG_CROP_THRESHOLD, 0.12, 0xFFFFFF);
        if (! $crop || imagesx($crop) < $w * .2 || imagesy($crop) < $h * .2 || (imagesx($crop) >= $w - 4 && imagesy($crop) >= $h - 4)) {
            imagedestroy($flat);

            return $bytes;
        }
        $pad = (int) round(max(imagesx($crop), imagesy($crop)) * .03);
        $out = imagecreatetruecolor(imagesx($crop) + 2 * $pad, imagesy($crop) + 2 * $pad);
        imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
        imagecopy($out, $crop, $pad, $pad, 0, 0, imagesx($crop), imagesy($crop));
        ob_start();
        imagejpeg($out, null, 88);
        $jpeg = (string) ob_get_clean();
        imagedestroy($flat);
        imagedestroy($crop);
        imagedestroy($out);

        return $jpeg !== '' ? $jpeg : $bytes;
    }
}
