import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/widgets/drag_tray.dart';

import 'flow_test.dart' show tapText;
import 'studio_panel_test.dart' show closeApp, openStudio;

void main() {
  testWidgets(
    'dropping a pattern fills the area it lands on, a logo lands where dropped',
    (tester) async {
      final c = AppController();
      addTearDown(c.dispose);
      // The 3D viewer reports what is under the drop point.
      late Offset asked;
      c.pickGarment = (x, y) async {
        asked = Offset(x, y);
        return x < 0.3
            ? {
                'hit': true,
                'part': 'top',
                'side': 'front',
                'x': 0.37,
                'y': 0.56,
                'zone': 'sleeves',
              }
            : {
                'hit': true,
                'part': 'top',
                'side': 'front',
                'x': -0.1,
                'y': 0.6,
                'zone': 'body',
              };
      };
      final key = GlobalKey();
      await tester.pumpWidget(
        MaterialApp(
          home: Center(child: SizedBox(key: key, width: 200, height: 400)),
        ),
      );
      final box = key.currentContext!.findRenderObject()! as RenderBox;
      final origin = box.localToGlobal(Offset.zero);

      final note = await DragTray.drop(
        c,
        const KitDrop.pattern('Tribal'),
        origin + const Offset(0, 100),
        box,
      );
      expect(c.zones['sleeves'], 'Tribal');
      expect(note, contains('sleeves'));
      expect(
        asked.dx,
        closeTo(32 / 200, 1e-6),
      ); // the finger, under the middle of the drag preview

      final png = Uint8List.fromList([
        0x89,
        0x50,
        0x4e,
        0x47,
        ...List.filled(20, 1),
      ]);
      await DragTray.drop(
        c,
        KitDrop.image(png),
        origin + const Offset(120, 100),
        box,
      );
      final layer = c.layers.last;
      expect(layer['x'], -0.1);
      expect(layer['side'], 'front');
      expect(layer['src'], startsWith('data:image/png;base64,'));
      expect(c.canUndo, isTrue);

      c.pickGarment = (x, y) async => {'hit': false};
      expect(
        await DragTray.drop(c, const KitDrop.pattern('Dots'), origin, box),
        contains('directly onto the garment'),
      );
    },
  );

  testWidgets('dragging over the kit: the part under the finger glows live, '
      'off the kit it clears, and the drop lands under the finger', (
    tester,
  ) async {
    final c = await openStudio(tester, 390, 844);
    // The 3D viewer's side: what it is asked to glow, and what is under the
    // drop point.
    final hovers = <Offset?>[];
    c.hoverGarment = hovers.add;
    // On the web the 3D frame lets the mouse through while dragging.
    final through = <bool>[];
    c.viewerPassThrough = through.add;
    Offset? asked;
    c.pickGarment = (x, y) async {
      asked = Offset(x, y);
      return {
        'hit': true,
        'part': 'top',
        'side': 'front',
        'x': 0.1,
        'y': 0.5,
        'zone': 'sleeves',
      };
    };
    await tapText(tester, 'Drag to kit');
    await tester.pumpAndSettle();
    final tile = find.descendant(
      of: find.byType(DragTray),
      matching: find.text('Solid'),
    );
    final stage = tester.getRect(find.byType(DragTarget<KitDrop>));
    // Over the kit's middle, then a quarter down: the glow follows.
    final finger = await tester.startGesture(tester.getCenter(tile));
    await tester.pump(const Duration(milliseconds: 300));
    for (var i = 1; i <= 6; i++) {
      await finger.moveTo(
        Offset.lerp(tester.getCenter(tile), stage.center, i / 6)!,
      );
      await tester.pump();
    }
    expect(hovers.last!.dx, closeTo(.5, .01));
    expect(hovers.last!.dy, closeTo(.5, .01));
    final lower = Offset(stage.center.dx, stage.top + stage.height * .75);
    await finger.moveTo(lower);
    await tester.pump();
    expect(hovers.last!.dy, closeTo(.75, .01));
    // Off the kit (back over the tray): the glow is cleared.
    await finger.moveTo(tester.getCenter(tile));
    await tester.pump();
    expect(hovers.last, isNull);
    expect(asked, isNull);
    // Back on and let go: cleared, and the drop lands under the finger.
    await finger.moveTo(stage.center);
    await tester.pump();
    await finger.moveTo(lower);
    await tester.pump();
    expect(hovers.last, isNotNull);
    await finger.up();
    await tester.pumpAndSettle();
    expect(hovers.last, isNull);
    expect(asked!.dx, closeTo(.5, .01));
    expect(asked!.dy, closeTo(.75, .01));
    expect(c.zones['sleeves'], 'Solid');
    expect(through, [true, false]);
    await closeApp(tester, c);
  });
}
