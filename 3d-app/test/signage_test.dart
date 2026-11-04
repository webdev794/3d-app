import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/marquee.dart';
import 'package:three_deezi/screens/signage.dart';

import 'features_test.dart' show FakeStore;
import 'sync_test.dart' show FakeServer;

/// SIGNAGE & MARQUEES in the app (client mockups 297 / 298, 2026-11-02): the
/// marquee's design (the website's marquee.ts), the landing page's products
/// and setup, and the Marquee Studio: zones, layers, undo, save and order on
/// the account. Marquee projects never become kits on this device.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('the marquee design', () {
    test('every panel shows the "3" emblem and the wordmark pictures', () {
      final d = defaultMarquee();
      for (final z in marqueeZones) {
        final srcs = [
          for (final l in (d['zones'] as Map)[z]['layers'] as List) l['src'],
        ];
        expect(srcs, containsAll([brandLogo, brandWordmark]), reason: z);
        expect(
          ((d['zones'] as Map)[z]['layers'] as List).any(
            (l) => l['type'] == 'text',
          ),
          isFalse,
          reason: '$z: no typed brand text',
        );
      }
    });

    test('the walls decide the zones and their sizes', () {
      final d = defaultMarquee();
      expect(marqueeZonesOf(d), [...marqueeZones.take(6), 'wallBack']);
      expect(marqueeZoneLabel('wallLeft', d), 'Left half wall');
      expect(marqueeZoneSize('wallLeft', d)!.h, 1.0);
      final roofOnly = {...d, 'walls': 'none', 'halfWall': false};
      expect(marqueeZonesOf(roofOnly), marqueeZones.take(5).toList());
      final full = {...d, 'size': '3x6', 'walls': 'full'};
      expect(marqueeZonesOf(full).length, 8);
      expect(marqueeZoneSize('wallBack', full)!.w, 6.0);
      expect(marqueeZoneSize('roof', full)!.w, closeTo(6.07, .001));
    });

    test('a saved design is made whole; the project and order bodies', () {
      final d = normalizeMarquee({
        'size': '3x6',
        'walls': 'nonsense',
        'zones': {
          'roof': {
            'color': 'red',
            'layers': [
              {'id': 'a', 'type': 'text', 'text': 'LEOPARDS'},
              'junk',
            ],
          },
        },
      });
      expect(d['size'], '3x6');
      expect(d['walls'], 'back');
      final roof = (d['zones'] as Map)['roof'] as Map;
      expect(roof['color'], '#05080c');
      expect((roof['layers'] as List).length, 1);
      final body = marqueeProjectBody('  ', d, thumbnail: 'data:x');
      expect(body['garment'], 'marquee');
      expect(body['name'], 'Custom marquee');
      expect((body['design'] as Map)['productName'], 'Custom marquee 3 × 6 m');
      expect((body['design'] as Map)['marquee'], same(d));
      final order = marqueeOrderBody(
        projectId: 4,
        version: 2,
        design: d,
        quantity: 3,
        contact: 'Sam',
      );
      expect(order['sizes'], {'3x6 m': 3});
      expect(order['names'], 'none');
      expect(order['design_final'], isTrue);
    });
  });

  testWidgets('the landing page: six products, Marquees ready, setup', (
    tester,
  ) async {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: SignageScreen(c)));
    await tester.pump();
    for (final p in signageProducts) {
      expect(find.byKey(ValueKey('signage-tile-${p.id}')), findsOneWidget);
    }
    expect(find.text('COMING SOON'), findsNWidgets(5));
    // The 3D stage (a placeholder without a WebView) and the setup.
    expect(find.byKey(const ValueKey('marquee-view-placeholder')), findsOne);
    await tester.drag(
      find.byKey(const ValueKey('signage-list')),
      const Offset(0, -700),
    );
    await tester.pump();
    expect(find.text('MARQUEE SETUP'), findsOneWidget);
    await tester.tap(find.text('Full walls'));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('the studio: zones, layers, undo, save and order', (
    tester,
  ) async {
    final server = FakeServer();
    final c = AppController(
      store: FakeStore(),
      api: ApiClient(client: server.client, baseUrl: 'https://test.example'),
    );
    addTearDown(c.dispose);
    await c.register(
      name: 'Fabian',
      email: 'fabian@3deezi.com',
      password: 'secret-pass-1',
      passwordConfirmation: 'secret-pass-1',
    );
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final key = GlobalKey<MarqueeStudioScreenState>();
    await tester.pumpWidget(
      MaterialApp(
        home: MarqueeStudioScreen(c, key: key, design: defaultMarquee()),
      ),
    );
    await tester.pump();
    final s = key.currentState!;
    expect(s.current, 'wallBack');

    // Pick the front valance, add text, pick a pattern; undo the pattern.
    await tester.tap(find.byKey(const ValueKey('marquee-zone-valanceFront')));
    await tester.pump();
    expect(s.current, 'valanceFront');
    await tester.tap(find.byKey(const ValueKey('marquee-tool-text')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('marquee-add-text')));
    await tester.pump();
    expect(s.layer?['type'], 'text');
    await tester.enterText(
      find.byKey(const ValueKey('marquee-text-field')),
      'LEOPARDS',
    );
    await tester.pump();
    expect(s.layer?['text'], 'LEOPARDS');
    await tester.tap(find.byKey(const ValueKey('marquee-tool-patterns')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('marquee-pattern-Chevron')));
    await tester.pump();
    expect(s.pattern?['name'], 'Chevron');
    await tester.tap(find.byKey(const ValueKey('marquee-undo')));
    await tester.pump();
    expect(s.pattern?['name'], 'Blades');

    // Save: a marquee project on the account (not a kit on this device).
    expect(await s.save(), isTrue);
    // (The "Saved" note goes away before the next taps.)
    ScaffoldMessenger.of(
      tester.element(find.byType(Scaffold).first),
    ).removeCurrentSnackBar();
    await tester.pumpAndSettle();
    final saved = server.projects.values.single;
    expect(saved['garment'], 'marquee');
    final front =
        ((saved['design'] as Map)['marquee'] as Map)['zones']['valanceFront'];
    expect(
      (front['layers'] as List).any((l) => l['text'] == 'LEOPARDS'),
      isTrue,
    );
    await c.syncProjects();
    expect(c.projects.where((p) => p.remoteId != null), isEmpty);

    // Review and order two marquees.
    await tester.dragUntilVisible(
      find.byKey(const ValueKey('marquee-review')),
      find.byKey(const ValueKey('marquee-studio-list')),
      const Offset(0, -300),
    );
    await tester.ensureVisible(find.byKey(const ValueKey('marquee-review')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('marquee-review')));
    await tester.pumpAndSettle();
    await tester.dragUntilVisible(
      find.byKey(const ValueKey('marquee-final')),
      find.byKey(const ValueKey('marquee-review-list')),
      const Offset(0, -300),
    );
    await tester.ensureVisible(find.byKey(const ValueKey('marquee-final')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('marquee-final')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('marquee-order')));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.add_circle_outline));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('marquee-place-order')));
    await tester.pumpAndSettle();
    final order = server.orders.single;
    expect(order['sizes'], {'3x3 m': 2});
    expect(order['project_id'], saved['id']);
    expect(order['contact_name'], 'Fabian');
    await tester.pump(const Duration(seconds: 2));
    expect(tester.takeException(), isNull);
  });
}
