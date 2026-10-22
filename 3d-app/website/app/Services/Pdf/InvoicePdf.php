<?php

namespace App\Services\Pdf;

use App\Models\Invoice;
use App\Services\Pricing\BillingSettings;
use App\Services\Pricing\Money;
use Illuminate\Support\Carbon;

/**
 * The invoice as a PDF (A4), drawn from what was agreed when it was issued: the seller (business name, ABN, address,
 * logo), the customer, every item, extra, shipping, discount, GST and the total, the payment status, how to pay and
 * the notes. A paid invoice says so (it is the receipt too).
 */
final class InvoicePdf
{
    private const INK = '#0b1724';

    private const MUTED = '#5b6b7f';

    private const RULE = '#dbe2ea';

    private const SOFT = '#f2f6fa';

    private const LEFT = 40.0;

    private const RIGHT = 555.28;

    /** Lowest a row may start before a new page (room for the footer). */
    private const BOTTOM = 770.0;

    /** status => [badge text, text colour, fill]. */
    private const BADGES = [
        'awaiting_payment' => ['AWAITING PAYMENT', '#9a5b00', '#fff1d6'],
        'part_paid' => ['DEPOSIT PAID', '#1d4ed8', '#dbeafe'],
        'paid' => ['PAID', '#15803d', '#dcfce7'],
        'refunded' => ['REFUNDED', '#475569', '#e2e8f0'],
        'cancelled' => ['CANCELLED', '#475569', '#e2e8f0'],
        'quote_required' => ['QUOTE REQUIRED', '#9a5b00', '#fff1d6'],
    ];

    private PdfDocument $pdf;

    private float $y = 0;

    private array $quote;

    private array $snap;

    private string $currency;

    public function __construct(private Invoice $invoice)
    {
        $this->quote = $invoice->quote ?? [];
        $this->snap = $invoice->snapshot ?? [];
        $this->currency = $invoice->currency ?: 'AUD';
    }

    public static function render(Invoice $invoice): string
    {
        return (new self($invoice))->build();
    }

    private function build(): string
    {
        $seller = $this->snap['seller'] ?? BillingSettings::seller();
        $this->pdf = new PdfDocument('Invoice '.($this->invoice->number ?? ''), (string) ($seller['name'] ?? '3DEEZI'));
        $this->pdf->addPage();
        $this->header($seller);
        $this->parties($seller);
        $this->items();
        $this->totals();
        $this->payment();
        $this->footers($seller);

        return $this->pdf->output();
    }

    private function money(?int $cents): string
    {
        return $cents === null ? '-' : Money::format($cents, $this->currency);
    }

    /** "$50.00" (the currency is in the TOTAL row). */
    private function short(?int $cents): string
    {
        return $cents === null ? '-' : trim(substr(Money::format($cents, $this->currency), strlen($this->currency) + 1));
    }

    private function date(?string $value): string
    {
        return $value ? Carbon::parse($value)->format('j M Y') : '-';
    }

