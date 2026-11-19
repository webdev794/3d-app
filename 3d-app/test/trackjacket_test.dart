import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/design_document.dart';
import 'package:three_deezi/project_store.dart';
import 'package:three_deezi/project_sync.dart';
import 'package:three_deezi/screens/order_entry.dart' show orderGarmentFor;
import 'package:three_deezi/sports_catalog.dart';
import 'package:three_deezi/widgets/ai_stage.dart' show garmentInBrief;
import 'package:three_deezi/widgets/studio_tools.dart';

import 'features_test.dart' show FakeStore;

void main() {
  test('a track jacket keeps its style and area colours on disk and on the server', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    c.garment = 'Track jacket';
    c.trackStyle = 'hood';
    c.zones = {'hood': 'Hoops'};
    c.zoneColors = {'shoulder': '#e63946', 'stripe': '#ffffff', 'collar': '#081c15', 'zip': '#ffd166'};
    final project = Project(
      title: 'Warriors track',
      sport: 'Training / Gym',
      garment: 'Track jacket',
      mode: 'DYO',
      kit: c.kit,
      updated: DateTime.now(),
    );
    final sent = jsonDecode(jsonEncode(ProjectSync.toServer(project))) as Map<String, dynamic>;
    expect(sent['garment'], 'trackjacket');
    expect((sent['design'] as Map)['trackStyle'], 'hood');
    expect((sent['design'] as Map)['zoneColors'], c.zoneColors);
    final disk = ProjectStore.decode(jsonDecode(jsonEncode(ProjectStore.encode(project))), {});
    final server = ProjectSync.fromServer({...sent, 'id': 5, 'version': 1});
    for (final restored in [disk, server]) {
      expect(restored.kit.trackStyle, 'hood');
      expect(restored.kit.zoneColors, c.zoneColors);
      expect(restored.kit.zones, c.zones);
    }
    expect(server.garment, 'Track jacket');
    // Undo puts the style back; a new kit starts with the collar.
    c.edit(() => c.trackStyle = 'collar');
    c.undo();
    expect(c.trackStyle, 'hood');
    c.startDyo();
    expect(c.trackStyle, 'collar');
    expect(c.zoneColors, isEmpty);
  });

  test('other garments do not send the style; the order form, the AI brief and the sports know it', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    final project = Project(title: 'Plain', sport: 'Training / Gym', garment: 'Hoodie', mode: 'DYO', kit: c.kit, updated: DateTime.now());
    expect((ProjectSync.toServer(project)['design'] as Map).containsKey('trackStyle'), isFalse);
    expect(orderGarmentFor('Track jacket'), 'jacket');
    expect(garmentInBrief('a navy track jacket with gold stripes'), 'Track jacket');
    expect(garmentInBrief('club tracksuit top'), 'Track jacket');
    expect(garmentInBrief('a hoodie for the track team'), 'Hoodie');
    for (final id in ['training', 'teamwear', 'school-leavers', 'athletics', 'football', 'rugby-league', 'afl', 'netball', 'basketball']) {
      expect(sportWithId(id)!.garments, contains('Track jacket'), reason: id);
    }
  });

  testWidgets('the area tool offers the style, the collar or hood and the track jacket colours only on it', (tester) async {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    Future<void> show(String garment) async {
      c.garment = garment;
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: StudioZoneTool(c)))));
      await tester.pump();
    }

    await show('Jersey');
    expect(find.text('TRACK JACKET AREA COLOURS'), findsNothing);
    expect(find.text('Stand-up collar'), findsNothing);
    await show('Track jacket');
    expect(find.text('TRACK JACKET AREA COLOURS'), findsOneWidget);
    expect(find.text('Shoulder & sleeve panels'), findsOneWidget);
    expect(find.text('Sleeve stripe'), findsOneWidget);
    // The pattern area and the colour area are the collar on the collar style.
    expect(find.text('Collar'), findsNWidgets(2));
    expect(find.text('Kangaroo pocket'), findsNothing);
    await tester.ensureVisible(find.byTooltip('Sleeve stripe: ${ProjectSync.hex(c.secondaryColor)}'));
    await tester.pump();
    await tester.tap(find.byTooltip('Sleeve stripe: ${ProjectSync.hex(c.secondaryColor)}'));
    await tester.pump();
    expect(c.zoneColors['stripe'], ProjectSync.hex(c.secondaryColor));
    await tester.ensureVisible(find.text('Hood'));
    await tester.pump();
    await tester.tap(find.text('Hood'));
    await tester.pump();
    expect(c.trackStyle, 'hood');
    await show('Track jacket');
    expect(find.text('Collar'), findsNothing);
    expect(isTrack('Track jacket') && !isTrack('Hoodie'), isTrue);
  });
}
