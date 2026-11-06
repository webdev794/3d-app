<?php

namespace App\Services;

use App\Models\Order;

/**
 * The Order Assistant's reading of an order (task TL-3, client 2026-11-05): order lines from any order sheet, notes or
 * pictures, grouped by design / colour and garment with Kids / Womens / Mens size tables and totals, the things to
 * check (as the client's "MANTIS ASSISTANT" example: typos like "Men %XL", possible double orders, people with
 * different sizes on different lines, lines with no member name, designs nobody ordered) and the rows of our order
 * form. A sheet with a header row (Size and Garment / Colour / Design columns) is read here, line by line, with no AI;
 * anything else is read by 3DEEZI AI into the same lines (OrderAssistantAi).
 *
 * A line: {row, source, order, member, garment (our garment id), product ("Polo"), collection ("Line Uniform"),
 * design ("Annie More – Turquoise"), size_written, size (site size or null), fit (mens / womens / youth), qty, note,
 * guess (a size read from a typo)}.
 */
class OrderAnalysis
{
    /** Garment words in a sheet, as our garments (the first match wins: "polo shirt" is a polo). */
    public const GARMENT_WORDS = [
        'polo' => 'polo', 'singlet' => 'singlet', 'tank' => 'singlet', 'netball dress' => 'singlet', 'dress' => 'singlet',
        'hoodie' => 'hoodie', 'hoody' => 'hoodie', 'jumper' => 'hoodie', 'jacket' => 'jacket', 'warm up' => 'warmup',
        'warmup' => 'warmup', 'track pants' => 'pants', 'trackpants' => 'pants', 'pants' => 'pants', 'shorts' => 'shorts',
        'socks' => 'socks', 'cap' => 'cap', 'hat' => 'cap', 'beanie' => 'cap', 'jersey' => 'jersey', 'guernsey' => 'jersey',
        'tee' => 'tee', 't-shirt' => 'tee', 'tshirt' => 'tee', 't shirt' => 'tee', 'shirt' => 'tee', 'top' => 'tee',
    ];

    /** The garment's name on the forms when the sheet has its own word ("Tank" stays a singlet named "Singlet"). */
    public const PRODUCT_NAMES = ['polo' => 'Polo', 'singlet' => 'Singlet', 'hoodie' => 'Hoodie', 'jacket' => 'Jacket',
        'warmup' => 'Warm-up top', 'pants' => 'Track pants', 'shorts' => 'Shorts', 'socks' => 'Socks', 'cap' => 'Cap',
        'jersey' => 'Jersey', 'tee' => 'Tee', 'other' => 'Garment'];

    /** A jersey with no sport said: each sport has its own jersey, so it is not guessed (a check asks which sport). */
    public const NO_SPORT_JERSEY = 'Jersey (sport not given)';

    /** Our garments as the catalog's 3D garments, most likely first ("jersey" is a basketball or AFL singlet when the sport has no jersey). */
    private const CATALOG_GARMENTS = [
        'jersey' => ['jersey', 'nfljersey', 'netball-dress', 'singlet'], 'singlet' => ['singlet', 'netball-dress'], 'tee' => ['tee', 'shooting-shirt', 'compression'],
        'polo' => ['polo', 'pocketpolo'], 'hoodie' => ['hoodie', 'ziphoodie'], 'warmup' => ['hoodie', 'trackjacket'], 'jacket' => ['trackjacket', 'varsity'],
        'pants' => ['track-pants', 'nfl-pants', 'cricket-pants', 'race-pants'], 'shorts' => ['shorts', 'fight-shorts', 'bib-shorts'], 'socks' => ['socks'],
        'cap' => ['cap', 'five-panel-cap', 'bucket-hat', 'beanie'],
    ];

    /** Header words per column (lower case, without punctuation). */
    private const HEADERS = [
        'order' => ['order', 'order no', 'order number', 'order id', 'order #', 'invoice', 'ref', 'reference'],
        'member' => ['member', 'name', 'player', 'person', 'full name', 'player name', 'member name', 'wearer', 'customer', 'first name'],
        'garment' => ['garment', 'item', 'product', 'apparel', 'garment type', 'style'],
        'type' => ['type', 'kind', 'cut'],
        'design' => ['colour', 'color', 'design', 'line', 'colour line', 'family line', 'colourway', 'colorway', 'family', 'team', 'group'],
        'size' => ['size', 'sizes', 'garment size'],
        'qty' => ['qty', 'quantity', 'count', 'amount', 'units', 'pcs', 'pieces', 'number of garments', 'number of shirts', 'number of items', 'no of garments', 'no of items'],
        'note' => ['note', 'notes', 'comment', 'comments', 'remarks'],
        // "Number", "No" or "#" in a team sheet is the shirt number (one garment each), not a quantity.
        'number' => ['jersey number', 'player number', 'shirt number', 'no on back', 'back number', 'number', 'no', 'num', '#', 'jersey no', 'shirt no', 'player no'],
    ];

    /** Names that mean "nobody". */
    private const NO_NAMES = ['', '(unassigned)', 'unassigned', 'tbc', 'tba', 'n/a', 'na', '-', '?', 'unknown', 'none', 'spare', 'extra'];

    /** Colour words we know, for spelling ("Torquoise" -> "Turquoise") and the page colours. */
    public const COLOURS = [
        'turquoise' => '#3ec9b8', 'teal' => '#1f8f8a', 'maroon' => '#8e1c3a', 'baby blue' => '#7cc4ec', 'lime green' => '#8bc63f',
        'lime' => '#8bc63f', 'yellow' => '#f1c40f', 'gold' => '#e7b416', 'orange' => '#f08a24', 'red' => '#d7262e',
        'purple' => '#7d3fc7', 'pink' => '#e04b9a', 'navy blue' => '#1d2f6f', 'navy' => '#1d2f6f', 'royal blue' => '#2456c9',
        'sky blue' => '#69b7ea', 'blue' => '#2f6fd6', 'green' => '#2e9e4f', 'black' => '#1b1b1b', 'white' => '#e9eef2',
        'grey' => '#8a959e', 'gray' => '#8a959e', 'brown' => '#7a4b2a', 'silver' => '#b8c2c8', 'aqua' => '#2fd3d3',
        'burgundy' => '#7a1f35', 'violet' => '#8452c8', 'magenta' => '#c2378d', 'cream' => '#efe3c4', 'charcoal' => '#3b4148',
        'emerald' => '#1f9e6a', 'cyan' => '#00bcd4', 'coral' => '#f2775e', 'mint' => '#8fe0c0', 'olive' => '#7d8b2e', 'khaki' => '#b9a46a',
    ];

