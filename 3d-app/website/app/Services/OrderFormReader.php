<?php

namespace App\Services;

use App\Models\Order;
use Throwable;
use ZipArchive;

/**
 * Reads an uploaded order form (CSV, XLSX with PHP's zip extension, or XLS) into SUGGESTED garment rows, for the customer to
 * check before submitting. Understands three layouts: a players list (name, number, size), item lines (garment, size,
 * quantity) and a size grid (garment, then a column per size); anything else is read line by line like a description.
 */
class OrderFormReader
{
    private const MAX_ROWS = 600;

    private const MAX_COLUMNS = 40;

    public function __construct(private OrderAssistant $assistant) {}

    /**
     * @return array{items: array<int, array<string, mixed>>, players: int, unknown: array<int, string>, rows: int, summary: string}|null
     *                                                                                                                                   null when the file is not a spreadsheet it can read
     */
    public function suggest(string $file, string $extension): ?array
    {
        try {
            $rows = match ($extension) {
                'csv', 'txt' => $this->csv($file),
                'xlsx' => $this->xlsx($file),
                // An .xls is often an .xlsx, CSV or HTML table renamed; else the old binary (BIFF8) format.
                'xls' => $this->xlsx($file) ?? (new XlsReader)->rows($file, self::MAX_ROWS, self::MAX_COLUMNS) ?? $this->htmlTable($file) ?? $this->csv($file),
                default => null,
            };
        } catch (Throwable) {
            return null;
        }
        if ($rows === null) {
            return null;
        }
        $rows = array_values(array_filter(array_map(fn ($r) => array_map(fn ($c) => trim((string) $c), array_slice($r, 0, self::MAX_COLUMNS)), $rows),
            fn ($r) => implode('', $r) !== ''));
        $result = $this->table($rows);
        // No heading row, or nothing read under it: the club-form and line readings may do better.
        if (! $result || ! array_filter($result['items'], fn ($item) => array_sum(array_map('intval', $item['sizes'] ?? [])) > 0)) {
            $lines = $this->playerRows($rows) ?? $this->lines($rows);
            $result = $lines['items'] || ! $result ? $lines : $result;
        }
        // A garment with no size read is not a row to fill in (client 2026-10-22: an empty Jersey row blocked the review).
        $result['items'] = array_values(array_filter($result['items'], fn ($item) => array_sum(array_map('intval', $item['sizes'] ?? [])) > 0));
        $result['items'] = array_map(fn ($item) => $item + ['name' => Order::itemName($item)], $result['items']);
        $result['source'] = 'reader';
        $result['rows'] = count($rows);
        $result['summary'] = $this->assistant->summary($result['items']);

        return $result;
    }

