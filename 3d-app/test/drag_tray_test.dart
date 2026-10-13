import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/widgets/drag_tray.dart';

void main() {
  testWidgets('dropping a pattern fills the area it lands on, a logo lands where dropped', (tester) async {
    final c = AppController();
    addTearDown(c.dispose);
    // The 3D viewer reports what is under the drop point.
    late Offset asked;
    c.pickGarment = (x, y) async {
      asked = Offset(x, y);
      return x < 0.3
          ? {'hit': true, 'part': 'top', 'side': 'front', 'x': 0.37, 'y': 0.56, 'zone': 'sleeves'}
          : {'hit': true, 'part': 'top', 'side': 'front', 'x': -0.1, 'y': 0.6, 'zone': 'body'};
    };
    final key = GlobalKey();
    await tester.pumpWidget(MaterialApp(home: Center(child: SizedBox(key: key, width: 200, height: 400))));
    final box = key.currentContext!.findRenderObject()! as RenderBox;
    final origin = box.localToGlobal(Offset.zero);

    final note = await DragTray.drop(c, const KitDrop.pattern('Tribal'), origin + const Offset(0, 100), box);
    expect(c.zones['sleeves'], 'Tribal');
    expect(note, contains('sleeves'));
    expect(asked.dx, closeTo(32 / 200, 1e-6)); // offset by half the drag preview

    final png = Uint8List.fromList([0x89, 0x50, 0x4e, 0x47, ...List.filled(20, 1)]);
    await DragTray.drop(c, KitDrop.image(png), origin + const Offset(120, 100), box);
    final layer = c.layers.last;
    expect(layer['x'], -0.1);
    expect(layer['side'], 'front');
    expect(layer['src'], startsWith('data:image/png;base64,'));
    expect(c.canUndo, isTrue);

    c.pickGarment = (x, y) async => {'hit': false};
    expect(await DragTray.drop(c, const KitDrop.pattern('Dots'), origin, box), contains('directly onto the garment'));
  });
}
