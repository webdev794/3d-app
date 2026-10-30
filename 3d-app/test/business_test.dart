import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show mountPhone, tapText;

void main() {
  testWidgets('home has the four creation tiles, Assist and Convert', (
    tester,
  ) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.home;
    await mountPhone(tester, c);
    // A large phone: the test font is much wider than real text.
    tester.view.physicalSize = const Size(430, 900);
    await tester.pump();
    // The client's home (images/166.jpg).
    expect(find.textContaining('CREATE', findRichText: true), findsWidgets);
    for (final title in [
      'AI DESIGNER',
      'DESIGN YOUR OWN',
      'ARTBOARD',
      'DESIGN TEAM',
    ]) {
      await tester.ensureVisible(find.text(title));
      expect(find.text(title), findsOneWidget);
    }
    expect(find.text('Describe your idea'), findsNothing);
    expect(find.text('Need a hand? Ask 3DEEZI Assist'), findsOneWidget);
    // Convert's way in: the slim ARTWORK TO 3D bar (client 2026-10-28).
    expect(find.text('ARTWORK TO 3D'), findsOneWidget);
    expect(find.text('Convert an image to 3D'), findsNothing);
    expect(find.text('Plans & pricing'), findsNothing);
    await tapText(tester, 'ARTBOARD');
    expect(c.screen, AppScreen.artboard);
  });

  testWidgets('plans and the Corporate Partner offer', (tester) async {
    // Plans & pricing opens from Profile (the Home keeps to its four tiles).
    final c = AppController(store: FakeStore())..screen = AppScreen.profile;
    await mountPhone(tester, c);
    await tester.scrollUntilVisible(
      find.text('Plans & pricing'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tapText(tester, 'Plans & pricing');
    expect(c.screen, AppScreen.pricing);
    expect(find.text('Club'), findsOneWidget);
    expect(find.text('MOST POPULAR'), findsOneWidget);
    // Club is the A$49.95 plan (A$499.50 billed yearly), and each
    // plan has its 3DEEZI TEAM line, as on the website's /pricing.
    expect(find.text('A\$49.95 / month'), findsOneWidget);
    expect(find.text('A\$19 / month'), findsOneWidget);
    for (final (plan, line) in [
      ('Rookie', '3DEEZI TEAM designer: A\$100 per design (incl. GST)'),
      ('Creator', '3DEEZI TEAM designer: A\$49.95 per design (incl. GST)'),
      ('Club', '3DEEZI TEAM designers included: 15 designs a month'),
      ('Pro Studio', '3DEEZI TEAM designers included: 30 designs a month'),
    ]) {
      expect(
        find.descendant(
          of: find.byKey(Key('plan-team-$plan')),
          matching: find.text(line),
        ),
        findsOneWidget,
      );
    }
    await tapText(tester, 'Yearly · 2 months free');
    // Yearly keeps "2 months free" true: A$499.50 (A$41.63 a month).
    expect(
      find.text('A\$41.63 / month, A\$499.50 billed yearly'),
      findsOneWidget,
    );
    expect(find.text('A\$16 / month, A\$190 billed yearly'), findsOneWidget);
    await tapText(tester, 'Monthly');
    expect(find.text('A\$49.95 / month'), findsOneWidget);
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