    /** Common sheet words spelt often wrong (titles, designs). */
    private const WORDS = ['reunion', 'family', 'turquoise', 'opening', 'uniform', 'committee', 'singlet', 'jersey', 'hoodie', 'maroon', 'purple', 'orange', 'yellow'];

    /** Keys typed with Shift by mistake ("Men %XL" is 5XL). */
    private const SHIFTED = ['!' => '1', '@' => '2', '#' => '3', '$' => '4', '%' => '5', '^' => '6', '&' => '7', '*' => '8', '(' => '9', ')' => '0'];

    public const MAX_LINES = 5000;

    /* ------------------------------------------------------------------------------------------------ reading */

    /**
     * The order lines of one sheet (rows of cells, as read), or null when it has no header row we know (no Size column,
     * or no Garment / Colour / Design column): then 3DEEZI AI reads it.
     *
     * @param  array<int, array<int, string>>  $rows  rows of cells; the key is the sheet row number when known
     */
    public static function linesFromTable(array $rows, string $source = ''): ?array
    {
        $rows = array_filter($rows, fn ($r) => is_array($r) && array_filter($r, fn ($v) => trim((string) $v) !== ''));
        $columns = null;
        $headerAt = null;
        foreach (array_slice($rows, 0, 20, true) as $n => $row) {
            $found = self::headerColumns($row);
            if ($found !== null) {
                [$columns, $headerAt] = [$found, $n];
                break;
            }
        }
        if ($columns === null) {
            return null;
        }
        $lines = [];
        $past = false;
        foreach ($rows as $n => $row) {
            if (! $past) {
                $past = $n === $headerAt;

                continue;
            }
            if (count($lines) >= self::MAX_LINES) {
                break;
            }
            $cell = fn (string $key) => isset($columns[$key]) ? trim(preg_replace('/\s+/u', ' ', (string) ($row[$columns[$key]] ?? '')) ?? '') : '';
            // A header row repeated lower down, or a totals row.
            if (self::headerColumns($row) !== null || preg_match('/^(grand )?totals?\b/i', implode(' ', array_map('strval', $row)))) {
                continue;
            }
            $line = self::line([
                'row' => is_int($n) ? $n : count($lines) + 1, 'source' => $source, 'order' => $cell('order'), 'member' => $cell('member'),
                'garment' => $cell('garment'), 'type' => $cell('type'), 'design' => $cell('design'), 'size' => $cell('size'),
                'qty' => isset($columns['qty']) ? $cell('qty') : '1', 'note' => trim($cell('note').($cell('number') !== '' ? ' #'.$cell('number') : '')),
            ]);
            if ($line) {
                $lines[] = $line;
            }
        }

        return $lines;
    }

    /** Column numbers by meaning when $row is a header row (Size and one of Garment / Colour / Design), else null. */
    public static function headerColumns(array $row): ?array
    {
        $columns = [];
        foreach ($row as $i => $value) {
            $text = trim(preg_replace('/[^a-z0-9# ]+/', ' ', mb_strtolower((string) $value)) ?? '');
            $text = preg_replace('/\s+/', ' ', $text) ?? $text;
            if ($text === '' || mb_strlen($text) > 40) {
                continue;
            }
            foreach (self::HEADERS as $key => $words) {
                if (isset($columns[$key])) {
                    continue;
                }
                foreach ($words as $word) {
                    if ($text === $word || preg_match('/^'.preg_quote($word, '/').'\b/', $text) && $key !== 'qty' && $key !== 'type') {
                        // "Colour / Line" is the design; "Registered family?" is not a design (a yes / no column).
                        if ($key === 'design' && str_contains($text, 'registered')) {
                            continue 2;
                        }
                        $columns[$key] = $i;

                        continue 3;
                    }
                }
            }
        }
        if (! isset($columns['size']) || ! (isset($columns['garment']) || isset($columns['design']))) {
            return null;
        }

        return $columns;
    }

    /**
     * One order line from its written parts (a sheet row, or 3DEEZI AI's reading): garment, size and fit read; null
     * when the line orders nothing (no garment, no design and no size).
     *
     * @param  array{row?:int, source?:string, order?:string, member?:string, garment?:string, type?:string, design?:string, size?:string, qty?:mixed, note?:string}  $in
     */
    public static function line(array $in): ?array
    {
        $garmentText = trim((string) ($in['garment'] ?? ''));
        $typeText = trim((string) ($in['type'] ?? ''));
        $designText = trim((string) ($in['design'] ?? ''));
        $sizeText = trim((string) ($in['size'] ?? ''));
        if ($garmentText === '' && $typeText === '' && $sizeText === '' && $designText === '') {
            return null;
        }
        // The garment: the Type column first ("Line Uniform" + "Polo"), else the garment's own words ("Opening Day Polo").
        $garment = self::garmentOf($typeText) ?? self::garmentOf($garmentText) ?? self::garmentOf($designText);
        $collection = $garmentText;
        if ($garment && self::garmentOf($typeText) === null) {
            // "Opening Day Polo": the collection is the words before the garment word.
            $collection = self::withoutGarmentWord($garmentText);
        }
        // The sport named for it ("Football jersey", or the sport the reader passes): each sport has its own model,
        // named as in the catalog ("Football jersey", "Netball dress", "Rugby playing shorts").
        $sportText = trim((string) ($in['sport'] ?? ''));
        $sport = $garment ? (self::sportId($sportText) ?? self::sportOf($typeText.' '.$garmentText)) : null;
        if ($sport) {
            $collection = self::withoutSportWords($collection);
        }
        $collection = self::tidy($collection);
        // "Jersey" on its own (the notes reader's garment) is no collection: "Football jersey", not "Jersey Football jersey".
        if ($garment && $collection !== '' && self::withoutGarmentWord($collection) === '') {
            $collection = '';
        }
        $model = $sport ? self::model($sport, $garment, $typeText.' '.$garmentText) : null;
        $product = match (true) {
            $model !== null => $model,
            $garment === 'jersey' => self::NO_SPORT_JERSEY,
            (bool) $garment => self::PRODUCT_NAMES[$garment],
            default => $typeText !== '' ? self::tidy($typeText) : 'Garment',
        };
        $design = self::tidyDesign($designText);
        [$size, $fit, $guess] = self::size($sizeText);
        $qtyText = trim((string) ($in['qty'] ?? ''));
        $qty = $qtyText === '' ? null : (is_numeric(str_replace(',', '.', $qtyText)) ? (int) round((float) str_replace(',', '.', $qtyText)) : null);

        return [
            'row' => (int) ($in['row'] ?? 0), 'source' => (string) ($in['source'] ?? ''),
            'order' => self::tidy((string) ($in['order'] ?? '')), 'member' => self::tidy((string) ($in['member'] ?? '')),
            'garment' => $garment ?? 'other', 'sport' => $sport, 'product' => $product, 'collection' => $collection, 'design' => $design,
            'design_written' => $designText, 'size_written' => $sizeText, 'size' => $size, 'fit' => $fit, 'guess' => $guess,
            'qty' => $qty ?? ($qtyText === '' ? 1 : 0), 'qty_written' => $qtyText, 'note' => self::tidy((string) ($in['note'] ?? '')),
        ];
    }

