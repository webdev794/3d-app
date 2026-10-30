import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/gradient_presets.dart';
import 'package:three_deezi/project_sync.dart';
import 'package:three_deezi/widgets/studio_tools.dart';

import 'features_test.dart' show FakeStore;

Widget _host(AppController c, int slot) => MaterialApp(
  home: Scaffold(
    body: ListenableBuilder(
      listenable: c,
      builder: (_, _) => SingleChildScrollView(child: StudioGradientTool(c, slot: slot)),
    ),
  ),
);

void main() {
  test('the app has the same gradient presets as the website', () {
    final web = jsonDecode(File('website/resources/js/gradientPresets.json').readAsStringSync()) as List;
    expect(web.length, gradientPresets.length);
    for (final (i, p) in gradientPresets.indexed) {
      final w = web[i] as Map;
      expect(p.id, w['id']);
      expect(p.name, w['name']);
      expect([for (final s in p.stops) s.toJson()], [
        for (final s in w['stops'] as List) {'color': s['color'], 'at': (s['at'] as num).toDouble()},
      ]);
    }
    expect(gradientPresets.map((p) => p.name), [
      'CYAN / BLUE', 'BLUE / VIOLET', 'SUNSET', 'BLACK / RED', 'BLACK / GOLD', 'TEAL / NAVY', 'GREEN / YELLOW', 'WHITE / GREY',
    ]);
    expect(gradientPresets.firstWhere((p) => p.id == 'sunset').stops.length, 3);
  });

  test('an old two-colour gradient reads as two stops', () {
    final stops = gradientStops({'from': '#102030', 'to': '#334455', 'angle': 45});
    expect(stops.map((s) => s.hex), ['#102030', '#334455']);
    expect(stops.map((s) => s.at), [0, 1]);
  });

  testWidgets('presets sheet: Sunset on the primary zone with all stops, undo, custom stops and turning it off', (tester) async {
    tester.view.physicalSize = const Size(900, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final c = AppController(store: FakeStore());
    c.gradients = {'secondary': makeGradient(gradientPresets[4].stops, 90, preset: 'black-gold')};
    await tester.pumpWidget(_host(c, 0));
    expect(find.text('Solid colour. Choose a gradient to blend colours across this zone.'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('choose-gradient')));
    await tester.pumpAndSettle();
    expect(find.text('GRADIENT PRESETS'), findsOneWidget);
    expect(find.text('Apply to selected colour zone · PRIMARY'), findsOneWidget);
    for (final p in gradientPresets) {
      expect(find.text(p.name), findsOneWidget);
    }

    await tester.tap(find.byKey(const ValueKey('gradient-preset-sunset')));
    await tester.pumpAndSettle();
    expect(c.gradient?['preset'], 'sunset');
    expect(gradientStops(c.gradient!).map((s) => s.hex), ['#ff8a00', '#ff3d7f', '#7b2ff7']);
    expect(c.gradient?['from'], '#ff8a00');
    expect(c.gradient?['to'], '#7b2ff7');
    // The other zone is left alone.
    expect(c.gradients?['secondary']['preset'], 'black-gold');
    expect(find.byIcon(Icons.check), findsOneWidget);

    // Custom: add a stop between the first two, then remove it again.
    await tester.tap(find.byKey(const ValueKey('gradient-custom')));
    await tester.pumpAndSettle();
    expect(find.text('CUSTOM GRADIENT'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('gradient-add-stop')));
    await tester.pumpAndSettle();
    expect(gradientStops(c.gradient!).length, 4);
    expect(c.gradient?['preset'], isNull);
    await tester.tap(find.byKey(const ValueKey('gradient-remove-stop')));
    await tester.pumpAndSettle();
    expect(gradientStops(c.gradient!).length, 3);

    // Undo steps back through the edits to Sunset, then to no gradient.
    c.undo();
    c.undo();
    expect(c.gradient?['preset'], 'sunset');
    c.undo();
    expect(c.gradient, isNull);
    c.redo();
    expect(c.gradient?['preset'], 'sunset');

    // Close (X) keeps it; the panel shows From, To, the three colours and the angle.
    await tester.tap(find.byKey(const ValueKey('gradient-close')));
    await tester.pumpAndSettle();
    expect(find.text('GRADIENT PRESETS'), findsNothing);
    expect(c.gradient?['preset'], 'sunset');
    expect(find.text('From'), findsOneWidget);
    expect(find.text('3 COLOURS'), findsOneWidget);
    expect(find.text('Angle · 0°'), findsOneWidget);

    // Saved with the project and read back with every stop.
    final body = ProjectSync.toServer(Project(title: 'Sunset', sport: 'Rugby League', garment: 'Full Kit', mode: 'DYO', kit: c.kit, updated: DateTime(2026)));
    final design = body['design'] as Map<String, dynamic>;
    expect((design['gradient'] as Map)['stops'], hasLength(3));
    final back = ProjectSync.fromServer({'id': 9, 'name': 'Sunset', 'garment': 'fullkit', 'design': jsonDecode(jsonEncode(design))});
    expect(gradientStops(back.kit.gradient!).map((s) => s.hex), ['#ff8a00', '#ff3d7f', '#7b2ff7']);
    expect(back.kit.gradients?['secondary']['preset'], 'black-gold');

    // Off: back to the solid colour.
    await tester.tap(find.byKey(const ValueKey('gradient-off')));
    await tester.pumpAndSettle();
    expect(c.gradient, isNull);
    expect(c.gradients?['secondary'], isNotNull);
  });

  testWidgets('accent stays solid', (tester) async {
    final c = AppController(store: FakeStore());
    await tester.pumpWidget(_host(c, 2));
    expect(find.byKey(const ValueKey('choose-gradient')), findsNothing);
    expect(find.textContaining('stay a solid colour'), findsOneWidget);
  });
}
