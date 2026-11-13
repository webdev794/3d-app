import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/project_sync.dart';
import 'package:three_deezi/sports_catalog.dart';

import 'features_test.dart' show FakeStore;

/// The names the website's ProjectRequest takes (website/app/Http/Requests/
/// ProjectRequest.php `public const NAME = [...]`).
List<String> serverList(String name) {
  final php = File(
    'website/app/Http/Requests/ProjectRequest.php',
  ).readAsStringSync();
  final m = RegExp(
    'public const $name = \\[([^\\]]*)\\]',
    multiLine: true,
  ).firstMatch(php);
  expect(m, isNotNull, reason: 'ProjectRequest::$name');
  return [
    for (final q in RegExp(r"'([^']+)'").allMatches(m!.group(1)!)) q.group(1)!,
  ];
}

/// The layer fields ProjectRequest takes ('design.layers.*' => ['array:...']).
List<String> serverLayerFields() {
  final php = File(
    'website/app/Http/Requests/ProjectRequest.php',
  ).readAsStringSync();
  final m = RegExp(
    r"'design\.layers\.\*' => \['array:([^']+)'",
  ).firstMatch(php);
  expect(m, isNotNull);
  return m!.group(1)!.split(',');
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test(
    'QA10: every garment tile saved from the app has only names the website takes',
    () {
      final parts = serverList('PARTS');
      final areas = serverList('ZONE_COLORS');
      final marks = serverList('MARKS');
      final fonts = serverList('LAYER_FONTS');
      final layerFields = serverLayerFields();
      var checked = 0;
      for (final sport in sportCategories) {
        for (final t in sport.tiles) {
          final look = t.look;
          if (look == null || t.garment == null) continue;
          final c = AppController(store: FakeStore())
            ..sport = sport.name
            ..garment = t.garment!;
          c.startLook(tileLook(look, picture: t.art));
          final where = '${sport.name} › ${t.name}';
          final body = ProjectSync.toServer(
            Project(
              title: t.name,
              sport: sport.name,
              garment: t.garment!,
              mode: 'DYO',
              kit: c.kit,
              updated: DateTime(2026, 11, 11),
            ),
          );
          final d = body['design'] as Map<String, dynamic>;
          for (final k in ((d['parts'] as Map?) ?? const {}).keys) {
            expect(parts, contains(k), reason: '$where: part $k');
          }
          for (final k in ((d['zoneColors'] as Map?) ?? const {}).keys) {
            expect(areas, contains(k), reason: '$where: colour area $k');
          }
          for (final k in ((d['marks'] as Map?) ?? const {}).keys) {
            expect(marks, contains(k), reason: '$where: mark $k');
          }
          for (final l in (d['layers'] as List).cast<Map>()) {
            for (final k in l.keys) {
              expect(layerFields, contains(k), reason: '$where: layer $k');
            }
            if (l['font'] != null) {
              expect(fonts, contains(l['font']), reason: '$where: font');
            }
          }
          // The tile's own pattern is kept (the shooting shirt's Shards).
          expect(
            d['pattern'],
            tileLook(look, picture: t.art)['pattern'] == 'None'
                ? 'Solid'
                : tileLook(look, picture: t.art)['pattern'],
            reason: '$where: pattern',
          );
          checked++;
        }
      }
      expect(checked, greaterThan(50));
    },
  );

  test(
    'QA10: a save the account refuses says so clearly and is tried again',
    () async {
      var refuse = true;
      final posted = <Map<String, dynamic>>[];
      final client = MockClient((r) async {
        final path = r.url.path.replaceFirst('/api/v1', '');
        if (path == '/projects' && r.method == 'GET') {
          return http.Response(jsonEncode({'data': []}), 200);
        }
        if (path == '/projects' && r.method == 'POST') {
          if (refuse) {
            return http.Response(
              jsonEncode({
                'message': 'The design.parts field must be an array.',
                'errors': {
                  'design.parts': ['The design.parts field must be an array.'],
                },
              }),
              422,
            );
          }
          final body = jsonDecode(r.body) as Map<String, dynamic>;
          posted.add(body);
          return http.Response(
            jsonEncode({
              'data': {...body, 'id': 7, 'version': 1},
            }),
            201,
          );
        }
        return http.Response('{}', 404);
      });
      final c = AppController(
        store: FakeStore(),
        api: ApiClient(client: client, baseUrl: 'https://test.example'),
      );
      c.user = const ApiUser(id: 1, name: 'Pat', email: 'pat@example.test');
      c.api.token = 'tok';
      c.sport = 'Rugby League';
      c.garment = 'Full Kit';
      c.startLook(tileLook('rugbyTile', picture: 'rugby-kit'));

      expect(await c.saveProject('Rugby League Kit'), isTrue);
      final p = c.projects.first;
      expect(p.pendingUpload, isTrue);
      expect(p.remoteId, isNull);
      expect(
        c.saveNotice,
        'Saved on this device, but not on your account yet (The design.parts '
        'field must be an array). The app will try again by itself; you can '
        'also tap Sync now in Projects.',
      );
      expect(p.syncError, c.saveNotice);

      // Not before its wait, unless asked now (the app coming back).
      await c.retryUploads();
      expect(p.remoteId, isNull);
      refuse = false;
      await c.retryUploads(now: true);
      expect(p.remoteId, 7);
      expect(p.pendingUpload, isFalse);
      expect(p.syncError, isNull);
      final d = posted.single['design'] as Map<String, dynamic>;
      expect((d['parts'] as Map).keys, containsAll(['sockBand', 'sockFoot']));
      expect((d['zoneColors'] as Map).keys, contains('sweepDeep'));
      expect(
        (d['layers'] as List).any((l) => (l as Map)['font'] == 'JerseyBlock'),
        isTrue,
      );
      // A later save that reaches the account has no notice.
      expect(await c.saveProject('Rugby League Kit'), isTrue);
      expect(c.saveNotice, isNull);
    },
  );
}
