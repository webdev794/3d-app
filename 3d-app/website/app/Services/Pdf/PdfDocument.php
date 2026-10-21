<?php

namespace App\Services\Pdf;

/**
 * A small PDF writer with no libraries: A4 pages, text in Helvetica and Helvetica Bold (Windows-1252 characters),
 * lines, filled and rounded rectangles, and JPEG / PNG pictures. Positions are in points from the page's TOP-left
 * corner (a text's y is its baseline).
 */
final class PdfDocument
{
    public const WIDTH = 595.28;

    public const HEIGHT = 841.89;

    /** Character widths (1/1000 em) of the printable ASCII characters 32-126. */
    private const HELVETICA = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
        278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944,
        667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556,
        500, 722, 500, 500, 500, 334, 260, 334, 584];

    private const HELVETICA_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556,
        556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667,
        944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333,
        611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

    /** @var list<string> each page's drawing operators */
    private array $pages = [];

    private int $current = -1;

    /** @var array<string, array{w: int, h: int, dict: string, data: string, smask?: array{dict: string, data: string}}> */
    private array $images = [];

    public function __construct(private string $title = '', private string $author = '') {}

    public function addPage(): void
    {
        $this->pages[] = '';
        $this->current = count($this->pages) - 1;
    }

    /** Draw on an earlier page (e.g. footers with "Page 1 of 2"). */
    public function usePage(int $index): void
    {
        $this->current = max(0, min(count($this->pages) - 1, $index));
    }

    public function pageCount(): int
    {
        return count($this->pages);
    }

    /** UTF-8 text as Windows-1252 bytes (characters it lacks become "?"). */
    public static function encode(string $text): string
    {
        $text = str_replace(["\r\n", "\r", "\n", "\t"], ' ', $text);
        $converted = function_exists('mb_convert_encoding') ? @mb_convert_encoding($text, 'Windows-1252', 'UTF-8') : false;

        return is_string($converted) ? $converted : (string) preg_replace('/[^\x20-\x7E]/', '?', $text);
    }

    public function width(string $text, float $size, bool $bold = false): float
    {
        $table = $bold ? self::HELVETICA_BOLD : self::HELVETICA;
        $units = 0;
        $bytes = self::encode($text);
        for ($i = 0, $n = strlen($bytes); $i < $n; $i++) {
            $code = ord($bytes[$i]);
            $units += $code >= 32 && $code <= 126 ? $table[$code - 32] : self::extraWidth($code, $bold);
        }

        return $units * $size / 1000;
    }

    /** Splits text into lines no wider than $width (long words are cut). */
    public function wrap(string $text, float $width, float $size, bool $bold = false): array
    {
        $lines = [];
        foreach (preg_split('/\R/', trim($text)) ?: [] as $paragraph) {
            $line = '';
            foreach (preg_split('/\s+/', trim($paragraph)) ?: [] as $word) {
                if ($word === '') {
                    continue;
                }
                $candidate = $line === '' ? $word : $line.' '.$word;
                if ($this->width($candidate, $size, $bold) <= $width) {
                    $line = $candidate;

                    continue;
                }
                if ($line !== '') {
                    $lines[] = $line;
                }
                // A word longer than the line: cut it.
                while ($this->width($word, $size, $bold) > $width && mb_strlen($word) > 1) {
                    $cut = mb_strlen($word);
                    while ($cut > 1 && $this->width(mb_substr($word, 0, $cut), $size, $bold) > $width) {
                        $cut--;
                    }
                    $lines[] = mb_substr($word, 0, $cut);
                    $word = mb_substr($word, $cut);
                }
                $line = $word;
            }
            $lines[] = $line;
        }

        return array_values(array_filter($lines, fn ($l) => $l !== '')) ?: [''];
    }

    public function text(float $x, float $y, string $text, float $size = 10, bool $bold = false, string $color = '#000000', string $align = 'left'): void
    {
        if ($text === '') {
            return;
        }
        if ($align !== 'left') {
            $x -= $this->width($text, $size, $bold) / ($align === 'center' ? 2 : 1);
        }
        $this->put(sprintf('BT /%s %.2F Tf %s 1 0 0 1 %.2F %.2F Tm (%s) Tj ET', $bold ? 'F2' : 'F1', $size, self::rgb($color, 'rg'), $x, self::HEIGHT - $y, self::escape(self::encode($text))));
    }

    public function line(float $x1, float $y1, float $x2, float $y2, string $color = '#d0d7e0', float $width = 0.6): void
    {
        $this->put(sprintf('%.2F w %s %.2F %.2F m %.2F %.2F l S', $width, self::rgb($color, 'RG'), $x1, self::HEIGHT - $y1, $x2, self::HEIGHT - $y2));
    }

    public function rect(float $x, float $y, float $w, float $h, ?string $fill = null, ?string $stroke = null, float $radius = 0, float $lineWidth = 0.6): void
    {
        $bottom = self::HEIGHT - $y - $h;
        $path = $radius > 0 ? self::rounded($x, $bottom, $w, $h, $radius) : sprintf('%.2F %.2F %.2F %.2F re', $x, $bottom, $w, $h);
        $ops = [];
        if ($fill) {
            $ops[] = self::rgb($fill, 'rg');
        }
        if ($stroke) {
            $ops[] = sprintf('%.2F w %s', $lineWidth, self::rgb($stroke, 'RG'));
        }
        $this->put(implode(' ', $ops).' '.$path.' '.($fill && $stroke ? 'B' : ($fill ? 'f' : 'S')));
    }

    /** Draws a JPEG or PNG; false if the file can't be used. */
    public function image(string $bytes, float $x, float $y, float $w, float $h): bool
    {
        $info = self::imageInfo($bytes);
        if (! $info) {
            return false;
        }
        $name = 'Im'.(count($this->images) + 1);
        $this->images[$name] = $info;
        $this->put(sprintf('q %.2F 0 0 %.2F %.2F %.2F cm /%s Do Q', $w, $h, $x, self::HEIGHT - $y - $h, $name));

        return true;
    }

    /** A picture's size and how PDF reads it, or null (JPEG, and 8-bit non-interlaced PNG). */
    public static function imageInfo(string $bytes): ?array
    {
        if (str_starts_with($bytes, "\xFF\xD8")) {
            $size = @getimagesizefromstring($bytes);
            if (! $size) {
                return null;
            }
            $channels = (int) ($size['channels'] ?? 3);
            $space = match ($channels) {
                1 => '/DeviceGray',
                4 => '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]',
                default => '/DeviceRGB',
            };

            return ['w' => (int) $size[0], 'h' => (int) $size[1], 'dict' => "/ColorSpace {$space} /BitsPerComponent 8 /Filter /DCTDecode", 'data' => $bytes];
        }
        if (str_starts_with($bytes, "\x89PNG\r\n\x1a\n")) {
            return self::png($bytes);
        }

        return null;
    }

    private static function png(string $bytes): ?array
    {
        $pos = 8;
        $length = strlen($bytes);
        $header = null;
        $palette = '';
        $idat = '';
        while ($pos + 8 <= $length) {
            $size = unpack('N', substr($bytes, $pos, 4))[1];
            $type = substr($bytes, $pos + 4, 4);
            $data = substr($bytes, $pos + 8, $size);
            if ($type === 'IHDR') {
                $header = unpack('Nw/Nh/Cdepth/Ccolor/Ccompression/Cfilter/Cinterlace', $data);
            } elseif ($type === 'PLTE') {
                $palette = $data;
            } elseif ($type === 'IDAT') {
                $idat .= $data;
            } elseif ($type === 'IEND') {
                break;
            }
            $pos += 12 + $size;
        }
        if (! $header || $header['depth'] !== 8 || $header['interlace'] !== 0 || $idat === '') {
            return null;
        }
        [$w, $h, $color] = [(int) $header['w'], (int) $header['h'], (int) $header['color']];
        $parms = fn (int $colors) => "/DecodeParms << /Predictor 15 /Colors {$colors} /BitsPerComponent 8 /Columns {$w} >>";
        if ($color === 0 || $color === 2) {
            $colors = $color === 0 ? 1 : 3;

            return ['w' => $w, 'h' => $h, 'dict' => '/ColorSpace /'.($color === 0 ? 'DeviceGray' : 'DeviceRGB').' /BitsPerComponent 8 /Filter /FlateDecode '.$parms($colors), 'data' => $idat];
        }
        if ($color === 3 && $palette !== '') {
            $space = '[/Indexed /DeviceRGB '.(intdiv(strlen($palette), 3) - 1).' <'.bin2hex($palette).'>]';

            return ['w' => $w, 'h' => $h, 'dict' => "/ColorSpace {$space} /BitsPerComponent 8 /Filter /FlateDecode ".$parms(1), 'data' => $idat];
        }
        if (($color !== 4 && $color !== 6) || $w * $h > 2_000_000 || ! function_exists('gzuncompress')) {
            return null;
        }
        // With transparency: split the colour and the alpha channel (a soft mask).
        $raw = @gzuncompress($idat);
        if ($raw === false) {
            return null;
        }
        $bpp = $color === 6 ? 4 : 2;
        $stride = $w * $bpp;
        $colorData = '';
        $alphaData = '';
        $previous = str_repeat("\0", $stride);
        for ($row = 0; $row < $h; $row++) {
            $offset = $row * ($stride + 1);
            $filter = ord($raw[$offset] ?? "\0");
            $line = self::unfilter($filter, substr($raw, $offset + 1, $stride), $previous, $bpp);
            $previous = $line;
            $colorRow = '';
            $alphaRow = '';
            for ($i = 0; $i < $stride; $i += $bpp) {
                $colorRow .= substr($line, $i, $bpp - 1);
                $alphaRow .= $line[$i + $bpp - 1];
            }
            $colorData .= "\0".$colorRow;
            $alphaData .= "\0".$alphaRow;
        }
        $colors = $color === 6 ? 3 : 1;

        return ['w' => $w, 'h' => $h, 'dict' => '/ColorSpace /'.($colors === 3 ? 'DeviceRGB' : 'DeviceGray').' /BitsPerComponent 8 /Filter /FlateDecode '.$parms($colors),
            'data' => gzcompress($colorData),
            'smask' => ['dict' => "/Type /XObject /Subtype /Image /Width {$w} /Height {$h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode ".$parms(1),
                'data' => gzcompress($alphaData)]];
    }

    /** Undoes a PNG row filter (None, Sub, Up, Average, Paeth). */
    private static function unfilter(int $filter, string $line, string $previous, int $bpp): string
    {
        if ($filter === 0) {
            return $line;
        }
        $out = $line;
        $n = strlen($line);
        for ($i = 0; $i < $n; $i++) {
            $left = $i >= $bpp ? ord($out[$i - $bpp]) : 0;
            $up = ord($previous[$i] ?? "\0");
            $corner = $i >= $bpp ? ord($previous[$i - $bpp] ?? "\0") : 0;
            $add = match ($filter) {
                1 => $left,
                2 => $up,
                3 => intdiv($left + $up, 2),
                4 => self::paeth($left, $up, $corner),
                default => 0,
            };
            $out[$i] = chr((ord($line[$i]) + $add) & 0xFF);
        }

        return $out;
    }

    private static function paeth(int $a, int $b, int $c): int
    {
        $p = $a + $b - $c;
        [$pa, $pb, $pc] = [abs($p - $a), abs($p - $b), abs($p - $c)];

        return $pa <= $pb && $pa <= $pc ? $a : ($pb <= $pc ? $b : $c);
    }

    /** The finished file. */
    public function output(): string
    {
        if ($this->pages === []) {
            $this->addPage();
        }
        $objects = [];
        $add = function (string $body) use (&$objects): int {
            $objects[] = $body;

            return count($objects);
        };
        $catalog = $add('');
        $pagesId = $add('');
        $regular = $add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
        $bold = $add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
        $xobjects = [];
        foreach ($this->images as $name => $image) {
            $mask = '';
            if (isset($image['smask'])) {
                $mask = ' /SMask '.$add(self::stream($image['smask']['dict'], $image['smask']['data'])).' 0 R';
            }
            $id = $add(self::stream("/Type /XObject /Subtype /Image /Width {$image['w']} /Height {$image['h']} {$image['dict']}{$mask}", $image['data']));
            $xobjects[] = "/{$name} {$id} 0 R";
        }
        $resources = "<< /Font << /F1 {$regular} 0 R /F2 {$bold} 0 R >>".($xobjects ? ' /XObject << '.implode(' ', $xobjects).' >>' : '').' >>';
        $kids = [];
        foreach ($this->pages as $content) {
            $compressed = function_exists('gzcompress') ? gzcompress($content) : false;
            $contents = $add($compressed !== false ? self::stream('/Filter /FlateDecode', $compressed) : self::stream('', $content));
            $kids[] = $add(sprintf('<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %.2F %.2F] /Resources %s /Contents %d 0 R >>', $pagesId, self::WIDTH, self::HEIGHT, $resources, $contents)).' 0 R';
        }
        $info = $add(sprintf('<< /Title (%s) /Author (%s) /Producer (3DEEZI) /CreationDate (D:%s) >>', self::escape(self::encode($this->title)), self::escape(self::encode($this->author)), gmdate('YmdHis').'Z'));
        $objects[$catalog - 1] = "<< /Type /Catalog /Pages {$pagesId} 0 R >>";
        $objects[$pagesId - 1] = '<< /Type /Pages /Kids ['.implode(' ', $kids).'] /Count '.count($kids).' >>';

        $out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        $offsets = [];
        foreach ($objects as $i => $body) {
            $offsets[] = strlen($out);
            $out .= ($i + 1)." 0 obj\n{$body}\nendobj\n";
        }
        $xref = strlen($out);
        $out .= 'xref'."\n".'0 '.(count($objects) + 1)."\n0000000000 65535 f \n";
        foreach ($offsets as $offset) {
            $out .= sprintf("%010d 00000 n \n", $offset);
        }

        return $out.'trailer'."\n".'<< /Size '.(count($objects) + 1)." /Root {$catalog} 0 R /Info {$info} 0 R >>\nstartxref\n{$xref}\n%%EOF\n";
    }

    private function put(string $operators): void
    {
        if ($this->current < 0) {
            $this->addPage();
        }
        $this->pages[$this->current] .= $operators."\n";
    }

    private static function stream(string $dict, string $data): string
    {
        return '<< '.trim($dict.' /Length '.strlen($data))." >>\nstream\n{$data}\nendstream";
    }

    private static function rgb(string $hex, string $operator): string
    {
        $hex = str_pad(ltrim($hex, '#'), 6, '0');

        return sprintf('%.3F %.3F %.3F %s', hexdec(substr($hex, 0, 2)) / 255, hexdec(substr($hex, 2, 2)) / 255, hexdec(substr($hex, 4, 2)) / 255, $operator);
    }

    private static function escape(string $bytes): string
    {
        $out = '';
        for ($i = 0, $n = strlen($bytes); $i < $n; $i++) {
            $char = $bytes[$i];
            $code = ord($char);
            $out .= match (true) {
                $char === '\\', $char === '(', $char === ')' => '\\'.$char,
                $code < 32 || $code > 126 => sprintf('\\%03o', $code),
                default => $char,
            };
        }

        return $out;
    }

    private static function rounded(float $x, float $y, float $w, float $h, float $r): string
    {
        $r = min($r, $w / 2, $h / 2);
        $k = 0.5523 * $r;

        return sprintf('%.2F %.2F m %.2F %.2F l %.2F %.2F %.2F %.2F %.2F %.2F c %.2F %.2F l %.2F %.2F %.2F %.2F %.2F %.2F c %.2F %.2F l %.2F %.2F %.2F %.2F %.2F %.2F c %.2F %.2F l %.2F %.2F %.2F %.2F %.2F %.2F c h',
            $x + $r, $y,
            $x + $w - $r, $y,
            $x + $w - $r + $k, $y, $x + $w, $y + $r - $k, $x + $w, $y + $r,
            $x + $w, $y + $h - $r,
            $x + $w, $y + $h - $r + $k, $x + $w - $r + $k, $y + $h, $x + $w - $r, $y + $h,
            $x + $r, $y + $h,
            $x + $r - $k, $y + $h, $x, $y + $h - $r + $k, $x, $y + $h - $r,
            $x, $y + $r,
            $x, $y + $r - $k, $x + $r - $k, $y, $x + $r, $y);
    }

    /** Widths of the Windows-1252 characters above 126 that invoices use; others as a digit. */
    private static function extraWidth(int $code, bool $bold): int
    {
        return match ($code) {
            0x80, 0xA3, 0xA5 => 556,
            0x91, 0x92 => $bold ? 278 : 222,
            0x93, 0x94 => $bold ? 500 : 333,
            0x95 => 350,
            0x96 => 556,
            0x97 => 1000,
            0xA0, 0xB7 => 278,
            0xA9, 0xAE => 737,
            0xD7 => 584,
            default => 556,
        };
    }
}
