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

  test('colours are named in words, as on the website', () {
    // The kit of bug 2026-10-27 (images/192.png): ready-made palette 6.
    expect(PlayerShot.colourName('#240c12'), 'near-black burgundy');
    expect(PlayerShot.colourName('#EC3E5B'), 'bright pinkish red');
    expect(PlayerShot.colourName('#f9e6d4'), 'cream');
    expect(PlayerShot.colourName('#0a1f44'), 'navy');
    expect(PlayerShot.colourName('#0b1016'), 'black');
    expect(PlayerShot.colourName('#00c2cc'), 'bright cyan');
    expect(PlayerShot.colourName('#ffffff'), 'white');
    expect(PlayerShot.colourName('#c8102e'), 'bright red');
    expect(PlayerShot.colourName('#7b2ff7'), 'bright purple');
    expect(PlayerShot.colourName('#006400'), 'dark green');
    expect(PlayerShot.colourName('#8b4513'), 'brown');
    expect(PlayerShot.namedColours(['body: #240C12', '', 'trims: #ec3e5b']), [
      'body: #240c12 (near-black burgundy)',
      'trims: #ec3e5b (bright pinkish red)',
    ]);
  });

  test('the Studio kit lists its colours by area (bug 2026-10-27)', () {
    final c = AppController(store: FakeStore())
      ..mainColor = const Color(0xff240c12)
      ..secondaryColor = const Color(0xffec3e5b)
      ..accentColor = const Color(0xfff9e6d4)
      ..pattern = 'Chevron';
    expect(kitColours(c), [
      'body: #240c12',
      'pattern: thin chevron (V-shaped) lines evenly spaced from chest to '
          'hem, in #6a1e2c',
      'collar, cuffs, side panels and trims: #ec3e5b',
      'lettering (wordmark, name and number) and the small crest badge: '
          '#f9e6d4',
    ]);
    // The pattern's own colour, a gradient body and a hoodie area.
    c
      ..patternColor = '#FFFFFF'
      ..patternColorOwn = true
      ..gradient = {
        'from': '#ff8a00',
        'to': '#7b2ff7',
        'angle': 0,
        'stops': [
          {'color': '#7b2ff7', 'at': 1},
          {'color': '#ff8a00', 'at': 0},
          {'color': '#ff3d7f', 'at': 0.5},
        ],
      }
      ..zoneColors = {'hood': '#00C2CC'};
    final lines = kitColours(c);
    expect(
      lines.first,
      'body: a gradient of #ff8a00, #ff3d7f, #7b2ff7 (top to bottom)',
    );
    expect(lines[1], endsWith('in #ffffff'));
    expect(lines.last, 'hood: #00c2cc');
    c.dispose();
  });

  test('your own photo in a jersey: only the top changes', () {
    final p = PlayerShot.personPrompt(
      sport: 'Football',
      garment: 'Jersey',
      colours: [
        'body: #240c12',
        'collar, cuffs, side panels and trims: #ec3e5b',
      ],
      logoText: '3DEEZI',
      backName: 'YOUR NAME',
      number: '23',
      kitPictures: 2,
    );
    expect(
      p,
      contains(
        'replace ONLY their top (shirt, jersey or jacket) with the kit Jersey',
      ),
    );
    expect(p, contains('their own shorts or trousers, socks and shoes'));
    expect(p, contains('Ignore the clothes the person wears in image 1'));
    expect(p, contains('body: #240c12 (near-black burgundy); collar'));
    expect(p, contains('not part of the kit'));
    expect(p, isNot(contains('matching shorts')));
    expect(
      PlayerShot.prompt(sport: 'Football', garment: 'Jersey', pictures: 2),
      contains('the athlete wears it with plain shorts and socks'),
    );
    expect(PlayerShot.coverage('Hoodie'), 'top');
    expect(PlayerShot.coverage('Full Kit'), 'full');
    expect(PlayerShot.coverage('Netball dress'), 'dress');
    expect(PlayerShot.coverage('Shorts'), 'shorts');
  });

  testWidgets('the Studio sends fresh 3D pictures, never older captures', (
    tester,
  ) async {
    final stale = Uint8List.fromList([1, 2, 3]);
    final fresh = <String, Uint8List>{
      'Front': Uint8List.fromList(base64Decode(_png)),
      'Back': Uint8List.fromList([...base64Decode(_png), 0]),
    };
    final asked = <String>[];
    final c = AppController(store: FakeStore())
      ..user = const ApiUser(id: 7, name: 'Tester', email: 't@example.test')
      ..mockupFront = stale
      ..mockupBack = stale
      ..captureMockup = (view) async {
        asked.add(view);
        return fresh[view];
      };
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(600, 2000);
    final busy = <String?>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => openPlayerShotFromStudio(
                context,
                c,
                live3d: true,
                busy: busy.add,
              ),
              child: const Text('go'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(asked, ['Front', 'Back']);
    expect(busy, ['Capturing your kit…', null]);
    final screen = tester.widget<PlayerShotScreen>(
      find.byType(PlayerShotScreen),
    );
    expect(screen.kit.pictures, [fresh['Front'], fresh['Back']]);
    expect(screen.kit.colours.first, startsWith('body: #'));
    // No 3D on screen: no picture from an older capture, a hint instead.
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => openPlayerShotFromStudio(
                context,
                c,
                live3d: false,
                busy: busy.add,
              ),
              child: const Text('again'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('again'));
    await tester.pump();
    expect(find.textContaining('Show your kit in 3D first'), findsOneWidget);
    expect(find.byType(PlayerShotScreen), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 4));
    c.dispose();
    tester.view.reset();
  });

  testWidgets(
    'on a phone the whole picture shows and the buttons stay on screen',
    (tester) async {
      // QA 2026-10-27: the website showed only the top of a 2:3 picture; the
      // app keeps the whole picture (contain) and sizes it to the room left.
      final ai = AiService(
        apiKey: 'sk-test',
        client: MockClient.streaming((request, body) async {
          await body.toBytes();
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
      final c = AppController(store: FakeStore())
        ..user = const ApiUser(id: 7, name: 'Tester', email: 't@example.test');
      final pic = Uint8List.fromList(base64Decode(_png));
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      await tester.pumpWidget(
        MaterialApp(
          home: PlayerShotScreen(
            c,
            PlayerKit(
              pictures: [pic, pic],
              sport: 'Football',
              garment: 'Jersey',
            ),
            ai: ai,
          ),
        ),
      );
      await tester.pump();
      await tester.tap(find.text('Create picture'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      for (var i = 0; i < 2; i++) {
        await tester.tap(find.text('Try another pose'));
        await tester.pump();
        await tester.pump(const Duration(seconds: 1));
      }
      // Three pictures: the thumbnails row shows too.
      expect(find.byType(GestureDetector), findsWidgets);
      for (final label in [
        'Download',
        'Try another pose',
        'Save to my assets',
      ]) {
        final r = tester.getRect(find.text(label));
        expect(r.top, greaterThanOrEqualTo(0), reason: label);
        expect(r.bottom, lessThanOrEqualTo(844), reason: '$label on screen');
      }
      final picture = find.descendant(
        of: find.byType(InteractiveViewer),
        matching: find.byType(Image),
      );
      expect(tester.widget<Image>(picture).fit, BoxFit.contain);
      final card = tester.getRect(find.byType(InteractiveViewer));
      expect(card.height, greaterThanOrEqualTo(220));
      expect(
        card.bottom,
        lessThan(tester.getRect(find.text('An athlete')).top),
      );
      tester.takeException(); // the test font's 4 px chip overflow
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 4));
      c.dispose();
      tester.view.reset();
    },
  );

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
