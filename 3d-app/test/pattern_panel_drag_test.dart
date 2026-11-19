import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/widgets/drag_tray.dart';

import 'flow_test.dart' show tapText;
import 'studio_panel_test.dart' show closeApp, openStudio;

/// Client 607 (19 Nov): the Patterns panel floats over the 3D (glass); a
/// thumbnail is held and dragged onto the garment: the panel shrinks to one
/// line, the part under the finger glows, the pattern goes on that part (one
/// undo step) and the panel comes back; off the garment nothing changes; a
/// tap still puts it on the chosen area or the whole garment.
void main() {
  testWidgets('Patterns: hold and drag a thumbnail onto the garment', (
    tester,
  ) async {
    final c = await openStudio(tester, 390, 844);
    final hovers = <Offset?>[];
    c.hoverGarment = hovers.add;
    final through = <bool>[];
    c.viewerPassThrough = through.add;
    // The 3D viewer's side: the front under the middle of the 3D, nothing
    // near its left edge.
    c.pickGarment = (x, y) async => x < .12
        ? {'hit': false}
        : {
            'hit': true,
            'part': 'top',
            'side': 'front',
            'x': 0.0,
            'y': 0.4,
            'zone': 'body',
            'partKey': 'front',
          };
    await tapText(tester, 'Patterns');
    await tester.pumpAndSettle();
    // 2 rows of 6 thumbnails.
    double row(String name) =>
        tester.getCenter(find.byKey(ValueKey('pattern-tile-$name'))).dy;
    expect(row('Blades'), row('None'));
    expect(row('Camo'), row('Swirl'));
    expect(row('Swirl'), greaterThan(row('None')));
    final stage = tester.getRect(find.byType(DragTarget<KitDrop>));
    final before = tester.getRect(find.byType(DragTarget<KitDrop>));

    Future<void> dragTile(String name, Offset to) async {
      final tile = find.byKey(ValueKey('pattern-tile-$name'));
      final from = tester.getCenter(tile);
      final finger = await tester.startGesture(from);
      await tester.pump(const Duration(milliseconds: 400));
      for (var i = 1; i <= 6; i++) {
        // (The drag preview rides above the finger: the drop point is the
        // finger.)
        await finger.moveTo(Offset.lerp(from, to, i / 6)!);
        await tester.pump();
      }
      // Held: the panel is one line, the 3D keeps its size.
      expect(find.byKey(const ValueKey('pattern-drop-bar')), findsOneWidget);
      expect(tester.getRect(find.byType(DragTarget<KitDrop>)), before);
      await finger.up();
      await tester.pumpAndSettle();
    }

    final onKit = Offset(stage.center.dx, stage.top + stage.height * .35);
    await dragTile('Stripes', onKit);
    expect(hovers.where((h) => h != null), isNotEmpty);
    expect(hovers.last, isNull);
    expect(c.parts['front'], {'pattern': 'Stripes'});
    expect(find.byKey(const ValueKey('pattern-drop-bar')), findsNothing);
    expect(find.byKey(const ValueKey('pattern-tile-Stripes')), findsOneWidget);
    expect(through, [true, false]);
    // One undo step.
    c.undo();
    await tester.pump();
    expect(c.parts.containsKey('front'), isFalse);

    // Let go over the 3D but off the garment: nothing changes.
    ScaffoldMessenger.of(
      tester.element(find.byType(DragTarget<KitDrop>)),
    ).removeCurrentSnackBar();
    await tester.pumpAndSettle();
    await dragTile(
      'Dots',
      Offset(stage.left + 14, stage.top + stage.height * .3),
    );
    expect(c.parts, isEmpty);
    expect(c.zones, isEmpty);
    expect(find.textContaining('not applied'), findsOneWidget);
    // Let go off the 3D (over the tool row): cancelled, the panel is back.
    ScaffoldMessenger.of(
      tester.element(find.byType(DragTarget<KitDrop>)),
    ).removeCurrentSnackBar();
    await tester.pumpAndSettle();
    await dragTile('Camo', Offset(stage.center.dx, stage.bottom + 24));
    expect(c.parts, isEmpty);
    expect(c.zones, isEmpty);
    expect(find.byKey(const ValueKey('pattern-drop-bar')), findsNothing);

    // A tap: the whole garment; a style chip too.
    ScaffoldMessenger.of(
      tester.element(find.byType(DragTarget<KitDrop>)),
    ).removeCurrentSnackBar();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('pattern-tile-Hoops')));
    await tester.pump();
    expect(c.pattern, 'Hoops');
    expect(c.patternTile, isNull);
    expect(c.zones, isEmpty);
    await tester.tap(find.byKey(const ValueKey('pattern-chip-Velocity')));
    await tester.pump();
    expect(c.pattern, 'Velocity');
    await closeApp(tester, c);
  });
}
