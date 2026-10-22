import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/create_home.dart';
import 'package:three_deezi/screens/library.dart';
import 'package:three_deezi/screens/order_entry.dart' show openPayPage;
import 'package:three_deezi/screens/orders_board.dart';
import 'package:three_deezi/screens/team.dart';
import 'package:three_deezi/widgets/notification_bell.dart';

import 'features_test.dart' show FakeStore;

/// GET /notifications and POST /notifications/read, as NotificationController.
class BellServer {
  final requests = <http.Request>[];
  final reads = <Object?>[];
  final now = DateTime.now().toUtc();
  late List<Map<String, dynamic>> items = [
    {'id': 'n3', 'type': 'InvoiceIssued', 'data': {'order_id': null, 'number': null, 'name': null, 'kind': 'invoice', 'text': 'Invoice INV-2050 is ready: A\$25.00 to pay', 'link': '/invoices/INV-2050'}, 'read_at': null, 'created_at': now.subtract(const Duration(minutes: 5)).toIso8601String()},
    {'id': 'n2', 'type': 'TeamRequestNotification', 'data': {'team_request_id': 3, 'order_id': null, 'number': 'TEAM-1003', 'name': 'Northside Hawks', 'kind': 'review', 'text': 'Your design is ready for review', 'link': '/team/requests/3'}, 'read_at': null, 'created_at': now.subtract(const Duration(hours: 3)).toIso8601String()},
    {'id': 'n1', 'type': 'OrderUpdateNotification', 'data': {'order_id': 12, 'number': '3DZ-00012', 'name': 'Hawks kit', 'kind': 'approval', 'text': 'Approval needed', 'link': '/orders/12'}, 'read_at': now.subtract(const Duration(days: 1)).toIso8601String(), 'created_at': now.subtract(const Duration(days: 2)).toIso8601String()},
  ];

  int get gets => requests.where((r) => r.method == 'GET' && r.url.path.endsWith('/notifications')).length;

  late final client = MockClient((r) async {
    requests.add(r);
    final path = r.url.path.replaceFirst('/api/v1', '');
    http.Response ok(Object data) =>
        http.Response.bytes(utf8.encode(jsonEncode({'data': data})), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    if (path == '/notifications') return ok({'unread': items.where((i) => i['read_at'] == null).length, 'items': items});
    if (path == '/notifications/read') {
      final body = jsonDecode(r.body) as Map;
      reads.add(body['ids']);
      final ids = (body['ids'] as List?)?.cast<String>();
      items = [for (final i in items) (ids == null || ids.contains(i['id'])) ? {...i, 'read_at': i['read_at'] ?? now.toIso8601String()} : i];
      return ok({'unread': items.where((i) => i['read_at'] == null).length});
    }
    if (path == '/invoices/INV-2050/link') return ok({'url': 'https://test.example/invoices/INV-2050?key=xyz'});
    if (path == '/orders/board') return ok({'counts': {'current': 0, 'completed': 0}, 'cancelled': [], 'drafts': [], 'stages': []});
    return http.Response('{"message":"Not found."}', 404);
  });
}

AppController signedIn(BellServer server) {
  final c = AppController(store: FakeStore(), api: ApiClient(client: server.client, baseUrl: 'https://test.example'));
  c.api.token = 'tok';
  c.user = const ApiUser(id: 1, name: 'Pat Tester', email: 'pat@example.test');
  return c;
}

Future<void> mount(WidgetTester tester, Widget child) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(420, 1000);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: child)));
  await tester.pumpAndSettle();
}

Finder badge(String n) => find.descendant(of: find.byKey(const Key('notification-bell')), matching: find.text(n));

