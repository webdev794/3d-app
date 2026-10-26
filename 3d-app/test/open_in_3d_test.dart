import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/ai_service.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/ai_designer.dart' show cropCrest;

/// "Open in 3D Designer" (task 9.116, client 2026-10-23): the AI picture is
/// read for the nearest 3D garment we have and its own colours, pattern,
/// symbol and lettering (netball: the position letters). No AI calls.
DesignSpec _spec(String sport, String garment) => DesignSpec(
  designName: 'Panther Spiral',
  detected: garment,
  summary: 'A design.',
  findings: const ['a', 'b', 'c'],
  mainColor: const Color(0xff101d2a),
  secondaryColor: const Color(0xff04d9e8),
  accentColor: const Color(0xffffffff),
  pattern: 'Chevron',
  fabric: 'Standard',
  logoText: '3DEEZI',
  renderPrompt: 'design',
  patternMotif: '',
  sport: sport,
  garment: garment,
);

Map<String, dynamic> _reading(Map<String, dynamic> over) => {
  'seen': 'soccer jersey',
  'garment': 'jersey',
  'exact': true,
  'hood': false,
  'mainColor': '#0b6e3a',
  'secondaryColor': '#ffffff',
  'accentColor': '#f5c400',
  'pattern': 'Stripes',
  'patternMotif': 'thin pinstripes',
  'teamName': 'Green Hawks',
  'backName': 'HAWKS',
  'number': '10',
  'positionLetters': '',
  'crest': {'found': true, 'x0': 0.55, 'y0': 0.22, 'x1': 0.63, 'y1': 0.3},
  ...over,
};

void main() {
  test('a soccer jersey opens on the jersey in the picture\'s colours', () {
    final r = DesignReading.fromJson(
      _reading({}),
      sport: 'Soccer',
      asked: 'Jersey',
    );
    final c = AppController()..concepts = [Concept(_spec('Soccer', 'Jersey'))];
    c.openReading(0, r);
    expect(c.screen, AppScreen.studio);
    expect(c.garment, 'Jersey');
    expect(c.mainColor, const Color(0xff0b6e3a));
    expect(c.secondaryColor, const Color(0xffffffff));
    expect(c.accentColor, const Color(0xfff5c400));
    expect(c.pattern, 'Stripes');
    expect(c.logoText, 'GREEN HAWKS');
    expect(c.backName, 'HAWKS');
    expect(c.number, '10');
    expect(c.marks, isEmpty);
    expect(r.crest!.width, closeTo(0.08, 1e-9));
  });

  test('a netball dress opens on the singlet with the position letters', () {
    final r = DesignReading.fromJson(
      _reading({
        'seen': 'netball dress',
        'garment': 'singlet',
        'exact': false,
        'teamName': '3DEEZI',
        'backName': '',
        'number': '',
        'positionLetters': 'gs',
      }),
      sport: 'Netball',
      asked: 'Singlet',
    );
    expect(r.letters, 'GS');
    expect(r.exact, isFalse);
    expect(r.teamName, '', reason: '3DEEZI is never the team name');
    final c = AppController()
      ..concepts = [Concept(_spec('Netball', 'Singlet'))];
    final logo = Uint8List.fromList([1, 2, 3]);
    c.openReading(0, r, logo: logo);
    expect(c.garment, 'Singlet');
    expect(c.backName, '');
    expect(c.number, 'GS');
    expect(c.logoImage, same(logo));
    expect(c.marks.keys, containsAll(['top_name', 'top_wordmark']));
    final letters = c.layers.singleWhere(
      (l) => l['id'] == AppController.positionLayer,
    );
    expect(letters['text'], 'GS');
    expect(letters['side'], 'front');
  });

  test('a reading never refuses', () {
    final odd = DesignReading.fromJson(
      {'garment': 'dress', 'mainColor': 'green', 'positionLetters': 'XX'},
      sport: 'Netball',
      asked: 'Singlet',
    );
    expect(odd.garment, 'Singlet');
    expect(odd.mainColor, const Color(0xff0b1016));
    expect(odd.letters, 'GS');
    expect(odd.crest, isNull);
    final track = DesignReading.fromJson(
      _reading({'garment': 'trackjacket', 'hood': true, 'number': ''}),
      sport: 'Rugby League',
      asked: 'Jersey',
    );
    final c = AppController()
      ..concepts = [Concept(_spec('Rugby League', 'Jersey'))];
    c.openReading(0, track);
    expect(c.garment, 'Track jacket');
    expect(c.trackStyle, 'hood');
    expect(c.number, '23');
  });

  testWidgets('the club symbol is cut from the picture', (tester) async {
    await tester.runAsync(() async {
      final recorder = ui.PictureRecorder();
      Canvas(recorder)
        ..drawRect(
          const Rect.fromLTWH(0, 0, 200, 300),
          Paint()..color = const Color(0xff000000),
        )
        ..drawRect(
          const Rect.fromLTWH(100, 60, 20, 20),
          Paint()..color = const Color(0xffffcc00),
        );
      final image = await recorder.endRecording().toImage(200, 300);
      final png = (await image.toByteData(
        format: ui.ImageByteFormat.png,
      ))!.buffer.asUint8List();
      final crest = await cropCrest(
        png,
        const Rect.fromLTWH(0.5, 0.2, 0.1, 1 / 15),
      );
      expect(crest, isNotNull);
      final out = await (await ui.instantiateImageCodec(crest!)).getNextFrame();
      // The box with a 12 % margin each side.
      expect(out.image.width, closeTo(24.8, 1));
      expect(out.image.height, closeTo(24.8, 1));
    });
  });

  testWidgets('a print sheet with the front and back touching is moved apart', (
    tester,
  ) async {
    await tester.runAsync(() async {
      Future<Uint8List> sheet(bool touching) async {
        final recorder = ui.PictureRecorder();
        final green = Paint()..color = const Color(0xff0a7828);
        Canvas(recorder)
          ..drawRect(
            const Rect.fromLTWH(0, 0, 300, 200),
            Paint()..color = const Color(0xffffffff),
          )
          ..drawRect(Rect.fromLTRB(20, 30, touching ? 151 : 130, 180), green)
          ..drawRect(Rect.fromLTRB(touching ? 149 : 170, 30, 280, 180), green);
        final image = await recorder.endRecording().toImage(300, 200);
        return (await image.toByteData(
          format: ui.ImageByteFormat.png,
        ))!.buffer.asUint8List();
      }

      final apart = await sheet(false);
      expect(await AiService.separateHalves(apart), same(apart));
      final fixed = await AiService.separateHalves(await sheet(true));
      final out = (await (await ui.instantiateImageCodec(
        fixed,
      )).getNextFrame()).image;
      expect(out.width, 324);
      final px = (await out.toByteData(format: ui.ImageByteFormat.rawRgba))!;
      expect(px.getUint8((100 * 324 + 162) * 4 + 1), greaterThan(230));
      expect(px.getUint8((100 * 324 + 140) * 4), lessThan(100));
    });
  });
}
