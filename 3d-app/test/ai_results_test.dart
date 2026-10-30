import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:three_deezi/widgets/ui.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app.dart' show ThreeDeeziApp;
import 'package:three_deezi/ai_service.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/assist.dart';
import 'package:three_deezi/screens/ai_designer.dart';

import 'flow_test.dart' show mountPhone;

/// The AI designer's results (client visual 138.jpg) with a fake AI: the
/// PRIMARY starts at once at medium quality, the plan gives three options,
/// each card fills in as its picture arrives, late pictures are dropped.
class _FakeAi extends AiService {
  final renders =
      <
        ({
          String quality,
          String view,
          Map<String, dynamic>? direction,
          Completer<Uint8List> done,
        })
      >[];
  final plan = Completer<List<DesignSpec>>();

  @override
  Future<Uint8List> designMockup({
    required String brief,
    required String sport,
    required String garment,
    List<Uint8List> logos = const [],
    Map<String, dynamic>? direction,
    String quality = 'medium',
    String view = 'presentation',
  }) {
    final done = Completer<Uint8List>();
    renders.add((
      quality: quality,
      view: view,
      direction: direction,
      done: done,
    ));
    return done.future;
  }

  @override
  Future<List<DesignSpec>> planConcepts({
    required String brief,
    List<Uint8List> references = const [],
    BriefMode? mode,
    String? sport,
    String? garment,
  }) => plan.future;
}

class _Controller extends AppController {
  _Controller({super.api});
  final fake = _FakeAi();
  @override
  AiService get ai => fake;
}

extension on DesignSpec {
  DesignSpec copyGarment(String garment) =>
      DesignSpec.fromJson({...toJson(), 'garment': garment});
}

DesignSpec _spec(String name) => DesignSpec(
  designName: name,
  detected: 'Singlet',
  summary: '$name summary',
  findings: const [],
  mainColor: const Color(0xff0a0c12),
  secondaryColor: const Color(0xff1e5bff),
  accentColor: const Color(0xffffffff),
  pattern: 'Velocity',
  fabric: 'Standard',
  logoText: 'BLITZ',
  renderPrompt: '$name: black body with blue lightning',
  patternMotif: 'bolts',
);

