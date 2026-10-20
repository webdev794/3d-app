import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/image_tools.dart';
import 'package:three_deezi/screens/image_editor.dart';

/// A [width] x [height] picture: a navy square on a plain light-grey
/// background (straight RGBA).
Uint8List picture(int width, int height) {
  final rgba = Uint8List(width * height * 4);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      final o = (y * width + x) * 4;
      final inside =
          x > width * .3 &&
          x < width * .7 &&
          y > height * .25 &&
          y < height * .75;
      rgba
        ..[o] = inside ? 20 : 214
        ..[o + 1] = inside ? 35 : 216
        ..[o + 2] = inside ? 58 : 220
        ..[o + 3] = 255;
    }
  }
  return rgba;
}

Future<Uint8List> png(int width, int height, Color color) async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  canvas.drawRect(
    Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
    Paint()..color = color,
  );
  canvas.drawRect(
    Rect.fromLTWH(width * .3, height * .3, width * .4, height * .4),
    Paint()..color = const Color(0xff14233a),
  );
  final image = await recorder.endRecording().toImage(width, height);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  return data!.buffer.asUint8List();
}

/// Lets engine work (decoding, painting pictures) finish until [finder]
/// shows; spinners never settle, so this pumps instead.
Future<void> waitFor(WidgetTester tester, Finder finder) async {
  for (var i = 0; i < 60 && finder.evaluate().isEmpty; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump(const Duration(milliseconds: 50));
  }
  expect(finder, findsWidgets);
}