    /** Our garment for written words ("Line Uniform Polo" polo), or null. */
    public static function garmentOf(string $text): ?string
    {
        $t = ' '.mb_strtolower(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $text) ?? '').' ';
        foreach (self::GARMENT_WORDS as $word => $garment) {
            if (str_contains($t, ' '.$word.' ') || str_contains($t, ' '.$word.'s ')) {
                return $garment;
            }
        }

        return null;
    }

    /** Sport words in order lines ("training" is a garment word there, "Training tee"; "guernsey" is AFL's). */
    private static function sportWords(): array
    {
        static $words = null;
        if ($words === null) {
            $ids = array_column((array) config('catalog.sports', []), 'id');
            $words = array_filter(OrderAssistant::SPORT_WORDS + ['guernsey' => 'afl'], fn ($id, $word) => in_array($id, $ids, true) && ! in_array($word, ['training', 'teamwear', 'club casual'], true), ARRAY_FILTER_USE_BOTH);
        }

        return $words;
    }

    /** The catalog sport named in written words ("Football jersey" football, "Rugby shorts" rugby-union), or null. */
    public static function sportOf(string $text): ?string
    {
        return self::sportsIn($text)[0] ?? null;
    }

    /** Every catalog sport named in a text, in the order of the sport words ("american football" is not also football). */
    public static function sportsIn(string $text): array
    {
        $t = ' '.mb_strtolower(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $text) ?? '').' ';
        $found = [];
        foreach (self::sportWords() as $word => $id) {
            if (str_contains($t, ' '.$word.' ')) {
                $found[$id] = true;
                $t = str_replace(' '.$word.' ', ' | ', $t);
            }
        }

        return array_keys($found);
    }

    /** A catalog sport id as given ("football"), or the sport its words name ("Soccer"), or null. */
    public static function sportId(string $text): ?string
    {
        $id = mb_strtolower(trim($text));
        if ($id === '') {
            return null;
        }

        return in_array($id, self::sportWords(), true) ? $id : self::sportOf($text);
    }

    /** The words without the sport words ("Opening Day Rugby" "Opening Day"). */
    private static function withoutSportWords(string $text): string
    {
        foreach (array_keys(self::sportWords()) as $word) {
            $text = preg_replace('/\b'.preg_quote($word, '/').'\b/iu', ' ', $text) ?? $text;
        }

        return trim(preg_replace('/\s{2,}/', ' ', $text) ?? '', " -–—/");
    }

    /**
     * The catalog model for a garment of a sport, named as the customer would pick it: "Football jersey", "Netball
     * dress", "Rugby playing shorts", "Basketball singlet" (basketball's jersey). The tile whose name has the written
     * words wins ("training shorts"), else the sport's first tile of that garment. A garment the sport does not list
     * gets the sport's name in front ("Golf jacket").
     */
    public static function model(string $sport, string $garment, string $written = ''): string
    {
        $entry = collect((array) config('catalog.sports', []))->firstWhere('id', $sport) ?? [];
        $sportName = (string) ($entry['heading'] ?? $entry['name'] ?? ucfirst($sport));
        $words = fn (string $s) => array_values(array_filter(array_map(fn ($w) => preg_replace('/(?<=[a-z]{3})s$/', '', $w) ?? $w,
            explode(' ', mb_strtolower(preg_replace('/[^\p{L}\p{N}]+/u', ' ', self::withoutSportWords($s)) ?? '')))));
        $said = $words($written);
        $kinds = self::CATALOG_GARMENTS[$garment] ?? [];
        $best = null;
        $bestRank = null;
        foreach (array_values((array) ($entry['tiles'] ?? [])) as $i => $tile) {
            $id = (string) ($tile['garment'] ?? $tile['future'] ?? '');
            $kind = array_search($id, $kinds, true);
            $score = count(array_intersect($said, $words((string) $tile['name'])));
            if ($kind === false && $score === 0) {
                continue;
            }
            // More written words first, then the garment's own kind (a jersey before a singlet), then the catalog order.
            $rank = [-$score, $kind === false ? 99 : $kind, $i];
            if ($bestRank === null || $rank < $bestRank) {
                [$best, $bestRank] = [(string) $tile['name'], $rank];
            }
        }
        $best ??= self::PRODUCT_NAMES[$garment] ?? 'Garment';
        $has = fn (string $name, string $part) => mb_stripos($name, $part) !== false;
        if ($has($best, $sportName) || $has($best, (string) ($entry['name'] ?? $sportName))) {
            return $best;
        }
        // "Playing Shorts" "Rugby playing shorts" (words in capitals such as AFL or T-shirt kept).
        $lower = implode(' ', array_map(fn ($w) => preg_match('/^\p{Lu}\p{Ll}+$/u', $w) ? mb_strtolower($w) : $w, explode(' ', $best)));

        return $sportName.' '.$lower;
    }

    /** "Football jerseys", "Jerseys (sport not given)", "Shorts" (a name as a plural, for headings). */
    public static function pluralName(string $name): string
    {
        if (preg_match('/^(.*?)(\s*\(.*\))$/u', $name, $m)) {
            return self::pluralName($m[1]).$m[2];
        }

        return preg_match('/(ss|sh|ch|x)$/i', $name) ? $name.'es' : (preg_match('/s$/i', $name) ? $name : $name.'s');
    }

    private static function withoutGarmentWord(string $text): string
    {
        foreach (array_keys(self::GARMENT_WORDS) as $word) {
            $out = preg_replace('/\b'.preg_quote($word, '/').'s?\b/i', '', $text, 1, $count);
            if ($count) {
                return trim(preg_replace('/\s{2,}/', ' ', (string) $out) ?? '', " -–—/");
            }
        }

        return $text;
    }

    /**
     * The site size, the fit and a guess for a written size: "Women 14W" W14 womens, "Kids 8Y" 8Y youth, "Men 5XL"
     * 5XL mens; "Men %XL" null but guessed 5XL (a Shift key typo). [size|null, fit, guess|null]
     */
    public static function size(string $written): array
    {
        $fitWord = null;
        if (preg_match('/^\s*(womens?|women\'?s|ladies|lady|wmn|girls?)\b/i', $written)) {
            $fitWord = 'womens';
        } elseif (preg_match('/^\s*(kids?|youth|child(ren)?|junior|jnr|boys?)\b/i', $written)) {
            $fitWord = 'youth';
        } elseif (preg_match('/^\s*(mens?|men\'?s|male|adult|unisex)\b/i', $written)) {
            $fitWord = 'mens';
        }
        $site = Order::siteSize($written);
        if ($site === null) {
            // "Kids 8Y", "Women 14W": the size after the fit word.
            $rest = trim(preg_replace('/^\s*[a-z\']+\s+/i', '', $written) ?? '');
            if ($rest !== $written && $rest !== '') {
                $site = Order::siteSize($rest) ?? ($fitWord === 'womens' && preg_match('/^\d{1,2}$/', $rest) ? Order::siteSize('W'.$rest) : null)
                    ?? ($fitWord === 'youth' && preg_match('/^\d{1,2}$/', $rest) ? Order::siteSize($rest.'Y') : null);
            }
        }
        $guess = null;
        if ($site === null && $written !== '' && strpbrk($written, implode('', array_keys(self::SHIFTED))) !== false) {
            $guess = self::size(strtr($written, self::SHIFTED))[0];
        }
        $fit = self::fitOfSize($site ?? $guess) ?? $fitWord ?? 'mens';

        return [$site, $fit, $guess];
    }

    private static function fitOfSize(?string $size): ?string
    {
        return match (true) {
            $size === null => null,
            in_array($size, Order::WOMENS_SIZES, true) => 'womens',
            in_array($size, [...Order::KIDS_SIZES, Order::OLD_KIDS], true) => 'youth',
            default => 'mens',
        };
    }

    public static function tidy(string $text): string
    {
        return trim(preg_replace('/\s+/u', ' ', $text) ?? '');
    }

    /** "Annie More- Torquoise" "Annie More – Turquoise" (the dash spaced, known colour words spelt right). */
    public static function tidyDesign(string $text): string
    {
        $t = self::tidy($text);
        if ($t === '') {
            return '';
        }
        $t = preg_replace('/\s*[–—]\s*|\s+-\s*|\s*-\s+/u', ' – ', $t) ?? $t;

        return self::spellWords($t);
    }

    /** Known words spelt right ("Torquoise" Turquoise, "Reuion" Reunion), keeping the writer's capitals. */
    public static function spellWords(string $text): string
    {
        $known = [...array_filter(array_keys(self::COLOURS), fn ($w) => ! str_contains($w, ' ')), ...self::WORDS];

        return preg_replace_callback('/\p{L}{5,}/u', function ($m) use ($known) {
            $word = $m[0];
            $low = mb_strtolower($word);
            if (in_array($low, $known, true)) {
                return $word;
            }
            foreach ($known as $k) {
                if (abs(strlen($k) - strlen($low)) <= 1 && levenshtein($k, $low) === 1 || strlen($k) >= 8 && levenshtein($k, $low) === 2 && $k[0] === $low[0]) {
                    return ctype_upper(mb_substr($word, 0, 1)) ? ucfirst($k) : $k;
                }
            }

            return $word;
        }, $text) ?? $text;
    }

    /* ------------------------------------------------------------------------------------------------ analysis */

    /**
     * The whole analysis of the lines: groups (design / colour, with each garment's size tables), totals, the things
     * to check, the size columns used, and the order form's rows.
     *
     * @param  array<int, array>  $lines  from linesFromTable() / line()
     * @param  array<int, array{name:string, path?:string}>  $designs  design pictures the customer added (by name)
     */
    public static function analyse(array $lines, array $designs = [], string $title = ''): array
    {
        $groups = [];
        foreach ($lines as $i => $l) {
            $lines[$i]['index'] = $i;
            $design = $l['design'] !== '' ? $l['design'] : ($l['collection'] !== '' ? $l['collection'] : $l['product']);
            $key = mb_strtolower($design);
            $groups[$key] ??= ['key' => self::slug($design), 'design' => $design, 'colour' => self::colourOf($design), 'garments' => [], 'total' => 0, 'lines' => 0, 'check_lines' => []];
            $g = &$groups[$key];
            // Each sport's garment on its own row (a football jersey and a rugby jersey are different models).
            $gk = $l['garment'].'|'.($l['sport'] ?? '').'|'.mb_strtolower($l['collection']);
            $g['garments'][$gk] ??= ['garment' => $l['garment'], 'sport' => $l['sport'] ?? null, 'column' => self::columnOf($l), 'product' => $l['product'], 'collection' => $l['collection'],
                'name' => self::productName($l), 'total' => 0, 'sizes' => ['youth' => [], 'womens' => [], 'mens' => []], 'unsure' => 0];
            $row = &$g['garments'][$gk];
            $qty = max(0, (int) $l['qty']);
            $size = $l['size'] ?? $l['guess'];
            if ($size !== null) {
                $row['sizes'][$l['fit']][$size] = ($row['sizes'][$l['fit']][$size] ?? 0) + $qty;
            } else {
                $row['unsure'] += $qty;
            }
            $row['total'] += $qty;
            $g['total'] += $qty;
            $g['lines']++;
            unset($g, $row);
        }
        $checks = self::checks($lines, $designs, $groups);
        $flagged = [];
        foreach ($checks as $c) {
            if (($c['counts'] ?? true) === false) {
                continue;
            }
            foreach ($c['lines'] ?? [] as $i) {
                $flagged[$i] = true;
            }
        }
        foreach ($groups as &$g) {
            $g['check_lines'] = 0;
            foreach ($lines as $l) {
                $design = $l['design'] !== '' ? $l['design'] : ($l['collection'] !== '' ? $l['collection'] : $l['product']);
                if (mb_strtolower($design) === mb_strtolower($g['design']) && isset($flagged[$l['index']])) {
                    $g['check_lines']++;
                }
            }
            // Sizes in the size order (M, L, XL…), as the tables show them.
            $rank = array_flip(Order::SIZES);
            foreach ($g['garments'] as &$row) {
                foreach ($row['sizes'] as &$set) {
                    uksort($set, fn ($a, $b) => ($rank[$a] ?? 99) <=> ($rank[$b] ?? 99));
                }
                unset($set);
            }
            unset($row);
            $g['garments'] = array_values($g['garments']);
        }
        unset($g);
        $groups = array_values($groups);
        // The design pictures: the customer's own choice, else the file name, else the picture's colour.
        $pictures = self::matchDesigns($groups, $designs);
        foreach ($groups as &$g) {
            $g['image'] = array_search($g['key'], $pictures, true) ?: null;
        }
        unset($g);
        foreach ($designs as $d) {
            if (! isset($pictures[$d['name']]) && ($d['group'] ?? null) !== 'none') {
                $checks[] = ['type' => 'unused', 'text' => sprintf('Nobody ordered the design in "%s".', $d['name']), 'lines' => [], 'counts' => false];
            }
        }
        // The family lines / colours first (biggest first is not wanted: the sheet's own order is kept), then groups
        // with no colour (Opening Day), as the client's example.
        usort($groups, fn ($a, $b) => (int) ($a['colour'] === null) <=> (int) ($b['colour'] === null));

        $byGarment = [];
        $byCollection = [];
        $byColumn = [];
        $columns = [];
        foreach ($groups as $g) {
            foreach ($g['garments'] as $row) {
                $byGarment[$row['garment']] = ($byGarment[$row['garment']] ?? 0) + $row['total'];
                $byCollection[$row['name']] = ($byCollection[$row['name']] ?? 0) + $row['total'];
                $byColumn[$row['column']] = ($byColumn[$row['column']] ?? 0) + $row['total'];
                $columns[$row['column']] ??= str_contains($row['column'], '@') || $row['product'] === self::NO_SPORT_JERSEY ? $row['product'] : (self::PRODUCT_NAMES[$row['garment']] ?? 'Garment');
            }
        }
        $total = array_sum(array_column($groups, 'total'));
        $orders = array_unique(array_filter(array_column($lines, 'order'), fn ($o) => $o !== ''));
        $members = array_unique(array_filter(array_map(fn ($l) => self::hasName($l['member']) ? mb_strtolower($l['member']) : '', $lines)));

        return [
            'title' => $title,
            'totals' => ['garments' => $total, 'lines' => count($lines), 'orders' => count($orders), 'members' => count($members),
                'groups' => count($groups), 'to_check' => count($flagged), 'by_garment' => $byGarment, 'by_product' => $byCollection,
                // The forms' garment columns: a garment, or a sport's model ("jersey@football" "Football jersey").
                'by_column' => $byColumn, 'columns' => $columns],
            'size_columns' => self::sizeColumns($groups),
            'groups' => $groups,
            'checks' => $checks,
            'lines' => array_map(fn ($l) => array_diff_key($l, ['index' => 1]), $lines),
            'items' => self::formItems($groups),
            'designs' => array_map(fn ($d) => ['name' => $d['name'], 'used' => isset($pictures[$d['name']]), 'group' => $pictures[$d['name']] ?? null,
                'how' => isset($pictures[$d['name']]) ? (($d['group'] ?? null) === $pictures[$d['name']] ? 'chosen' : ($d['matched'] ?? 'name')) : null], $designs),
        ];
    }

    /** "555 garments from 90 orders: 482 polos (including 227 Opening Day polos) and 73 singlets." */
    public static function summaryText(array $a): string
    {
        $t = $a['totals'];
        $plural = function (int $n, string $words): string {
            // "227 Opening Day polos": the garment word in small letters, the collection's own capitals kept.
            $parts = explode(' ', $words);
            $last = mb_strtolower(array_pop($parts));
            $parts[] = $last.($n === 1 || str_ends_with($last, 's') ? '' : 's');

            return $n.' '.implode(' ', $parts);
        };
        $parts = [];
        // Each sport's model by its own name ("1 Football jersey"); garments with no sport as before.
        $byColumn = $t['by_column'] ?? $t['by_garment'];
        foreach ($byColumn as $column => $n) {
            $garment = explode('@', (string) $column)[0];
            $name = $t['columns'][$column] ?? self::PRODUCT_NAMES[$garment] ?? 'garment';
            if (str_contains((string) $column, '@') || $name === self::NO_SPORT_JERSEY) {
                $shown = $n === 1 ? $name : self::pluralName($name);
                // "2 jerseys (sport not given)"; a model keeps its own name ("3 Football jerseys").
                $parts[] = $n.' '.($name === self::NO_SPORT_JERSEY ? mb_strtolower(mb_substr($shown, 0, 1)).mb_substr($shown, 1) : $shown);

                continue;
            }
            $named = array_filter($t['by_product'], fn ($k) => self::garmentOf($k) === $garment && mb_strtolower($k) !== mb_strtolower(self::PRODUCT_NAMES[$garment] ?? '')
                && self::sportOf($k) === null && $k !== self::NO_SPORT_JERSEY, ARRAY_FILTER_USE_KEY);
            $part = $plural($n, $name);
            if (count($named) > 1) {
                // The smallest named collection inside it ("including 227 Opening Day polos").
                $shown = array_slice(array_filter($named, fn ($k) => ! preg_match('/^line\b/i', $k), ARRAY_FILTER_USE_KEY), 0, 1, true);
                foreach ($shown as $name => $count) {
                    $part .= ' (including '.$plural($count, $name).')';
                }
            }
            $parts[] = $part;
        }
        $from = $t['orders'] > 1 ? ' from '.$t['orders'].' orders' : ($t['members'] > 1 ? ' for '.$t['members'].' people' : '');
        $list = count($parts) > 1 ? implode(', ', array_slice($parts, 0, -1)).' and '.end($parts) : ($parts[0] ?? '');

        return $t['garments'].' garment'.($t['garments'] === 1 ? '' : 's').$from.': '.$list.'.';
    }

    /** The forms' garment column of a line: "jersey", or "jersey@football" for a sport's model. */
    private static function columnOf(array $l): string
    {
        return $l['garment'].(! empty($l['sport']) ? '@'.$l['sport'] : '');
    }

    /** "Line Uniform Polo", "Opening Day Polo", or "Polo". */
    private static function productName(array $l): string
    {
        $c = $l['collection'];
        if ($c === '' || mb_stripos($c, $l['product']) !== false) {
            return $c !== '' ? $c : $l['product'];
        }

        return $c.' '.$l['product'];
    }

    public static function hasName(string $member): bool
    {
        return ! in_array(mb_strtolower(trim($member)), self::NO_NAMES, true);
    }

    /** The things to check, each {type, text, lines (indexes), counts (towards "to check")}. */
    private static function checks(array $lines, array $designs, array $groups): array
    {
        $checks = [];
        $sizeOf = fn ($l) => $l['size'] ?? $l['guess'] ?? $l['size_written'];
        foreach ($lines as $l) {
            if ($l['size'] === null) {
                $checks[] = $l['guess'] !== null
                    ? ['type' => 'size', 'text' => sprintf('%s size reads "%s", which looks like a typo for %s (row %d). Counted as %s.', self::who($l), $l['size_written'], self::sizeLabel($l['guess']), $l['row'], self::sizeLabel($l['guess'])), 'lines' => [$l['index']]]
                    : ['type' => 'size', 'text' => $l['size_written'] === ''
                        ? sprintf('%s: no size given (row %d).', self::whose($l), $l['row'])
                        : sprintf('%s has "%s" (row %d): not a size we know. Counted, with no size.', self::who($l), $l['size_written'], $l['row']), 'lines' => [$l['index']]];
            }
            if ($l['qty'] <= 0 || $l['qty_written'] === '') {
                $checks[] = ['type' => 'qty', 'text' => $l['qty_written'] === ''
                    ? sprintf('Row %d (%s) has no quantity: counted as 1.', $l['row'], self::whose($l))
                    : sprintf('Row %d (%s) has quantity "%s": not counted.', $l['row'], self::whose($l), $l['qty_written']), 'lines' => [$l['index']]];
            }
            if ($l['garment'] === 'other') {
                $checks[] = ['type' => 'garment', 'text' => sprintf('Row %d: "%s" is not a garment we know. Check what it is.', $l['row'], trim($l['collection'].' '.$l['product'])), 'lines' => [$l['index']]];
            }
        }
        // Jerseys with no sport: each sport has its own jersey, so ask which.
        $noSport = array_values(array_filter($lines, fn ($l) => $l['product'] === self::NO_SPORT_JERSEY));
        if ($noSport) {
            $rows = array_map(fn ($l) => (string) $l['row'], $noSport);
            $checks[] = ['type' => 'sport', 'text' => sprintf('%s (%s %s): which sport %s for? Each sport has its own model (Football jersey, Rugby jersey, Basketball singlet, Netball dress…).',
                count($noSport) === 1 ? self::NO_SPORT_JERSEY : self::pluralName(self::NO_SPORT_JERSEY), count($rows) === 1 ? 'row' : 'rows',
                self::names($rows), count($noSport) === 1 ? 'is it' : 'are they'), 'lines' => array_column($noSport, 'index')];
        }
        // The same person, the same garment and design on more than one line.
        $byPerson = [];
        foreach ($lines as $l) {
            if (self::hasName($l['member'])) {
                $byPerson[mb_strtolower($l['member'])][] = $l;
            }
        }
        $doubles = [];
        $mixed = [];
        foreach ($byPerson as $own) {
            $same = [];
            foreach ($own as $l) {
                $same[$l['garment'].'|'.mb_strtolower($l['collection']).'|'.mb_strtolower($l['design'])][] = $l;
            }
            foreach ($same as $set) {
                if (count($set) > 1) {
                    $doubles[] = $set;
                }
            }
            $sizes = array_values(array_unique(array_map($sizeOf, $own)));
            if (count($sizes) > 1) {
                $mixed[] = [$own, $sizes];
            }
        }
        if ($doubles) {
            $names = array_values(array_unique(array_map(fn ($set) => $set[0]['member'], $doubles)));
            $first = $doubles[0];
            $checks[] = ['type' => 'double', 'text' => sprintf('Possible double orders: %s %s the same garment on more than one line (e.g. %s: %s).',
                self::names($names), count($names) === 1 ? 'has' : 'have', $first[0]['member'],
                implode(', ', array_map(fn ($l) => self::productName($l).($l['design'] !== '' ? ' '.$l['design'] : '').' '.self::sizeLabel($sizeOf($l)).' (row '.$l['row'].')', $first))),
                'lines' => array_merge(...array_map(fn ($set) => array_column($set, 'index'), $doubles)), 'people' => $names];
        }
        if ($mixed) {
            [$own, $sizes] = $mixed[0];
            $checks[] = ['type' => 'sizes', 'text' => sprintf('%d %s ordered different sizes on different lines. For example, %s has %s.',
                count($mixed), count($mixed) === 1 ? 'person' : 'people', $own[0]['member'], self::names(array_map(fn ($s) => self::sizeLabel($s), $sizes))),
                'lines' => array_merge(...array_map(fn ($m) => array_column($m[0], 'index'), $mixed)),
                'people' => array_map(fn ($m) => $m[0][0]['member'].': '.implode(', ', array_map(fn ($s) => self::sizeLabel($s), $m[1])), $mixed)];
        }
        $hasNames = (bool) array_filter($lines, fn ($l) => self::hasName($l['member']));
        $nameless = array_values(array_filter($lines, fn ($l) => ! self::hasName($l['member'])));
        if ($hasNames && $nameless) {
            $checks[] = ['type' => 'names', 'text' => sprintf('%d %s have a member name.', count($nameless), count($nameless) === 1 ? 'line doesn’t' : 'lines don’t'),
                'lines' => array_column($nameless, 'index'), 'counts' => false];
        }
        // Spelling the reader put right.
        $fixed = [];
        foreach ($lines as $l) {
            $plain = self::tidy(preg_replace('/\s*[-–—]\s*/u', ' – ', $l['design_written']) ?? '');
            if ($l['design_written'] !== '' && mb_strtolower($plain) !== mb_strtolower($l['design'])) {
                $fixed[$l['design_written']] = $l['design'];
            }
        }
        foreach ($fixed as $from => $to) {
            $checks[] = ['type' => 'spelling', 'text' => sprintf('"%s" is read as "%s".', $from, $to), 'lines' => [], 'counts' => false];
        }

        return $checks;
    }

    /** "Football jersey", "Sam’s Football jersey". */
    private static function whose(array $l): string
    {
        $what = self::productName($l);

        return self::hasName($l['member']) ? $l['member'].'’s '.$what : mb_strtoupper(mb_substr($what, 0, 1)).mb_substr($what, 1);
    }

    private static function who(array $l): string
    {
        $what = self::productName($l);

        return self::hasName($l['member']) ? $l['member'].'’s '.$what : 'A '.$what;
    }

    /** "Men 5XL", "Women 14W", "Kids 8Y" (as the sheets write them). */
    public static function sizeLabel(?string $size): string
    {
        return match (true) {
            $size === null || $size === '' => 'no size',
            in_array($size, Order::WOMENS_SIZES, true) => 'Women '.substr($size, 1).'W',
            in_array($size, Order::KIDS_SIZES, true) => 'Kids '.$size,
            in_array($size, Order::MENS_SIZES, true) => 'Men '.$size,
            default => $size,
        };
    }

    private static function names(array $names): string
    {
        $names = array_values($names);
        if (count($names) <= 1) {
            return $names[0] ?? '';
        }
        $shown = array_slice($names, 0, 3);
        $more = count($names) - count($shown);

        return $more > 0 ? implode(', ', $shown).' and '.$more.' more' : implode(', ', array_slice($shown, 0, -1)).' and '.end($shown);
    }

    /** The size columns used, per set, from the first used to the last used (as the client's tables). */
    private static function sizeColumns(array $groups): array
    {
        $sets = ['youth' => Order::KIDS_SIZES, 'womens' => Order::WOMENS_SIZES, 'mens' => Order::MENS_SIZES];
        $out = [];
        foreach ($sets as $fit => $all) {
            $used = [];
            foreach ($groups as $g) {
                foreach ($g['garments'] as $row) {
                    foreach ($row['sizes'][$fit] as $s => $n) {
                        if ($n > 0) {
                            $used[$s] = true;
                        }
                    }
                }
            }
            if ($fit === 'youth' && $used && isset($used[Order::OLD_KIDS])) {
                $all = [...$all, Order::OLD_KIDS];
            }
            $at = array_keys(array_filter($all, fn ($s) => isset($used[$s])));
            $out[$fit] = $at ? array_slice($all, min($at), max($at) - min($at) + 1) : [];
        }

        return $out;
    }

    /** The order form's rows: one per design, garment and fit, named "Line Uniform Polo – Annie More – Turquoise". */
    private static function formItems(array $groups): array
    {
        $items = [];
        foreach ($groups as $g) {
            foreach ($g['garments'] as $row) {
                foreach (['mens', 'womens', 'youth'] as $fit) {
                    $sizes = array_filter($row['sizes'][$fit], fn ($n) => $n > 0);
                    if (! $sizes) {
                        continue;
                    }
                    $label = mb_strtolower($row['name']) === mb_strtolower($g['design']) || mb_stripos($row['name'], $g['design']) !== false
                        ? $row['name'] : $row['name'].' – '.$g['design'];
                    $items[] = ['garment' => $row['garment'] === 'other' ? 'other' : $row['garment'], 'sport' => $row['sport'] ?? null, 'fit' => $fit,
                        'label' => mb_substr($label, 0, 60), 'design' => $g['design'], 'sizes' => $sizes];
                }
            }
        }

        return $items;
    }

    public static function slug(string $text): string
    {
        $s = trim(preg_replace('/[^a-z0-9]+/', '-', mb_strtolower($text)) ?? '', '-');

        return $s !== '' ? mb_substr($s, 0, 60) : 'group';
    }

    /** A page colour for a design named with a colour ("Lilly – Yellow/Gold"), or null. */
    public static function colourOf(string $design): ?string
    {
        $t = ' '.mb_strtolower(preg_replace('/[^\p{L}]+/u', ' ', $design) ?? '').' ';
        $best = null;
        $at = PHP_INT_MAX;
        foreach (self::COLOURS as $word => $hex) {
            $p = mb_strpos($t, ' '.$word.' ');
            // The first colour word written wins; a longer one at the same place ("navy blue" before "navy").
            if ($p !== false && ($p < $at || $p === $at && mb_strlen($word) > mb_strlen((string) $best))) {
                [$best, $at] = [$word, $p];
            }
        }

        return $best === null ? null : self::COLOURS[$best];
    }

    /**
     * Which picture shows which group: {picture name: group key}. First the customer's choice (design.group, "none"
     * for a picture of no group), then a file name naming the group ("Annie More - Torquoise.png"), then a colour
     * word in the name ("teal polo.jpg") when one group has it, then the picture's main colour (design.colour)
     * nearest a group's colour that has no picture yet.
     */
    public static function matchDesigns(array $groups, array &$designs): array
    {
        $out = [];
        $taken = [];
        $keys = array_column($groups, 'key');
        foreach ($designs as $d) {
            $choice = $d['group'] ?? null;
            if ($choice && $choice !== 'none' && in_array($choice, $keys, true)) {
                $out[$d['name']] = $choice;
                $taken[$choice] = true;
            }
        }
        foreach ($designs as $i => $d) {
            if (isset($out[$d['name']]) || ($d['group'] ?? null) === 'none') {
                continue;
            }
            foreach ($groups as $g) {
                if (! isset($taken[$g['key']]) && self::sameName($d['name'], $g['design'])) {
                    [$out[$d['name']], $taken[$g['key']]] = [$g['key'], true];
                    $designs[$i]['matched'] = 'name';
                    break;
                }
            }
        }
        foreach ($designs as $i => $d) {
            if (isset($out[$d['name']]) || ($d['group'] ?? null) === 'none') {
                continue;
            }
            $hex = self::colourOf(pathinfo($d['name'], PATHINFO_FILENAME));
            $same = $hex ? array_values(array_filter($groups, fn ($g) => $g['colour'] === $hex && ! isset($taken[$g['key']]))) : [];
            if (count($same) === 1) {
                [$out[$d['name']], $taken[$same[0]['key']]] = [$same[0]['key'], true];
                $designs[$i]['matched'] = 'name';
            }
        }
        $pairs = [];
        foreach ($designs as $i => $d) {
            // A name with its own colour word that no group has ("Committee brown.jpg") is not matched by colour.
            if (isset($out[$d['name']]) || ($d['group'] ?? null) === 'none' || empty($d['colour']) || self::colourOf(pathinfo($d['name'], PATHINFO_FILENAME)) !== null) {
                continue;
            }
            foreach ($groups as $g) {
                if (! isset($taken[$g['key']]) && $g['colour']) {
                    $pairs[] = [self::colourDistance($d['colour'], $g['colour']), $i, $g['key']];
                }
            }
        }
        usort($pairs, fn ($a, $b) => $a[0] <=> $b[0]);
        foreach ($pairs as [$distance, $i, $key]) {
            $name = $designs[$i]['name'];
            if ($distance > 60 || isset($out[$name]) || isset($taken[$key])) {
                continue;
            }
            [$out[$name], $taken[$key]] = [$key, true];
            $designs[$i]['matched'] = 'colour';
        }

        return $out;
    }

    /** How far apart two colours look (weighted RGB, 0 to about 255). */
    public static function colourDistance(string $a, string $b): float
    {
        [$r1, $g1, $b1] = sscanf(ltrim($a, '#'), '%02x%02x%02x');
        [$r2, $g2, $b2] = sscanf(ltrim($b, '#'), '%02x%02x%02x');
        $rm = ($r1 + $r2) / 2;

        return sqrt((2 + $rm / 256) * ($r1 - $r2) ** 2 + 4 * ($g1 - $g2) ** 2 + (2 + (255 - $rm) / 256) * ($b1 - $b2) ** 2) / 3;
    }

    /** A picture's main colour (its coloured pixels, not a white, black or grey background), or null. */
    public static function mainColour(string $bytes): ?string
    {
        $img = function_exists('imagecreatefromstring') ? @imagecreatefromstring($bytes) : false;
        if (! $img) {
            return null;
        }
        $small = imagecreatetruecolor(48, 48);
        imagecopyresampled($small, $img, 0, 0, 0, 0, 48, 48, imagesx($img), imagesy($img));
        $bins = [];
        for ($x = 0; $x < 48; $x++) {
            for ($y = 0; $y < 48; $y++) {
                $c = imagecolorat($small, $x, $y);
                [$r, $g, $b] = [($c >> 16) & 255, ($c >> 8) & 255, $c & 255];
                if (max($r, $g, $b) < 40 || max($r, $g, $b) - min($r, $g, $b) < 45) {
                    continue;
                }
                $bins[intdiv($r, 48).'-'.intdiv($g, 48).'-'.intdiv($b, 48)][] = [$r, $g, $b];
            }
        }
        imagedestroy($img);
        imagedestroy($small);
        if (! $bins) {
            return null;
        }
        uasort($bins, fn ($a, $b) => count($b) <=> count($a));
        $top = reset($bins);
        $n = count($top);

        return sprintf('#%02x%02x%02x', (int) (array_sum(array_column($top, 0)) / $n), (int) (array_sum(array_column($top, 1)) / $n), (int) (array_sum(array_column($top, 2)) / $n));
    }

    /** The design picture named like the group (file name words), or null. */
    public static function designFor(string $design, array $designs): ?string
    {
        foreach ($designs as $d) {
            if (self::sameName($d['name'], $design)) {
                return $d['name'];
            }
        }

        return null;
    }

    /** A picture's file name names a design when every word of the design's first part is in it ("annie-more.jpg"). */
    public static function sameName(string $file, string $design): bool
    {
        $words = fn (string $s) => array_values(array_filter(explode(' ', preg_replace('/[^a-z0-9]+/', ' ', mb_strtolower(self::spellWords($s))) ?? ''), fn ($w) => strlen($w) > 1 && ! in_array($w, ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'the', 'and', 'polo', 'polos', 'singlet', 'design', 'mockup'], true)));
        $f = $words(pathinfo($file, PATHINFO_FILENAME));
        $first = $words(preg_split('/\s+–\s+/u', $design)[0] ?? $design);
        $all = $words($design);

        return $first && ! array_diff($first, $f) || $all && count(array_intersect($all, $f)) >= max(2, (int) ceil(count($all) * .6));
    }

    /* ------------------------------------------------------------------------------------------------ files */

    /**
     * A sheet file's rows of cells (xlsx / ods via the AI reader's text, csv / txt split here), keyed by the sheet row
     * number; [] when it has none. Only the first sheet with a header row we know is used.
     */
    public static function tableRows(string $path, string $extension): array
    {
        $extension = strtolower($extension);
        if (in_array($extension, ['csv', 'tsv', 'txt'], true)) {
            $text = (string) file_get_contents($path, false, null, 0, 4 * 1024 * 1024);
            $text = preg_replace('/^\xEF\xBB\xBF/', '', $text) ?? $text;
            if (! mb_check_encoding($text, 'UTF-8')) {
                $text = mb_convert_encoding($text, 'UTF-8', 'Windows-1252');
            }
            $lines = preg_split('/\r\n|\r|\n/', $text) ?: [];
            $sep = $extension === 'tsv' || substr_count($lines[0] ?? '', "\t") > substr_count($lines[0] ?? '', ',') ? "\t" : (substr_count($lines[0] ?? '', ';') > substr_count($lines[0] ?? '', ',') ? ';' : ',');
            $rows = [];
            foreach ($lines as $i => $line) {
                if (trim($line) !== '') {
                    $rows[$i + 1] = array_map('trim', str_getcsv($line, $sep, '"', ''));
                }
            }

            return $rows;
        }
        if (! in_array($extension, ['xlsx', 'ods'], true)) {
            return [];
        }
        $text = app(OrderFormAi::class)->text($path, $extension);
        if ($text === null) {
            return [];
        }
        $sheets = [];
        $current = -1;
        foreach (preg_split('/\r\n|\n/', $text) ?: [] as $line) {
            if (preg_match('/^Sheet "/', $line)) {
                $sheets[++$current] = [];
            } elseif (preg_match('/^R(\d+): (.*)$/', $line, $m)) {
                $sheets[max(0, $current)][(int) $m[1]] = explode(' | ', $m[2]);
            }
        }
        foreach ($sheets as $rows) {
            foreach (array_slice($rows, 0, 20, true) as $row) {
                if (self::headerColumns($row) !== null) {
                    return $rows;
                }
            }
        }

        return $sheets[0] ?? [];
    }

    /** A title from a file name: "Strickland Family Reuion 20th Oct 2026 at 9pm (1).xlsx" "Strickland Family Reunion". */
    public static function titleFrom(string $fileName): string
    {
        $t = pathinfo($fileName, PATHINFO_FILENAME);
        $t = preg_replace('/\(\d+\)|\bcopy\b|[_]+/i', ' ', $t) ?? $t;
        $t = preg_replace('/\b\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b.*$/i', '', $t) ?? $t;
        $t = preg_replace('/\b(at\s+)?\d{1,2}(:\d{2})?\s*(am|pm)\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\b/i', '', $t) ?? $t;

        return self::spellWords(self::tidy($t));
    }
}
