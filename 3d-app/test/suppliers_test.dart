import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/order_entry.dart';
import 'package:three_deezi/screens/orders_board.dart';
import 'package:three_deezi/screens/suppliers.dart';

import 'features_test.dart' show FakeStore;
import 'orders_app_test.dart' show OrdersServer, approve, fillDelivery, fromTop, mount, seeIt, tap;
import 'orders_app_test.dart' as orders_test show typeIn;

/// The makers as the server sends them (App\Models\Supplier::present): 3DEEZI (the default), Mantis (which owns
/// 3DEEZI) and an approved outside supplier with a logo and a website.
const threeDeeziJson = {
  'id': 1, 'slug': '3deezi', 'name': '3DEEZI', 'owner': true, 'summary': 'Designed and made by 3DEEZI.',
  'makes': 'Custom sportswear and teamwear', 'location': null, 'website': null, 'logo_url': null, 'default': true,
};
const mantisJson = {
  'id': 2, 'slug': 'mantis', 'name': 'Mantis', 'owner': true, 'summary': 'The company behind 3DEEZI.',
  'makes': 'Custom sportswear and teamwear', 'location': null, 'website': null, 'logo_url': null, 'default': false,
};
const acmeJson = {
  'id': 3, 'slug': null, 'name': 'Acme Teamwear', 'owner': false, 'summary': 'Fast sublimation for clubs and schools.',
  'makes': 'Sublimated jerseys, shorts and socks', 'location': 'Gold Coast, QLD', 'website': 'https://acme.example',
  // The server names itself by another address than the app uses (a proxy): the logo comes from the app's server.
  'logo_url': 'http://127.0.0.1:8027/api/v1/suppliers/3/logo?v=17', 'default': false,
};

/// The orders server (orders_app_test.dart) with preferred suppliers: GET /suppliers (public) and the order form's
/// "Made by" choices in GET /orders/options. [older]: a server from before suppliers (neither); [empty]: one whose
/// suppliers are not set up yet (empty lists). Board cards say who makes them ([madeBy] by order id, else 3DEEZI).
class SuppliersServer {
  SuppliersServer({this.older = false, this.empty = false});
  final bool older, empty;
  final orders = OrdersServer();
  final madeBy = <int, String>{2: 'Mantis'};

  static http.Response _ok(Object data) => http.Response.bytes(
    utf8.encode(jsonEncode({'data': data})),
    200,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );

  late final client = MockClient((r) async {
    final path = r.url.path.replaceFirst('/api/v1', '');
    if (path == '/suppliers') {
      if (older) return http.Response('{"message":"The route api/v1/suppliers could not be found."}', 404);
      return _ok({
        'suppliers': empty ? [] : [mantisJson, acmeJson],
        'prices': {
          'currency': 'AUD', 'monthly': '49.00', 'yearly': '490.00', 'monthly_text': r'A$49.00',
          'yearly_text': r'A$490.00', 'tax_included': true, 'tax_name': 'GST',
        },
        'ready': !empty,
      });
    }
    if (path == '/orders/options' && !older) {
      return _ok({
        'lead_time_weeks': 4,
        'suppliers': empty ? [] : [threeDeeziJson, mantisJson, acmeJson],
        'default_supplier_id': empty ? null : 1,
      });
    }
    // Everything else as the orders server answers it (a copy: this request has been read already).
    final copy = http.Request(r.method, r.url)
      ..headers.addAll(r.headers)
      ..bodyBytes = r.bodyBytes;
    final answer = await http.Response.fromStream(await orders.client.send(copy));
    if (path == '/orders/board' && answer.statusCode == 200) {
      final board = (jsonDecode(utf8.decode(answer.bodyBytes)) as Map)['data'] as Map<String, dynamic>;
      for (final stage in (board['stages'] as List).cast<Map<String, dynamic>>()) {
        for (final card in (stage['orders'] as List).cast<Map<String, dynamic>>()) {
          card['made_by'] = madeBy[card['id']] ?? '3DEEZI';
        }
      }
      return _ok(board);
    }
    return answer;
  });
}

