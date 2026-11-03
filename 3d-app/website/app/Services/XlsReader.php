<?php

namespace App\Services;

/**
 * Reads the first worksheet of an old binary Excel file (.xls, BIFF8 inside an OLE compound file) as rows of text,
 * without any package: shared strings, text, numbers and RK numbers. Formulas' cached numbers are read too. Returns
 * null for anything it does not understand (the caller then tries other readings).
 */
class XlsReader
{
    private string $data = '';

    /** @return array<int, array<int, string>>|null */
    public function rows(string $file, int $maxRows = 600, int $maxColumns = 40): ?array
    {
        $this->data = (string) file_get_contents($file, false, null, 0, 20 * 1024 * 1024);
        if (strlen($this->data) < 512 || substr($this->data, 0, 8) !== "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1") {
            return null;
        }
        $book = $this->stream();

        return $book === null ? null : $this->sheet($book, $maxRows, $maxColumns);
    }

    private function u16(string $s, int $at): int
    {
        return strlen($s) >= $at + 2 ? unpack('v', substr($s, $at, 2))[1] : 0;
    }

    private function u32(string $s, int $at): int
    {
        return strlen($s) >= $at + 4 ? unpack('V', substr($s, $at, 4))[1] : 0;
    }

    /** The "Workbook" (or "Book") stream out of the compound file. */
    private function stream(): ?string
    {
        $d = $this->data;
        $size = 1 << $this->u16($d, 0x1E);
        if ($size !== 512 && $size !== 4096) {
            return null;
        }
        $sector = fn (int $n) => substr($d, ($n + 1) * $size, $size);
        // The FAT sectors: 109 in the header, then the DIFAT chain.
        $fatSectors = [];
        for ($i = 0; $i < 109; $i++) {
            $s = $this->u32($d, 0x4C + $i * 4);
            if ($s < 0xFFFFFFFA) {
                $fatSectors[] = $s;
            }
        }
        for ($dif = $this->u32($d, 0x44), $guard = 0; $dif < 0xFFFFFFFA && $guard < 1000; $guard++) {
            $block = $sector($dif);
            for ($i = 0; $i < $size / 4 - 1; $i++) {
                $s = $this->u32($block, $i * 4);
                if ($s < 0xFFFFFFFA) {
                    $fatSectors[] = $s;
                }
            }
            $dif = $this->u32($block, $size - 4);
        }
        $fat = [];
        foreach ($fatSectors as $s) {
            $fat = array_merge($fat, array_values(unpack('V*', $sector($s)) ?: []));
        }
        $chain = function (int $start) use ($fat, $sector): string {
            $out = '';
            for ($s = $start, $guard = 0; $s < 0xFFFFFFFA && $guard < 50000; $guard++) {
                $out .= $sector($s);
                $s = $fat[$s] ?? 0xFFFFFFFE;
            }

            return $out;
        };
        $dir = $chain($this->u32($d, 0x30));
        $root = null;
        for ($at = 0; $at + 128 <= strlen($dir); $at += 128) {
            $nameLength = $this->u16($dir, $at + 64);
            $name = $nameLength > 2 ? mb_convert_encoding(substr($dir, $at, $nameLength - 2), 'UTF-8', 'UTF-16LE') : '';
            $type = ord($dir[$at + 66]);
            $start = $this->u32($dir, $at + 116);
            $length = $this->u32($dir, $at + 120);
            if ($type === 5) {
                $root = [$start, $length];
            }
            if ($type === 2 && in_array($name, ['Workbook', 'Book'], true)) {
                if ($length >= $this->u32($d, 0x38)) {
                    return substr($chain($start), 0, $length);
                }
                // A small stream lives in the mini stream (64-byte sectors).
                if (! $root) {
                    return null;
                }
                $mini = $chain($root[0]);
                $miniFat = array_values(unpack('V*', $chain($this->u32($d, 0x3C))) ?: []);
                $out = '';
                for ($s = $start, $guard = 0; $s < 0xFFFFFFFA && $guard < 50000; $guard++) {
                    $out .= substr($mini, $s * 64, 64);
                    $s = $miniFat[$s] ?? 0xFFFFFFFE;
                }

                return substr($out, 0, $length);
            }
        }

        return null;
    }

