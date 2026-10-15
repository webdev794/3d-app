import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show mountPhone, tapText;

void main() {
  testWidgets('home has the three creation paths and plans', (tester) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.home;
    await mountPhone(tester, c);
    // A large phone: the test font is much wider than real text.
    tester.view.physicalSize = const Size(430, 900);
    await tester.pump();
    expect(find.text('START CREATING'), findsOneWidget);
    for (final label in [
      'START WITH AI',
      'START DESIGNING',
      'OPEN ARTBOARD',
      'Plans & pricing',
    ]) {
      await tester.ensureVisible(find.text(label));
      expect(find.text(label), findsOneWidget);
    }
    await tapText(tester, 'EXPLORE THE 3D STUDIO  →');
    expect(c.screen, AppScreen.studio);
    expect(c.mode, 'DYO');
    c.update(() => c.screen = AppScreen.home);
    await tester.pump(const Duration(milliseconds: 400));
    await tapText(tester, 'OPEN ARTBOARD');
    expect(c.screen, AppScreen.artboard);
  });

  testWidgets('plans and the Corporate Partner offer', (tester) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.home;
    await mountPhone(tester, c);
    await tapText(tester, 'Plans & pricing');
    expect(c.screen, AppScreen.pricing);
    expect(find.text('Club'), findsOneWidget);
    expect(find.text('MOST POPULAR'), findsOneWidget);
    await tester.ensureVisible(find.text('APPLY TO BECOME A PARTNER'));
    expect(
      find.text('Yearly only. Setup fee applies. Pricing excludes GST.'),
      findsOneWidget,
    );
    await tapText(tester, 'APPLY TO BECOME A PARTNER');
    expect(find.text('Apply to become a partner'), findsOneWidget);
    // Required fields are checked before sending.
    await tapText(tester, 'SEND APPLICATION');
    expect(find.text('Required'), findsWidgets);
  });

  testWidgets('approved kits have their own tab', (tester) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.projects;
    await mountPhone(tester, c);
    c.update(() => c.projects.first.approved = true);
    await tester.pump();
    await tapText(tester, 'Approved');
    expect(find.text('APPROVED'), findsOneWidget);
  });

  testWidgets('guests are sent to sign in to see orders', (tester) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.orders;
    await mountPhone(tester, c);
    expect(
      find.text('Sign in to order kits and follow them here.'),
      findsOneWidget,
    );
    await tapText(tester, 'SIGN IN');
    expect(c.screen, AppScreen.auth);
    expect(find.byType(Scaffold), findsWidgets);
  });
}
