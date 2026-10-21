import 'dart:async';

import 'package:flutter/material.dart';
import 'package:three_deezi/widgets/ui.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/ai_service.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/ai_designer.dart';

import 'flow_test.dart' show mountPhone;

/// The AI designer's results (client visual 138.jpg) with a fake AI: the
/// PRIMARY starts at once at medium quality, the plan gives three options,
/// each card fills in as its picture arrives, late pictures are dropped.
class _FakeAi extends AiService {
  final renders = <({String quality, String view, Map<String, dynamic>? direction, Completer<Uint8List> done})>[];
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
    renders.add((quality: quality, view: view, direction: direction, done: done));
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
  final fake = _FakeAi();
  @override
  AiService get ai => fake;
}

extension on DesignSpec {
  DesignSpec copyGarment(String garment) => DesignSpec.fromJson({...toJson(), 'garment': garment});
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
    png = (await rootBundle.load('assets/images/reference_1.png')).buffer.asUint8List();
  });

  testWidgets('the primary renders at once, medium; the options fill in one by one', (tester) async {
    final c = _Controller()
      ..brief = 'A cool BLITZ training singlet with lightning'
      ..screen = AppScreen.concepts;
    await mountPhone(tester, c);
    startResults(c);
    await tester.pump();
    // The primary is rendering before the plan has answered; nothing paid in HD.
    expect(c.fake.renders, hasLength(1));
    expect(c.fake.renders.single.quality, 'medium');
    expect(find.text('PRIMARY DESIGN'), findsOneWidget);
    expect(find.text('Rendering your design… about 40 seconds'), findsOneWidget);

    c.fake.plan.complete([_spec('Brief'), _spec('Voltage'), _spec('Shards'), _spec('Halftone')]);
    await tester.pump();
    expect(c.concepts.map((x) => x.spec.designName), ['Brief', 'Voltage', 'Shards', 'Halftone']);
    expect(c.fake.renders, hasLength(4));
    expect(c.fake.renders.skip(1).every((r) => r.quality == 'medium'), isTrue);
    // The primary front and back; the option cards one front view (138.jpg).
    expect(c.fake.renders.map((r) => r.view), ['presentation', 'front', 'front', 'front']);
    expect(c.fake.renders[1].direction?['front'], 'Voltage: black body with blue lightning');

    // Option 2 arrives first: only its card has a picture.
    c.fake.renders[1].done.complete(png);
    await tester.pump();
    expect(c.concepts[1].image, isNotNull);
    expect(c.concepts[2].image, isNull);
    expect(c.concepts[2].busy, isTrue);

    // The rest arrive.
    for (final r in [c.fake.renders[0], c.fake.renders[2], c.fake.renders[3]]) {
      r.done.complete(png);
    }
    await tester.pumpAndSettle();
    expect(c.concepts.every((x) => x.image != null && !x.busy), isTrue);

    // Make primary from the option's menu: it swaps in at once with its picture.
    await tester.tap(find.byTooltip('Design 2 actions'));
    await tester.pumpAndSettle();
    expect(find.text('Make HD · 10 credits'), findsOneWidget);
    await tester.tap(find.text('Make primary'));
    await tester.pumpAndSettle();
    expect(c.concepts.first.spec.designName, 'Voltage');
    expect(c.concepts.first.image, png);
    expect(c.concepts[1].spec.designName, 'Brief');

    // Make HD on the primary: one high-quality render of the same design.
    await tester.ensureVisible(find.byTooltip('Primary design actions'));
    await tester.pump();
    await tester.tap(find.byTooltip('Primary design actions'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Make HD · 10 credits'));
    await tester.pump(const Duration(milliseconds: 600));
    expect(c.fake.renders.last.quality, 'high');
    expect(c.fake.renders.last.view, 'presentation', reason: 'Make HD gives the full front and back');
    expect(c.fake.renders.last.direction?['front'], 'Voltage: black body with blue lightning');
    c.fake.renders.last.done.complete(png);
    await tester.pump();
    expect(c.concepts.first.quality, 'high');
  });

  testWidgets('Back to create drops late pictures; the refine bar generates again', (tester) async {
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

    // A refined brief from the results bar replaces all four.
    c.go(AppScreen.concepts);
    await tester.pump();
    await tester.enterText(find.byKey(const ValueKey('refine-brief')), 'A white and gold BLITZ singlet with lightning');
    await tester.tap(find.byTooltip('Generate again'));
    await tester.pump();
    expect(c.brief, 'A white and gold BLITZ singlet with lightning');
    expect(c.screen, AppScreen.generating);
    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(milliseconds: 800));
  });

  // QA 2026-10-21: at 390 px the label was cut to "Open in 3D …".
  for (final width in [360.0, 390.0, 600.0]) {
    testWidgets('the full "Open in 3D Designer" label fits at $width px', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 844);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = _Controller()..concepts = [for (final n in ['Brief', 'Voltage', 'Shards', 'Halftone']) Concept(_spec(n))..image = png];
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: ConceptsScreen(c))));
      await tester.pump(const Duration(milliseconds: 300));
      expect(tester.takeException(), isNull);
      final open = tester.getRect(find.byType(GradientButton));
      final download = tester.getRect(find.widgetWithText(OutlinedButton, 'Download'));
      if (width < 500) {
        // Phones: two rows, the button as wide as the card (about 310 px at
        // 360), plenty for the label (about 150 px in the app's font).
        expect(download.top, greaterThan(open.bottom));
        expect(open.width, greaterThan(width - 60));
      } else {
        expect((download.center.dy - open.center.dy).abs(), lessThan(1), reason: 'side by side where they fit');
        expect(open.width, greaterThan(250));
      }
      expect(find.text('Open in 3D Designer'), findsOneWidget);
    });
  }

  testWidgets('a hoodie opens in the 3D Designer with the design and the logo, no print sheet', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(600, 900);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = _Controller()
      ..garment = 'Zip hoodie'
      ..aiGarment = 'Zip hoodie'
      ..concepts = [Concept(_spec('Brief').copyGarment('Zip hoodie'))..image = png];
    c.references.add(png);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ConceptsScreen(c))));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Open in 3D Designer'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(c.screen, AppScreen.studio);
    expect(c.garment, 'Zip hoodie');
    expect(c.logoImage, isNotNull);
    expect(c.sheetBusy, isFalse, reason: 'no print sheet is drawn for a hoodie');
    expect(find.textContaining('full print designs on hoodies are coming'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });
}