    /** The records of the first worksheet as rows. */
    private function sheet(string $b, int $maxRows, int $maxColumns): ?array
    {
        $strings = [];
        $cells = [];
        $sheets = 0;
        $len = strlen($b);
        for ($at = 0; $at + 4 <= $len;) {
            $type = $this->u16($b, $at);
            $size = $this->u16($b, $at + 2);
            $body = substr($b, $at + 4, $size);
            $at += 4 + $size;
            if ($type === 0x0809) { // BOF
                $sheets++;
                if ($sheets > 2) {
                    break;
                }

                continue;
            }
            if ($type === 0x00FC) { // SST, with its CONTINUE records
                $parts = [$body];
                while ($at + 4 <= $len && $this->u16($b, $at) === 0x003C) {
                    $s = $this->u16($b, $at + 2);
                    $parts[] = substr($b, $at + 4, $s);
                    $at += 4 + $s;
                }
                $strings = $this->sst($parts);

                continue;
            }
            if ($sheets < 2) {
                continue;
            }
            if ($type === 0x000A) { // EOF of the first sheet
                break;
            }
            $row = $this->u16($body, 0);
            $col = $this->u16($body, 2);
            if ($row >= $maxRows) {
                continue;
            }
            $value = null;
            switch ($type) {
                case 0x00FD: // LABELSST
                    $value = $strings[$this->u32($body, 6)] ?? '';
                    break;
                case 0x0203: // NUMBER
                    $value = $this->number(unpack('e', str_pad(substr($body, 6, 8), 8, chr(0)))[1]);
                    break;
                case 0x027E: // RK
                    $value = $this->number($this->rk($this->u32($body, 6)));
                    break;
                case 0x0006: // FORMULA: the cached number only
                    if (substr($body, 12, 2) !== "\xFF\xFF") {
                        $value = $this->number(unpack('e', str_pad(substr($body, 6, 8), 8, chr(0)))[1]);
                    }
                    break;
                case 0x0204: // LABEL (older text cells)
                    $value = $this->text($body, 6, $this->u16($body, 6), 8);
                    break;
                case 0x00BD: // MULRK
                    $last = $this->u16($body, strlen($body) - 2);
                    for ($c = $col, $p = 4; $c <= $last && $p + 6 <= strlen($body) - 2; $c++, $p += 6) {
                        if ($c < $maxColumns) {
                            $cells[$row][$c] = $this->number($this->rk($this->u32($body, $p + 2)));
                        }
                    }
                    break;
            }
            if ($value !== null && $col < $maxColumns) {
                $cells[$row][$col] = $value;
            }
        }
        if (! $cells) {
            return null;
        }
        ksort($cells);
        $rows = [];
        foreach ($cells as $line) {
            $out = [];
            for ($i = 0, $last = max(array_keys($line)); $i <= $last; $i++) {
                $out[] = $line[$i] ?? '';
            }
            $rows[] = $out;
        }

        return $rows;
    }

    private function number(float $n): string
    {
        return floor($n) === $n && abs($n) < 1e15 ? (string) (int) $n : (string) $n;
    }

    private function rk(int $v): float
    {
        $n = ($v & 2) ? (float) (($v >> 2) | (($v & 0x80000000) ? ~0x3FFFFFFF : 0)) : unpack('e', "\0\0\0\0".pack('V', $v & 0xFFFFFFFC))[1];

        return ($v & 1) ? $n / 100 : $n;
    }

    /** A LABEL record's text (16-bit length, flags byte, then chars). */
    private function text(string $s, int $at, int $count, int $flagsAt): string
    {
        $wide = (ord($s[$flagsAt] ?? "\0") & 1) === 1;
        $raw = substr($s, $flagsAt + 1, $wide ? $count * 2 : $count);

        return $wide ? mb_convert_encoding($raw, 'UTF-8', 'UTF-16LE') : mb_convert_encoding($raw, 'UTF-8', 'ISO-8859-1');
    }

    /**
     * The shared string table. A string's characters may run on into the next CONTINUE record, which then starts with
     * a fresh flags byte (1 = 16-bit characters).
     *
     * @param  array<int, string>  $parts
     * @return array<int, string>
     */
    private function sst(array $parts): array
    {
        $part = 0;
        $pos = 8;
        $count = $this->u32($parts[0], 4);
        $out = [];
        $read = function (int $n) use (&$part, &$pos, $parts): string {
            $got = '';
            while (strlen($got) < $n && isset($parts[$part])) {
                if ($pos >= strlen($parts[$part])) {
                    $part++;
                    $pos = 0;

                    continue;
                }
                $take = substr($parts[$part], $pos, $n - strlen($got));
                $pos += strlen($take);
                $got .= $take;
            }

            return $got;
        };
        for ($i = 0; $i < $count && $i < 100000 && isset($parts[$part]); $i++) {
            if ($pos >= strlen($parts[$part])) {
                $part++;
                $pos = 0;
            }
            $chars = $this->u16($read(2), 0);
            $flags = ord($read(1));
            $runs = ($flags & 8) ? ($this->u16($read(2), 0)) : 0;
            $ext = ($flags & 4) ? ($this->u32($read(4), 0)) : 0;
            $wide = ($flags & 1) === 1;
            $text = '';
            $left = $chars;
            while ($left > 0 && isset($parts[$part])) {
                if ($pos >= strlen($parts[$part])) {
                    // The characters continue in the next record, after its own flags byte.
                    $part++;
                    $pos = 0;
                    if (! isset($parts[$part])) {
                        break;
                    }
                    $wide = (ord($parts[$part][0]) & 1) === 1;
                    $pos = 1;
                }
                $room = intdiv(strlen($parts[$part]) - $pos, $wide ? 2 : 1);
                $take = min($left, $room);
                $raw = substr($parts[$part], $pos, $take * ($wide ? 2 : 1));
                $pos += strlen($raw);
                $text .= $wide ? mb_convert_encoding($raw, 'UTF-8', 'UTF-16LE') : mb_convert_encoding($raw, 'UTF-8', 'ISO-8859-1');
                $left -= $take;
                if ($take === 0 && $room === 0 && $pos < strlen($parts[$part])) {
                    break;
                }
            }
            $read($runs * 4 + $ext);
            $out[] = $text;
        }

        return $out;
    }
}
