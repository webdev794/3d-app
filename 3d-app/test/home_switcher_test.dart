import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart' show FrameTiming;
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/bubble_home.dart';
import 'package:three_deezi/screens/create_home.dart';
import 'package:three_deezi/screens/home_switcher.dart';

import 'features_test.dart' show FakeStore;

/// The mobile Home (client 2026-10-30): the glass-bubble home on phones, the
/// classic tile home to fall back on (reduced motion, slow phones, tablets),
/// "Classic view" / "Try the new home", remembered on the device. Until the
/// tester passes the bubble, the classic home is the default
/// ([kBubbleHomeDefault]); the bubble-first tests turn the default on.
void main() {
  const phone = Size(390, 844), tablet = Size(820, 1180);

  Future<void> mountHome(
    WidgetTester tester, {
    Size size = phone,
    bool reduceMotion = false,
  }) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = size;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = AppController(store: FakeStore())..screen = AppScreen.home;
    addTearDown(c.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(disableAnimations: reduceMotion),
              child: HomeSwitcher(c),
            ),
          ),
        ),
      ),
    );
    // The saved choice is read, then the home it picks is built.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  /// A fresh app start on a device holding [saved].
  void device(Map<String, Object> saved) {
    SharedPreferences.setMockInitialValues(saved);
    HomeSwitcher.debugReset();
  }

  Future<String?> savedStyle() async =>
      (await SharedPreferences.getInstance()).getString(HomeSwitcher.styleKey);

  Future<void> reload(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    HomeSwitcher.debugReset();
    await mountHome(tester);
  }

  final bubble = find.byType(BubbleHomeScreen),
      classic = find.byType(CreateHomeScreen),
      tryNew = find.byKey(const ValueKey('home-try-new'));

  tearDown(() {
    HomeSwitcher.debugTimeFrames = false;
    HomeSwitcher.bubbleByDefault = kBubbleHomeDefault;
  });

  test('the classic home stays the default until the bubble passes testing '
      '(flip this with kBubbleHomeDefault)', () {
    expect(kBubbleHomeDefault, isFalse);
  });

  testWidgets('default off: no saved choice on a phone shows the classic home '
      'with Try the new home', (tester) async {
    device({});
    HomeSwitcher.bubbleByDefault = false;
    await mountHome(tester);
    expect(classic, findsOneWidget);
    expect(bubble, findsNothing);
    expect(tryNew, findsOneWidget);
    expect(await savedStyle(), isNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets('default on: no saved choice on a phone shows the bubble home', (
    tester,
  ) async {
    device({});
    HomeSwitcher.bubbleByDefault = true;
    await mountHome(tester);
    expect(bubble, findsOneWidget);
    expect(classic, findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('default on: animations off (reduced motion) shows the classic '
      'home', (tester) async {
    device({});
    HomeSwitcher.bubbleByDefault = true;
    await mountHome(tester, reduceMotion: true);
    expect(classic, findsOneWidget);
    expect(bubble, findsNothing);
    // It can still be tried.
    expect(tryNew, findsOneWidget);
    expect(await savedStyle(), isNull);
  });

  testWidgets('Classic view is remembered after a reload', (tester) async {
    device({});
    HomeSwitcher.bubbleByDefault = true;
    await mountHome(tester);
    expect(bubble, findsOneWidget);
    await tester.tap(find.text('Classic view'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(classic, findsOneWidget);
    expect(bubble, findsNothing);
    expect(await savedStyle(), HomeSwitcher.classic);

    // Reload: the app starts again on the same device; the saved choice wins
    // over the bubble default.
    await reload(tester);
    expect(classic, findsOneWidget);
    expect(bubble, findsNothing);
    expect(tryNew, findsOneWidget);
  });

  testWidgets('Try the new home shows the bubble, also after a reload', (
    tester,
  ) async {
    device({});
    await mountHome(tester);
    expect(classic, findsOneWidget);
    await tester.tap(tryNew);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(bubble, findsOneWidget);
    expect(classic, findsNothing);
    expect(await savedStyle(), HomeSwitcher.bubble);

    await reload(tester);
    expect(bubble, findsOneWidget);
    expect(classic, findsNothing);
  });

  testWidgets('Try the new home overrides an automatic classic', (
    tester,
  ) async {
    device({HomeSwitcher.styleKey: HomeSwitcher.classicAuto});
    HomeSwitcher.bubbleByDefault = true;
    await mountHome(tester);
    expect(classic, findsOneWidget);
    await tester.tap(tryNew);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(bubble, findsOneWidget);
    expect(await savedStyle(), HomeSwitcher.bubble);
  });

  testWidgets('a tablet always shows the classic home, without the button', (
    tester,
  ) async {
    device({HomeSwitcher.styleKey: HomeSwitcher.bubble});
    HomeSwitcher.bubbleByDefault = true;
    await mountHome(tester, size: tablet);
    expect(classic, findsOneWidget);
    expect(bubble, findsNothing);
    expect(tryNew, findsNothing);
  });

  testWidgets('default on: a slow phone moves to the classic home once, with '
      'a note', (tester) async {
    device({});
    HomeSwitcher.bubbleByDefault = true;
    HomeSwitcher.debugTimeFrames = true;
    await mountHome(tester);
    expect(bubble, findsOneWidget);
    // 30 ms of build + raster per frame (the limit is about 22 ms).
    FrameTiming slow(int i) => FrameTiming(
      vsyncStart: i * 40000,
      buildStart: i * 40000,
      buildFinish: i * 40000 + 15000,
      rasterStart: i * 40000 + 15000,
      rasterFinish: i * 40000 + 30000,
      rasterFinishWallTime: i * 40000 + 30000,
    );
    tester.binding.platformDispatcher.onReportTimings!([
      for (var i = 0; i < 70; i++) slow(i),
    ]);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(classic, findsOneWidget);
    expect(bubble, findsNothing);
    expect(find.text(HomeSwitcher.autoNote), findsOneWidget);
    expect(await savedStyle(), HomeSwitcher.classicAuto);
    // The user's own choice still wins.
    expect(tryNew, findsOneWidget);
  });

  test('frame check: fast frames keep the bubble', () {
    FrameTiming frame(int ms) => FrameTiming(
      vsyncStart: 0,
      buildStart: 0,
      buildFinish: ms * 500,
      rasterStart: ms * 500,
      rasterFinish: ms * 1000,
      rasterFinishWallTime: ms * 1000,
    );
    expect(HomeSwitcher.tooSlow(List.filled(60, frame(12))), isFalse);
    expect(HomeSwitcher.tooSlow(List.filled(60, frame(30))), isTrue);
    expect(HomeSwitcher.tooSlow(const []), isFalse);
  });
}
