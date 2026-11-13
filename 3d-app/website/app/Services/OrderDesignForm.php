<?php

namespace App\Services;

use App\Models\Order;

/**
 * The order form maker's form (client 2026-11-13, the MANTIS example: "from one prompt it done it perfect"): the team's
 * brand, the garment, and each design with its number, name, colourway, pictures (front / back) and sizes. It comes
 * from 3DEEZI AI's reading of the design pictures and one prompt (OrderFormMaker), or, without the AI, one design per
 * picture with the sizes the prompt gives. The customer corrects it in place (names, sizes); it is then turned into
 * order lines for OrderAnalysis, so the totals, the share page, the PDF, the Excel and the order form's rows all come
 * from the same data. The analysis keeps it as `form`.
 *
 * A form: {brand, garment ("Basketball singlet"), garment_id (Order::GARMENTS), sport, title, notes, unclear[],
 * unplaced[] (pictures in no design), source (ai / built-in / edited), same_sizes, total, designs: [{key, number, name,
 * colourway, label ("Tonga – Red"), colour (#rrggbb|null), pictures: [{name, view}], sizes: {size: qty}, total, note}]}.
 */
final class OrderDesignForm
{
    public const VIEWS = ['front_back', 'front', 'back', 'other'];

    public const MAX_DESIGNS = 20;

    private const MAX_QTY = 10000;

    /**
     * The AI's answer as a form. $pictures: the design pictures' names in the order they were sent ("Picture 1" first).
     *
     * @param  array<string, mixed>  $out
     * @param  array<int, string>  $pictures
     */
    public static function fromAi(array $out, array $pictures): array
    {
        $unclear = array_values(array_filter(array_map(fn ($u) => self::clip($u, 200), (array) ($out['unclear'] ?? []))));
        $designs = [];
        $used = [];
        foreach (array_slice((array) ($out['designs'] ?? []), 0, self::MAX_DESIGNS) as $d) {
            if (! is_array($d)) {
                continue;
            }
            $pics = [];
            foreach ((array) ($d['pictures'] ?? []) as $p) {
                $name = $pictures[(int) ($p['picture'] ?? 0) - 1] ?? null;
                if ($name === null || isset($used[$name])) {
                    continue;
                }
                $used[$name] = true;
                $pics[] = ['name' => $name, 'view' => in_array($p['view'] ?? '', self::VIEWS, true) ? $p['view'] : 'other'];
            }
            $designs[] = ['name' => self::clip($d['name'] ?? '', 60), 'colourway' => self::clip($d['colourway'] ?? '', 40), 'colour' => self::hex((string) ($d['colour'] ?? '')),
                'pictures' => $pics, 'sizes' => self::sizes((array) ($d['sizes'] ?? []), $unclear), 'note' => self::clip($d['note'] ?? '', 200)];
        }
        $garmentId = array_key_exists($out['garment_type'] ?? '', Order::GARMENTS) ? $out['garment_type'] : null;
        $garment = self::clip($out['garment'] ?? '', 60);

        return self::tidy([
            'brand' => self::clip($out['brand'] ?? '', 40), 'garment' => $garment, 'garment_id' => $garmentId ?? OrderAnalysis::garmentOf($garment) ?? 'other',
            'sport' => self::sport((string) ($out['sport'] ?? ''), $garment), 'title' => self::clip($out['title'] ?? '', 80), 'notes' => self::clip($out['notes'] ?? '', 600),
            'unclear' => $unclear, 'designs' => $designs, 'source' => 'ai',
            // A picture the reading left out: kept, so the customer can place it (it is listed to check).
            'unplaced' => array_values(array_filter($pictures, fn ($n) => ! isset($used[$n]))),
        ]);
    }

