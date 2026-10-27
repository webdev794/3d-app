import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/own_patterns.dart';
import 'package:three_deezi/project_sync.dart';
import 'package:three_deezi/widgets/flow_ui.dart' show ActionChipPill;

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show mountPhone, tapText;

/// A small two-colour PNG (red and blue halves); with [seeThrough] the blue
/// half is left see-through.
Future<Uint8List> picture({bool seeThrough = false}) async {
  final recorder = ui.PictureRecorder();
  final canvas = ui.Canvas(recorder);
  canvas.drawRect(
    const ui.Rect.fromLTWH(0, 0, 20, 40),
    ui.Paint()..color = const ui.Color(0xffdd2233),
  );
  if (!seeThrough) {
    canvas.drawRect(
      const ui.Rect.fromLTWH(20, 0, 20, 40),
      ui.Paint()..color = const ui.Color(0xff2255ee),
    );
  }
  final image = await recorder.endRecording().toImage(40, 40);
  return (await image.toByteData(
    format: ui.ImageByteFormat.png,
  ))!.buffer.asUint8List();
}

/// One pixel of a PNG (straight RGBA).
Future<List<int>> pixel(Uint8List png, int x, int y) async {
  final codec = await ui.instantiateImageCodec(png);
  final image = (await codec.getNextFrame()).image;
  final px = (await image.toByteData(
    format: ui.ImageByteFormat.rawStraightRgba,
  ))!.buffer.asUint8List();
  final i = (y * image.width + x) * 4;
  return px.sublist(i, i + 4);
}

/// The website's assets API for one account: list, upload (multipart), file, delete.
class FakeAssets {
  final files = <int, Uint8List>{};
  var next = 1;
  late final client = MockClient((r) async {
    final path = r.url.path;
    if (r.method == 'GET' && path.endsWith('/assets')) {
      return http.Response(
        jsonEncode({
          'data': [
            for (final id in files.keys)
              {'id': id, 'name': 'Koru $id', 'type': 'pattern'},
          ],
        }),
        200,
      );
    }
    if (r.method == 'POST' && path.endsWith('/assets')) {
      if (!latin1.decode(r.bodyBytes).contains('pattern')) {
        return http.Response('{}', 422);
      }
      final id = next++;
      files[id] = await picture();
      return http.Response(
        jsonEncode({
          'data': {'id': id, 'type': 'pattern'},
        }),
        201,
      );
    }
    final m = RegExp(r'/assets/(\d+)(/file)?$').firstMatch(path);
    if (m != null && r.method == 'GET') {
      return http.Response.bytes(
        files[int.parse(m[1]!)]!,
        200,
        headers: {'content-type': 'image/png'},
      );
    }
    if (m != null && r.method == 'DELETE') {
      files.remove(int.parse(m[1]!));
      return http.Response(
        jsonEncode({
          'data': {'message': 'Asset deleted.'},
        }),
        200,
      );
    }
    return http.Response('{}', 404);
  });
}

AppController signedIn(FakeAssets server) {
  final api = ApiClient(client: server.client, baseUrl: 'http://local.test')
    ..token = 't';
  return AppController(store: FakeStore(), api: api)
    ..user = const ApiUser(id: 1, name: 'Pat', email: 'pat@example.test');
}

/// Saved to the server (website format) and opened again.
Project reopened(AppController c) {
  final json = ProjectSync.toServer(
    Project(
      id: 'p1',
      title: 'Own',
      sport: 'Rugby League',
      garment: 'Jersey',
      mode: 'DYO',
      kit: c.kit,
      updated: DateTime(2026),
    ),
  );
  return ProjectSync.fromServer({
    ...json,
    'id': 5,
    'version': 1,
    'updated_at': '2026-10-27T10:00:00Z',
  });
}

