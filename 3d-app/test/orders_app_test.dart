import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/ai_designer.dart';
import 'package:three_deezi/screens/order_entry.dart';
import 'package:three_deezi/screens/orders_board.dart';

import 'features_test.dart' show FakeStore;

/// A small copy of the website's 3DEEZI Orders API.
class OrdersServer {
  final requests = <http.Request>[];
  final submitted = <Map<String, dynamic>>[];
  final quotes = <Map<String, dynamic>>[];
  var approval = 'review';

  /// Jerseys $50, shorts $30; express $150 an order; shipping AU $100, NZ $250; TEAM10 takes 10% off; GST 10%.
  Map<String, dynamic> quote(List items, Map<String, dynamic> pricing) {
    final lines = [
      for (final i in items.cast<Map>())
        () {
          final qty = (i['sizes'] as Map).values.fold<int>(0, (a, b) => a + (b as num).toInt());
          final unit = i['garment'] == 'shorts' ? 30 : 50;
          return {'name': i['garment'] == 'shorts' ? 'Shorts' : 'Jersey', 'quantity': qty, 'total': (qty * unit).toStringAsFixed(2)};
        }(),
    ];
    final garments = lines.fold<double>(0, (a, l) => a + double.parse('${l['total']}'));
    final express = ((pricing['extras'] as List?) ?? const []).contains('express');
    final extras = express ? 150.0 : 0.0;
    final nz = pricing['destination'] == 'NZ';
    final shipping = nz ? 250.0 : 100.0;
    final code = pricing['discount_code'];
    final good = code == 'TEAM10';
    final discount = good ? (garments + extras) * .1 : 0.0;
    final subtotal = garments + extras + shipping - discount;
    return {
      'status': 'priced', 'currency': 'AUD', 'lines': lines,
      'extras': [if (express) {'name': 'Express production', 'quantity': 1, 'total': '150.00'}],
      'shipping': {'name': nz ? 'New Zealand' : 'Australia', 'amount': shipping.toStringAsFixed(2)},
      'discounts': [if (good) {'name': 'Team 10%', 'amount': discount.toStringAsFixed(2)}],
      'tax': {'name': 'GST', 'amount': (subtotal * .1).toStringAsFixed(2)},
      'total': (subtotal * 1.1).toStringAsFixed(2), 'reasons': [],
      'discount_code': code == null ? null : {'code': code, 'valid': good, 'message': good ? null : 'This code isn’t valid.'},
    };
  }

  Map<String, dynamic> card(int id, String status, String stage, String label, Map<String, String> sub) => {
    'id': id, 'number': '3DZ-0000$id', 'name': id == 1 ? 'MANTIS Rugby League' : 'Club Hoodies', 'status': status, 'stage': stage,
    'stage_label': label, 'sub_status': sub, 'approval': id == 2 ? approval : 'waiting', 'quantity': 36,
    'garments': [{'garment': 'jersey', 'name': 'Rugby League Jersey', 'quantity': 18, 'thumbnail': null}],
    'submitted_at': '2026-10-19T08:00:00Z', 'latest_update': {'kind': 'submitted', 'text': 'Order received from your order form', 'message': null},
    'action': id == 2 && approval == 'review' ? 'review_design' : null, 'payment': null,
  };