    private function header(array $seller): void
    {
        $pdf = $this->pdf;
        // The brand bar: cyan to violet.
        $steps = 48;
        for ($i = 0; $i < $steps; $i++) {
            $t = $i / ($steps - 1);
            $colour = sprintf('#%02x%02x%02x', (int) round(0x00 + (0x75 - 0x00) * $t), (int) round(0xd9 + (0x60 - 0xd9) * $t), (int) round(0xed + (0xff - 0xed) * $t));
            $pdf->rect(PdfDocument::WIDTH * $i / $steps, 0, PdfDocument::WIDTH / $steps + 0.6, 6, $colour);
        }
        $logo = BillingSettings::logo();
        $drawn = false;
        if ($logo && ($info = PdfDocument::imageInfo($logo['bytes']))) {
            $scale = min(170 / max(1, $info['w']), 52 / max(1, $info['h']));
            $drawn = $pdf->image($logo['bytes'], self::LEFT, 30, $info['w'] * $scale, $info['h'] * $scale);
        }
        if (! $drawn) {
            $pdf->text(self::LEFT, 62, mb_strtoupper((string) ($seller['name'] ?? '3DEEZI')), 22, true, self::INK);
        }
        $taxed = ($this->quote['tax']['amount_cents'] ?? 0) > 0;
        $pdf->text(self::RIGHT, 50, $taxed ? 'TAX INVOICE' : 'INVOICE', 20, true, self::INK, 'right');
        $pdf->text(self::RIGHT, 68, (string) ($this->invoice->number ?? ''), 12, true, '#0e7490', 'right');
        [$badge, $ink, $fill] = self::BADGES[$this->invoice->status] ?? [mb_strtoupper($this->invoice->label()), '#475569', '#e2e8f0'];
        $width = $pdf->width($badge, 8, true) + 18;
        $pdf->rect(self::RIGHT - $width, 76, $width, 17, $fill, null, 8.5);
        $pdf->text(self::RIGHT - $width / 2, 87.6, $badge, 8, true, $ink, 'center');
        $this->y = 112;
    }

    private function parties(array $seller): void
    {
        $pdf = $this->pdf;
        $top = $this->y;
        $order = $this->snap['order'] ?? [];
        $customer = $this->snap['customer'] ?? [];

        // From (the seller).
        $from = array_filter([
            filled($seller['abn'] ?? null) ? 'ABN '.$seller['abn'] : null,
            ...$this->lines((string) ($seller['address'] ?? '')),
            $seller['email'] ?? null, $seller['phone'] ?? null, $seller['website'] ?? null,
        ]);
        $this->block(self::LEFT, $top, 165, 'FROM', (string) ($seller['name'] ?? '3DEEZI'), $from);

        // Bill to (the customer): at the billing address the customer gave when paying, else the delivery address.
        $billing = is_array($this->snap['billing'] ?? null) && ($this->snap['billing']['same'] ?? true) === false ? $this->snap['billing'] : null;
        if ($billing) {
            $billName = (string) ($billing['company'] ?? null ?: ($billing['name'] ?? null ?: ($customer['name'] ?? 'Customer')));
            $to = array_filter([
                filled($billing['name'] ?? null) && $billing['name'] !== $billName ? $billing['name'] : null,
                $customer['email'] ?? null, $customer['phone'] ?? null,
                ...$this->lines((string) ($billing['address'] ?? '')),
            ]);
        } else {
            $billName = (string) ($customer['name'] ?? 'Customer');
            $to = array_filter([
                ($customer['contact'] ?? null) && ($customer['contact'] ?? null) !== ($customer['name'] ?? null) ? $customer['contact'] : null,
                $customer['email'] ?? null, $customer['phone'] ?? null,
                ...$this->lines((string) ($customer['address'] ?? '')),
            ]);
        }
        $bottomTo = $this->block(222, $top, 165, 'BILL TO', $billName, $to);

        // The invoice's details.
        $rows = array_filter([
            ['Invoice', (string) $this->invoice->number],
            filled($order['number'] ?? null) ? ['Order', (string) $order['number']] : null,
            ['Issued', $this->date($this->invoice->issued_at?->toIso8601String())],
            ['Due', $this->date($this->invoice->due_at?->toDateString())],
            $this->invoice->paid_at ? ['Paid', $this->date($this->invoice->paid_at->toIso8601String())] : null,
            ['Currency', $this->currency],
        ]);
        $y = $top + 10;
        foreach ($rows as [$label, $value]) {
            $pdf->text(405, $y, $label, 8.5, false, self::MUTED);
            $pdf->text(self::RIGHT, $y, $value, 9, true, self::INK, 'right');
            $y += 14;
        }
        $bottomFrom = $top + 10 + 15 + 12 * count($from);
        $this->y = max($bottomFrom, $bottomTo, $y) + 18;
    }

