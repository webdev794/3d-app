import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart' show Color;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import 'app_controller.dart';
import 'gradient_presets.dart';

/// One-page PDF design sheet, as on the website's Export menu: front and back
/// views, the flat print panels, colours (HEX / RGB / CMYK), pattern, text,
/// number and artwork. Landscape A4.
Future<Uint8List> designSheetPdf(AppController c) async {
  final frontBytes = c.mockupFront ?? c.renderFront;
  if (frontBytes == null) {
    throw StateError('Open the design in the 3D studio first.');
  }
  final backBytes = c.mockupBack ?? c.renderBack;
  final front = await _view(frontBytes);
  final back = backBytes == null ? null : await _view(backBytes);
  final panels = c.mockupPanels == null
      ? null
      : await _view(c.mockupPanels!, maxPx: 1800);

  const mm = PdfPageFormat.mm;
  const boxW = 91.0, gap = 6.0, margin = 12.0;
  final boxH = math.min(boxW * front.height! / front.width!, 120) + 12;
  final now = DateTime.now();
  final version =
      c.selectedProject >= 0 && c.selectedProject < c.projects.length
      ? c.projects[c.selectedProject].version
      : 1;

  pw.Widget text(
    String s, {
    double size = 8,
    bool bold = false,
    int colour = 0x141e28,
    pw.TextAlign? align,
    int? maxLines,
  }) => pw.Text(
    _safe(s),
    textAlign: align,
    maxLines: maxLines,
    style: pw.TextStyle(
      fontSize: size,
      fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
      color: PdfColor.fromInt(0xff000000 | colour),
    ),
  );

  pw.Widget panel(String label, pw.ImageProvider image) => pw.Container(
    decoration: pw.BoxDecoration(
      color: PdfColor.fromInt(0xffeef2f6),
      borderRadius: pw.BorderRadius.circular(3 * mm),
    ),
    padding: const pw.EdgeInsets.fromLTRB(3 * mm, 3 * mm, 3 * mm, 2 * mm),
    child: pw.Column(
      children: [
        pw.Expanded(child: pw.Center(child: pw.Image(image))),
        pw.SizedBox(height: 1.5 * mm),
        text(label, bold: true, colour: 0x5d6b7b),
      ],
    ),
  );

  final details = <pw.Widget>[];
  void heading(String t) => details.add(
    pw.Padding(
      padding: const pw.EdgeInsets.only(top: 2 * mm, bottom: 1.5 * mm),
      child: text(t, size: 8.5, bold: true, colour: 0x1e7bff),
    ),
  );
  void row(String label, String value) => details.add(
    pw.Padding(
      padding: const pw.EdgeInsets.only(bottom: 1.2 * mm),
      child: pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.SizedBox(width: 27 * mm, child: text(label, bold: true)),
          pw.Expanded(
            child: text(
              value.isEmpty ? '-' : value,
              colour: 0x3c4856,
              maxLines: 3,
            ),
          ),
        ],
      ),
    ),
  );

  heading('COLOURS');
  for (final (label, colour) in [
    ('Primary', c.mainColor),
    ('Secondary', c.secondaryColor),
    ('Accent', c.accentColor),
    ('Pattern', c.secondaryColor),
  ]) {
    final rgb = _rgb(colour);
    details.add(
      pw.Padding(
        padding: const pw.EdgeInsets.only(bottom: 2 * mm),
        child: pw.Row(
          children: [
            pw.Container(
              width: 9 * mm,
              height: 9 * mm,
              decoration: pw.BoxDecoration(
                color: PdfColor.fromInt(0xff000000 | colour.toARGB32()),
                border: pw.Border.all(
                  color: PdfColor.fromInt(0xffc8d0d8),
                  width: 0.6,
                ),
                borderRadius: pw.BorderRadius.circular(1.2 * mm),
              ),
            ),
            pw.SizedBox(width: 3 * mm),
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                text('$label  ${_hex(colour)}', bold: true),
                pw.SizedBox(height: 0.6 * mm),
                text(
                  'RGB ${rgb.join(', ')}   CMYK ${_cmyk(rgb).join(', ')}',
                  size: 7,
                  colour: 0x5d6b7b,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
  // Gradient fills, per colour zone: every stop (Sunset has three), and the angle.
  for (final (label, gradient) in [
    ('Primary gradient', c.gradient),
    ('Secondary gradient', c.gradients?['secondary']),
    ('Pattern gradient', c.gradients?['patternColor']),
  ]) {
    if (gradient is! Map) continue;
    final stops = gradientStops(gradient);
    if (stops.isEmpty) continue;
    row(
      label,
      '${stops.map((s) => '${s.hex.toUpperCase()} ${(s.at * 100).round()}%').join(' > ')}, '
          '${gradient['angle'] ?? 0}°',
    );
  }
  heading('PATTERN');
  row('Style', c.pattern);
  if (c.patternTile != null) row('Custom', 'Pattern image');
  // Patterns set on single areas of the garment (body, yoke, sleeves, sides, hem).
  for (final MapEntry(:key, :value) in c.zones.entries) {
    if (value.isNotEmpty) row(_title(key), _title(value));
  }
  row('Fabric', c.fabric);
  heading('TEXT AND NUMBER');
  row('Front text', c.logoText);
  row('Back name', c.backName);
  row('Number', c.number);
  heading('ARTWORK');
  row('Logo', c.logoImage != null ? 'Yes' : 'None');
  row('Sponsor', c.sponsorImage != null ? 'Yes' : 'None');
  if (c.layers.isNotEmpty) {
    row(
      'Layers',
      c.layers
          .map((l) => '${l['name'] ?? l['text'] ?? l['type'] ?? 'Layer'}')
          .join(', '),
    );
  }

  final doc = pw.Document(title: 'Design sheet', author: '3DEEZI');
  doc.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.a4.landscape,
      margin: pw.EdgeInsets.zero,
      build: (context) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
        children: [
          // Header band
          pw.Container(
            height: 24 * mm,
            color: PdfColor.fromInt(0xff0b1520),
            padding: const pw.EdgeInsets.symmetric(horizontal: margin * mm),
            child: pw.Row(
              children: [
                text('3DEEZI', size: 18, bold: true, colour: 0x12e1f0),
                pw.SizedBox(width: 6 * mm),
                text('DESIGN SHEET', size: 9, colour: 0xffffff),
                pw.Spacer(),
                pw.Column(
                  mainAxisAlignment: pw.MainAxisAlignment.center,
                  crossAxisAlignment: pw.CrossAxisAlignment.end,
                  children: [
                    text(
                      c.projectName.isEmpty ? 'Untitled kit' : c.projectName,
                      size: 13,
                      bold: true,
                      colour: 0xffffff,
                    ),
                    pw.SizedBox(height: 1.5 * mm),
                    text(
                      '${c.sport} · ${c.garment} · Version $version · ${_date(now)}',
                      size: 8.5,
                      colour: 0xb9c8d6,
                    ),
                  ],
                ),
              ],
            ),
          ),
          // Views on the left, details on the right
          pw.Expanded(
            child: pw.Padding(
              padding: const pw.EdgeInsets.fromLTRB(
                margin * mm,
                8 * mm,
                margin * mm,
                3 * mm,
              ),
              child: pw.Row(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.SizedBox(
                    width: (2 * boxW + gap) * mm,
                    child: pw.Column(
                      children: [
                        pw.SizedBox(
                          height: boxH * mm,
                          child: pw.Row(
                            children: [
                              pw.Expanded(child: panel('FRONT', front)),
                              if (back != null) ...[
                                pw.SizedBox(width: gap * mm),
                                pw.Expanded(child: panel('BACK', back)),
                              ],
                            ],
                          ),
                        ),
                        if (panels != null &&
                            210 - 24 - 8 - 14 - boxH > 36) ...[
                          pw.SizedBox(height: gap * mm),
                          pw.Expanded(child: panel('PRINT PANELS', panels)),
                        ],
                      ],
                    ),
                  ),
                  pw.SizedBox(width: 8 * mm),
                  pw.Expanded(
                    child: pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      children: details,
                    ),
                  ),
                ],
              ),
            ),
          ),
          // Footer
          pw.Padding(
            padding: const pw.EdgeInsets.fromLTRB(
              margin * mm,
              0,
              margin * mm,
              6 * mm,
            ),
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                text(
                  'Design review sheet from 3DEEZI · not a production tech pack',
                  size: 7,
                  colour: 0x7f93a6,
                ),
                text(
                  'Generated ${_date(now)} ${_two(now.hour)}:${_two(now.minute)}',
                  size: 7,
                  colour: 0x7f93a6,
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
  return doc.save();
}

/// A 3D capture scaled to at most [maxPx] on its longer side, as raw pixels.
Future<pw.RawImage> _view(Uint8List bytes, {int maxPx = 1400}) async {
  final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
  final descriptor = await ui.ImageDescriptor.encoded(buffer);
  final k = math.min(
    1.0,
    maxPx / math.max(descriptor.width, descriptor.height),
  );
  final codec = await descriptor.instantiateCodec(
    targetWidth: (descriptor.width * k).round(),
    targetHeight: (descriptor.height * k).round(),
  );
  final image = (await codec.getNextFrame()).image;
  final data = await image.toByteData(
    format: ui.ImageByteFormat.rawStraightRgba,
  );
  final view = pw.RawImage(
    bytes: data!.buffer.asUint8List(),
    width: image.width,
    height: image.height,
  );
  image.dispose();
  codec.dispose();
  descriptor.dispose();
  buffer.dispose();
  return view;
}

List<int> _rgb(Color c) {
  final v = c.toARGB32();
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/// Plain RGB to CMYK (no print profile), as on the Artboard and the website.
List<int> _cmyk(List<int> rgb) {
  final k = 1 - rgb.reduce(math.max) / 255;
  if (k >= 1) return [0, 0, 0, 100];
  return [
    for (final v in rgb) (((1 - v / 255 - k) / (1 - k)) * 100).round(),
    (k * 100).round(),
  ];
}

String _hex(Color c) =>
    '#${c.toARGB32().toRadixString(16).padLeft(8, '0').substring(2).toUpperCase()}';

String _title(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

String _two(int n) => n.toString().padLeft(2, '0');

String _date(DateTime d) =>
    '${d.day} ${const ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.month - 1]} ${d.year}';

/// The PDF's built-in fonts only cover Western characters: replace the rest.
String _safe(String s) => s
    .replaceAll(RegExp('[‘’]'), "'")
    .replaceAll(RegExp('[“”]'), '"')
    .replaceAll(RegExp('[–—]'), '-')
    .replaceAll(RegExp(r'[^\x20-\x7e\xa0-\xff]'), '?');
