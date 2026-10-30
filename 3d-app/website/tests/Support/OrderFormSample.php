<?php

namespace Tests\Support;

use ZipArchive;

/**
 * A small club order form shaped like the client's (Te Arawa U13 Mantis Order Form V3.xlsx, 2026-10-22), with made-up
 * names: labels in column A (team, contact, "Date required ASAP", garment), the players as size | name | number in
 * columns D-F with no heading row, and a size totals table in H-I. 13 players: 10Y 3, 12Y 4, 14Y 3, 16Y 1, XS 1, and
 * PARKER without a size.
 */
class OrderFormSample
{
    /** [size, name, number] */
    public const PLAYERS = [
        ['10Y', 'WALKER', 1], ['12Y', 'NGATA-BROWN', 2], ['14Y', 'SORENSEN', 3], ['', 'PARKER', 4], ['14Y', 'HILLS', 5], ['16Y', 'HALE', 6],
        ['10Y', 'MAKERE', 7], ['XS', 'FERRIS', 8], ['10Y', 'CONWAY', 9], ['12Y', 'BIDDLE-HUNU', 10], ['12Y', 'TUHOE-SMITH', 11], ['14Y', 'RANGI', 12], ['12Y', 'OKAFOR', 13],
    ];

    public const TOTALS = ['10Y' => 3, '12Y' => 4, '14Y' => 3, '16Y' => 1, 'XS' => 1];

    /** The rows by sheet row number: column letter => value. */
    public static function rows(): array
    {
        $labels = [2 => ['CLUB / TEAM', 'RIVERBEND RUGBY LEAGUE U13'], 3 => ['CONTACT', 'Sam Taylor'], 4 => ['Date required', 'ASAP'], 6 => ['GARMENT', 'Rugby league jersey']];
        $rows = [1 => ['A' => 'MANTIS SPORTSWEAR - ORDER FORM V3']];
        foreach (self::PLAYERS as $i => [$size, $name, $number]) {
            $r = $i + 2;
            $rows[$r] = array_filter(['A' => $labels[$r][0] ?? null, 'B' => $labels[$r][1] ?? null, 'D' => $size ?: null, 'E' => $name, 'F' => $number], fn ($v) => $v !== null);
        }
        $r = 2;
        foreach (self::TOTALS as $size => $n) {
            $rows[$r] += ['H' => $size, 'I' => $n];
            $r++;
        }

        return $rows;
    }

    /** Writes the sample .xlsx to $path (strings inline, numbers as numbers). */
    public static function xlsx(string $path, ?array $rows = null): string
    {
        $rows ??= self::rows();
        $xml = '';
        foreach ($rows as $r => $cells) {
            ksort($cells);
            $xml .= '<row r="'.$r.'">';
            foreach ($cells as $col => $value) {
                $ref = $col.$r;
                $xml .= is_int($value) || is_float($value)
                    ? '<c r="'.$ref.'"><v>'.$value.'</v></c>'
                    : '<c r="'.$ref.'" t="inlineStr"><is><t>'.htmlspecialchars((string) $value, ENT_XML1).'</t></is></c>';
            }
            $xml .= '</row>';
        }
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            .'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
            .'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            .'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
        $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            .'<sheets><sheet name="Order Form" sheetId="1" r:id="rId1"/></sheets></workbook>');
        $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
        $zip->addFromString('xl/worksheets/sheet1.xml', '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'.$xml.'</sheetData></worksheet>');
        $zip->close();

        return $path;
    }

    /** What a model reading the sample well answers (for Http::fake). */
    public static function aiAnswer(array $overrides = []): array
    {
        $players = array_map(fn ($p) => ['name' => $p[1], 'number' => $p[2].'.0', 'form_size' => $p[0], 'size' => $p[0] === '' ? '' : ($p[0] === 'XS' ? 'XS' : 'Kids')], self::PLAYERS);

        return array_replace([
            'team_name' => 'RIVERBEND RUGBY LEAGUE U13', 'contact_name' => 'Sam Taylor', 'contact_email' => '', 'phone' => '',
            'date_required' => '', 'date_required_text' => 'ASAP',
            'delivery' => ['method' => '', 'street' => '', 'suburb' => '', 'state' => '', 'postcode' => '', 'country' => ''],
            'garments' => [[
                'garment' => 'jersey', 'sport' => 'rugby-league', 'fit' => '', 'label' => '',
                'quantities' => array_map(fn ($size, $n) => ['form_size' => $size, 'size' => $size === 'XS' ? 'XS' : 'Kids', 'quantity' => $n], array_keys(self::TOTALS), self::TOTALS),
                'players' => $players,
            ]],
            'notes' => '',
            'unmapped' => ['PARKER 4: no size given'],
        ], $overrides);
    }

    /** The answer wrapped as an OpenAI Responses reply. */
    public static function response(array $answer): array
    {
        return ['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode($answer)]]]],
            'usage' => ['input_tokens' => 2400, 'output_tokens' => 1500]];
    }
}
