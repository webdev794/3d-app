import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/ai_service.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/player_shot.dart';
import 'package:three_deezi/widgets/flow_ui.dart';

import 'features_test.dart' show FakeStore;

const _png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

void widgetTests() {
  testWidgets(
    'the Studio has See it on a player; signed out it asks to sign in',
    (tester) async {
      final c = AppController(store: FakeStore())..screen = AppScreen.home;
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      await tester.pumpWidget(ThreeDeeziApp(controller: c));
      await tester.pump(const Duration(milliseconds: 400));
      c.startDyo();
      c.go(AppScreen.studio);
      await tester.pump(const Duration(milliseconds: 400));
      final chip = find.text('See it on a player');
      expect(chip, findsOneWidget);
      await tester.ensureVisible(chip);
      await tester.tap(chip);
      await tester.pump(const Duration(milliseconds: 400));
      expect(c.screen, AppScreen.auth);
      await tester.pumpWidget(const SizedBox());
      c.dispose();
      tester.view.reset();
    },
  );

  testWidgets(
    'a netball dress: female player, two kit pictures, another pose, saved',
    (tester) async {
      final edits = <http.BaseRequest>[];
      final prompts = <String>[];
      final uploads = <String>[];
      final ai = AiService(
        apiKey: 'sk-test',
        client: MockClient.streaming((request, body) async {
          edits.add(request);
          final text = utf8.decode(await body.toBytes(), allowMalformed: true);
          prompts.add(text);
          return http.StreamedResponse(
            Stream.value(
              utf8.encode(
                jsonEncode({
                  'data': [
                    {'b64_json': _png},
                  ],
                }),
              ),
            ),
            200,
          );
        }),
      );
      final c = AppController(
        store: FakeStore(),
        api: ApiClient(
          baseUrl: 'https://test.example',
          client: MockClient.streaming((request, body) async {
            uploads.add(request.url.path);
            await body.toBytes();
            return http.StreamedResponse(
              Stream.value(
                utf8.encode(
                  jsonEncode({
                    'data': {'id': 5},
                  }),
                ),
              ),
              201,
            );
          }),
        ),
      )..user = const ApiUser(id: 7, name: 'Tester', email: 't@example.test');
      final pic = base64Decode(_png);
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(600, 2000);
      await tester.pumpWidget(
        MaterialApp(
          home: PlayerShotScreen(
            c,
            PlayerKit(
              pictures: [Uint8List.fromList(pic), Uint8List.fromList(pic)],
              sport: 'Netball',
              garment: 'Netball dress',
              logoText: 'GS',
            ),
            ai: ai,
          ),
        ),
      );
      // Male is off for a dress.
      final chips = tester.widgetList<ActionChipPill>(
        find.byType(ActionChipPill),
      );
      expect(chips.firstWhere((p) => p.label == 'Male player').onTap, isNull);
      expect(
        chips.firstWhere((p) => p.label == 'Female player').selected,
        isTrue,
      );
      await tester.tap(find.text('Create picture'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(edits, hasLength(1));
      expect(prompts.first, contains('female athlete'));
      expect(prompts.first, contains('netball court'));
      expect('image[]'.allMatches(prompts.first).length, 2);
      await tester.tap(find.text('Try another pose'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(prompts.last, contains('dynamic game-action'));
      await tester.tap(find.text('Save to my assets'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(uploads, ['/api/v1/assets']);
      expect(find.text('Saved'), findsOneWidget);
      expect(find.text('Download'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 3));
      c.dispose();
      tester.view.reset();
    },
  );
}

void main() {
  widgetTests();
  test('a netball dress is worn by a female player on a netball court', () {
    expect(PlayerShot.player('male', 'Netball dress'), 'female');
    final p = PlayerShot.prompt(
      sport: 'Netball',
      garment: 'Netball dress',
      pose: 'team',
    );
    expect(p, contains('female athlete'));
    expect(p, contains('netball court'));
    expect(p, contains('team photo'));
  });

  test('the rugby prompt keeps colours and lettering', () {
    final p = PlayerShot.prompt(
      sport: 'Rugby League',
      garment: 'Jersey',
      pose: 'action',
      colours: ['#0a1f44'],
      logoText: 'TITANS',
      backName: 'SMITH',
      number: '9',
      pictures: 2,
    );
    expect(p, contains('male athlete'));
    expect(p, contains('rugby field'));
    expect(p, contains('"TITANS"'));
    expect(p, contains('"SMITH" with the number "9"'));
    expect(p, contains('#0a1f44'));
    expect(p, contains('front and the back'));
    // The 3D captures wear the small "3D" shield: named so it is not "30".
    expect(p, contains('reads the letters 3D (three-D, not the number 30)'));
    expect(
      PlayerShot.prompt(
        sport: 'Rugby League',
        garment: 'Jersey',
        logoText: 'Titans',
        backName: 'Smith',
        number: '9',
        pose: 'action',
      ),
      allOf(
        contains('the team wordmark on the chest reads exactly "TITANS"'),
        contains('"SMITH" with the number "9"'),
        // A single AI design picture has its own crest: no "3D" badge.
        isNot(contains('the number 30')),
      ),
    );
  });

  test('your own photo: keep the person, swap only the clothes', () {
    final p = PlayerShot.personPrompt(
      sport: 'Rugby League',
      garment: 'Full Kit',
      logoText: 'PROOF',
      kitPictures: 2,
    );
    expect(p, contains('Image 1 is a photo of a real person'));
    expect(p, contains("Keep the person's face"));
    expect(p, contains('matching shorts'));
    expect(p, contains('"PROOF"'));
    expect(p, contains('reads the letters 3D (three-D, not the number 30)'));
  });

  testWidgets(
    'your own photo goes first; a photo without a person is refused',
    (tester) async {
      final prompts = <String>[];
      var person = false;
      final ai = AiService(
        apiKey: 'sk-test',
        client: MockClient.streaming((request, body) async {
          final text = utf8.decode(await body.toBytes(), allowMalformed: true);
          prompts.add(text);
          final reply = request.url.path.endsWith('/responses')
              ? {
                  'output': [
                    {
                      'type': 'message',
                      'content': [
                        {
                          'type': 'output_text',
                          'text': jsonEncode({'person': person}),
                        },
                      ],
                    },
                  ],
                }
              : {
                  'data': [
                    {'b64_json': _png},
                  ],
                };
          return http.StreamedResponse(
            Stream.value(utf8.encode(jsonEncode(reply))),
            200,
          );
        }),
      );
      final c = AppController(store: FakeStore())
        ..user = const ApiUser(id: 7, name: 'Tester', email: 't@example.test');
      final pic = Uint8List.fromList(base64Decode(_png));
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(600, 2000);
      await tester.pumpWidget(
        MaterialApp(
          home: PlayerShotScreen(
            c,
            PlayerKit(
              pictures: [pic, pic],
              sport: 'Netball',
              garment: 'Netball dress',
            ),
            ai: ai,
            photo: pic,
          ),
        ),
      );
      expect(find.textContaining("isn't kept unless you save"), findsOneWidget);
      await tester.tap(find.text('Create picture'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(prompts, hasLength(1)); // refused after the check
      expect(find.textContaining('does not show a person'), findsOneWidget);
      person = true;
      await tester.tap(find.text('Create picture'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 4));
      await tester.pump(const Duration(seconds: 1));
      expect(prompts.last, contains('Image 1 is a photo of a real person'));
      expect('image[]'.allMatches(prompts.last).length, 3);
      expect(find.text('Try again'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 4));
      c.dispose();
      tester.view.reset();
    },
  );
}