    /** A titled block of lines; returns where it ends. */
    private function block(float $x, float $y, float $width, string $title, string $name, array $lines): float
    {
        $pdf = $this->pdf;
        $pdf->text($x, $y, $title, 7.5, true, '#0e7490');
        $y += 14;
        foreach ($pdf->wrap($name, $width, 10.5, true) as $line) {
            $pdf->text($x, $y, $line, 10.5, true, self::INK);
            $y += 13;
        }
        foreach ($lines as $text) {
            foreach ($pdf->wrap((string) $text, $width, 8.5) as $line) {
                $pdf->text($x, $y, $line, 8.5, false, self::MUTED);
                $y += 11.5;
            }
        }

        return $y;
    }

    /** An address as lines (new lines or commas). */
    private function lines(string $text): array
    {
        $parts = preg_split('/\R/', trim($text)) ?: [];
        if (count($parts) === 1 && substr_count($parts[0], ',') >= 2) {
            $parts = explode(',', $parts[0]);
        }

        return array_values(array_filter(array_map('trim', $parts)));
    }

    private function tableHeader(): void
    {
        $pdf = $this->pdf;
        $pdf->rect(self::LEFT, $this->y, self::RIGHT - self::LEFT, 22, self::SOFT, null, 4);
        $baseline = $this->y + 14.5;
        $pdf->text(self::LEFT + 10, $baseline, 'ITEM', 8, true, self::MUTED);
        $pdf->text(372, $baseline, 'QTY', 8, true, self::MUTED, 'right');
        $pdf->text(462, $baseline, 'UNIT PRICE', 8, true, self::MUTED, 'right');
        $pdf->text(self::RIGHT - 10, $baseline, 'TOTAL', 8, true, self::MUTED, 'right');
        $this->y += 22;
    }

    private function newPage(): void
    {
        $this->pdf->addPage();
        $this->y = 50;
    }

    private function items(): void
    {
        $pdf = $this->pdf;
        $this->tableHeader();
        $sizes = [];
        foreach ($this->snap['order']['items'] ?? [] as $i => $item) {
            $sizes['item-'.$i] = $item['sizes'] ?? null;
        }
        $rows = array_merge($this->quote['lines'] ?? [], $this->quote['extras'] ?? []);
        foreach ($rows as $row) {
            $name = $pdf->wrap((string) ($row['name'] ?? 'Item'), 280, 10);
            $detail = '';
            if (is_array($sizes[$row['key'] ?? ''] ?? null) && $sizes[$row['key']] !== []) {
                $detail = implode(' · ', array_map(fn ($s, $n) => "{$s} {$n}", array_keys($sizes[$row['key']]), $sizes[$row['key']]));
            } elseif (($row['kind'] ?? '') === 'extra') {
                $detail = match ($row['unit'] ?? 'order') {
                    'player' => 'Per name / number',
                    'garment' => 'Per garment',
                    default => 'Per order',
                };
            }
            // Many sizes (XS to 8XL, W8 to W24, 2Y to 16Y) wrap onto more lines.
            $details = [];
            foreach ($detail !== '' ? explode(' · ', $detail) : [] as $part) {
                $last = array_key_last($details);
                if ($last !== null && $pdf->width($details[$last].' · '.$part, 8) <= 280) {
                    $details[$last] .= ' · '.$part;
                } else {
                    $details[] = $part;
                }
            }
            $height = 10 + 13 * count($name) + 11 * count($details) + 4;
            if ($this->y + $height > self::BOTTOM) {
                $this->newPage();
                $this->tableHeader();
            }
            $y = $this->y + 15;
            foreach ($name as $k => $line) {
                $pdf->text(self::LEFT + 10, $y + 13 * $k, $line, 10, false, self::INK);
            }
            foreach ($details as $k => $line) {
                $pdf->text(self::LEFT + 10, $y + 13 * count($name) - 1.5 + 11 * $k, $line, 8, false, self::MUTED);
            }
            $pdf->text(372, $y, (string) ($row['quantity'] ?? 1), 10, false, self::INK, 'right');
            $pdf->text(462, $y, $this->short($row['unit_cents'] ?? null), 10, false, self::INK, 'right');
            $pdf->text(self::RIGHT - 10, $y, $this->short($row['total_cents'] ?? null), 10, true, self::INK, 'right');
            $this->y += $height;
            $pdf->line(self::LEFT, $this->y, self::RIGHT, $this->y, self::RULE, 0.6);
        }
        $this->y += 16;
    }

