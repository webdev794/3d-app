import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/ai_service.dart' show DesignSpec;
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/ai_designer.dart';
import 'package:three_deezi/screens/library.dart' show ProfileScreen;
import 'package:three_deezi/screens/order_entry.dart';
import 'package:three_deezi/screens/orders_board.dart';
import 'package:three_deezi/widgets/ui.dart' show GradientButton;

import 'features_test.dart' show FakeStore;

/// A small copy of the website's 3DEEZI Orders API.
class OrdersServer {
  final requests = <http.Request>[];
  final submitted = <Map<String, dynamic>>[];
  final quotes = <Map<String, dynamic>>[];
  var approval = 'review';
  /// More fields for order 2's detail (e.g. the date required and the delivery address of a newer upload).
  Map<String, dynamic> detailExtra = {};
  /// Admin › Settings' production lead time, as GET /orders/options gives it.
  var leadWeeks = 4;

  /// 3DEEZI AI's reading of the uploaded order form (POST /order-drafts/7/read); null: the AI is not there (404).
  Map<String, dynamic>? aiReading;

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
        ...detailExtra,
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
    if (path == '/order-drafts/7/read' && aiReading != null) {
      return ok({'id': 7, 'kind': 'upload', 'files': [], 'suggested': [aiReading]});
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
    if (path == '/orders/options') return ok({'lead_time_weeks': leadWeeks});
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

/// Section 1's Mobile, Date required (the picker's suggested day) and Deliver to an Australian address, or Pick up.
Future<void> fillDelivery(WidgetTester tester, {bool pickup = false}) async {
  await typeIn(tester, 'Mobile', '0412 345 678');
  await fromTop(tester);
  await tap(tester, find.byKey(const Key('date-required')));
  await tap(tester, find.text('OK'));
  if (pickup) {
    await tap(tester, find.byKey(const Key('delivery-pickup')));
    return;
  }
  await typeIn(tester, 'Street address', '12 Smith Street');
  await typeIn(tester, 'Suburb / town', 'Rotorua');
  await fromTop(tester);
  await tap(tester, find.byKey(const Key('address-state')));
  await tap(tester, find.text('QLD').last);
  await typeIn(tester, 'Postcode', '4000');
}

/// Scrolls the screen's list back to the top (a tap lower down may have scrolled past the next target).
Future<void> fromTop(WidgetTester tester) async {
  await tester.fling(find.byType(Scrollable).first, const Offset(0, 4000), 4000);
  await tester.pumpAndSettle();
}

/// Types into the field labelled [label], scrolling the list until it is built.
Future<void> typeIn(WidgetTester tester, String label, String text) async {
  final field = find.widgetWithText(TextField, label);
  if (field.evaluate().isEmpty) {
    // From the top of the list down (a tap lower down may have scrolled past it).
    await tester.fling(find.byType(Scrollable).first, const Offset(0, 4000), 4000);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(field, 300, scrollable: find.byType(Scrollable).first);
  }
  await tester.ensureVisible(field);
  await tester.enterText(field, text);
  await tester.pumpAndSettle();
}

/// Scrolls the screen's list until [target] is built (lists build their rows lazily), then expects it once.
Future<void> seeIt(WidgetTester tester, Finder target) async {
  if (target.evaluate().isEmpty) await tester.scrollUntilVisible(target, 300, scrollable: find.byType(Scrollable).first);
  expect(target, findsOneWidget);
}

/// REVIEW & APPROVE ORDER: to the end of the review (its last card), tick "I confirm …" (APPROVE ORDER stays off
/// until then), then APPROVE ORDER.
Future<void> approve(WidgetTester tester) async {
  for (var i = 0; i < 3; i++) {
    await tester.fling(find.byType(Scrollable).first, const Offset(0, -4000), 4000);
    await tester.pumpAndSettle();
  }
  final check = find.byKey(const Key('approve-check')), button = find.byKey(const Key('approve-order'));
  expect(tester.widget<GradientButton>(button).onPressed, isNull);
  await tester.tap(check);
  await tester.pumpAndSettle();
  expect(tester.widget<GradientButton>(button).onPressed, isNotNull);
  await tester.tap(button);
  await tester.pumpAndSettle();
}

Future<void> tap(WidgetTester tester, Finder target) async {
  // Lists build their rows lazily: scroll until the target is built.
  if (target.evaluate().isEmpty) {
    await tester.scrollUntilVisible(target, 300, scrollable: find.byType(Scrollable).first);
  }
  await tester.ensureVisible(target);
  // Still off the screen or under the app bar: into the middle of the screen, laid out there before tapping.
  final screen = tester.view.physicalSize / tester.view.devicePixelRatio;
  final at = tester.getCenter(target);
  if (at.dy < 80 || at.dy > screen.height) {
    await Scrollable.ensureVisible(tester.element(target), alignment: 0.5);
    await tester.pump();
  }
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
    // Section 1 needs the mobile, the date required and the delivery address (2026-10-22, as Upload Your Order).
    await tap(tester, find.text('REVIEW ORDER'));
    expect(find.text('Add a mobile number so we can reach you.'), findsOneWidget);
    await fillDelivery(tester);
    await tap(tester, find.text('REVIEW ORDER'));
    // REVIEW & APPROVE ORDER: two garment styles (different sizes), one section each.
    expect(find.text('REVIEW & APPROVE ORDER'), findsOneWidget);
    expect(find.text('2 garment styles · 24 garments'), findsOneWidget);
    // The price from the server's quote.
    await seeIt(tester, find.text('AUD 1166.00'));
    expect(find.text('Jersey x 12'), findsOneWidget);
    await approve(tester);
    expect(find.byKey(const Key('order-reference')), findsOneWidget);
    expect(find.text('3DZ-00012'), findsOneWidget);
    expect(server.submitted, hasLength(1));
    final sent = server.submitted.single;
    expect(sent['team_name'], 'MANTIS Rugby League');
    expect((sent['items'] as List).map((i) => i['garment']), ['jersey', 'shorts']);
    expect(sent['phone'], '0412 345 678');
    expect(sent['needed_by'], matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
    expect(sent['delivery'], 'deliver');
    expect(sent['address'], {'street': '12 Smith Street', 'suburb': 'Rotorua', 'state': 'QLD', 'postcode': '4000', 'country': 'Australia'});
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

  testWidgets('Create Order Form: REVIEW & APPROVE ORDER fits 360, 390 and 430 wide', (tester) async {
    for (final width in [360.0, 390.0, 430.0]) {
      final server = OrdersServer();
      await mount(tester, OrderFormScreen(signedIn(server), key: ValueKey(width)), width: width);
      await tester.enterText(find.widgetWithText(TextField, 'Team / organisation'), 'MANTIS Rugby League');
      await tester.enterText(find.widgetWithText(TextField, '12 jerseys M, 12 shorts L, 6 hoodies XL'), '12 jerseys M, 12 shorts L');
      await tap(tester, find.text('Help me add sizes').last);
      await fillDelivery(tester, pickup: true);
      await tap(tester, find.text('REVIEW ORDER'));
      expect(find.text('REVIEW & APPROVE ORDER'), findsOneWidget);
      expect(find.byKey(const Key('review-steps')), findsOneWidget);
      await approve(tester);
      expect(server.submitted, hasLength(1));
      expect(find.text('ORDER SENT'), findsOneWidget);
      expect(tester.takeException(), isNull, reason: 'width $width');
    }
  });

  testWidgets('Review price choices: destination, extras and discount code reprice; the invoice matches', (tester) async {
    final server = OrdersServer();
    await mount(tester, OrderFormScreen(signedIn(server)));
    await tester.enterText(find.widgetWithText(TextField, 'Team / organisation'), 'MANTIS Rugby League');
    await tester.enterText(find.widgetWithText(TextField, '12 jerseys M, 12 shorts L, 6 hoodies XL'), '12 jerseys M, 12 shorts L');
    await tap(tester, find.text('Help me add sizes').last);
    await fillDelivery(tester);
    await tap(tester, find.text('REVIEW ORDER'));
    // Australia by default: 960 + 100 shipping, GST 106.
    await seeIt(tester, find.text('AUD 1166.00'));
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
    // Approved with those choices: the invoice is the reviewed total.
    await approve(tester);
    expect(server.submitted.single['pricing'], {'destination': 'NZ', 'extras': ['express'], 'discount_code': 'TEAM10'});
    expect(find.text('Invoice INV-1001: AUD 1373.90'), findsOneWidget);
  });

  testWidgets('AI designer results: a reference picture can go on the 3D kit (guests sign in first)', (tester) async {
    final c = AppController(store: FakeStore());
    // A real 1 x 1 PNG.
    c.references.add(base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='));
    // The results show a design; the picture is in its ⋯ menu (146.jpg).
    c.concepts = [Concept(const DesignSpec(designName: 'Mine', detected: 'Jersey', summary: '', findings: [], mainColor: Color(0xff000000), secondaryColor: Color(0xff00d9ed), accentColor: Color(0xffffffff), pattern: 'Velocity', fabric: 'Standard', logoText: 'MINE', renderPrompt: '', patternMotif: ''))..image = c.references.first];
    await mount(tester, ConceptsScreen(c));
    await tester.tap(find.byTooltip('Design 1 actions'));
    await tester.pumpAndSettle();
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

  testWidgets('Orders screen: opened from the home heading, own orders on the mini board, each card opens its screen', (tester) async {
    final server = OrdersServer();
    final c = signedIn(server);
    await mount(tester, ListView(children: [OrderNowSection(c)]));
    // The home's ORDER NOW heading opens the Orders screen (the website's /order-now).
    await tap(tester, find.byKey(const ValueKey('order-now-open')));
    expect(find.byType(OrderNowScreen), findsOneWidget);
    expect(find.text('Orders'), findsOneWidget);
    expect(find.text('Start an order. Upload your details. Follow its progress.'), findsWidgets);
    // Signed in: the My Orders card shows the customer's own orders by stage.
    final screen = find.byType(OrderNowScreen);
    expect(find.descendant(of: screen, matching: find.text('Received')), findsOneWidget);
    expect(find.descendant(of: screen, matching: find.text('MANTIS Rugby League')), findsOneWidget);
    expect(find.descendant(of: screen, matching: find.text('#3DZ-00002')), findsOneWidget);
    expect(server.requests.where((r) => r.url.path.endsWith('/orders/board')), hasLength(1));
    // Create Order Form and Upload Your Order open the native screens on top.
    await tap(tester, find.descendant(of: screen, matching: find.text('CREATE ORDER FORM →')));
    expect(find.byType(OrderFormScreen), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tap(tester, find.descendant(of: screen, matching: find.text('UPLOAD YOUR ORDER →')));
    expect(find.byType(OrderUploadScreen), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    // My Orders closes the Orders screen and shows the app's My orders.
    await tap(tester, find.descendant(of: screen, matching: find.text('VIEW MY ORDERS →')));
    expect(find.byType(OrderNowScreen), findsNothing);
    expect(c.screen, AppScreen.orders);
  });

  testWidgets('Orders screen: a guest sees the cards (no board) and is asked to sign in', (tester) async {
    final server = OrdersServer();
    final c = AppController(store: FakeStore(), api: ApiClient(client: server.client, baseUrl: 'https://test.example'));
    await mount(tester, OrderNowScreen(c));
    expect(find.text('ORDER NOW WITH'), findsOneWidget);
    expect(find.text('Received'), findsNothing);
    expect(server.requests, isEmpty);
    await tap(tester, find.text('UPLOAD YOUR ORDER →'));
    expect(c.screen, AppScreen.auth);
  });

  test('a saved design sets its order row: zip hoodie → hoodie, pocket polo → polo, full kit → jersey', () {
    expect(orderGarmentFor('Zip hoodie'), 'hoodie');
    expect(orderGarmentFor('Hoodie'), 'hoodie');
    expect(orderGarmentFor('Polo with pocket'), 'polo');
    expect(orderGarmentFor('Full Kit'), 'jersey');
    expect(orderGarmentFor('Training Tee'), 'tee');
    expect(orderGarmentFor('Shorts'), 'shorts');
    expect(orderGarmentFor('ziphoodie'), 'hoodie');
    expect(orderGarmentFor('Something new'), 'jersey');
  });

  test('miniBoard: the first three stages with counts; null without orders', () {
    final board = miniBoard({
      'stages': [
        {'key': 'received', 'count': 3, 'orders': [{'id': 1, 'number': '3DZ-1', 'name': 'A'}, {'id': 2, 'number': '3DZ-2', 'name': 'B'}, {'id': 3, 'number': '3DZ-3', 'name': 'C'}]},
        {'key': 'design', 'count': 1, 'orders': [{'id': 4, 'number': '3DZ-4', 'name': 'D', 'action': 'review_design'}]},
        {'key': 'production', 'count': 0, 'orders': []},
        {'key': 'shipped', 'count': 5, 'orders': []},
      ],
    })!;
    expect(board.map((c) => c.name), ['Received', 'Design', 'Production']);
    expect(board.map((c) => c.count), [3, 1, 0]);
    expect(board.first.cards, hasLength(2));
    expect(board[1].cards.single.hot, isTrue);
    expect(miniBoard({'stages': [{'key': 'received', 'count': 0, 'orders': []}]}), isNull);
    expect(miniBoard(null), isNull);
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
    // Section 1 needs the mobile, the date required and the delivery address (client 2026-10-22).
    await tap(tester, find.text('REVIEW ORDER'));
    expect(find.text('Add a mobile number so we can reach you.'), findsOneWidget);
    await typeIn(tester, 'Mobile', '0412 345');
    await tap(tester, find.text('REVIEW ORDER'));
    expect(find.text('Enter a mobile number, e.g. 0412 345 678 or +61 412 345 678.'), findsOneWidget);
    await typeIn(tester, 'Mobile', '0412 345 678');
    await tap(tester, find.text('REVIEW ORDER'));
    expect(find.text('Choose the date you need the order by.'), findsOneWidget);
    await fromTop(tester);
    await tap(tester, find.byKey(const Key('date-required')));
    await tap(tester, find.text('OK'));
    await tap(tester, find.text('REVIEW ORDER'));
    expect(find.text('Add the street address for delivery.'), findsOneWidget);
    await typeIn(tester, 'Street address', '12 Smith Street');
    await typeIn(tester, 'Suburb / town', 'Rotorua');
    await fromTop(tester);
    await tap(tester, find.byKey(const Key('address-state')));
    await tap(tester, find.text('QLD').last);
    await typeIn(tester, 'Postcode', '4000');
    await tap(tester, find.text('REVIEW ORDER'));
    expect(find.text('REVIEW & APPROVE ORDER'), findsOneWidget);
    await seeIt(tester, find.byKey(const Key('review-date-required')));
    expect(find.text('12 Smith Street, Rotorua QLD 4000, Australia'), findsOneWidget);
    // Not confirmed yet: no garments to price, so the server asks for a quote (below the rows read from the form).
    await tester.scrollUntilVisible(find.byKey(const Key('quote-required')), 300, scrollable: find.byType(Scrollable).first);
    expect(find.byKey(const Key('quote-required')), findsOneWidget);
    expect(find.textContaining('We price uploaded order forms after checking them.'), findsOneWidget);
    await approve(tester);
    expect(find.text('3DZ-00012'), findsOneWidget);
    final sent = server.submitted.single;
    expect(sent['team_name'], 'Lions FC');
    expect((sent['items'] as List).single['sizes'], {'M': 10});
    expect(sent['phone'], '0412 345 678');
    expect(sent['needed_by'], matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
    expect(sent['delivery'], 'deliver');
    expect(sent['address'], {'street': '12 Smith Street', 'suburb': 'Rotorua', 'state': 'QLD', 'postcode': '4000', 'country': 'Australia'});
    // The review's "Delivery to" starts from the address's country.
    expect((sent['pricing'] as Map)['destination'], 'AU');
  });

  testWidgets('Upload Your Order: 3DEEZI AI reads the club form into rows and players to check, and fills the date required', (tester) async {
    // Client 2026-10-22: "user doesn't need to fill this out because they are uploading the form".
    final server = OrdersServer();
    final due = DateTime.now().add(const Duration(days: 30));
    final ymd = '${due.year}-${due.month.toString().padLeft(2, '0')}-${due.day.toString().padLeft(2, '0')}';
    server.aiReading = {
      'file_id': 31, 'source': 'ai', 'file_name': 'order.csv', 'read_at': '2026-10-22T10:00:00Z', 'players': 3, 'rows': 0, 'summary': '',
      'items': [
        {'garment': 'jersey', 'sport': 'rugby-league', 'fit': 'youth', 'name': 'Rugby League Jersey', 'sizes': {'Kids': 2},
          'players': [{'name': 'WALKER', 'number': '1', 'size': 'Kids'}, {'name': 'HALE', 'number': '6', 'size': 'Kids'}, {'name': 'PARKER', 'number': '4', 'size': null}]},
      ],
      'details': [{'form_sizes': {'10Y': 1, '16Y': 1}, 'player_sizes': ['10Y', '16Y', '']}],
      'unknown': ['Jersey: PARKER 4 (size missing)'],
      'form': {'team_name': 'TE ARAWA RUGBY LEAGUE U13', 'contact_name': '', 'contact_email': '', 'phone': '0412 345 678', 'needed_by': ymd, 'needed_by_text': '',
        'delivery': '', 'address': {'street': '', 'suburb': '', 'state': '', 'postcode': '', 'country': ''}, 'notes': ''},
    };
    pickOrderFile = (kind) async => (name: 'order.csv', bytes: Uint8List.fromList(utf8.encode('10Y,WALKER,1\n16Y,HALE,6\n,PARKER,4\n')));
    addTearDown(() => pickOrderFile = (kind) async => null);
    await mount(tester, OrderUploadScreen(signedIn(server)));
    await tap(tester, find.text('Choose your order form'));
    // Read at once: the team, mobile and date required come from the form (the customer left them empty).
    expect(find.byKey(const Key('ai-status')), findsOneWidget);
    await fromTop(tester);
    expect(find.textContaining('TE ARAWA RUGBY LEAGUE U13'), findsOneWidget);
    await tap(tester, find.byKey(const Key('delivery-pickup')));
    await tap(tester, find.text('REVIEW ORDER'));
    expect(find.text('REVIEW & APPROVE ORDER'), findsOneWidget);
    expect(find.textContaining('Read by 3DEEZI AI from order.csv'), findsOneWidget);
    // The youth sizes as the form wrote them, in place of Kids.
    await seeIt(tester, find.text('10Y'));
    expect(find.text('16Y'), findsOneWidget);
    // Edit garment opens the rows read from the form, to correct.
    await tap(tester, find.text('Edit garment'));
    await seeIt(tester, find.text('WALKER'));
    expect(find.textContaining('As on your form: 10Y 1 · 16Y 1'), findsOneWidget);
    await seeIt(tester, find.textContaining('PARKER 4 (size missing)'));
    await approve(tester);
    expect(find.text('3DZ-00012'), findsOneWidget);
    final sent = server.submitted.single;
    expect(sent['needed_by'], ymd);
    expect(sent['phone'], '0412 345 678');
    expect(sent['team_name'], 'TE ARAWA RUGBY LEAGUE U13');
    // Only the order's own fields go: no display fields.
    expect(sent['items'], [
      {'garment': 'jersey', 'sport': 'rugby-league', 'fit': 'youth', 'sizes': {'Kids': 2},
        'players': [{'name': 'WALKER', 'number': '1', 'size': 'Kids'}, {'name': 'HALE', 'number': '6', 'size': 'Kids'}, {'name': 'PARKER', 'number': '4', 'size': null}]},
    ]);
  });

  testWidgets('Upload Your Order: pick up is quoted without shipping and fits 360, 390 and 430 wide', (tester) async {
    for (final width in [360.0, 390.0, 430.0]) {
      final server = OrdersServer();
      pickOrderFile = (kind) async => (name: 'order.csv', bytes: Uint8List.fromList(utf8.encode('Item,Size,Qty\nJersey,M,10\n')));
      // A new screen each time (the same one would keep the last run's state).
      await mount(tester, OrderUploadScreen(signedIn(server), key: ValueKey(width)), width: width);
      await tap(tester, find.text('Edit'));
      await typeIn(tester, 'Team / organisation', 'Lions FC');
      await typeIn(tester, 'Mobile', '+61 412 345 678');
      await fromTop(tester);
      await tap(tester, find.byKey(const Key('date-required')));
      await tap(tester, find.text('OK'));
      await tap(tester, find.byKey(const Key('delivery-pickup')));
      expect(find.text('Street address'), findsNothing);
      await tap(tester, find.text('Choose your order form'));
      await tap(tester, find.text('REVIEW ORDER'));
      await seeIt(tester, find.text('Pick up from 3DEEZI'));
      await tap(tester, find.byKey(const Key('approve-check')));
      // The price list has no pick-up price: the quote asks for PICKUP (no shipping), the order leaves it to the server.
      expect((server.quotes.last['pricing'] as Map)['destination'], 'PICKUP');
      await tap(tester, find.text('APPROVE ORDER'));
      final sent = server.submitted.single;
      expect(sent['delivery'], 'pickup');
      expect((sent['pricing'] as Map?)?['destination'], isNull);
      expect(tester.takeException(), isNull, reason: 'width $width');
      addTearDown(() => pickOrderFile = (kind) async => null);
    }
  });

  testWidgets('My orders: the order shows its date required and delivery address; older orders show neither', (tester) async {
    final server = OrdersServer();
    await mount(tester, OrderDetailScreen(signedIn(server), 2));
    expect(find.byKey(const Key('order-delivery-details')), findsNothing);
    expect(tester.takeException(), isNull);
    server.detailExtra = {'needed_by': '2026-12-03', 'shipping_address': '12 Smith Street\nParramatta NSW 2150\nAustralia', 'phone': '0412 345 678'};
    await mount(tester, OrderDetailScreen(signedIn(server), 2, key: const ValueKey('newer')));
    await tester.scrollUntilVisible(find.byKey(const Key('order-delivery-details')), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Date required: 3/12/2026'), findsOneWidget);
    expect(find.text('Delivery address'), findsOneWidget);
    expect(find.text('12 Smith Street\nParramatta NSW 2150\nAustralia'), findsOneWidget);
    server.detailExtra = {'shipping_address': 'Pick up from 3DEEZI (no delivery)'};
    await mount(tester, OrderDetailScreen(signedIn(server), 2, key: const ValueKey('pickup')));
    await tester.scrollUntilVisible(find.byKey(const Key('order-delivery-details')), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Pick up'), findsOneWidget);
  });

  testWidgets('Date required sooner than the production lead time: a gentle warning, the order can still be sent', (tester) async {
    final server = OrdersServer()..leadWeeks = 6;
    await mount(tester, OrderFormScreen(signedIn(server)));
    // The picker suggests 4 weeks ahead: sooner than this site's 6 weeks.
    await fromTop(tester);
    await tap(tester, find.byKey(const Key('date-required')));
    await tap(tester, find.text('OK'));
    expect(find.text('Usually 6 weeks for production and delivery; we’ll confirm if we can meet your date.'), findsOneWidget);
    final today = DateTime(2026, 10, 22);
    expect(leadWarningText(DateTime(2026, 11, 5), 4, today: today), 'Usually 4 weeks for production and delivery; we’ll confirm if we can meet your date.');
    expect(leadWarningText(DateTime(2026, 11, 19), 4, today: today), isNull);
    expect(leadWarningText(DateTime(2026, 11, 5), 0, today: today), isNull);
    // Only a warning: nothing stops the review.
    expect(uploadDetailsProblem(phone: '0412 345 678', neededBy: DateTime(2026, 10, 23), delivery: 'pickup', address: const {}, today: today), isNull);
  });

  test('Upload Your Order: the mobile, date required and delivery checks match the website', () {
    for (final ok in ['0412 345 678', '+61 412 345 678', '+61 (0)412 345 678', '(02) 9876 5432', '+64 21 123 4567']) {
      expect(validMobile(ok), isTrue, reason: ok);
    }
    for (final bad in ['', '1234', '0412 345', 'call me', '04123456789']) {
      expect(validMobile(bad), isFalse, reason: bad);
    }
    final today = DateTime(2026, 10, 22);
    const home = {'street': '12 Smith St', 'suburb': 'Rotorua', 'state': 'QLD', 'postcode': '4000', 'country': 'Australia'};
    expect(uploadDetailsProblem(phone: '0412 345 678', neededBy: DateTime(2026, 10, 21), delivery: 'deliver', address: home, today: today), 'The date required can’t be in the past.');
    expect(uploadDetailsProblem(phone: '0412 345 678', neededBy: today, delivery: 'deliver', address: home, today: today), isNull);
    expect(uploadDetailsProblem(phone: '0412 345 678', neededBy: today, delivery: 'deliver', address: {...home, 'postcode': '40'}, today: today), 'Enter the 4-digit postcode.');
    expect(uploadDetailsProblem(phone: '0412 345 678', neededBy: today, delivery: 'pickup', address: const {}, today: today), isNull);
    expect(uploadDetailsProblem(phone: '+64 21 123 4567', neededBy: today, delivery: 'deliver', address: const {'street': '5 Queen St', 'suburb': 'Auckland', 'country': 'New Zealand'}, today: today), isNull);
    expect(deliveryLine('pickup', const {}), 'Pick up from 3DEEZI');
    expect(deliveryLine('deliver', home), '12 Smith St, Rotorua QLD 4000, Australia');
  });

  testWidgets('Profile: a guest is "Guest", never the demo name; signed in it is the account name', (tester) async {
    // QA 2026-10-21 (from D): the profile showed "Alex Morgan" (AppController.name's demo default) to everyone.
    final c = AppController(store: FakeStore());
    await mount(tester, ProfileScreen(c));
    expect(find.text('Guest'), findsOneWidget);
    expect(find.text('Alex Morgan'), findsNothing);
    expect(find.text('Guest · projects stay on this device'), findsOneWidget);
    c.user = const ApiUser(id: 1, name: 'Fabian Soutar', email: 'fab@example.test');
    await mount(tester, ProfileScreen(c));
    expect(find.text('Fabian Soutar'), findsOneWidget);
    expect(find.text('fab@example.test'), findsOneWidget);
    expect(find.text('Alex Morgan'), findsNothing);
    // An account without a name shows its email.
    c.user = const ApiUser(id: 2, name: ' ', email: 'noname@example.test');
    await mount(tester, ProfileScreen(c));
    expect(find.text('noname@example.test'), findsNWidgets(2));
  });
}
