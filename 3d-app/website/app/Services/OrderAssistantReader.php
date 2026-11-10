<?php

namespace App\Services;

use Throwable;

/**
 * The Order Assistant's reading of everything the customer sent (task TL-3): order sheets with a header row are read
 * line by line here (no AI, no cost); typed notes by the built-in notes reader; photos, PDFs, other sheets and notes
 * the built-in reader can't follow by 3DEEZI AI (one paid call, signed-in customers only). The lines then go through
 * OrderAnalysis (groups, size tables, totals, things to check, the order form's rows).
 */
class OrderAssistantReader
{
    public const SHEETS = ['xlsx', 'ods', 'csv', 'tsv', 'txt'];

    public const PICTURES = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

    public function __construct(private OrderFormReader $notes, private OrderAssistantAi $ai) {}

    /**
     * @param  array<int, array{path:string, extension:string, name:string}>  $orderFiles  order sheets, notes, photos of notes, PDFs
     * @param  array<int, array{name:string}>  $designs  design pictures (by file name)
     * @return array{analysis: array, sources: array<int, array{name:string, how:string}>, unread: array<int, string>, ai_used: bool}
     */
    public function read(string $message, array $orderFiles, array $designs, bool $mayUseAi, string $title = ''): array
    {
        $lines = [];
        $sources = [];
        $unread = [];
        $forAi = [];
        foreach ($orderFiles as $f) {
            $ext = strtolower($f['extension']);
            $found = in_array($ext, self::SHEETS, true) ? OrderAnalysis::linesFromTable(OrderAnalysis::tableRows($f['path'], $ext), $f['name']) : null;
            if ($found) {
                $title = $title !== '' ? $title : OrderAnalysis::titleFrom($f['name']);
                array_push($lines, ...$found);
                $sources[] = ['name' => $f['name'], 'how' => 'sheet'];
            } else {
                $forAi[] = $f;
            }
        }
        // Typed notes: the built-in reader first; what it can't follow goes to 3DEEZI AI with the files.
        $text = trim($message);
        // One sport named in the message ("football jersey with water logo"): the garments read with no sport of their
        // own are that sport's models (a football jersey, not any jersey). Two or more sports: not guessed.
        $sports = OrderAnalysis::sportsIn($text);
        $sport = count($sports) === 1 ? $sports[0] : '';
        $textForAi = '';
        if ($text !== '') {
            $read = $this->notes->notes($text);
            $items = $read['items'] ?? [];
            // "9 polos: 3 x 4XL…" on one line: the built-in reader's garment is a jersey only as its guess (no garment word
            // read on the line), so the garment the message names is used. Never when the message names a jersey itself
            // or more than one garment ("Football jerseys 3 x M" then "5 hoodies": the jerseys stay jerseys, bug 2026-11-06).
            $said = OrderAnalysis::garmentsIn($text);
            if (count($items) === 1 && count($said) === 1 && ($items[0]['garment'] ?? '') === 'jersey' && $said[0] !== 'jersey' && empty($items[0]['label'])
                && ! preg_match('/\b(?:jerseys?|guernseys?|shirts?|tops?|kits?|uniforms?)\b/i', $text)) {
                $items[0]['garment'] = $said[0];
            }
            // The message's one sport for the garments read with no sport of their own: never a sport only in a part
            // left unread, and when another garment named that sport itself, only if it keeps the garment's kind.
            // "Jerseys: 4 S, 6 M" then an empty "Netball dresses" heading, or "Jerseys 4 S. Netball dress x 12": the
            // jerseys stay jerseys, never Netball dresses (bug 2026-11-10); "Football jerseys 3 x M" then "5 hoodies":
            // Football hoodies.
            $unsized = (array) ($read['unsized'] ?? []);
            $notesSport = $sport;
            if ($sport !== '') {
                $readText = $text;
                foreach ((array) ($read['unknown'] ?? []) as $u) {
                    if (! in_array($u, array_column($unsized, 'text'), true)) {
                        $readText = str_ireplace(preg_replace('/\s*\([^()]*\)$/u', '', (string) $u) ?? (string) $u, ' ', $readText);
                    }
                }
                $notesSport = OrderAnalysis::sportsIn($readText) === [$sport] ? $sport : '';
            }
            $ownSport = (bool) array_filter(array_merge($items, $unsized), fn ($i) => ! empty($i['sport']));
            $borrow = function (array $i) use ($notesSport, $ownSport): array {
                if (! empty($i['sport']) || $notesSport === '') {
                    return $i;
                }
                $garment = (string) ($i['garment'] ?? 'other');
                $name = (string) ($i['label'] ?? '') ?: (OrderAnalysis::PRODUCT_NAMES[$garment] ?? 'Garment');
                if (! $ownSport || OrderAnalysis::garmentOf(OrderAnalysis::model($notesSport, $garment, $name)) === $garment) {
                    $i['sport'] = $notesSport;
                }

                return $i;
            };
            $items = array_map($borrow, $items);
            $unsized = array_map($borrow, $unsized);
            $fromNotes = self::linesFromItems($items, 'Your message');
            // "5 hoodies", "10 football jerseys": kept, with no size given (the check list says so).
            foreach ($unsized as $u) {
                $garment = (string) ($u['garment'] ?? 'other');
                // "Netball dresses x 12": named as said (a dress on a singlet row), not "Netball singlet with bib".
                $label = (string) ($u['label'] ?? '');
                $fromNotes[] = OrderAnalysis::line(['row' => count($fromNotes) + 1, 'source' => 'Your message', 'garment' => $label ?: (OrderAnalysis::PRODUCT_NAMES[$garment] ?? 'Garment'),
                    'type' => $label !== '' && OrderAnalysis::garmentOf($label) === $garment ? '' : (OrderAnalysis::PRODUCT_NAMES[$garment] ?? ''), 'sport' => (string) ($u['sport'] ?? ''), 'size' => (string) ($u['size'] ?? ''), 'qty' => (string) (int) ($u['qty'] ?? 1)]);
            }
            $fromNotes = array_values(array_filter($fromNotes));
            $unsizedText = array_column($unsized, 'text');
            if ($fromNotes) {
                array_push($lines, ...$fromNotes);
                $sources[] = ['name' => 'Your message', 'how' => 'notes'];
                $unread = array_merge($unread, array_values(array_filter($read['unknown'] ?? [], fn ($u) => ! self::chatter($u) && ! in_array($u, $unsizedText, true))));
            } elseif (! self::chatter($text)) {
                $textForAi = $text;
            }
        }
        $aiUsed = false;
        if ($forAi || $textForAi !== '') {
            $read = null;
            if ($mayUseAi && $this->ai->available()) {
                try {
                    $read = $this->ai->read($textForAi, $forAi);
                    $aiUsed = $read !== null;
                } catch (Throwable $e) {
                    report($e);
                }
            }
            if ($read) {
                foreach ($read['lines'] as $i => $l) {
                    $l = array_map('strval', $l);
                    $l['sport'] = ($l['sport'] ?? '') !== '' ? $l['sport'] : $sport;
                    $line = OrderAnalysis::line(['row' => $i + 1, 'source' => '3DEEZI AI'] + $l);
                    if ($line) {
                        $lines[] = $line;
                    }
                }
                $unread = array_merge($unread, $read['unread']);
                $title = $title !== '' ? $title : $read['title'];
                foreach ($forAi as $f) {
                    $sources[] = ['name' => $f['name'], 'how' => 'ai'];
                }
                if ($textForAi !== '') {
                    $sources[] = ['name' => 'Your message', 'how' => 'ai'];
                }
            } else {
                foreach ($forAi as $f) {
                    $sources[] = ['name' => $f['name'], 'how' => $mayUseAi ? 'unread' : 'sign_in'];
                }
                if ($textForAi !== '') {
                    $unread[] = mb_substr($textForAi, 0, 200);
                }
            }
        }
        $analysis = OrderAnalysis::analyse($lines, $designs, $title);
        if ($unread) {
            $analysis['checks'][] = ['type' => 'unread', 'text' => 'These parts were not read as orders: '.implode('; ', array_map(fn ($u) => '"'.mb_substr($u, 0, 80).'"', array_slice($unread, 0, 6))).(count($unread) > 6 ? ' and '.(count($unread) - 6).' more' : '').'.', 'lines' => [], 'counts' => false];
        }

        return ['analysis' => $analysis, 'sources' => $sources, 'unread' => array_values($unread), 'ai_used' => $aiUsed];
    }

