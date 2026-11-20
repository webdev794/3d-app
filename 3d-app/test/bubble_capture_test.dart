import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/app.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/bubble_home.dart';
import 'package:three_deezi/widgets/ui.dart' show BottomNav;

import 'features_test.dart' show FakeStore;

/// Pictures for the client (bubble home, 2026-11-02), not a check: the
/// idle home at 1170 x 2532 (390 x 844 at 3x), the frames of a drag to
/// ARTBOARD and release, and every phone screen with the bottom bar.
/// Runs only with BUBBLE_CAPTURE set:
///   BUBBLE_CAPTURE=1 flutter test test/bubble_capture_test.dart
final _out =
    Platform.environment['BUBBLE_CAPTURE_DIR'] ??
    r'D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad\HB1\client';
final _skip = Platform.environment['BUBBLE_CAPTURE'] == null;
final _key = GlobalKey();

Future<void> _loadFonts() async {
  Future<ByteData> file(String p) async =>
      ByteData.sublistView(File(p).readAsBytesSync());
  await (FontLoader('Rajdhani')
        ..addFont(file('assets/fonts/Rajdhani-Bold.ttf'))
        ..addFont(file('assets/fonts/Rajdhani-SemiBold.ttf')))
      .load();
  await (FontLoader('Inter')..addFont(file('assets/fonts/Inter.ttf'))).load();
  final artifacts = File(Platform.resolvedExecutable).parent.parent.parent;
  final icons = File(
    '${artifacts.path}/material_fonts/materialicons-regular.otf',
  );
  if (icons.existsSync()) {
    await (FontLoader('MaterialIcons')..addFont(file(icons.path))).load();
  }
}

void _phone(WidgetTester tester, double dpr) {
  tester.view.devicePixelRatio = dpr;
  tester.view.physicalSize = Size(390 * dpr, 844 * dpr);
  tester.view.padding = FakeViewPadding(top: 47 * dpr, bottom: 34 * dpr);
  tester.view.viewPadding = FakeViewPadding(top: 47 * dpr, bottom: 34 * dpr);
  addTearDown(tester.view.reset);
}

Future<void> _precache(WidgetTester tester) async {
  final ctx = tester.element(find.byType(Scaffold).first);
  final images = tester.widgetList<Image>(find.byType(Image)).toList();
  await tester.runAsync(() async {
    for (final img in images) {
      await precacheImage(img.image, ctx);
    }
  });
  await tester.pump(const Duration(milliseconds: 50));
}

Future<void> _save(WidgetTester tester, String path, double ratio) async {
  final boundary = tester.renderObject<RenderRepaintBoundary>(find.byKey(_key));
  await tester.runAsync(() async {
    final img = await boundary.toImage(pixelRatio: ratio);
    final data = await img.toByteData(format: ui.ImageByteFormat.png);
    File(path)
      ..parent.createSync(recursive: true)
      ..writeAsBytesSync(data!.buffer.asUint8List());
  });
}

Future<AppController> _bubble(WidgetTester tester) async {
  final c = AppController(store: FakeStore())..screen = AppScreen.home;
  addTearDown(c.dispose);
  await tester.pumpWidget(
    MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(brightness: Brightness.dark, fontFamily: 'Inter'),
      home: RepaintBoundary(
        key: _key,
        child: Scaffold(
          backgroundColor: const Color(0xff030a14),
          body: SafeArea(child: BubbleHomeScreen(c, onSwitchToClassic: () {})),
        ),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 100));
  await _precache(tester);
  return c;
}

void main() {
  setUpAll(_loadFonts);
  setUp(
    () =>
        SharedPreferences.setMockInitialValues({BubbleTutorial.seenKey: true}),
  );

  testWidgets('idle home, 1170 x 2532', skip: _skip, (tester) async {
    _phone(tester, 3);
    await _bubble(tester);
    await tester.pump(const Duration(milliseconds: 1200));
    await _save(tester, '$_out/bubble-home-idle-1170x2532.png', 3);
  });

  testWidgets('drag to ARTBOARD and release: frames', skip: _skip, (
    tester,
  ) async {
    _phone(tester, 2);
    final c = await _bubble(tester);
    var n = 0;
    Future<void> frame() async {
      await tester.pump(const Duration(milliseconds: 50));
      await _save(
        tester,
        '$_out/frames/f${(n++).toString().padLeft(3, '0')}.png',
        2,
      );
    }

    final glass = tester.getRect(find.byKey(const ValueKey('bubble-glass')));
    final mid = glass.center;
    final target = tester.getCenter(
      find.byKey(const ValueKey('bubble-spot-artboard')),
    );
    for (var i = 0; i < 10; i++) {
      await frame();
    }
    final g = await tester.startGesture(mid);
    await frame();
    for (var i = 1; i <= 22; i++) {
      final u = Curves.easeInOut.transform(i / 22);
      await g.moveTo(Offset.lerp(mid, target, u)!);
      await frame();
    }
    for (var i = 0; i < 14; i++) {
      await frame();
    }
    await g.up();
    for (var i = 0; i < 8; i++) {
      await frame();
    }
    expect(c.screen, AppScreen.artboard);
    for (var i = 0; i < 12; i++) {
      await frame();
    }
  });

  testWidgets('every phone screen with the bottom bar', skip: _skip, (
    tester,
  ) async {
    _phone(tester, 1);
    final c = AppController(store: FakeStore())..screen = AppScreen.home;
    addTearDown(c.dispose);
    await tester.pumpWidget(
      RepaintBoundary(
        key: _key,
        child: ThreeDeeziApp(controller: c),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));
    for (final s in const [
      AppScreen.home,
      AppScreen.projects,
      AppScreen.assets,
      AppScreen.orderHub,
      AppScreen.profile,
    ]) {
      c.go(s);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await _precache(tester);
      expect(find.byType(BottomNav), findsOneWidget, reason: '$s');
      await _save(tester, '$_out/nav/nav-${s.name}.png', 1);
    }
  });
}
