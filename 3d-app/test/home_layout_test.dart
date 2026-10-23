import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/widgets/ui.dart' show BottomNav, BrandLogo;

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show mountPhone, tapText;

/// The client's Home (images/166.jpg, 2026-10-23): "What would you like to
/// create?", a 2 × 2 grid of picture tiles and the Assist link, without
/// overflow from small phones to tablets; each tile opens its screen.
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

        // The Assist link sits under the tiles.
        final link = find.byKey(const ValueKey('home-assist-link'));
        await tester.ensureVisible(link);
        await tester.pump();
        expect(
          tester.getTopLeft(link).dy,
          greaterThan(
            tester
                .getBottomLeft(find.byKey(const ValueKey('home-tile-team')))
                .dy,
          ),
        );
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
      tester.getTopLeft(find.textContaining('What would you like')).dy,
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

    // The quiet Convert line still starts Convert (no AI in tests: it says so).
    c.update(() => c.screen = AppScreen.home);
    await tester.pump(const Duration(milliseconds: 400));
    await tapText(tester, 'Convert an image to 3D');
    expect(
      find.text('Convert needs AI, which is not set up in this build.'),
      findsOneWidget,
    );
    expect(c.screen, AppScreen.home);
  });
}
