import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
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
    await tester.enterText(find.byType(TextField), 'Teal and white with a wave pattern for the Stingrays');
    await tester.tap(find.byTooltip('Generate designs'));
    await tester.pump();
    expect(c.screen, AppScreen.aiDesigner);
    expect(find.text('What are we designing for Netball?'), findsOneWidget);
    await tester.tap(find.text('Singlet'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.generating);
    expect(c.aiSport, 'Netball');
    expect(c.aiGarment, 'Singlet');
    expect(c.garment, 'Singlet');
    expect(c.brief, 'Teal and white with a wave pattern for the Stingrays');
    // Let the demo generation finish before the test ends.
    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(milliseconds: 400));
  });

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
    await tester.enterText(find.byType(TextField), 'Navy polo with hi-vis yellow shoulders and our logo');
    await tester.tap(find.byTooltip('Generate designs'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.generating);
    expect(c.aiSport, 'Training / Gym');
    expect(c.aiGarment, 'Polo');
    expect(c.brief, startsWith('Workwear: '));
    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(milliseconds: 400));
  });

  // QA 2026-10-21: while MAKE IT 3D draws the print sheet it opens the Studio
  // by itself; a concept opened meanwhile would start its own AI print.
  testWidgets('OPEN IN DESIGN STUDIO waits while MAKE IT 3D draws', (
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
      c.mockupImage = png;
      c.sheetBusy = true;
    });
    await tester.pump();
    expect(find.text('Drawing the print sheet… about a minute'), findsOneWidget);
    await tester.ensureVisible(find.text('OPEN IN DESIGN STUDIO'));
    await tester.tap(find.text('OPEN IN DESIGN STUDIO'), warnIfMissed: false);
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.concepts, reason: 'disabled while drawing');
    c.update(() => c.sheetBusy = false);
    await tester.pump();
    expect(find.text('MAKE IT 3D'), findsOneWidget);
    await tester.tap(find.text('OPEN IN DESIGN STUDIO'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.studio);
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
    c.update(() => c.mockupImage = png);
    await tester.pump();
    await tester.ensureVisible(find.text('MAKE IT 3D'));
    await tester.tap(find.text('MAKE IT 3D'));
    await tester.pump();
    expect(c.sheetBusy, isTrue);
    await tester.tap(find.byTooltip('Back'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.aiDesigner);
    c.sheet.complete(png);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.aiDesigner);
    expect(find.text('Your print sheet is ready in Assets › Artwork.'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });
}

/// MAKE IT 3D with a print sheet that arrives when the test says.
class _SlowSheet extends AppController {
  final sheet = Completer<Uint8List>();
  @override
  Future<Uint8List> mockupPrintSheet() async {
    update(() => sheetBusy = true);
    try {
      return await sheet.future;
    } finally {
      update(() => sheetBusy = false);
    }
  }
}
