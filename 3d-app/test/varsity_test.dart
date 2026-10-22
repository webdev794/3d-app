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
  test('a varsity jacket keeps its area colours on disk and on the server', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    c.garment = 'Varsity jacket';
    c.zoneColors = {'sleeves': '#ffffff', 'ribStripe': '#e63946', 'snaps': '#c0c0c0', 'lining': '#9d0208'};
    final project = Project(
      title: 'Letterman',
      sport: 'Club Casual',
      garment: 'Varsity jacket',
      mode: 'DYO',
      kit: c.kit,
      updated: DateTime.now(),
    );
    final sent = jsonDecode(jsonEncode(ProjectSync.toServer(project))) as Map<String, dynamic>;
    expect(sent['garment'], 'varsity');
    expect((sent['design'] as Map)['zoneColors'], c.zoneColors);
    final disk = ProjectStore.decode(jsonDecode(jsonEncode(ProjectStore.encode(project))), {});
    final server = ProjectSync.fromServer({...sent, 'id': 7, 'version': 1});
    for (final restored in [disk, server]) {
      expect(restored.kit.zoneColors, c.zoneColors);
    }
    expect(server.garment, 'Varsity jacket');
    // Ordered as a jacket, as on the website's order form.
    expect(orderGarmentFor('Varsity jacket'), 'jacket');
    expect(orderGarmentFor('varsity'), 'jacket');
  });

  test('briefs and sports that name a varsity jacket get one', () {
    expect(garmentInBrief('navy and gold letterman jacket for our seniors'), 'Varsity jacket');
    expect(garmentInBrief('a varsity jacket with a chenille W'), 'Varsity jacket');
    expect(garmentInBrief('baseball jacket in club colours'), 'Varsity jacket');
    expect(garmentInBrief('varsity team jersey'), isNot('Varsity jacket'));
    for (final id in ['teamwear', 'school-leavers', 'training', 'american-football', 'basketball', 'softball']) {
      expect(sportWithId(id)!.garments, contains('Varsity jacket'), reason: id);
    }
  });

  testWidgets('the area tool offers the varsity colours only on the varsity jacket', (tester) async {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    Future<void> show(String garment) async {
      c.garment = garment;
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: StudioZoneTool(c)))));
      await tester.pump();
    }

    await show('Hoodie');
    expect(find.text('VARSITY AREA COLOURS'), findsNothing);
    await show('Varsity jacket');
    expect(find.text('VARSITY AREA COLOURS'), findsOneWidget);
    expect(find.text('HOODIE AREA COLOURS'), findsNothing);
    for (final label in varsityAreas.values) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
    // No hood or kangaroo pocket on it.
    expect(find.text('Hood'), findsNothing);
    expect(find.text('Kangaroo pocket'), findsNothing);
    await tester.tap(find.byTooltip('Rib stripes: ${ProjectSync.hex(c.accentColor)}'));
    await tester.pump();
    expect(c.zoneColors['ribStripe'], ProjectSync.hex(c.accentColor));
    await show('Varsity jacket');
    await tester.tap(find.byTooltip('Rib stripes: back to the kit colours'));
    await tester.pump();
    expect(c.zoneColors.containsKey('ribStripe'), isFalse);
    expect(isVarsity('Varsity jacket') && !isVarsity('Hoodie'), isTrue);
  });
}
