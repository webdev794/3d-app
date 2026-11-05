import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/order_assistant.dart';
import 'package:three_deezi/screens/order_entry.dart';

import 'features_test.dart' show FakeStore;
import 'orders_app_test.dart' show OrdersServer, tap;

/// The Order Assistant's answer for a family reunion sheet (as the server's OrderAssistController gives it).
Map<String, dynamic> collated(String token, {List<Map<String, dynamic>> messages = const []}) => {
  'token': token,
  'title': 'Strickland Family Reunion',
  'made_by': {'supplier_id': null, 'name': '3DEEZI', 'logo_url': null},
  'messages': [
    ...messages,
    {'role': 'assistant', 'text': 'I’ve analysed your order and highlighted a few things to check before production:\n• x\n\n555 garments from 90 orders.'},
  ],
  'summary': '555 garments from 90 orders: 482 polos (including 227 Opening Day polos) and 73 singlets.',
  'analysis': {
    'title': 'Strickland Family Reunion',
    'totals': {'garments': 555, 'orders': 90, 'lines': 527},
    'groups': [
      {'key': 'annie-more-turquoise', 'design': 'Annie More – Turquoise', 'colour': '#3ec9b8', 'total': 79},
      {'key': 'opening-day', 'design': 'Opening Day', 'colour': null, 'total': 227},
    ],
    'checks': [
      {'type': 'size', 'text': 'Georgina Manuel’s Opening Day Polo size reads "Men %XL", which looks like a typo for Men 5XL (row 97).'},
      {'type': 'sizes', 'text': '18 people ordered different sizes on different lines. For example, Motu Tetevano has Women 16W and Women 18W.'},
      {'type': 'names', 'text': '116 lines don’t have a member name.'},
      {'type': 'spelling', 'text': '"Annie More- Torquoise" is read as "Annie More – Turquoise".'},
    ],
    'items': [
      {'garment': 'polo', 'fit': 'womens', 'label': 'Line Uniform Polo – Annie More – Turquoise', 'sizes': {'W14': 2, 'W16': 3}},
      {'garment': 'polo', 'fit': 'mens', 'label': 'Opening Day Polo', 'sizes': {'M': 8, '5XL': 11}},
    ],
  },
  'designs': [
    {'name': 'teal.png', 'url': 'https://test.example/api/v1/order-assistant/$token/designs/0', 'group': null},
  ],
  'links': {
    'page': 'https://test.example/orders/summary/$token',
    'pdf': 'https://test.example/api/v1/order-assistant/$token/pdf',
    'xlsx': 'https://test.example/api/v1/order-assistant/$token/xlsx',
  },
};

class AssistantServer {
  final orders = OrdersServer();
  final sent = <http.Request>[];
  var token = 'T' * 40;

  late final client = MockClient((r) async {
    final path = r.url.path.replaceFirst('/api/v1', '');
    if (path.startsWith('/order-assistant')) {
      sent.add(r);
      final body = latin1.decode(r.bodyBytes, allowInvalid: true);
      final message = RegExp(r'name="message"\r\n\r\n([^\r]*)').firstMatch(body)?.group(1) ?? '';
      final files = RegExp(r'filename="([^"]+)"').allMatches(body).map((m) => {'name': m.group(1), 'kind': 'order'}).toList();
      return http.Response.bytes(
        utf8.encode(jsonEncode({'data': collated(token, messages: [{'role': 'user', 'text': message, 'files': files}])})),
        path == '/order-assistant' ? 201 : 200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    return orders.client.send(r).then(http.Response.fromStream);
  });
}

AppController app(AssistantServer s, {bool signedIn = true}) {
  final c = AppController(store: FakeStore(), api: ApiClient(client: s.client, baseUrl: 'https://test.example'));
  if (signedIn) {
    c.user = const ApiUser(id: 1, name: 'Fabian Soutar', email: 'fab@example.test');
    c.api.token = 'tok';
  }
  return c;
}

Future<void> phone(WidgetTester tester, Widget child, double width, [double height = 844]) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, height);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(home: child));
  await tester.pumpAndSettle();
}