    private function totals(): void
    {
        $pdf = $this->pdf;
        $q = $this->quote;
        // A 3DEEZI TEAM invoice is a design request (or an extra revision round), not garments.
        $team = ($this->snap['order']['source'] ?? null) === 'team' || $this->invoice->team_request_id;
        $rows = [[$team ? ((string) ($this->snap['order']['summary'] ?? '') ?: 'Design request') : 'Garments', $this->short($q['garments_total_cents'] ?? 0)]];
        if (($q['extras_total_cents'] ?? 0) > 0) {
            $rows[] = ['Extras', $this->short($q['extras_total_cents'])];
        }
        if (! empty($q['shipping'])) {
            $rows[] = ['Shipping'.(filled($q['shipping']['name'] ?? null) ? ' · '.$q['shipping']['name'] : ''), $this->short($q['shipping']['amount_cents'] ?? 0)];
        }
        foreach ($q['discounts'] ?? [] as $discount) {
            $rows[] = [($discount['name'] ?? 'Discount').(filled($discount['code'] ?? null) ? ' ('.$discount['code'].')' : ''), '-'.$this->short($discount['amount_cents'] ?? 0)];
        }
        $tax = $q['tax'] ?? [];
        $paid = (int) $this->invoice->paid_cents;
        $needed = 26 + 18 * (count($rows) + 2) + 40 + ($paid > 0 ? 36 : 0);
        if ($this->y + $needed > self::BOTTOM) {
            $this->newPage();
        }
        $x = 330.0;
        $y = $this->y + 4;
        foreach ($rows as [$label, $value]) {
            $pdf->text($x, $y, $label, 9.5, false, self::MUTED);
            $pdf->text(self::RIGHT - 10, $y, $value, 9.5, false, self::INK, 'right');
            $y += 18;
        }
        $pdf->line($x, $y - 9, self::RIGHT, $y - 9, self::RULE);
        $y += 4;
        $pdf->text($x, $y, 'Subtotal', 9.5, false, self::MUTED);
        $pdf->text(self::RIGHT - 10, $y, $this->short($this->invoice->subtotal_cents), 9.5, false, self::INK, 'right');
        $y += 18;
        $taxLabel = ($tax['name'] ?? 'GST').' ('.rtrim(rtrim((string) ($tax['rate'] ?? '10'), '0'), '.').'%)';
        $pdf->text($x, $y, ($tax['applies'] ?? true) ? $taxLabel : ($tax['name'] ?? 'GST').' (not applicable)', 9.5, false, self::MUTED);
        $pdf->text(self::RIGHT - 10, $y, $this->short($this->invoice->tax_cents), 9.5, false, self::INK, 'right');
        $y += 12;
        $pdf->rect($x - 10, $y, self::RIGHT - $x + 10, 30, self::INK, null, 5);
        $pdf->text($x, $y + 19.5, 'TOTAL', 11, true, '#ffffff');
        $pdf->text(self::RIGHT - 10, $y + 19.5, $this->money($this->invoice->total_cents), 12.5, true, '#ffffff', 'right');
        $y += 30;
        if ($paid > 0) {
            $y += 16;
            $pdf->text($x, $y, 'Paid', 9.5, false, self::MUTED);
            $pdf->text(self::RIGHT - 10, $y, '-'.$this->short($paid), 9.5, false, '#15803d', 'right');
            $y += 18;
            $pdf->text($x, $y, 'Amount due', 10, true, self::INK);
            $pdf->text(self::RIGHT - 10, $y, $this->money($this->invoice->amountDue()), 10, true, self::INK, 'right');
        }
        $this->paymentTop = $this->y;
        $this->y = $y + 26;
    }