void main() {
  group('image tools', () {
    test('Remove BG clears a plain background and keeps the subject', () {
      const w = 60, h = 40;
      final out = removeBackground(picture(w, h), w, h, 40);
      int alpha(int x, int y) => out[(y * w + x) * 4 + 3];
      expect(alpha(0, 0), 0);
      expect(alpha(w - 1, h - 1), 0);
      expect(alpha(30, 20), 255);
    });

    test('Remove BG explains when the edge is not one colour', () {
      const w = 40, h = 40;
      final busy = Uint8List(w * h * 4);
      for (var i = 0; i < busy.length; i += 4) {
        busy
          ..[i] = (i * 37) % 256
          ..[i + 1] = (i * 91) % 256
          ..[i + 2] = (i * 13) % 256
          ..[i + 3] = 255;
      }
      expect(
        () => removeBackground(busy, w, h, 40),
        throwsA(
          isA<ImageEditException>().having(
            (e) => e.message,
            'message',
            contains('not one plain colour'),
          ),
        ),
      );
    });

    test('crop frames, shapes, circles and moved marks', () {
      final square = editRatios.firstWhere((r) => r.id == '1:1');
      final portrait = editRatios.firstWhere((r) => r.id == '2:3');
      expect(
        cropFrame(1536, 1024, square, .5),
        const Rect.fromLTWH(256, 0, 1024, 1024),
      );
      expect(cropFrame(1536, 1024, square, 0).left, 0);
      expect(cropFrame(1536, 1024, portrait, 1).right, 1536);
      expect(sameShape(1536, 1024, editRatios.last), isTrue);
      expect(sameShape(1024, 1024, editRatios.last), isFalse);

      final ring = StrokeMark(
        erase: false,
        size: .01,
        points: [
          for (var i = 0; i <= 24; i++)
            Offset(.5 + .2 * _cos(i / 24), .5 + .2 * _sin(i / 24)),
        ],
      );
      final line = StrokeMark(
        erase: false,
        size: .01,
        points: [for (var i = 0; i < 12; i++) Offset(.1 + i * .05, .5)],
      );
      expect(circles(ring, 1000, 1000), isTrue);
      expect(circles(line, 1000, 1000), isFalse);

      final moved = moveMarks(
        [
          NoteMark(const Offset(.1, .5), 'outside'),
          NoteMark(const Offset(.5, .5), 'kept'),
          line,
        ],
        const Size(1536, 1024),
        const Size(1024, 1024),
        (p) => p - const Offset(256, 0),
      );
      expect(moved.whereType<NoteMark>().map((n) => n.text), ['kept']);
      expect(moved.whereType<NoteMark>().single.at, const Offset(.5, .5));
      expect(moved.whereType<StrokeMark>().single.size, closeTo(.015, 1e-9));
    });
  });

  group('server', () {
    test(
      'editImage sends the picture, notes and mask and answers the new picture',
      () async {
        late Map<String, dynamic> sent;
        final api = ApiClient(
          baseUrl: 'https://test.example',
          client: MockClient((request) async {
            expect(request.url.path, '/api/v1/ai/image-edit');
            expect(request.headers['Authorization'], 'Bearer t0k3n');
            sent = jsonDecode(request.body) as Map<String, dynamic>;
            return http.Response(
              jsonEncode({
                'data': {'image': 'data:image/png;base64,AAAA'},
              }),
              200,
            );
          }),
        )..token = 't0k3n';
        final answer = await api.editImage(
          image: 'data:image/jpeg;base64,BBBB',
          instruction: '  Make the collar gold ',
          mask: 'data:image/png;base64,CCCC',
          notes: [
            {'text': 'Gold trim here', 'x': .5, 'y': .15},
          ],
        );
        expect(answer, 'data:image/png;base64,AAAA');
        expect(sent['instruction'], 'Make the collar gold');
        expect(sent['mask'], 'data:image/png;base64,CCCC');
        expect(sent['notes'], [
          {'text': 'Gold trim here', 'x': .5, 'y': .15},
        ]);
        expect(sent.containsKey('marked'), isFalse);
        expect(sent.containsKey('size'), isFalse);
      },
    );

    test('editImage passes on the server\'s reason', () async {
      final api = ApiClient(
        baseUrl: 'https://test.example',
        client: MockClient(
          (_) async => http.Response(
            jsonEncode({
              'message': 'AI generation is not configured on this server.',
            }),
            503,
          ),
        ),
      );
      await expectLater(
        api.editImage(image: 'data:image/png;base64,AAAA', instruction: 'x'),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            'AI generation is not configured on this server.',
          ),
        ),
      );
    });
  });

  testWidgets('the editor marks, comments, edits with AI and uses a version', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(900, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final original = (await tester.runAsync(
      () => png(300, 200, const Color(0xffd6d8dc)),
    ))!;
    final edited = (await tester.runAsync(
      () => png(300, 200, const Color(0xffb8860b)),
    ))!;
    final requests = <Map<String, dynamic>>[];
    final c = AppController(
      api: ApiClient(
        baseUrl: 'https://test.example',
        client: MockClient((request) async {
          if (request.url.path.endsWith('/catalog')) {
            return http.Response(
              jsonEncode({
                'data': {
                  'provider': {'is_ai': true},
                },
              }),
              200,
            );
          }
          requests.add(jsonDecode(request.body) as Map<String, dynamic>);
          return http.Response(
            jsonEncode({
              'data': {
                'image': 'data:image/png;base64,${base64Encode(edited)}',
              },
            }),
            200,
          );
        }),
      ),
    )..user = const ApiUser(id: 1, name: 'Tester', email: 't@example.com');
    Uint8List? used;
    var closed = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () async {
                  used = await openImageEditor(
                    context,
                    c,
                    bytes: original,
                    title: 'Concept 1',
                  );
                  closed = true;
                },
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    // Decoding the picture runs on the engine.
    await waitFor(tester, find.text('1 / 1'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('EDIT IMAGE'), findsOneWidget);
    expect(find.text('1 / 1'), findsOneWidget);
    for (final tool in ['Markup', 'Comment', 'Erase', 'Remove BG', 'Resize']) {
      expect(find.bySemanticsLabel(tool), findsOneWidget, reason: tool);
    }

    // Markup: one stroke across the picture.
    final picture = find.bySemanticsLabel(RegExp(r'^Picture\.'));
    final box = tester.getRect(picture);
    final stroke = await tester.startGesture(
      box.topLeft + Offset(box.width * .2, box.height * .3),
    );
    for (var i = 1; i <= 8; i++) {
      await stroke.moveTo(
        box.topLeft + Offset(box.width * (.2 + i * .05), box.height * .3),
      );
    }
    await stroke.up();
    await tester.pump();
    expect(find.text('Sent with it: 1 mark.'), findsOneWidget);

    // Comment: a tap opens a note; it shows as pin 1.
    await tester.tap(find.bySemanticsLabel('Comment'));
    await tester.pump();
    await tester.tapAt(box.topLeft + Offset(box.width * .5, box.height * .15));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Gold collar here');
    await tester.tap(find.text('Add note'));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Note 1: Gold collar here'), findsOneWidget);
    expect(find.text('Sent with it: 1 mark and 1 note.'), findsOneWidget);

    // Describe edits: picture, mask, marked copy and note go to the server.
    await tester.enterText(
      find.widgetWithText(TextField, 'Describe edits'),
      'Make the collar gold',
    );
    await tester.pump();
    await tester.tap(find.byTooltip('Edit with AI'));
    await waitFor(tester, find.text('2 / 2'));
    await tester.pumpAndSettle();
    expect(requests, hasLength(1));
    final sent = requests.single;
    expect(sent['instruction'], 'Make the collar gold');
    expect(sent['image'], startsWith('data:image/png;base64,'));
    expect(sent['mask'], startsWith('data:image/png;base64,'));
    expect(sent['marked'], startsWith('data:image/png;base64,'));
    expect((sent['notes'] as List).single['text'], 'Gold collar here');
    expect((sent['notes'] as List).single['x'], closeTo(.5, .02));
    expect(find.text('2 / 2'), findsOneWidget);
    expect(find.bySemanticsLabel('Version 2: AI edit'), findsOneWidget);
    // The marks went with the edit.
    expect(find.bySemanticsLabel('Note 1: Gold collar here'), findsNothing);

    // Back to the original and forward again.
    await tester.tap(find.byTooltip('Previous version'));
    await tester.pump();
    expect(find.text('1 / 2'), findsOneWidget);
    await tester.tap(find.byTooltip('Next version'));
    await tester.pump();

    // Use answers the AI version's file.
    await tester.tap(find.text('Use'));
    await tester.pumpAndSettle();
    expect(closed, isTrue);
    expect(used, edited);
  });

  testWidgets('closing after an AI edit asks first; nothing is used', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(900, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final original = (await tester.runAsync(
      () => png(200, 200, const Color(0xffd6d8dc)),
    ))!;
    final c = AppController(
      api: ApiClient(
        baseUrl: 'https://test.example',
        client: MockClient((request) async {
          if (request.url.path.endsWith('/catalog')) {
            return http.Response(
              jsonEncode({
                'data': {
                  'provider': {'is_ai': true},
                },
              }),
              200,
            );
          }
          return http.Response(
            jsonEncode({
              'data': {
                'image': 'data:image/png;base64,${base64Encode(original)}',
              },
            }),
            200,
          );
        }),
      ),
    )..user = const ApiUser(id: 1, name: 'Tester', email: 't@example.com');
    Uint8List? used;
    var closed = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              used = await openImageEditor(context, c, bytes: original);
              closed = true;
            },
            child: const Text('Open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await waitFor(tester, find.text('1 / 1'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.enterText(
      find.widgetWithText(TextField, 'Describe edits'),
      'brighter',
    );
    await tester.pump();
    await tester.tap(find.byTooltip('Edit with AI'));
    await waitFor(tester, find.text('2 / 2'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Close the editor'));
    await tester.pumpAndSettle();
    expect(find.text('Leave without your AI edits?'), findsOneWidget);
    await tester.tap(find.text('Keep editing'));
    await tester.pumpAndSettle();
    expect(closed, isFalse);
    await tester.tap(find.byTooltip('Close the editor'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Leave'));
    await tester.pumpAndSettle();
    expect(closed, isTrue);
    expect(used, isNull);
  });
}

double _cos(double turn) => math.cos(turn * 2 * math.pi);
double _sin(double turn) => math.sin(turn * 2 * math.pi);