    /**
     * The form without the AI: one design per picture, named after its file, its colourway the nearest colour word to
     * the picture's main colour, every design with the sizes the prompt gives ("XS x 5, S x 5 … for each garment").
     *
     * @param  array<int, array{name:string, colour?:?string}>  $pictures
     */
    public static function fallback(string $prompt, array $pictures, ?array $before = null, ?string $sizeText = null, bool $newSizes = true): array
    {
        $sizes = self::sizesInText($sizeText ?? $prompt);
        $sport = OrderAnalysis::sportOf($prompt) ?? ($before['sport'] ?? null);
        // No garment word: the one named before, else a sport's jersey ("Football: 3 x M" is a Football jersey, as the notes reader).
        $garmentId = OrderAnalysis::garmentsIn($prompt)[0] ?? ($before['garment_id'] ?? null) ?? ($sport ? 'jersey' : null);
        $garment = $before['garment'] ?? '';
        if ($garmentId && ($garment === '' || OrderAnalysis::garmentOf($garment) !== $garmentId)) {
            $garment = $sport ? OrderAnalysis::model($sport, $garmentId, $prompt) : (OrderAnalysis::PRODUCT_NAMES[$garmentId] ?? 'Garment');
        }
        $old = [];
        foreach ($before['designs'] ?? [] as $d) {
            foreach ($d['pictures'] as $p) {
                $old[$p['name']] = $d;
            }
        }
        $designs = [];
        $placed = [];
        foreach (array_slice($pictures, 0, self::MAX_DESIGNS) as $p) {
            $kept = $old[$p['name']] ?? null;
            if ($kept && isset($placed[$kept['key']])) {
                continue;
            }
            if ($kept) {
                $placed[$kept['key']] = true;
                // A design already on the form keeps its sizes (maybe corrected by hand) unless the new message gives sizes.
                $designs[] = ['sizes' => $newSizes && $sizes ? $sizes : $kept['sizes']] + $kept;

                continue;
            }
            $colour = $p['colour'] ?? null;
            $designs[] = ['name' => self::fileTitle($p['name']), 'colourway' => $colour ? self::colourName($colour) : '', 'colour' => $colour,
                'pictures' => [['name' => $p['name'], 'view' => 'other']], 'sizes' => $sizes, 'note' => ''];
        }

        return self::tidy([
            'brand' => $before['brand'] ?? '', 'garment' => $garment !== '' ? $garment : 'Garment', 'garment_id' => $garmentId ?? 'other', 'sport' => $sport,
            'title' => $before['title'] ?? '', 'notes' => $before['notes'] ?? '', 'unclear' => [], 'designs' => $designs, 'unplaced' => [], 'source' => 'built-in',
        ]);
    }

    /**
     * The customer's corrections (the summary on screen): brand, garment, title, and the designs in their new order
     * ({key, name, colourway, sizes: {size: qty}}); a design left out is taken off the form (its pictures unplaced).
     */
    public static function edit(array $form, array $input): array
    {
        foreach (['brand' => 40, 'title' => 80] as $field => $max) {
            if (array_key_exists($field, $input)) {
                $form[$field] = self::clip($input[$field] ?? '', $max);
            }
        }
        if (isset($input['garment']) && ($garment = self::clip($input['garment'], 60)) !== '' && $garment !== $form['garment']) {
            $form['garment'] = $garment;
            $form['garment_id'] = OrderAnalysis::garmentOf($garment) ?? $form['garment_id'];
            $form['sport'] = OrderAnalysis::sportOf($garment) ?? $form['sport'];
        }
        if (isset($input['designs']) && is_array($input['designs'])) {
            $byKey = array_column($form['designs'], null, 'key');
            $designs = [];
            $unclear = [];
            foreach ($input['designs'] as $in) {
                $d = $byKey[(string) ($in['key'] ?? '')] ?? null;
                if (! $d) {
                    continue;
                }
                unset($byKey[$d['key']]);
                $colourway = $d['colourway'];
                foreach (['name' => 60, 'colourway' => 40] as $field => $max) {
                    if (array_key_exists($field, $in)) {
                        $d[$field] = self::clip($in[$field] ?? '', $max);
                    }
                }
                if (isset($in['sizes']) && is_array($in['sizes'])) {
                    $d['sizes'] = self::sizes($in['sizes'], $unclear);
                }
                // A new colourway ("Red" to "Maroon"): its colour on the form.
                if ($d['colourway'] !== $colourway && ($hex = OrderAnalysis::colourOf($d['colourway'])) !== null) {
                    $d['colour'] = $hex;
                }
                $designs[] = $d;
            }
            foreach ($byKey as $gone) {
                array_push($form['unplaced'], ...array_column($gone['pictures'], 'name'));
            }
            $form['designs'] = $designs;
        }
        $form['source'] = 'edited';

        return self::tidy($form);
    }

