import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/assist.dart';
import 'package:three_deezi/screens/library.dart';
import 'package:three_deezi/screens/order_entry.dart';
import 'package:three_deezi/screens/orders_board.dart' show OrderDetailScreen;
import 'package:three_deezi/screens/orders_tab.dart';
import 'package:three_deezi/widgets/assist_overlay.dart';
import 'package:three_deezi/widgets/ui.dart';

import 'features_test.dart' show FakeStore;
import 'orders_app_test.dart' show OrdersServer, signedIn, mount, tap;

// The app's Orders tab (client picture images/168.jpg, 2026-10-23) and the
// bottom bar Home · Projects · Orders · Profile (Assets left the bar).

Future<void> _phone(WidgetTester tester, Widget child, double width, [double height = 844]) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, height);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: child)));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('bottom bar: Home, Projects, Orders, Profile; no Assets; each opens its tab', (tester) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.home;
    await _phone(tester, ListenableBuilder(listenable: c, builder: (_, _) => Column(children: [const Spacer(), BottomNav(controller: c)])), 390);
    for (final label in ['Home', 'Projects', 'Orders', 'Profile']) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
    expect(find.text('Assets'), findsNothing);
    expect(find.text('Create'), findsNothing);
    expect(find.byType(CubeIcon), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('nav-orders')));
    await tester.pumpAndSettle();
    expect(c.screen, AppScreen.orderHub);
    expect(tester.widget<CubeIcon>(find.byType(CubeIcon)).filled, isTrue);
    await tester.tap(find.byKey(const ValueKey('nav-projects')));
    await tester.pumpAndSettle();
    expect(c.screen, AppScreen.projects);
    expect(tester.widget<CubeIcon>(find.byType(CubeIcon)).filled, isFalse);
    await tester.tap(find.byKey(const ValueKey('nav-profile')));
    await tester.pumpAndSettle();
    expect(c.screen, AppScreen.profile);
    await tester.tap(find.byKey(const ValueKey('nav-home')));
    await tester.pumpAndSettle();
    expect(c.screen, AppScreen.home);
  });

  test('the bar marks Assets as part of Projects and My orders as part of Orders', () {
    expect(BottomNav.tabOf(AppScreen.assets), AppScreen.projects);
    expect(BottomNav.tabOf(AppScreen.orders), AppScreen.orderHub);
    expect(BottomNav.tabOf(AppScreen.orderHub), AppScreen.orderHub);
    expect(BottomNav.tabOf(AppScreen.home), AppScreen.home);
  });

  testWidgets('Orders tab: the heading, the tiles, Rewards and Assist as in 168.jpg', (tester) async {
    final c = signedIn(OrdersServer())..screen = AppScreen.orderHub;
    await _phone(tester, OrdersTabScreen(c), 390);
    expect(find.text('ORDER WITH'), findsOneWidget);
    expect(find.text('3DEEZI'), findsOneWidget);
    expect(find.text('Start an order. Follow its progress.'), findsOneWidget);
    expect(find.text('CREATE ORDER FORM'), findsOneWidget);
    expect(find.text('Let 3DEEZI Assist help'), findsOneWidget);
    expect(find.text('UPLOAD YOUR ORDER'), findsOneWidget);
    expect(find.text('Add your form and artwork'), findsOneWidget);
    expect(find.text('MY'), findsOneWidget);
    expect(find.text('ORDERS'), findsOneWidget);
    expect(find.text('View orders and track progress.'), findsOneWidget);
    expect(find.text('REWARDS'), findsOneWidget);
    expect(find.text('Coming soon.'), findsOneWidget);
    expect(find.text('Need help? 3DEEZI Assist'), findsOneWidget);
    // The bell (signed in) and the bar with Orders on.
    expect(find.byKey(const Key('notification-bell')), findsOneWidget);
    expect(tester.widget<CubeIcon>(find.byType(CubeIcon)).filled, isTrue);
  });

  testWidgets('Orders tab: each tile opens its screen', (tester) async {
    final c = signedIn(OrdersServer())..screen = AppScreen.orderHub;
    await mount(tester, OrdersTabScreen(c), width: 390);
    await tap(tester, find.byKey(const ValueKey('orders-tile-form')));
    expect(find.byType(OrderFormScreen), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tap(tester, find.byKey(const ValueKey('orders-tile-upload')));
    expect(find.byType(OrderUploadScreen), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tap(tester, find.byKey(const ValueKey('orders-tile-my-orders')));
    expect(c.screen, AppScreen.orders);
    // Back from My orders comes home to the Orders tab.
    c.back();
    expect(c.screen, AppScreen.orderHub);
  });

  testWidgets('Orders tab: a guest is asked to sign in before ordering; My orders still opens', (tester) async {
    final server = OrdersServer();
    final c = AppController(store: FakeStore(), api: ApiClient(client: server.client, baseUrl: 'https://test.example'))
      ..screen = AppScreen.orderHub;
    await mount(tester, OrdersTabScreen(c), width: 390);
    expect(find.byKey(const Key('notification-bell')), findsNothing);
    await tap(tester, find.byKey(const ValueKey('orders-tile-upload')));
    expect(find.byType(OrderUploadScreen), findsNothing);
    expect(c.screen, AppScreen.auth);
    c.screen = AppScreen.orderHub;
    await tester.pumpAndSettle();
    await tap(tester, find.byKey(const ValueKey('orders-tile-form')));
    expect(find.byType(OrderFormScreen), findsNothing);
    expect(c.screen, AppScreen.auth);
    expect(server.requests.where((r) => r.url.path.contains('order')), isEmpty);
    // My orders shows its own "Sign in" message.
    c.screen = AppScreen.orderHub;
    await tester.pumpAndSettle();
    await tap(tester, find.byKey(const ValueKey('orders-tile-my-orders')));
    expect(c.screen, AppScreen.orders);
  });

  for (final width in [360.0, 390.0, 430.0, 768.0]) {
    testWidgets('Orders tab fits a $width px screen (no overflow)', (tester) async {
      final c = signedIn(OrdersServer())..screen = AppScreen.orderHub;
      await _phone(tester, OrdersTabScreen(c), width, width > 500 ? 1024 : 780);
      expect(tester.takeException(), isNull);
      await tester.drag(find.byType(Scrollable).first, const Offset(0, -900));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Need help? 3DEEZI Assist'), findsOneWidget);
    });
  }

  testWidgets('Assets: opened from Projects and Profile, with a way back', (tester) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.projects;
    await _phone(tester, ListenableBuilder(
      listenable: c,
      builder: (_, _) => switch (c.screen) {
        AppScreen.projects => ProjectsScreen(c),
        AppScreen.assets => AssetsScreen(c),
        AppScreen.profile => ProfileScreen(c),
        _ => Text('screen ${c.screen.name}'),
      },
    ), 360);
    await tester.tap(find.byKey(const ValueKey('projects-assets')));
    await tester.pumpAndSettle();
    expect(c.screen, AppScreen.assets);
    expect(find.text('Logos'), findsOneWidget);
    // Assets keeps the bar, with Projects on.
    expect(find.byKey(const ValueKey('nav-projects')), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(c.screen, AppScreen.projects);
    c.go(AppScreen.profile);
    await tester.pumpAndSettle();
    await tap(tester, find.text('Asset library'));
    expect(c.screen, AppScreen.assets);
    c.go(AppScreen.profile);
    await tester.pumpAndSettle();
    await tap(tester, find.widgetWithText(ListTile, 'Orders'));
    expect(c.screen, AppScreen.orderHub);
  });

  testWidgets('Orders tab: its own Assist link, so the round launcher shows only while the chat is open', (tester) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.orderHub;
    final a = AssistController(c);
    addTearDown(a.dispose);
    await _phone(tester, Stack(children: [OrdersTabScreen(c), AssistOverlay(a)]), 390);
    expect(find.byKey(const ValueKey('assist-launcher')), findsNothing);
    await tap(tester, find.byKey(const ValueKey('orders-assist-link')));
    expect(a.open, isTrue);
    expect(find.byKey(const ValueKey('assist-launcher')), findsOneWidget);
    a.minimise();
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('assist-launcher')), findsNothing);
    // Elsewhere (My orders) the launcher is back.
    c.go(AppScreen.orders);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('assist-launcher')), findsOneWidget);
  });

  testWidgets('order detail of an uploaded order form (sizes and stages sent as empty lists) opens, not a grey screen', (tester) async {
    // As the website sent it for an Upload Your Order before 3DEEZI read the form (iso server, 2026-10-23).
    const upload =
        '{"id":9,"number":"3DZ-00009","status":"pending","sizes":[],"quantity":0,"currency":"AUD","contact_name":"M2 Orders Tester","team_name":"M2 Upload FC","items":[],"needed_by":"2026-11-20","approval":"waiting","name":"M2 Upload FC","stage":"received","stage_label":"Order Received","sub_status":{"key":"received","label":"Order received","tone":"blue"},"garments":[],"submitted_at":"2026-10-23T05:45:41+00:00","latest_update":{"kind":"submitted","text":"Order received with your uploaded order form","message":null,"at":"2026-10-23T05:45:41+00:00"},"tracking":null,"action":null,"files_count":1,"payment":{"invoice_id":5,"invoice_number":null,"status":"quote_required","label":"Quote required","tone":"amber","currency":"AUD","total":null,"amount_paid":"0.00","amount_due":null,"can_pay":false},"link":"/orders/9","project":null,"files":[{"id":3,"kind":"order_form","visibility":"customer","name":"test-order-form.pdf","extension":"pdf","mime_type":"application/pdf","size":661,"thumb":null,"download":"/order-files/3"}],"proof":null,"proofs":[],"stages_reached":[],"updates":[{"id":17,"kind":"submitted","text":"Order received with your uploaded order form","message":null,"author":"customer","created_at":"2026-10-23T05:45:41+00:00"}]}';
    final client = MockClient((r) async => r.url.path.endsWith('/orders/9')
        ? http.Response('{"data":$upload}', 200, headers: {'content-type': 'application/json'})
        : http.Response('{"data":{"unread":0,"items":[]}}', 200, headers: {'content-type': 'application/json'}));
    final c = AppController(store: FakeStore(), api: ApiClient(client: client, baseUrl: 'https://test.example'))
      ..user = const ApiUser(id: 1, name: 'M2', email: 'm2@example.test');
    c.api.token = 'tok';
    await mount(tester, OrderDetailScreen(c, 9), width: 390);
    expect(tester.takeException(), isNull);
    expect(find.text('M2 Upload FC'), findsWidgets);
    expect(find.text('Quote required'), findsWidgets);
    expect(find.text('test-order-form.pdf'), findsOneWidget);
    expect(find.text('PAY NOW'), findsNothing);
  });

  testWidgets('Assist links /orders/new and /orders/upload open the Orders tab\'s form and upload screens', (tester) async {
    final c = signedIn(OrdersServer())..screen = AppScreen.projects;
    final a = AssistController(c);
    addTearDown(a.dispose);
    addTearDown(() => AssistController.orderEntry.value = null);
    expect(AssistController.isPage('/orders/new'), isTrue);
    expect(AssistController.isPage('/orders/upload'), isTrue);
    await _phone(tester, ListenableBuilder(
      listenable: c,
      builder: (_, _) => c.screen == AppScreen.orderHub ? OrdersTabScreen(c) : Text('screen ${c.screen.name}'),
    ), 390);
    // From another screen: the tab opens, then the form on top.
    a.openPath('/orders/new');
    await tester.pumpAndSettle();
    expect(c.screen, AppScreen.orderHub);
    expect(find.byType(OrderFormScreen), findsOneWidget);
    expect(AssistController.orderEntry.value, isNull);
    await tester.pageBack();
    await tester.pumpAndSettle();
    // Already on the tab: the upload screen opens at once.
    a.openPath('/orders/upload');
    await tester.pumpAndSettle();
    expect(find.byType(OrderUploadScreen), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    // A guest is asked to sign in.
    c.user = null;
    a.openPath('/orders/new');
    await tester.pumpAndSettle();
    expect(find.byType(OrderFormScreen), findsNothing);
    expect(c.screen, AppScreen.auth);
  });

  test('Assist: the website\'s Orders page is the Orders tab', () {
    final c = AppController(store: FakeStore());
    final a = AssistController(c);
    addTearDown(a.dispose);
    expect(AssistController.pathOf(AppScreen.orderHub), '/order-now');
    a.openPath('/order-now');
    expect(c.screen, AppScreen.orderHub);
    a.openPath('/orders');
    expect(c.screen, AppScreen.orders);
    a.openPath('/assets');
    expect(c.screen, AppScreen.assets);
  });
}
