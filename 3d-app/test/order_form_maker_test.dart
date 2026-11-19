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
import 'package:three_deezi/screens/order_form_editor.dart';

import 'features_test.dart' show FakeStore;
import 'order_assistant_test.dart' show phone;
import 'orders_app_test.dart' show OrdersServer, tap;

const _sizes = {'XS': 5, 'S': 5, 'M': 6, 'L': 6, 'XL': 8, '2XL': 8, '3XL': 5, '4XL': 5, '5XL': 5};

/// The order form maker's answer for the client's five MANTIS pictures and one prompt (OrderDesignForm on the server).
Map<String, dynamic> mantis(String token, {List<Map<String, dynamic>> designs = const [], String reply = ''}) {
  final ds = designs.isNotEmpty
      ? designs
      : [
          for (final (i, d) in const [
            ('Tonga', 'Red', '#c8102e', '676.jpg'),
            ('Fiji', 'Sky Blue', '#6cace4', '679.jpg'),
            ('Samoa', 'Royal Blue', '#002b7f', '685.jpg'),
            ('Cook Islands', 'Black/Green', '#121212', '682.jpg'),
            ('Cook Islands', 'Green/Yellow', '#009a44', '682 (2).jpg'),
          ].indexed)
            {
              'key': '${d.$1}-${d.$2}'.toLowerCase().replaceAll(RegExp('[^a-z0-9]+'), '-'),
              'number': i + 1, 'name': d.$1, 'colourway': d.$2, 'label': '${d.$1} – ${d.$2}', 'colour': d.$3, 'note': '',
              'pictures': [{'name': d.$4, 'view': 'front_back'}], 'sizes': _sizes, 'total': 53,
            },
        ];
  final total = ds.fold<int>(0, (a, d) => a + (d['total'] as int));
  return {
    'token': token,
    'title': 'MANTIS Basketball Singlet',
    'made_by': {'supplier_id': null, 'name': '3DEEZI', 'logo_url': null},
    'messages': [
      {'role': 'user', 'text': 'make a order form using these sizes for each garment XS x 5 …'},
      {'role': 'assistant', 'text': reply.isNotEmpty ? reply : 'I’ve made your order form: MANTIS Basketball singlet, 5 designs (01 Tonga – Red, …).\nEach design: XS 5, S 5, M 6, L 6, XL 8, 2XL 8, 3XL 5, 4XL 5, 5XL 5 = 53. Grand total: 265.\nCheck the names and sizes (you can change them), then download the PDF.'},
    ],
    'summary': '$total garments: $total Basketball singlets.',
    'analysis': {
      'title': 'MANTIS Basketball Singlet',
      'totals': {'garments': total, 'orders': 0, 'lines': 45},
      'groups': [for (final d in ds) {'key': d['key'], 'design': d['label'], 'colour': d['colour'], 'total': d['total']}],
      'checks': [],
      'items': [for (final d in ds) {'garment': 'singlet', 'fit': 'mens', 'label': 'Basketball singlet – ${d['label']}', 'sizes': d['sizes']}],
      'form': {
        'brand': 'MANTIS', 'garment': 'Basketball singlet', 'garment_id': 'singlet', 'sport': 'basketball', 'title': '', 'notes': '',
        'unclear': [], 'unplaced': [], 'source': 'ai', 'same_sizes': true, 'total': total, 'designs': ds,
      },
    },
    'designs': [
      for (final (i, d) in ds.indexed)
        {'name': (d['pictures'] as List).first['name'], 'url': 'https://test.example/api/v1/order-assistant/$token/designs/$i', 'group': d['key']},
    ],
    'links': {
      'page': 'https://test.example/orders/summary/$token',
      'pdf': 'https://test.example/api/v1/order-assistant/$token/pdf',
      'xlsx': 'https://test.example/api/v1/order-assistant/$token/xlsx',
    },
  };
}