    /** The customer's choice of design for a picture: {picture name: design key, or "none"}. */
    public static function assign(array $form, array $assign): array
    {
        foreach ($assign as $name => $key) {
            $name = (string) $name;
            $picture = null;
            foreach ($form['designs'] as &$d) {
                foreach ($d['pictures'] as $i => $p) {
                    if ($p['name'] === $name) {
                        $picture = $p;
                        array_splice($d['pictures'], $i, 1);
                        break;
                    }
                }
            }
            unset($d);
            $form['unplaced'] = array_values(array_filter($form['unplaced'], fn ($n) => $n !== $name));
            $picture ??= ['name' => $name, 'view' => 'other'];
            $placed = false;
            foreach ($form['designs'] as &$d) {
                if ($d['key'] === (string) $key) {
                    $d['pictures'][] = $picture;
                    $placed = true;
                }
            }
            unset($d);
            if (! $placed) {
                $form['unplaced'][] = $name;
            }
        }

        return self::tidy($form);
    }

    /**
     * Numbers, keys, labels, totals and the title, worked out again. Two designs with the same name and colourway stay
     * two ("Cook Islands – Green (2)"), so their sizes are never added together.
     */
    public static function tidy(array $form): array
    {
        $seen = [];
        $designs = [];
        foreach (array_slice(array_values($form['designs'] ?? []), 0, self::MAX_DESIGNS) as $i => $d) {
            $d['name'] = self::clip($d['name'] ?? '', 60);
            $d['colourway'] = self::clip($d['colourway'] ?? '', 40);
            if ($d['name'] === '' && $d['colourway'] === '') {
                $d['name'] = 'Design '.($i + 1);
            }
            $base = $d['name'] !== '' && $d['colourway'] !== '' ? $d['name'].' – '.$d['colourway'] : ($d['name'] !== '' ? $d['name'] : $d['colourway']);
            $label = $base;
            for ($n = 2; isset($seen[mb_strtolower(OrderAnalysis::tidyDesign($label))]); $n++) {
                $label = $base.' ('.$n.')';
            }
            $seen[mb_strtolower(OrderAnalysis::tidyDesign($label))] = true;
            $d['label'] = $label;
            $d['key'] = OrderAnalysis::slug(OrderAnalysis::tidyDesign($label));
            $d['number'] = $i + 1;
            $d['colour'] = self::hex((string) ($d['colour'] ?? '')) ?? OrderAnalysis::colourOf($d['colourway']);
            $d['pictures'] = array_values($d['pictures'] ?? []);
            $d['sizes'] = self::ordered($d['sizes'] ?? []);
            $d['total'] = array_sum($d['sizes']);
            $d['note'] = (string) ($d['note'] ?? '');
            $designs[] = $d;
        }
        $form['designs'] = $designs;
        $form['brand'] = (string) ($form['brand'] ?? '');
        $form['garment'] = ($form['garment'] ?? '') !== '' ? $form['garment'] : (OrderAnalysis::PRODUCT_NAMES[$form['garment_id'] ?? 'other'] ?? 'Garment');
        $form['garment_id'] = array_key_exists($form['garment_id'] ?? '', Order::GARMENTS) ? $form['garment_id'] : 'other';
        $form['sport'] = ($form['sport'] ?? null) ?: null;
        $form['unclear'] = array_values($form['unclear'] ?? []);
        $form['unplaced'] = array_values(array_unique($form['unplaced'] ?? []));
        $form['notes'] = (string) ($form['notes'] ?? '');
        $sets = array_unique(array_map(fn ($d) => json_encode($d['sizes']), $designs));
        $form['same_sizes'] = count($designs) > 0 && count($sets) === 1 && $designs[0]['total'] > 0;
        $form['total'] = array_sum(array_column($designs, 'total'));

        return $form;
    }

    /** The order's title: the form's own, else the brand and the garment ("MANTIS Basketball Singlet"). */
    public static function title(array $form): string
    {
        if (($form['title'] ?? '') !== '') {
            // "MANTIS Basketball Singlet Order Form" "MANTIS Basketball Singlet" (the files are named "…_Order_Form").
            return trim(preg_replace('/(?:\s*[-–—]?\s*\border(?:\s+form)?)+\s*$/iu', '', $form['title']) ?? '') ?: $form['title'];
        }
        $garment = $form['garment'] === 'Garment' ? '' : implode(' ', array_map(fn ($w) => preg_match('/^\p{Ll}/u', $w) ? mb_strtoupper(mb_substr($w, 0, 1)).mb_substr($w, 1) : $w, explode(' ', $form['garment'])));

        return trim($form['brand'].' '.$garment);
    }

