import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/product_mockup.dart';

import 'features_test.dart' show FakeStore;

/// The Studio's Mockup (studio product photos), the app side of the website's
/// Mockup button.
void main() {
  test('the prompt keeps the design and asks for a studio product photo', () {
    final front = ProductMockup.prompt(
      'front',
      'white',
      sport: 'Rugby League',
      garment: 'Jersey',
      logoText: 'MANTIS',
      backName: 'SMITH',
      number: '7',
      colors: ['#0b1016', '#00c2cc', 'red'],
    );
    expect(front, contains('ghost-mannequin'));
    expect(front, contains('#0b1016, #00c2cc (the main'));
    expect(front, contains('pure-white'));
    expect(front, contains('"MANTIS"'));
    expect(front, contains('EXACTLY'));
    // The small "3D" shield is named so the model does not write "30".
    expect(
      front,
      contains('reads the letters 3D (three-D, not the number 30)'),
    );
    expect(
      ProductMockup.prompt(
        'front',
        'white',
        sport: 'x',
        garment: 'y',
        logoText: 'Mantis',
      ),
      contains('the team wordmark on the chest reads exactly "MANTIS"'),
    );
    final back = ProductMockup.prompt(
      'back',
      'nope',
      sport: 'Hoodie',
      garment: 'Hoodie',
      backName: 'SMITH',
      number: '7',
    );
    expect(back, contains('"SMITH"'));
    expect(back, contains('light-grey'));
    expect(back, isNot(contains('the number 30')));
    expect(
      ProductMockup.prompt('three-quarter', 'dark', sport: 'x', garment: 'y'),
      contains('three-quarter'),
    );
  });

  Future<AppController> openStudio(WidgetTester tester, double width) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.home;
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = Size(width, 844);
    await tester.pumpWidget(ThreeDeeziApp(controller: c));
    await tester.pump(const Duration(milliseconds: 400));
    c.startDyo();
    c.go(AppScreen.studio);
    await tester.pump(const Duration(milliseconds: 400));
    return c;
  }

  testWidgets('the Studio bar has Mockup and still fits 360 px at text x1.3', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    final c = await openStudio(tester, 360);
    expect(tester.takeException(), isNull);
    for (final label in ['Showcase', 'Mockup', 'Save']) {
      expect(
        tester.getRect(find.text(label).first).right,
        lessThanOrEqualTo(360),
      );
    }
    // Signed out, Mockup asks you to sign in.
    await tester.tap(find.text('Mockup').first);
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.auth);
    await tester.pumpWidget(const SizedBox());
    c.dispose();
    tester.platformDispatcher.clearTextScaleFactorTestValue();
    tester.view.reset();
  });

  testWidgets('the Mockup screen shows three views and the backgrounds', (
    tester,
  ) async {
    final c = await openStudio(tester, 360);
    c.go(AppScreen.mockup);
    await tester.pump(const Duration(milliseconds: 400));
    expect(tester.takeException(), isNull);
    for (final label in [
      'Front',
      'Back',
      '3/4',
      'Light grey',
      'White',
      'Dark',
    ]) {
      expect(find.text(label), findsWidgets, reason: label);
    }
    expect(find.text('MAKE MOCKUPS'), findsOneWidget);
    await tester.tap(find.text('Dark'));
    await tester.pump();
    await tester.pumpWidget(const SizedBox());
    c.dispose();
    tester.view.reset();
  });
}
