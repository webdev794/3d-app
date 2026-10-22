<?php

namespace App\Services;

use App\Models\Order;
use Throwable;
use ZipArchive;

/**
 * Reads an uploaded order form (CSV, or XLSX with PHP's zip extension) into SUGGESTED garment rows, for the customer to
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
        $result = $this->table($rows) ?? $this->playerRows($rows) ?? $this->lines($rows);
        // A garment with no size read is not a row to fill in (client 2026-10-22: an empty Jersey row blocked the review).
        $result['items'] = array_values(array_filter($result['items'], fn ($item) => array_sum(array_map('intval', $item['sizes'] ?? [])) > 0));
        $result['items'] = array_map(fn ($item) => $item + ['name' => Order::itemName($item)], $result['items']);
        $result['source'] = 'reader';
        $result['rows'] = count($rows);
        $result['summary'] = $this->assistant->summary($result['items']);

        return $result;
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

    /** A table with a heading row (players list, item lines or a size grid), or null. */
    private function table(array $rows): ?array
    {
        foreach (array_slice($rows, 0, 10, true) as $at => $row) {
            $head = array_map(fn ($c) => mb_strtolower(trim($c)), $row);
            $find = fn (string $pattern) => collect($head)->search(fn ($h) => preg_match($pattern, $h) === 1);
            $name = $find('/^(player\s*)?(full\s*)?name|surname|player$/');
            $number = $find('/^(no\.?|#|num(ber)?|jersey\s*(no|number|#)|player\s*(no|number))$/');
            $size = $find('/^size/');
            $qty = $find('/^(qty|quantity|amount|count|total|units?|pcs)$/');
            $garment = $find('/^(garment|item|product|description|style|type|clothing)$/');
            $sizeColumns = [];
            foreach ($head as $i => $h) {
                $s = $this->size($h);
                if ($s) {
                    $sizeColumns[$i] = $s;
                }
            }
            $body = array_slice($rows, $at + 1);
            if (count($sizeColumns) >= 2) {
                return $this->grid($body, $sizeColumns, $garment === false ? null : $garment);
            }
            if ($size !== false && $qty !== false) {
                return $this->itemLines($body, $garment === false ? null : $garment, $size, $qty);
            }
            if ($size !== false && ($name !== false || $number !== false)) {
                return $this->players($body, $name === false ? null : $name, $number === false ? null : $number, $size, $garment === false ? null : $garment);
            }
        }

        return null;
    }

    /** Garment | XS | S | M ... */
    private function grid(array $rows, array $sizeColumns, ?int $garmentColumn): array
    {
        $items = [];
        $unknown = [];
        foreach ($rows as $row) {
            $label = $garmentColumn !== null ? ($row[$garmentColumn] ?? '') : (collect($row)->first(fn ($c, $i) => ! isset($sizeColumns[$i]) && ! is_numeric($c) && $c !== '') ?? '');
            $sizes = [];
            foreach ($sizeColumns as $i => $size) {
                $n = (int) round((float) ($row[$i] ?? 0));
                if ($n > 0) {
                    $sizes[$size] = ($sizes[$size] ?? 0) + min(10000, $n);
                }
            }
            if (! $sizes) {
                continue;
            }
            $garment = $this->garment($label);
            if (! $garment) {
                $unknown[] = $label !== '' ? $label : implode(' ', $row);
            }
            $this->add($items, $garment ?? ['garment' => 'other', 'label' => mb_substr($label, 0, 60) ?: null], $sizes);
        }

        return ['items' => array_values($items), 'players' => 0, 'unknown' => array_slice($unknown, 0, 10)];
    }

    /** Garment | Size | Quantity */
    private function itemLines(array $rows, ?int $garmentColumn, int $sizeColumn, int $qtyColumn): array
    {
        $items = [];
        $unknown = [];
        foreach ($rows as $row) {
            $size = $this->cellSize($row[$sizeColumn] ?? '');
            $n = (int) round((float) ($row[$qtyColumn] ?? 0));
            if (! $size || $n < 1) {
                if (implode('', $row) !== '') {
                    $unknown[] = implode(' ', array_filter($row));
                }

                continue;
            }
            $label = $garmentColumn !== null ? ($row[$garmentColumn] ?? '') : '';
            $garment = $this->garment($label) ?? ['garment' => $label === '' ? 'jersey' : 'other', 'label' => $label === '' ? null : mb_substr($label, 0, 60)];
            $this->add($items, $garment, [$size => min(10000, $n)]);
        }

        return ['items' => array_values($items), 'players' => 0, 'unknown' => array_slice($unknown, 0, 10)];
    }

    /** Name | Number | Size (| Garment): one garment each, with the names and numbers to print. */
    private function players(array $rows, ?int $nameColumn, ?int $numberColumn, int $sizeColumn, ?int $garmentColumn): array
    {
        $items = [];
        $unknown = [];
        $count = 0;
        foreach ($rows as $row) {
            $size = $this->cellSize($row[$sizeColumn] ?? '');
            $name = $nameColumn !== null ? mb_substr(trim($row[$nameColumn] ?? ''), 0, 40) : '';
            $number = $numberColumn !== null ? preg_replace('/\D/', '', (string) ($row[$numberColumn] ?? '')) : '';
            if (! $size) {
                if ($name !== '' || $number !== '') {
                    $unknown[] = trim($name.' '.$number).' (no size)';
                }

                continue;
            }
            $label = $garmentColumn !== null ? ($row[$garmentColumn] ?? '') : '';
            $garment = $this->garment($label) ?? ['garment' => 'jersey'];
            $key = $this->add($items, $garment, [$size => 1]);
            $items[$key]['players'][] = ['name' => $name, 'number' => substr((string) $number, 0, 3), 'size' => $size];
            $count++;
        }

        return ['items' => array_values($items), 'players' => $count, 'unknown' => array_slice($unknown, 0, 10)];
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
        $item = ['garment' => 'jersey', 'sizes' => $ordered, 'players' => $players] + (array_keys($ordered) === ['Kids'] ? ['fit' => 'youth'] : []);

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

    /** A size in a table's size column: also youth sizes ("10Y", "Y12" => Kids). Headings use size() only. */
    private function cellSize(string $cell): ?string
    {
        return OrderFormAi::siteSize($cell) ?? $this->size($cell);
    }

    /** A garment (with sport and fit) named in a cell, or null. */
    private function garment(string $cell): ?array
    {
        if (trim($cell) === '') {
            return null;
        }
        $read = $this->assistant->parse('1 '.trim($cell).' M');
        $item = $read['items'][0] ?? null;

        return $item ? ['garment' => $item['garment'], 'sport' => $item['sport'], 'fit' => $item['fit']] : null;
    }
}
