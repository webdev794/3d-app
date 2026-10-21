import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/create_home.dart';
import 'package:three_deezi/screens/library.dart' show ProfileScreen;
import 'package:three_deezi/screens/order_entry.dart' show openPayPage;
import 'package:three_deezi/screens/orders_board.dart';
import 'package:three_deezi/screens/team.dart';

import 'features_test.dart' show FakeStore;

/// A small copy of T1's 3DEEZI TEAM API (team-api.md v1).
class TeamServer {
  TeamServer({this.paid = false});
  final bool paid;
  final requests = <http.Request>[];
  final posted = <String, String>{};
  var status = 'review';
  // Client answers 2026-10-21: revisions used up (an extra round), a round waiting for payment, due date, refund mark.
  var noRevisionsLeft = false;
  var pendingExtra = false;
  String? due;
  String? refund;

  static const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  Map<String, dynamic> file(int id, String name, String kind) => {
    'id': id, 'kind': kind, 'name': name, 'extension': name.split('.').last, 'size': 100, 'mime_type': 'image/png',
    'is_image': name.endsWith('.png'), 'thumb': name.endsWith('.png') ? 'data:image/png;base64,$png' : null,
    'version': null, 'visibility': 'customer', 'url': '/api/v1/team/files/$id', 'created_at': '2026-10-21T09:00:00Z',
  };
  Map<String, dynamic> request(int id, String s) {
    const labels = {'awaiting_payment': 'Awaiting payment', 'received': 'Request received', 'in_progress': 'Design in progress', 'review': 'Ready for review', 'revision': 'Revisions requested', 'approved': 'Final: approved'};
    const stages = {'awaiting_payment': -1, 'received': 0, 'in_progress': 2, 'review': 3, 'revision': 3, 'approved': 4};
    return {
      'id': id, 'number': 'TEAM-${1000 + id}', 'status': s, 'status_label': labels[s], 'stage_index': stages[s],
      'name': 'Northside Hawks', 'email': 'pat@example.test', 'sport': 'rugby-league', 'sport_name': 'Rugby League',
      'garment': 'jersey', 'garment_name': 'Jersey', 'description': 'Black and teal with a tribal pattern', 'colours': ['#12e1f0'],
      'instructions': null, 'billing': paid ? 'paid' : 'included', 'price': paid ? '99.00' : '0.00', 'currency': 'AUD',
      'invoice': paid && s == 'awaiting_payment' ? {'invoice_number': 'INV-2042', 'total': '108.90', 'amount_due': '108.90', 'pay_url': '/invoices/INV-2042', 'can_pay': true} : null,
      'designer': {'id': 7, 'name': 'Sam'}, 'revisions_used': noRevisionsLeft ? 3 : 1, 'revisions_allowed': 3, 'due_date': due, 'latest_version': 2,
      'refund_status': refund, 'extra_revision_price': {'price': '25.00', 'tax': '2.27', 'currency': 'AUD', 'tax_included': true, 'tax_name': 'GST'},
      'pending_revision': pendingExtra ? {'invoice': {'invoice_number': 'INV-2050', 'total': '25.00', 'amount_due': '25.00', 'pay_url': '/invoices/INV-2050', 'can_pay': true}} : null,
      'files': [file(1, 'hawk.png', 'logo')],
      'deliveries': [
        {'version': 2, 'created_at': '2026-10-21T10:00:00Z', 'note': 'Thinner stripes', 'files': [file(11, 'front-v2.png', 'artwork')]},
        {'version': 1, 'created_at': '2026-10-20T10:00:00Z', 'note': null, 'files': [file(10, 'front-v1.png', 'artwork')]},
      ],
      'messages': [
        {'id': 1, 'body': 'Hi, I am Sam, your designer.', 'role': 'designer', 'author': {'id': 7, 'name': 'Sam'}, 'files': [], 'created_at': '2026-10-20T08:00:00Z'},
      ],
      'history': [],
      'final': s == 'approved' ? {'version': 2, 'files': [file(11, 'front-v2.png', 'artwork')], 'assets': [{'id': 55, 'name': 'TEAM', 'url': '/api/v1/assets/55/file'}], 'studio_asset_id': 55, 'approved_at': '2026-10-21T11:00:00Z'} : null,
      'can': {'message': true, 'approve': s == 'review', 'revise': s == 'review' && !noRevisionsLeft, 'cancel': s == 'received', 'pay': s == 'awaiting_payment', 'to_studio': s == 'approved', 'order': s == 'approved',
        'extra_revision': s == 'review' && noRevisionsLeft && !pendingExtra, 'pay_revision': pendingExtra},
      'unread': 1, 'created_at': '2026-10-19T08:00:00Z',
    };
  }

