import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/widgets/category_icon.dart';

import 'flow_test.dart' show mountPhone, tapText;

/// The tile showing [name] is lit (its Semantics say selected).
Finder litTile(String name) => find.byWidgetPredicate(
  (w) =>
      w is Semantics &&
      w.properties.label == name &&
      w.properties.selected == true,
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final display = FontLoader('Rajdhani')
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-Bold.ttf'));
    await display.load();
  });

  test('every outline symbol parses and stays on its 48-unit grid', () {
    for (final entry in categoryOutlines.entries) {
      // Points along the drawn line (getBounds would count arc control points).
      final points = [
        for (final m in parseSvgPath(entry.value).computeMetrics())
          for (var d = 0.0; d <= m.length; d += .5)
            m.getTangentForOffset(d)!.position,
      ];
      final xs = points.map((p) => p.dx), ys = points.map((p) => p.dy);
      final left = xs.reduce((a, b) => a < b ? a : b);
      final right = xs.reduce((a, b) => a > b ? a : b);
      final top = ys.reduce((a, b) => a < b ? a : b);
      final bottom = ys.reduce((a, b) => a > b ? a : b);
      expect(left >= 2 && top >= 2, isTrue, reason: entry.key);
      expect(right <= 46 && bottom <= 46, isTrue, reason: entry.key);
      expect(right - left > 20 && bottom - top > 20, isTrue, reason: entry.key);
    }
  });

  testWidgets(
    'DYO quick-access tiles: filters, tile turns the stage, stage lights the tile',
    (tester) async {
      final c = AppController()..screen = AppScreen.home;
      await mountPhone(tester, c);
      await tapText(tester, 'OPEN 3D DESIGNER');
      expect(c.screen, AppScreen.sport);
      await tester.pumpAndSettle();

      // One row of tiles under ALL · SPORTS · APPAREL, the first one lit.
      for (final f in ['ALL', 'SPORTS', 'APPAREL']) {
        expect(find.text(f), findsOneWidget);
      }
      final row = find.byKey(const ValueKey('dyo-tiles'));
      expect(tester.widget<ListView>(row).scrollDirection, Axis.horizontal);
      expect(litTile('Rugby League'), findsOneWidget);
      expect(find.byType(CategoryIcon), findsWidgets);

      // A tile turns the stage to its kit; the screen stays.
      await tester.tap(
        find.descendant(of: row, matching: find.text('BASKETBALL')),
      );
      await tester.pumpAndSettle();
      expect(find.text('DESIGN BASKETBALL'), findsOneWidget);
      expect(litTile('Basketball'), findsOneWidget);
      expect(c.screen, AppScreen.sport);

      // Turning the stage moves the light (and scrolls the row to it).
      for (var i = 0; i < 5; i++) {
        await tester.tap(find.byIcon(Icons.chevron_right_rounded));
        await tester.pumpAndSettle();
      }
      expect(find.text('DESIGN ICE HOCKEY'), findsOneWidget);
      expect(litTile('Ice Hockey'), findsOneWidget);
      expect(
        find
            .descendant(of: row, matching: find.text('ICE HOCKEY'))
            .hitTestable(),
        findsOneWidget,
      );

      // SPORTS hides the apparel; APPAREL shows Training and turns the stage to it.
      await tester.tap(find.text('SPORTS'));
      await tester.pumpAndSettle();
      expect(
        find.descendant(of: row, matching: find.text('TRAINING / GYM')),
        findsNothing,
      );
      await tester.tap(find.text('APPAREL'));
      await tester.pumpAndSettle();
      expect(
        find.descendant(of: row, matching: find.text('TRAINING / GYM')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: row, matching: find.text('SOCCER')),
        findsNothing,
      );
      expect(find.text('DESIGN TRAINING / GYM'), findsOneWidget);
      expect(litTile('Training / Gym'), findsOneWidget);

      // Turning the stage to a sport goes back to ALL so its tile can light up
      // (the last sport, Esports, sits just before Training / Gym).
      await tester.tap(find.byIcon(Icons.chevron_left_rounded));
      await tester.pumpAndSettle();
      expect(find.text('DESIGN ESPORTS'), findsOneWidget);
      expect(litTile('Esports'), findsOneWidget);
      expect(
        find.descendant(of: row, matching: find.text('ESPORTS')).hitTestable(),
        findsOneWidget,
      );

      // The Design button continues into the garment step, with the sport's
      // own garment tiles (task 9.99) and More teamwear for the rest.
      await tapText(tester, 'DESIGN ESPORTS');
      expect(c.sport, 'Esports');
      expect(c.screen, AppScreen.garment);
      expect(c.garment, 'Jersey');
      expect(c.productName, 'Esports jersey');
      expect(find.text('ESPORTS JERSEY'), findsOneWidget);
      final list = find
          .descendant(
            of: find.byType(CustomScrollView),
            matching: find.byType(Scrollable),
          )
          .first;
      await tester.scrollUntilVisible(
        find.text('More teamwear'),
        120,
        scrollable: list,
      );
      expect(find.text('More teamwear'), findsOneWidget);
      expect(find.text('FULL KIT'), findsNothing);
    },
  );
}
