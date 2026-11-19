import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/project_store.dart';
import 'package:three_deezi/project_sync.dart';
import 'package:three_deezi/widgets/studio_tools.dart' show GradientPresetsSheet;

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show tapText;
import 'studio_panel_test.dart' show closeApp, openStudio;

/// The Studio's Colours panel on a phone: Gradient & fabric shows its items
/// at once, and the pattern colour is the same picked by hand or by tapping
/// the pattern on the 3D kit.
void main() {
  setUpAll(() async {
    final body = FontLoader('Inter')
      ..addFont(rootBundle.load('assets/fonts/Inter.ttf'));
    final display = FontLoader('Rajdhani')
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-Bold.ttf'));
    await Future.wait([body.load(), display.load()]);
  });

  final panel = find.byKey(const ValueKey('studio-panel-Colours'));
  // The panel's own scroll view (the first Scrollable in it).
  final scroller = find
      .descendant(of: panel, matching: find.byType(Scrollable))
      .first;

  testWidgets('Gradient & fabric shows Fabric type and Gradient fill in view '
      'at once on 360 and 390 px phones; CHOOSE GRADIENT opens; Less hides '
      'them', (tester) async {
    SharedPreferences.setMockInitialValues({});
    for (final (width, height) in const [
      (360.0, 640.0),
      (360.0, 780.0),
      (390.0, 844.0),
    ]) {
      final where = '${width.round()} x ${height.round()}';
      final c = await openStudio(tester, width, height);
      await tapText(tester, 'Colours');
      await tester.pumpAndSettle();
      expect(find.text('FABRIC TYPE'), findsNothing, reason: where);

      await tester.tap(find.byKey(const ValueKey('colour-more')));
      await tester.pumpAndSettle();
      expect(find.text('Less'), findsOneWidget, reason: where);

      // Without any scrolling by hand: inside the panel's visible part.
      final view = tester.getRect(scroller);
      for (final item in [
        find.text('FABRIC TYPE'),
        find.text('Mesh'),
        find.text('GRADIENT FILL'),
        find.byKey(const ValueKey('choose-gradient')),
      ]) {
        final r = tester.getRect(item);
        expect(
          r.top >= view.top - .5 && r.bottom <= view.bottom + .5,
          isTrue,
          reason: '$item at $where: $r, panel shows $view',
        );
        expect(r.bottom, lessThanOrEqualTo(height - 34), reason: where);
      }

      // The items work: a fabric, and CHOOSE GRADIENT opens the presets.
      await tester.tap(find.text('Mesh'));
      await tester.pump();
      expect(c.fabric, 'Mesh', reason: where);
      await tester.tap(find.byKey(const ValueKey('choose-gradient')));
      await tester.pumpAndSettle();
      expect(find.byType(GradientPresetsSheet), findsOneWidget, reason: where);
      Navigator.of(tester.element(find.byType(GradientPresetsSheet))).pop();
      await tester.pumpAndSettle();

      // Less hides them, and the panel is back at its top (the tabs).
      await tester.tap(find.byKey(const ValueKey('colour-more')));
      await tester.pumpAndSettle();
      expect(find.text('FABRIC TYPE'), findsNothing, reason: where);
      expect(find.byKey(const ValueKey('choose-gradient')), findsNothing);
      expect(find.text('Gradient & fabric'), findsOneWidget, reason: where);
      expect(
        tester.state<ScrollableState>(scroller).position.pixels,
        0,
        reason: where,
      );
      expect(
        tester.getRect(find.text('PRIMARY')).top,
        greaterThanOrEqualTo(tester.getRect(scroller).top - .5),
        reason: where,
      );
      expect(tester.takeException(), isNull, reason: where);
      await closeApp(tester, c);
    }
  });

  testWidgets('the pattern colour picked by hand (PATTERN tab) and by tapping '
      'the pattern on the kit is the same: whole garment, area patterns and an '
      'uploaded pattern in Kit colours; Full colour shows the tip', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final c = await openStudio(tester, 390, 844);
    await tapText(tester, 'Colours');
    await tester.pumpAndSettle();
    final hex = find.byKey(const ValueKey('colour-hex'));
    const tip = 'Switch to Kit colours to recolour this pattern.';
    // A 1 x 1 PNG: the uploaded pattern's prepared tile.
    final tile = base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    );

    String shown() => tester.widget<TextField>(hex).controller!.text;
    String hexOf(Color colour) =>
        ProjectSync.hex(colour).substring(1).toUpperCase();
    // Before a colour is picked the tab shows the pattern's colour as the 3D
    // paints it.
    for (final (what, setUp, zone, before)
        in <(String, VoidCallback, String, Color Function())>[
          (
            'whole garment',
            () => c.pattern = 'Stripes',
            'body',
            () => Color.lerp(c.mainColor, c.secondaryColor, .35)!,
          ),
          (
            'area pattern',
            () => c.zones = {'sleeves': 'Hoops'},
            'sleeves',
            () => c.secondaryColor,
          ),
          (
            'uploaded pattern in Kit colours',
            () {
              c.ownPatternMode = 'kit';
              c.patternTile = tile;
            },
            'body',
            () => c.defaultPatternColor,
          ),
        ]) {
      c.edit(() {
        c.pattern = 'Solid';
        c.zones = {};
        c.patternTile = null;
        setUp();
        c.patternColor = c.patternColorOwn = null;
      });
      await tester.pump();

      // By hand: the PATTERN tab, then a colour; every pattern takes it (the
      // viewer's design.patternColorOwn).
      await tester.tap(find.byKey(const ValueKey('colour-tab-3')));
      await tester.pumpAndSettle();
      expect(shown(), hexOf(before()), reason: what);
      await tester.enterText(hex, 'E92137');
      await tester.pump();
      final byHand = c.patternColor;
      expect(byHand, '#e92137', reason: what);
      expect(c.patternColorOwn, isTrue, reason: what);
      final main = c.mainColor, secondary = c.secondaryColor;

      // By tap: another tab first, then the viewer's tap on the pattern.
      await tester.tap(find.byKey(const ValueKey('colour-tab-0')));
      await tester.pumpAndSettle();
      c.edit(() {
        c.patternColor = '#169f67';
        c.patternColorOwn = null;
      });
      await tester.pump();
      c.colourPick!({
        'type': 'colourPick',
        'hit': true,
        'slot': 'pattern',
        'area': null,
        'zone': zone,
        'part': 'top',
      });
      await tester.pumpAndSettle();
      expect(find.text(tip), findsNothing, reason: what);
      await tester.enterText(hex, 'E92137');
      await tester.pump();
      expect(c.patternColor, byHand, reason: what);
      expect(c.patternColorOwn, isTrue, reason: what);
      // Only the pattern's colour changed.
      expect(c.mainColor, main, reason: what);
      expect(c.secondaryColor, secondary, reason: what);
    }

    // A preset clears the flag (as the website's palettes and presets); undo
    // brings it back.
    c.applyPreset({
      'main': '#10233f',
      'secondary': '#ffc52f',
      'pattern': 'Chevron',
      'patternColor': '#ffc52f',
    });
    await tester.pump();
    expect(c.patternColorOwn, isNull);
    c.undo();
    await tester.pump();
    expect(c.patternColorOwn, isTrue);
    expect(c.patternColor, '#e92137');

    // An uploaded pattern in Full colour keeps its colours: the tip says how.
    c.ownPatternMode = 'full';
    c.colourPick!({
      'type': 'colourPick',
      'hit': true,
      'slot': 'pattern-image',
      'area': null,
      'zone': 'body',
      'part': 'top',
    });
    await tester.pumpAndSettle();
    expect(find.text(tip), findsOneWidget);
    expect(tester.takeException(), isNull);
    await closeApp(tester, c);
  });

  test('the picked pattern colour (patternColorOwn) is kept when saved and '
      'reopened, on the device and on the website; without it nothing is '
      'sent', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    c.patternColor = '#e92137';
    c.patternColorOwn = true;
    Project project() => Project(
      title: 'Own ink',
      sport: 'Rugby League',
      garment: 'Jersey',
      mode: 'DYO',
      kit: c.kit,
      updated: DateTime.now(),
    );
    final saved = project();
    final sent =
        jsonDecode(jsonEncode(ProjectSync.toServer(saved)))
            as Map<String, dynamic>;
    final design = sent['design'] as Map;
    expect(design['patternColor'], '#e92137');
    expect(design['patternColorOwn'], isTrue);
    final disk = ProjectStore.decode(
      jsonDecode(jsonEncode(ProjectStore.encode(saved))),
      {},
    );
    final server = ProjectSync.fromServer({...sent, 'id': 7, 'version': 1});
    for (final restored in [disk, server]) {
      expect(restored.kit.patternColor, '#e92137');
      expect(restored.kit.patternColorOwn, isTrue);
      // Reopened in the Studio.
      final other = AppController(store: FakeStore());
      addTearDown(other.dispose);
      other.loadProject(restored);
      expect(other.patternColorOwn, isTrue);
      expect(other.patternColor, '#e92137');
    }

    // Not picked (a palette or preset): not sent (older servers refuse the
    // field) and not read back; a website project without it has none.
    c.patternColorOwn = null;
    final plain =
        jsonDecode(jsonEncode(ProjectSync.toServer(project())))
            as Map<String, dynamic>;
    expect((plain['design'] as Map).containsKey('patternColorOwn'), isFalse);
    expect(
      ProjectSync.fromServer({
        ...plain,
        'id': 8,
        'version': 1,
      }).kit.patternColorOwn,
      isNull,
    );
    expect(
      ProjectStore.decode(
        jsonDecode(jsonEncode(ProjectStore.encode(project()))),
        {},
      ).kit.patternColorOwn,
      isNull,
    );
  });
}
