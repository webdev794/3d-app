import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/widgets/ui.dart' show KitPreview;

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show tapText;

/// Phones the client and testers use: 360 (Android), 390 (iPhone), 412
/// (Android) and 430 (iPhone Pro Max), portrait, with a notch and a home bar.
const phones = [(360.0, 780.0), (390.0, 844.0), (412.0, 915.0), (430.0, 932.0)];

Future<AppController> openStudio(
  WidgetTester tester,
  double width,
  double height,
) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, height);
  tester.view.padding = const FakeViewPadding(top: 47, bottom: 34);
  tester.view.viewPadding = const FakeViewPadding(top: 47, bottom: 34);
  final c = AppController(store: FakeStore())..screen = AppScreen.home;
  await tester.pumpWidget(ThreeDeeziApp(controller: c));
  await tester.pump(const Duration(milliseconds: 400));
  c.startDyo();
  c.go(AppScreen.studio);
  await tester.pumpAndSettle();
  return c;
}

Future<void> closeApp(WidgetTester tester, AppController c) async {
  await tester.pumpWidget(const SizedBox());
  c.dispose();
  tester.view.reset();
}

Rect stageOf(WidgetTester tester) => tester.getRect(find.byType(KitPreview));
Rect launcherOf(WidgetTester tester) =>
    tester.getRect(find.byTooltip('3DEEZI ASSIST'));

