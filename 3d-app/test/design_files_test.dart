import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/design_files.dart';

import 'flow_test.dart' show mountPhone;

/// AI Designer design files (client 2026-11-02, picture 295.jpg): PDF, SVG,
/// AI, EPS, PSD, TIFF and pictures; the chip shows the name and type.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Uint8List bytes(String s) => Uint8List.fromList(latin1.encode(s));
  Future<Uint8List> png(int w, int h) async {
    final recorder = ui.PictureRecorder();
    Canvas(recorder).drawRect(
      Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()),
      Paint()..color = const Color(0xff00dbea),
    );
    final image = await recorder.endRecording().toImage(w, h);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data!.buffer.asUint8List();
  }

  test('reads what a file is from its first bytes', () {
    expect(designKind(bytes('%PDF-1.4\n'), 'kit.pdf'), 'pdf');
    // An Illustrator file saved with PDF compatibility is a PDF inside.
    expect(designKind(bytes('%PDF-1.6\n'), 'crest.ai'), 'pdf');
    expect(designKind(bytes('%!PS-Adobe-3.0 EPSF-3.0\n'), 'old.eps'), 'eps');
    expect(designKind(bytes('8BPS\u0000\u0001'), 'crest.psd'), 'psd');
    expect(designKind(bytes('II*\u0000rest'), 'scan.tif'), 'tiff');
    expect(
      designKind(bytes('\u0000\u0000\u0000\u0018ftypheic\u0000'), 'a.heic'),
      'heic',
    );
    expect(
      designKind(bytes('<?xml version="1.0"?><svg xmlns="x">'), 'logo.svg'),
      'svg',
    );
    expect(designKind(bytes('\u0089PNG\r\n'), 'a.png'), 'picture');
    expect(designKind(bytes('hello'), 'notes.txt'), isNull);
    expect(designLabel('crest.ai', 'pdf'), 'AI');
    expect(designLabel('photo.jpeg', 'picture'), 'JPG');
    expect(designLabel('noending', 'pdf'), 'PDF');
  });

  testWidgets('a picture stays as it is; others say what to do', (
    tester,
  ) async {
    final c = AppController()..screen = AppScreen.home;
    await mountPhone(tester, c);
    final context = tester.element(find.byType(Scaffold).first);
    await tester.runAsync(() async {
      final picture = await png(40, 30);
      final ref = await designReference(context, c, 'Sponsor.png', picture);
      expect(ref!.picture, same(picture));
      expect(ref.file.label, 'PNG');
      expect(ref.file.original, isNull);
      // EPS needs the server, which needs an account.
      await expectLater(
        designReference(
          context,
          c,
          'Old logo.eps',
          bytes('%!PS-Adobe-3.0 EPSF-3.0\n'),
        ),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            contains('save it as PDF, SVG or PNG'),
          ),
        ),
      );
      await expectLater(
        designReference(context, c, 'Notes.txt', bytes('hello')),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            contains("can't be attached"),
          ),
        ),
      );
      await expectLater(
        designReference(
          context,
          c,
          'Huge.pdf',
          Uint8List(designMaxBytes + 1)..setAll(0, latin1.encode('%PDF-')),
        ),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            contains('over 25 MB'),
          ),
        ),
      );
    });
  });

  testWidgets('the bar shows a design file with its name and type', (
    tester,
  ) async {
    final c = AppController()..screen = AppScreen.home;
    await mountPhone(tester, c);
    c.startAi();
    await tester.pump(const Duration(milliseconds: 500));
    final picture = (await tester.runAsync(() => png(60, 45)))!;
    c.update(() {
      c.references.add(picture);
      c.referenceFiles[picture] = ReferenceFile(
        name: 'Hawks kit.pdf',
        label: 'PDF',
        original: bytes('%PDF-1.4\n'),
        page: 2,
        pages: 2,
      );
    });
    await tester.pump();
    expect(find.text('Hawks kit.pdf'), findsOneWidget);
    expect(find.text('PDF · page 2 of 2'), findsOneWidget);
    await tester.tap(find.byTooltip('Remove Hawks kit.pdf'));
    await tester.pump();
    expect(c.references, isEmpty);
    expect(find.text('Hawks kit.pdf'), findsNothing);
  });
}