  late final client = MockClient((r) async {
    requests.add(r);
    final path = r.url.path.replaceFirst('/api/v1', '');
    // UTF-8, as the server sends it (messages use typographic apostrophes).
    http.Response ok(Object data, [int status = 200]) =>
        http.Response.bytes(utf8.encode(jsonEncode({'data': data})), status, headers: {'content-type': 'application/json; charset=utf-8'});
    if (r.headers['Authorization'] != 'Bearer tok') return http.Response('{"message":"Unauthenticated."}', 401);
    if (path == '/orders/board') {
      return ok({
        'counts': {'current': 2, 'completed': 0}, 'cancelled': [], 'drafts': [],
        'stages': [
          {'key': 'received', 'status': 'pending', 'label': 'Order Received', 'tone': 'blue', 'count': 1, 'orders': [card(1, 'pending', 'received', 'Order Received', {'label': 'Order received', 'tone': 'blue'})]},
          {'key': 'design', 'status': 'confirmed', 'label': 'Design & Approval', 'tone': 'amber', 'count': 1, 'orders': [card(2, 'confirmed', 'design', 'Design & Approval', {'label': approval == 'review' ? 'Approval needed' : 'Design approved', 'tone': 'amber'})]},
          for (final (key, status, label) in [('production', 'in_production', 'Production'), ('shipped', 'shipped', 'Shipped'), ('delivered', 'delivered', 'Delivered')])
            {'key': key, 'status': status, 'label': label, 'tone': 'blue', 'count': 0, 'orders': []},
        ],
      });
    }
    if (path == '/notifications') return ok({'unread': 1, 'items': []});
    if (path == '/orders/2' || path == '/orders/2/approval') {
      if (path.endsWith('approval')) approval = jsonDecode(r.body)['decision'] == 'approve' ? 'approved' : 'changes';
      return ok({
        ...card(2, 'confirmed', 'design', 'Design & Approval', {'label': approval == 'review' ? 'Approval needed' : 'Design approved', 'tone': 'amber'}),
        'items': [{'garment': 'hoodie', 'name': 'Hoodie', 'fit': 'mens', 'sizes': {'M': 10}, 'quantity': 10}],
        'sizes': {'M': 10}, 'stages_reached': {'received': '2026-10-19T08:00:00Z', 'design': '2026-10-19T09:00:00Z'},
        'proof': {'id': 9, 'version': 1, 'review_status': approval == 'review' ? 'pending' : approval, 'name': 'proof.png'},
        'proofs': [{'id': 9, 'version': 1, 'review_status': approval == 'review' ? 'pending' : approval, 'name': 'proof.png'}],
        'files': [{'id': 5, 'kind': 'artwork', 'name': 'logo.png', 'download': '/order-files/5'}],
        'tracking': null, 'updates': [{'kind': 'approval', 'text': 'Design proof v1 is ready for your approval', 'author': 'staff', 'created_at': '2026-10-19T09:30:00Z'}],
      });
    }
    if (path == '/orders/assist') {
      return ok({'items': [{'garment': 'jersey', 'sport': null, 'fit': null, 'sizes': {'M': 12}, 'name': 'Jersey'}, {'garment': 'shorts', 'sizes': {'L': 12}, 'name': 'Shorts'}], 'unknown': [], 'summary': '12 Jerseys (M), 12 Shorts (L)', 'source': 'parser'});
    }
    if (path == '/order-drafts' && r.method == 'POST') return ok({'id': 7, 'kind': jsonDecode(r.body)['kind'], 'files': []}, 201);
    if (path == '/order-drafts/7' && r.method == 'PATCH') return ok({'id': 7});
    if (path == '/order-drafts/7/files') {
      final isForm = utf8.decode(r.bodyBytes, allowMalformed: true).contains('order_form');
      return ok({
        'id': isForm ? 31 : 32, 'kind': isForm ? 'order_form' : 'artwork', 'name': isForm ? 'order.csv' : 'logo.png', 'download': '/order-files/31',
        if (isForm) 'suggested': {'items': [{'garment': 'jersey', 'name': 'Jersey', 'sizes': {'M': 10}}], 'players': 0, 'unknown': [], 'rows': 1, 'summary': '10 Jerseys (M)'},
      }, 201);
    }
    if (path == '/order-drafts/7/submit') {
      submitted.add({...jsonDecode(r.body) as Map<String, dynamic>, 'key': r.headers['Idempotency-Key']});
      final items = (submitted.last['items'] as List?) ?? const [];
      // Invoiced at the price of the choices sent, as the payments feature does.
      final total = items.isEmpty ? null : quote(items, (submitted.last['pricing'] as Map?)?.cast<String, dynamic>() ?? const {})['total'];
      return ok({'id': 12, 'number': '3DZ-00012', 'status': 'pending', 'invoice': total != null
          ? {'invoice_number': 'INV-1001', 'status': 'awaiting_payment', 'label': 'Awaiting payment', 'tone': 'amber', 'currency': 'AUD', 'total': total, 'amount_due': total, 'can_pay': true}
          : null}, 201);
    }
    if (path == '/pricing/options') {
      return ok({
        'currency': 'AUD', 'default_destination': 'AU', 'discount_codes': true,
        'destinations': [{'code': 'AU', 'name': 'Australia'}, {'code': 'NZ', 'name': 'New Zealand'}],
        'extras': [{'code': 'names_numbers', 'name': 'Names & numbers printing', 'unit': 'player', 'unit_price': '5.00', 'auto': true},
          {'code': 'express', 'name': 'Express production', 'unit': 'order', 'unit_price': '150.00', 'auto': false}],
      });
    }
    if (path == '/pricing/quote') {
      final body = jsonDecode(r.body) as Map<String, dynamic>;
      final items = (body['items'] as List?) ?? const [];
      quotes.add(body);
      return ok(items.isEmpty
          ? {'status': 'quote_required', 'currency': 'AUD', 'lines': [], 'total': null, 'reasons': [{'code': 'no_items', 'message': 'We price uploaded order forms after checking them.'}]}
          : quote(items, (body['pricing'] as Map?)?.cast<String, dynamic>() ?? const {}));
    }
    if (path == '/invoices/INV-1001/link') return ok({'url': 'https://test.example/invoices/INV-1001?key=abc', 'expires_at': '2026-10-20T15:00:00Z'});
    return http.Response('{"message":"Not found."}', 404);
  });
}