    /** The built-in notes reader's garments as order lines (a player each, else one line per size), with their sport ($sport when none). */
    public static function linesFromItems(array $items, string $source, string $sport = ''): array
    {
        $lines = [];
        $n = 0;
        foreach ($items as $item) {
            $garment = (string) ($item['garment'] ?? 'other');
            $name = (string) ($item['label'] ?? '') ?: (OrderAnalysis::PRODUCT_NAMES[$garment] ?? 'Garment');
            $itemSport = (string) ($item['sport'] ?? '') ?: $sport;
            // A name that says its own garment ("Netball dress" on a singlet row): the model is found from that name.
            $type = (string) ($item['label'] ?? '') !== '' && OrderAnalysis::garmentOf($name) === $garment ? '' : (OrderAnalysis::PRODUCT_NAMES[$garment] ?? '');
            $players = array_values(array_filter((array) ($item['players'] ?? []), 'is_array'));
            $sizes = array_filter((array) ($item['sizes'] ?? []), fn ($q) => (int) $q > 0);
            foreach ($players as $p) {
                $size = (string) ($p['size'] ?? '');
                if ($size !== '' && isset($sizes[$size])) {
                    $sizes[$size]--;
                }
                $lines[] = OrderAnalysis::line(['row' => ++$n, 'source' => $source, 'member' => (string) ($p['name'] ?? ''), 'garment' => $name,
                    'type' => $type, 'sport' => $itemSport, 'size' => $size, 'qty' => '1', 'note' => ($p['number'] ?? '') !== '' ? '#'.$p['number'] : '']);
            }
            foreach ($sizes as $size => $qty) {
                if ((int) $qty > 0) {
                    $lines[] = OrderAnalysis::line(['row' => ++$n, 'source' => $source, 'garment' => $name, 'type' => $type, 'sport' => $itemSport,
                        'size' => (string) $size, 'qty' => (string) (int) $qty]);
                }
            }
        }

        return array_values(array_filter($lines));
    }

    /** A message that orders nothing ("thanks", "make it a link also"). */
    private static function chatter(string $text): bool
    {
        return ! preg_match('/\d/', $text) && OrderAnalysis::garmentOf($text) === null;
    }
}
