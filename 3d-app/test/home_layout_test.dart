import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/create_home.dart';
import 'package:three_deezi/widgets/ui.dart' show BottomNav, BrandLogo;

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show mountPhone, tapText;
import 'orders_app_test.dart' show mount;

/// The client's Home (images/166.jpg, 2026-10-23): "What would you like to
/// create?", a 2 × 2 grid of picture tiles, then ORDER NOW WITH 3DEEZI (three
/// big cards as on the website), the
/// Preferred suppliers strip, the Assist link and Convert, without overflow
/// from small phones to tablets; each tile and button opens its screen.
void main() {
  for (final size in const [
    Size(360, 640),
    Size(390, 844),
    Size(430, 932),
    Size(820, 1180),
    Size(1024, 768),
  ]) {
    testWidgets(
      'Home at ${size.width.toInt()} × ${size.height.toInt()}: 2 × 2 tiles, no overflow',
      (tester) async {
        final c = AppController(store: FakeStore())..screen = AppScreen.home;
        await mountPhone(tester, c);
        tester.view.physicalSize = size;
        await tester.pump();
        expect(tester.takeException(), isNull);

        Rect tile(String id) =>
            tester.getRect(find.byKey(ValueKey('home-tile-$id')));
        final ai = tile('ai'), dyo = tile('dyo');
        final art = tile('artboard'), team = tile('team');
        // Two side by side, two under them, all the same portrait size.
        expect(dyo.top, moreOrLessEquals(ai.top));
        expect(dyo.left, greaterThan(ai.right));
        expect(art.top, greaterThan(ai.bottom));
        expect(art.left, moreOrLessEquals(ai.left));
        expect(team.top, moreOrLessEquals(art.top));
        expect(team.left, moreOrLessEquals(dyo.left));
        expect(team.size, ai.size);
        expect(ai.height / ai.width, moreOrLessEquals(1.25, epsilon: .01));
        expect(ai.left, greaterThanOrEqualTo(0));
        expect(dyo.right, lessThanOrEqualTo(size.width));

        // Under the tiles: the slim ARTWORK TO 3D bar, as wide as the grid.
        // The ordering cards and the suppliers strip left Home (2026-10-28).
        final bar = tester.getRect(
          find.byKey(const ValueKey('home-artwork-bar')),
        );
        expect(bar.top, greaterThan(team.bottom));
        expect(bar.left, moreOrLessEquals(ai.left));
        expect(bar.right, moreOrLessEquals(team.right));
        expect(bar.height, lessThan(90));
        expect(find.byKey(const ValueKey('home-order-form')), findsNothing);
        expect(find.byKey(const ValueKey('home-suppliers')), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('Home sits under the notch and above the home indicator', (
    tester,
  ) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.home;
    await mountPhone(tester, c);
    // An iPhone's safe area: 47 px status bar / notch, 34 px home indicator.
    tester.view.physicalSize = const Size(390, 844);
    tester.view.padding = const FakeViewPadding(top: 47, bottom: 34);
    tester.view.viewPadding = const FakeViewPadding(top: 47, bottom: 34);
    addTearDown(tester.view.resetPadding);
    addTearDown(tester.view.resetViewPadding);
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(
      tester.getTopLeft(find.byType(BrandLogo).first).dy,
      greaterThanOrEqualTo(47),
    );
    expect(
      tester.getTopLeft(find.textContaining('CREATE', findRichText: true)).dy,
      greaterThan(47),
    );
    expect(
      tester.getBottomLeft(find.byType(BottomNav)).dy,
      lessThanOrEqualTo(844 - 34),
    );
  });

  testWidgets('each Home tile opens the screen it opened before', (
    tester,
  ) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.home;
    await mountPhone(tester, c);
    tester.view.physicalSize = const Size(390, 844);
    await tester.pump();

    await tapText(tester, 'AI DESIGNER');
    expect(c.screen, AppScreen.aiDesigner);
    expect(c.mode, 'AI');

    c.update(() => c.screen = AppScreen.home);
    await tester.pump(const Duration(milliseconds: 400));
    await tapText(tester, 'DESIGN YOUR OWN');
    expect(c.screen, AppScreen.sport);
    expect(c.mode, 'DYO');

    c.update(() => c.screen = AppScreen.home);
    await tester.pump(const Duration(milliseconds: 400));
    await tapText(tester, 'ARTBOARD');
    expect(c.screen, AppScreen.artboard);

    // The INSTANT 3D FROM ARTWORK bar starts Convert, as the grey line it
    // replaced did (it needs no AI), from its button and from
    // the rest of the panel.
    for (final part in ['ARTWORK TO 3D']) {
      c.update(() => c.screen = AppScreen.home);
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(seconds: 4)); // The last toast goes.
      await tapText(tester, part);
      // Artwork to 3D (task 9.153) works without AI: it opens the file
      // picker (nothing picked in tests), never the "needs AI" note.
      expect(
        find.text('Convert needs AI, which is not set up in this build.'),
        findsNothing,
        reason: part,
      );
      expect(c.screen, AppScreen.home);
    }
  });

  testWidgets(
    'Home: ARTWORK TO 3D is one button for screen readers',
    (tester) async {
      final semantics = tester.ensureSemantics();
      final c = AppController(store: FakeStore())..screen = AppScreen.home;
      await mount(tester, CreateHomeScreen(c), width: 360);
      final bar = find.byKey(const ValueKey('home-artwork-bar'));
      await tester.ensureVisible(bar);
      await tester.pumpAndSettle();
      expect(find.text('ARTWORK TO 3D'), findsOneWidget);
      expect(
        tester.getSemantics(bar),
        isSemantics(
          label:
              'Artwork to 3D',
          isButton: true,
          hasTapAction: true,
        ),
      );
      expect(tester.takeException(), isNull);
      semantics.dispose();
    },
  );
}
