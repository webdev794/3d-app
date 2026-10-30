import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/bubble_home.dart';
import 'package:three_deezi/widgets/ui.dart' show BottomNav, BrandLogo;

import 'features_test.dart' show FakeStore;

/// The phone home as one glass bubble (client 2026-10-30): drag to an
/// option lights it with "Release to enter" and release opens it; drag back
/// cancels; a tap opens; "Classic view" switches back; it fits 360 × 740,
/// 390 × 844 and 430 × 932 with an iPhone's safe area.
const _shots =
    r'D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad\HB1\shots';
final _shotKey = GlobalKey();

Future<void> _loadFonts() async {
  Future<ByteData> file(String p) async =>
      ByteData.sublistView(File(p).readAsBytesSync());
  await (FontLoader('Rajdhani')
        ..addFont(file('assets/fonts/Rajdhani-Bold.ttf'))
        ..addFont(file('assets/fonts/Rajdhani-SemiBold.ttf')))
      .load();
  await (FontLoader('Inter')..addFont(file('assets/fonts/Inter.ttf'))).load();
  // Material icons from the Flutter SDK, so the shots show real icons.
  final artifacts = File(Platform.resolvedExecutable).parent.parent.parent;
  final icons = File(
    '${artifacts.path}/material_fonts/materialicons-regular.otf',
  );
  if (icons.existsSync()) {
    await (FontLoader('MaterialIcons')..addFont(file(icons.path))).load();
  }
}

