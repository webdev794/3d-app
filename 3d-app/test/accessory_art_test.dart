import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/accessory_art.dart';

/// Artwork to 3D for caps (CP1, client 2026-11-02): the AI reading of a cap
/// sheet, each logo cut out of the picture and put on its place on the cap.
Map<String, dynamic> _box(
  double x0,
  double y0,
  double x1,
  double y1, [
  String? level,
]) => {'found': true, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1, 'level': ?level};

const _none = {'found': false, 'x0': 0, 'y0': 0, 'x1': 0, 'y1': 0};

/// A black sheet with a white "logo" block at (60..140, 40..60) of 200x100.
Future<Uint8List> _sheet() async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  canvas.drawRect(
    const Rect.fromLTWH(0, 0, 200, 100),
    Paint()..color = Colors.black,
  );
  canvas.drawRect(
    const Rect.fromLTWH(60, 40, 80, 20),
    Paint()..color = Colors.white,
  );
  final image = await recorder.endRecording().toImage(200, 100);
  return (await image.toByteData(
    format: ui.ImageByteFormat.png,
  ))!.buffer.asUint8List();
}

void main() {
  final reading = AccessoryReading.fromJson({
    'garment': 'cap',
    'exact': true,
    'name': 'Mantis Cap',
    'mainColor': '#0b0b0d',
    'trimColor': '#ffffff',
    'brimColor': '',
    'underColor': 'nonsense',
    'accentColor': '#ffffff',
    'frontText': 'Mantis',
    'front': _box(0.3, 0.4, 0.7, 0.6),
    'back': _none,
    'left': _box(0.1, 0.8, 0.2, 0.85, 'low'),
    'right': _box(0.1, 0.1, 0.9, 0.95, 'high'),
    'frontView': _box(0.2, 0.2, 0.8, 0.8),
    'backView': _none,
  }, 'Cap');

  test('a cap sheet is read into colours and the logos found', () {
    expect(reading.garment, 'Cap');
    expect(reading.name, 'Mantis Cap');
    expect(reading.main, const Color(0xff0b0b0d));
    expect(reading.trim, Colors.white.withAlpha(255));
    // No brim colour: the body's; no underside colour: the brim's.
    expect(reading.brim, reading.main);
    expect(reading.under, reading.main);
    expect(reading.frontText, 'MANTIS');
    expect(reading.marks.keys, ['front', 'left']);
    expect(reading.marks['left']!.level, 'low');
    expect(reading.views.keys, ['front']);
    expect(accessoryParts(reading), {
      'capBrim': {'colour': '#0B0B0D'},
      'capUnder': {'colour': '#0B0B0D'},
    });
  });

  test(
    'a garment the user chose stays; other garments fall back to the cap',
    () {
      expect(
        AccessoryReading.fromJson({'garment': 'cap'}, 'Bucket hat').garment,
        'Bucket hat',
      );
      expect(
        AccessoryReading.fromJson({'garment': 'cap'}, 'Jersey').garment,
        'Cap',
      );
    },
  );

  test('one logo on the front of a cap; socks take it as their crest', () {
    final layer = accessoryFrontLayer('Cap', 'data:x', 'logo.png', 4)!;
    expect(layer['side'], 'front');
    expect(layer['y'], closeTo(0.158, 1e-9));
    expect(layer['w'], 0.1);
    // A tall logo is kept within the front panel's height.
    expect(
      accessoryFrontLayer('Cap', 'data:x', 'logo.png', 0.5)!['w'],
      closeTo(0.0425, 1e-4),
    );
    expect(accessoryFrontLayer('Socks', 'data:x', 'logo.png', 1), isNull);
  });

  test(
    'with the customer logo on the front, the 3DEEZI marks go on the back (BR1)',
    () {
      for (final g in ['Cap', '5 panel cap', 'Bucket hat', 'Beanie']) {
        final m = accessoryBackMarks(g)!;
        expect(m['top_crest']!['side'], 'back', reason: g);
        expect(m['top_wordmark']!['side'], 'back', reason: g);
      }
      expect(accessoryBackMarks('Socks'), isNull);
      // The 5-panel cap takes the cap's places; the beanie its logo on the cuff.
      expect(
        accessoryFrontLayer('5 panel cap', 'data:x', 'l', 4)!['y'],
        closeTo(0.158, 1e-9),
      );
      expect(accessoryFrontLayer('Beanie', 'data:x', 'l', 4)!['y'], 0.033);
    },
  );

  testWidgets('each logo is cut out of the picture and put on its place', (
    tester,
  ) async {
    await tester.runAsync(() async {
      final picture = await _sheet();
      final cut = await cutLogo(
        picture,
        const Rect.fromLTRB(0.25, 0.3, 0.75, 0.7),
      );
      expect(cut, isNotNull);
      // Trimmed to the white block, its black background taken away.
      expect(cut!.aspect, closeTo(4, 0.3));
      expect(cut.w, closeTo(0.4, 0.03));
      final placed = await accessoryLayers(reading, picture);
      expect(placed.crest, isNull);
      expect(placed.layers.map((l) => l['name']), [
        'Front logo',
        'Left side label',
      ]);
      final front = placed.layers.first;
      expect(front['side'], 'front');
      expect(front['x'], 0);
      // Its share of the front view (0.4 of 0.6) of a cap about 0.2 m across, within the panel.
      expect(front['w'], closeTo(0.1333, 0.01));
      final left = placed.layers.last;
      expect(left['x'], 0.128);
      expect(left['y'], closeTo(0.114, 1e-9));
    });
  });
}