  late final client = MockClient((r) async {
    requests.add(r);
    final path = r.url.path.replaceFirst('/api/v1', '');
    http.Response ok(Object data, [int code = 200]) =>
        http.Response.bytes(utf8.encode(jsonEncode({'data': data})), code, headers: {'content-type': 'application/json; charset=utf-8'});
    if (r.headers['Authorization'] != 'Bearer tok') return http.Response('{"message":"Unauthenticated."}', 401);
    if (path == '/catalog') {
      return ok({
        'sports': [
          {'id': 'rugby-league', 'name': 'Rugby League', 'group': 'sports', 'garments': ['jersey', 'shorts']},
          {'id': 'pickleball', 'name': 'Pickleball', 'group': 'sports', 'garments': ['tee']},
          {'id': 'streetwear', 'name': 'Streetwear', 'group': 'apparel', 'garments': ['hoodie']},
        ],
        'garments': [{'id': 'jersey', 'name': 'Jersey'}, {'id': 'shorts', 'name': 'Shorts'}, {'id': 'tee', 'name': 'Training Tee'}, {'id': 'hoodie', 'name': 'Hoodie'}],
      });
    }
    if (path == '/team/allowance') {
      return ok({
        'plan': paid ? 'free' : 'premium', 'plan_name': paid ? 'Free / Entry' : 'Premium', 'included_per_month': paid ? 0 : 2, 'remaining_included': paid ? 0 : 1,
        'unlimited': false, 'bonus_remaining': 0, 'revisions_per_request': 3, 'can_submit': true, 'blocked_reason': null,
        'next_request': paid ? {'billing': 'paid', 'price': '99.00', 'tax': '9.90', 'total': '108.90', 'currency': 'AUD', 'pay_first': true} : {'billing': 'included', 'price': '0.00', 'tax': '0.00', 'total': '0.00', 'currency': 'AUD', 'pay_first': true},
      });
    }
    if (path == '/team/requests' && r.method == 'GET') return ok([request(3, status)]);
    if (path == '/team/requests' && r.method == 'POST') {
      posted['create'] = latin1.decode(r.bodyBytes);
      return ok(request(9, paid ? 'awaiting_payment' : 'received'), 201);
    }
    if (path == '/team/requests/3' || path == '/team/requests/9') return ok(request(int.parse(path.split('/').last), path.endsWith('9') ? (paid ? 'awaiting_payment' : 'received') : status));
    if (path.startsWith('/team/files/') || path == '/assets/55/file') return http.Response.bytes(base64Decode(png), 200, headers: {'content-type': 'image/png'});
    if (path == '/team/requests/3/messages') {
      posted['message'] = latin1.decode(r.bodyBytes);
      return ok({'id': 2, 'body': 'Love it', 'role': 'customer', 'author': {'id': 1, 'name': 'Pat'}, 'files': [], 'created_at': '2026-10-21T12:00:00Z'}, 201);
    }
    if (path == '/team/requests/3/revisions') {
      posted['revise'] = latin1.decode(r.bodyBytes);
      // An extra round waits for its invoice; an included one starts.
      if (posted['revise']!.contains('name="extra"')) {
        pendingExtra = true;
      } else {
        status = 'revision';
      }
      return ok(request(3, status));
    }
    if (path == '/team/requests/3/approve') {
      posted['approve'] = r.body;
      status = 'approved';
      return ok(request(3, status));
    }
    if (path == '/notifications') {
      return ok({'unread': 1, 'items': [
        {'id': 'n1', 'type': 'TeamRequestNotification', 'data': {'team_request_id': 3, 'order_id': null, 'number': 'TEAM-1003', 'name': 'Northside Hawks', 'kind': 'review', 'text': 'Your design is ready for review', 'link': '/team/requests/3'}, 'read_at': null, 'created_at': '2026-10-21T10:00:00Z'},
      ]});
    }
    if (path == '/orders/board') return ok({'counts': {'current': 0, 'completed': 0}, 'cancelled': [], 'drafts': [], 'stages': []});
    if (path == '/invoices/INV-2042/link') return ok({'url': 'https://test.example/invoices/INV-2042?key=abc'});
    if (path == '/invoices/INV-2050/link') return ok({'url': 'https://test.example/invoices/INV-2050?key=xyz'});
    return http.Response('{"message":"Not found."}', 404);
  });
}