    /**
     * Typed notes ("Polo / 3 x 4XL / 2 x 2XL", "Jerseys: 4XL x 3, M - 2", "Smith 7 M") read without AI: garment headings,
     * quantity-and-size pairs in either order, and players (a name, a number and a size on one line). Same shape as
     * suggest(), with `source: 'notes'`.
     *
     * @return array{items: array<int, array<string, mixed>>, players: int, unknown: array<int, string>, rows: int, summary: string, source: string}
     */
    public function notes(string $text): array
    {
        $items = [];
        $unknown = [];
        $count = 0;
        $section = null;
        // A sport on a line of its own ("Football:"): the garments under it are that sport's (a football jersey).
        $sport = null;
        $withSport = function (array $g) use (&$sport): array {
            return ($g['sport'] ?? null) || ! $sport ? $g : ['sport' => $sport] + $g;
        };
        $lines = array_slice(preg_split('/\r\n|\r|\n/', mb_substr($text, 0, 20000)) ?: [], 0, self::MAX_ROWS);
        // Several sentences on one line ("Rugby league jerseys: 5 S, 10 M. Netball dress x 12 size 12"): each its own
        // line (bug QA9 2026-11-10). Not after an initial ("J. Wallace") or "No." / "St."; "5 M.", "2 x L." and ". 5 hoodies" split.
        $sentences = [];
        foreach ($lines as $raw) {
            array_push($sentences, ...(preg_split('/(?<!\bno|\bnr|\bst|\bmr|\bms|\bdr|\bjr|\bsr|\bmrs|\bnum|\bvs)(?:(?<=[\p{L}\d)\]]{2})|(?<=\d\s\p{L})|(?<=\d\p{L})|(?<=\s[sml]))\.\s+(?=\S)|(?<!\bno|\bnr|\bnum)\.\s+(?=\d)|[!?]+\s+(?=\S)/iu', $raw) ?: [$raw]));
        }
        $lines = array_slice($sentences, 0, self::MAX_ROWS);
        // "Football jersey: Smith 7 M, Jones 10 L" / "Football: Smith #7 M": the heading on its own line (so the sport
        // never joins a name), then each player of a comma list on its own line.
        $expanded = [];
        foreach ($lines as $raw) {
            $one = trim($raw);
            if (preg_match('/^([^:\d]{2,60}):\s*(\S.*)$/u', $one, $m) && ($this->garment($m[1]) || OrderAnalysis::sportOf($m[1]))) {
                $expanded[] = $m[1];
                $one = $m[2];
            }
            $parts = array_values(array_filter(array_map('trim', preg_split('/[,;]/u', $one) ?: []), fn ($p) => $p !== ''));
            if (count($parts) > 1 && count(array_filter($parts, fn ($p) => $this->playerOf($p) !== null)) === count($parts)) {
                array_push($expanded, ...$parts);

                continue;
            }
            // "Football jerseys 3 x M, 5 hoodies L" / "5 S, 10 M, Netball dress x 12 size 12": a part naming its own
            // garment starts a line of its own (the sizes before it stay with the garment before it).
            $groups = [];
            foreach ($parts as $p) {
                if ($groups === [] || $this->garment(preg_replace('/\d+/', ' ', $p) ?? $p)) {
                    $groups[] = [];
                }
                $groups[array_key_last($groups)][] = $p;
            }
            if (count($groups) > 1) {
                array_push($expanded, ...array_map(fn ($g) => implode(', ', $g), $groups));
            } else {
                $expanded[] = $one;
            }
        }
        $lines = $expanded;
        $unsized = [];
        // The garment heading last read ("Netball dresses") and how much was ordered when it came.
        $heading = null;
        $ordered = function () use (&$items, &$unsized): int {
            return array_sum(array_map(fn ($item) => array_sum(array_map('intval', $item['sizes'] ?? [])), $items)) + count($unsized);
        };
        $emptyHeading = function () use (&$heading, &$unknown, $ordered): void {
            if ($heading && $ordered() === $heading[1]) {
                $unknown[] = $heading[0].' (how many, in which sizes?)';
            }
            $heading = null;
        };
        $sizeWord = '([0-9]{0,1}x{0,3}[sml]|[2-7]xl|xxs|xs|y?\d{1,2}y?|kids?|youth|small|medium|large|extra\s*large)';
        foreach ($lines as $raw) {
            $line = trim(preg_replace('/[•*\t]+/u', ' ', $raw) ?? $raw, " \t-–—:;.");
            if ($line === '') {
                continue;
            }
            // A player first: a name, a number and a size in any order ("Smith 7 M", "7 Smith M", "J. Wallace - 12 - XL").
            if ($p = $this->playerOf($line)) {
                [$nameText, $number, $size] = $p;
                $garment = $withSport($section ?? ['garment' => 'jersey']);
                $key = $this->add($items, $garment, [$size => 1]);
                $items[$key]['players'][] = ['name' => mb_substr($nameText, 0, 40), 'number' => (string) ($number ?? ''), 'size' => $size];
                $count++;

                continue;
            }
            // "2 polos 3XL", "2 polos size 3XL", "10 football jerseys" (no size): a quantity, a garment, then maybe a size;
            // or the garment first: "Netball dress x 12 size 12", "Hoodies x 5 L", "Netball dresses x 12" (no size).
            $sizeAfter = '(?:\s+(?:in\s+)?(?:size\s+|sz\s+)?([0-9]?[A-Za-z]{1,4}|\d{1,2}[Yy]?))?';
            $qtyGarment = null;
            if (preg_match('/^(\d{1,4})\s*(?:x|×)?\s+([^\d]+?)'.$sizeAfter.'$/u', $line, $m)) {
                $qtyGarment = [$m[1], $m[2], $m[3] ?? ''];
            } elseif (preg_match('/^([^\d]+?)\s*(?:x|×)\s*(\d{1,4})'.$sizeAfter.'$/iu', $line, $m)) {
                $qtyGarment = [$m[2], $m[1], $m[3] ?? ''];
            }
            // A dress in a number size the price list doesn't have ("size 6"): kept, with that size to check.
            $odd = fn (array $g) => preg_match('/dress/i', (string) ($g['label'] ?? '')) && preg_match('/^\d{1,2}$/', $qtyGarment[2]);
            if ($qtyGarment && ($g = $this->garment($qtyGarment[1])) && ($qtyGarment[2] === '' || $this->sizeFor($qtyGarment[2], $g) || $odd($g))) {
                $n = min(10000, max(1, (int) $qtyGarment[0]));
                if ($qtyGarment[2] !== '' && ($size = $this->sizeFor($qtyGarment[2], $g))) {
                    $this->add($items, $withSport($g), [$size => $n]);
                } else {
                    $unsized[] = $withSport($g) + ['qty' => $n, 'size' => $qtyGarment[2], 'text' => mb_substr($line, 0, 80)];
                    $unknown[] = mb_substr($line, 0, 80);
                }

                continue;
            }
            $pairs = [];
            $numberFirst = function (string $text) use (&$pairs, $sizeWord): string {
                // "3 x 4XL", "3x 4XL", "3 4XL", "3 of 4XL"
                return preg_replace_callback('/(?<![\w])(\d{1,4})(?:\s*(?:×|of|pcs?)\s*|\s+x\s+|x\s+|\s+)?'.$sizeWord.'(?![\w])/iu', function ($m) use (&$pairs) {
                    $size = $this->cellSize($m[2]);
                    if (! $size) {
                        return $m[0];
                    }
                    // "3XL" glued: the size 3XL (one of it), not three XL.
                    if (preg_match('/^\d{1,4}x{1,3}[sml]$/i', $m[0]) && ($glued = OrderFormAi::siteSize($m[0]))) {
                        $pairs[] = [$glued, 1];

                        return ' ';
                    }
                    $pairs[] = [$size, (int) $m[1]];

                    return ' ';
                }, $text) ?? $text;
            };
            $sizeFirst = function (string $text) use (&$pairs, $sizeWord): string {
                // "4XL x 3", "4xl - 3", "4XL: 3", "L 4"
                return preg_replace_callback('/(?<![\w])'.$sizeWord.'\s*(?:x|×|-|–|:|=)?\s*(\d{1,4})(?![\w])/iu', function ($m) use (&$pairs) {
                    $size = $this->cellSize($m[1]);
                    if (! $size) {
                        return $m[0];
                    }
                    $pairs[] = [$size, (int) $m[2]];

                    return ' ';
                }, $text) ?? $text;
            };
            // A line that starts with a size ("4XL x 3") is size first; else number first ("3 x 4XL").
            $startsWithSize = preg_match('/^'.$sizeWord.'(?![\w])/iu', $line) === 1 && $this->cellSize(preg_split('/[\s:×=\-–]+/u', $line)[0] ?? '');
            $rest = $startsWithSize ? $sizeFirst($line) : $numberFirst($line);
            if (! $pairs) {
                $rest = $startsWithSize ? $numberFirst($line) : $sizeFirst($line);
            }
            $words = trim(preg_replace('/\s+/', ' ', preg_replace('/[,;:()\-–]+/', ' ', $rest) ?? '') ?? '');
            if ($pairs) {
                // "3 x 4XL polo": the garment on the line itself.
                $garment = $withSport(($words !== '' ? $this->garment($words) : null) ?? $section ?? ['garment' => 'jersey']);
                foreach ($pairs as [$size, $n]) {
                    $this->add($items, $garment, [$size => min(10000, max(1, $n))]);
                }
                // Two garments left on one line ("jerseys 3 x M 5 hoodies L"): read as one, so it is shown to check.
                if (count(OrderAnalysis::garmentsIn($words)) > 1) {
                    $unknown[] = mb_substr($line, 0, 80).' (several garments on one line: please check)';
                }

                continue;
            }
            // A garment heading ("Polo", "Jerseys:", "Training shorts").
            if (! preg_match('/\d/', $line) && mb_strlen($line) <= 60 && ($g = $this->garment($line))) {
                $emptyHeading();
                $heading = [mb_substr($line, 0, 80), $ordered()];
                $section = $g;

                continue;
            }
            if (! preg_match('/\d/', $line) && mb_strlen($line) <= 40 && count(preg_split('/\s+/', $line) ?: []) <= 3 && ($s = OrderAnalysis::sportOf($line))) {
                $sport = $s;

                continue;
            }
            $unknown[] = mb_substr($line, 0, 80);
        }
        $emptyHeading();
        $items = array_values(array_filter($items, fn ($item) => array_sum(array_map('intval', $item['sizes'] ?? [])) > 0));
        $items = array_map(fn ($item) => $item + ['name' => Order::itemName($item)], $items);

        return ['items' => $items, 'players' => $count, 'unknown' => array_slice($unknown, 0, 20), 'rows' => count($lines),
            'summary' => $this->assistant->summary($items), 'source' => 'notes', 'unsized' => $unsized];
    }