AppController signedIn(OrdersServer server) {
  final c = AppController(store: FakeStore(), api: ApiClient(client: server.client, baseUrl: 'https://test.example'));
  c.user = const ApiUser(id: 1, name: 'Fabian Soutar', email: 'fab@example.test');
  c.api.token = 'tok';
  return c;
}

Future<void> mount(WidgetTester tester, Widget child, {double width = 400}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 900);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: child)));
  await tester.pumpAndSettle();
}

Future<void> tap(WidgetTester tester, Finder target) async {
  // Lists build their rows lazily: scroll until the target is built.
  if (target.evaluate().isEmpty) {
    await tester.scrollUntilVisible(target, 300, scrollable: find.byType(Scrollable).first);
  }
  await tester.ensureVisible(target);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('My Orders: stage tabs, cards, and approving a proof in the order', (tester) async {
    final server = OrdersServer();
    // Wide enough for the test font's stage tabs side by side.
    await mount(tester, OrdersBoardScreen(signedIn(server)), width: 1000);
    expect(find.text('Order Received 1'), findsOneWidget);
    expect(find.text('MANTIS Rugby League'), findsOneWidget);
    expect(find.text('Order received'), findsOneWidget);
    await tap(tester, find.byType(ChoiceChip).at(1));
    expect(find.text('Club Hoodies'), findsOneWidget);
    expect(find.text('Approval needed'), findsOneWidget);
    expect(find.text('REVIEW DESIGN →'), findsOneWidget);
    await tap(tester, find.text('Club Hoodies'));
    expect(find.text('Proof v1'), findsOneWidget);
    expect(find.byTooltip('Download logo.png'), findsOneWidget);
    await tap(tester, find.text('APPROVE DESIGN'));
    final answer = server.requests.lastWhere((r) => r.url.path.endsWith('/approval'));
    expect(jsonDecode(answer.body), {'decision': 'approve', 'proof_id': 9, 'message': null});
    expect(find.text('Design approved'), findsOneWidget);
  });

  testWidgets('Create Order Form: sizes with help, review, one confirmed order', (tester) async {
    final server = OrdersServer();
    await mount(tester, OrderFormScreen(signedIn(server)));
    expect(find.widgetWithText(TextField, 'Fabian Soutar'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Team / organisation'), 'MANTIS Rugby League');
    await tester.enterText(find.widgetWithText(TextField, '12 jerseys M, 12 shorts L, 6 hoodies XL'), '12 jerseys M, 12 shorts L');
    await tap(tester, find.text('Help me add sizes').last);
    expect(find.textContaining('Added 12 Jerseys (M), 12 Shorts (L)'), findsOneWidget);
    expect(find.text('Subtotal 12'), findsNWidgets(2));
    await tap(tester, find.text('REVIEW ORDER'));
    expect(find.text('24 garments in total'), findsOneWidget);
    // The price from the server's quote.
    expect(find.text('AUD 1166.00'), findsOneWidget);
    expect(find.text('Jersey x 12'), findsOneWidget);
    await tap(tester, find.text('CONFIRM ORDER'));
    expect(find.byKey(const Key('order-reference')), findsOneWidget);
    expect(find.text('3DZ-00012'), findsOneWidget);
    expect(server.submitted, hasLength(1));
    final sent = server.submitted.single;
    expect(sent['team_name'], 'MANTIS Rugby League');
    expect((sent['items'] as List).map((i) => i['garment']), ['jersey', 'shorts']);
    expect(sent['key'], startsWith('app-'));
    expect(find.text('VIEW MY ORDER'), findsOneWidget);
    // Pay now: a 2-hour pay link from the server, opened as the pay page.
    expect(find.text('Awaiting payment'), findsOneWidget);
    final opened = <String>[];
    openPayPage = (context, url, title) async => opened.add(url);
    addTearDown(() => openPayPage = (context, url, title) async {});
    await tap(tester, find.text('PAY NOW'));
    expect(opened, ['https://test.example/invoices/INV-1001?key=abc']);
  });

  testWidgets('Review price choices: destination, extras and discount code reprice; the invoice matches', (tester) async {
    final server = OrdersServer();
    await mount(tester, OrderFormScreen(signedIn(server)));
    await tester.enterText(find.widgetWithText(TextField, 'Team / organisation'), 'MANTIS Rugby League');
    await tester.enterText(find.widgetWithText(TextField, '12 jerseys M, 12 shorts L, 6 hoodies XL'), '12 jerseys M, 12 shorts L');
    await tap(tester, find.text('Help me add sizes').last);
    await tap(tester, find.text('REVIEW ORDER'));
    // Australia by default: 960 + 100 shipping, GST 106.
    expect(find.text('AUD 1166.00'), findsOneWidget);
    // To New Zealand: shipping and GST change.
    await tap(tester, find.byKey(const Key('price-destination')));
    await tap(tester, find.text('New Zealand').last);
    expect(find.text('Shipping · New Zealand'), findsOneWidget);
    expect(find.text('AUD 1331.00'), findsOneWidget);
    // An extra.
    await tap(tester, find.text('Express production'));
    expect(find.text('Express production x 1'), findsOneWidget);
    expect(find.text('AUD 1496.00'), findsOneWidget);
    // A wrong code is named; a good one takes 10% off garments and extras.
    await tester.enterText(find.byKey(const Key('price-code')), 'NOPE');
    await tap(tester, find.text('Apply'));
    await tester.scrollUntilVisible(find.byKey(const Key('code-error')), 200, scrollable: find.byType(Scrollable).first);
    expect(find.byKey(const Key('code-error')), findsOneWidget);
    expect(find.text('AUD 1496.00'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('price-code')), 'team10');
    await tap(tester, find.text('Apply'));
    expect(find.text('Team 10%'), findsOneWidget);
    expect(find.text('AUD 1373.90'), findsOneWidget);
    expect(server.quotes.last['pricing'], {'destination': 'NZ', 'extras': ['express'], 'discount_code': 'TEAM10'});
    // Confirmed with those choices: the invoice is the reviewed total.
    await tap(tester, find.text('CONFIRM ORDER'));
    expect(server.submitted.single['pricing'], {'destination': 'NZ', 'extras': ['express'], 'discount_code': 'TEAM10'});
    expect(find.text('Invoice INV-1001: AUD 1373.90'), findsOneWidget);
  });

  testWidgets('AI designer results: a reference picture can go on the 3D kit (guests sign in first)', (tester) async {
    final c = AppController(store: FakeStore());
    // A real 1 x 1 PNG.
    c.references.add(base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='));
    await mount(tester, ConceptsScreen(c));
    expect(find.text('Put my design on the 3D kit'), findsOneWidget);
    await tap(tester, find.text('Put my design on the 3D kit'));
    expect(c.screen, AppScreen.auth);
  });

  testWidgets('App home: Order now with 3DEEZI opens My Orders, and asks guests to sign in', (tester) async {
    final server = OrdersServer();
    final c = signedIn(server);
    await mount(tester, ListView(children: [OrderNowSection(c)]));
    expect(find.text('ORDER NOW WITH'), findsOneWidget);
    expect(find.byWidgetPredicate((w) => w is Image && w.semanticLabel == '3DEEZI'), findsOneWidget);
    await tap(tester, find.text('VIEW MY ORDERS →'));
    expect(c.screen, AppScreen.orders);
    c.user = null;
    await tap(tester, find.text('CREATE ORDER FORM →'));
    expect(c.screen, AppScreen.auth);
  });

  testWidgets('Upload Your Order: the order form uploads, its rows are confirmed, then one order', (tester) async {
    final server = OrdersServer();
    pickOrderFile = (kind) async => (name: kind == 'order_form' ? 'order.csv' : 'logo.png', bytes: Uint8List.fromList(utf8.encode('Item,Size,Qty\nJersey,M,10\n')));
    addTearDown(() => pickOrderFile = (kind) async => null);
    await mount(tester, OrderUploadScreen(signedIn(server)));
    expect(find.textContaining('Fabian Soutar'), findsOneWidget);
    await tap(tester, find.text('Edit'));
    await tester.enterText(find.widgetWithText(TextField, 'Team / organisation'), 'Lions FC');
    await tap(tester, find.text('Choose your order form'));
    expect(find.text('Uploaded'), findsOneWidget);
    expect(find.text('Replace'), findsOneWidget);
    await tap(tester, find.text('REVIEW ORDER'));
    expect(find.text('READ FROM YOUR ORDER FORM'), findsOneWidget);
    // Not confirmed yet: no garments to price, so the server asks for a quote.
    expect(find.byKey(const Key('quote-required')), findsOneWidget);
    expect(find.textContaining('We price uploaded order forms after checking them.'), findsOneWidget);
    await tap(tester, find.text('These details are correct'));
    await tap(tester, find.text('CONFIRM ORDER'));
    expect(find.text('3DZ-00012'), findsOneWidget);
    final sent = server.submitted.single;
    expect(sent['team_name'], 'Lions FC');
    expect((sent['items'] as List).single['sizes'], {'M': 10});
  });
}