void main() {
  late Uint8List png;
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    png = (await rootBundle.load(
      'assets/images/reference_1.png',
    )).buffer.asUint8List();
  });

  testWidgets(
    'the primary renders at once, medium; the options fill in one by one',
    (tester) async {
      final c = _Controller()
        ..brief = 'A cool BLITZ training singlet with lightning'
        ..screen = AppScreen.concepts;
      await mountPhone(tester, c);
      startResults(c);
      await tester.pump();
      // The primary is rendering before the plan has answered; nothing paid in HD.
      expect(c.fake.renders, hasLength(1));
      expect(c.fake.renders.single.quality, 'medium');
      expect(
        find.text('PRIMARY DESIGN'),
        findsNothing,
        reason: 'no banner (146.jpg)',
      );
      expect(find.byKey(const ValueKey('design-counter')), findsOneWidget);
      expect(
        find.text('Rendering your design… about 40 seconds'),
        findsOneWidget,
      );

      c.fake.plan.complete([
        _spec('Brief'),
        _spec('Voltage'),
        _spec('Shards'),
        _spec('Halftone'),
      ]);
      await tester.pump();
      expect(c.concepts.map((x) => x.spec.designName), [
        'Brief',
        'Voltage',
        'Shards',
        'Halftone',
      ]);
      expect(c.fake.renders, hasLength(4));
      expect(
        c.fake.renders.skip(1).every((r) => r.quality == 'medium'),
        isTrue,
      );
      // All four front and back in one tall picture (146.jpg).
      expect(c.fake.renders.map((r) => r.view), List.filled(4, 'presentation'));
      expect(
        c.fake.renders[1].direction?['front'],
        'Voltage: black body with blue lightning',
      );

      // Option 2 arrives first: only its card has a picture.
      c.fake.renders[1].done.complete(png);
      await tester.pump();
      expect(c.concepts[1].image, isNotNull);
      expect(c.concepts[2].image, isNull);
      expect(c.concepts[2].busy, isTrue);

      // The rest arrive.
      for (final r in [
        c.fake.renders[0],
        c.fake.renders[2],
        c.fake.renders[3],
      ]) {
        r.done.complete(png);
      }
      await tester.pumpAndSettle();
      expect(c.concepts.every((x) => x.image != null && !x.busy), isTrue);

      // A thumbnail tapped: design 2 goes large at once with its picture,
      // design 1 moves into the thumbnails; nothing is rendered again.
      expect(find.byKey(const ValueKey('design-others')), findsOneWidget);
      for (final i in [1, 2, 3]) {
        expect(find.byKey(ValueKey('thumb-$i')), findsOneWidget);
      }
      await tester.tap(find.byKey(const ValueKey('thumb-1')));
      await tester.pumpAndSettle();
      expect(c.selectedConcept, 1);
      expect(c.concepts.map((x) => x.spec.designName), [
        'Brief',
        'Voltage',
        'Shards',
        'Halftone',
      ], reason: 'the order stays: numbers are stable');
      expect(find.byKey(const ValueKey('thumb-0')), findsOneWidget);
      expect(find.byKey(const ValueKey('thumb-1')), findsNothing);
      expect(c.fake.renders, hasLength(4), reason: 'switching costs nothing');

      // Make HD from ⋯ on the large design: one high-quality render of it.
      await tester.tap(find.byTooltip('Design 2 actions'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Make HD · 10 credits'));
      await tester.pump(const Duration(milliseconds: 600));
      expect(c.fake.renders.last.quality, 'high');
      expect(
        c.fake.renders.last.view,
        'presentation',
        reason: 'Make HD gives the full front and back',
      );
      expect(
        c.fake.renders.last.direction?['front'],
        'Voltage: black body with blue lightning',
      );
      c.fake.renders.last.done.complete(png);
      await tester.pump();
      expect(c.concepts[1].quality, 'high');
      expect(c.concepts.first.quality, isNot('high'));
    },
  );

  testWidgets(
    'Back to create drops late pictures; the refine bar generates again',
    (tester) async {
      final c = _Controller()
        ..brief = 'A cool BLITZ training singlet with lightning'
        ..screen = AppScreen.concepts;
      await mountPhone(tester, c);
      startResults(c);
      await tester.pump();
      final primary = c.concepts.first;
      // Back to create ends the run: the late picture never shows.
      await tester.tap(find.byTooltip('Back'));
      await tester.pump();
      c.fake.renders.first.done.complete(png);
      await tester.pump();
      expect(primary.image, isNull);

      // A new brief from the expanded refine bar replaces all four.
      c.go(AppScreen.concepts);
      await tester.pump();
      expect(
        find.byKey(const ValueKey('refine-brief')),
        findsNothing,
        reason: 'slim until tapped',
      );
      await tester.tap(find.byKey(const ValueKey('refine-design')));
      await tester.pump(const Duration(milliseconds: 500));
      await tester.enterText(
        find.byKey(const ValueKey('refine-brief')),
        'A white and gold BLITZ singlet with lightning',
      );
      await tester.tap(find.byTooltip('Generate again'));
      await tester.pump();
      expect(c.brief, 'A white and gold BLITZ singlet with lightning');
      expect(c.screen, AppScreen.generating);
      await tester.pump(const Duration(seconds: 5));
      await tester.pump(const Duration(milliseconds: 800));
    },
  );

  // Client visual 146.jpg (2026-10-22): the design as large as possible on a
  // phone, the other three as floating thumbnails, one compact row and the
  // slim refine bar, all on one screen with no empty band.
  for (final size in const [Size(360, 740), Size(390, 844), Size(430, 932)]) {
    testWidgets('YOUR DESIGNS fits one ${size.width.toInt()} px screen', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = size;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final wide = (await tester.runAsync(() => _png(300, 200)))!;
      final square = (await tester.runAsync(() => _png(200, 200)))!;
      expect(pictureRatio(wide), 1.5);
      expect(pictureRatio(square), 1);
      final c = _Controller()
        ..concepts = [
          Concept(_spec('Brief'))..image = wide,
          for (final n in ['Voltage', 'Shards', 'Halftone'])
            Concept(_spec(n))..image = square,
        ];
      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: ConceptsScreen(c))),
      );
      await tester.pump(const Duration(milliseconds: 400));
      expect(tester.takeException(), isNull);
      expect(find.text('PRIMARY DESIGN'), findsNothing);
      final counter = tester.widget<Text>(
        find.byKey(const ValueKey('design-counter')),
      );
      expect(counter.textSpan!.toPlainText(), '1 / 4');
      // The picture edge to edge in its own 3:2 proportions (no crop, no stretch).
      final art = tester.getRect(
        find.byKey(const ValueKey('design-0-picture')),
      );
      expect(art.width, closeTo(size.width, 1));
      expect(art.width / art.height, closeTo(1.5, .02));
      // The other three as cards in a row under the picture (client 240.jpg: out of the picture).
      final viewer = tester.getRect(
        find.byKey(const ValueKey('design-viewer')),
      );
      final cards = [
        for (final i in [1, 2, 3])
          tester.getRect(find.byKey(ValueKey('thumb-$i'))),
      ];
      for (final t in cards) {
        expect(t.width, greaterThan(size.width * .25));
        expect(t.top, greaterThanOrEqualTo(viewer.bottom));
        expect(t.left, greaterThanOrEqualTo(0));
        expect(t.right, lessThanOrEqualTo(size.width));
        expect((t.top - cards.first.top).abs(), lessThan(1));
      }
      // One compact row: Open in 3D Designer and the download icon; then the slim refine bar; all on screen.
      final open = tester.getRect(find.byType(GradientButton));
      final download = tester.getRect(
        find.byKey(const ValueKey('download-design')),
      );
      final refine = tester.getRect(
        find.byKey(const ValueKey('refine-design')),
      );
      expect((open.center.dy - download.center.dy).abs(), lessThan(1));
      expect(download.left, greaterThan(open.right));
      expect(find.text('Open in 3D Designer'), findsOneWidget);
      expect(refine.bottom, lessThanOrEqualTo(size.height));
      expect(refine.height, lessThan(60));
      // No empty band: the cards reach the controls.
      expect(open.top - cards.first.bottom, lessThan(20));
      expect(open.top, greaterThanOrEqualTo(cards.first.bottom));
    });
  }

  testWidgets(
    'switching keeps edits; Refine changes the selected design; full screen returns to it',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final wide = (await tester.runAsync(() => _png(300, 200)))!;
      final square = (await tester.runAsync(() => _png(200, 200)))!;
      final refined = (await tester.runAsync(
        () => _png(200, 200, const Color(0xffb8860b)),
      ))!;
      final requests = <Map<String, dynamic>>[];
      final c =
          _Controller(
              api: ApiClient(
                baseUrl: 'https://test.example',
                client: MockClient((request) async {
                  requests.add({
                    'path': request.url.path,
                    ...jsonDecode(request.body) as Map<String, dynamic>,
                  });
                  return http.Response(
                    jsonEncode({
                      'data': {
                        'image':
                            'data:image/png;base64,${base64Encode(refined)}',
                      },
                    }),
                    200,
                  );
                }),
              ),
            )
            ..user = const ApiUser(
              id: 7,
              name: 'Tester',
              email: 't@example.test',
            )
            ..concepts = [
              Concept(_spec('Brief'), direction: const {'ownDesign': false})
                ..image = wide
                ..view = 'presentation',
              for (final n in ['Voltage', 'Shards', 'Halftone'])
                Concept(_spec(n), direction: {'front': n})
                  ..image = square
                  ..view = 'front',
            ];
      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: ConceptsScreen(c))),
      );
      await tester.pump(const Duration(milliseconds: 400));

      // Design 3 large: counter 3 / 4, thumbnails 1, 2 and 4.
      await tester.tap(find.byKey(const ValueKey('thumb-2')));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<Text>(find.byKey(const ValueKey('design-counter')))
            .textSpan!
            .toPlainText(),
        '3 / 4',
      );
      for (final i in [0, 1, 3]) {
        expect(find.byKey(ValueKey('thumb-$i')), findsOneWidget);
      }
      expect(find.byKey(const ValueKey('thumb-2')), findsNothing);
      expect(c.fake.renders, isEmpty, reason: 'switching renders nothing');

      // The slim bar expands with the original brief; collapsing keeps the text.
      await tester.tap(find.byKey(const ValueKey('refine-design')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('refine-brief')), findsOneWidget);
      await tester.enterText(
        find.byKey(const ValueKey('refine-design')),
        'make the collar gold',
      );
      await tester.tap(find.byTooltip('Collapse'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('refine-brief')), findsNothing);
      expect(find.text('make the collar gold'), findsOneWidget);

      // Refine sends design 3 with the change, in its square proportions.
      await tester.tap(find.byTooltip('Refine this design'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pumpAndSettle();
      expect(requests, hasLength(1));
      expect(requests.single['path'], endsWith('/ai/image-edit'));
      expect(requests.single['instruction'], 'make the collar gold');
      expect(
        requests.single.containsKey('size'),
        isFalse,
        reason: 'the server keeps the proportions of the picture',
      );
      expect(
        base64Decode((requests.single['image'] as String).split(',').last),
        square,
      );
      expect(c.concepts[2].image, refined);
      expect(
        c.concepts[0].image,
        wide,
        reason: 'only the selected design changes',
      );

      // Switching away and back keeps the refined picture.
      await tester.tap(find.byKey(const ValueKey('thumb-0')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('thumb-2')));
      await tester.pumpAndSettle();
      expect(c.concepts[2].image, refined);

      // ⋯ has Make HD, Regenerate and Undo last refine.
      await tester.tap(find.byTooltip('Design 3 actions'));
      await tester.pumpAndSettle();
      expect(find.text('Make HD · 10 credits'), findsOneWidget);
      expect(find.text('Regenerate this design'), findsOneWidget);
      await tester.tap(find.text('Undo last refine'));
      await tester.pumpAndSettle();
      expect(c.concepts[2].image, square);

      // Full screen: the picture alone with pinch zoom; closing returns to design 3.
      await tester.tap(find.byTooltip('Full screen'));
      await tester.pumpAndSettle();
      expect(find.byType(InteractiveViewer), findsOneWidget);
      expect(find.text('Tap to switch').hitTestable(), findsNothing);
      await tester.tap(find.byTooltip('Close full screen'));
      await tester.pumpAndSettle();
      expect(c.selectedConcept, 2);
      expect(
        tester
            .widget<Text>(find.byKey(const ValueKey('design-counter')))
            .textSpan!
            .toPlainText(),
        '3 / 4',
      );
    },
  );

  test('the layout keeps the picture whole and centred in its frame', () {
    // A 3:2 picture on a phone: as wide as the screen, centred in the height.
    final phone = resultsLayout(390, 560, 1.5);
    expect(phone.iw, 390);
    expect(phone.ih, 260);
    expect(phone.top, 150);
    // A portrait design on a phone: as tall as the frame, centred across.
    final tall = resultsLayout(390, 540, 2 / 3);
    expect(tall.ih, 540);
    expect(tall.iw, closeTo(360, .5));
    expect(tall.left, 15);
    // On a computer the frame is wide; the portrait picture sits in its middle.
    final desk = resultsLayout(1000, 620, 2 / 3);
    expect(desk.ih, 620);
    expect(desk.left, closeTo((1000 - 620 * 2 / 3) / 2, .5));
    // No picture yet: the whole frame.
    final none = resultsLayout(1000, 620, 2 / 3, picture: false);
    expect((none.iw, none.ih), (1000.0, 620.0));
  });

  // Client 240.jpg (2026-10-30): on a wide screen the large design fills a
  // wide frame and the other three are bigger cards stacked at its right.
  testWidgets('YOUR DESIGNS on a computer: wide frame, cards at the right', (
    tester,
  ) async {
    const size = Size(1366, 768);
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = size;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final tall = (await tester.runAsync(() => _png(200, 300)))!;
    final c = _Controller()
      ..concepts = [
        for (final n in ['Brief', 'Voltage', 'Shards', 'Halftone'])
          Concept(_spec(n))..image = tall,
      ];
    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: ConceptsScreen(c))),
    );
    await tester.pump(const Duration(milliseconds: 400));
    expect(tester.takeException(), isNull);
    final viewer = tester.getRect(find.byKey(const ValueKey('design-viewer')));
    final art = tester.getRect(find.byKey(const ValueKey('design-0-picture')));
    expect(
      viewer.width,
      greaterThan(size.width * .6),
      reason: 'wide, not narrow',
    );
    expect(art.width / art.height, closeTo(2 / 3, .02));
    expect((art.center.dx - viewer.center.dx).abs(), lessThan(1));
    final cards = [
      for (final i in [1, 2, 3])
        tester.getRect(find.byKey(ValueKey('thumb-$i'))),
    ];
    for (final (n, t) in cards.indexed) {
      expect(t.left, greaterThan(viewer.right), reason: 'outside the picture');
      expect(t.right, lessThanOrEqualTo(size.width));
      expect(t.width, greaterThanOrEqualTo(150));
      if (n > 0) expect(t.top, greaterThan(cards[n - 1].bottom));
      expect(t.bottom, lessThanOrEqualTo(viewer.bottom + 1));
    }
    // Each card shows the whole portrait design, not its top strip (242.png).
    for (final i in [1, 2, 3]) {
      final fits = tester
          .widgetList<Image>(
            find.descendant(
              of: find.byKey(ValueKey('thumb-$i')),
              matching: find.byType(Image),
            ),
          )
          .map((e) => e.fit);
      expect(fits, contains(BoxFit.contain));
    }
    // The controls under the large design, as wide as it.
    final open = tester.getRect(find.byType(GradientButton));
    final download = tester.getRect(
      find.byKey(const ValueKey('download-design')),
    );
    expect(open.left, closeTo(viewer.left, 1));
    expect(download.right, closeTo(viewer.right, 1));
    expect(open.top, greaterThanOrEqualTo(viewer.bottom));
    await tester.tap(find.byKey(const ValueKey('thumb-2')));
    await tester.pumpAndSettle();
    expect(c.selectedConcept, 2);
  });

  // ASSIST beside the slim refine bar on YOUR DESIGNS only; every other
  // screen keeps it above its bottom buttons (or the Studio's tool bars).
  testWidgets(
    'ASSIST sits beside the refine bar on the results, as before elsewhere',
    (tester) async {
      final square = (await tester.runAsync(() => _png(200, 200)))!;
      final c = _Controller()
        ..concepts = [
          for (final n in ['Brief', 'Voltage', 'Shards', 'Halftone'])
            Concept(_spec(n))..image = square,
        ]
        ..screen = AppScreen.concepts;
      // 430 wide: the Studio's top bar needs it (at 375 it overflows; reported).
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(430, 932);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(ThreeDeeziApp(controller: c));
      await tester.pump(const Duration(milliseconds: 400));
      final screen = tester.getSize(find.byType(MaterialApp).first);
      final launcher = find.byKey(const ValueKey('assist-launcher'));
      expect(launcher, findsOneWidget);
      final onResults = tester.getRect(launcher);
      final refine = tester.getRect(
        find.byKey(const ValueKey('refine-design')),
      );
      expect(
        (onResults.center.dy - refine.center.dy).abs(),
        lessThan(12),
        reason: 'level with the refine bar',
      );
      expect(
        onResults.left,
        greaterThan(refine.right),
        reason: 'beside it, not over it',
      );
      final download = tester.getRect(
        find.byKey(const ValueKey('download-design')),
      );
      expect(onResults.overlaps(download), isFalse);
      for (final (s, gap) in [
        (AppScreen.projects, 92.0),
        (AppScreen.studio, 172.0),
      ]) {
        c.go(s);
        await tester.pump(const Duration(milliseconds: 600));
        final r = tester.getRect(launcher);
        expect(
          screen.height - r.bottom,
          closeTo(gap, 1),
          reason: '$s keeps its place',
        );
      }
      // The Home and the Orders tab have their own Assist link instead: the
      // round launcher shows there only while the chat is open (to close it).
      final assist = AssistController.latest!;
      for (final s in [AppScreen.home, AppScreen.orderHub]) {
        c.go(s);
        await tester.pump(const Duration(milliseconds: 600));
        expect(launcher, findsNothing, reason: '$s has its own link');
        assist.show();
        await tester.pump(const Duration(milliseconds: 600));
        expect(launcher, findsOneWidget, reason: '$s: the chat is open');
        expect(
          screen.height - tester.getRect(launcher).bottom,
          closeTo(92, 1),
          reason: '$s keeps its place',
        );
        await tester.tap(launcher);
        await tester.pump(const Duration(milliseconds: 600));
        expect(assist.open, isFalse);
        expect(launcher, findsNothing, reason: '$s: closed again');
      }
      await tester.pump(const Duration(seconds: 2));
    },
  );

  testWidgets(
    'a hoodie opens in the 3D Designer with the design and the logo, no print sheet',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(600, 900);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = _Controller()
        ..garment = 'Zip hoodie'
        ..aiGarment = 'Zip hoodie'
        ..concepts = [
          Concept(_spec('Brief').copyGarment('Zip hoodie'))..image = png,
        ];
      c.references.add(png);
      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: ConceptsScreen(c))),
      );
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.text('Open in 3D Designer'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(c.screen, AppScreen.studio);
      expect(c.garment, 'Zip hoodie');
      expect(c.logoImage, isNotNull);
      expect(
        c.sheetBusy,
        isFalse,
        reason: 'no print sheet is drawn for a hoodie',
      );
      expect(
        find.textContaining('full print designs on hoodies are coming'),
        findsOneWidget,
      );
      await tester.pump(const Duration(seconds: 5));
    },
  );
}

/// A plain PNG of the given size (a 3:2 presentation or a square option).
Future<Uint8List> _png(
  int width,
  int height, [
  Color color = const Color(0xff123456),
]) async {
  final recorder = ui.PictureRecorder();
  Canvas(recorder).drawRect(
    Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
    Paint()..color = color,
  );
  final image = await recorder.endRecording().toImage(width, height);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  return data!.buffer.asUint8List();
}