void main() {
  final opened = <String>[];
  setUp(() {
    opened.clear();
    openAssistantLink = (context, url, title) async => opened.add(url);
    pickOrderFile = (kind) async => kind == 'order_form'
        ? (name: 'Strickland Family Reuion.xlsx', bytes: Uint8List.fromList(utf8.encode('Member,Garment,Size,Qty\n')))
        : (name: 'teal.png', bytes: Uint8List.fromList(const [137, 80, 78, 71]));
  });
  tearDown(() => pickOrderFile = (kind) async => null);

  testWidgets('screen 1: CREATE YOUR ORDER with the five ways in, the prompt bar and Switch to Manual Form (image 5)', (tester) async {
    await phone(tester, OrderAssistantScreen(app(AssistantServer())), 390);
    expect(find.byKey(const ValueKey('assistant-title')), findsOneWidget);
    for (final k in ['assistant-scratch', 'assistant-sheet', 'assistant-notes', 'assistant-artwork', 'assistant-team', 'assistant-text', 'assistant-attach', 'assistant-image', 'assistant-mic', 'assistant-send', 'assistant-manual']) {
      expect(find.byKey(ValueKey(k)), findsOneWidget, reason: k);
    }
    expect(find.text('REAL PEOPLE'), findsOneWidget);
    expect(find.text('3DEEZI AI'), findsOneWidget);
    expect(find.text('ORDER ASSISTANT'), findsOneWidget);
    // Image 4: the tab bar stays on screen 1, Orders on.
    expect(find.byKey(const ValueKey('nav-orders')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('screen 2 and 3: an order sheet is sent, then the things to check, the summary, its page, PDF and Excel', (tester) async {
    final server = AssistantServer();
    await phone(tester, OrderAssistantScreen(app(server)), 390);
    await tap(tester, find.byKey(const ValueKey('assistant-sheet')));
    expect(find.text('Strickland Family Reuion.xlsx'), findsOneWidget, reason: 'the file waits in the bar, with ×');
    await tester.enterText(find.byKey(const ValueKey('assistant-text')), 'please collate this');
    await tap(tester, find.byKey(const ValueKey('assistant-send')));

    expect(server.sent.single.url.path, '/api/v1/order-assistant');
    final body = latin1.decode(server.sent.single.bodyBytes);
    expect(body, contains('name="files[]"; filename="Strickland Family Reuion.xlsx"'));
    expect(body, contains('please collate this'));
    expect(find.text('ORDER ASSISTANT'), findsOneWidget);
    expect(find.byKey(const ValueKey('assistant-analysis')), findsOneWidget);
    expect(find.textContaining('"Men %XL"'), findsOneWidget);
    expect(find.textContaining('116 lines don’t have a member name.'), findsOneWidget);
    expect(find.textContaining('Torquoise'), findsNothing, reason: 'spelling notes stay in the PDF and Excel');
    expect(find.text('555 garments from 90 orders: 482 polos (including 227 Opening Day polos) and 73 singlets.'), findsOneWidget);
    expect(find.text('Strickland Family Reunion – Order Summary'), findsWidgets);

    // To the end of the answer (it opens at its top, the things to check).
    await tester.drag(find.byKey(const ValueKey('assistant-chat')), const Offset(0, -2000));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('assistant-page')));
    await tester.pumpAndSettle();
    await tap(tester, find.byKey(const ValueKey('assistant-pdf')));
    await tap(tester, find.byKey(const ValueKey('assistant-xlsx')));
    expect(opened, [
      'https://test.example/orders/summary/${server.token}',
      'https://test.example/api/v1/order-assistant/${server.token}/pdf',
      'https://test.example/api/v1/order-assistant/${server.token}/xlsx',
    ]);

    // More to the same order goes to its token.
    await tester.enterText(find.byKey(const ValueKey('assistant-text')), 'Also 2 x XL polos');
    await tap(tester, find.byKey(const ValueKey('assistant-send')));
    expect(server.sent.last.url.path, '/api/v1/order-assistant/${server.token}');
    expect(tester.takeException(), isNull);
  });

  testWidgets('a design picture is put on its group by the customer', (tester) async {
    final server = AssistantServer();
    await phone(tester, OrderAssistantScreen(app(server)), 390);
    await tap(tester, find.byKey(const ValueKey('assistant-artwork')));
    await tap(tester, find.byKey(const ValueKey('assistant-send')));
    expect(latin1.decode(server.sent.single.bodyBytes), contains('name="designs[]"; filename="teal.png"'));
    await tap(tester, find.byKey(const ValueKey('assistant-design-0')));
    await tap(tester, find.byKey(const ValueKey('assign-annie-more-turquoise')));
    expect(latin1.decode(server.sent.last.bodyBytes), contains('name="assign[teal.png]"\r\n\r\nannie-more-turquoise'));
  });

  testWidgets('Edit Order opens the order form with the collated garments and their designs', (tester) async {
    final server = AssistantServer();
    await phone(tester, OrderAssistantScreen(app(server)), 390);
    await tester.enterText(find.byKey(const ValueKey('assistant-text')), '9 polos 3 x 4XL');
    await tap(tester, find.byKey(const ValueKey('assistant-send')));
    await tap(tester, find.byKey(const ValueKey('assistant-edit')));
    final form = tester.widget<OrderFormScreen>(find.byType(OrderFormScreen));
    expect((form.assistant!['items'] as List).length, 2);
    expect(form.review, isFalse);
    expect(find.textContaining('Line Uniform Polo – Annie More – Turquoise'), findsWidgets);
    expect(find.textContaining('Opening Day Polo'), findsWidgets);
  });

  testWidgets('a guest may collate; placing the order asks to sign in', (tester) async {
    final server = AssistantServer();
    final c = app(server, signedIn: false);
    await phone(tester, OrderAssistantScreen(c), 390);
    await tester.enterText(find.byKey(const ValueKey('assistant-text')), '9 polos: 3 x 4XL');
    await tap(tester, find.byKey(const ValueKey('assistant-send')));
    expect(find.byKey(const ValueKey('assistant-analysis')), findsOneWidget);
    await tap(tester, find.byKey(const ValueKey('assistant-review')));
    expect(find.byType(OrderFormScreen), findsNothing);
    expect(c.screen, AppScreen.auth);
  });

  testWidgets('nothing typed or added: a hint, no request', (tester) async {
    final server = AssistantServer();
    await phone(tester, OrderAssistantScreen(app(server)), 390);
    await tap(tester, find.byKey(const ValueKey('assistant-send')));
    expect(find.byKey(const ValueKey('assistant-error')), findsOneWidget);
    expect(server.sent, isEmpty);
  });

  for (final (w, h) in [(360.0, 740.0), (390.0, 844.0), (430.0, 932.0)]) {
    testWidgets('fits a $w px phone, before and after the answer', (tester) async {
      await phone(tester, OrderAssistantScreen(app(AssistantServer())), w, h);
      expect(tester.takeException(), isNull);
      await tester.enterText(find.byKey(const ValueKey('assistant-text')), '9 polos');
      await tap(tester, find.byKey(const ValueKey('assistant-send')));
      expect(tester.takeException(), isNull);
      await tester.drag(find.byKey(const ValueKey('assistant-chat')), const Offset(0, -1500));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
}
