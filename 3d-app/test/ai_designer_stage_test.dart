import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/ai_designer.dart' show AiDesignerScreen;
import 'package:three_deezi/widgets/ai_stage.dart';

import 'flow_test.dart' show mountPhone;

/// The AI Designer's new first screen (client visual 2026-10-21): the logo,
/// DESIGN WITHOUT LIMITS, the prompt bar and the sports row; a tile only sets
/// the sport; the garment is asked with chips only when the brief names none.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final body = FontLoader('Inter')
      ..addFont(rootBundle.load('assets/fonts/Inter.ttf'));
    final display = FontLoader('Rajdhani')
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-Bold.ttf'));
    await Future.wait([body.load(), display.load()]);
  });

  test('reads the garment and sport from a brief', () {
    expect(garmentInBrief('Navy polo with a gold crest'), 'Polo');
    expect(garmentInBrief('Rugby jersey and shorts'), 'Full Kit');
    expect(garmentInBrief('A netball dress in teal'), 'Singlet');
    expect(garmentInBrief('Black and gold with stripes'), isNull);
    // Hoodies and the pocket polo are garments of their own (2026-10-21).
    expect(garmentInBrief('Navy club hoodie with a gold crest'), 'Hoodie');
    expect(garmentInBrief('A zip-up hoodie for the coaches'), 'Zip hoodie');
    expect(garmentInBrief('Full zip hoodies for the bench'), 'Zip hoodie');
    expect(garmentInBrief('A darts pocket polo'), 'Polo with pocket');
    expect(garmentInBrief('A fishing shirt with a hood'), 'Jersey');
    expect(garmentInBrief('Colours from my childhood club'), isNull);
    expect(sportInBrief('soccer home kit')?.sport, 'Soccer');
    expect(sportInBrief('boxing club gear')?.id, 'fight-wear');
    expect(sportInBrief('something plain'), isNull);
  });

  testWidgets('prompt bar, sports row and the garment chips', (tester) async {
    final c = AppController()..screen = AppScreen.home;
    await mountPhone(tester, c);
    c.startAi();
    await tester.pump(const Duration(milliseconds: 500));
    expect(c.screen, AppScreen.aiDesigner);
    expect(find.text('AI SPORTSWEAR DESIGNER'), findsOneWidget);
    expect(find.text('DESIGN WITHOUT LIMITS'), findsOneWidget);
    expect(find.text('Describe your design...'), findsOneWidget);
    expect(find.byTooltip('Upload a reference image'), findsOneWidget);
    expect(find.byTooltip('Generate designs'), findsOneWidget);
    expect(find.text('RUGBY LEAGUE'), findsOneWidget);

    // A tile only sets the sport: the screen stays.
    await tester.tap(find.text('NETBALL'));
    await tester.pump();
    expect(c.screen, AppScreen.aiDesigner);
    expect(find.text('Describe your Netball design...'), findsOneWidget);

    // No garment in the brief: quick chips for the sport ask for it.
    await tester.enterText(
      find.byType(TextField),
      'Teal and white with a wave pattern for the Stingrays',
    );
    await tester.tap(find.byTooltip('Generate designs'));
    await tester.pump();
    expect(c.screen, AppScreen.aiDesigner);
    expect(find.text('What are we designing for Netball?'), findsOneWidget);
    // Netball's own garments by their names (task 9.99), as in Design Your
    // Own; the coming-soon skirt is not offered.
    expect(find.text('Netball skirt'), findsNothing);
    await tester.tap(find.text('Netball dress'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.generating);
    expect(c.aiSport, 'Netball');
    expect(c.aiGarment, 'Singlet');
    expect(c.garment, 'Singlet');
    expect(c.productName, 'Netball dress');
    expect(c.brief, 'Teal and white with a wave pattern for the Stingrays');
    // Let the demo generation finish before the test ends.
    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(milliseconds: 400));
  });

  testWidgets(
    'a "Hooded Tracksuit" chip gives the track jacket its hood, as in Design Your Own',
    (tester) async {
      // Linked modules of 9.106: the AI's design never sets the hood, so the chip does.
      final c = AppController()..screen = AppScreen.home;
      c.trackStyle = 'collar';
      await mountPhone(tester, c);
      c.startAi();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.tap(find.text('RUGBY LEAGUE'));
      await tester.pump();
      await tester.enterText(
        find.byType(TextField),
        'Black and cyan with lightning bolts for the Wildcats',
      );
      await tester.tap(find.byTooltip('Generate designs'));
      await tester.pump();
      await tester.ensureVisible(find.text('Hooded Tracksuit'));
      await tester.pump();
      await tester.tap(find.text('Hooded Tracksuit'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(c.screen, AppScreen.generating);
      expect(
        (c.garment, c.productName, c.trackStyle),
        ('Track jacket', 'Hooded Tracksuit', 'hood'),
      );
      await tester.pump(const Duration(seconds: 5));
      await tester.pump(const Duration(milliseconds: 400));
    },
  );

  testWidgets(
    'a plain "Track jacket" chip after a "Hooded Tracksuit" one is the collar track jacket (QA U)',
    (tester) async {
      final c = AppController()..screen = AppScreen.home;
      await mountPhone(tester, c);
      c.startAi();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.tap(find.text('RUGBY LEAGUE'));
      await tester.pump();
      await tester.enterText(
        find.byType(TextField),
        'Black and cyan with lightning bolts for the Wildcats',
      );
      await tester.tap(find.byTooltip('Generate designs'));
      await tester.pump();
      await tester.ensureVisible(find.text('Hooded Tracksuit'));
      await tester.pump();
      await tester.tap(find.text('Hooded Tracksuit'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(c.trackStyle, 'hood');
      await tester.pump(const Duration(seconds: 5));
      await tester.pump(const Duration(milliseconds: 400));
      // Back to the AI designer (same session): Soccer's plain track jacket.
      c.go(AppScreen.aiDesigner);
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump(const Duration(milliseconds: 500));
      expect(c.screen, AppScreen.aiDesigner);
      await tester.ensureVisible(find.text('SOCCER'));
      await tester.pump();
      await tester.tap(find.text('SOCCER'));
      await tester.pump();
      await tester.enterText(
        find.byType(TextField).last,
        'Navy and gold with thin pinstripes for the Harbour FC',
      );
      await tester.tap(find.byTooltip('Generate designs'));
      await tester.pump();
      await tester.ensureVisible(find.text('Track jacket'));
      await tester.pump();
      await tester.tap(find.text('Track jacket'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(c.screen, AppScreen.generating);
      expect(
        (c.garment, c.productName, c.trackStyle),
        ('Track jacket', 'Track jacket', 'collar'),
      );
      await tester.pump(const Duration(seconds: 5));
      await tester.pump(const Duration(milliseconds: 400));
    },
  );

  testWidgets('a long brief keeps 4,000 characters, with a counter', (
    tester,
  ) async {
    expect(formatCount(3620), '3,620');
    final c = AppController()..screen = AppScreen.home;
    await mountPhone(tester, c);
    c.startAi();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.enterText(find.byType(TextField), 'a' * 3600);
    await tester.pump();
    expect(find.text('3,600 / 4,000'), findsOneWidget);
    // A longer paste keeps the first 4,000 characters and says so.
    await tester.enterText(find.byType(TextField), 'b' * 4500);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller!.text.length,
      maxBrief,
    );
    expect(find.text('4,000 / 4,000'), findsOneWidget);
    expect(
      find.text('Your brief was shortened to 4,000 characters.'),
      findsOneWidget,
    );
    await tester.pump(const Duration(seconds: 4));
  });

  testWidgets('a category tile names itself in the brief', (tester) async {
    final c = AppController()..screen = AppScreen.home;
    await mountPhone(tester, c);
    c.startAi();
    await tester.pump(const Duration(milliseconds: 500));
    // The row swipes sideways to the categories further along.
    await tester.scrollUntilVisible(
      find.text('WORKWEAR'),
      200,
      scrollable: find.descendant(
        of: find.byType(AiSportRow),
        matching: find.byType(Scrollable),
      ),
    );
    await tester.tap(find.text('WORKWEAR'));
    await tester.pump();
    await tester.enterText(
      find.byType(TextField),
      'Navy polo with hi-vis yellow shoulders and our logo',
    );
    await tester.tap(find.byTooltip('Generate designs'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.generating);
    // Its own category since 2026-10-21 (it was Training / Gym).
    expect(c.aiSport, 'Workwear');
    expect(c.aiGarment, 'Polo');
    expect(c.brief, startsWith('Workwear: '));
    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(milliseconds: 400));
  });

  // QA AB 2026-10-22: without an AI key the sample concepts kept a jersey for
  // a zip hoodie brief, so the Studio opened a jersey.
  testWidgets('sample concepts keep the garment of the brief into the Studio', (
    tester,
  ) async {
    final c = AppController()..screen = AppScreen.home;
    await mountPhone(tester, c);
    c.startAi();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.enterText(
      find.byType(TextField),
      'A black full zip hoodie for the coaches with teal trims',
    );
    await tester.tap(find.byTooltip('Generate designs'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.aiGarment, 'Zip hoodie');
    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.concepts);
    expect(c.concepts.every((k) => k.spec.garment == 'Zip hoodie'), isTrue);
    c.openConcept(0);
    expect(c.garment, 'Zip hoodie');
    await tester.pump(const Duration(seconds: 1));
  });

  // Client 2026-10-26 (images/175.jpg): netball has no player names or
  // numbers, so a netball design from the AI opens in the Studio (and so in
  // the order form) with no back name and no number; rugby keeps its own.
  testWidgets('a netball AI design opens with no back name or number', (
    tester,
  ) async {
    final c = AppController()..screen = AppScreen.home;
    await mountPhone(tester, c);
    for (final (brief, name, number) in [
      ('A black and gold netball singlet for the Panthers', '', ''),
      ('Black and teal rugby league jersey', 'MANTIS', '23'),
    ]) {
      c.startAi();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.enterText(
        find.descendant(
          of: find.byType(AiDesignerScreen),
          matching: find.byType(TextField),
        ),
        brief,
      );
      await tester.tap(find.byTooltip('Generate designs'));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(seconds: 5));
      await tester.pump(const Duration(milliseconds: 400));
      expect(c.screen, AppScreen.concepts, reason: brief);
      c.openConcept(0);
      expect(c.screen, AppScreen.studio, reason: brief);
      expect(c.backName, name, reason: brief);
      expect(c.number, number, reason: brief);
      await tester.pump(const Duration(seconds: 1));
    }
  });

  // QA AB follow-up: every garment a brief can name reaches the Studio offline.
  testWidgets('sample concepts open the garment of each brief in the Studio', (
    tester,
  ) async {
    final c = AppController()..screen = AppScreen.home;
    await mountPhone(tester, c);
    const briefs = {
      'Black and teal rugby league jersey': 'Jersey',
      'A teal netball singlet with gold trims': 'Singlet',
      'Navy training shorts with a white stripe': 'Shorts',
      'A grey training tee for the gym': 'Training Tee',
      'Navy polo with a gold crest': 'Polo',
      'A pocket polo for the darts team': 'Polo with pocket',
      'A black hoodie for the coaches': 'Hoodie',
      'Maroon rugby jersey and shorts': 'Full Kit',
      'A navy varsity jacket for the seniors': 'Varsity jacket',
      'A black club track jacket with teal piping': 'Track jacket',
    };
    for (final MapEntry(key: brief, value: garment) in briefs.entries) {
      c.startAi();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.enterText(
        find.descendant(
          of: find.byType(AiDesignerScreen),
          matching: find.byType(TextField),
        ),
        brief,
      );
      await tester.tap(find.byTooltip('Generate designs'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(c.aiGarment, garment, reason: brief);
      await tester.pump(const Duration(seconds: 5));
      await tester.pump(const Duration(milliseconds: 400));
      expect(c.screen, AppScreen.concepts, reason: brief);
      expect(c.concepts.map((k) => k.spec.garment).toSet(), {
        garment,
      }, reason: brief);
      c.openConcept(0);
      expect(c.garment, garment, reason: brief);
      expect(c.screen, AppScreen.studio);
      await tester.pump(const Duration(seconds: 1));
    }
  });

  // QA 2026-10-21: while MAKE IT 3D draws the print sheet it opens the Studio
  // by itself; Open in 3D Designer waits meanwhile.
  testWidgets('Open in 3D Designer waits while MAKE IT 3D draws', (
    tester,
  ) async {
    final c = AppController()..screen = AppScreen.home;
    await mountPhone(tester, c);
    c.startAi();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.enterText(
      find.byType(TextField),
      'Black and cyan rugby league jersey with a Mantis logo',
    );
    await tester.tap(find.byTooltip('Generate designs'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.concepts);
    final png = (await rootBundle.load(
      'assets/images/reference_1.png',
    )).buffer.asUint8List();
    c.update(() {
      c.concepts.first.image = png;
      c.sheetBusy = true;
    });
    await tester.pump();
    expect(find.text('Drawing the print sheet…'), findsOneWidget);
    await tester.tap(
      find.text('Drawing the print sheet…'),
      warnIfMissed: false,
    );
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.concepts, reason: 'disabled while drawing');
    c.update(() => c.sheetBusy = false);
    await tester.pump();
    // A guest signs in first (the print sheet is kept in their assets).
    await tester.tap(find.text('Open in 3D Designer'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.auth);
  });

  // QA 2026-10-21: back to the brief while MAKE IT 3D draws; the late print
  // sheet must not pull the user into the Studio.
  testWidgets('a late MAKE IT 3D print sheet keeps the user on the brief', (
    tester,
  ) async {
    final c = _SlowSheet()..screen = AppScreen.home;
    c.user = const ApiUser(id: 1, name: 'Tester', email: 't@example.com');
    await mountPhone(tester, c);
    c.startAi();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.enterText(
      find.byType(TextField),
      'Black and cyan rugby league jersey with a Mantis logo',
    );
    await tester.tap(find.byTooltip('Generate designs'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.concepts);
    final png = (await rootBundle.load(
      'assets/images/reference_1.png',
    )).buffer.asUint8List();
    c.update(() => c.concepts.first.image = png);
    await tester.pump();
    await tester.tap(find.text('Open in 3D Designer'));
    await tester.pump();
    expect(c.sheetBusy, isTrue);
    await tester.tap(find.byTooltip('Back'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.aiDesigner);
    c.sheet.complete(png);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.aiDesigner);
    expect(
      find.text('Your print sheet is ready in Assets › Artwork.'),
      findsOneWidget,
    );
    await tester.pump(const Duration(seconds: 5));
  });
}

/// MAKE IT 3D with a print sheet that arrives when the test says.
class _SlowSheet extends AppController {
  final sheet = Completer<Uint8List>();
  @override
  Future<Uint8List> mockupPrintSheet({
    bool frontOnly = false,
    String? garment,
  }) async {
    update(() => sheetBusy = true);
    try {
      return await sheet.future;
    } finally {
      update(() => sheetBusy = false);
    }
  }
}
