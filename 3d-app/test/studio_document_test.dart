import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/design_document.dart';
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

  test('a print layout undoes, saves, syncs and leaves with a new kit', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    final layout = {
      'asset': 41,
      'name': 'LEOPARDS NEW.pdf',
      'roles': ['neck', 'back', 'front', 'sleeveL', 'sleeveR', 'legR', 'legL'],
      'hemFold': true,
      'joinLines': true,
      'parts': ['shorts', 'raglan'],
    };
    c.edit(() => c.layout = copyLayout(layout));
    c.undo();
    expect(c.layout, isNull);
    c.redo();
    expect(c.layout, layout);
    final project = Project(
      title: 'Leopards',
      sport: 'Rugby League',
      garment: 'Full Kit',
      mode: 'DYO',
      kit: c.kit,
      updated: DateTime.now(),
    );
    final body = jsonDecode(jsonEncode(ProjectSync.toServer(project)));
    expect(body['design']['layout'], layout);
    final disk = ProjectStore.decode(
      jsonDecode(jsonEncode(ProjectStore.encode(project))),
      {},
    );
    final server = ProjectSync.fromServer({...body, 'id': 19, 'version': 1});
    for (final restored in [disk, server]) {
      expect(restored.kit.layout, layout);
    }
    // No layout: the field is left out (older servers refuse it) and comes
    // back as null, as do the website's removed layouts.
    c.edit(() => c.layout = null);
    final plain = ProjectSync.toServer(
      Project(
        title: 'Plain',
        sport: 'Rugby League',
        garment: 'Jersey',
        mode: 'DYO',
        kit: c.kit,
        updated: DateTime.now(),
      ),
    );
    expect((plain['design'] as Map).containsKey('layout'), isFalse);
    expect(
      ProjectSync.fromServer({
        'id': 3,
        'name': 'Removed',
        'design': {'layout': null},
      }).kit.layout,
      isNull,
    );
    // Not a layout: no file or no panel names.
    expect(copyLayout({'name': 'x.pdf', 'roles': []}), isNull);
    expect(copyLayout({'asset': 4, 'name': 'x.pdf'}), isNull);
    c.loadProject(server);
    expect(c.layout?['asset'], 41);
    c.startDyo();
    expect(c.layout, isNull);
  });

  test('marks moved on the 2D panels undo, save, sync and reset', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    final moved = {
      'top_wordmark': {
        'side': 'front',
        'x': 0.02,
        'y': 0.52,
        'scale': 1.4,
        'rot': -8,
      },
      'top_crest': {'hidden': true},
    };
    c.edit(() => c.marks = copyMarks(moved));
    c.undo();
    expect(c.marks, isEmpty);
    c.redo();
    expect(c.marks['top_wordmark']['scale'], 1.4);
    final project = Project(
      title: 'Marks',
      sport: 'Rugby League',
      garment: 'Jersey',
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
      'id': 18,
      'version': 1,
    });
    for (final restored in [disk, server]) {
      expect(restored.kit.marks, moved);
    }
    // The server sends [] for "no marks"; older projects have none at all.
    expect(
      ProjectSync.fromServer({
        'id': 1,
        'name': 'Old',
        'design': {'marks': []},
      }).kit.marks,
      isEmpty,
    );
    expect(
      ProjectSync.fromServer({
        'id': 2,
        'name': 'Older',
        'design': {},
      }).kit.marks,
      isEmpty,
    );
    // Reset layout, and a new kit, start with none.
    c.edit(() => c.marks = {});
    expect(c.marks, isEmpty);
    c.loadProject(server);
    expect(c.marks['top_crest']['hidden'], true);
    c.startDyo();
    expect(c.marks, isEmpty);
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

  // QA 2026-10-21: presets did nothing while a design picture (AI, MAKE IT
  // 3D) was on the kit, because the picture stayed on and hid the new look.
  test('a preset replaces a design picture as one undo step, and it can be '
      'put back from Artwork', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    c.addLayer({'type': 'text', 'text': 'CLUB'});
    c.edit(() {
      c.garment = 'Training Tee';
      c.patternTile = Uint8List.fromList([1, 2, 3]);
      c.gradients = {
        'secondary': {'from': '#ff0000', 'to': '#000000', 'angle': 0},
      };
      c.layout = copyLayout({
        'asset': 9,
        'name': 'Print sheet · Net Breaker',
        'roles': ['front', 'back'],
        'kind': 'drawing',
        'parts': ['tee'],
      });
    });
    c.applyPreset({
      'main': '#09152b',
      'secondary': '#2962ff',
      'accent': '#ffffff',
      'pattern': 'Stripes',
      'gradient': null,
      'zones': {'yoke': 'Solid'},
      'layers': [],
    });
    expect(c.layout, isNull, reason: 'the preset shows instead of the picture');
    expect(c.patternTile, isNull, reason: 'no AI print over the preset');
    expect(c.gradients, isNull, reason: 'no Secondary gradient left over');
    expect(c.pattern, 'Stripes');
    expect(c.zones, {'yoke': 'Solid'});
    expect(c.layers.single['text'], 'CLUB', reason: 'artwork stays');
    expect(c.shelvedLayouts['drawing']?.layout['asset'], 9);
    c.undo();
    expect(c.layout?['kind'], 'drawing');
    expect(c.patternTile, isNotNull);
    c.redo();
    expect(c.layout, isNull);
    c.edit(() => c.garment = 'Jersey');
    c.putLayoutBack('drawing');
    expect(c.layout?['name'], 'Print sheet · Net Breaker');
    expect(c.garment, 'Training Tee');
    c.undo();
    expect(c.layout, isNull);
    // A print layout is taken off by a preset too, and shelved apart.
    c.edit(
      () => c.layout = copyLayout({
        'asset': 11,
        'name': 'LEOPARDS NEW.pdf',
        'roles': ['front', 'back', 'sleeveL', 'sleeveR'],
        'parts': ['raglan'],
      }),
    );
    c.applyPreset({'main': '#0b1016', 'pattern': 'Chevron'});
    expect(c.layout, isNull);
    expect(c.shelvedLayouts['print']?.layout['asset'], 11);
    expect(c.shelvedLayouts['drawing']?.layout['asset'], 9);
    // Another kit starts with nothing to put back.
    c.startDyo();
    expect(c.shelvedLayouts, isEmpty);
  });

  test('a colour, pattern or gradient change takes a covering design '
      'picture off; the garment and the number do not', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    final picture = {
      'asset': 9,
      'name': 'Net Breaker',
      'roles': ['front', 'back'],
      'kind': 'drawing',
      'parts': ['tee'],
    };
    c.edit(() => c.layout = copyLayout(picture));
    c.edit(() => c.garment = 'Jersey');
    c.edit(() => c.number = '7');
    expect(c.layout, isNotNull, reason: 'garment and number keep it');
    // The colour wheel: one undo step, then live changes.
    c.edit(() {});
    c.update(() => c.mainColor = const Color(0xffff0000));
    expect(c.layout, isNull, reason: 'the colour shows');
    c.undo();
    expect(c.layout?['kind'], 'drawing');
    c.edit(() => c.pattern = 'Hoops');
    expect(c.layout, isNull);
    c.undo();
    c.edit(
      () => c.gradient = {'from': '#ff0000', 'to': '#000000', 'angle': 0},
    );
    expect(c.layout, isNull);
    c.putLayoutBack('drawing');
    expect(c.layout?['name'], 'Net Breaker');
    // A new picture in the same edit as a colour change stays on.
    c.edit(() {
      c.accentColor = const Color(0xff00ff00);
      c.layout = copyLayout({...picture, 'asset': 10});
    });
    expect(c.layout?['asset'], 10);
  });

  testWidgets('Artwork offers to put the design picture back after a preset', (
    tester,
  ) async {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    c.edit(
      () => c.layout = copyLayout({
        'asset': 9,
        'name': 'Net Breaker',
        'roles': ['front', 'back'],
        'kind': 'drawing',
        'parts': ['tee'],
      }),
    );
    c.applyPreset({'main': '#ff0000', 'pattern': 'Hoops'});
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AnimatedBuilder(
            animation: c,
            builder: (_, _) =>
                SingleChildScrollView(child: StudioArtworkTool(c)),
          ),
        ),
      ),
    );
    final back = find.text('PUT MY DESIGN PICTURE BACK');
    expect(back, findsOneWidget);
    await tester.ensureVisible(back);
    await tester.tap(back);
    await tester.pump();
    expect(c.layout?['name'], 'Net Breaker');
    expect(find.text('REMOVE DESIGN PICTURE'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  test('YOUR DESIGN keeps the kit from before the first preset and follows '
      'changes after it is chosen again', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    c.startDyo();
    // A fresh kit that starts from a preset has none.
    c.applyPreset({'main': '#ff0000', 'pattern': 'Hoops'});
    expect(c.ownKit, isNull);
    c.startDyo();
    c.edit(() {
      c.mainColor = const Color(0xff123456);
      c.layout = copyLayout({
        'asset': 9,
        'name': 'Net Breaker',
        'roles': ['front', 'back'],
        'kind': 'drawing',
        'parts': ['tee'],
      });
      c.garment = 'Training Tee';
    });
    expect(c.ownOn, isTrue);
    c.applyPreset({'main': '#09152b', 'pattern': 'Stripes'});
    c.applyPreset({'main': '#ffffff', 'pattern': 'Dots'});
    expect(c.ownOn, isFalse);
    expect(c.layout, isNull);
    c.restoreOwn();
    expect(c.layout?['name'], 'Net Breaker');
    expect(c.mainColor, const Color(0xff123456));
    expect(c.garment, 'Training Tee');
    expect(c.ownOn, isTrue);
    c.undo();
    expect(c.pattern, 'Dots', reason: 'one undo step');
    c.redo();
    c.edit(() => c.number = '7');
    c.applyPreset({'main': '#ffffff', 'pattern': 'Dots'});
    c.restoreOwn();
    expect(c.number, '7', reason: 'changes after restoring are kept');
  });

  testWidgets('Preset designs shows YOUR DESIGN first and restores it', (
    tester,
  ) async {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    c.edit(() => c.pattern = 'Camo');
    c.applyPreset({'main': '#ff0000', 'pattern': 'Hoops'});
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AnimatedBuilder(
            animation: c,
            builder: (_, _) =>
                SingleChildScrollView(child: StudioPresetsTool(c)),
          ),
        ),
      ),
    );
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();
    final own = find.text('YOUR DESIGN');
    expect(own, findsOneWidget);
    expect(find.byIcon(Icons.check_circle), findsNothing);
    await tester.tap(own);
    await tester.pump();
    expect(c.pattern, 'Camo');
    expect(find.byIcon(Icons.check_circle), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

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
    await tester.ensureVisible(find.byTooltip('Add text layer'));
    await tester.tap(find.byTooltip('Add text layer'));
    await tester.pump();
    expect(c.layers.single['text'], 'CLUB');
    await tester.ensureVisible(find.text('ellipse').first);
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
