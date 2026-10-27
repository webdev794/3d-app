import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/design_document.dart';
import 'package:three_deezi/design_sheet.dart';
import 'package:three_deezi/part_editing.dart';
import 'package:three_deezi/player_shot.dart';
import 'package:three_deezi/project_store.dart';
import 'package:three_deezi/project_sync.dart';
import 'package:three_deezi/widgets/part_panel.dart';
import 'package:three_deezi/widgets/ui.dart' show KitPreview;

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show tapText;
import 'studio_panel_test.dart' show closeApp, openStudio;

/// A real 1 x 1 PNG (a logo from the photo library).
final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
);

class _Panel {
  _Panel(this.c);
  final AppController c;
  final chosen = <String>[];
  int done = 0;
}

/// The Part panel on its own (the Studio puts it under the 3D), with its
/// Reset part header action above it.
Future<_Panel> pumpPanel(
  WidgetTester tester, {
  String part = 'leftSleeve',
  String garment = 'Jersey',
  Map<String, dynamic>? at,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(390, 844);
  addTearDown(tester.view.reset);
  final p = _Panel(AppController(store: FakeStore())..garment = garment);
  addTearDown(p.c.dispose);
  var key = part;
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: AnimatedBuilder(
          animation: p.c,
          builder: (context, _) => StatefulBuilder(
            builder: (context, setState) => SingleChildScrollView(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  PartResetAction(p.c, key),
                  PartPanel(
                    p.c,
                    partKey: key,
                    at: at,
                    swatches: const [Color(0xffe92137), Color(0xff157cdd)],
                    onPart: (next) => setState(() {
                      p.chosen.add(next);
                      key = next;
                    }),
                    onDone: () => p.done++,
                    pickImage: (_) async => Uint8List.fromList(_png),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  return p;
}

/// Scrolls the control into view (a chip at the end of a row, Done under
/// the panel's fold), then taps it.
Future<void> tapKey(WidgetTester tester, String key) async {
  await tester.ensureVisible(find.byKey(ValueKey(key), skipOffstage: false));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(ValueKey(key)));
  await tester.pump();
}

Future<void> hex(WidgetTester tester, String value) async {
  await tester.enterText(find.byKey(const ValueKey('colour-hex')), value);
  await tester.pump();
}

KitState kit({
  Map<String, dynamic> parts = const {},
  List<Map<String, dynamic>> layers = const [],
}) => KitState(
  garment: 'Jersey',
  mainColor: const Color(0xff0b1016),
  secondaryColor: const Color(0xff00c2cc),
  accentColor: const Color(0xff36e3ee),
  pattern: 'Chevron',
  fabric: 'Standard',
  logoText: 'MANTIS',
  backName: 'SMITH',
  number: '7',
  patternTile: null,
  logoImage: null,
  spec: null,
  parts: parts,
  layers: layers,
);

Project project(KitState k) => Project(
  id: 'p1',
  title: 'Part kit',
  sport: 'Rugby League',
  garment: 'Jersey',
  mode: 'DYO',
  updated: DateTime.utc(2026, 10, 27, 12),
  kit: k,
);

void main() {
  test('design.parts is read and written in the website and viewer format', () {
    final style = PartStyle.fromJson({
      'colour': '#e92137',
      'fade': {'from': '#ffffff', 'to': null, 'angle': 90},
      'pattern': 'Stripes',
      'patternColour': '#00ff00',
      'patternOpacity': 0.4,
      'other': 1,
    });
    expect(style.toJson(), {
      'colour': '#e92137',
      'fade': {'from': '#ffffff', 'to': null, 'angle': 90},
      'pattern': 'Stripes',
      'patternColour': '#00ff00',
      'patternOpacity': 0.4,
    });
    // Anything not valid is left out; a fade needs its From colour.
    expect(
      PartStyle.fromJson({
        'colour': 'red',
        'fade': {'to': '#000000'},
        'pattern': '',
        'patternOpacity': 3,
      }).toJson(),
      {'patternOpacity': 1},
    );
    expect(PartStyle.fromJson(null).isEmpty, isTrue);
    expect(PartStyle.fromJson(const []).isEmpty, isTrue);
    expect(const PartStyle().toJson(), isEmpty);
    // As the website: Solid is a pattern of its own, None is none.
    expect(PartStyle.fromJson({'pattern': 'Solid'}).pattern, 'Solid');
    expect(PartStyle.fromJson({'pattern': 'None'}).isEmpty, isTrue);
    // As the website keeps it: a pattern colour only with its own pattern,
    // an opacity only under 100%.
    expect(
      const PartStyle(
        patternColour: '#ffffff',
        patternOpacity: 1,
      ).cleaned().isEmpty,
      isTrue,
    );
    expect(
      const PartStyle(
        pattern: 'Dots',
        patternColour: '#ffffff',
        patternOpacity: 0.333,
      ).cleaned().toJson(),
      {'pattern': 'Dots', 'patternColour': '#ffffff', 'patternOpacity': 0.33},
    );
    // The server's [] for none; empty parts are left out.
    expect(copyParts(const []), isEmpty);
    expect(
      copyParts({
        'front': {},
        'back': {'colour': '#000000'},
        'hem': 'x',
      }),
      {
        'back': {'colour': '#000000'},
      },
    );

    // Each garment's parts.
    expect(partsOf('Jersey'), topParts);
    expect(partsOf('Polo with pocket'), topParts);
    expect(partsOf('Singlet'), ['front', 'back', 'collar', 'sides', 'hem']);
    expect(partsOf('Netball dress'), partsOf('Singlet'));
    expect(partsOf('Hoodie'), [
      'front',
      'back',
      'leftSleeve',
      'rightSleeve',
      'sides',
      'hem',
    ]);
    expect(partsOf('Track jacket'), partsOf('Hoodie'));
    expect(partsOf('Shorts'), shortsParts);
    expect(partsOf('Full Kit'), [...topParts, ...shortsParts]);
    expect(partPiece('waistband'), 'shorts');
    expect(partPiece('leftSleeve'), 'top');
    expect(partLabel('shortsSides'), 'Shorts side stripes');
    expect(partColourOnly('collar'), isTrue);
    expect(partColourOnly('front'), isFalse);
    // The wearer's left is +x on the print.
    expect(partSpot('Jersey', 'leftSleeve').x, greaterThan(0));
    expect(partSpot('Jersey', 'rightSleeve').x, lessThan(0));
    expect(partSpot('Jersey', 'back').side, 'back');
    expect(partSpot('Shorts', 'shortsBack').side, 'back');
  });

  test('a part change is one Undo step; Reset part takes off its look and '
      'its objects', () {
    final c = AppController(store: FakeStore());
    c.setPartStyle('leftSleeve', const PartStyle(colour: '#e92137'));
    expect(c.parts, {
      'leftSleeve': {'colour': '#e92137'},
    });
    c.undo();
    expect(c.parts, isEmpty);
    c.redo();
    expect(c.partStyleOf('leftSleeve').colour, '#e92137');
    // An empty look: the part follows the kit again (its key goes).
    c.setPartStyle('leftSleeve', const PartStyle());
    expect(c.parts, isEmpty);
    c.undo();

    // An object on the part only: in the part's middle, or where it was
    // tapped.
    c.addPartObject('leftSleeve', {'type': 'text', 'text': 'GO'});
    final middle = c.layers.single;
    expect(middle['clip'], 'leftSleeve');
    expect(middle['part'], 'top');
    expect(middle['side'], 'front');
    expect(middle['x'] as num, greaterThan(0));
    c.addPartObject(
      'leftSleeve',
      {'type': 'image', 'name': 'Logo', 'src': 'data:image/png;base64,AA=='},
      at: {'part': 'top', 'side': 'back', 'x': 0.41, 'y': 0.6},
    );
    expect(c.layers.last, containsPair('side', 'back'));
    expect(c.layers.last, containsPair('x', 0.41));
    // Smaller on a sleeve, as the website.
    expect(c.layers.last, containsPair('w', 0.07));
    expect(c.partObjects('leftSleeve'), hasLength(2));
    expect(c.partObjects('rightSleeve'), isEmpty);
    // A tap on the other piece (the shorts) is not used for a top part.
    c.addPartObject(
      'front',
      {'type': 'text', 'text': 'X'},
      at: {'part': 'shorts', 'side': 'back', 'x': 0.2, 'y': 0.2},
    );
    expect(c.layers.last, containsPair('side', 'front'));
    c.undo();

    // Reset part: back to the kit's colours and pattern; the objects on it
    // stay (as the website's Reset).
    c.resetPart('leftSleeve');
    expect(c.parts, isEmpty);
    expect(c.layers, hasLength(2));
    expect(c.partChanged('leftSleeve'), isFalse);
    c.undo();
    expect(c.parts, isNotEmpty);
    expect(c.partChanged('leftSleeve'), isTrue);
    c.dispose();
  });

  test('saved and opened again, on the device and on the account; an older '
      'design saves exactly as before', () {
    // An older design: no parts anywhere in what is saved.
    final old = project(kit());
    expect(ProjectStore.encode(old)['kit'], isNot(contains('parts')));
    expect(ProjectSync.toServer(old)['design'], isNot(contains('parts')));
    final oldBack = ProjectStore.decode(
      jsonDecode(jsonEncode(ProjectStore.encode(old))) as Map<String, dynamic>,
      const {},
    );
    expect(oldBack.kit.parts, isEmpty);
    expect(
      ProjectSync.fromServer({
        'id': 1,
        'design': {'main': '#000000', 'parts': []},
      }).kit.parts,
      isEmpty,
    );

    final parts = {
      'leftSleeve': {
        'colour': '#e92137',
        'fade': {'from': '#ffffff', 'to': null, 'angle': 0},
      },
      'back': {'pattern': 'Hoops', 'patternOpacity': 0.5},
    };
    final layers = [
      {
        'id': 'l1',
        'type': 'text',
        'text': 'GO',
        'part': 'top',
        'side': 'front',
        'x': 0.37,
        'y': 0.62,
        'clip': 'leftSleeve',
      },
    ];
    final mine = project(kit(parts: parts, layers: layers));
    final device = ProjectStore.decode(
      jsonDecode(jsonEncode(ProjectStore.encode(mine))) as Map<String, dynamic>,
      const {},
    );
    expect(device.kit.parts, parts);
    expect(device.kit.layers.single['clip'], 'leftSleeve');

    final body = ProjectSync.toServer(mine);
    expect((body['design'] as Map)['parts'], parts);
    final account = ProjectSync.fromServer({
      'id': 7,
      'version': 2,
      'name': 'Part kit',
      'design': jsonDecode(jsonEncode(body['design'])),
    });
    expect(account.kit.parts, parts);
    expect(account.kit.layers.single['clip'], 'leftSleeve');

    // Opened in the Studio: on the kit; a preset replaces the look.
    final c = AppController(store: FakeStore());
    c.loadProject(account);
    expect(c.parts, parts);
    c.applyPreset({'main': '#101010', 'secondary': '#202020'});
    expect(c.parts, isEmpty);
    c.undo();
    expect(c.parts, parts);
    c.dispose();
  });

  testWidgets('the Part panel: its own colour, a fade, a pattern with its '
      'opacity, and objects on this part only', (tester) async {
    final p = await pumpPanel(
      tester,
      at: {'part': 'top', 'side': 'front', 'x': 0.4, 'y': 0.6},
    );
    final c = p.c;
    // The jersey's parts in one row that scrolls sideways to the hem.
    expect(find.byKey(const ValueKey('part-chip-front')), findsOneWidget);
    expect(find.byKey(const ValueKey('part-chip-leftSleeve')), findsOneWidget);
    final list = find.descendant(
      of: find.byKey(const ValueKey('part-list')),
      matching: find.byType(Scrollable),
    );
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('part-chip-hem')),
      120,
      scrollable: list,
    );
    for (final key in ['collar', 'sides', 'hem']) {
      expect(find.byKey(ValueKey('part-chip-$key')), findsOneWidget);
    }
    await tester.drag(list, const Offset(600, 0));
    await tester.pumpAndSettle();
    expect(find.text('Follow kit colour'), findsOneWidget);
    expect(find.text('Pick a colour to give it its own.'), findsOneWidget);

    // COLOUR: its own (typed as HEX on the wheel), one Undo step.
    await hex(tester, 'E92137');
    expect(c.parts, {
      'leftSleeve': {'colour': '#e92137'},
    });
    expect(find.text('Its own colour · #E92137'), findsOneWidget);
    c.undo();
    await tester.pump();
    expect(c.parts, isEmpty);
    c.redo();
    await tester.pump();
    // Follow kit colour takes it back to the kit.
    await tester.tap(find.byKey(const ValueKey('part-follow')));
    await tester.pump();
    expect(c.parts, isEmpty);

    // FADE: a direction starts one, from a kit colour, fading out.
    await tester.tap(find.byKey(const ValueKey('part-tab-1')));
    await tester.pump();
    expect(
      find.text('No fade yet: pick a direction or a colour.'),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const ValueKey('part-fade-dir-90')));
    await tester.pump();
    expect(c.parts['leftSleeve'], {
      'fade': {
        'from': ProjectSync.hex(c.secondaryColor),
        'to': null,
        'angle': 90,
      },
    });
    expect(find.text('Left to right'), findsOneWidget);
    // Its second colour: To, then a colour.
    await tester.tap(find.byKey(const ValueKey('part-fade-to')));
    await tester.pump();
    await hex(tester, '157CDD');
    expect((c.parts['leftSleeve']['fade'] as Map)['to'], '#157cdd');
    await tester.tap(find.byKey(const ValueKey('part-fade-out')));
    await tester.pump();
    expect((c.parts['leftSleeve']['fade'] as Map)['to'], isNull);
    await tester.tap(find.byKey(const ValueKey('part-fade-off')));
    await tester.pump();
    expect(c.parts, isEmpty);

    // PATTERN: one of its own, its opacity (a drag is one Undo step) and
    // its colour.
    await tester.tap(find.byKey(const ValueKey('part-tab-2')));
    await tester.pump();
    await tapKey(tester, 'part-pattern-Stripes');
    expect(c.partStyleOf('leftSleeve').pattern, 'Stripes');
    await tester.drag(
      find.byKey(const ValueKey('part-pattern-opacity')),
      const Offset(-120, 0),
    );
    await tester.pump();
    final opacity = c.partStyleOf('leftSleeve').patternOpacity;
    expect(opacity, isNotNull);
    expect(opacity!, lessThan(1));
    expect(find.text('${(opacity * 100).round()}%'), findsWidgets);
    c.undo();
    await tester.pump();
    expect(c.partStyleOf('leftSleeve').patternOpacity, isNull);
    expect(c.partStyleOf('leftSleeve').pattern, 'Stripes');
    await hex(tester, 'FFC52F');
    expect(c.partStyleOf('leftSleeve').patternColour, '#ffc52f');
    await tapKey(tester, 'part-pattern-colour-kit');
    expect(c.partStyleOf('leftSleeve').patternColour, isNull);
    // No pattern on this part (the kit's at 0%): no opacity to set.
    await tapKey(tester, 'part-pattern-none');
    expect(c.parts, {
      'leftSleeve': {'patternOpacity': 0},
    });
    expect(find.byKey(const ValueKey('part-pattern-opacity')), findsNothing);
    // The kit's pattern again: the part follows the kit.
    await tapKey(tester, 'part-pattern-kit');
    expect(c.parts, isEmpty);
    expect(find.text('KIT PATTERN HERE'), findsOneWidget);

    // OBJECTS: text where the part was tapped, its opacity, a logo.
    await tester.tap(find.byKey(const ValueKey('part-tab-3')));
    await tester.pump();
    await tester.enterText(find.byKey(const ValueKey('part-text')), 'CAPTAIN');
    await tester.tap(find.byKey(const ValueKey('part-add-text')));
    await tester.pump();
    final text = c.layers.single;
    expect(text['type'], 'text');
    expect(text['text'], 'CAPTAIN');
    expect(text['clip'], 'leftSleeve');
    expect(
      (text['part'], text['side'], text['x'], text['y']),
      ('top', 'front', 0.4, 0.6),
    );
    final id = text['id'] as String;
    expect(find.byKey(ValueKey('part-object-$id')), findsOneWidget);
    await tester.drag(
      find.byKey(ValueKey('part-object-opacity-$id')),
      const Offset(-80, 0),
    );
    await tester.pump();
    expect(c.layers.single['opacity'] as num, lessThan(1));
    c.undo();
    await tester.pump();
    expect(c.layers.single['opacity'], 1);

    await tapKey(tester, 'part-add-logo');
    await tester.pumpAndSettle();
    expect(c.layers, hasLength(2));
    expect(c.layers.last['type'], 'image');
    expect(c.layers.last['clip'], 'leftSleeve');
    expect(c.logos, hasLength(1));
    // The logo again, from the row of logos used.
    await tapKey(tester, 'part-logo-0');
    expect(c.partObjects('leftSleeve'), hasLength(3));
    await tapKey(tester, 'part-object-delete-$id');
    expect(c.partObjects('leftSleeve'), hasLength(2));
    expect(c.layers.every((l) => l['type'] == 'image'), isTrue);

    // The part list marks a part with a look of its own (as the website's
    // dot; objects alone don't); another part lights up on the 3D, which
    // turns to its side.
    final edited = find.descendant(
      of: find.byKey(const ValueKey('part-chip-leftSleeve')),
      matching: find.byIcon(Icons.edit),
    );
    expect(edited, findsNothing);
    await tapKey(tester, 'part-tab-0');
    await hex(tester, '157CDD');
    expect(edited, findsOneWidget);
    final glows = <Map<String, dynamic>?>[];
    c.glowPart = glows.add;
    await tapKey(tester, 'part-chip-back');
    expect(p.chosen, ['back']);
    expect(glows.single, {'part': 'top', 'key': 'back'});
    expect(c.view, 'Back');

    // Reset part: greyed while the part follows the kit; it takes the part
    // back to the kit's colours and pattern, its objects stay.
    await tapKey(tester, 'part-reset');
    expect(c.parts, hasLength(1));
    await tapKey(tester, 'part-chip-leftSleeve');
    await tapKey(tester, 'part-reset');
    expect(c.parts, isEmpty);
    expect(c.partObjects('leftSleeve'), hasLength(2));

    await tapKey(tester, 'part-done');
    expect(p.done, 1);
  });

  testWidgets('Studio: a tap on a part of the 3D kit opens its Part panel, '
      'Done closes it; the Colours panel keeps its own taps', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final c = await openStudio(tester, 390, 844);
    // No panel open: a tap on a part opens its panel.
    expect(c.partPick, isNotNull);
    Map<String, dynamic> tap(String key, {String side = 'front'}) => {
      'type': 'partPick',
      'hit': true,
      'partKey': key,
      'part': partPiece(key),
      'side': side,
      'x': 0.4,
      'y': 0.6,
    };
    c.partPick!(tap('leftSleeve'));
    await tester.pumpAndSettle();
    final panel = find.byKey(const ValueKey('studio-panel-Part'));
    expect(panel, findsOneWidget);
    expect(find.text('LEFT SLEEVE'), findsOneWidget);
    expect(find.byKey(const ValueKey('part-reset')), findsOneWidget);
    // Under the 3D, as the Colours panel.
    expect(
      tester.getRect(panel).top,
      greaterThanOrEqualTo(tester.getRect(find.byType(KitPreview)).bottom),
    );

    // Another part tapped while it is open: the panel follows it.
    c.partPick!(tap('back', side: 'back'));
    await tester.pumpAndSettle();
    expect(find.text('BACK'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('colour-hex')), 'E92137');
    await tester.pump();
    expect(c.parts, {
      'back': {'colour': '#e92137'},
    });
    // The Studio's Undo takes it back.
    await tester.tap(find.text('Undo'));
    await tester.pump();
    expect(c.parts, isEmpty);
    // An object goes where the part was tapped.
    await tester.tap(find.byKey(const ValueKey('part-tab-3')));
    await tester.pump();
    await tester.enterText(find.byKey(const ValueKey('part-text')), 'NO 7');
    await tapKey(tester, 'part-add-text');
    expect(c.layers.single, containsPair('clip', 'back'));
    expect(c.layers.single, containsPair('side', 'back'));

    // Done, under the panel's fold now: the panel scrolls to it.
    await tapKey(tester, 'part-done');
    await tester.pumpAndSettle();
    expect(panel, findsNothing);
    // Off the kit: nothing opens.
    c.partPick!({'type': 'partPick', 'hit': false});
    await tester.pumpAndSettle();
    expect(panel, findsNothing);

    // The Colours panel picks colours with its taps: part taps are off.
    await tapText(tester, 'Colours');
    await tester.pumpAndSettle();
    expect(c.colourPick, isNotNull);
    expect(c.partPick, isNull);
    await tester.tap(find.byKey(const ValueKey('colour-done')));
    await tester.pumpAndSettle();
    expect(c.partPick, isNotNull);

    // A tap in the Colours panel: "Edit the left sleeve on its own" opens its
    // panel and lights it up (as the website).
    final glows = <Map<String, dynamic>?>[];
    c.glowPart = glows.add;
    await tapText(tester, 'Colours');
    await tester.pumpAndSettle();
    c.colourPick!({
      'type': 'colourPick',
      'hit': true,
      'slot': 'main',
      'partKey': 'leftSleeve',
    });
    await tester.pumpAndSettle();
    expect(find.text('Only the left sleeve'), findsOneWidget);
    await tapKey(tester, 'colour-part-link');
    await tester.pumpAndSettle();
    expect(panel, findsOneWidget);
    expect(find.text('LEFT SLEEVE'), findsOneWidget);
    expect(glows.last, {'part': 'top', 'key': 'leftSleeve'});
    expect(c.colourPick, isNull);
    await tapKey(tester, 'part-done');
    await tester.pumpAndSettle();
    c.glowPart = null;

    // A hood (no part of its own) says where its colours are.
    c.update(() => c.garment = 'Hoodie');
    await tester.pumpAndSettle();
    c.partPick!({
      'type': 'partPick',
      'hit': true,
      'partKey': null,
      'zone': 'hood',
    });
    await tester.pumpAndSettle();
    expect(panel, findsNothing);
    expect(find.textContaining('change them in Colours'), findsOneWidget);
    await closeApp(tester, c);
  });

  test('the parts in one line each: the design sheet, See it on a player '
      'and the Mockup, as the website', () {
    expect(
      partSummary(
        const PartStyle(
          colour: '#e92137',
          fade: PartFade(from: '#ffc52f'),
          pattern: 'Hoops',
          patternColour: '#05727a',
          patternOpacity: .4,
        ),
      ),
      'Own colour #E92137 · Fade #FFC52F > clear (0°) · Pattern Hoops '
      '#05727A 40%',
    );
    expect(partSummary(const PartStyle(patternOpacity: 0)), 'Kit pattern 0%');
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    c.parts = {
      'leftSleeve': {'colour': '#E92137'},
      'front': {
        'fade': {'from': '#ffc52f', 'to': null, 'angle': 0},
      },
      'back': {'pattern': 'Hoops', 'patternOpacity': 0.4},
      'shortsHem': {'patternOpacity': 0},
    };
    expect(c.changedParts, ['front', 'back', 'leftSleeve', 'shortsHem']);
    expect(partColourLines(c), [
      'front: a fade of #ffc52f to clear (top to bottom)',
      'back: horizontal hoops across the body at 40% opacity',
      'left sleeve: #e92137',
      'shorts hems: no pattern',
    ]);
    // After the kit's own lines; each colour named for the image model.
    final lines = kitColours(c);
    expect(lines.sublist(lines.length - 4), partColourLines(c));
    expect(
      PlayerShot.namedColours(['left sleeve: #e92137']).single,
      'left sleeve: #e92137 (bright red)',
    );
    // The Mockup's true colours: the kit's three, then the parts' own.
    expect(c.partColours, ['#ffc52f', '#e92137']);

    // The server takes 14 lines of at most 200 characters: short of room,
    // several parts go on one line.
    final many = [for (var i = 0; i < 12; i++) 'part $i: #000000'];
    expect(fitColourLines(many, 12), many);
    expect(fitColourLines(many, 3), hasLength(2));
    expect(fitColourLines(many, 1).single.length, lessThanOrEqualTo(200));
    expect(fitColourLines(many, 0), isEmpty);
    c.parts = {
      for (final key in [...topParts, ...shortsParts])
        key: {
          'colour': '#123456',
          'fade': {'from': '#abcdef', 'to': '#fedcba', 'angle': 90},
          'pattern': 'Chevron',
          'patternColour': '#654321',
          'patternOpacity': 0.5,
        },
    };
    c.zones = {'sleeves': 'Hoops', 'hem': 'Dots', 'body': 'Camo'};
    final full = kitColours(c);
    expect(full.length, lessThanOrEqualTo(14));
    expect(full.every((l) => l.length <= 200), isTrue);
  });

  testWidgets('the design sheet has a PARTS section', (tester) async {
    Future<Uint8List> png(Color colour) async {
      final recorder = ui.PictureRecorder();
      Canvas(
        recorder,
      ).drawRect(const Rect.fromLTWH(20, 20, 160, 160), Paint()..color = colour);
      final image = await recorder.endRecording().toImage(200, 200);
      return (await image.toByteData(
        format: ui.ImageByteFormat.png,
      ))!.buffer.asUint8List();
    }

    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    final pdf = await tester.runAsync(() async {
      c
        ..mockupFront = await png(const Color(0xff1e6fe8))
        ..parts = {
          'leftSleeve': {'colour': '#e92137'},
        }
        ..layers = [
          {
            'id': 'a',
            'type': 'text',
            'text': 'CAPTAIN',
            'clip': 'leftSleeve',
            'opacity': 0.6,
          },
        ];
      return designSheetPdf(c);
    });
    expect(String.fromCharCodes(pdf!.take(5)), '%PDF-');
    expect(String.fromCharCodes(pdf).contains('/Count 1'), isTrue);
  });

  testWidgets('the chosen pattern scrolls into view when the Pattern tab '
      'opens', (tester) async {
    final p = await pumpPanel(tester);
    await tester.tap(find.byKey(const ValueKey('part-tab-2')));
    await tester.pumpAndSettle();
    await tapKey(tester, 'part-pattern-Camo');
    expect(p.c.partStyleOf('leftSleeve').pattern, 'Camo');
    await tester.tap(find.byKey(const ValueKey('part-tab-0')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('part-tab-2')));
    await tester.pumpAndSettle();
    final camo = tester.getRect(find.byKey(const ValueKey('part-pattern-Camo')));
    expect(camo.left, greaterThanOrEqualTo(0));
    expect(camo.right, lessThanOrEqualTo(390));
  });

  testWidgets('9.137 what you tap is what you change: the pattern opens its '
      'colour; with a Part panel open, its PATTERN tab', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final c = await openStudio(tester, 390, 844);
    Map<String, dynamic> tap(String key, String slot) => {
      'type': 'partPick',
      'hit': true,
      'partKey': key,
      'part': 'top',
      'side': 'front',
      'x': 0.0,
      'y': 0.4,
      'slot': slot,
    };
    // No panel: a tap on the pattern opens Colours on the pattern colour.
    c.partPick!(tap('front', 'pattern'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('studio-panel-Colours')), findsOneWidget);
    expect(
      tester
          .widget<AnimatedContainer>(
            find.descendant(
              of: find.byKey(const ValueKey('colour-tab-3')),
              matching: find.byType(AnimatedContainer),
            ),
          )
          .decoration,
      isA<BoxDecoration>().having(
        (d) => d.color,
        'selected',
        isNotNull,
      ),
    );
    // A part with its own pattern colour says so.
    c.update(
      () => c.parts = {
        'leftSleeve': {'pattern': 'Hoops', 'patternColour': '#ffffff'},
      },
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Left sleeve has its own pattern colour (Parts).'),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const ValueKey('colour-done')));
    await tester.pumpAndSettle();
    // A tap elsewhere: Parts; then a tap on the pattern: its PATTERN tab.
    c.partPick!(tap('back', 'main'));
    await tester.pumpAndSettle();
    expect(find.text('BACK'), findsOneWidget);
    c.partPick!(tap('back', 'pattern'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('part-pattern-kit')), findsOneWidget);
    await closeApp(tester, c);
  });

  testWidgets('the collar takes a colour only; a part the garment has not', (
    tester,
  ) async {
    final p = await pumpPanel(tester, part: 'collar');
    expect(find.byKey(const ValueKey('part-tab-1')), findsNothing);
    expect(find.textContaining('rib of its own'), findsOneWidget);
    await hex(tester, 'FFC52F');
    expect(p.c.parts, {
      'collar': {'colour': '#ffc52f'},
    });
    // A hoodie has no collar part.
    p.c.update(() => p.c.garment = 'Hoodie');
    await tester.pump();
    expect(find.textContaining('has no collar'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('part-chip-collar'), skipOffstage: false),
      findsNothing,
    );
    expect(find.byKey(const ValueKey('part-chip-leftSleeve')), findsOneWidget);
  });
}
