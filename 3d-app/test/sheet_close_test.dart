import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app.dart';
import 'package:three_deezi/app_controller.dart';

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show tapText;

/// An iPhone-like phone: 390 x 844 with a 47 px notch / status bar and a
/// 34 px home indicator, and no Back button.
Future<void> mountIphone(WidgetTester tester, AppController c) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(390, 844);
  tester.view.padding = const FakeViewPadding(top: 47, bottom: 34);
  tester.view.viewPadding = const FakeViewPadding(top: 47, bottom: 34);
  addTearDown(tester.view.reset);
  addTearDown(c.dispose);
  await tester.pumpWidget(ThreeDeeziApp(controller: c));
  await tester.pump(const Duration(milliseconds: 400));
}

Future<void> settle(WidgetTester tester) async {
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 300)),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
  await tester.pump();
}

/// The sheet's ✕ sits below the notch and status bar.
void expectCloseBelowNotch(WidgetTester tester) {
  final close = find.byKey(const ValueKey('sheet-close'));
  expect(close, findsOneWidget);
  expect(tester.getTopLeft(close).dy, greaterThanOrEqualTo(47));
}

void main() {
  setUpAll(() async {
    final body = FontLoader('Inter')
      ..addFont(rootBundle.load('assets/fonts/Inter.ttf'));
    final display = FontLoader('Rajdhani')
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-Bold.ttf'));
    await Future.wait([body.load(), display.load()]);
  });

  Future<AppController> openStudio(WidgetTester tester) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.home;
    await mountIphone(tester, c);
    c.startDyo();
    c.go(AppScreen.studio);
    await tester.pump(const Duration(milliseconds: 400));
    return c;
  }

  testWidgets('Preset designs has a ✕ below the notch; a design stays on '
      'after closing (151.jpg)', (tester) async {
    final c = await openStudio(tester);
    await tapText(tester, 'Presets');
    await settle(tester);
    expect(find.text('PRESET DESIGNS'), findsOneWidget);
    expectCloseBelowNotch(tester);
    // The sheet itself stays below the status bar too.
    expect(
      tester.getTopLeft(find.text('PRESET DESIGNS')).dy,
      greaterThanOrEqualTo(47),
    );

    // Choosing a design applies it and keeps the sheet open, as before.
    await tester.tap(find.text('Electric Chevron'));
    await settle(tester);
    expect(c.pattern, 'Chevron');
    expect(find.text('PRESET DESIGNS'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('sheet-close')));
    await tester.pumpAndSettle();
    expect(find.text('PRESET DESIGNS'), findsNothing);
    expect(c.screen, AppScreen.studio);
    expect(c.pattern, 'Chevron', reason: 'the design is kept');
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('Android Back closes Preset designs and stays in the Studio', (
    tester,
  ) async {
    final c = await openStudio(tester);
    await tapText(tester, 'Presets');
    await settle(tester);
    expect(find.text('PRESET DESIGNS'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('PRESET DESIGNS'), findsNothing);
    expect(c.screen, AppScreen.studio);
  });

  testWidgets('every Studio tool sheet has a ✕ that closes it', (tester) async {
    final c = await openStudio(tester);
    for (final (chip, inside) in const [
      ('Artwork', 'ARTWORK & LAYERS'),
      ('Colours', 'COLOURS'),
      ('Patterns', 'PATTERNS'),
    ]) {
      await tapText(tester, chip);
      await settle(tester);
      expect(find.text(inside), findsWidgets, reason: chip);
      expectCloseBelowNotch(tester);
      await tester.tap(find.byKey(const ValueKey('sheet-close')));
      await tester.pumpAndSettle();
      expect(find.text(inside), findsNothing, reason: '$chip closed');
      expect(c.screen, AppScreen.studio);
    }
  });

  testWidgets('the email sign-in sheet has a ✕', (tester) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.auth;
    await mountIphone(tester, c);
    await tapText(tester, 'Continue with Email');
    await tester.pumpAndSettle();
    expect(find.text('CREATE YOUR ACCOUNT'), findsOneWidget);
    expectCloseBelowNotch(tester);
    await tester.tap(find.byKey(const ValueKey('sheet-close')));
    await tester.pumpAndSettle();
    expect(find.text('CREATE YOUR ACCOUNT'), findsNothing);
    expect(c.screen, AppScreen.auth);
  });

  testWidgets('the partner form sheet has a ✕', (tester) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.pricing;
    await mountIphone(tester, c);
    await tapText(tester, 'APPLY TO BECOME A PARTNER');
    await tester.pumpAndSettle();
    expect(find.text('Apply to become a partner'), findsOneWidget);
    expectCloseBelowNotch(tester);
    await tester.tap(find.byKey(const ValueKey('sheet-close')));
    await tester.pumpAndSettle();
    expect(find.text('Apply to become a partner'), findsNothing);
    expect(c.screen, AppScreen.pricing);
  });
  testWidgets('the Studio top bar (Back, Undo, Redo, Preview, Showcase, '
      'Save) fits 360, 375, 390 and 430 px, also with larger text', (
    tester,
  ) async {
    for (final scale in [1.0, 1.3]) {
      for (final width in [360.0, 375.0, 390.0, 430.0]) {
        final c = AppController(store: FakeStore())..screen = AppScreen.home;
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = Size(width, 844);
        tester.platformDispatcher.textScaleFactorTestValue = scale;
        await tester.pumpWidget(ThreeDeeziApp(controller: c));
        await tester.pump(const Duration(milliseconds: 400));
        c.startDyo();
        c.go(AppScreen.studio);
        await tester.pump(const Duration(milliseconds: 400));
        expect(
          tester.takeException(),
          isNull,
          reason: '${width}px at text x$scale overflowed',
        );
        for (final label in ['Undo', 'Redo', 'Preview', 'Showcase', 'Save']) {
          final r = tester.getRect(find.text(label).first);
          expect(r.right, lessThanOrEqualTo(width), reason: '$label at $width');
        }
        expect(find.byTooltip('Back'), findsWidgets);
        await tester.pumpWidget(const SizedBox());
        c.dispose();
      }
    }
    tester.platformDispatcher.clearTextScaleFactorTestValue();
    tester.view.reset();
  });
}
