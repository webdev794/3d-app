import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/ai_service.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';

import 'flow_test.dart' show mountPhone;

/// Recent designs on the AI Designer start screen (client 2026-10-30; the
/// website's /ai/sessions): briefs saved once their designs are in, reopened
/// with no AI call; the last brief kept on the device for guests.
Future<Uint8List> _png(Color color) async {
  final recorder = ui.PictureRecorder();
  Canvas(
    recorder,
  ).drawRect(const Rect.fromLTWH(0, 0, 20, 30), Paint()..color = color);
  final image = await recorder.endRecording().toImage(20, 30);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  return data!.buffer.asUint8List();
}

DesignSpec _spec(String name) => DesignSpec(
  designName: name,
  detected: 'Jersey',
  summary: '$name summary',
  findings: const [],
  mainColor: const Color(0xff000000),
  secondaryColor: const Color(0xff14d8ec),
  accentColor: const Color(0xffffffff),
  pattern: 'Velocity',
  fabric: 'Standard',
  logoText: 'HAWKS',
  renderPrompt: '',
  patternMotif: '',
);

const _user = ApiUser(id: 7, name: 'Tester', email: 't@example.test');

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('a brief is saved once its designs are in; a change sends only '
      'the new picture', (tester) async {
    final pics = (await tester.runAsync(
      () async => [
        for (final c in [Colors.red, Colors.green, Colors.blue, Colors.amber])
          await _png(c),
      ],
    ))!;
    final calls = <(String, String, Map<String, dynamic>)>[];
    final c = AppController(
      api: ApiClient(
        baseUrl: 'https://test.example',
        client: MockClient((r) async {
          calls.add((
            r.method,
            r.url.path,
            jsonDecode(r.body) as Map<String, dynamic>,
          ));
          return http.Response(
            jsonEncode({
              'data': {'id': 41},
            }),
            201,
          );
        }),
      ),
    )..user = _user;
    addTearDown(c.dispose);
    c.brief = 'Navy and gold soccer kit for the Harbour City Hawks';
    c.newAiSession();
    c.concepts = [
      for (final (i, n) in ['Brief', 'Voltage', 'Shards', 'Halftone'].indexed)
        Concept(_spec(n), direction: {'front': n})
          ..image = pics[i]
          ..quality = 'medium'
          ..view = 'presentation',
    ];
    c.concepts[3].busy = true;
    c.saveAiSessionSoon();
    await tester.pump(const Duration(seconds: 1));
    expect(calls, isEmpty, reason: 'waits for every design');
    c.concepts[3].busy = false;
    c.saveAiSessionSoon();
    await tester.pump(const Duration(seconds: 1));
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pump();
    expect(calls, hasLength(1));
    expect(calls.single.$1, 'POST');
    expect(calls.single.$2, '/api/v1/ai/sessions');
    final body = calls.single.$3;
    expect(body['source'], 'app');
    expect(body['prompt'], startsWith('Navy and gold'));
    final options = (body['options'] as List).cast<Map<String, dynamic>>();
    expect(options, hasLength(4));
    expect(
      options.every((o) => '${o['image']}'.startsWith('data:image/png')),
      isTrue,
    );
    expect(options[1]['spec']['designName'], 'Voltage');
    expect(c.aiSessionId, 41);

    // Make HD on design 3: an update with only that picture.
    c.concepts[2].image = pics[0];
    c.saveAiSessionSoon();
    await tester.pump(const Duration(seconds: 1));
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pump();
    expect(calls, hasLength(2));
    expect(calls.last.$1, 'PUT');
    expect(calls.last.$2, '/api/v1/ai/sessions/41');
    final changed = (calls.last.$3['options'] as List)
        .map((o) => (o as Map).containsKey('image'))
        .toList();
    expect(changed, [false, false, true, false]);

    // Kept on the device too.
    final local = await tester.runAsync(
      () => const RecentDesignsStore().load(),
    );
    expect(local?['prompt'], startsWith('Navy and gold'));
    expect((local?['options'] as List), hasLength(4));
  });

  testWidgets('signed in: the strip lists the saved briefs; one reopens YOUR '
      'DESIGNS with its pictures and no AI call', (tester) async {
    final pic = (await tester.runAsync(() => _png(Colors.teal)))!;
    final url = 'data:image/png;base64,${base64Encode(pic)}';
    final paths = <String>[];
    final c = AppController(
      api: ApiClient(
        baseUrl: 'https://test.example',
        client: MockClient((r) async {
          paths.add('${r.method} ${r.url.path}');
          final data = r.url.path.endsWith('/ai/sessions')
              ? {
                  'sessions': [
                    {
                      'id': 5,
                      'prompt': 'Black and cyan rugby league jersey',
                      'count': 4,
                      'thumbs': [url, url, url, url],
                      'updated_at': DateTime.now().toIso8601String(),
                    },
                  ],
                  'projects': [],
                }
              : {
                  'id': 5,
                  'prompt': 'Black and cyan rugby league jersey',
                  'sport': 'rugby-league',
                  'garment': 'jersey',
                  'options': [
                    for (var i = 1; i <= 4; i++)
                      {
                        'name': 'Look $i',
                        'description': 'From the website',
                        'quality': 'medium',
                        'view': 'presentation',
                        'direction': {'front': 'f$i'},
                        'design': {
                          'main': '#0b0b0b',
                          'secondary': '#14d8ec',
                          'accent': '#ffffff',
                          'pattern': 'Velocity',
                          'logoText': 'MANTIS',
                        },
                        'image': url,
                      },
                  ],
                };
          return http.Response(jsonEncode({'data': data}), 200);
        }),
      ),
    )..user = _user;
    c.screen = AppScreen.aiDesigner;
    await mountPhone(tester, c);
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
    expect(find.text('RECENT DESIGNS'), findsOneWidget);
    expect(find.text('Black and cyan rugby league jersey'), findsOneWidget);
    expect(find.text('Sign in to keep all your designs'), findsNothing);

    await tester.tap(find.text('Black and cyan rugby league jersey'));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.concepts);
    expect(c.concepts, hasLength(4));
    expect(c.concepts.every((o) => o.image != null && !o.busy), isTrue);
    expect(c.concepts[1].spec.designName, 'Look 2');
    expect(c.concepts[0].direction?['front'], 'f1');
    expect(c.aiSport, 'Rugby League');
    expect(c.aiGarment, 'Jersey');
    expect(c.brief, 'Black and cyan rugby league jersey');
    expect(c.aiSessionId, 5);
    expect(paths.where((p) => p.contains('/ai/')), [
      'GET /api/v1/ai/sessions',
      'GET /api/v1/ai/sessions/5',
    ]);
  });

  testWidgets('a guest sees the last brief on this device and "Sign in to '
      'keep all your designs"', (tester) async {
    final pic = (await tester.runAsync(() => _png(Colors.orange)))!;
    SharedPreferences.setMockInitialValues({
      '3deezi.ai.last': jsonEncode({
        'prompt': 'Orange basketball singlet with lightning',
        'sport': 'Basketball',
        'garment': 'Singlet',
        'at': DateTime.now().toUtc().toIso8601String(),
        'options': [
          {
            'name': 'Bolt',
            'description': 'Kept on the device',
            'spec': _spec('Bolt').toJson(),
            'image': 'data:image/png;base64,${base64Encode(pic)}',
          },
        ],
      }),
    });
    final c = AppController()..screen = AppScreen.aiDesigner;
    await mountPhone(tester, c);
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
    expect(find.text('Sign in to keep all your designs'), findsOneWidget);
    expect(
      find.text('Orange basketball singlet with lightning'),
      findsOneWidget,
    );
    await tester.tap(find.text('Orange basketball singlet with lightning'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.concepts);
    expect(c.concepts.single.spec.designName, 'Bolt');
    expect(c.aiSport, 'Basketball');
  });
}
