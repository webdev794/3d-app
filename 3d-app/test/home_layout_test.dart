import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/create_home.dart';
import 'package:three_deezi/screens/order_entry.dart'
    show OrderFormScreen, OrderUploadScreen;
import 'package:three_deezi/widgets/ui.dart' show BottomNav, BrandLogo;

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show mountPhone, tapText;
import 'orders_app_test.dart' show OrdersServer, signedIn, mount, tap;

/// The client's Home (images/166.jpg, 2026-10-23): "What would you like to
/// create?", a 2 × 2 grid of picture tiles, then ORDERS (three buttons), the
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

        // Under the tiles: ORDERS (three buttons in one row, as wide as the
        // tiles), the Preferred suppliers strip, the Assist link, Convert.
        await tester.ensureVisible(find.byKey(const ValueKey('home-convert')));
        await tester.pump();
        Rect at(String key) => tester.getRect(find.byKey(ValueKey(key)));
        final form = at('home-order-form'), upload = at('home-order-upload');
        final mine = at('home-my-orders'), strip = at('home-suppliers');
        final link = at('home-assist-link');
        expect(form.top, greaterThan(at('home-tile-team').bottom));
        expect(upload.top, moreOrLessEquals(form.top));
        expect(mine.top, moreOrLessEquals(form.top));
        expect(upload.left, greaterThan(form.right));
        expect(mine.left, greaterThan(upload.right));
        expect(form.left, moreOrLessEquals(at('home-tile-ai').left));
        expect(mine.right, moreOrLessEquals(at('home-tile-dyo').right));
        expect(strip.top, greaterThan(form.bottom));
        expect(strip.width, moreOrLessEquals(mine.right - form.left));
        expect(link.top, greaterThan(strip.bottom));
        expect(at('home-convert').top, greaterThan(link.top));
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

  testWidgets(
    "Home ORDERS: each button opens the Orders tab's screen; Back returns home",
    (tester) async {
      final c = signedIn(OrdersServer())..screen = AppScreen.home;
      await mount(tester, CreateHomeScreen(c), width: 390);
      await tap(tester, find.byKey(const ValueKey('home-order-form')));
      expect(find.byType(OrderFormScreen), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.byType(OrderFormScreen), findsNothing);
      expect(find.byKey(const ValueKey('home-tile-ai')), findsOneWidget);
      await tap(tester, find.byKey(const ValueKey('home-order-upload')));
      expect(find.byType(OrderUploadScreen), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.byType(OrderUploadScreen), findsNothing);
      expect(find.byKey(const ValueKey('home-tile-ai')), findsOneWidget);
      await tap(tester, find.byKey(const ValueKey('home-my-orders')));
      expect(c.screen, AppScreen.orders);
      // Back from My orders comes home.
      c.back();
      expect(c.screen, AppScreen.home);
    },
  );

  testWidgets(
    'Home ORDERS signed out: the form and the upload ask to sign in first',
    (tester) async {
      final server = OrdersServer();
      final c = AppController(
        store: FakeStore(),
        api: ApiClient(client: server.client, baseUrl: 'https://test.example'),
      )..screen = AppScreen.home;
      await mount(tester, CreateHomeScreen(c), width: 390);
      await tap(tester, find.byKey(const ValueKey('home-order-form')));
      expect(find.byType(OrderFormScreen), findsNothing);
      expect(find.text('Sign in to place an order.'), findsOneWidget);
      expect(c.screen, AppScreen.auth);
      c.screen = AppScreen.home;
      await tap(tester, find.byKey(const ValueKey('home-order-upload')));
      expect(find.byType(OrderUploadScreen), findsNothing);
      expect(c.screen, AppScreen.auth);
      expect(
        server.requests.where((r) => r.url.path.contains('order')),
        isEmpty,
      );
      // My orders opens (it shows its own "Sign in" message).
      c.screen = AppScreen.home;
      await tap(tester, find.byKey(const ValueKey('home-my-orders')));
      expect(c.screen, AppScreen.orders);
    },
  );

  testWidgets('Home: Preferred suppliers, coming soon (nothing to tap yet)', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final c = AppController(store: FakeStore())..screen = AppScreen.home;
    await mount(tester, CreateHomeScreen(c), width: 360);
    final strip = find.byKey(const ValueKey('home-suppliers'));
    await tester.ensureVisible(strip);
    await tester.pumpAndSettle();
    expect(
      find.bySemanticsLabel('3DEEZI Preferred suppliers: coming soon'),
      findsOneWidget,
    );
    expect(find.text('PREFERRED SUPPLIERS'), findsOneWidget);
    expect(find.text('Coming soon.'), findsOneWidget);
    await tester.tap(strip);
    await tester.pumpAndSettle();
    expect(c.screen, AppScreen.home);
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}
