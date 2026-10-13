import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/project_store.dart';
import 'package:three_deezi/project_sync.dart';
import 'package:three_deezi/widgets/studio_tools.dart';

import 'features_test.dart' show FakeStore;

void main() {
  test('artboard edits undo and redo without sharing layer snapshots', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    c.addLayer({'type': 'shape', 'shape': 'ellipse', 'color': '#ffffff'});
    final id = c.selectedLayerId!;
    final before = c.kit;
    c.changeLayer(id, {'x': 0.21, 'rot': 45});
    expect(before.layers.single['x'], 0);
    expect(c.layers.single['x'], 0.21);
    c.undo();
    expect(c.layers.single['x'], 0);
    c.redo();
    expect(c.layers.single['rot'], 45);
    c.edit(() {
      c.zones = {'sleeves': 'Tribal'};
      c.gradient = {'from': '#101010', 'to': '#ffffff', 'angle': 90};
    });
    c.undo();
    expect(c.gradient, isNull);
    expect(c.zones, isEmpty);
    c.redo();
    expect(c.zones['sleeves'], 'Tribal');
    c.removeLayer(id);
    expect(c.selectedLayerId, isNull);
    c.undo();
    expect(c.layers.single['id'], id);
  });

  test('artwork, per-area patterns and gradients survive disk and API', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    c.layers = [
      {
        'id': 'crest',
        'type': 'image',
        'part': 'top',
        'side': 'back',
        'x': -0.12,
        'y': 0.42,
        'w': 0.14,
        'rot': 25,
        'src': 'data:image/png;base64,aGVsbG8=',
      },
      {
        'id': 'text',
        'type': 'text',
        'part': 'shorts',
        'side': 'front',
        'x': 0.1,
        'y': 0.2,
        'text': 'TEAM',
        'size': 0.05,
        'color': '#ffffff',
      },
      {
        'id': 'shape',
        'type': 'shape',
        'part': 'top',
        'side': 'front',
        'x': 0.0,
        'y': 0.3,
        'shape': 'triangle',
        'w': 0.2,
        'h': 0.1,
      },
    ];
    c.zones = {'sleeves': 'Tribal', 'body': 'None'};
    c.gradient = {'from': '#123456', 'to': '#fedcba', 'angle': 45};
    c.pattern = 'Camo';
    final project = Project(
      title: 'Club kit',
      sport: 'Soccer',
      garment: 'Full Kit',
      mode: 'DYO',
      kit: c.kit,
      updated: DateTime.now(),
    );
    final disk = ProjectStore.decode(
      jsonDecode(jsonEncode(ProjectStore.encode(project))),
      {},
    );
    final server = ProjectSync.fromServer({
      ...jsonDecode(jsonEncode(ProjectSync.toServer(project))),
      'id': 17,
      'version': 2,
    });
    for (final restored in [disk, server]) {
      expect(restored.kit.layers, c.layers);
      expect(restored.kit.zones, c.zones);
      expect(restored.kit.gradient, c.gradient);
      expect(restored.kit.pattern, 'Camo');
    }
    c.loadProject(server);
    expect(c.layers.last['shape'], 'triangle');
    c.startDyo();
    expect(c.layers, isEmpty);
    expect(c.zones, isEmpty);
    expect(c.gradient, isNull);
  });

  test(
    'older projects open with empty artwork and presets undo as one edit',
    () {
      final c = AppController(store: FakeStore());
      addTearDown(c.dispose);
      final p = ProjectSync.fromServer({
        'id': 7,
        'name': 'Legacy',
        'design': {},
      });
      expect(p.kit.layers, isEmpty);
      expect(p.kit.zones, isEmpty);
      expect(p.kit.gradient, isNull);
      final before = c.mainColor;
      c.applyPreset({
        'main': '#ff0000',
        'pattern': 'Hoops',
        'zones': {'hem': 'None'},
        'gradient': {'from': '#ff0000', 'to': '#000000', 'angle': 0},
      });
      expect(c.pattern, 'Hoops');
      expect(c.gradient, isNotNull);
      c.undo();
      expect(c.mainColor, before);
      expect(c.gradient, isNull);
    },
  );

  testWidgets('artwork tools add editable shapes and text on a phone', (
    tester,
  ) async {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    tester.view.physicalSize = const Size(375, 720);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AnimatedBuilder(
            animation: c,
            builder: (_, _) => SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: StudioArtworkTool(c),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.enterText(find.byType(TextField).first, 'CLUB');
    await tester.tap(find.byTooltip('Add text layer'));
    await tester.pump();
    expect(c.layers.single['text'], 'CLUB');
    await tester.tap(find.text('ellipse').first);
    await tester.pump();
    expect(c.layers, hasLength(2));
    expect(c.selectedLayer?['shape'], 'ellipse');
    expect(tester.takeException(), isNull);
    final delete = find.byTooltip('Delete layer').first;
    await tester.ensureVisible(delete);
    await tester.tap(delete);
    await tester.pump();
    expect(c.layers.single['type'], 'text');
    expect(tester.takeException(), isNull);
  });
}
