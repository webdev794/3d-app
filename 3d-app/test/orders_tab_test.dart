import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/assist.dart';
import 'package:three_deezi/screens/library.dart';
import 'package:three_deezi/screens/order_assistant.dart';
import 'package:three_deezi/screens/order_entry.dart';
import 'package:three_deezi/screens/suppliers.dart' show SuppliersScreen;
import 'package:three_deezi/screens/orders_board.dart' show OrderDetailScreen, OrderBoardCard, orderCardLine, orderPayable;
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

  testWidgets('Orders tab: the Order Assistant is the tab itself (client 454), no back arrow, tab bar with Orders on', (tester) async {
    final c = signedIn(OrdersServer())..screen = AppScreen.orderHub;
    await _phone(tester, OrderAssistantScreen(c, root: true), 390);
    expect(find.byKey(const ValueKey('assistant-title')), findsOneWidget);
    expect(find.text('CREATE ORDER FORM'), findsOneWidget);
    expect(find.byKey(const ValueKey('assistant-back')), findsNothing);
    expect(find.byKey(const ValueKey('nav-orders')), findsOneWidget);
    expect(tester.widget<CubeIcon>(find.byType(CubeIcon)).filled, isTrue);
    // Client 456: the prompt bar and Powered by / Switch to Manual Form in one inner glass panel.
    final panel = find.byKey(const ValueKey('assistant-panel'));
    for (final k in ['assistant-text', 'assistant-send', 'assistant-manual']) {
      expect(find.descendant(of: panel, matching: find.byKey(ValueKey(k))), findsOneWidget, reason: k);
    }
  });

  testWidgets('Orders tab "…" menu: My orders first, Make with 3DEEZI / Mantis, Rewards', (tester) async {
    final c = signedIn(OrdersServer())..screen = AppScreen.orderHub;
    await mount(tester, OrderAssistantScreen(c, root: true), width: 390);
    await tap(tester, find.byKey(const ValueKey('assistant-menu')));
    final items = ['assistant-my-orders', 'assistant-make-3deezi', 'assistant-make-mantis', 'assistant-rewards'];
    for (final k in items) {
      expect(find.byKey(ValueKey(k)), findsOneWidget, reason: k);
    }
    expect(tester.getTopLeft(find.byKey(const ValueKey('assistant-my-orders'))).dy,
        lessThan(tester.getTopLeft(find.byKey(const ValueKey('assistant-make-3deezi'))).dy));
    await tap(tester, find.byKey(const ValueKey('assistant-make-mantis')));
    expect(tester.state<State>(find.byType(OrderAssistantScreen)).toString(), isNotEmpty);
    await tap(tester, find.byKey(const ValueKey('assistant-menu')));
    await tap(tester, find.byKey(const ValueKey('assistant-my-orders')));
    expect(c.screen, AppScreen.orders);
    // Back from My orders comes home to the Orders tab.
    c.back();
    expect(c.screen, AppScreen.orderHub);
  });

  testWidgets('Suppliers (QA9): Orders "…" > Preferred suppliers opens the suppliers page', (tester) async {
    final c = signedIn(OrdersServer())..screen = AppScreen.orderHub;
    await mount(tester, OrderAssistantScreen(c, root: true), width: 390);
    await tap(tester, find.byKey(const ValueKey('assistant-menu')));
    expect(find.text('Preferred suppliers'), findsOneWidget);
    await tap(tester, find.byKey(const ValueKey('assistant-suppliers')));
    expect(find.byType(SuppliersScreen), findsOneWidget);
  });

  testWidgets('Orders tab: Switch to Manual Form opens the form on top, and back returns to the tab', (tester) async {
    final c = signedIn(OrdersServer())..screen = AppScreen.orderHub;
    await mount(tester, OrderAssistantScreen(c, root: true), width: 390);
    await tap(tester, find.byKey(const ValueKey('assistant-manual')));
    expect(find.byType(OrderFormScreen), findsOneWidget);
    await tap(tester, find.byKey(const ValueKey('bubble-back')));
    expect(find.byKey(const ValueKey('assistant-title')), findsOneWidget);
  });

  // QA8 #9: My orders cards read as the website's, with PAY NOW on an unpaid order.
  testWidgets('My orders card: "5 garments · required 20 Mar" and PAY NOW on an unpaid order', (tester) async {
    var paid = 0;
    final o = <String, dynamic>{
      'id': 4, 'number': '3DZ-00004', 'name': 'Tigers', 'quantity': 5, 'needed_by': '2027-03-20',
      'stage': 'review', 'stage_label': 'In review', 'sub_status': {'label': 'In review', 'tone': 'blue'},
      'garments': [{'garment': 'jersey', 'name': 'Jersey'}],
      'payment': {'status': 'awaiting_payment', 'label': 'Awaiting payment', 'tone': 'amber', 'can_pay': true, 'invoice_number': 'INV-1'},
    };
    await _phone(tester, SingleChildScrollView(child: OrderBoardCard(o, onTap: () {}, onPay: () => paid++)), 360, 780);
    expect(find.text('5 garments · required 20 Mar'), findsOneWidget);
    expect(find.text('PAY NOW →'), findsOneWidget);
    expect(find.text('View progress →'), findsNothing);
    await tester.tap(find.byKey(const Key('order-card-pay')));
    expect(paid, 1);
    expect(tester.takeException(), isNull);
    expect(orderCardLine({'quantity': 1, 'garments': [{'garment': 'marquee'}]}), '1 marquee');
    expect(orderPayable({'status': 'paid', 'can_pay': false, 'invoice_number': 'INV-1'}), isFalse);
  });

  // QA8 #1: Home in the tab bar from the Create Order Form did nothing.
  for (final tab in ['home', 'projects', 'profile']) {
    testWidgets('Create Order Form (from Switch to Manual Form): $tab in the tab bar leaves the form', (tester) async {
      final c = signedIn(OrdersServer())..screen = AppScreen.orderHub;
      await mount(tester, ListenableBuilder(
        listenable: c,
        builder: (_, _) => c.screen == AppScreen.orderHub
            ? OrderAssistantScreen(c, root: true)
            : Text('screen ${c.screen.name}'),
      ), width: 390);
      await tap(tester, find.byKey(const ValueKey('assistant-manual')));
      expect(find.byType(OrderFormScreen), findsOneWidget);
      await tester.tap(find.byKey(ValueKey('nav-$tab')).last);
      await tester.pumpAndSettle();
      expect(find.byType(OrderFormScreen), findsNothing, reason: tab);
      expect(c.screen.name, tab == 'home' ? 'home' : tab);
    });
  }

  for (final width in [360.0, 390.0, 430.0, 768.0]) {
    testWidgets('Orders tab fits a $width px screen (no overflow)', (tester) async {
      final c = signedIn(OrdersServer())..screen = AppScreen.orderHub;
      await _phone(tester, OrderAssistantScreen(c, root: true), width, width > 500 ? 1024 : 780);
      expect(tester.takeException(), isNull);
      expect(find.byKey(const ValueKey('assistant-manual')), findsOneWidget);
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
    await tester.tap(find.byKey(const ValueKey('assets-back')));
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

  testWidgets('Orders tab: the "?" opens 3DEEZI Assist', (tester) async {
    final c = AppController(store: FakeStore())..screen = AppScreen.orderHub;
    final a = AssistController(c);
    addTearDown(a.dispose);
    await _phone(tester, Stack(children: [OrderAssistantScreen(c, root: true), AssistOverlay(a)]), 390);
    await tap(tester, find.byKey(const ValueKey('assistant-help')));
    expect(a.open, isTrue);
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

  testWidgets('Assist links /orders/new and /orders/upload open the Order Assistant', (tester) async {
    final c = signedIn(OrdersServer())..screen = AppScreen.projects;
    final a = AssistController(c);
    addTearDown(a.dispose);
    addTearDown(() => AssistController.orderEntry.value = null);
    expect(AssistController.isPage('/orders/new'), isTrue);
    expect(AssistController.isPage('/orders/upload'), isTrue);
    await _phone(tester, ListenableBuilder(
      listenable: c,
      builder: (_, _) => c.screen == AppScreen.orderHub ? OrderAssistantScreen(c, root: true) : Text('screen ${c.screen.name}'),
    ), 390);
    // From another screen: the tab opens, then the form on top.
    a.openPath('/orders/new');
    await tester.pumpAndSettle();
    expect(c.screen, AppScreen.orderHub);
    expect(find.byType(OrderAssistantScreen), findsOneWidget);
    expect(AssistController.orderEntry.value, isNull);
    // Already on the tab: it stays on the Order Assistant.
    a.openPath('/orders/upload');
    await tester.pumpAndSettle();
    expect(find.byType(OrderAssistantScreen), findsOneWidget);
    expect(AssistController.orderEntry.value, isNull);
    // /orders is My orders.
    a.openPath('/orders');
    await tester.pumpAndSettle();
    expect(c.screen, AppScreen.orders);
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
