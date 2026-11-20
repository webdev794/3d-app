import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/design_document.dart';
import 'package:three_deezi/project_store.dart';
import 'package:three_deezi/project_sync.dart';
import 'package:three_deezi/widgets/studio_tools.dart';

import 'features_test.dart' show FakeStore;

void main() {
  test('a hoodie keeps its area colours and hood pattern on disk and on the server', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    c.zones = {'hood': 'Hoops', 'pocket': 'Solid'};
    c.garment = 'Zip hoodie';
    c.zoneColors = {'lining': '#e63946', 'rib': '#081c15', 'zip': '#ffd166'};
    final project = Project(
      title: 'Warriors hoodie',
      sport: 'Training',
      garment: 'Zip hoodie',
      mode: 'DYO',
      kit: c.kit,
      updated: DateTime.now(),
    );
    final sent = jsonDecode(jsonEncode(ProjectSync.toServer(project))) as Map<String, dynamic>;
    expect(sent['garment'], 'ziphoodie');
    expect((sent['design'] as Map)['zoneColors'], c.zoneColors);
    final disk = ProjectStore.decode(jsonDecode(jsonEncode(ProjectStore.encode(project))), {});
    final server = ProjectSync.fromServer({...sent, 'id': 5, 'version': 1});
    for (final restored in [disk, server]) {
      expect(restored.kit.zoneColors, c.zoneColors);
      expect(restored.kit.zones, c.zones);
    }
    expect(server.garment, 'Zip hoodie');
    // A new kit starts without them.
    c.startDyo();
    expect(c.zoneColors, isEmpty);
  });

  test('kits without area colours do not send the field (older servers refuse it)', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    final project = Project(title: 'Plain', sport: 'Training', garment: 'Hoodie', mode: 'DYO', kit: c.kit, updated: DateTime.now());
    final design = ProjectSync.toServer(project)['design'] as Map;
    expect(design.containsKey('zoneColors'), isFalse);
  });

  testWidgets('the area tool offers the hood, the pocket and the hoodie colours only on hoodies', (tester) async {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    Future<void> show(String garment) async {
      c.garment = garment;
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: StudioZoneTool(c)))));
      await tester.pump();
    }

    await show('Jersey');
    expect(find.text('Hood'), findsNothing);
    expect(find.text('HOODIE AREA COLOURS'), findsNothing);
    await show('Hoodie');
    expect(find.text('HOODIE AREA COLOURS'), findsOneWidget);
    expect(find.text('Hood lining'), findsOneWidget);
    expect(find.text('Zip'), findsNothing);
    // Choosing a colour sets the area; the reset puts it back to the kit colours.
    await tester.tap(find.byTooltip('Hood lining: ${ProjectSync.hex(c.secondaryColor)}'));
    await tester.pump();
    expect(c.zoneColors['lining'], ProjectSync.hex(c.secondaryColor));
    // (The Studio rebuilds the tool when the kit changes.)
    await show('Hoodie');
    await tester.tap(find.byTooltip('Hood lining: back to the kit colours'));
    await tester.pump();
    expect(c.zoneColors.containsKey('lining'), isFalse);
    await show('Zip hoodie');
    expect(find.text('Zip'), findsOneWidget);
    expect(isHoodie('Zip hoodie') && !isHoodie('Polo'), isTrue);
    // QA AB 2026-10-22: a hoodie's pocket area is its kangaroo pocket (as the
    // website); the pocket polo keeps its chest pocket; a plain polo has none.
    expect(find.text('Kangaroo pocket'), findsOneWidget);
    expect(find.text('Chest pocket'), findsNothing);
    await show('Polo with pocket');
    expect(find.text('Chest pocket'), findsOneWidget);
    expect(find.text('Hood'), findsNothing);
    await show('Polo');
    expect(find.text('Chest pocket'), findsNothing);
  });

  // QA AB follow-up: the website's Studio › Patterns › Apply to area list for
  // each garment, and a pattern set on each area.
  testWidgets('every garment lists the website areas and each area takes a pattern', (tester) async {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    // A tall screen, so an area's open pattern menu shows every pattern (Blades and Swirl, 2026-10-30, made the list
    // longer than the default test screen: Tribal was off the menu, never built).
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    const common = ['Chest & body', 'Shoulders', 'Sleeves', 'Side panels', 'Hem'];
    const expected = {
      'Jersey': common,
      'Training Tee': common,
      'Polo': common,
      // No sleeves (website 2026-10-23): the singlet's outline ends at x 0.254
      // and the viewer's sleeve area starts at 0.27, so a pattern there painted nothing.
      'Singlet': ['Chest & body', 'Shoulders', 'Side panels', 'Hem'],
      'Full Kit': common,
      'Polo with pocket': [...common, 'Chest pocket'],
      'Hoodie': [...common, 'Kangaroo pocket', 'Hood'],
      'Zip hoodie': [...common, 'Kangaroo pocket', 'Hood'],
      'Varsity jacket': common,
      // The track jacket's hood area is its collar unless it has a hood (website: Hood or Collar).
      'Track jacket': [...common, 'Collar'],
      // The 3D shorts have no shoulders or sleeves (viewer zones.js uses
      // sides, hem and body only), so the app leaves those two out; their
      // areas read as on the website.
      'Shorts': ['Body', 'Side panels', 'Leg hems'],
    };
    final keyOf = {for (final e in garmentZones.entries) e.value: e.key, 'Kangaroo pocket': 'pocket', 'Collar': 'hood', 'Body': 'body', 'Leg hems': 'hem'};
    for (final MapEntry(key: garment, value: areas) in expected.entries) {
      c.garment = garment;
      c.zones = {};
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: StudioZoneTool(c)))));
      await tester.pump();
      final fields = find.byType(DropdownButtonFormField<String>);
      final labels = [
        for (final d in tester.widgetList<InputDecorator>(find.descendant(of: fields, matching: find.byType(InputDecorator))))
          d.decoration.labelText,
      ];
      expect(labels, areas, reason: garment);
      for (var i = 0; i < areas.length; i++) {
        await tester.ensureVisible(fields.at(i));
        await tester.tap(fields.at(i));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Tribal').last);
        await tester.pumpAndSettle();
        expect(c.zones[keyOf[areas[i]]], 'Tribal', reason: '$garment ${areas[i]}');
      }
      expect(c.zones.length, areas.length, reason: garment);
    }
  });
}
