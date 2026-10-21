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
  });
}