    /** A player line ("Smith 7 M", "7 Smith M", "J. Wallace - 12 - XL") as [name, number|null, size], or null. */
    private function playerOf(string $line): ?array
    {
        $tokens = preg_split('/[\s,;\-–|]+/u', $line) ?: [];
        $size = null;
        $number = null;
        $name = [];
        $other = false;
        foreach ($tokens as $t) {
            $t = trim($t, '#.:');
            if ($t === '') {
                continue;
            }
            if (preg_match('/^\d{1,3}$/', $t)) {
                $other = $other || $number !== null;
                $number ??= $t;
            } elseif (! preg_match('/^\d+$/', $t) && ($s = $this->cellSize($t))) {
                $other = $other || $size !== null;
                $size ??= $s;
            } elseif (in_array(mb_strtolower($t), ['x', '×', 'of', 'pcs', 'pc', 'qty'], true) || $this->garment($t)) {
                $other = true;
            } else {
                $name[] = $t;
            }
        }
        $nameText = implode(' ', $name);

        return ! $other && $size && $nameText !== '' && $this->isName(str_replace('.', '', $nameText)) ? [$nameText, $number, $size] : null;
    }

    /** @return array<int, array<int, string>> */
    private function csv(string $file): array
    {
        $text = (string) file_get_contents($file, false, null, 0, 2 * 1024 * 1024);
        $text = preg_replace('/^\xEF\xBB\xBF/', '', $text) ?? $text;
        if (! mb_check_encoding($text, 'UTF-8')) {
            $text = mb_convert_encoding($text, 'UTF-8', 'Windows-1252');
        }
        $first = strtok($text, "\n") ?: '';
        $delimiter = collect(["\t", ';', ','])->sortByDesc(fn ($d) => substr_count($first, $d))->first();
        $rows = [];
        foreach (preg_split('/\r\n|\r|\n/', $text) ?: [] as $line) {
            if (count($rows) >= self::MAX_ROWS) {
                break;
            }
            $rows[] = str_getcsv($line, $delimiter);
        }

        return $rows;
    }

