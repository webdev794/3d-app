import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'app_controller.dart';
import 'design_sheet.dart';
import 'export_stub.dart'
    if (dart.library.io) 'export_native.dart'
    if (dart.library.js_interop) 'export_web.dart'
    as platform;

/// Shares or downloads a single image (Showcase).
Future<String> shareImage(Uint8List bytes, String name, {Rect? origin}) =>
    platform.saveDownload(bytes, name, origin: origin);

/// The rows of the Export screen.
enum ExportKind { mockup, frontBack, hiRes, social, pdf, pack }

class ExportException implements Exception {
  ExportException(this.message);
  final String message;
  @override
  String toString() => message;
}

String _slug(AppController c) {
  final base =
      (c.projectName.isEmpty ? '${c.sport} ${c.garment}' : c.projectName)
          .toLowerCase()
          .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
          .replaceAll(RegExp(r'^-|-$'), '');
  return '3DEEZI-${base.isEmpty ? 'design' : base}';
}

/// Builds the chosen export and hands it to the platform (share sheet on
/// phones, download on the web). Returns a short status message.
Future<String> exportDesign(
  AppController c,
  ExportKind kind, {
  Rect? origin,
}) async {
  final name = _slug(c);
  final front = c.mockupFront ?? c.renderFront;
  switch (kind) {
    case ExportKind.mockup:
      final png = c.mockupFront;
      if (png != null)
        return platform.saveDownload(
          png,
          '$name-3d-mockup.png',
          origin: origin,
        );
      if (c.renderFront != null) {
        return platform.saveDownload(
          c.renderFront!,
          '$name-mockup.jpg',
          origin: origin,
        );
      }
      throw ExportException('Open the design in the 3D studio first.');
    case ExportKind.frontBack:
      final files = <String, List<int>>{
        if (c.mockupFront != null) '3d-front.png': c.mockupFront!,
        if (c.mockupBack != null) '3d-back.png': c.mockupBack!,
        if (c.mockupSide != null) '3d-side.png': c.mockupSide!,
        if (c.renderFront != null) 'ai-render-front.jpg': c.renderFront!,
        if (c.renderBack != null) 'ai-render-back.jpg': c.renderBack!,
      };
      if (files.isEmpty) throw ExportException('No views captured yet.');
      return platform.saveDownload(
        _zip(files),
        '$name-front-back.zip',
        origin: origin,
      );
    case ExportKind.hiRes:
      if (c.renderFront != null) {
        return platform.saveDownload(
          c.renderFront!,
          '$name-hi-res.jpg',
          origin: origin,
        );
      }
      if (c.mockupFront != null) {
        return platform.saveDownload(
          c.mockupFront!,
          '$name-hi-res.png',
          origin: origin,
        );
      }
      throw ExportException('Open the design in the 3D studio first.');
    case ExportKind.social:
      if (front == null)
        throw ExportException('Open the design in the 3D studio first.');
      final post = await socialImage(c, front);
      return platform.saveDownload(post, '$name-social.png', origin: origin);
    case ExportKind.pdf:
      if (front == null)
        throw ExportException('Open the design in the 3D studio first.');
      return platform.saveDownload(
        await designSheetPdf(c),
        '$name-design-sheet.pdf',
        origin: origin,
      );
    case ExportKind.pack:
      return platform.saveDownload(
        _zip(_pack(c)),
        '$name-design-pack.zip',
        origin: origin,
      );
  }
}

Map<String, List<int>> _pack(AppController c) {
  final brief = const JsonEncoder.withIndent('  ').convert({
    'project': c.projectName,
    'mode': c.mode,
    'sport': c.sport,
    'garment': c.garment,
    'brief': c.brief,
    'mainColour': _hex(c.mainColor),
    'secondaryColour': _hex(c.secondaryColor),
    'accentColour': _hex(c.accentColor),
    'fabric': c.fabric,
    'pattern': c.pattern,
    'frontWordmark': c.logoText,
    'backName': c.backName,
    'number': c.number,
    if (c.spec != null) 'aiDesignName': c.spec!.designName,
    if (c.spec != null) 'aiSummary': c.spec!.summary,
    if (c.spec != null) 'aiRenderPrompt': c.spec!.renderPrompt,
    'note':
        'Concept artwork for review. Production patterns, print files and tech packs are a future feature.',
  });
  return {
    if (c.mockupFront != null) '3d-front.png': c.mockupFront!,
    if (c.mockupBack != null) '3d-back.png': c.mockupBack!,
    if (c.mockupSide != null) '3d-side.png': c.mockupSide!,
    if (c.renderFront != null) 'ai-render-front.jpg': c.renderFront!,
    if (c.renderBack != null) 'ai-render-back.jpg': c.renderBack!,
    if (c.patternTile != null) 'ai-pattern-tile.png': c.patternTile!,
    if (c.logoImage != null) 'chest-logo.png': c.logoImage!,
    if (c.sponsorImage != null) 'sponsor-logo.png': c.sponsorImage!,
    for (final (i, image) in c.showcases.indexed)
      'showcase-${i + 1}.jpg': image,
    'illustration.svg': utf8.encode(_svg(c)),
    'design-brief.json': utf8.encode(brief),
    'READ-ME.txt': utf8.encode(
      '3DEEZI DESIGN PACK\n\n3D mock-ups, AI renders and the design brief for ${c.projectName.isEmpty ? 'this design' : c.projectName}.\nConcept artwork for review; not production print files.\n',
    ),
  };
}