void main() {
  test('picture types and pattern labels', () async {
    expect(
      patternPictureType(
        Uint8List.fromList([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]),
      ),
      'image/png',
    );
    expect(
      patternPictureType(Uint8List.fromList([0xff, 0xd8, 0xff, 0])),
      'image/jpeg',
    );
    expect(
      patternPictureType(Uint8List.fromList(ascii.encode('RIFF0000WEBPVP8 '))),
      'image/webp',
    );
    expect(
      patternPictureType(Uint8List.fromList(ascii.encode('GIF89a0000000'))),
      isNull,
    );
    expect(isPatternPicture('Stripes'), isFalse);
    expect(isPatternPicture('data:image/png;base64,AAAA'), isTrue);
    expect(patternLabel('data:image/png;base64,AAAA'), 'My pattern');
    expect(patternLabel('Camo'), 'Camo');
  });

  testWidgets('full colour is marked for the viewer, kit colours is not', (
    tester,
  ) async {
    await tester.runAsync(() async {
      final src = await picture();
      expect(
        await isFullColourPattern(await preparePattern(src, 'full')),
        isTrue,
      );
      expect(
        await isFullColourPattern(await preparePattern(src, 'kit')),
        isFalse,
      );
    });
  });

  testWidgets(
    'switching keeps the picture: see-through parts and the mark pixels come back',
    (tester) async {
      await tester.runAsync(() async {
        final src = await picture(seeThrough: true);
        final full = await preparePattern(src, 'full');
        expect((await pixel(full, 30, 20))[3], 0);
        expect(await patternModeOf(Uint8List.fromList(full)), 'full');
        // Kit colours: the see-through half is white for the stencil (no ink), at the faintest opacity.
        final kit = await preparePattern(full, 'kit');
        expect(await patternModeOf(Uint8List.fromList(kit)), 'kit');
        expect(await pixel(kit, 30, 20), [255, 255, 255, 1]);
        // The two mark pixels took the colour below them.
        expect(await pixel(kit, 0, 0), await pixel(kit, 0, 1));
        expect(await pixel(kit, 1, 0), [0xdd, 0x22, 0x33, 255]);
        // Back to full colour: see-through again, the red half as it was.
        final again = await preparePattern(kit, 'full');
        expect(await patternModeOf(Uint8List.fromList(again)), 'full');
        expect((await pixel(again, 30, 20))[3], 0);
        expect(await pixel(again, 10, 20), [0xdd, 0x22, 0x33, 255]);
      });
    },
  );

  testWidgets(
    'upload, whole garment, an area, both modes, size, undo, save and reopen, delete',
    (tester) async {
      await tester.runAsync(() async {
        final server = FakeAssets();
        final c = signedIn(server);
        final message = await c.uploadOwnPattern('koru.png', await picture());
        expect(message, contains('whole garment'));
        expect(c.ownPatterns, hasLength(1));
        expect(await isFullColourPattern(c.patternTile!), isTrue);
        // Kit colours: the picture on the kit, as a stencil over the whole body.
        final full = c.patternTile!;
        expect(await c.setPatternMode(null, 'kit'), isTrue);
        expect(await isFullColourPattern(c.patternTile!), isFalse);
        expect(await patternModeOf(c.patternTile!), 'kit');
        expect(c.patternBody, 1);
        expect(await c.setPatternMode(null, 'kit'), isFalse);
        // Undo gives the full-colour picture back, and its mode with it.
        c.undo();
        expect(identical(c.patternTile, full), isTrue);
        expect(await patternModeOf(c.patternTile!), 'full');
        c.redo();
        expect(await patternModeOf(c.patternTile!), 'kit');
        // An area (the sleeves): full colour, as nothing was there.
        await c.applyOwnPattern(c.ownPatterns!.first, area: 'sleeves');
        expect(isPatternPicture(c.zones['sleeves']), isTrue);
        expect(await patternModeOf(zonePicture(c.zones['sleeves'])!), 'full');
        expect(await c.setPatternMode('sleeves', 'kit'), isTrue);
        expect(await patternModeOf(zonePicture(c.zones['sleeves'])!), 'kit');
        // Another pattern there keeps the area's colours.
        await c.applyOwnPattern(c.ownPatterns!.first, area: 'sleeves');
        expect(await patternModeOf(zonePicture(c.zones['sleeves'])!), 'kit');
        c.edit(() => c.patternScale = 0.6);
        c.undo();
        expect(c.patternScale, isNull);
        c.edit(() => c.patternScale = 0.6);
        // Saved to the server and opened again (website format).
        final design =
            ProjectSync.toServer(
                  Project(
                    title: 'Own',
                    sport: 'Rugby League',
                    garment: 'Jersey',
                    mode: 'DYO',
                    kit: c.kit,
                    updated: DateTime(2026),
                  ),
                )['design']
                as Map<String, dynamic>;
        expect(design['patternScale'], 0.6);
        expect(
          isPatternPicture((design['zones'] as Map)['sleeves'] as String),
          isTrue,
        );
        final back = reopened(c);
        expect(back.kit.zones['sleeves'], c.zones['sleeves']);
        expect(back.kit.patternScale, 0.6);
        expect(back.kit.patternBody, 1);
        // Each picture's mode is read from its own pixels.
        expect(await patternModeOf(back.kit.patternTile!), 'kit');
        expect(
          await patternModeOf(
            Uint8List.fromList(zonePicture(back.kit.zones['sleeves'])!),
          ),
          'kit',
        );
        // A fresh visit lists the account's patterns; delete removes one.
        final again = signedIn(server);
        await again.loadOwnPatterns();
        expect(again.ownPatterns, hasLength(1));
        await again.deleteOwnPattern(again.ownPatterns!.first.id);
        expect(again.ownPatterns, isEmpty);
        expect(server.files, isEmpty);
      });
    },
  );

  testWidgets('refuses other files and big pictures', (tester) async {
    await tester.runAsync(() async {
      final c = signedIn(FakeAssets());
      await expectLater(
        c.uploadOwnPattern(
          'x.gif',
          Uint8List.fromList(ascii.encode('GIF89a0000000')),
        ),
        throwsA(isA<ApiException>()),
      );
      final big = Uint8List(ownPatternMaxBytes + 1)
        ..setAll(0, [0x89, 0x50, 0x4e, 0x47]);
      await expectLater(
        c.uploadOwnPattern('big.png', big),
        throwsA(isA<ApiException>()),
      );
      final out = AppController(store: FakeStore());
      await expectLater(
        out.uploadOwnPattern('a.png', await picture()),
        throwsA(isA<ApiException>()),
      );
    });
  });

  testWidgets(
    'Studio › Patterns: the colour buttons follow the picture on the kit (panel closed and opened, undo, an area, a reopened project)',
    (tester) async {
      final server = FakeAssets();
      final c = signedIn(server)..screen = AppScreen.home;
      await tester.runAsync(() async {
        server.files[7] = await picture();
        await c.loadOwnPatterns();
      });
      await mountPhone(tester, c);
      c.startDyo();
      c.go(AppScreen.studio);
      await tester.pump(const Duration(milliseconds: 400));

      Future<void> openPatterns() async {
        await tapText(tester, 'Patterns');
        await tester.pump(const Duration(milliseconds: 400));
      }

      // Lets the picture work (real image decoding) finish.
      Future<void> settle(bool Function() done) async {
        for (var i = 0; i < 150 && !done(); i++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 10)),
          );
          await tester.pump();
        }
        await tester.pump();
      }

      bool chosen(String key) {
        final found = find.byKey(ValueKey(key));
        return found.evaluate().isNotEmpty &&
            tester.widget<ActionChipPill>(found).selected;
      }

      Future<void> tapKey(String key) async {
        await tester.ensureVisible(find.byKey(ValueKey(key)));
        await tester.pump();
        await tester.tap(find.byKey(ValueKey(key)));
        await tester.pump();
      }

      await openPatterns();
      // Nothing on the kit yet: the buttons are off, with a tip.
      expect(find.byKey(const ValueKey('own-pattern-tip')), findsOneWidget);
      expect(
        tester
            .widget<ActionChipPill>(
              find.widgetWithText(ActionChipPill, 'Kit colours'),
            )
            .onTap,
        isNull,
      );
      expect(find.byKey(const ValueKey('upload-pattern')), findsOneWidget);
      // A tap on the pattern: the whole garment, in full colour.
      await tapKey('own-pattern-7');
      await settle(() => chosen('own-mode-all-full'));
      expect(chosen('own-mode-all-full'), isTrue);
      expect(find.byKey(const ValueKey('own-pattern-tip')), findsNothing);
      // Kit colours, then the panel closed and opened again (QA V's steps):
      // still Kit colours, and Full colour turns it back.
      await tapKey('own-mode-all-kit');
      await settle(() => chosen('own-mode-all-kit'));
      expect(chosen('own-mode-all-kit'), isTrue);
      await tester.tap(find.byKey(const ValueKey('sheet-close')));
      await tester.pumpAndSettle();
      await openPatterns();
      await settle(() => chosen('own-mode-all-kit'));
      expect(chosen('own-mode-all-kit'), isTrue);
      expect(chosen('own-mode-all-full'), isFalse);
      await tapKey('own-mode-all-full');
      await settle(() => chosen('own-mode-all-full'));
      expect(chosen('own-mode-all-full'), isTrue);
      expect(
        await tester.runAsync(() => isFullColourPattern(c.patternTile!)),
        isTrue,
      );
      // Undo: Kit colours again, read from the picture.
      c.undo();
      await settle(() => chosen('own-mode-all-kit'));
      expect(chosen('own-mode-all-kit'), isTrue);
      // An area: the sleeves get their own buttons.
      await tester.runAsync(
        () => c.applyOwnPattern(c.ownPatterns!.first, area: 'sleeves'),
      );
      await settle(() => chosen('own-mode-sleeves-full'));
      expect(chosen('own-mode-sleeves-full'), isTrue);
      await tapKey('own-mode-sleeves-kit');
      await settle(() => chosen('own-mode-sleeves-kit'));
      expect(chosen('own-mode-sleeves-kit'), isTrue);
      expect(chosen('own-mode-all-kit'), isTrue);
      expect(find.text('My pattern'), findsWidgets);
      expect(find.byKey(const ValueKey('pattern-size')), findsOneWidget);
      // Saved and opened again: the buttons read the pictures.
      c.loadProject(reopened(c));
      await tester.pump(const Duration(milliseconds: 400));
      if (find.byKey(const ValueKey('own-mode-all-kit')).evaluate().isEmpty) {
        await openPatterns();
      }
      await settle(
        () => chosen('own-mode-all-kit') && chosen('own-mode-sleeves-kit'),
      );
      expect(chosen('own-mode-all-kit'), isTrue);
      expect(chosen('own-mode-sleeves-kit'), isTrue);
      await tapKey('own-mode-sleeves-full');
      await settle(() => chosen('own-mode-sleeves-full'));
      expect(chosen('own-mode-sleeves-full'), isTrue);
      expect(tester.takeException(), isNull);
    },
  );
}