void main() {
  setUp(() {
    openAssistantLink = (context, url, title) async {};
    pickOrderFile = (kind) async => (name: '676.jpg', bytes: Uint8List.fromList(const [255, 216, 255, 224]));
  });
  tearDown(() => pickOrderFile = (kind) async => null);

  testWidgets('pictures and one prompt: the names and sizes are corrected in place and saved without AI', (tester) async {
    final token = 'M' * 40;
    final sent = <http.Request>[];
    final orders = OrdersServer();
    final client = MockClient((r) async {
      final path = r.url.path.replaceFirst('/api/v1', '');
      if (!path.startsWith('/order-assistant')) return orders.client.send(r).then(http.Response.fromStream);
      sent.add(r);
      var data = mantis(token);
      if (path.endsWith('/form')) {
        final body = jsonDecode(r.body) as Map<String, dynamic>;
        final ds = [
          for (final (i, d) in (body['designs'] as List).cast<Map>().indexed)
            {
              ...((mantis(token)['analysis'] as Map)['form']['designs'] as List)[i] as Map<String, dynamic>,
              'name': d['name'], 'colourway': d['colourway'], 'label': '${d['name']} – ${d['colourway']}', 'sizes': d['sizes'],
              'total': (d['sizes'] as Map).values.fold<int>(0, (a, b) => a + (b as int)),
            },
        ];
        data = mantis(token, designs: ds, reply: 'Saved. Your order form: MANTIS Basketball singlet, ${ds.length} designs.');
      }
      return http.Response.bytes(utf8.encode(jsonEncode({'data': data})), path == '/order-assistant' ? 201 : 200,
          headers: {'content-type': 'application/json; charset=utf-8'});
    });
    final c = AppController(store: FakeStore(), api: ApiClient(client: client, baseUrl: 'https://test.example'))
      ..user = const ApiUser(id: 1, name: 'Fabian Soutar', email: 'fab@example.test');
    c.api.token = 'tok';
    await phone(tester, OrderAssistantScreen(c), 390);

    // One picture (more the same way) and the client's prompt, one send.
    await tap(tester, find.byKey(const ValueKey('assistant-artwork')));
    await tester.enterText(find.byKey(const ValueKey('assistant-text')), 'make a order form using these sizes for each garment XS x 5');
    await tap(tester, find.byKey(const ValueKey('assistant-send')));
    expect(latin1.decode(sent.single.bodyBytes), contains('name="designs[]"; filename="676.jpg"'));
    expect(find.textContaining('Grand total: 265'), findsOneWidget, reason: 'the whole answer, with the sizes and the total');

    await tap(tester, find.byKey(const ValueKey('assistant-form-edit')));
    expect(find.byType(OrderFormEditor), findsOneWidget);
    expect(find.text('265'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('form-editor-name-1')), 'Viti');
    await tester.enterText(find.descendant(of: find.byKey(const ValueKey('form-editor-size-2-M')), matching: find.byType(TextFormField)), '10');
    await tester.pump();
    expect(find.text('269'), findsOneWidget, reason: 'the grand total follows the sizes');
    // Design 05 comes off the form.
    final list = find.descendant(of: find.byType(OrderFormEditor), matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.byKey(const ValueKey('form-editor-remove-4')), 300, scrollable: list);
    await tap(tester, find.byKey(const ValueKey('form-editor-remove-4')));
    expect(find.byKey(const ValueKey('form-editor-design-4')), findsNothing);
    await tester.drag(list, const Offset(0, 4000));
    await tester.pumpAndSettle();
    expect(find.text('216'), findsOneWidget);
    // The Viti name and the 10 stayed with their designs.
    expect(find.text('Viti'), findsOneWidget);
    await tap(tester, find.byKey(const ValueKey('form-editor-save')));

    final saved = sent.last;
    expect(saved.url.path, '/api/v1/order-assistant/$token/form');
    final body = jsonDecode(saved.body) as Map<String, dynamic>;
    expect(body['brand'], 'MANTIS');
    expect((body['designs'] as List).length, 4);
    expect((body['designs'] as List)[1]['name'], 'Viti');
    expect((body['designs'] as List)[2]['sizes']['M'], 10);
    expect(find.byType(OrderFormEditor), findsNothing);
    expect(find.textContaining('Saved. Your order form'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
