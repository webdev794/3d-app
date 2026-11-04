import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/bubble_home.dart';
import 'package:three_deezi/screens/team.dart' show TeamScreen;
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
  // The first-visit tutorial counts as seen, except in its own tests.
  setUp(
    () =>
        SharedPreferences.setMockInitialValues({BubbleTutorial.seenKey: true}),
  );

  testWidgets('drag to AI: it lights up with Release to enter, then opens', (
    tester,
  ) async {
    final c = await _pump(tester);
    final mid = _glass(tester).center;
    final ai = _spot(tester, 'ai');
    expect(find.text('Release to enter'), findsNothing);
    expect(find.text('SWIPE OR TAP TO EXPLORE'), findsOneWidget);

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
    expect(find.text('SWIPE OR TAP TO EXPLORE'), findsOneWidget);

    // Releasing away from every option cancels too.
    final g2 = await tester.startGesture(mid);
    await _moveTo(tester, g2, mid, mid + const Offset(0, 40));
    await g2.up();
    await tester.pump(const Duration(milliseconds: 700));
    expect(c.screen, AppScreen.home);
  });

  for (final kind in [ui.PointerDeviceKind.touch, ui.PointerDeviceKind.mouse]) {
    for (final id in ['ai', 'dyo', 'artboard', 'team', 'to3d']) {
      testWidgets('${kind.name} drag onto $id and release opens it', (
        tester,
      ) async {
        final c = await _pump(tester);
        final mid = _glass(tester).center;
        final to = _spot(tester, id);
        final g = await tester.startGesture(mid, kind: kind);
        await _moveTo(tester, g, mid, to);
        expect(find.text('Release to enter'), findsOneWidget);
        await g.up();
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        await tester.pump(const Duration(milliseconds: 400));
        expect(find.text('Release to enter'), findsNothing);
        switch (id) {
          case 'ai':
            expect(c.screen, AppScreen.aiDesigner);
          case 'dyo':
            expect(c.screen, AppScreen.sport);
          case 'artboard':
            expect(c.screen, AppScreen.artboard);
          case 'team':
            expect(find.byType(TeamScreen), findsOneWidget);
          default:
            expect(find.byType(BottomSheet), findsWidgets);
        }
        expect(tester.takeException(), isNull);
      });
    }
  }

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
    expect(tester.binding.focusManager.primaryFocus?.debugLabel, 'bubble-home');
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

  testWidgets(
    'the tab bar stretches with a drag, springs back; a tap still switches',
    (tester) async {
      final c = await _pump(tester, notch: true);
      await _precache(tester);
      final nav = find.byKey(const ValueKey('nav-home'));
      final rest = tester.getRect(nav);
      final start = tester.getCenter(find.byKey(const ValueKey('nav-orders')));
      final g = await tester.startGesture(start);
      await tester.pump(const Duration(milliseconds: 16));
      for (var k = 1; k <= 6; k++) {
        await g.moveTo(start + Offset(-12.0 * k, -5.0 * k));
        await tester.pump(const Duration(milliseconds: 16));
      }
      await tester.pump(const Duration(milliseconds: 60));
      // (the bar itself moves with the finger: its painted box leans away from rest)
      final moved = tester.getRect(find.byKey(const ValueKey('nav-home')));
      expect(moved == rest, isFalse);
      await _shot(tester, 'nav-stretch-390x844');
      await g.up();
      await tester.pump(const Duration(milliseconds: 80));
      await _shot(tester, 'nav-spring-390x844');
      // (the glass floats forever, so no pumpAndSettle: the spring back takes 650 ms)
      await tester.pump(const Duration(milliseconds: 700));
      expect(tester.getRect(find.byKey(const ValueKey('nav-home'))), rest);
      expect(c.screen, AppScreen.home);
      await tester.tap(find.byKey(const ValueKey('nav-projects')));
      await tester.pump();
      expect(c.screen, AppScreen.projects);
    },
  );

  testWidgets('animations off: the plain tab bar (no stretch)', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await _pump(tester);
    final rest = tester.getRect(find.byKey(const ValueKey('nav-home')));
    final start = tester.getCenter(find.byKey(const ValueKey('nav-orders')));
    final g = await tester.startGesture(start);
    await g.moveTo(start + const Offset(-60, -30));
    await tester.pump(const Duration(milliseconds: 16));
    expect(tester.getRect(find.byKey(const ValueKey('nav-home'))), rest);
    await g.up();
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
      // (The glass may run past the tab bar now: the page scrolls.)
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
      await g.moveTo(Offset.lerp(mid, ai, .15)!);
      await tester.pump(const Duration(milliseconds: 16));
      await g.moveTo(Offset.lerp(mid, ai, .35)!);
      await tester.pump(const Duration(milliseconds: 16));
      await _shot(tester, 'dragging-to-ai-$tag');
      await _moveTo(tester, g, Offset.lerp(mid, ai, .35)!, ai);
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

  group('first-visit tutorial (A QUICK LOOK AROUND)', () {
    final tutorial = find.byKey(const ValueKey('bubble-tutorial'));

    Future<bool?> seen() async =>
        (await SharedPreferences.getInstance()).getBool(BubbleTutorial.seenKey);

    testWidgets('shows once, a moment after the first visit; START CREATING '
        'closes it and it is remembered', (tester) async {
      SharedPreferences.setMockInitialValues({});
      await _pump(tester);
      await tester.pump(const Duration(milliseconds: 300));
      expect(tutorial, findsNothing);
      await tester.pump(const Duration(milliseconds: 800));
      await tester.pump(const Duration(milliseconds: 400));
      expect(tutorial, findsOneWidget);
      expect(find.text('A QUICK LOOK AROUND'), findsOneWidget);
      expect(find.text('You can also tap any option.'), findsOneWidget);
      // The demo runs: its caption moves on.
      expect(find.text('Swipe towards an option'), findsOneWidget);
      await tester.pump(const Duration(seconds: 3));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Swipe towards an option'), findsNothing);
      // Pause and play.
      await tester.tap(find.byKey(const ValueKey('tutorial-play')));
      await tester.pump();
      expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('tutorial-play')));
      await tester.pump();
      // Replay starts the demo again.
      await tester.tap(find.byKey(const ValueKey('tutorial-replay')));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Swipe towards an option'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('tutorial-start')));
      await tester.pump();
      expect(tutorial, findsNothing);
      expect(await seen(), isTrue);
      expect(tester.takeException(), isNull);

      // A later visit: no tutorial.
      await tester.pumpWidget(const SizedBox());
      await _pump(tester);
      await tester.pump(const Duration(seconds: 2));
      expect(tutorial, findsNothing);
    });

    testWidgets('Skip closes it too', (tester) async {
      SharedPreferences.setMockInitialValues({});
      await _pump(tester);
      await tester.pump(const Duration(seconds: 1));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.byKey(const ValueKey('tutorial-skip')));
      await tester.pump();
      expect(tutorial, findsNothing);
      expect(await seen(), isTrue);
    });

    for (final size in const [Size(360, 740), Size(390, 844), Size(430, 932)]) {
      final tag = '${size.width.toInt()}x${size.height.toInt()}';
      testWidgets('fits $tag with the safe area; screenshots', (tester) async {
        SharedPreferences.setMockInitialValues({});
        await _pump(tester, size: size, notch: true);
        await tester.pump(const Duration(seconds: 1));
        await tester.pump(const Duration(milliseconds: 400));
        await _precache(tester);
        expect(tester.takeException(), isNull);
        final start = tester.getRect(
          find.byKey(const ValueKey('tutorial-start')),
        );
        expect(start.bottom, lessThanOrEqualTo(size.height - 34));
        expect(
          tester.getRect(find.byKey(const ValueKey('tutorial-skip'))).top,
          greaterThanOrEqualTo(47),
        );
        await tester.pump(const Duration(milliseconds: 2900));
        await _shot(tester, 'tutorial-$tag');
        await tester.tap(find.byKey(const ValueKey('tutorial-start')));
        await tester.pump();
      });
    }
  });
}