AppController signedIn(TeamServer server) {
  final c = AppController(store: FakeStore(), api: ApiClient(client: server.client, baseUrl: 'https://test.example'));
  c.user = const ApiUser(id: 1, name: 'Pat Tester', email: 'pat@example.test');
  c.api.token = 'tok';
  return c;
}

Future<void> mount(WidgetTester tester, Widget child, {double width = 420}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 1000);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: child)));
  await tester.pumpAndSettle();
}

Future<void> tap(WidgetTester tester, Finder target) async {
  if (target.evaluate().isEmpty) {
    await tester.scrollUntilVisible(target, 300, scrollable: find.byType(Scrollable).first);
  }
  await tester.ensureVisible(target);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('TEAM screen: heading, how it works, allowance and my design requests', (tester) async {
    final server = TeamServer();
    await mount(tester, TeamScreen(signedIn(server)));
    expect(find.text('3DEEZI TEAM'), findsWidgets);
    expect(find.text('REAL DESIGNERS. REAL RESULTS.'), findsOneWidget);
    expect(find.textContaining('Let our professional design team bring your ideas to life.'), findsOneWidget);
    expect(find.text('REQUEST A DESIGNER'), findsOneWidget);
    expect(find.text('1. Send your brief'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('TEAM-1003'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('YOUR PLAN · PREMIUM'), findsOneWidget);
    expect(find.text('Ready for review'), findsOneWidget);
    // The bell counts the unread TEAM notification.
    expect(find.descendant(of: find.byType(Badge), matching: find.text('1')), findsWidgets);
  });

  testWidgets('TEAM screen signed out: REQUEST A DESIGNER asks to sign in', (tester) async {
    final server = TeamServer();
    final c = AppController(store: FakeStore(), api: ApiClient(client: server.client, baseUrl: 'https://test.example'));
    await mount(tester, TeamScreen(c));
    expect(server.requests, isEmpty);
    await tap(tester, find.text('REQUEST A DESIGNER'));
    expect(c.screen, AppScreen.auth);
  });

  testWidgets('Request form: catalogue sports, colours, uploads, SEND TO 3DEEZI TEAM and the reference', (tester) async {
    final server = TeamServer();
    pickTeamFiles = (kind) async => kind == 'logos'
        ? [(name: 'hawk.png', bytes: base64Decode(TeamServer.png)), (name: 'virus.exe', bytes: Uint8List(4))]
        : [(name: 'brief.pdf', bytes: Uint8List.fromList(utf8.encode('%PDF-1.4')))];
    addTearDown(() => pickTeamFiles = (kind) async => []);
    final c = signedIn(server);
    await mount(tester, TeamRequestFormScreen(c, allowance: {'next_request': {'billing': 'included'}, 'can_submit': true}));
    expect(find.text('Pat Tester'), findsOneWidget);
    // Sports come from the server's catalogue (a sport the app does not know yet).
    await tap(tester, find.byKey(const Key('team-sport')));
    expect(find.text('Pickleball'), findsWidgets);
    await tap(tester, find.text('Rugby League').last);
    await tap(tester, find.byKey(const Key('team-garment')));
    await tap(tester, find.text('Jersey').last);
    await tester.enterText(find.byKey(const Key('team-description')), 'Black and teal jersey with a tribal pattern');
    await tap(tester, find.byKey(const Key('swatch-#12e1f0')));
    await tap(tester, find.text('Add logos'));
    expect(find.text('hawk.png'), findsOneWidget);
    expect(find.textContaining('virus.exe: this file type is not accepted'), findsOneWidget);
    await tap(tester, find.text('Add references'));
    expect(find.text('brief.pdf'), findsOneWidget);
    expect(find.text('This request is included in your plan.'), findsOneWidget);
    await tap(tester, find.text('SEND TO 3DEEZI TEAM'));
    expect(find.text('Your reference: TEAM-1009'), findsOneWidget);
    final body = server.posted['create']!;
    for (final field in ['name="name"', 'name="email"', 'name="sport"', 'name="garment"', 'name="description"', 'name="colours[]"', 'name="logos[]"; filename="hawk.png"', 'name="references[]"; filename="brief.pdf"', 'name="idempotency_key"']) {
      expect(body, contains(field));
    }
    expect(body, contains('rugby-league'));
    expect(body, contains('#12e1f0'));
  });

  testWidgets('Request form, no allowance left: the price, then PAY NOW opens the invoice pay page', (tester) async {
    final server = TeamServer(paid: true);
    String? opened;
    final original = openPayPage;
    openPayPage = (context, url, title) async => opened = url;
    addTearDown(() => openPayPage = original);
    final c = signedIn(server);
    await mount(tester, TeamRequestFormScreen(c, allowance: {'next_request': {'billing': 'paid', 'total': '108.90', 'currency': 'AUD'}, 'can_submit': true}));
    await tap(tester, find.byKey(const Key('team-sport')));
    await tap(tester, find.text('Rugby League').last);
    await tap(tester, find.byKey(const Key('team-garment')));
    await tap(tester, find.text('Jersey').last);
    await tester.enterText(find.byKey(const Key('team-description')), 'Black and teal jersey with a tribal pattern');
    await tester.scrollUntilVisible(find.byKey(const Key('team-price')), 300, scrollable: find.byType(Scrollable).first);
    expect(find.textContaining(r'$108.90'), findsOneWidget);
    await tap(tester, find.text('SEND TO 3DEEZI TEAM'));
    expect(find.text('Your reference: TEAM-1009'), findsOneWidget);
    expect(find.textContaining('Pay invoice INV-2042'), findsOneWidget);
    await tap(tester, find.text('PAY NOW'));
    expect(opened, 'https://test.example/invoices/INV-2042?key=abc');
  });

  testWidgets('Request detail: steps, versions, message, revisions, approve and the final design', (tester) async {
    final server = TeamServer();
    pickTeamFiles = (kind) async => [(name: 'note.png', bytes: base64Decode(TeamServer.png))];
    addTearDown(() => pickTeamFiles = (kind) async => []);
    final c = signedIn(server);
    await mount(tester, TeamRequestScreen(c, 3));
    expect(find.text('TEAM-1003'), findsOneWidget);
    expect(find.text('READY FOR REVIEW'), findsOneWidget);
    expect(find.text('V2'), findsOneWidget);
    expect(find.text('Thinner stripes'), findsOneWidget);
    await tap(tester, find.text('V1'));
    expect(find.text('Thinner stripes'), findsNothing);
    await tap(tester, find.text('V2'));
    // Message the designer.
    await tester.enterText(find.byKey(const Key('team-message')), 'Love it');
    await tap(tester, find.byTooltip('Send'));
    expect(server.posted['message'], contains('Love it'));
    // Request revisions (with a picture).
    await tap(tester, find.text('Request revisions'));
    await tester.enterText(find.byKey(const Key('team-revision')), 'Thinner stripes please');
    await tap(tester, find.text('Add pictures or notes'));
    await tap(tester, find.text('SEND REVISIONS'));
    expect(server.posted['revise'], contains('Thinner stripes please'));
    expect(server.posted['revise'], contains('filename="note.png"'));
    expect(find.text('REVISIONS REQUESTED'), findsOneWidget);
  });

  testWidgets('Approve: the final design with Open in 3D Designer and Order this design', (tester) async {
    final server = TeamServer();
    final c = signedIn(server);
    await mount(tester, TeamRequestScreen(c, 3));
    await tap(tester, find.text('APPROVE V2'));
    await tap(tester, find.text('Approve'));
    expect(server.posted['approve'], contains('"version":2'));
    await tester.drag(find.byType(Scrollable).first, const Offset(0, 3000));
    await tester.pumpAndSettle();
    expect(find.text('OPEN IN 3D DESIGNER'), findsOneWidget);
    expect(find.text('Order this design'), findsOneWidget);
    expect(find.textContaining('saved in your assets'), findsOneWidget);
  });

  testWidgets('Orders bell: a 3DEEZI TEAM notification opens its design request', (tester) async {
    final server = TeamServer();
    final c = signedIn(server);
    await mount(tester, OrdersBoardScreen(c), width: 1000);
    await tap(tester, find.byIcon(Icons.notifications_outlined));
    await tap(tester, find.text('Your design is ready for review'));
    expect(find.byType(TeamRequestScreen), findsOneWidget);
    expect(find.text('TEAM-1003'), findsOneWidget);
  });

  testWidgets('Profile menu lists 3DEEZI TEAM and opens the TEAM screen', (tester) async {
    final server = TeamServer();
    final c = signedIn(server);
    await mount(tester, ProfileScreen(c));
    await tap(tester, find.text('3DEEZI TEAM'));
    expect(find.byType(TeamScreen), findsOneWidget);
  });

  testWidgets('Home: the fourth tile, 3DEEZI TEAM, opens the TEAM screen', (tester) async {
    final server = TeamServer();
    final c = signedIn(server);
    await mount(tester, CreateHomeScreen(c));
    // The other three ways in are still there.
    for (final action in ['CREATE WITH AI', 'OPEN 3D DESIGNER', 'OPEN ARTBOARD']) {
      await tester.scrollUntilVisible(find.text(action), 200, scrollable: find.byType(Scrollable).first);
      expect(find.text(action), findsOneWidget);
    }
    await tap(tester, find.text('GET A DESIGNER'));
    expect(find.byType(TeamScreen), findsOneWidget);
    expect(find.text('REAL DESIGNERS. REAL RESULTS.'), findsOneWidget);
  });

  testWidgets('TEAM screen: the turnaround promise and the prices, revisions and refund policy', (tester) async {
    final c = signedIn(TeamServer());
    await mount(tester, TeamScreen(c));
    expect(find.text('FIRST DESIGN WITHIN 3 BUSINESS DAYS'), findsOneWidget);
    await tester.scrollUntilVisible(find.byKey(const Key('team-policy')), 200, scrollable: find.byType(Scrollable).first);
    final policy = tester.widgetList<RichText>(find.descendant(of: find.byKey(const Key('team-policy')), matching: find.byType(RichText))).map((t) => t.text.toPlainText()).join(' ');
    expect(policy, contains(r'Free A$99, Pro A$79, Premium A$69, Business A$49, all incl. GST'));
    expect(policy, contains(r'Extra revision round A$25.00 incl. GST'));
    expect(policy, contains('Full refund if you cancel before your designer starts.'));
    expect(policy, contains('3 business days'));
  });

  testWidgets('Request detail: revisions used up, EXTRA REVISION A\$25 sends the round and opens PAY NOW', (tester) async {
    final server = TeamServer()..noRevisionsLeft = true;
    String? opened;
    final original = openPayPage;
    openPayPage = (context, url, title) async => opened = url;
    addTearDown(() => openPayPage = original);
    final c = signedIn(server);
    await mount(tester, TeamRequestScreen(c, 3));
    expect(find.text('Request revisions'), findsNothing);
    await tester.scrollUntilVisible(find.textContaining('an extra round is'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.textContaining(r'an extra round is A$25.00 incl. GST'), findsOneWidget);
    await tap(tester, find.byKey(const Key('team-extra-revision')));
    expect(find.textContaining(r'An extra revision round is A$25.00 incl. GST'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('team-revision')), 'One more change please');
    await tap(tester, find.text('SEND AND PAY'));
    expect(server.posted['revise'], contains('name="extra"'));
    expect(server.posted['revise'], contains('One more change please'));
    expect(opened, 'https://test.example/invoices/INV-2050?key=xyz');
    // Back from the pay page: still waiting, with its own PAY NOW.
    await tester.scrollUntilVisible(find.textContaining('Extra revision: invoice INV-2050'), -300, scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('Extra revision: invoice INV-2050'), findsOneWidget);
    opened = null;
    await tester.ensureVisible(find.byKey(const Key('team-pay-revision')));
    await tester.tap(find.byKey(const Key('team-pay-revision')));
    await tester.pumpAndSettle();
    expect(opened, 'https://test.example/invoices/INV-2050?key=xyz');
  });

  testWidgets('Request detail: the due date and the refund status', (tester) async {
    final server = TeamServer()
      ..status = 'in_progress'
      ..due = '2026-10-28'
      ..refund = 'due';
    final c = signedIn(server);
    await mount(tester, TeamRequestScreen(c, 3));
    expect(find.byKey(const Key('team-due')), findsOneWidget);
    expect(find.textContaining('Next design due by 28 Oct'), findsOneWidget);
    expect(find.text('Cancelled before work started: your full refund is being processed.'), findsOneWidget);
  });
}