void main() {
  test('time ago and titles as the website bell', () {
    final now = DateTime.utc(2026, 10, 22, 12);
    expect(notificationAgo('2026-10-22T11:59:30Z', now: now), 'just now');
    expect(notificationAgo('2026-10-22T11:55:00Z', now: now), '5 min ago');
    expect(notificationAgo('2026-10-22T09:00:00Z', now: now), '3 h ago');
    expect(notificationAgo('2026-10-20T12:00:00Z', now: now), '2 d ago');
    expect(notificationAgo(null, now: now), '');
    expect(notificationTitle({'data': {'title': 'Hi'}}), 'Hi');
    expect(notificationTitle({'data': {'number': '3DZ-00012', 'name': 'Hawks kit'}}), '3DZ-00012 · Hawks kit');
    expect(notificationTitle({'data': {}}), 'Notification');
  });

  testWidgets('the main screens show the bell signed in, not signed out', (tester) async {
    final server = BellServer();
    final c = signedIn(server);
    for (final screen in <Widget>[CreateHomeScreen(c), ProjectsScreen(c), AssetsScreen(c), ProfileScreen(c)]) {
      await mount(tester, screen);
      expect(find.byKey(const Key('notification-bell')), findsOneWidget, reason: '${screen.runtimeType}');
      expect(badge('2'), findsOneWidget, reason: '${screen.runtimeType}');
    }
    final guest = AppController(store: FakeStore(), api: ApiClient(client: BellServer().client, baseUrl: 'https://test.example'));
    await mount(tester, ProfileScreen(guest));
    expect(find.byKey(const Key('notification-bell')), findsNothing);
  });

  testWidgets('the sheet lists newest first, marks them read and an order opens', (tester) async {
    final server = BellServer();
    final c = signedIn(server);
    await mount(tester, ProfileScreen(c));
    await tester.tap(find.byKey(const Key('notification-bell')));
    await tester.pumpAndSettle();
    // Newest first: title, text, time ago.
    final invoice = tester.getTopLeft(find.text('Invoice INV-2050 is ready: A\$25.00 to pay')).dy;
    final team = tester.getTopLeft(find.text('TEAM-1003 · Northside Hawks')).dy;
    final order = tester.getTopLeft(find.text('3DZ-00012 · Hawks kit')).dy;
    expect(invoice < team && team < order, isTrue);
    expect(find.text('Your design is ready for review'), findsOneWidget);
    expect(find.text('5 min ago'), findsOneWidget);
    expect(find.text('3 h ago'), findsOneWidget);
    expect(find.text('2 d ago'), findsOneWidget);
    // Opening marks all read (as the website: no ids); the badge goes.
    expect(server.reads, [null]);
    expect(badge('2'), findsNothing);
    await tester.tap(find.text('3DZ-00012 · Hawks kit'));
    await tester.pumpAndSettle();
    expect(find.byType(OrderDetailScreen), findsOneWidget);
  });

  testWidgets('a 3DEEZI TEAM notification opens its request; an invoice opens its pay page', (tester) async {
    final server = BellServer();
    final c = signedIn(server);
    final opened = <String>[];
    final original = openPayPage;
    openPayPage = (context, url, title) async => opened.add(url);
    addTearDown(() => openPayPage = original);
    await mount(tester, CreateHomeScreen(c));
    await tester.tap(find.byKey(const Key('notification-bell')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Your design is ready for review'));
    await tester.pumpAndSettle();
    expect(find.byType(TeamRequestScreen), findsOneWidget);
    Navigator.of(tester.element(find.byType(TeamRequestScreen))).pop();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('notification-bell')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Invoice INV-2050 is ready: A\$25.00 to pay'));
    await tester.pumpAndSettle();
    expect(opened, ['https://test.example/invoices/INV-2050?key=xyz']);
  });

  testWidgets('the TEAM bell counts and marks only TEAM notifications; the orders bell shows all', (tester) async {
    final server = BellServer();
    final c = signedIn(server);
    await mount(tester, TeamScreen(c));
    expect(badge('1'), findsOneWidget);
    await tester.tap(find.byKey(const Key('notification-bell')));
    await tester.pumpAndSettle();
    expect(find.text('3DEEZI TEAM notifications'), findsOneWidget);
    expect(find.text('3DZ-00012 · Hawks kit'), findsNothing);
    expect(server.reads, [
      ['n2'],
    ]);
    Navigator.of(tester.element(find.text('3DEEZI TEAM notifications'))).pop();
    await tester.pumpAndSettle();
    await mount(tester, OrdersBoardScreen(c));
    // The invoice is still unread for the orders bell.
    expect(badge('1'), findsOneWidget);
    await tester.tap(find.byKey(const Key('notification-bell')));
    await tester.pumpAndSettle();
    expect(find.text('3DZ-00012 · Hawks kit'), findsOneWidget);
    expect(find.text('TEAM-1003 · Northside Hawks'), findsOneWidget);
    // Closing the sheet reloads the board, reading the list once (not twice).
    final gets = server.gets;
    final boards = server.requests.where((r) => r.url.path.endsWith('/orders/board')).length;
    Navigator.of(tester.element(find.text('Notifications').last)).pop();
    await tester.pumpAndSettle();
    expect(server.requests.where((r) => r.url.path.endsWith('/orders/board')).length, boards + 1);
    expect(server.gets, gets + 1);
  });

  testWidgets('the app polls once a minute while signed in, and stops', (tester) async {
    final server = BellServer();
    final c = signedIn(server);
    final feed = NotificationFeed.of(c);
    feed.startPolling();
    await tester.pump();
    expect(server.gets, 1);
    await tester.pump(const Duration(seconds: 59));
    expect(server.gets, 1);
    await tester.pump(const Duration(seconds: 1));
    expect(server.gets, 2);
    expect(feed.unread, 2);
    // Signed out: nothing is polled and the list is cleared.
    c.user = null;
    // ignore: invalid_use_of_protected_member, invalid_use_of_visible_for_testing_member
    c.notifyListeners();
    await tester.pump(const Duration(minutes: 1));
    expect(server.gets, 2);
    expect(feed.unread, 0);
    feed.stopPolling();
  });

  testWidgets('the badge caps at 99+', (tester) async {
    final server = BellServer();
    server.items = [
      for (var i = 0; i < 150; i++)
        {'id': 'm$i', 'type': 'OrderUpdateNotification', 'data': {'order_id': 12, 'number': '3DZ-00012', 'name': 'Hawks kit', 'text': 'Update $i', 'link': '/orders/12'}, 'read_at': null, 'created_at': server.now.toIso8601String()},
    ];
    await mount(tester, ProfileScreen(signedIn(server)));
    expect(badge('99+'), findsOneWidget);
    expect(find.byTooltip('Notifications, 150 unread'), findsOneWidget);
  });

  testWidgets('sign-out empties the bell; another account sees only its own list', (tester) async {
    // Each token has its own list; the first account's answer can arrive late.
    final gate = Completer<void>();
    var holdA = false;
    final client = MockClient((r) async {
      http.Response ok(Object data) =>
          http.Response.bytes(utf8.encode(jsonEncode({'data': data})), 200, headers: {'content-type': 'application/json; charset=utf-8'});
      final a = r.headers['Authorization'] == 'Bearer tokA';
      if (a && holdA) await gate.future;
      return ok({'unread': 1, 'items': [
        {'id': a ? 'a1' : 'b1', 'type': 'TeamRequestNotification', 'data': {'team_request_id': a ? 3 : 4, 'number': a ? 'TEAM-1003' : 'TEAM-1004', 'name': a ? 'Alpha' : 'Bravo', 'text': a ? 'For account A' : 'For account B'}, 'read_at': null, 'created_at': DateTime.now().toUtc().toIso8601String()},
      ]});
    });
    final c = AppController(store: FakeStore(), api: ApiClient(client: client, baseUrl: 'https://test.example'));
    c.api.token = 'tokA';
    c.user = const ApiUser(id: 1, name: 'A', email: 'a@example.test');
    final feed = NotificationFeed.of(c);
    await mount(tester, ProfileScreen(c));
    expect(feed.items.single['id'], 'a1');
    // Sign out: the bell empties and hides.
    c.user = null;
    // ignore: invalid_use_of_protected_member, invalid_use_of_visible_for_testing_member
    c.notifyListeners();
    await tester.pump();
    expect(feed.items, isEmpty);
    expect(feed.unread, 0);
    expect(find.byKey(const Key('notification-bell')), findsNothing);
    // A's reading is still on its way when B signs in: B's list wins.
    c.api.token = 'tokA';
    c.user = const ApiUser(id: 1, name: 'A', email: 'a@example.test');
    holdA = true;
    // ignore: invalid_use_of_protected_member, invalid_use_of_visible_for_testing_member
    c.notifyListeners();
    c.api.token = 'tokB';
    c.user = const ApiUser(id: 2, name: 'B', email: 'b@example.test');
    // ignore: invalid_use_of_protected_member, invalid_use_of_visible_for_testing_member
    c.notifyListeners();
    await tester.pumpAndSettle();
    expect(feed.items.single['id'], 'b1');
    gate.complete();
    await tester.pumpAndSettle();
    expect(feed.items.single['id'], 'b1');
    await tester.tap(find.byKey(const Key('notification-bell')));
    await tester.pumpAndSettle();
    expect(find.text('For account B'), findsOneWidget);
    expect(find.text('For account A'), findsNothing);
  });
}