    /** The first worksheet of an .xlsx file (cells as text). */
    private function xlsx(string $file): ?array
    {
        if (! class_exists(ZipArchive::class)) {
            return null;
        }
        $zip = new ZipArchive;
        if ($zip->open($file) !== true) {
            return null;
        }
        try {
            $strings = [];
            if (($xml = $zip->getFromName('xl/sharedStrings.xml')) !== false) {
                $doc = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NONET | LIBXML_COMPACT);
                foreach ($doc?->si ?? [] as $si) {
                    $strings[] = isset($si->t) ? (string) $si->t : implode('', array_map(fn ($r) => (string) $r->t, iterator_to_array($si->r ?? [], false)));
                }
            }
            $sheet = $zip->getFromName('xl/worksheets/sheet1.xml');
            for ($i = 0; $sheet === false && $i < $zip->numFiles; $i++) {
                $name = (string) $zip->getNameIndex($i);
                if (preg_match('#^xl/worksheets/[^/]+\.xml$#', $name)) {
                    $sheet = $zip->getFromName($name);
                }
            }
            if ($sheet === false) {
                return null;
            }
            $doc = simplexml_load_string($sheet, 'SimpleXMLElement', LIBXML_NONET | LIBXML_COMPACT);
            $rows = [];
            foreach ($doc?->sheetData->row ?? [] as $row) {
                if (count($rows) >= self::MAX_ROWS) {
                    break;
                }
                $cells = [];
                foreach ($row->c as $c) {
                    $column = $this->column((string) $c['r']);
                    if ($column >= self::MAX_COLUMNS) {
                        continue;
                    }
                    $type = (string) $c['t'];
                    $value = match ($type) {
                        's' => $strings[(int) $c->v] ?? '',
                        'inlineStr' => (string) ($c->is->t ?? ''),
                        default => (string) $c->v,
                    };
                    $cells[$column] = $value;
                }
                $line = [];
                for ($i = 0, $last = $cells ? max(array_keys($cells)) : -1; $i <= $last; $i++) {
                    $line[] = $cells[$i] ?? '';
                }
                $rows[] = $line;
            }

            return $rows;
        } finally {
            $zip->close();
        }
    }

    /** An "Excel" file that is really an HTML table (saved from a web page or another program). */
    private function htmlTable(string $file): ?array
    {
        $text = (string) file_get_contents($file, false, null, 0, 2 * 1024 * 1024);
        if (! preg_match('/<table/i', $text)) {
            return null;
        }
        $rows = [];
        preg_match_all('#<tr[^>]*>(.*?)</tr>#is', $text, $trs);
        foreach (array_slice($trs[1], 0, self::MAX_ROWS) as $tr) {
            preg_match_all('#<t[dh][^>]*>(.*?)</t[dh]>#is', $tr, $tds);
            $rows[] = array_map(fn ($c) => html_entity_decode(trim(strip_tags($c)), ENT_QUOTES | ENT_HTML5, 'UTF-8'), $tds[1]);
        }

        return $rows ?: null;
    }

    /** "C12" => 2 */
    private function column(string $ref): int
    {
        $letters = preg_replace('/\d+/', '', strtoupper($ref)) ?: 'A';
        $n = 0;
        foreach (str_split($letters) as $letter) {
            $n = $n * 26 + (ord($letter) - 64);
        }

        return $n - 1;
    }

    /**
     * A table with a heading row (players list, item lines or a size grid), or null. The heading may sit under title
     * rows (team name, merged banners) anywhere in the first 40 lines, with its columns in any order.
     */
    private function table(array $rows): ?array
    {
        foreach (array_slice($rows, 0, 40, true) as $at => $row) {
            $head = array_map(fn ($c) => mb_strtolower(trim(preg_replace('/\s+/u', ' ', $c) ?? $c)), $row);
            $find = fn (string $pattern) => collect($head)->search(fn ($h) => $h !== '' && preg_match($pattern, $h) === 1);
            $name = $find('/^((player|athlete|first|last|full|sur)\s*)?names?(\s*(on\s*(the\s*)?back|to\s*print|printed))?$|^surname|^players?$/');
            $number = $find('/^(no\.?|nr\.?|#|num(ber)?|(jersey|shirt|player|back)\s*(no\.?|nr\.?|num(ber)?|#)|number\s*(on\s*back|#))$/');
            $size = $find('/^((garment|shirt|jersey)\s*)?sizes?\b/');
            $qty = $find('/^(qty|quantity|quantities|amount|count|total\s*qty|units?|pcs|no\.?\s*of|how\s*many|order\s*qty)/');
            $garment = $find('/^(garment|item|product|description|style|type|clothing|apparel|kit)s?(\s*(name|type))?$/');
            $sizeColumns = [];
            foreach ($head as $i => $h) {
                $s = $h === '' || $i === $name || $i === $number || $i === $garment ? null : $this->size($h);
                if ($s) {
                    $sizeColumns[$i] = $s;
                }
            }
            $body = array_slice($rows, $at + 1);
            // A size grid's heading is mostly sizes, each once ("Garment | S | M | L | Total"); a players row with a
            // size totals table beside it ("10Y | WALKER | 1 | | 10Y | 3") is not one.
            $filled = count(array_filter($head, fn ($h) => $h !== ''));
            $grid = count($sizeColumns) >= 2 && count(array_unique($sizeColumns)) === count($sizeColumns)
                && (count($sizeColumns) * 2 >= $filled - 1 || (count($sizeColumns) >= 3 && ($garment !== false || $name !== false)));
            if ($grid && $size === false) {
                return $this->grid($body, $sizeColumns, $garment === false ? null : $garment, $name === false ? null : $name, $number === false ? null : $number);
            }
            if ($size !== false && ($name !== false || $number !== false)) {
                return $this->players($body, $name === false ? null : $name, $number === false ? null : $number, $size, $garment === false ? null : $garment, $qty === false ? null : $qty);
            }
            if ($size !== false && $qty !== false) {
                return $this->itemLines($body, $garment === false ? null : $garment, $size, $qty);
            }
        }

        return null;
    }

    /**
     * A row that names a garment on its own ("JERSEYS", "Training shorts | 12"): the section heading for the rows
     * under it. Null for any other row.
     */
    private function section(array $row, array $dataColumns): ?array
    {
        $cells = array_values(array_filter($row, fn ($c) => trim($c) !== ''));
        if (! $cells || count($cells) > 2 || array_filter($dataColumns, fn ($i) => is_numeric($row[$i] ?? '') && (float) $row[$i] > 0)) {
            return null;
        }
        if (count($cells) === 2 && ! is_numeric($cells[1])) {
            return null;
        }

        return mb_strlen($cells[0]) <= 60 && ! is_numeric($cells[0]) && ! $this->cellSize($cells[0]) ? $this->garment($cells[0]) : null;
    }

    /** A heading row repeated under a new section, or a totals row: not a line to read. */
    private function skipRow(array $row, int $sizeColumn): bool
    {
        return preg_match('/^sizes?$/', mb_strtolower(trim($row[$sizeColumn] ?? ''))) === 1
            || preg_match('/^(sub\s*|grand\s*)?totals?\b/i', implode(' ', array_filter($row, fn ($c) => trim($c) !== ''))) === 1;
    }

    /**
     * Garment | XS | S | M ... (a count per size), or a player per row with their size marked ("Name | No | S | M | L",
     * "x" or 1 under the size). Garment names may come from a section heading row above.
     */
    private function grid(array $rows, array $sizeColumns, ?int $garmentColumn, ?int $nameColumn = null, ?int $numberColumn = null): array
    {
        $items = [];
        $unknown = [];
        $count = 0;
        $section = null;
        $first = array_key_first($sizeColumns);
        foreach ($rows as $row) {
            if (($found = $this->section($row, array_keys($sizeColumns))) !== null) {
                $section = $found;

                continue;
            }
            if ($this->size($row[$first] ?? '') === $sizeColumns[$first] || $this->skipRow($row, $first)) {
                continue;
            }
            $label = $garmentColumn !== null ? ($row[$garmentColumn] ?? '')
                : ($nameColumn !== null ? '' : (collect($row)->first(fn ($c, $i) => ! isset($sizeColumns[$i]) && $i !== $numberColumn && ! is_numeric($c) && $c !== '') ?? ''));
            $sizes = [];
            foreach ($sizeColumns as $i => $size) {
                $cell = mb_strtolower(trim($row[$i] ?? ''));
                $n = in_array($cell, ['x', '✓', '✔', 'yes', 'y'], true) ? 1 : (int) round((float) $cell);
                if ($n > 0) {
                    $sizes[$size] = ($sizes[$size] ?? 0) + min(10000, $n);
                }
            }
            if (! $sizes) {
                continue;
            }
            $garment = $this->garment($label) ?? $section;
            if (! $garment && $label !== '') {
                $unknown[] = mb_substr($label, 0, 40).' (garment not recognised)';
            }
            $key = $this->add($items, $garment ?? ($label !== '' ? ['garment' => 'other', 'label' => mb_substr($label, 0, 60)] : ['garment' => 'jersey']), $sizes);
            if ($nameColumn !== null || $numberColumn !== null) {
                $name = $nameColumn !== null ? mb_substr(trim($row[$nameColumn] ?? ''), 0, 40) : '';
                $number = $numberColumn !== null ? preg_replace('/\D/', '', (string) preg_replace('/\.0+$/', '', $row[$numberColumn] ?? '')) : '';
                if (($name !== '' || $number !== '') && count($sizes) === 1 && reset($sizes) === 1) {
                    $items[$key]['players'][] = ['name' => $name, 'number' => substr((string) $number, 0, 3), 'size' => (string) array_key_first($sizes)];
                    $count++;
                }
            }
        }

        return ['items' => array_values($items), 'players' => $count, 'unknown' => array_slice($unknown, 0, 20)];
    }

    /** Garment | Size | Quantity */
    private function itemLines(array $rows, ?int $garmentColumn, int $sizeColumn, int $qtyColumn): array
    {
        $items = [];
        $unknown = [];
        $section = null;
        foreach ($rows as $row) {
            if (($found = $this->section($row, [$qtyColumn])) !== null) {
                $section = $found;

                continue;
            }
            if ($this->skipRow($row, $sizeColumn)) {
                continue;
            }
            $size = $this->cellSize($row[$sizeColumn] ?? '');
            $n = (int) round((float) ($row[$qtyColumn] ?? 0));
            if (! $size || $n < 1) {
                if (implode('', $row) !== '') {
                    $unknown[] = implode(' ', array_filter($row));
                }

                continue;
            }
            $label = $garmentColumn !== null ? ($row[$garmentColumn] ?? '') : '';
            $garment = $this->garment($label) ?? $section ?? ['garment' => $label === '' ? 'jersey' : 'other', 'label' => $label === '' ? null : mb_substr($label, 0, 60)];
            $this->add($items, $garment, [$size => min(10000, $n)]);
        }

        return ['items' => array_values($items), 'players' => 0, 'unknown' => array_slice($unknown, 0, 10)];
    }

    /**
     * Name | Number | Size (| Garment | Qty), in any order: one garment each (or Qty of them), with the names and numbers
     * to print. A garment named in a section heading row ("SHORTS") applies to the players under it.
     */
    private function players(array $rows, ?int $nameColumn, ?int $numberColumn, int $sizeColumn, ?int $garmentColumn, ?int $qtyColumn = null): array
    {
        $items = [];
        $unknown = [];
        $count = 0;
        $section = null;
        foreach ($rows as $row) {
            if (($found = $this->section($row, array_values(array_filter([$qtyColumn, $numberColumn], fn ($c) => $c !== null)))) !== null) {
                $section = $found;

                continue;
            }
            if ($this->skipRow($row, $sizeColumn)) {
                continue;
            }
            $size = $this->cellSize($row[$sizeColumn] ?? '');
            $name = $nameColumn !== null ? mb_substr(trim($row[$nameColumn] ?? ''), 0, 40) : '';
            $number = $numberColumn !== null ? preg_replace('/\D/', '', (string) preg_replace('/\.0+$/', '', $row[$numberColumn] ?? '')) : '';
            if (! $size) {
                if ($name !== '' || $number !== '') {
                    $written = trim($row[$sizeColumn] ?? '');
                    $unknown[] = trim($name.' '.$number).($written !== '' ? ' (size "'.mb_substr($written, 0, 12).'" not recognised)' : ' (no size)');
                }

                continue;
            }
            $n = $qtyColumn !== null && is_numeric(trim($row[$qtyColumn] ?? '')) ? max(1, min(10000, (int) round((float) $row[$qtyColumn]))) : 1;
            $label = $garmentColumn !== null ? trim($row[$garmentColumn] ?? '') : '';
            $read = $this->garment($label);
            $garment = $read ?? $section ?? ['garment' => 'jersey'];
            if ($label !== '' && ! $read) {
                $unknown[] = trim($name.' '.$number).' (garment "'.mb_substr($label, 0, 30).'" not recognised)';
            }
            $key = $this->add($items, $garment, [$size => $n]);
            if ($name !== '' || $number !== '') {
                $items[$key]['players'][] = ['name' => $name, 'number' => substr((string) $number, 0, 3), 'size' => $size];
                $count++;
            }
        }

        return ['items' => array_values($items), 'players' => $count, 'unknown' => array_slice($unknown, 0, 20)];
    }

    /**
     * No heading row, but players as size | name | number cells (a club form like Te Arawa's: "10Y | SMITH | 1", often
     * beside labels and a size totals table): one jersey each. Null unless at least three players are found.
     */
    private function playerRows(array $rows): ?array
    {
        $found = [];
        $columns = [];
        foreach ($rows as $r => $row) {
            for ($i = 0, $n = count($row) - 2; $i < $n; $i++) {
                $size = OrderFormAi::siteSize($row[$i]);
                if ($size && $this->isName($row[$i + 1]) && preg_match('/^\d{1,3}(\.0+)?$/', $row[$i + 2])) {
                    $found[] = [$r, $i, $size];
                    $columns[$i] = ($columns[$i] ?? 0) + 1;
                    break;
                }
            }
        }
        if (count($found) < 3) {
            return null;
        }
        arsort($columns);
        $column = array_key_first($columns);
        $players = [];
        $sizes = [];
        $unknown = [];
        foreach ($rows as $r => $row) {
            $name = $row[$column + 1] ?? '';
            $number = preg_replace('/\.0+$/', '', $row[$column + 2] ?? '') ?? '';
            if (! $this->isName($name) || ! preg_match('/^\d{1,3}$/', $number)) {
                continue;
            }
            $size = OrderFormAi::siteSize($row[$column] ?? '');
            if (! $size) {
                $unknown[] = trim(($row[$column] ?? '').' '.$name.' '.$number).' (no size)';
                $players[] = ['name' => mb_substr($name, 0, 40), 'number' => $number, 'size' => null];

                continue;
            }
            $sizes[$size] = ($sizes[$size] ?? 0) + 1;
            $players[] = ['name' => mb_substr($name, 0, 40), 'number' => $number, 'size' => $size];
        }
        $ordered = array_filter(array_merge(array_fill_keys(Order::SIZES, 0), $sizes));
        $item = ['garment' => 'jersey', 'sizes' => $ordered, 'players' => $players] + (Order::fitFromSizes($ordered) ? ['fit' => Order::fitFromSizes($ordered)] : []);

        return ['items' => [$item], 'players' => count($players), 'unknown' => array_slice($unknown, 0, 10)];
    }

    /** A cell that reads as a player's name: letters, not a size or a heading word. */
    private function isName(string $cell): bool
    {
        $cell = trim($cell);

        return $cell !== '' && mb_strlen($cell) <= 40 && preg_match("/^[\\pL][\\pL\\s'’.\\-]*$/u", $cell) === 1 && ! OrderFormAi::siteSize($cell)
            && ! in_array(mb_strtolower($cell), ['name', 'names', 'player', 'size', 'number', 'no', 'qty', 'total', 'asap'], true);
    }

    /** No heading row: each line read like a description ("Jersey M 12"). */
    private function lines(array $rows): array
    {
        $read = $this->assistant->parse(implode("\n", array_map(fn ($r) => implode(' ', array_filter($r, fn ($c) => $c !== '')), $rows)));

        return ['items' => $read['items'], 'players' => 0, 'unknown' => array_slice($read['unknown'], 0, 10)];
    }

    private function add(array &$items, array $garment, array $sizes): string
    {
        $key = implode('|', [$garment['garment'], $garment['sport'] ?? '', $garment['fit'] ?? '', $garment['label'] ?? '']);
        $items[$key] ??= array_filter($garment, fn ($v) => $v !== null) + ['sizes' => []];
        foreach ($sizes as $size => $n) {
            $items[$key]['sizes'][$size] = ($items[$key]['sizes'][$size] ?? 0) + $n;
        }

        return $key;
    }

    /** A size written in a cell ("m", "XXL", "Kids"), or null. */
    private function size(string $cell): ?string
    {
        $read = $this->assistant->parse('1 jersey '.trim($cell));
        $sizes = $read['items'][0]['sizes'] ?? [];

        return count($sizes) === 1 && trim($cell) !== '' && mb_strlen(trim($cell)) <= 12 ? (string) array_key_first($sizes) : null;
    }

    /** A size in a table's size column: also youth and womens sizes ("10Y", "Y12" => 10Y, 12Y; "Ladies 12" => W12). Headings use size() only. */
    private function cellSize(string $cell): ?string
    {
        return OrderFormAi::siteSize($cell) ?? $this->size($cell);
    }

    /** A size written for a garment: a dress's size may be a number (womens: "size 12" W12, 8 to 24). */
    private function sizeFor(string $written, array $garment): ?string
    {
        $size = $this->cellSize($written);
        if ($size === null && preg_match('/^\d{1,2}$/', trim($written)) && preg_match('/dress/i', (string) ($garment['label'] ?? ''))) {
            $size = Order::siteSize('W'.(int) trim($written));
        }

        return $size;
    }

    /** A garment (with sport and fit) named in a cell, or null. */
    private function garment(string $cell): ?array
    {
        if (trim($cell) === '') {
            return null;
        }
        $read = $this->assistant->parse('1 '.trim($cell).' M');
        $item = $read['items'][0] ?? null;
        if (! $item) {
            return null;
        }
        $garment = ['garment' => $item['garment'], 'sport' => $item['sport'], 'fit' => $item['fit']];
        // A dress is ordered on a singlet row, named as the product ("Netball dress"), not "Netball singlet".
        if ($item['garment'] === 'singlet' && preg_match('/\bdress(?:es)?\b/iu', $cell)) {
            $sportName = collect((array) config('catalog.sports', []))->firstWhere('id', $item['sport'])['name'] ?? null;
            $garment['label'] = $sportName ? $sportName.' dress' : 'Dress';
        }

        return $garment;
    }
}