    /**
     * The form as the Order Assistant's analysis: order lines (one per design and size) through OrderAnalysis, the
     * groups in the form's order with the form's colours, the pictures on their designs, and what to check.
     */
    public static function analysis(array $form, string $title = ''): array
    {
        $lines = [];
        $type = OrderAnalysis::garmentOf($form['garment']) === null ? (OrderAnalysis::PRODUCT_NAMES[$form['garment_id']] ?? '') : '';
        foreach ($form['designs'] as $d) {
            foreach ($d['sizes'] as $size => $qty) {
                $lines[] = OrderAnalysis::line(['row' => count($lines) + 1, 'source' => $form['source'] === 'ai' ? '3DEEZI AI' : 'Order form', 'garment' => $form['garment'],
                    'type' => $type, 'sport' => (string) ($form['sport'] ?? ''), 'design' => $d['label'], 'size' => (string) $size, 'qty' => (string) $qty, 'note' => $d['note']]);
            }
        }
        $pictures = [];
        foreach ($form['designs'] as $d) {
            foreach ($d['pictures'] as $p) {
                // A design with no sizes yet is listed to check on its own (not as "nobody ordered").
                $pictures[] = ['name' => $p['name'], 'group' => $d['total'] > 0 ? $d['key'] : 'none'];
            }
        }
        foreach ($form['unplaced'] as $name) {
            $pictures[] = ['name' => $name, 'group' => null];
        }
        $a = OrderAnalysis::analyse(array_values(array_filter($lines)), $pictures, $title !== '' ? $title : self::title($form));
        $order = array_flip(array_column($form['designs'], 'key'));
        $colours = array_column($form['designs'], 'colour', 'key');
        foreach ($a['groups'] as &$g) {
            $g['colour'] = $colours[$g['key']] ?? $g['colour'];
        }
        unset($g);
        usort($a['groups'], fn ($x, $y) => ($order[$x['key']] ?? 99) <=> ($order[$y['key']] ?? 99));
        // The garment's sport is the form's: no "which sport?" question for a garment the customer named.
        $a['checks'] = array_values(array_filter($a['checks'], fn ($c) => ! in_array($c['type'], ['spelling', 'unused'], true)));
        foreach ($form['designs'] as $d) {
            if ($d['total'] === 0) {
                $a['checks'][] = ['type' => 'size', 'text' => sprintf('%02d %s has no sizes yet: add them before you download the form.', $d['number'], $d['label']), 'lines' => [], 'counts' => false];
            }
            if (! $d['pictures']) {
                $a['checks'][] = ['type' => 'artwork', 'text' => sprintf('%02d %s has no picture.', $d['number'], $d['label']), 'lines' => [], 'counts' => false];
            }
        }
        foreach ($form['unplaced'] as $name) {
            $a['checks'][] = ['type' => 'unused', 'text' => sprintf('The picture "%s" is not on any design.', $name), 'lines' => [], 'counts' => false];
        }
        if ($form['unclear']) {
            $a['checks'][] = ['type' => 'unread', 'text' => 'Not applied: '.implode('; ', array_map(fn ($u) => '"'.mb_substr($u, 0, 80).'"', array_slice($form['unclear'], 0, 6))).'.', 'lines' => [], 'counts' => false];
        }
        if (! $form['designs']) {
            $a['checks'][] = ['type' => 'artwork', 'text' => 'Add your design pictures: each picture (front and back) becomes a design on the form.', 'lines' => [], 'counts' => false];
        }
        $a['form'] = $form;

        return $a;
    }

    /** The assistant's answer in the chat: what it made (or updated, or saved), then what to do next. */
    public static function reply(array $form, ?string $note = null, string $how = 'made'): string
    {
        $n = count($form['designs']);
        if ($n === 0) {
            return 'Add your design pictures (front and back) and tell me the sizes, for example "XS x 5, S x 5, M x 6 for each design".';
        }
        $what = trim(($form['brand'] !== '' ? $form['brand'].' ' : '').$form['garment']);
        $list = implode(', ', array_map(fn ($d) => sprintf('%02d %s', $d['number'], $d['label']), $form['designs']));
        $text = ($note ? $note."\n\n" : '').sprintf(['saved' => 'Saved. Your order form: %s, %d design%s (%s).', 'updated' => 'I’ve updated your order form: %s, %d design%s (%s).'][$how] ?? 'I’ve made your order form: %s, %d design%s (%s).', $what, $n, $n === 1 ? '' : 's', $list);
        if ($form['total'] === 0) {
            return $text."\nTell me the sizes, for example \"XS x 5, S x 5, M x 6 for each design\", or type them in the summary.";
        }
        $sizes = fn (array $s) => implode(', ', array_map(fn ($k, $v) => "{$k} {$v}", array_keys($s), $s));
        $text .= $form['same_sizes']
            ? sprintf("\nEach design: %s = %d. Grand total: %d.", $sizes($form['designs'][0]['sizes']), $form['designs'][0]['total'], $form['total'])
            : sprintf("\n%s. Grand total: %d.", implode('; ', array_map(fn ($d) => sprintf('%02d: %d', $d['number'], $d['total']), $form['designs'])), $form['total']);

        return $text.($how === 'saved' ? "\nDownload the PDF when you’re ready." : "\nCheck the names and sizes (you can change them), then download the PDF.");
    }