void main() {
  setUpAll(() async {
    final body = FontLoader('Inter')
      ..addFont(rootBundle.load('assets/fonts/Inter.ttf'));
    final display = FontLoader('Rajdhani')
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-Bold.ttf'));
    await Future.wait([body.load(), display.load()]);
  });

  testWidgets('Studio on phones: a big 3D and the compact Colours panel under '
      'it (172.jpg, 173.jpg) at 360, 390, 412 and 430 px', (tester) async {
    for (final (width, height) in phones) {
      final c = await openStudio(tester, width, height);
      final where = '${width.round()} px';

      // No panel: the 3D fills most of the screen (the part below the
      // notch and above the home bar).
      final usable = height - 47 - 34;
      final stage = stageOf(tester);
      expect(stage.height / usable, greaterThan(.6), reason: where);
      // The round Assist button sits above the tool bar, on the 3D, clear of
      // the Front / Back / Side bar at the 3D's foot.
      final launcher = launcherOf(tester);
      final views = tester.getRect(find.byKey(const ValueKey('studio-views')));
      expect(launcher.bottom, lessThanOrEqualTo(stage.bottom + 1));
      expect(views.bottom, lessThanOrEqualTo(stage.bottom), reason: where);
      expect(
        views.right <= launcher.left || views.bottom <= launcher.top,
        isTrue,
        reason: 'views $views, Assist $launcher at $where',
      );

      await tapText(tester, 'Colours');
      await tester.pumpAndSettle();
      final panel = tester.getRect(
        find.byKey(const ValueKey('studio-panel-Colours')),
      );
      final small = stageOf(tester);
      debugPrint(
        '$where: 3D ${stage.height.round()} px '
        '(${(100 * stage.height / usable).round()}% of $usable), with the '
        'colour panel ${small.height.round()} px '
        '(${(100 * small.height / usable).round()}%), panel '
        '${panel.height.round()} px',
      );
      // Under the 3D, never over it; the 3D keeps about half the screen.
      expect(panel.top, greaterThanOrEqualTo(small.bottom), reason: where);
      expect(small.height / usable, greaterThan(.48), reason: where);
      expect(panel.bottom, lessThanOrEqualTo(height - 34), reason: where);
      expect(panel.height / usable, lessThan(.42), reason: where);

      // A small wheel (about 40% of the width) with the swatch, HEX and
      // brightness on its right; recent / quick colours and Done below.
      final compact = find.byKey(const ValueKey('colour-compact'));
      final wheel = tester.getRect(
        find.descendant(of: compact, matching: find.byType(AspectRatio)),
      );
      expect(wheel.width / width, inInclusiveRange(.3, .45), reason: where);
      for (final key in ['colour-swatch', 'colour-hex', 'colour-brightness']) {
        final r = tester.getRect(find.byKey(ValueKey(key)));
        expect(r.left, greaterThan(wheel.right), reason: '$key $where');
        expect(r.right, lessThanOrEqualTo(width), reason: '$key $where');
      }
      for (final key in ['colour-strip', 'colour-done']) {
        final r = tester.getRect(find.byKey(ValueKey(key)));
        expect(r.top, greaterThanOrEqualTo(wheel.bottom), reason: '$key');
        expect(r.bottom, lessThanOrEqualTo(panel.bottom), reason: '$key');
      }
      expect(find.text('PRIMARY'), findsOneWidget);
      expect(find.text('HEX'), findsOneWidget);
      // The Assist button and the chat bar keep clear of the panel.
      expect(launcherOf(tester).bottom, lessThanOrEqualTo(panel.top));
      expect(find.text('Ask 3DEEZI to change anything…'), findsNothing);
      expect(tester.takeException(), isNull, reason: where);

      // Changes show live: a drag on the wheel's disc changes the colour.
      final before = c.mainColor;
      await tester.dragFrom(wheel.center, const Offset(-18, -18));
      await tester.pump();
      expect(c.mainColor, isNot(before), reason: where);
      expect(c.canUndo, isTrue);

      // HEX entry.
      await tester.enterText(
        find.byKey(const ValueKey('colour-hex')),
        '1E90FF',
      );
      await tester.pump();
      expect(c.mainColor, const Color(0xff1e90ff));

      // Secondary tab.
      await tester.tap(find.text('SECONDARY'));
      await tester.pump();
      await tester.enterText(
        find.byKey(const ValueKey('colour-hex')),
        'FFC52F',
      );
      await tester.pump();
      expect(c.secondaryColor, const Color(0xffffc52f));
      expect(c.mainColor, const Color(0xff1e90ff));

      // Done closes it; the tool bar and the chat bar are back.
      await tester.tap(find.byKey(const ValueKey('colour-done')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('colour-compact')), findsNothing);
      expect(find.text('Ask 3DEEZI to change anything…'), findsOneWidget);
      expect(stageOf(tester).height / usable, greaterThan(.6));
      expect(tester.takeException(), isNull, reason: where);
      await closeApp(tester, c);
    }
  });

  testWidgets('Colours: Gradient & fabric opens under the colours; a quick '
      'colour is one undo step', (tester) async {
    final c = await openStudio(tester, 390, 844);
    await tapText(tester, 'Colours');
    await tester.pumpAndSettle();
    expect(find.text('FABRIC TYPE'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('colour-more')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Mesh'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mesh'));
    await tester.pump();
    expect(c.fabric, 'Mesh');
    await tester.ensureVisible(find.byKey(const ValueKey('choose-gradient')));
    expect(find.byKey(const ValueKey('choose-gradient')), findsOneWidget);

    final red = find.byWidgetPredicate(
      (w) =>
          w is Container &&
          w.decoration is BoxDecoration &&
          (w.decoration! as BoxDecoration).shape == BoxShape.circle &&
          (w.decoration! as BoxDecoration).color == const Color(0xffe92137),
    );
    await tester.ensureVisible(red.first);
    await tester.pumpAndSettle();
    final before = c.mainColor;
    await tester.tap(red.first);
    await tester.pump();
    expect(c.mainColor, const Color(0xffe92137));
    c.undo();
    expect(c.mainColor, before);
    // It is now a recent colour.
    await tester.pump();
    expect(find.text('RECENT COLOURS'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await closeApp(tester, c);
  });

  testWidgets('every tool opens under the 3D with a ✕; Back closes the panel '
      'first and stays in the Studio', (tester) async {
    final c = await openStudio(tester, 390, 844);
    for (final (tool, title) in const [
      ('Colours', 'COLOURS'),
      ('Patterns', 'PATTERNS'),
      ('Logos', 'LOGOS'),
      ('Text', 'TEXT'),
      ('Garment', 'GARMENT'),
    ]) {
      await tapText(tester, tool);
      await tester.pumpAndSettle();
      expect(find.text(title), findsOneWidget, reason: tool);
      final panel = tester.getRect(find.byKey(ValueKey('studio-panel-$tool')));
      final stage = stageOf(tester);
      expect(panel.top, greaterThanOrEqualTo(stage.bottom), reason: tool);
      expect(stage.height / 844, greaterThan(.4), reason: tool);
      expect(launcherOf(tester).bottom, lessThanOrEqualTo(panel.top));
      expect(tester.takeException(), isNull, reason: tool);
      await tester.tap(find.byKey(const ValueKey('sheet-close')));
      await tester.pumpAndSettle();
      expect(find.text(title), findsNothing, reason: '$tool closed');
    }

    // Front / Back / Side at the foot of the 3D.
    await tester.tap(find.text('Back'));
    await tester.pump();
    expect(c.view, 'Back');
    await tester.tap(find.text('Side'));
    await tester.pump();
    expect(c.view, 'Side');
    await tester.tap(find.text('Front'));
    await tester.pump();
    expect(c.view, 'Front');

    // The garment changes from its panel, live.
    await tapText(tester, 'Garment');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Polo').first);
    await tester.tap(find.text('Polo').first);
    await tester.pump();
    expect(c.garment, 'Polo');

    // Android Back: the panel first, then the Studio.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('GARMENT'), findsNothing);
    expect(c.screen, AppScreen.studio);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(c.screen, isNot(AppScreen.studio));
    await closeApp(tester, c);
  });

  testWidgets('every tool panel fits a 360 px phone (the singlet and the '
      'shorts too)', (tester) async {
    final c = await openStudio(tester, 360, 780);
    for (final garment in ['Jersey', 'Singlet', 'Shorts']) {
      c.update(() => c.garment = garment);
      await tester.pumpAndSettle();
      for (final tool in ['Colours', 'Patterns', 'Logos', 'Text', 'Garment']) {
        await tapText(tester, tool);
        await tester.pumpAndSettle();
        if (tool == 'Colours') {
          await tester.tap(find.byKey(const ValueKey('colour-more')));
          await tester.pumpAndSettle();
        }
        expect(tester.takeException(), isNull, reason: '$garment $tool');
        await tester.tap(find.byKey(const ValueKey('sheet-close')));
        await tester.pumpAndSettle();
      }
    }
    await closeApp(tester, c);
  });

  testWidgets('with the keyboard up, the Text and Colours panels still fit '
      'under the 3D', (tester) async {
    final c = await openStudio(tester, 390, 844);
    for (final tool in ['Text', 'Colours']) {
      await tapText(tester, tool);
      await tester.pumpAndSettle();
      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: tool);
      final panel = tester.getRect(find.byKey(ValueKey('studio-panel-$tool')));
      expect(panel.top, greaterThanOrEqualTo(stageOf(tester).bottom));
      expect(panel.bottom, lessThanOrEqualTo(844 - 300 + 1), reason: tool);
      tester.view.resetViewInsets();
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('sheet-close')));
      await tester.pumpAndSettle();
    }
    await closeApp(tester, c);
  });

  testWidgets('Preview closes the panel and shows the kit alone', (
    tester,
  ) async {
    final c = await openStudio(tester, 390, 844);
    await tapText(tester, 'Text');
    await tester.pumpAndSettle();
    expect(find.text('TEXT'), findsOneWidget);
    await tapText(tester, 'Preview');
    await tester.pumpAndSettle();
    expect(find.text('TEXT'), findsNothing);
    expect(find.text('Colours'), findsNothing);
    await tapText(tester, 'Done');
    await tester.pumpAndSettle();
    expect(find.text('Colours'), findsOneWidget);
    expect(c.closeStudioPanel, isNull);
    await closeApp(tester, c);
  });
}
