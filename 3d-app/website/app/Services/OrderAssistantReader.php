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
        $textForAi = '';
        if ($text !== '') {
            $read = $this->notes->notes($text);
            $items = $read['items'] ?? [];
            // "9 polos: 3 x 4XL…" on one line: the built-in reader's garment is a jersey unless a heading says otherwise.
            $said = OrderAnalysis::garmentOf($text);
            if (count($items) === 1 && $said !== null && ($items[0]['garment'] ?? '') !== $said && ! preg_match('/'.($items[0]['garment'] ?? 'x').'/i', $text)) {
                $items[0]['garment'] = $said;
                unset($items[0]['label']);
            }
            $fromNotes = self::linesFromItems($items, 'Your message');
            if ($fromNotes) {
                array_push($lines, ...$fromNotes);
                $sources[] = ['name' => 'Your message', 'how' => 'notes'];
                $unread = array_merge($unread, array_values(array_filter($read['unknown'] ?? [], fn ($u) => ! self::chatter($u))));
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
                    $line = OrderAnalysis::line(['row' => $i + 1, 'source' => '3DEEZI AI'] + array_map('strval', $l));
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

    /** The built-in notes reader's garments as order lines (a player each, else one line per size). */
    public static function linesFromItems(array $items, string $source): array
    {
        $lines = [];
        $n = 0;
        foreach ($items as $item) {
            $garment = (string) ($item['garment'] ?? 'other');
            $name = (string) ($item['label'] ?? '') ?: (OrderAnalysis::PRODUCT_NAMES[$garment] ?? 'Garment');
            $players = array_values(array_filter((array) ($item['players'] ?? []), 'is_array'));
            $sizes = array_filter((array) ($item['sizes'] ?? []), fn ($q) => (int) $q > 0);
            foreach ($players as $p) {
                $size = (string) ($p['size'] ?? '');
                if ($size !== '' && isset($sizes[$size])) {
                    $sizes[$size]--;
                }
                $lines[] = OrderAnalysis::line(['row' => ++$n, 'source' => $source, 'member' => (string) ($p['name'] ?? ''), 'garment' => $name,
                    'type' => OrderAnalysis::PRODUCT_NAMES[$garment] ?? '', 'size' => $size, 'qty' => '1', 'note' => ($p['number'] ?? '') !== '' ? '#'.$p['number'] : '']);
            }
            foreach ($sizes as $size => $qty) {
                if ((int) $qty > 0) {
                    $lines[] = OrderAnalysis::line(['row' => ++$n, 'source' => $source, 'garment' => $name, 'type' => OrderAnalysis::PRODUCT_NAMES[$garment] ?? '',
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
