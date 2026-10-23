import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/design_document.dart';
import 'package:three_deezi/screens/library.dart' show ProfileScreen;
import 'package:three_deezi/screens/orders_board.dart';
import 'package:three_deezi/screens/team.dart';
import 'package:three_deezi/widgets/order_form_read.dart';
import 'package:three_deezi/widgets/studio_tools.dart';

import 'features_test.dart' show FakeStore;
import 'team_app_test.dart' as team;

/// Counts read with their nouns in the right number ("1 player", "2 players"), and the order page names its status
/// once.

Future<void> _show(WidgetTester tester, Widget child) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(420, 1000);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child))),
  );
  await tester.pumpAndSettle();
}

/// A TEAM request with one revision in its plan, none used.
class _OneRevisionServer extends team.TeamServer {
  @override
  Map<String, dynamic> request(int id, String s) => {
    ...super.request(id, s),
    'revisions_used': 0,
    'revisions_allowed': 1,
  };
}

Map<String, dynamic> _order({
  required String stage,
  required String stageLabel,
  Map<String, dynamic>? sub,
  int quantity = 1,
}) => {
  'id': 9,
  'number': '3DZ-00009',
  'status': 'pending',
  'name': 'Northside Hawks',
  'stage': stage,
  'stage_label': stageLabel,
  if (sub != null) 'sub_status': sub,
  'approval': 'waiting',
  'quantity': quantity,
  'currency': 'AUD',
  'sizes': {'M': quantity},
  'items': [],
  'garments': [],
  'files': [],
  'proofs': [],
  'updates': [],
  'stages_reached': [],
  'submitted_at': '2026-10-23T05:45:41+00:00',
};

Future<void> _detail(WidgetTester tester, Map<String, dynamic> order) async {
  final client = MockClient(
    (r) async => r.url.path.endsWith('/orders/9')
        ? http.Response(
            jsonEncode({'data': order}),
            200,
            headers: {'content-type': 'application/json'},
          )
        : http.Response('{"data":{"unread":0,"items":[]}}', 200),
  );
  final c = AppController(
    store: FakeStore(),
    api: ApiClient(client: client, baseUrl: 'https://test.example'),
  )..user = const ApiUser(id: 1, name: 'Pat', email: 'pat@example.test');
  c.api.token = 'tok';
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(390, 900);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(home: OrderDetailScreen(c, 9, key: UniqueKey())),
  );
  await tester.pumpAndSettle();
}

/// The texts of the status pills at the top of the order page.
List<String> _pills(WidgetTester tester) => tester
    .widgetList<Text>(
      find.descendant(
        of: find.byKey(const Key('order-status')),
        matching: find.byType(Text),
      ),
    )
    .map((t) => t.data ?? '')
    .toList();