    /* ------------------------------------------------------------------------------------------------ parts */

    /**
     * Sizes as {site size: qty} from [{size, qty}] (the AI) or {size: qty} (the summary on screen); sizes we don't know
     * go to $unclear.
     */
    public static function sizes(array $in, ?array &$unclear = null): array
    {
        $out = [];
        foreach ($in as $k => $v) {
            [$written, $qty] = is_array($v) ? [(string) ($v['size'] ?? ''), $v['qty'] ?? 0] : [(string) $k, $v];
            $qty = is_numeric($qty) ? (int) $qty : 0;
            if ($qty <= 0) {
                continue;
            }
            [$size, , $guess] = OrderAnalysis::size(str_replace(' ', '', $written));
            $size ??= $guess;
            if ($size === null) {
                $unclear[] = mb_substr("{$written} x {$qty}", 0, 60);

                continue;
            }
            $out[$size] = min(self::MAX_QTY, ($out[$size] ?? 0) + $qty);
        }

        return self::ordered($out);
    }

    /**
     * The sizes a message gives ("XS x 5, S x 5, M X 6, 3 XL X 5, 5XL: 5", "6 x M", "XS-3") as {size: qty}, read by
     * the order form's notes reader (OrderFormReader: one size reading for the whole site), its garments together.
     */
    public static function sizesInText(string $text): array
    {
        // "3 XL X 5" is 3XL x 5: a size written with a space, then its own quantity (not 3 of XL; "3 XL, 2 L" stays 3 of XL).
        $text = preg_replace('/(?<![\p{L}\d])([2-8])\s+(XL)(?=\s*[x×*:=]\s*\d)/iu', '$1$2', $text) ?? $text;
        $sizes = [];
        foreach (app(OrderFormReader::class)->notes($text)['items'] ?? [] as $item) {
            foreach ((array) ($item['sizes'] ?? []) as $size => $qty) {
                $sizes[] = ['size' => (string) $size, 'qty' => (int) $qty];
            }
        }

        return self::sizes($sizes);
    }

    /** Sizes in the size order (XS, S, M … then womens, kids). */
    private static function ordered(array $sizes): array
    {
        $rank = array_flip(Order::SIZES);
        $sizes = array_filter(array_map('intval', $sizes), fn ($q) => $q > 0);
        uksort($sizes, fn ($a, $b) => ($rank[$a] ?? 99) <=> ($rank[$b] ?? 99));

        return $sizes;
    }

    private static function sport(string $sport, string $garment): ?string
    {
        return OrderAnalysis::sportId($sport) ?? OrderAnalysis::sportOf($garment);
    }

    private static function hex(string $hex): ?string
    {
        return preg_match('/^#[0-9a-f]{6}$/i', trim($hex)) ? mb_strtolower(trim($hex)) : null;
    }

    private static function clip(mixed $v, int $max): string
    {
        return is_scalar($v) ? mb_substr(OrderAnalysis::tidy((string) $v), 0, $max) : '';
    }

    /** "mantis_tonga-front.png" "Mantis tonga front". */
    public static function fileTitle(string $file): string
    {
        $t = OrderAnalysis::tidy(preg_replace('/[_\-.]+/', ' ', pathinfo($file, PATHINFO_FILENAME)) ?? '');

        return $t !== '' ? mb_strtoupper(mb_substr($t, 0, 1)).mb_substr($t, 1, 59) : 'Design';
    }

    /** The colour word nearest a colour ("#c8102e" "Red"). */
    public static function colourName(string $hex): string
    {
        $best = null;
        $far = INF;
        foreach (OrderAnalysis::COLOURS as $word => $c) {
            $d = OrderAnalysis::colourDistance($hex, $c);
            if ($d < $far) {
                [$best, $far] = [$word, $d];
            }
        }

        return $best ? implode(' ', array_map('ucfirst', explode(' ', $best))) : '';
    }
}
