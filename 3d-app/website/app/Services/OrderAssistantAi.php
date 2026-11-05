<?php

namespace App\Services;

/**
 * 3DEEZI AI's part of the Order Assistant (task TL-3): notes, photos of handwritten notes, PDFs and sheets with no
 * header row we know are read into order lines (one paid call for everything sent together), in the same shape the
 * sheet reader makes (OrderAnalysis::line), so the grouping, totals and checks are the same for every kind of order.
 * Tests replace this class (fake calls).
 */
class OrderAssistantAi
{
    public function __construct(private OpenAiDesigner $ai, private OrderFormAi $files) {}

    public static function enabled(): bool
    {
        return OpenAiDesigner::enabled();
    }

    /** Whether 3DEEZI AI can read now (an instance call, so tests can say yes). */
    public function available(): bool
    {
        return self::enabled();
    }

    /**
     * The order lines in the customer's message and files: {title, lines: [{order, member, garment, type, design,
     * size, qty, note}], unread: [text]}; null when the AI is off or nothing could be sent.
     *
     * @param  array<int, array{path:string, extension:string, name:string}>  $files
     */
    public function read(string $message, array $files): ?array
    {
        if (! self::enabled()) {
            return null;
        }
        $content = [];
        if (trim($message) !== '') {
            $content[] = ['type' => 'input_text', 'text' => "The customer wrote:\n".mb_substr($message, 0, 8000)];
        }
        foreach (array_slice($files, 0, 6) as $f) {
            $input = $this->files->input($f['path'], strtolower($f['extension']), $f['name']);
            if ($input) {
                array_push($content, ...$input);
            }
        }
        if (! $content) {
            return null;
        }
        $out = $this->ai->respondJson($this->instructions(), [['role' => 'user', 'content' => $content]], 'order_lines', $this->schema(), 16000);

        return [
            'title' => OrderAnalysis::tidy((string) ($out['title'] ?? '')),
            'lines' => array_values(array_filter((array) ($out['lines'] ?? []), 'is_array')),
            'unread' => array_values(array_filter(array_map('strval', (array) ($out['unread'] ?? [])))),
        ];
    }

    private function instructions(): string
    {
        return <<<'TXT'
You read sportswear and teamwear orders for 3DEEZI: typed messages, photos of handwritten notes, PDFs and spreadsheets.
Return every ordered garment as order lines, one line per person and garment when names are given, otherwise one line per size.
- order: the order or invoice number if written, else "".
- member: the person's name if written, else "".
- garment: the garment as written ("Polo", "Opening Day Polo", "Singlet", "Jersey", "Hoodie").
- type: a separate garment type if the order has one (e.g. "Polo" when the garment column says "Line Uniform"), else "".
- design: the design, colour, family line or team written for it (e.g. "Annie More - Turquoise", "Black with club logo"), else "".
- size: the size exactly as written, with the fit when known ("Men 5XL", "Women 14W", "Kids 8Y", "4XL"). Womens sizes are numbers like 8 to 24, kids sizes are ages.
- qty: how many, as written ("3" for "3 x 4XL"); "1" for a person's line with no number.
- note: anything else on that line (a number on the back, a nickname), else "".
Do not invent lines, sizes or names. Keep the order of the source. Do not add totals as lines.
title: a short name for the order (team, club or event), else "".
unread: parts you could not read or that are not orders, word for word (short), else [].
TXT;
    }

    private function schema(): array
    {
        $s = ['type' => 'string'];
        $line = ['type' => 'object', 'additionalProperties' => false, 'required' => ['order', 'member', 'garment', 'type', 'design', 'size', 'qty', 'note'],
            'properties' => ['order' => $s, 'member' => $s, 'garment' => $s, 'type' => $s, 'design' => $s, 'size' => $s, 'qty' => $s, 'note' => $s]];

        return ['type' => 'object', 'additionalProperties' => false, 'required' => ['title', 'lines', 'unread'],
            'properties' => ['title' => $s, 'lines' => ['type' => 'array', 'items' => $line], 'unread' => ['type' => 'array', 'items' => $s]]];
    }
}