void main() {
  group('counts with their nouns', () {
    testWidgets(
      'Upload Your Order, the rows read from the form: "Total: 1 garment · 1 player"',
      (tester) async {
        final reading = {
          'source': 'ai',
          'items': [
            {
              'garment': 'jersey',
              'fit': 'youth',
              'name': 'Rugby League Jersey',
              'sizes': {'16Y': 1},
              'players': [
                {'name': 'HALE', 'number': '6', 'size': '16Y'},
              ],
            },
          ],
          'details': [],
          'unknown': [],
          'form': {},
        };
        final rows = readRows(reading);
        await _show(
          tester,
          StatefulBuilder(
            builder: (context, setState) => OrderFormReadView(
              rows: rows,
              reading: reading,
              fileName: 'club.xlsx',
              correct: false,
              onCorrect: (_) {},
              onChanged: () => setState(() {}),
            ),
          ),
        );
        expect(find.text('Total: 1 garment · 1 player'), findsOneWidget);
        expect(find.textContaining('1 players'), findsNothing);
        // A second 16Y: two garments, still one player.
        await tester.enterText(find.byKey(const Key('size-0-16Y')), '2');
        await tester.pump();
        expect(find.text('Total: 2 garments · 1 player'), findsOneWidget);
        // Taking the player off also takes their size off.
        await tester.tap(find.byTooltip('Remove this player'));
        await tester.pump();
        expect(find.text('Total: 1 garment'), findsOneWidget);
      },
    );

    testWidgets('My orders card: "1 garment", "36 garments"', (tester) async {
      for (final (quantity, text) in [(1, '1 garment'), (36, '36 garments')]) {
        await _show(
          tester,
          OrderBoardCard(
            _order(
              stage: 'received',
              stageLabel: 'Order Received',
              sub: {'label': 'Order received', 'tone': 'blue'},
              quantity: quantity,
            ),
            key: ValueKey(quantity),
          ),
        );
        expect(find.text(text), findsOneWidget);
      }
    });

    testWidgets(
      'TEAM: turnaround and revisions of one read "1 business day" and "1 revision"',
      (tester) async {
        expect(
          teamPromise({
            'turnaround': {'first_draft_days': 1},
          }),
          'First design within 1 business day',
        );
        expect(teamPromise(null), 'First design within 3 business days');
        await _show(
          tester,
          const TeamGoodToKnow(
            allowance: {
              'turnaround': {'first_draft_days': 1, 'revision_days': 1},
              'revisions_per_request': 1,
            },
          ),
        );
        await tester.tap(
          find.text('Good to know: turnaround, revisions and refunds'),
        );
        await tester.pumpAndSettle();
        final text = tester
            .widgetList<Text>(find.byType(Text))
            .map((t) => t.textSpan?.toPlainText() ?? t.data ?? '')
            .join('\n');
        expect(
          text,
          contains(
            'First design within 1 business day; each revision within 1 business day',
          ),
        );
        expect(text, contains('Your plan includes 1 revision per request.'));
        expect(text, isNot(contains('1 business days')));
      },
    );

    testWidgets(
      'TEAM request: "1 of 1 revision left"; the revision sheet counts "1 file added", "2 files added"',
      (tester) async {
        pickTeamFiles = (kind) async => [
          (name: 'note.png', bytes: base64Decode(team.TeamServer.png)),
        ];
        addTearDown(() => pickTeamFiles = (kind) async => []);
        final server = _OneRevisionServer();
        await team.mount(tester, TeamRequestScreen(team.signedIn(server), 3));
        await tester.scrollUntilVisible(
          find.text('1 of 1 revision left'),
          300,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text('1 of 1 revision left'), findsOneWidget);
        await team.tap(tester, find.text('Request revisions'));
        await team.tap(tester, find.text('Add pictures or notes'));
        expect(find.text('1 file added'), findsOneWidget);
        await team.tap(tester, find.text('1 file added'));
        expect(find.text('2 files added'), findsOneWidget);
      },
    );

    testWidgets('Profile: one project reads "1 Project" and "1 AI design"', (
      tester,
    ) async {
      final c = AppController(store: FakeStore());
      addTearDown(c.dispose);
      c.projects.removeRange(1, c.projects.length); // the first sample is an AI design
      await _show(tester, SizedBox(height: 1400, child: ProfileScreen(c)));
      expect(find.text('Project'), findsOneWidget);
      expect(find.text('AI design'), findsOneWidget);
      // "Projects" stays on the bottom bar's tab only.
      expect(find.text('Projects'), findsOneWidget);
      c.projects.add(c.projects.first);
      await _show(
        tester,
        SizedBox(
          height: 1400,
          child: ProfileScreen(c, key: const ValueKey('two')),
        ),
      );
      expect(find.text('Project'), findsNothing);
      expect(find.text('Projects'), findsNWidgets(2));
      expect(find.text('AI designs'), findsOneWidget);
    });

    testWidgets('Studio print layout: "1 panel on the kit"', (tester) async {
      final c = AppController(store: FakeStore());
      addTearDown(c.dispose);
      for (final (roles, text) in [
        (['front', 'none'], 'Club print · 1 panel on the kit'),
        (['front', 'back'], 'Club print · 2 panels on the kit'),
      ]) {
        c.edit(
          () => c.layout = copyLayout({
            'asset': 9,
            'name': 'Club print',
            'roles': roles,
            'parts': ['tee'],
          }),
        );
        await _show(tester, StudioArtworkTool(c, key: ValueKey(text)));
        expect(find.text(text), findsOneWidget);
      }
    });

    test('a print layout with one panel: "1 panel from club.pdf"', () async {
      final c = AppController(
        store: FakeStore(),
        api: ApiClient(
          baseUrl: 'https://test.example',
          client: MockClient(
            (r) async => r.url.path.endsWith('/assets')
                ? http.Response('{"data":{"id":5}}', 201)
                : http.Response('{}', 200),
          ),
        ),
      );
      addTearDown(c.dispose);
      c.checkLayout = (src, name, asset, {drawing = false, garment}) async => {
        'roles': ['front'],
        'panels': [
          {'role': 'front'},
        ],
        'parts': ['tee'],
      };
      expect(
        await c.importPrintLayout('club.pdf', Uint8List(8)),
        'Print layout on the 3D kit: 1 panel from club.pdf. Save the project to keep it.',
      );
    });
  });

  group('order page status', () {
    testWidgets(
      'one pill: "Order received", not also "Order Received"; Delivered and Cancelled once',
      (tester) async {
        for (final (stage, stageLabel, sub) in [
          ('received', 'Order Received', 'Order received'),
          ('delivered', 'Delivered', 'Delivered'),
          ('cancelled', 'Cancelled', 'Cancelled'),
          ('design', 'Design & Approval', 'Approval needed'),
        ]) {
          await _detail(
            tester,
            _order(
              stage: stage,
              stageLabel: stageLabel,
              sub: {'key': stage, 'label': sub, 'tone': 'blue'},
            ),
          );
          expect(_pills(tester), [sub], reason: stage);
          expect(find.text(stageLabel), stageLabel == sub ? findsWidgets : findsNothing, reason: stage);
          expect(tester.takeException(), isNull);
        }
      },
    );

    testWidgets('an order without a sub-status shows its stage, never "null"', (
      tester,
    ) async {
      await _detail(
        tester,
        _order(stage: 'production', stageLabel: 'Production'),
      );
      expect(_pills(tester), ['Production']);
      expect(find.textContaining('null'), findsNothing);
    });
  });
}