/// A 1080 x 1350 social post: the kit on the brand background, with the
/// design name and a 3DEEZI footer.
Future<Uint8List> socialImage(AppController c, Uint8List kitImage) async {
  const w = 1080.0, h = 1350.0;
  final codec = await ui.instantiateImageCodec(kitImage);
  final kit = (await codec.getNextFrame()).image;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder, const Rect.fromLTWH(0, 0, w, h));
  canvas.drawRect(
    const Rect.fromLTWH(0, 0, w, h),
    Paint()
      ..shader = ui.Gradient.radial(const Offset(w / 2, h * .45), h * .7, [
        const Color(0xff0a3550),
        const Color(0xff03060a),
      ]),
  );
  // Fit the kit image into the upper area.
  const box = Rect.fromLTWH(60, 150, w - 120, h - 420);
  final scale = [
    box.width / kit.width,
    box.height / kit.height,
  ].reduce((a, b) => a < b ? a : b);
  final size = Size(kit.width * scale, kit.height * scale);
  final dst = Rect.fromCenter(
    center: box.center,
    width: size.width,
    height: size.height,
  );
  canvas.drawImageRect(
    kit,
    Rect.fromLTWH(0, 0, kit.width.toDouble(), kit.height.toDouble()),
    dst,
    Paint()..filterQuality = FilterQuality.high,
  );
  void text(
    String value,
    double y,
    double size,
    Color color, {
    double spacing = 0,
    FontWeight weight = FontWeight.w700,
  }) {
    final painter = TextPainter(
      text: TextSpan(
        text: value,
        style: TextStyle(
          fontFamily: 'Rajdhani',
          fontSize: size,
          fontWeight: weight,
          color: color,
          letterSpacing: spacing,
        ),
      ),
      textAlign: TextAlign.center,
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: w - 100);
    painter.paint(canvas, Offset((w - painter.width) / 2, y));
  }

  text('3DEEZI', 60, 64, const Color(0xff00dbea), spacing: 4);
  text(
    (c.projectName.isEmpty ? '${c.sport} ${c.garment}' : c.projectName)
        .toUpperCase(),
    h - 250,
    72,
    Colors.white,
  );
  text(
    '${c.sport.toUpperCase()}  ·  ${c.garment.toUpperCase()}',
    h - 160,
    34,
    const Color(0xff8d9daa),
    spacing: 3,
    weight: FontWeight.w600,
  );
  text(
    'YOUR SPORT. YOUR WAY.',
    h - 95,
    30,
    const Color(0xff00dbea),
    spacing: 6,
    weight: FontWeight.w600,
  );
  final image = await recorder.endRecording().toImage(w.toInt(), h.toInt());
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  return data!.buffer.asUint8List();
}

String _hex(Color c) =>
    '#${c.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}';
