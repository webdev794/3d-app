import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/assist.dart';
import 'package:three_deezi/widgets/assist_overlay.dart';

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show mountPhone;

/// 3DEEZI ASSIST in the app, against a fake `/api/v1/assist`.
void main() {
  late List<Map<String, dynamic>> sent;
  late Map<String, dynamic> Function(Map<String, dynamic>) answer;

  AppController controller() => AppController(
    store: FakeStore(),
    api: ApiClient(
      baseUrl: 'https://test.example',
      client: MockClient((r) async {
        sent.add(jsonDecode(r.body) as Map<String, dynamic>);
        return http.Response(jsonEncode({'data': answer(sent.last)}), 200);
      }),
    ),
  );

  setUp(() => sent = []);

  test(
    'asks the website, as the app that runs commands, and shows the answer',
    () async {
      answer = (_) => {
        'reply': 'Choose **AI Powered Sportswear** to start.',
        'actions': [],
        'source': 'ai',
      };
      final c = controller()..screen = AppScreen.home;
      final assist = AssistController(c);

      await assist.ask('How do I start designing?');

      expect(sent.single['client'], 'app');
      expect(sent.single['can'], ['commands']);
      expect(sent.single['page'], '/');
      expect(sent.single['messages'], [
        {'role': 'user', 'content': 'How do I start designing?'},
      ]);
      expect(assist.messages.map((m) => m.text), [
        'How do I start designing?',
        'Choose **AI Powered Sportswear** to start.',
      ]);
      expect(assist.open, isTrue);
      expect(assist.busy, isFalse);
    },
  );

  test(
    'runs commands on the screen that registered them, opening it first',
    () async {
      answer = (_) => {
        'reply': 'Done: the back view and shorts.',
        'actions': [
          {'action': 'view', 'value': 'back'},
          {'action': 'garment', 'value': 'shorts'},
          {'action': 'grid', 'value': 'on'},
        ],
      };
      final c = controller()..screen = AppScreen.home;
      final assist = AssistController(c);
      final ran = <String>[];
      Future<String> studio(String action, String value) async {
        ran.add('$action:$value');
        return action == 'view' ? 'Back view' : 'Garment: Shorts';
      }

      // The Studio registers once it is on screen; the Artboard never opens in this test.
      c.addListener(() {
        if (c.screen == AppScreen.studio)
          AssistBridge.register('studio', studio);
      });
      await assist.ask('show me the back of the shorts');
      AssistBridge.unregister('studio', studio);

      expect(ran, ['view:back', 'garment:shorts']);
      final done = assist.messages.last.done!;
      expect(done.take(2).map((d) => (d.ok, d.text)), [
        (true, 'Back view'),
        (true, 'Garment: Shorts'),
      ]);
      expect(done.last.ok, isFalse); // the Artboard did not open here
      expect(c.screen, AppScreen.artboard);
      expect(
        assist.open,
        isFalse,
        reason: 'the chat gets out of the way to show what changed',
      );
    },
    timeout: const Timeout(Duration(seconds: 40)),
  );

  test('says it could not, when every command fails', () async {
    answer = (_) => {
      'reply': 'Done: the text is selected.',
      'actions': [
        {'action': 'select', 'value': 'text'},
      ],
    };
    final c = controller()..screen = AppScreen.artboard;
    final assist = AssistController(c);
    Future<String> artboard(String a, String v) async =>
        throw AssistError('There is no text on the page.');
    AssistBridge.register('artboard', artboard);
    await assist.ask('select the text');
    AssistBridge.unregister('artboard', artboard);

    expect(assist.messages.last.text, "I couldn't do that:");
    expect(
      assist.messages.last.done!.single.text,
      'There is no text on the page.',
    );
  });

  test('links and open commands go to the matching app screen', () {
    final c = controller()..screen = AppScreen.home;
    final assist = AssistController(c);
    assist.openPath('/pricing');
    expect(c.screen, AppScreen.pricing);
    assist.openPath('/artboard');
    expect(c.screen, AppScreen.artboard);
    assist.openPath('/#create-options');
    expect(c.screen, AppScreen.home);
    expect(AssistController.isPage('/studio'), isTrue);
    expect(AssistController.isPage('https://example.com'), isFalse);
    expect(AssistController.pathOf(AppScreen.garment), '/create/sport');
  });

  testWidgets(
    'the launcher opens the chat with suggestions; a link opens its screen',
    (tester) async {
      answer = (_) => {
        'reply': 'Compare them on [the plans page](/pricing).',
        'actions': [],
      };
      // The Home has its own Assist link instead (see below).
      final c = controller()..screen = AppScreen.projects;
      final assist = AssistController(c);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 400,
              height: 800,
              child: AssistOverlay(assist),
            ),
          ),
        ),
      );

      final launcher = find.byKey(const ValueKey('assist-launcher'));
      expect(launcher, findsOneWidget);
      await tester.tap(launcher);
      await tester.pumpAndSettle();
      expect(find.text('AI help assistant'), findsOneWidget);
      expect(find.text('Which plan suits my team?'), findsOneWidget);

      // The question goes to the (fake) server in real time.
      await tester.runAsync(() => assist.ask('Which plan suits my team?'));
      await tester.pumpAndSettle(); // the chat scrolls to the answer
      expect(find.textContaining('Compare them on'), findsOneWidget);

      await tester.tap(find.textContaining('the plans page'));
      await tester.pump();
      expect(c.screen, AppScreen.pricing);
      expect(assist.open, isFalse);
    },
  );

  testWidgets(
    'Home: "Ask 3DEEZI Assist" opens the chat; the round launcher only then',
    (tester) async {
      final c = controller()..screen = AppScreen.home;
      await mountPhone(tester, c);
      final launcher = find.byKey(const ValueKey('assist-launcher'));
      expect(launcher, findsNothing);
      final link = find.byKey(const ValueKey('home-assist-link'));
      await tester.ensureVisible(link);
      await tester.tap(link);
      await tester.pumpAndSettle();
      expect(find.text('AI help assistant'), findsOneWidget);
      expect(find.text('How do I start designing?'), findsOneWidget);
      // The launcher shows while the chat is open, and closes it.
      expect(launcher, findsOneWidget);
      await tester.tap(launcher);
      await tester.pumpAndSettle();
      expect(find.text('AI help assistant'), findsNothing);
      expect(launcher, findsNothing);
    },
  );

  testWidgets(
    'the round launcher shows on every screen but Home, Orders and start-up',
    (tester) async {
      final c = controller();
      final assist = AssistController(c);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 400,
              height: 800,
              child: AssistOverlay(assist),
            ),
          ),
        ),
      );
      final launcher = find.byKey(const ValueKey('assist-launcher'));
      for (final s in AppScreen.values) {
        c.update(() => c.screen = s);
        await tester.pump();
        // Home and the Orders tab have their own Assist link instead.
        final hidden =
            AssistController.hiddenOn.contains(s) ||
            s == AppScreen.home ||
            s == AppScreen.orderHub;
        expect(launcher, hidden ? findsNothing : findsOneWidget, reason: '$s');
      }
    },
  );

  testWidgets('hidden while the app starts', (tester) async {
    final c = controller()..screen = AppScreen.splash;
    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: AssistOverlay(AssistController(c)))),
    );
    expect(find.byKey(const ValueKey('assist-launcher')), findsNothing);
  });
}