    /** Where the totals started: "How to pay" sits to their left. */
    private float $paymentTop = 0;

    private function payment(): void
    {
        $pdf = $this->pdf;
        $width = 260.0;
        $y = $this->paymentTop + 4;
        $lines = [];
        $status = $this->invoice->status;
        if ($status === 'paid') {
            $lines[] = ['PAID IN FULL', true];
            $lines[] = ['Thank you. Paid '.$this->date($this->invoice->paid_at?->toIso8601String()).'.', false];
        } elseif (in_array($status, ['refunded', 'cancelled'], true)) {
            $lines[] = [$status === 'refunded' ? 'REFUNDED' : 'CANCELLED', true];
            $lines[] = [$status === 'refunded' ? 'This invoice was refunded.' : 'This invoice was cancelled: nothing is due.', false];
        } else {
            $lines[] = ['HOW TO PAY', true];
            if ($url = $this->invoice->payUrl()) {
                $lines[] = ['Pay online by card or wallet: '.$url, false];
            }
            $bank = trim((string) ($this->snap['bank_details'] ?? ''));
            if ($bank !== '') {
                $lines[] = ['Bank transfer: '.$bank, false];
                $lines[] = ['Reference: '.$this->invoice->number, false];
            }
            $rule = $this->snap['payment_rule'] ?? ['rule' => 'none'];
            if (($rule['rule'] ?? 'none') === 'deposit' && ($deposit = $this->invoice->depositDue())) {
                $lines[] = ["A {$rule['deposit_percent']}% deposit (".$this->money($deposit).') is needed before production.', false];
            } elseif (($rule['rule'] ?? 'none') === 'full') {
                $lines[] = ['Payment in full is needed before production.', false];
            }
        }
        $notes = array_filter([trim((string) ($this->snap['note'] ?? '')), trim((string) ($this->invoice->notes ?? ''))]);
        if ($notes) {
            $lines[] = ['', false];
            $lines[] = ['NOTES', true];
            foreach ($notes as $note) {
                $lines[] = [$note, false];
            }
        }
        foreach ($lines as [$text, $strong]) {
            if ($text === '') {
                $y += 6;

                continue;
            }
            foreach ($pdf->wrap($text, $width, $strong ? 8 : 8.5, $strong) as $line) {
                if ($y > self::BOTTOM + 30) {
                    $this->newPage();
                    $y = $this->y;
                }
                $pdf->text(self::LEFT, $y, $line, $strong ? 8 : 8.5, $strong, $strong ? '#0e7490' : self::MUTED);
                $y += $strong ? 13 : 11.5;
            }
        }
        $this->y = max($this->y, $y);
    }

    private function footers(array $seller): void
    {
        $pdf = $this->pdf;
        $pages = $pdf->pageCount();
        $text = implode(' · ', array_filter([(string) ($seller['name'] ?? ''), filled($seller['abn'] ?? null) ? 'ABN '.$seller['abn'] : null, $seller['email'] ?? null]));
        for ($i = 0; $i < $pages; $i++) {
            $pdf->usePage($i);
            $pdf->line(self::LEFT, 806, self::RIGHT, 806, self::RULE);
            $pdf->text(self::LEFT, 820, $text, 7.5, false, self::MUTED);
            $pdf->text(self::RIGHT, 820, 'Page '.($i + 1).' of '.$pages, 7.5, false, self::MUTED, 'right');
        }
    }
}
