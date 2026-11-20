import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/ai_service.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/project_store.dart';
import 'package:three_deezi/project_sync.dart';

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show tapText;
import 'studio_panel_test.dart' show closeApp, openStudio;

/// Studio › Colours › Gradient & fabric › Fabric type (Standard, Mesh, Pro,
/// Eco): the 3D kit shows it (viewer -40), it is kept when saved and reopened
/// on the device and on the website (design.fabric, as the website saves it),
/// and the varsity jacket keeps its own wool and leather.
void main() {
  setUpAll(() async {
    final body = FontLoader('Inter')
      ..addFont(rootBundle.load('assets/fonts/Inter.ttf'));
    final display = FontLoader('Rajdhani')
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-Bold.ttf'));
    await Future.wait([body.load(), display.load()]);
  });

  test('the fabric is kept when saved and reopened on the device and on the '
      'website; Standard is not sent; a website or older app project is read',
      () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    Project project() => Project(
      title: 'Fabric',
      sport: 'Rugby League',
      garment: 'Jersey',
      mode: 'DYO',
      kit: c.kit,
      updated: DateTime.now(),
    );
    for (final fabric in ['Mesh', 'Pro', 'Eco']) {
      c.fabric = fabric;
      final sent =
          jsonDecode(jsonEncode(ProjectSync.toServer(project())))
              as Map<String, dynamic>;
      final design = sent['design'] as Map;
      // Where the website reads it, and the app's own copy.
      expect(design['fabric'], fabric);
      expect((design['app'] as Map)['fabric'], fabric);
      final disk = ProjectStore.decode(
        jsonDecode(jsonEncode(ProjectStore.encode(project()))),
        {},
      );
      final server = ProjectSync.fromServer({...sent, 'id': 7, 'version': 1});
      for (final restored in [disk, server]) {
        expect(restored.kit.fabric, fabric);
        final other = AppController(store: FakeStore());
        addTearDown(other.dispose);
        other.loadProject(restored);
        expect(other.fabric, fabric);
      }
    }

    // Standard: not sent at the top (older servers refuse the field).
    c.fabric = 'Standard';
    final plain =
        jsonDecode(jsonEncode(ProjectSync.toServer(project())))
            as Map<String, dynamic>;
    expect((plain['design'] as Map).containsKey('fabric'), isFalse);
    expect(
      ProjectSync.fromServer({...plain, 'id': 8, 'version': 1}).kit.fabric,
      'Standard',
    );

    // A website project (design.fabric, no app details) and an older app
    // project (only app.fabric); the website's choice wins over a stale copy.
    final website = {
      ...plain,
      'id': 9,
      'version': 1,
      'design': {
        ...(plain['design'] as Map).cast<String, dynamic>(),
        'fabric': 'Pro',
      }..remove('app'),
    };
    expect(ProjectSync.fromServer(website).kit.fabric, 'Pro');
    final olderApp = {
      ...plain,
      'id': 10,
      'version': 1,
      'design': {
        ...(plain['design'] as Map).cast<String, dynamic>(),
        'app': {'schema': 1, 'fabric': 'Eco'},
      },
    };
    expect(ProjectSync.fromServer(olderApp).kit.fabric, 'Eco');
    final changedOnWebsite = {
      ...olderApp,
      'design': {...olderApp['design'] as Map<String, dynamic>, 'fabric': 'Mesh'},
    };
    expect(ProjectSync.fromServer(changedOnWebsite).kit.fabric, 'Mesh');
    // Something unknown: Standard.
    final unknown = {
      ...plain,
      'id': 11,
      'version': 1,
      'design': {
        ...(plain['design'] as Map).cast<String, dynamic>(),
        'fabric': 'Silk',
      }..remove('app'),
    };
    expect(ProjectSync.fromServer(unknown).kit.fabric, 'Standard');
  });

  testWidgets('Colours › Gradient & fabric: each fabric says what it is; the '
      'varsity jacket shows its own fabric instead of the choices', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final c = await openStudio(tester, 390, 844);
    await tapText(tester, 'Colours');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('colour-more')));
    await tester.pumpAndSettle();
    expect(find.text('FABRIC TYPE'), findsOneWidget);
    for (final fabric in designFabrics) {
      await tester.tap(find.text(fabric));
      await tester.pumpAndSettle();
      expect(c.fabric, fabric);
      expect(
        find.textContaining(fabricNotes[fabric]!),
        findsOneWidget,
        reason: fabric,
      );
    }
    // Undo goes back to the fabric before.
    c.undo();
    await tester.pumpAndSettle();
    expect(c.fabric, 'Pro');

    c.update(() => c.garment = 'Varsity jacket');
    await tester.pumpAndSettle();
    expect(find.textContaining('keeps its own fabric'), findsOneWidget);
    expect(find.text('Mesh'), findsNothing);
    expect(tester.takeException(), isNull);
    await closeApp(tester, c);
  });
}