AppController signedInTo(SuppliersServer server, {bool signedIn = true}) {
  final c = AppController(store: FakeStore(), api: ApiClient(client: server.client, baseUrl: 'https://test.example'));
  if (signedIn) {
    c.user = const ApiUser(id: 1, name: 'Fabian Soutar', email: 'fab@example.test');
    c.api.token = 'tok';
  }
  return c;
}

/// Records the pages opened (a supplier's website, the website's form) instead of opening them.
List<(String, String)> recordOpened() {
  final opened = <(String, String)>[];
  final real = openSupplierPage;
  openSupplierPage = (context, url, title) async => opened.add((url, title));
  addTearDown(() => openSupplierPage = real);
  return opened;
}

/// The Create Order Form with section 1 and one garment filled in (10 jerseys, M).
Future<void> fillOrderForm(WidgetTester tester) async {
  await tester.enterText(find.widgetWithText(TextField, 'Team / organisation'), 'Brisbane Bears');
  await fillDelivery(tester);
  final size = find.byKey(const Key('size-0-M'));
  await tester.scrollUntilVisible(size, 300, scrollable: find.byType(Scrollable).first);
  await tester.enterText(size, '10');
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('Preferred suppliers: Mantis with its badge, a supplier with logo, Makes, Where and Visit website, then '
      'Become a preferred supplier with the prices', (tester) async {
    final opened = recordOpened();
    final server = SuppliersServer();
    await mount(tester, SuppliersScreen(signedInTo(server)), width: 390);
    expect(find.text('Preferred suppliers'), findsOneWidget);
    expect(find.text('Made by makers we trust.', findRichText: true), findsOneWidget);
    // Mantis: two letters for its missing logo, the "3DEEZI family" badge, its text and what it makes.
    expect(find.text('Mantis'), findsOneWidget);
    expect(find.text('M'), findsOneWidget);
    expect(find.text('3DEEZI family'), findsOneWidget);
    expect(find.text('The company behind 3DEEZI.'), findsOneWidget);
    // Acme: its logo from the app's own server (it can't load in a test: its initials instead), no badge.
    expect(find.text('Acme Teamwear'), findsOneWidget);
    final logo = tester.widget<Image>(find.descendant(of: find.byKey(const ValueKey('supplier-3')), matching: find.byType(Image)));
    expect((logo.image as NetworkImage).url, 'https://test.example/api/v1/suppliers/3/logo?v=17');
    expect(find.text('AT'), findsOneWidget);
    expect(find.text('Fast sublimation for clubs and schools.'), findsOneWidget);
    expect(find.text('Sublimated jerseys, shorts and socks'), findsOneWidget);
    expect(find.text('Gold Coast, QLD'), findsOneWidget);
    expect(find.text('Makes'), findsNWidgets(2));
    expect(find.text('Where'), findsOneWidget);
    // 3DEEZI itself is the site: not a card, as on the website.
    expect(find.text('3DEEZI'), findsNothing);
    // Visit website: only Acme has one; it opens like the Profile's website rows.
    expect(find.byKey(const ValueKey('supplier-visit-2')), findsNothing);
    await tap(tester, find.byKey(const ValueKey('supplier-visit-3')));
    expect(opened, [('https://acme.example', 'Acme Teamwear')]);
    // Become a preferred supplier: the prices, then the website's form, signed in.
    await seeIt(tester, find.byKey(const Key('listing-prices')));
    expect(find.text(r'A$49 a month or A$490 a year (incl. GST)', findRichText: true), findsOneWidget);
    await tap(tester, find.byKey(const ValueKey('become-supplier-open')));
    expect(opened.last, ('https://test.example/suppliers/apply#app-token=tok', 'Become a preferred supplier'));
    expect(server.orders.requests.where((r) => r.url.path.contains('order')), isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Preferred suppliers for screen readers: the heading, each card\'s words in one node, its button apart', (tester) async {
    final semantics = tester.ensureSemantics();
    await mount(tester, SuppliersScreen(signedInTo(SuppliersServer())), width: 390);
    expect(tester.getSemantics(find.text('Made by makers we trust.')), isSemantics(label: 'Made by makers we trust.', isHeader: true));
    final mantis = tester.getSemantics(find.text('Mantis'));
    expect(mantis.label, allOf(contains('Mantis'), contains('3DEEZI family'), contains('The company behind 3DEEZI.'), contains('Custom sportswear and teamwear')));
    expect(mantis.label, isNot(contains('we trust')));
    expect(mantis.childrenCount, 0);
    final acme = tester.getSemantics(find.text('Gold Coast, QLD'));
    expect(acme.label, allOf(contains('Acme Teamwear'), contains('Where'), isNot(contains('Visit website'))));
    expect(acme.childrenCount, 0);
    expect(
      tester.getSemantics(find.byKey(const ValueKey('supplier-visit-3'))),
      isSemantics(label: 'Visit website', isButton: true, hasTapAction: true),
    );
    await seeIt(tester, find.byKey(const Key('listing-prices')));
    final join = tester.getSemantics(find.byKey(const Key('listing-prices')));
    expect(join.label, allOf(contains('Become a preferred supplier'), contains(r'A$49 a month or A$490 a year (incl. GST)')));
    expect(join.childrenCount, 0);
    expect(
      tester.getSemantics(find.byKey(const ValueKey('become-supplier-open'))),
      isSemantics(label: 'Become a preferred supplier', isButton: true, hasTapAction: true),
    );
    semantics.dispose();
  });

  testWidgets('Preferred suppliers signed out: the list, and the form opens without an account token', (tester) async {
    final opened = recordOpened();
    await mount(tester, SuppliersScreen(signedInTo(SuppliersServer(), signedIn: false)), width: 390);
    expect(find.text('Mantis'), findsOneWidget);
    expect(find.text('Acme Teamwear'), findsOneWidget);
    await tap(tester, find.byKey(const ValueKey('become-supplier-open')));
    expect(opened.single, ('https://test.example/suppliers/apply', 'Become a preferred supplier'));
  });

  testWidgets('Preferred suppliers not set up yet on the server: 3DEEZI alone, and Become a preferred supplier', (tester) async {
    await mount(tester, SuppliersScreen(signedInTo(SuppliersServer(empty: true))), width: 390);
    expect(find.text('3DEEZI'), findsOneWidget);
    expect(find.text('3DEEZI family'), findsOneWidget);
    expect(find.text('Designed and made by 3DEEZI.'), findsOneWidget);
    expect(find.text('Mantis'), findsNothing);
    expect(find.byKey(const ValueKey('become-supplier')), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Preferred suppliers on an older site (no list): 3DEEZI alone, no error', (tester) async {
    await mount(tester, SuppliersScreen(signedInTo(SuppliersServer(older: true))), width: 390);
    expect(find.text('3DEEZI'), findsOneWidget);
    expect(find.text('Designed and made by 3DEEZI.'), findsOneWidget);
    // No form to open on that site, and nothing about the missing page.
    expect(find.byKey(const ValueKey('become-supplier')), findsNothing);
    expect(find.textContaining('found'), findsNothing);
    expect(find.textContaining('server'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(tester.takeException(), isNull);
  });

  for (final size in const [Size(360, 640), Size(390, 844), Size(430, 932), Size(820, 1180)]) {
    testWidgets('Preferred suppliers at ${size.width.toInt()} px: fits, a tablet keeps the phone column', (tester) async {
      await mount(tester, SuppliersScreen(signedInTo(SuppliersServer())), width: size.width);
      tester.view.physicalSize = size;
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      for (final key in ['supplier-mantis', 'supplier-3', 'become-supplier']) {
        final card = find.byKey(ValueKey(key));
        await tester.scrollUntilVisible(card, 300, scrollable: find.byType(Scrollable).first);
        final box = tester.getRect(card);
        expect(box.left, greaterThanOrEqualTo(16), reason: key);
        expect(box.right, lessThanOrEqualTo(size.width - 16), reason: key);
        expect(box.width, lessThanOrEqualTo(560), reason: key);
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('Create Order Form: Made by Mantis is sent with the order and shown on the review', (tester) async {
    final server = SuppliersServer();
    await mount(tester, OrderFormScreen(signedInTo(server)));
    await fillOrderForm(tester);
    // Made by, at the end of section 1: 3DEEZI (default), Mantis, then the approved suppliers.
    await fromTop(tester);
    await seeIt(tester, find.byKey(const Key('made-by')));
    expect(find.text('3DEEZI (default)'), findsOneWidget);
    expect(find.text('Made by 3DEEZI unless you choose one of our preferred suppliers.'), findsOneWidget);
    await tap(tester, find.text('3DEEZI (default)'));
    expect(find.text('Acme Teamwear'), findsWidgets);
    await tap(tester, find.text('Mantis').last);
    // What the chosen maker makes (Mantis has no place given).
    expect(tester.widget<Text>(find.byKey(const Key('made-by-hint'))).data, 'Custom sportswear and teamwear');
    await tap(tester, find.text('REVIEW ORDER'));
    expect(find.text('REVIEW & APPROVE ORDER'), findsOneWidget);
    await seeIt(tester, find.byKey(const Key('review-made-by')));
    expect(tester.widget<Text>(find.byKey(const Key('review-made-by'))).data, 'Mantis');
    await approve(tester);
    expect(find.text('3DZ-00012'), findsOneWidget);
    expect(server.orders.submitted.single['supplier_id'], 2);
    expect(server.orders.submitted.single['team_name'], 'Brisbane Bears');
  });

  testWidgets('Create Order Form: an approved supplier shows what it makes and where', (tester) async {
    await mount(tester, OrderFormScreen(signedInTo(SuppliersServer())));
    await tap(tester, find.text('3DEEZI (default)'));
    await tap(tester, find.text('Acme Teamwear').last);
    expect(
      tester.widget<Text>(find.byKey(const Key('made-by-hint'))).data,
      'Sublimated jerseys, shorts and socks · Gold Coast, QLD',
    );
    // Back to 3DEEZI: its own hint again.
    await tap(tester, find.text('Acme Teamwear').first);
    await tap(tester, find.text('3DEEZI (default)').last);
    expect(find.text('Made by 3DEEZI unless you choose one of our preferred suppliers.'), findsOneWidget);
  });

  testWidgets('Create Order Form: no choice made is 3DEEZI (nothing sent), shown as 3DEEZI on the review', (tester) async {
    final server = SuppliersServer();
    await mount(tester, OrderFormScreen(signedInTo(server)));
    await fillOrderForm(tester);
    await tap(tester, find.text('REVIEW ORDER'));
    await seeIt(tester, find.byKey(const Key('review-made-by')));
    expect(tester.widget<Text>(find.byKey(const Key('review-made-by'))).data, '3DEEZI');
    await approve(tester);
    expect(server.orders.submitted.single.containsKey('supplier_id'), isFalse);
  });

  testWidgets('Create Order Form on an older site (no makers): no Made by, the order is 3DEEZI\'s', (tester) async {
    final server = SuppliersServer(older: true);
    await mount(tester, OrderFormScreen(signedInTo(server)));
    expect(find.byKey(const Key('made-by')), findsNothing);
    await fillOrderForm(tester);
    expect(find.byKey(const Key('made-by')), findsNothing);
    await tap(tester, find.text('REVIEW ORDER'));
    expect(find.text('REVIEW & APPROVE ORDER'), findsOneWidget);
    expect(find.byKey(const Key('review-made-by')), findsNothing);
    expect(find.text('Made by'), findsNothing);
    await approve(tester);
    expect(server.orders.submitted.single.containsKey('supplier_id'), isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Create Order Form: See the suppliers opens the Preferred suppliers screen', (tester) async {
    await mount(tester, OrderFormScreen(signedInTo(SuppliersServer())));
    await tap(tester, find.text('See the suppliers'));
    expect(find.byType(SuppliersScreen), findsOneWidget);
    expect(find.descendant(of: find.byType(SuppliersScreen), matching: find.text('Acme Teamwear')), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(SuppliersScreen), findsNothing);
    expect(find.byKey(const Key('made-by')), findsOneWidget);
  });

  testWidgets('My orders: "Made by Mantis" on its card and its page; a 3DEEZI order says nothing', (tester) async {
    final server = SuppliersServer();
    server.orders.detailExtra = {'made_by': 'Mantis', 'supplier_id': 2};
    // Wide enough for the test font's stage tabs side by side.
    await mount(tester, OrdersBoardScreen(signedInTo(server)), width: 1000);
    expect(find.text('MANTIS Rugby League'), findsOneWidget);
    expect(find.byKey(const Key('order-made-by')), findsNothing);
    await tap(tester, find.byType(ChoiceChip).at(1));
    expect(find.text('Club Hoodies'), findsOneWidget);
    expect(find.text('Made by Mantis'), findsOneWidget);
    await tap(tester, find.text('Club Hoodies'));
    expect(find.text('Proof v1'), findsOneWidget);
    expect(find.text('Made by Mantis'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('My orders on an older site: no "Made by" anywhere', (tester) async {
    final server = OrdersServer();
    final c = AppController(store: FakeStore(), api: ApiClient(client: server.client, baseUrl: 'https://test.example'))
      ..user = const ApiUser(id: 1, name: 'Fabian Soutar', email: 'fab@example.test');
    c.api.token = 'tok';
    await mount(tester, OrdersBoardScreen(c), width: 1000);
    await tap(tester, find.byType(ChoiceChip).at(1));
    expect(find.byKey(const Key('order-made-by')), findsNothing);
    await tap(tester, find.text('Club Hoodies'));
    expect(find.byKey(const Key('order-made-by')), findsNothing);
  });

  test('The makers and prices as the server sends them', () {
    final makers = Supplier.listOf([threeDeeziJson, mantisJson, acmeJson, {'id': 9}, 'x', null]);
    expect(makers.map((s) => s.name), ['3DEEZI', 'Mantis', 'Acme Teamwear']);
    expect(makers.first.isDefault, isTrue);
    expect(makers[1].owner, isTrue);
    expect(makers[2].initials, 'AT');
    expect(makers[2].about, 'Sublimated jerseys, shorts and socks · Gold Coast, QLD');
    expect(Supplier.listOf(null), isEmpty);
    expect(Supplier.listOf({'suppliers': []}), isEmpty);
    // Only web addresses open.
    expect(Supplier.fromJson({...acmeJson, 'website': 'javascript:alert(1)'})!.website, isNull);
    // Made by: 3DEEZI is sent as nothing; a choice no longer offered goes back to 3DEEZI.
    expect(MadeByField.idToSend(makers, null), isNull);
    expect(MadeByField.idToSend(makers, 1), isNull);
    expect(MadeByField.idToSend(makers, 2), 2);
    expect(MadeByField.idToSend(makers, 77), isNull);
    expect(MadeByField.chosenOf(makers, 77)!.name, '3DEEZI');
    expect(MadeByField.idToSend(makers.take(1).toList(), 2), isNull);
    expect(MadeByField.idToSend(const [], 2), isNull);
    // The listing prices: whole dollars, "Free" at 0, the tax only when included.
    final prices = {'currency': 'AUD', 'monthly': '49.00', 'yearly': '490.00', 'tax_included': true, 'tax_name': 'GST'};
    expect(listingPrices(prices), (monthly: r'A$49', yearly: r'A$490', tax: ' (incl. GST)'));
    expect(listingPrices({...prices, 'monthly': '0.00', 'tax_included': false}), (monthly: 'Free', yearly: r'A$490', tax: ''));
    expect(listingPrices({...prices, 'yearly': '1490.50'})!.yearly, r'A$1,490.50');
    expect(listingPrices(null), isNull);
    expect(listingPrices({'monthly': 'x'}), isNull);
    // My orders: only a maker other than 3DEEZI.
    expect(madeByOf({'made_by': 'Mantis'}), 'Mantis');
    expect(madeByOf({'made_by': '3DEEZI'}), isNull);
    expect(madeByOf({'made_by': null}), isNull);
    expect(madeByOf({}), isNull);
  });

  test('Logos come from the server the app talks to', () {
    final api = ApiClient(client: MockClient((_) async => http.Response('', 404)), baseUrl: 'https://test.example/3deez');
    expect(api.serverUrl('http://localhost/3deez/api/v1/suppliers/3/logo?v=2'), 'https://test.example/3deez/api/v1/suppliers/3/logo?v=2');
    expect(api.serverUrl('https://cdn.example/logo.png'), 'https://cdn.example/logo.png');
  });

  /// Upload Your Order with section 1 filled in and its order form uploaded.
  Future<void> fillUpload(WidgetTester tester) async {
    pickOrderFile = (kind) async => (name: 'order.csv', bytes: Uint8List.fromList(utf8.encode('Item,Size,Qty\nJersey,M,10\n')));
    addTearDown(() => pickOrderFile = (kind) async => null);
    await tap(tester, find.text('Edit'));
    await orders_test.typeIn(tester, 'Team / organisation', 'Lions FC');
    await fillDelivery(tester);
    await tap(tester, find.text('Choose your order form'));
    expect(find.text('Uploaded'), findsOneWidget);
  }

  testWidgets('Upload Your Order: Made by Mantis is sent with the upload and shown on the review', (tester) async {
    final server = SuppliersServer();
    await mount(tester, OrderUploadScreen(signedInTo(server)));
    await fillUpload(tester);
    // Made by, in section 3 under the instructions: 3DEEZI (default), Mantis, then the approved suppliers.
    await seeIt(tester, find.byKey(const Key('made-by')));
    expect(find.text('Made by 3DEEZI unless you choose one of our preferred suppliers.'), findsOneWidget);
    await tap(tester, find.text('3DEEZI (default)'));
    expect(find.text('Acme Teamwear'), findsWidgets);
    await tap(tester, find.text('Mantis').last);
    expect(tester.widget<Text>(find.byKey(const Key('made-by-hint'))).data, 'Custom sportswear and teamwear');
    await tap(tester, find.text('REVIEW ORDER'));
    expect(find.text('REVIEW & APPROVE ORDER'), findsOneWidget);
    await seeIt(tester, find.byKey(const Key('review-made-by')));
    expect(tester.widget<Text>(find.byKey(const Key('review-made-by'))).data, 'Mantis');
    await approve(tester);
    expect(find.text('3DZ-00012'), findsOneWidget);
    expect(server.orders.submitted.single['supplier_id'], 2);
    expect(server.orders.submitted.single['team_name'], 'Lions FC');
  });

  testWidgets('Upload Your Order: no choice is 3DEEZI; an older site (no makers) shows no Made by', (tester) async {
    final server = SuppliersServer();
    await mount(tester, OrderUploadScreen(signedInTo(server)));
    await fillUpload(tester);
    await tap(tester, find.text('REVIEW ORDER'));
    await seeIt(tester, find.byKey(const Key('review-made-by')));
    expect(tester.widget<Text>(find.byKey(const Key('review-made-by'))).data, '3DEEZI');
    await approve(tester);
    expect(server.orders.submitted.single['supplier_id'], isNull);

    final older = SuppliersServer(older: true);
    await mount(tester, OrderUploadScreen(signedInTo(older), key: const ValueKey('older')));
    await fillUpload(tester);
    expect(find.byKey(const Key('made-by')), findsNothing);
    await tap(tester, find.text('REVIEW ORDER'));
    expect(find.text('REVIEW & APPROVE ORDER'), findsOneWidget);
    expect(find.byKey(const Key('review-made-by')), findsNothing);
    await approve(tester);
    expect(older.orders.submitted.single.containsKey('supplier_id'), isFalse);
    expect(tester.takeException(), isNull);
  });
}
