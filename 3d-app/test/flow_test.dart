import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app.dart';
import 'package:three_deezi/app_controller.dart';

import 'features_test.dart' show FakeStore;
import 'garment_tiles_test.dart' show revealTap;

Future<void> mountPhone(WidgetTester tester, AppController controller) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(375, 720);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(controller.dispose);
  await tester.pumpWidget(ThreeDeeziApp(controller: controller));
  await tester.pump(const Duration(milliseconds: 400));
}

Future<void> tapText(
  WidgetTester tester,
  String text, {
  bool last = false,
}) async {
  final target = last ? find.text(text).last : find.text(text).first;
  await tester.ensureVisible(target);
  await tester.tap(target);
  // The screen fade starts on the next frame; let it finish.
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pump();
}

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

  testWidgets('splash, onboarding and sign in reach Create home', (
    tester,
  ) async {
    final c = AppController();
    await mountPhone(tester, c);
    expect(c.screen, AppScreen.splash);
    await tester.pump(const Duration(milliseconds: 2300));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.onboarding);
    expect(find.text('CUSTOM SPORTSWEAR\nYOUR WAY'), findsOneWidget);

    await tapText(tester, 'GET STARTED');
    expect(c.screen, AppScreen.auth);
    expect(find.text('Continue with Apple'), findsOneWidget);
    expect(find.text('Continue with Google'), findsOneWidget);
    expect(find.text('Continue with Email'), findsOneWidget);

    // Email opens the account sheet (register, with a switch to sign in).
    await tapText(tester, 'Continue with Email');
    expect(find.text('CREATE YOUR ACCOUNT'), findsOneWidget);
    expect(find.text('CREATE ACCOUNT'), findsOneWidget);
    await tapText(tester, 'Already have an account? Sign in');
    expect(find.text('SIGN IN'), findsNWidgets(2)); // title and button
    Navigator.of(tester.element(find.text('SIGN IN').first)).pop();
    await tester.pumpAndSettle();

    await tapText(tester, 'Continue as guest (projects stay on this device)');
    expect(c.screen, AppScreen.home);
    expect(find.text('AI DESIGNER'), findsOneWidget);
    expect(find.text('DESIGN YOUR OWN'), findsOneWidget);
  });

  testWidgets('Design Your Own: carousel, garment, studio and undo', (
    tester,
  ) async {
    final c = AppController()..screen = AppScreen.home;
    await mountPhone(tester, c);

    await tapText(tester, 'DESIGN YOUR OWN');
    expect(c.screen, AppScreen.sport);
    expect(c.mode, 'DYO');
    expect(find.text('DESIGN RUGBY LEAGUE'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.chevron_right_rounded));
    await tester.pumpAndSettle();
    expect(find.text('DESIGN BASKETBALL'), findsOneWidget);

    await tapText(tester, 'DESIGN BASKETBALL');
    expect(c.sport, 'Basketball');
    expect(c.screen, AppScreen.garment);

    await tester.pumpAndSettle();
    // Basketball's own garments (task 9.99): its first one is chosen; the
    // Full Kit is under More teamwear.
    expect(find.text('BASKETBALL UNIFORMS & TEAMWEAR'), findsOneWidget);
    expect(c.productName, 'Basketball singlet');
    await revealTap(tester, 'More teamwear');
    await revealTap(tester, 'FULL KIT');
    await tester.pumpAndSettle();
    expect(c.garment, 'Full Kit');
    expect(c.productName, isEmpty);
    await tapText(tester, 'CONTINUE TO STUDIO');
    expect(c.screen, AppScreen.studio);
    for (final tool in ['Colours', 'Patterns', 'Logos', 'Text', 'Garment']) {
      expect(find.text(tool), findsOneWidget);
    }
    expect(find.text('Ask 3DEEZI to change anything…'), findsOneWidget);
    expect(c.canUndo, isFalse);

    // Colour edit through the Colours sheet, then Undo / Redo.
    final before = c.mainColor;
    await tapText(tester, 'Colours');
    await tester.pumpAndSettle();
    final swatches = find.byWidgetPredicate(
      (w) =>
          w is Container &&
          w.decoration is BoxDecoration &&
          (w.decoration! as BoxDecoration).shape == BoxShape.circle &&
          (w.decoration! as BoxDecoration).color == const Color(0xffe92137),
    );
    await tester.tap(swatches.first);
    await tester.pump();
    expect(c.mainColor, const Color(0xffe92137));
    expect(c.canUndo, isTrue);
    Navigator.of(tester.element(swatches.first)).pop();
    await tester.pumpAndSettle();

    await tapText(tester, 'Undo');
    expect(c.mainColor, before);
    await tapText(tester, 'Redo');
    expect(c.mainColor, const Color(0xffe92137));

    // Offline chip: "Make it black".
    await tapText(tester, 'Make it black');
    expect(c.mainColor, const Color(0xff0b1016));
  });

  testWidgets('AI Designer (demo mode): brief to concepts to studio', (
    tester,
  ) async {
    final c = AppController()..screen = AppScreen.home;
    await mountPhone(tester, c);

    await tapText(tester, 'AI DESIGNER');
    expect(c.screen, AppScreen.aiDesigner);
    // The brief helpers now live in the (+) sheet of the prompt bar.
    await tester.tap(find.byTooltip('Attach and suggestions'));
    await tester.pumpAndSettle();
    for (final chip in ['Inspire', 'Modify', 'Match', 'Improve']) {
      expect(find.text(chip), findsOneWidget);
    }
    await tester.tapAt(const Offset(187, 40));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField),
      'Black and cyan rugby league jersey with a Mantis logo',
    );
    await tester.tap(find.byTooltip('Generate designs'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.generating);
    expect(find.text('Understanding your brief'), findsOneWidget);

    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.concepts);
    expect(c.concepts, hasLength(4));

    // YOUR DESIGNS (146.jpg): design 1 large, the others as numbered
    // thumbnails; tapping one shows it large (Open in 3D Designer follows it).
    for (final n in ['2', '3', '4']) {
      expect(find.text(n), findsOneWidget);
    }
    await tester.tap(find.byKey(const ValueKey('thumb-1')));
    await tester.pumpAndSettle();
    expect(c.selectedConcept, 1);
    expect(c.concepts[1].spec.designName, 'Gold Standard');
    expect(c.concepts.first.spec.designName, 'Mantis Strike');
    await tapText(tester, 'Open in 3D Designer');
    expect(c.screen, AppScreen.studio);
    expect(c.projectName, 'Gold Standard');
    expect(c.secondaryColor, const Color(0xffffc52f));
  });

  testWidgets('save creates versions and appears in My Projects', (
    tester,
  ) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.home;
    await mountPhone(tester, c);
    c.startDyo();
    c.go(AppScreen.studio);
    await tester.pump(const Duration(milliseconds: 400));

    await tapText(tester, 'Save');
    expect(c.screen, AppScreen.saveProject);
    expect(find.text('Version 1'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Thunder Home');
    // The header also reads "SAVE PROJECT"; tap the button below it.
    await tapText(tester, 'SAVE PROJECT', last: true);
    expect(c.projects.first.title, 'Thunder Home');
    expect(c.projects.first.version, 1);
    expect(find.text('EXPORT DESIGN'), findsOneWidget);

    // Saving the same project again bumps the version.
    c.saveProject('Thunder Home');
    expect(c.projects.first.version, 2);
    expect(c.projects.where((p) => p.title == 'Thunder Home'), hasLength(1));

    await tapText(tester, 'View My Projects');
    expect(c.screen, AppScreen.projects);
    expect(find.text('Thunder Home'), findsOneWidget);
    await tapText(tester, 'DYO Designs');
    expect(find.text('Thunder Home'), findsOneWidget);
    expect(find.text('Warriors Concept'), findsNothing);
  });

  testWidgets('every screen fits a 375 x 720 phone', (tester) async {
    final c = AppController();
    await mountPhone(tester, c);
    c.startDyo();
    for (final screen in AppScreen.values) {
      if (screen == AppScreen.splash || screen == AppScreen.generating) {
        continue;
      }
      c.update(() => c.screen = screen);
      await tester.pump(const Duration(milliseconds: 400));
      expect(tester.takeException(), isNull, reason: '$screen overflowed');
    }
  });
}