Future<AppController> _pump(
  WidgetTester tester, {
  Size size = const Size(390, 844),
  VoidCallback? onClassic,
  bool notch = false,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  if (notch) {
    tester.view.padding = const FakeViewPadding(top: 47, bottom: 34);
    tester.view.viewPadding = const FakeViewPadding(top: 47, bottom: 34);
    addTearDown(tester.view.resetPadding);
    addTearDown(tester.view.resetViewPadding);
  }
  final c = AppController(store: FakeStore())..screen = AppScreen.home;
  addTearDown(c.dispose);
  await tester.pumpWidget(
    MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(brightness: Brightness.dark, fontFamily: 'Inter'),
      home: RepaintBoundary(
        key: _shotKey,
        child: Scaffold(
          backgroundColor: const Color(0xff030a14),
          body: SafeArea(
            child: BubbleHomeScreen(c, onSwitchToClassic: onClassic ?? () {}),
          ),
        ),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 100));
  return c;
}

Future<void> _precache(WidgetTester tester) async {
  final ctx = tester.element(find.byType(BubbleHomeScreen));
  final images = tester.widgetList<Image>(find.byType(Image)).toList();
  await tester.runAsync(() async {
    for (final img in images) {
      await precacheImage(img.image, ctx);
    }
  });
  await tester.pump(const Duration(milliseconds: 50));
}

Future<void> _shot(WidgetTester tester, String name) async {
  final boundary = tester.renderObject<RenderRepaintBoundary>(
    find.byKey(_shotKey),
  );
  await tester.runAsync(() async {
    final img = await boundary.toImage(pixelRatio: 1);
    final data = await img.toByteData(format: ui.ImageByteFormat.png);
    Directory(_shots).createSync(recursive: true);
    File('$_shots/$name.png').writeAsBytesSync(data!.buffer.asUint8List());
  });
}

Rect _glass(WidgetTester tester) =>
    tester.getRect(find.byKey(const ValueKey('bubble-glass')));

Offset _spot(WidgetTester tester, String id) =>
    tester.getCenter(find.byKey(ValueKey('bubble-spot-$id')));

Future<void> _moveTo(
  WidgetTester tester,
  TestGesture g,
  Offset from,
  Offset to,
) async {
  for (var k = 1; k <= 6; k++) {
    await g.moveTo(Offset.lerp(from, to, k / 6)!);
    await tester.pump(const Duration(milliseconds: 16));
  }
}

void main() {
  setUpAll(_loadFonts);

  testWidgets('drag to AI: it lights up with Release to enter, then opens', (
    tester,
  ) async {
    final c = await _pump(tester);
    final mid = _glass(tester).center;
    final ai = _spot(tester, 'ai');
    expect(find.text('Release to enter'), findsNothing);
    expect(find.text('DRAG TO EXPLORE'), findsOneWidget);

    final g = await tester.startGesture(mid);
    await _moveTo(tester, g, mid, ai);
    expect(find.text('Release to enter'), findsOneWidget);
    expect(find.text('AI DESIGNER'), findsOneWidget);
    expect(c.screen, AppScreen.home);

    await g.up();
    await tester.pump();
    // The short glass expansion, then AI Designer opens.
    await tester.pump(const Duration(milliseconds: 150));
    expect(c.screen, AppScreen.home);
    await tester.pump(const Duration(milliseconds: 250));
    await tester.pump();
    expect(c.screen, AppScreen.aiDesigner);
    expect(tester.takeException(), isNull);
  });

  testWidgets('drag back to the centre cancels and springs back', (
    tester,
  ) async {
    final c = await _pump(tester);
    final mid = _glass(tester).center;
    final dyo = _spot(tester, 'dyo');
    final g = await tester.startGesture(mid);
    await _moveTo(tester, g, mid, dyo);
    expect(find.text('Release to enter'), findsOneWidget);
    expect(find.text('DESIGN YOUR OWN'), findsOneWidget);
    await _moveTo(tester, g, dyo, mid);
    expect(find.text('Release to enter'), findsNothing);
    await g.up();
    await tester.pump(const Duration(milliseconds: 700));
    expect(c.screen, AppScreen.home);
    expect(find.text('Release to enter'), findsNothing);
    expect(find.text('DRAG TO EXPLORE'), findsOneWidget);

    // Releasing away from every option cancels too.
    final g2 = await tester.startGesture(mid);
    await _moveTo(tester, g2, mid, mid + const Offset(0, 40));
    await g2.up();
    await tester.pump(const Duration(milliseconds: 700));
    expect(c.screen, AppScreen.home);
  });

  testWidgets('a tap on an option opens it', (tester) async {
    final c = await _pump(tester);
    await tester.tap(find.byKey(const ValueKey('bubble-spot-artboard')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pump();
    expect(c.screen, AppScreen.artboard);
  });

  testWidgets('keyboard: arrows move the focus ring, Enter opens', (
    tester,
  ) async {
    final c = await _pump(tester);
    // Tab into the glass: the ring starts on AI; right moves to DYO.
    for (var k = 0; k < 6; k++) {
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      if (tester.binding.focusManager.primaryFocus?.debugLabel ==
          'bubble-home') {
        break;
      }
    }
    expect(
      tester.binding.focusManager.primaryFocus?.debugLabel,
      'bubble-home',
    );
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pump();
    expect(c.screen, AppScreen.sport);
  });

  testWidgets('screen reader buttons for the five options', (tester) async {
    final handle = tester.ensureSemantics();
    await _pump(tester);
    for (final name in const [
      'AI DESIGNER',
      'DESIGN YOUR OWN',
      'ARTBOARD',
      'DESIGN TEAM',
      'ARTWORK TO 3D',
    ]) {
      expect(find.bySemanticsLabel(name), findsOneWidget, reason: name);
    }
    handle.dispose();
  });

  testWidgets('Classic view calls the switch', (tester) async {
    var n = 0;
    await _pump(tester, onClassic: () => n++);
    await tester.tap(find.byKey(const ValueKey('bubble-classic-view')));
    await tester.pump();
    expect(n, 1);
  });

  for (final size in const [Size(360, 740), Size(390, 844), Size(430, 932)]) {
    final tag = '${size.width.toInt()}x${size.height.toInt()}';
    testWidgets('fits $tag with the safe area; screenshots', (tester) async {
      await _pump(tester, size: size, notch: true);
      await _precache(tester);
      expect(tester.takeException(), isNull);
      final glass = _glass(tester);
      final nav = tester.getRect(find.byType(BottomNav));
      final logo = tester.getRect(find.byType(BrandLogo).first);
      expect(logo.top, greaterThanOrEqualTo(47));
      expect(glass.top, greaterThanOrEqualTo(logo.bottom - 1));
      expect(glass.bottom, lessThanOrEqualTo(nav.top));
      expect(nav.bottom, lessThanOrEqualTo(size.height - 34 + .5));
      for (final id in const ['ai', 'dyo', 'artboard', 'team', 'to3d']) {
        final r = tester.getRect(find.byKey(ValueKey('bubble-spot-$id')));
        expect(glass.inflate(4).contains(r.topLeft), isTrue, reason: id);
        expect(glass.inflate(4).contains(r.bottomRight), isTrue, reason: id);
      }
      final classic = tester.getRect(
        find.byKey(const ValueKey('bubble-classic-view')),
      );
      expect(classic.left, greaterThanOrEqualTo(0));
      expect(classic.top, greaterThanOrEqualTo(logo.top));
      await _shot(tester, 'rest-$tag');

      final mid = glass.center;
      final ai = _spot(tester, 'ai');
      final g = await tester.startGesture(mid);
      await g.moveTo(Offset.lerp(mid, ai, .2)!);
      await tester.pump(const Duration(milliseconds: 16));
      await g.moveTo(Offset.lerp(mid, ai, .55)!);
      await tester.pump(const Duration(milliseconds: 16));
      await _shot(tester, 'dragging-to-ai-$tag');
      await _moveTo(tester, g, Offset.lerp(mid, ai, .55)!, ai);
      expect(find.text('Release to enter'), findsOneWidget);
      await _shot(tester, 'ai-lit-$tag');
      await g.up();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 150));
      await _shot(tester, 'opening-ai-$tag');
      await tester.pump(const Duration(milliseconds: 300));
      expect(tester.takeException(), isNull);
    });
  }
}
