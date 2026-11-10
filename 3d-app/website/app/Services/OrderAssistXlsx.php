<?php

namespace App\Services;

use App\Models\OrderAssist;
use App\Services\Pdf\OrderAssistPdf;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use ZipArchive;

/**
 * The Order Assistant's editable Excel (task TL-3; as the client's example): Summary (totals by design / colour),
 * Size breakdown (for production), Orders (every line, with filters), Designs (the pictures) and Check list. Totals
 * are formulas, so they follow any edit. Written with no library (Office Open XML in a zip).
 */
final class OrderAssistXlsx
{
    /** Styles: 0 plain, 1 header, 2 bold, 3 title, 4 warn, 5 muted, 6 total row; 7+ a fill per design colour. */
    private array $fills = [];

    private array $a;

    /** @var array<int, array{name:string, bytes:string, row:int}> pictures for the Designs sheet */
    private array $pictures = [];

    public function __construct(private OrderAssist $assist)
    {
        $this->a = $assist->analysis ?? [];
    }

    public function render(): string
    {
        $sheets = [
            'Summary' => $this->summary(),
            'Size breakdown' => $this->sizes(),
            'Orders' => $this->orders(),
            'Designs' => $this->designs(),
            'Check list' => $this->checkList(),
        ];
        $path = tempnam(sys_get_temp_dir(), 'oax');
        $zip = new ZipArchive;
        if ($zip->open($path, ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('The Excel file could not be made.');
        }
        $names = array_keys($sheets);
        $zip->addFromString('[Content_Types].xml', $this->contentTypes(count($names)));
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
        $book = '';
        $rels = '';
        $defined = '';
        foreach ($names as $i => $name) {
            $book .= '<sheet name="'.self::x($name).'" sheetId="'.($i + 1).'" r:id="rId'.($i + 1).'"/>';
            $rels .= '<Relationship Id="rId'.($i + 1).'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'.($i + 1).'.xml"/>';
            if ($sheets[$name]['filter'] ?? null) {
                $defined .= '<definedName name="_xlnm._FilterDatabase" localSheetId="'.$i.'" hidden="1">\''.self::x($name).'\'!'.$sheets[$name]['filter'].'</definedName>';
            }
        }
        $rels .= '<Relationship Id="rId'.(count($names) + 1).'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
        $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>'.$book.'</sheets>'.($defined ? '<definedNames>'.$defined.'</definedNames>' : '').'<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
        $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'.$rels.'</Relationships>');
        foreach ($names as $i => $name) {
            $zip->addFromString('xl/worksheets/sheet'.($i + 1).'.xml', $sheets[$name]['xml']);
            if ($name === 'Designs' && $this->pictures) {
                $zip->addFromString('xl/worksheets/_rels/sheet'.($i + 1).'.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
                $this->addDrawing($zip);
            }
        }
        $zip->addFromString('xl/styles.xml', $this->styles());
        $zip->close();
        $bytes = (string) file_get_contents($path);
        @unlink($path);

        return $bytes;
    }

    /* ------------------------------------------------------------------------------------------------ sheets */

    private function summary(): array
    {
        $t = $this->a['totals'] ?? [];
        // A column per garment, each sport's model on its own ("Football jersey").
        $garments = array_keys($t['by_column'] ?? $t['by_garment'] ?? []);
        $rows = [];
        $rows[] = [[$this->assist->displayTitle(), 3]];
        $rows[] = [['Order form & production breakdown · Made by '.$this->assist->brandName(), 5]];
        $rows[] = [];
        $head = ['Design – colour', ...array_map(fn ($g) => $t['columns'][$g] ?? OrderAnalysis::PRODUCT_NAMES[$g] ?? ucfirst($g), $garments), 'Total', 'Order lines', 'Lines to check'];
        $rows[] = array_map(fn ($h) => [$h, 1], $head);
        $start = count($rows) + 1;
        $last = self::col(count($garments));
        foreach ($this->a['groups'] ?? [] as $g) {
            $r = count($rows) + 1;
            $cells = [[$g['design'], $this->fill($g['colour'] ?? null)]];
            foreach ($garments as $garment) {
                $cells[] = array_sum(array_map(fn ($x) => ($x['column'] ?? $x['garment']) === $garment ? $x['total'] : 0, $g['garments']));
            }
            $cells[] = ['=SUM(B'.$r.':'.$last.$r.')', 2];
            $cells[] = $g['lines'];
            $cells[] = $g['check_lines'];
            $rows[] = $cells;
        }
        $end = count($rows);
        $totals = [['GRAND TOTAL', 6]];
        for ($c = 1; $c <= count($garments) + 3; $c++) {
            $L = self::col($c);
            $totals[] = ['=SUM('.$L.$start.':'.$L.$end.')', 6];
        }
        $rows[] = $totals;
        $rows[] = [];
        $rows[] = [['Orders', 2], $t['orders'] ?? 0];
        $rows[] = [['People named', 2], $t['members'] ?? 0];
        $rows[] = [['Lines to check', 2], [$t['to_check'] ?? 0, 4]];
        $rows[] = [['Summary', 2], OrderAnalysis::summaryText($this->a)];

        return ['xml' => $this->sheet($rows, [34, ...array_fill(0, count($garments), 12), 12, 13, 15])];
    }

    private function sizes(): array
    {
        $cols = $this->a['size_columns'] ?? [];
        $sets = ['youth' => 'Kids', 'womens' => 'Women', 'mens' => 'Men'];
        $head = ['Design – colour', 'Garment'];
        $map = [];
        foreach ($sets as $fit => $label) {
            foreach ($cols[$fit] ?? [] as $s) {
                $head[] = $label.' '.($fit === 'womens' ? substr($s, 1).'W' : $s);
                $map[] = [$fit, $s];
            }
        }
        $head[] = 'No size';
        $head[] = 'Total';
        $rows = [array_map(fn ($h) => [$h, 1], $head)];
        foreach ($this->a['groups'] ?? [] as $g) {
            foreach ($g['garments'] as $x) {
                $r = count($rows) + 1;
                $cells = [[$g['design'], $this->fill($g['colour'] ?? null)], $x['name']];
                foreach ($map as [$fit, $s]) {
                    $cells[] = ($x['sizes'][$fit][$s] ?? 0) ?: null;
                }
                $cells[] = $x['unsure'] ?: null;
                $cells[] = ['=SUM(C'.$r.':'.self::col(count($head) - 2).$r.')', 2];
                $rows[] = $cells;
            }
        }
        $end = count($rows);
        $totals = [['TOTAL', 6], ['', 6]];
        for ($c = 2; $c < count($head); $c++) {
            $L = self::col($c);
            $totals[] = ['=SUM('.$L.'2:'.$L.$end.')', 6];
        }
        $rows[] = $totals;

        return ['xml' => $this->sheet($rows, [30, 24, ...array_fill(0, count($head) - 2, 9)], 'C2')];
    }

    private function orders(): array
    {
        $flags = [];
        foreach ($this->a['checks'] ?? [] as $c) {
            foreach ($c['lines'] ?? [] as $i) {
                $flags[$i][] = ['size' => 'Size', 'double' => 'Possible double', 'sizes' => 'Different sizes', 'names' => 'No name', 'qty' => 'Quantity', 'garment' => 'Garment', 'sport' => 'Sport'][$c['type']] ?? 'Check';
            }
        }
        $head = ['Row', 'Order', 'Member', 'Design – colour', 'Garment', 'Fit', 'Size (as written)', 'Size', 'Qty', 'Check', 'Note', 'From'];
        $rows = [array_map(fn ($h) => [$h, 1], $head)];
        $fits = ['mens' => 'Men', 'womens' => 'Women', 'youth' => 'Kids'];
        foreach ($this->a['lines'] ?? [] as $i => $l) {
            $size = $l['size'] ?? $l['guess'];
            $check = implode(', ', array_unique($flags[$i] ?? []));
            $rows[] = [$l['row'] ?: null, $l['order'], $l['member'], $l['design'] ?: $l['collection'], OrderAnalysis::tidy(($l['collection'] && mb_stripos($l['collection'], $l['product']) === false ? $l['collection'].' ' : '').$l['product']),
                $fits[$l['fit']] ?? '', $l['size_written'], $size ? OrderAnalysis::sizeLabel($size) : '', $l['qty'], $check !== '' ? [$check, 4] : '', $l['note'], $l['source']];
        }
        $end = count($rows);
        $rows[] = [['TOTAL', 6], ...array_fill(0, 7, ['', 6]), ['=SUBTOTAL(9,I2:I'.$end.')', 6]];

        return ['xml' => $this->sheet($rows, [7, 9, 30, 30, 24, 8, 16, 12, 6, 18, 18, 22], 'A2', 'A1:L'.$end), 'filter' => '$A$1:$L$'.$end];
    }

    private function designs(): array
    {
        $rows = [[['Design – colour', 1], ['Garments ordered', 1], ['Picture', 1]]];
        $files = array_values(array_filter($this->assist->files ?? [], fn ($f) => ($f['kind'] ?? '') === 'design'));
        foreach ($this->a['groups'] ?? [] as $g) {
            $rows[] = [[$g['design'], $this->fill($g['colour'] ?? null)], $g['total'], $g['image'] ?? 'No picture added'];
            if ($g['image']) {
                foreach ($files as $f) {
                    if ($f['name'] === $g['image'] && Storage::disk('local')->exists($f['path'])) {
                        $bytes = OrderAssistPdf::asJpegOrPng((string) Storage::disk('local')->get($f['path']), 360);
                        if ($bytes && str_starts_with($bytes, "\xFF\xD8")) {
                            $this->pictures[] = ['name' => $f['name'], 'bytes' => $bytes, 'row' => count($rows) - 1];
                        }
                    }
                }
            }
        }
        foreach ($this->a['designs'] ?? [] as $d) {
            if (! $d['used']) {
                $rows[] = [[pathinfo($d['name'], PATHINFO_FILENAME), 5], 0, [$d['name'].' (no orders)', 5]];
            }
        }

        return ['xml' => $this->sheet($rows, [34, 18, 46], null, null, $this->pictures ? 120 : null)];
    }

    private function checkList(): array
    {
        $rows = [[['Check', 1], ['What to check', 1]]];
        $types = ['size' => 'Size', 'double' => 'Possible double orders', 'sizes' => 'Different sizes', 'names' => 'No member name', 'qty' => 'Quantity', 'garment' => 'Garment', 'spelling' => 'Spelling', 'unused' => 'Design with no orders', 'unread' => 'Not read'];
        foreach ($this->a['checks'] ?? [] as $c) {
            $rows[] = [[$types[$c['type']] ?? 'Check', 2], $c['text']];
            foreach (array_slice($c['people'] ?? [], 0, 200) as $p) {
                $rows[] = ['', [$p, 5]];
            }
        }
        if (count($rows) === 1) {
            $rows[] = ['', 'Nothing to check: every line was read.'];
        }

        return ['xml' => $this->sheet($rows, [24, 120])];
    }

    /* ------------------------------------------------------------------------------------------------ xml */

    /**
     * A worksheet: rows of cells (a value, or [value, style]); a string starting "=" is a formula.
     *
     * @param  array<int, float>  $widths
     */
    private function sheet(array $rows, array $widths, ?string $freeze = 'A2', ?string $filter = null, ?float $rowHeight = null): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
        if ($freeze) {
            preg_match('/^([A-Z]+)(\d+)$/', $freeze, $m);
            $xSplit = self::colIndex($m[1]);
            $ySplit = (int) $m[2] - 1;
            $xml .= '<sheetViews><sheetView workbookViewId="0"><pane'.($xSplit ? ' xSplit="'.$xSplit.'"' : '').($ySplit ? ' ySplit="'.$ySplit.'"' : '').' topLeftCell="'.$freeze.'" activePane="'.($xSplit && $ySplit ? 'bottomRight' : ($ySplit ? 'bottomLeft' : 'topRight')).'" state="frozen"/></sheetView></sheetViews>';
        }
        $xml .= '<cols>';
        foreach ($widths as $i => $w) {
            $xml .= '<col min="'.($i + 1).'" max="'.($i + 1).'" width="'.$w.'" customWidth="1"/>';
        }
        $xml .= '</cols><sheetData>';
        foreach ($rows as $r => $cells) {
            $n = $r + 1;
            $height = $rowHeight && $r > 0 ? ' ht="'.$rowHeight.'" customHeight="1"' : '';
            $xml .= '<row r="'.$n.'"'.$height.'>';
            foreach (array_values($cells) as $c => $cell) {
                [$value, $style] = is_array($cell) ? [$cell[0], $cell[1] ?? 0] : [$cell, 0];
                if ($value === null || $value === '') {
                    if ($style) {
                        $xml .= '<c r="'.self::col($c).$n.'" s="'.$style.'"/>';
                    }

                    continue;
                }
                $ref = self::col($c).$n;
                $s = $style ? ' s="'.$style.'"' : '';
                if (is_string($value) && str_starts_with($value, '=')) {
                    $xml .= '<c r="'.$ref.'"'.$s.'><f>'.self::x(substr($value, 1)).'</f></c>';
                } elseif (is_int($value) || is_float($value)) {
                    $xml .= '<c r="'.$ref.'"'.$s.'><v>'.$value.'</v></c>';
                } else {
                    $xml .= '<c r="'.$ref.'"'.$s.' t="inlineStr"><is><t xml:space="preserve">'.self::x((string) $value).'</t></is></c>';
                }
            }
            $xml .= '</row>';
        }
        $xml .= '</sheetData>';
        if ($filter) {
            $xml .= '<autoFilter ref="'.$filter.'"/>';
        }
        if ($rowHeight && $this->pictures) {
            $xml .= '<drawing r:id="rId1"/>';
        }

        return $xml.'</worksheet>';
    }

    private function addDrawing(ZipArchive $zip): void
    {
        $anchors = '';
        $rels = '';
        foreach ($this->pictures as $i => $p) {
            $zip->addFromString('xl/media/design'.($i + 1).'.jpeg', $p['bytes']);
            $size = @getimagesizefromstring($p['bytes']) ?: [300, 300];
            $h = 150 * 9525;
            $w = (int) round($h * $size[0] / max(1, $size[1]));
            $anchors .= '<xdr:oneCellAnchor><xdr:from><xdr:col>2</xdr:col><xdr:colOff>9525</xdr:colOff><xdr:row>'.$p['row'].'</xdr:row><xdr:rowOff>9525</xdr:rowOff></xdr:from><xdr:ext cx="'.$w.'" cy="'.$h.'"/>'
                .'<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="'.($i + 2).'" name="'.self::x($p['name']).'"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>'
                .'<xdr:blipFill><a:blip r:embed="rId'.($i + 1).'"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'.$w.'" cy="'.$h.'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>';
            $rels .= '<Relationship Id="rId'.($i + 1).'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/design'.($i + 1).'.jpeg"/>';
        }
        $zip->addFromString('xl/drawings/drawing1.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'.$anchors.'</xdr:wsDr>');
        $zip->addFromString('xl/drawings/_rels/drawing1.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'.$rels.'</Relationships>');
    }

    private function contentTypes(int $sheets): string
    {
        $over = '';
        for ($i = 1; $i <= $sheets; $i++) {
            $over .= '<Override PartName="/xl/worksheets/sheet'.$i.'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }
        if ($this->pictures) {
            $over .= '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
        }

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/>'
            .'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'.$over.'</Types>';
    }

    /** A style with the design's colour as its fill (and readable text), made once per colour. */
    private function fill(?string $hex): int
    {
        if (! $hex) {
            return 2;
        }
        $this->fills[$hex] ??= 7 + count($this->fills);

        return $this->fills[$hex];
    }

    private function styles(): string
    {
        $fills = '<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
            .'<fill><patternFill patternType="solid"><fgColor rgb="FF0B0F14"/></patternFill></fill>'
            .'<fill><patternFill patternType="solid"><fgColor rgb="FFFDE7C7"/></patternFill></fill>'
            .'<fill><patternFill patternType="solid"><fgColor rgb="FFE5F7F9"/></patternFill></fill>';
        $fonts = '<font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>'
            .'<font><b/><sz val="16"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF6B7280"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF111111"/><name val="Calibri"/></font>';
        // 0 plain, 1 header (white on dark), 2 bold, 3 title, 4 warn (amber fill), 5 muted, 6 total (bold on light teal)
        $xfs = '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/>'
            .'<xf numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" applyFill="1"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0" applyFont="1"/>'
            .'<xf numFmtId="0" fontId="2" fillId="4" borderId="0" applyFont="1" applyFill="1"/>';
        $fillCount = 5;
        foreach ($this->fills as $hex => $style) {
            $fills .= '<fill><patternFill patternType="solid"><fgColor rgb="FF'.strtoupper(ltrim($hex, '#')).'"/></patternFill></fill>';
            $font = OrderAssistPdf::readableOn($hex) === '#ffffff' ? 1 : 5;
            $xfs .= '<xf numFmtId="0" fontId="'.$font.'" fillId="'.$fillCount.'" borderId="0" applyFont="1" applyFill="1"/>';
            $fillCount++;
        }

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            .'<fonts count="6">'.$fonts.'</fonts><fills count="'.$fillCount.'">'.$fills.'</fills><borders count="1"><border/></borders>'
            .'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="'.(7 + count($this->fills)).'">'.$xfs.'</cellXfs></styleSheet>';
    }

    public static function col(int $i): string
    {
        $s = '';
        for ($i++; $i > 0; $i = intdiv($i - 1, 26)) {
            $s = chr(65 + ($i - 1) % 26).$s;
        }

        return $s;
    }

    private static function colIndex(string $letters): int
    {
        $n = 0;
        foreach (str_split($letters) as $ch) {
            $n = $n * 26 + (ord($ch) - 64);
        }

        return $n - 1;
    }

    private static function x(string $s): string
    {
        $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $s) ?? '';

        return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}
