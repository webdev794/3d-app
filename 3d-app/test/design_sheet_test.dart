import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/design_sheet.dart';

import 'features_test.dart' show FakeStore;

/// The PDF design sheet on the Export screen, as on the website.
void main() {
  Future<Uint8List> png(int w, int h, Color colour) async {
    final recorder = ui.PictureRecorder();
    Canvas(recorder).drawRect(
      Rect.fromLTWH(w * .2, h * .1, w * .6, h * .8),
      Paint()..color = colour,
    );
    final image = await recorder.endRecording().toImage(w, h);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data!.buffer.asUint8List();
  }

  testWidgets('builds a one-page sheet from the captured views', (
    tester,
  ) async {
    final c = AppController(
      store: FakeStore(),
      api: ApiClient(baseUrl: 'https://test.example'),
    );
    await expectLater(designSheetPdf(c), throwsStateError);

    final pdf = await tester.runAsync(() async {
      c
        ..projectName = 'Coastal Warriors – Home kit'
        ..mockupFront = await png(900, 1000, const Color(0xff1e6fe8))
        ..mockupBack = await png(900, 1000, const Color(0xffe81e4f))
        ..mockupPanels = await png(2000, 900, const Color(0xff12e1f0))
        ..zones = {'sleeves': 'stripes'}
        ..layers = [
          {'id': 'a', 'type': 'text', 'text': 'TIGERS'},
        ];
      return designSheetPdf(c);
    });
    expect(String.fromCharCodes(pdf!.take(5)), '%PDF-');
    expect(String.fromCharCodes(pdf).contains('/Count 1'), isTrue);
    final out = Platform.environment['DESIGN_SHEET_OUT'];
    if (out != null) File(out).writeAsBytesSync(pdf);
  });
}
