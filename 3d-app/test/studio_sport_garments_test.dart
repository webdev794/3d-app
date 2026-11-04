import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/screens/create_home.dart' show GarmentScreen;
import 'package:three_deezi/sports_catalog.dart';

import 'studio_panel_test.dart' show openStudio, closeApp;

/// Client 2026-11-02: the Studio's Garment panel shows the selected sport's
/// own tiles (Soccer: soccer apparel), in the Design Your Own order; tapping
/// one opens it. A typed sport keeps every 3D garment.
void main() {
  Future<List<String>> listed(WidgetTester tester) async {
    final keys = find.byWidgetPredicate(
      (w) =>
          w.key is ValueKey<String> &&
          (w.key as ValueKey<String>).value.startsWith('studio-garment-'),
    );
    return [
      for (final e in keys.evaluate())
        (e.widget.key as ValueKey<String>).value.substring(15),
    ];
  }

  Future<void> openGarment(WidgetTester tester) async {
    await tester.tap(find.text('Garment').first);
    await tester.pumpAndSettle();
  }

  testWidgets('Soccer: only the Soccer tiles, and a tap opens one', (
    tester,
  ) async {
    final c = await openStudio(tester, 1280, 900);
    c.update(() {
      c.sport = 'Soccer';
      GarmentScreen.choose(c, sportNamed('Soccer')!.tiles.first);
    });
    await tester.pumpAndSettle();
    await openGarment(tester);
    final tiles = sportNamed('Soccer')!.tiles.map((t) => t.name).toList();
    expect(await listed(tester), tiles);
    final second = sportNamed('Soccer')!.tiles.firstWhere(
      (t) => !t.soon && t.name != c.productName,
    );
    await tester.tap(find.byKey(ValueKey('studio-garment-${second.name}')));
    await tester.pumpAndSettle();
    expect(c.productName, second.name);
    expect(c.garment, second.garment);
    await closeApp(tester, c);
  });

  testWidgets('a typed sport keeps every 3D garment with Tracksuit', (
    tester,
  ) async {
    final c = await openStudio(tester, 1280, 900);
    c.update(() => c.sport = 'Underwater hockey');
    await tester.pumpAndSettle();
    await openGarment(tester);
    final names = await listed(tester);
    expect(names, contains('Tracksuit'));
    expect(names.length, greaterThan(15));
    await closeApp(tester, c);
  });
}