String _escape(String s) => s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
String _svg(AppController c) {
  final shorts = c.garment == 'Shorts';
  final cap = c.garment == 'Hat / Cap';
  final singlet = c.garment == 'Singlet' || c.garment == 'Netball dress';
  final shape = shorts
      ? 'M110 100H250L265 290L190 302L180 207L170 302L95 290Z'
      : cap
      ? 'M87 218Q90 100 183 100Q270 112 274 218Z'
      : singlet
      ? 'M135 48Q180 62 225 48L267 68L256 131Q241 151 247 172L251 323Q180 338 109 323L115 122Q119 147 104 131L93 68Z'
      : 'M135 48Q180 62 225 48L267 68L314 133L267 156L245 122L251 323Q180 338 109 323L115 122L93 156L46 133L93 68Z';
  return '''<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1200" viewBox="0 0 360 400">
<title>3DEEZI illustrative ${_escape(c.garment)} mock-up</title><desc>Demonstration artwork only. Not for production.</desc>
<defs><linearGradient id="cloth"><stop stop-color="${_hex(c.mainColor)}"/><stop offset=".5" stop-color="${_hex(c.mainColor)}"/><stop offset="1" stop-color="#263c4a"/></linearGradient><clipPath id="kit"><path d="$shape"/></clipPath></defs>
<rect width="360" height="400" fill="#05090d"/><text x="180" y="25" fill="#00dbea" font-family="sans-serif" font-size="13" font-weight="bold" text-anchor="middle">3DEEZI</text>
<path d="$shape" fill="url(#cloth)" stroke="${_hex(c.secondaryColor)}" stroke-width="2"/>
<g clip-path="url(#kit)" fill="none" stroke="${_hex(c.secondaryColor)}"><path d="M105 75L128 120L139 331M255 75L232 120L221 331" stroke-width="13"/>${c.pattern == 'Solid' ? '' : List.generate(16, (i) => '<path d="M60 ${65 + i * 16}L125 ${77 + i * 16}L180 ${106 + i * 16}L235 ${77 + i * 16}L300 ${65 + i * 16}" opacity=".3"/>').join()}</g>
${shorts || cap ? '' : '<path d="M135 48Q180 62 225 48Q220 78 180 99Q140 78 135 48Z" fill="#05090d" stroke="${_hex(c.secondaryColor)}" stroke-width="4"/>'}
<text x="180" y="${shorts ? 165 : 182}" fill="${_hex(c.accentColor)}" font-family="sans-serif" font-size="${c.logoText.length > 10 ? 18 : 26}" text-anchor="middle" font-weight="bold">${c.view == 'Back' ? '23' : _escape(c.logoText)}</text>
<text x="180" y="365" fill="#8d9daa" font-family="sans-serif" font-size="8" text-anchor="middle">${_escape(c.sport)} · ${_escape(c.garment)} · ${_escape(c.fabric)}</text>
<text x="180" y="384" fill="#00dbea" font-family="sans-serif" font-size="7" text-anchor="middle">ILLUSTRATIVE DEMO · NOT FOR PRODUCTION</text></svg>''';
}

Uint8List _zip(Map<String, List<int>> files) {
  final output = BytesBuilder();
  final directory = BytesBuilder();
  var offset = 0;
  for (final file in files.entries) {
    final name = utf8.encode(file.key), data = file.value, crc = _crc(data);
    final local = ByteData(30)
      ..setUint32(0, 0x04034b50, Endian.little)
      ..setUint16(4, 20, Endian.little)
      ..setUint32(14, crc, Endian.little)
      ..setUint32(18, data.length, Endian.little)
      ..setUint32(22, data.length, Endian.little)
      ..setUint16(26, name.length, Endian.little);
    output.add(local.buffer.asUint8List());
    output.add(name);
    output.add(data);
    final entry = ByteData(46)
      ..setUint32(0, 0x02014b50, Endian.little)
      ..setUint16(4, 20, Endian.little)
      ..setUint16(6, 20, Endian.little)
      ..setUint32(16, crc, Endian.little)
      ..setUint32(20, data.length, Endian.little)
      ..setUint32(24, data.length, Endian.little)
      ..setUint16(28, name.length, Endian.little)
      ..setUint32(42, offset, Endian.little);
    directory.add(entry.buffer.asUint8List());
    directory.add(name);
    offset += 30 + name.length + data.length;
  }
  final central = directory.takeBytes();
  output.add(central);
  final end = ByteData(22)
    ..setUint32(0, 0x06054b50, Endian.little)
    ..setUint16(8, files.length, Endian.little)
    ..setUint16(10, files.length, Endian.little)
    ..setUint32(12, central.length, Endian.little)
    ..setUint32(16, offset, Endian.little);
  output.add(end.buffer.asUint8List());
  return output.takeBytes();
}

int _crc(List<int> data) {
  var crc = 0xffffffff;
  for (final byte in data) {
    crc ^= byte;
    for (var bit = 0; bit < 8; bit++) {
      crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xedb88320 : crc >> 1;
    }
  }
  return (crc ^ 0xffffffff) & 0xffffffff;
}
