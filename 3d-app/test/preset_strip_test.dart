import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'flow_test.dart' show tapText;
import 'studio_panel_test.dart' show closeApp, openStudio;

/// PRESETS over the 3D (client 25 Nov, 652.png): round preset thumbnails
/// above Front / Back / Side; a tap puts one on the kit and ticks it; ✕
/// folds the row to its PRESETS tab, which brings it back; a tool panel
/// hides it while open.
void main() {
  setUpAll(() async {
    final body = FontLoader('Inter')
      ..addFont(rootBundle.load('assets/fonts/Inter.ttf'));
    final display = FontLoader('Rajdhani')
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-Bold.ttf'));
    await Future.wait([body.load(), display.load()]);
  });

  testWidgets('the PRESETS strip: pick, tick, hide and bring back', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final c = await openStudio(tester, 390, 844);
    final strip = find.byKey(const ValueKey('preset-strip'));
    expect(strip, findsOneWidget);
    expect(find.text('PRESETS'), findsOneWidget);
    // The strip sits above Front / Back / Side, inside the 3D.
    final views = tester.getRect(find.byKey(const ValueKey('studio-views')));
    expect(tester.getRect(strip).bottom, lessThanOrEqualTo(views.top));

    // Only general and this kit's presets: no Rugby League or netball ones on
    // a fresh (non-rugby) kit.
    expect(find.byKey(const ValueKey('preset-strip-netball-01')), findsNothing);
    final bubbles = find.byWidgetPredicate((w) {
      final k = w.key;
      return w is GestureDetector &&
          k is ValueKey<String> &&
          k.value.startsWith('preset-strip-');
    });
    expect(bubbles, findsWidgets);
    final id = ((tester.widget(bubbles.first).key! as ValueKey<String>).value)
        .substring('preset-strip-'.length);
    expect(find.byKey(const ValueKey('preset-strip-tick')), findsNothing);
    await tester.tap(bubbles.first);
    await tester.pumpAndSettle();
    expect(c.presetOnId, id);
    expect(find.byKey(const ValueKey('preset-strip-tick')), findsOneWidget);

    // A change after it: no tick.
    c.edit(() => c.pattern = 'Hoops');
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('preset-strip-tick')), findsNothing);

    // ✕ hides the row; the PRESETS tab brings it back.
    await tester.tap(find.byKey(const ValueKey('preset-strip-close')));
    await tester.pumpAndSettle();
    expect(strip, findsNothing);
    expect(find.text('PRESETS'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('preset-strip-tab')));
    await tester.pumpAndSettle();
    expect(strip, findsOneWidget);

    // A tool panel over the 3D's foot: the strip steps aside. (The preset's
    // note goes first.)
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    await tapText(tester, 'Patterns');
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('studio-panel-Patterns')), findsOneWidget);
    expect(strip, findsNothing);
    expect(tester.takeException(), isNull);
    await closeApp(tester, c);
  });
}
