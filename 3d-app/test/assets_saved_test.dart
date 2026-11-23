// Task 9.92: the app's Assets shows what is kept on the account (GET /assets), as the website's Assets page.
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/library.dart';

import 'features_test.dart' show FakeStore;

// A 1 x 1 PNG.
const _png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

AppController _app({required bool signedIn, List<Map<String, dynamic>> assets = const []}) {
  final client = MockClient((r) async {
    final path = r.url.path.replaceFirst('/api/v1', '');
    if (path == '/assets') {
      return http.Response(jsonEncode({'data': assets}), 200, headers: {'content-type': 'application/json'});
    }
    final file = RegExp(r'^/assets/(\d+)/file$').firstMatch(path);
    if (file != null) {
      return http.Response.bytes(base64Decode(_png), 200, headers: {'content-type': 'image/png'});
    }
    return http.Response(jsonEncode({'data': []}), 200, headers: {'content-type': 'application/json'});
  });
  final c = AppController(store: FakeStore(), api: ApiClient(client: client, baseUrl: 'https://test.example'));
  if (signedIn) {
    c.api.token = 'tok';
    c.user = const ApiUser(id: 1, name: 'A', email: 'a@example.test');
  }
  return c;
}

Future<void> _mount(WidgetTester tester, AppController c) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(390, 844);
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: AssetsScreen(c))));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Saved'));
  for (var i = 0; i < 10; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  testWidgets('Assets › Saved lists the account\'s assets, with their pictures', (tester) async {
    final c = _app(signedIn: true, assets: [
      {'id': 7, 'type': 'mockup', 'name': 'Hawks mockup', 'mime': 'image/png'},
      {'id': 8, 'type': 'logo', 'name': 'Hawks crest', 'mime': 'image/png'},
      {'id': 9, 'type': 'design', 'name': 'Final design', 'mime': 'application/pdf'},
    ]);
    await _mount(tester, c);
    expect(find.byKey(const ValueKey('assets-saved-grid')), findsOneWidget);
    expect(find.text('Hawks mockup'), findsOneWidget);
    expect(find.text('Mockup'), findsOneWidget);
    expect(find.text('Hawks crest'), findsOneWidget);
    expect(find.text('Final design'), findsOneWidget);
    expect(find.text('Design file'), findsOneWidget);
    // The two pictures are shown; the PDF keeps its file icon.
    expect(find.byIcon(Icons.insert_drive_file_outlined), findsOneWidget);
    final out = Platform.environment['SHOT_DIR'];
    if (out != null) {
      await tester.runAsync(() async {
        final img = await captureImage(tester.element(find.byType(MaterialApp)));
        final data = await img.toByteData(format: ui.ImageByteFormat.png);
        File('$out/assets-saved-390x844.png').writeAsBytesSync(data!.buffer.asUint8List());
      });
    }
  });

  testWidgets('Assets › Saved asks a guest to sign in', (tester) async {
    await _mount(tester, _app(signedIn: false));
    expect(find.byKey(const ValueKey('assets-saved-signin')), findsOneWidget);
  });

  testWidgets('Assets › Saved says when nothing is kept yet', (tester) async {
    await _mount(tester, _app(signedIn: true));
    expect(find.byKey(const ValueKey('assets-saved-empty')), findsOneWidget);
  });
}
