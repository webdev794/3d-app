import 'dart:convert';
import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pointer_interceptor/pointer_interceptor.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/assist.dart';
import 'package:three_deezi/design_document.dart';
import 'package:three_deezi/screens/order_entry.dart' show openPayPage;
import 'package:three_deezi/screens/team.dart';
import 'package:three_deezi/widgets/assist_overlay.dart';
import 'package:three_deezi/widgets/flow_ui.dart' show GlowCard;
import 'package:three_deezi/widgets/studio_tools.dart';
import 'package:three_deezi/widgets/ui.dart';

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show mountPhone, tapText;
import 'team_app_test.dart' as team;

/// Screen readers (TalkBack, VoiceOver, and on the web NVDA or VoiceOver in the browser) move between buttons and
/// press them through the semantics tree. A button must be a node of its own: named by its own text, focusable and
/// pressable, and never inside another button (on the web a button inside a button can't be reached on its own).

/// The semantics node a screen reader gets for [button] (a GradientButton, or the OutlinedButton in a
/// SecondaryButton).
SemanticsNode _node(WidgetTester tester, Finder button) =>
    tester.getSemantics(button);

/// The node of the SecondaryButton showing [label].
Finder secondary(String label) => find.descendant(
  of: find.widgetWithText(SecondaryButton, label),
  matching: find.byType(OutlinedButton),
);

Finder gradient(String label) => find.widgetWithText(GradientButton, label);

void expectOwnButton(
  SemanticsNode node,
  String label, {
  bool enabled = true,
  String where = '',
}) {
  expect(node.label, label, reason: '$where: the button is named by its own text only');
  expect(node.flagsCollection.isButton, isTrue, reason: '$where: "$label" is a button');
  expect(
    node.flagsCollection.isEnabled,
    enabled ? Tristate.isTrue : Tristate.isFalse,
    reason: '$where: "$label" says whether it can be pressed',
  );
  expect(
    node.getSemanticsData().hasAction(SemanticsAction.tap),
    enabled,
    reason: '$where: a screen reader can press "$label"',
  );
  if (enabled) {
    expect(
      node.flagsCollection.isFocused,
      isNot(Tristate.none),
      reason: '$where: "$label" takes the focus (Tab on the web)',
    );
  }
  for (var p = node.parent; p != null; p = p.parent) {
    expect(
      p.flagsCollection.isButton,
      isFalse,
      reason: '$where: "$label" sits inside the button "${p.label}"',
    );
  }
}

/// No button on screen holds another button.
void expectNoNestedButtons(String where) {
  final buttons = find.semantics
      .byPredicate((n) => n.flagsCollection.isButton)
      .evaluate()
      .toList();
  expect(buttons, isNotEmpty, reason: where);
  for (final b in buttons) {
    for (var p = b.parent; p != null; p = p.parent) {
      expect(
        p.flagsCollection.isButton,
        isFalse,
        reason: '$where: "${b.label}" sits inside the button "${p.label}"',
      );
    }
  }
}

/// Every SecondaryButton (and GradientButton) built on screen is a button of its own.
Future<void> expectEveryButtonOwn(WidgetTester tester, String where) async {
  final secondaries = tester
      .widgetList<SecondaryButton>(find.byType(SecondaryButton))
      .toList();
  expect(
    secondaries.length + find.byType(GradientButton).evaluate().length,
    greaterThan(0),
    reason: '$where: buttons to check',
  );
  for (final b in secondaries) {
    final target = find.descendant(
      of: find.byWidget(b),
      matching: find.byType(OutlinedButton),
    );
    await tester.ensureVisible(target);
    await tester.pumpAndSettle();
    expectOwnButton(
      _node(tester, target),
      b.label,
      enabled: b.onPressed != null,
      where: where,
    );
  }
  for (final b in tester.widgetList<GradientButton>(
    find.byType(GradientButton),
  )) {
    await tester.ensureVisible(find.byWidget(b));
    await tester.pumpAndSettle();
    expectOwnButton(
      _node(tester, find.byWidget(b)),
      b.label,
      enabled: b.onPressed != null,
      where: where,
    );
  }
  expectNoNestedButtons(where);
}

/// The web build's PointerInterceptor: a platform view with a focus node of its own and no name, under the child.
class _WebLikeInterceptor extends PointerInterceptorPlatform {
  @override
  Widget buildWidget({required Widget child, bool debug = false, Key? key}) =>
      Stack(
        key: key,
        alignment: Alignment.center,
        children: [
          Positioned.fill(
            child: Focus(
              child: Semantics(container: true, child: const SizedBox.expand()),
            ),
          ),
          child,
        ],
      );
}

/// Focusable nodes a screen reader would announce with no name.
List<SemanticsNode> _unnamedFocusStops() => find.semantics
    .byPredicate(
      (n) =>
          n.flagsCollection.isFocused != Tristate.none &&
          n.label.isEmpty &&
          n.tooltip.isEmpty &&
          n.value.isEmpty &&
          n.hint.isEmpty,
    )
    .evaluate()
    .toList();

void main() {
  group('GradientButton and SecondaryButton', () {
    testWidgets(
      'in a card: each is a button of its own, the card text is not part of its name',
      (tester) async {
        var paid = 0, viewed = 0;
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Column(
                children: [
                  SurfaceCard(
                    child: Column(
                      children: [
                        const Text('SENT TO 3DEEZI DESIGN TEAM'),
                        GradientButton(
                          label: 'PAY NOW',
                          icon: Icons.credit_card,
                          onPressed: () => paid++,
                        ),
                        SecondaryButton(
                          label: 'View request',
                          onPressed: () => viewed++,
                        ),
                      ],
                    ),
                  ),
                  const SurfaceCard(
                    child: Column(
                      children: [
                        Text('Waiting for the designer'),
                        GradientButton(label: 'NOT YET', onPressed: null),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
        expectOwnButton(_node(tester, gradient('PAY NOW')), 'PAY NOW');
        expectOwnButton(_node(tester, secondary('View request')), 'View request');
        expectOwnButton(
          _node(tester, gradient('NOT YET')),
          'NOT YET',
          enabled: false,
        );
        expectNoNestedButtons('card');
        // Pressed as a screen reader does.
        tester.semantics.tap(find.semantics.byLabel('PAY NOW'));
        tester.semantics.tap(find.semantics.byLabel('View request'));
        expect((paid, viewed), (1, 1));
      },
    );
  });

  group('3DEEZI TEAM', () {
    testWidgets(
      'REQUEST A DESIGNER and VIEW MY REQUESTS are separate buttons; a screen reader opens my requests',
      (tester) async {
        final server = team.TeamServer();
        await team.mount(tester, TeamScreen(team.signedIn(server)));
        await expectEveryButtonOwn(tester, 'TEAM');
        expectOwnButton(
          _node(tester, gradient('REQUEST A DESIGNER')),
          'REQUEST A DESIGNER',
        );
        expectOwnButton(
          _node(tester, secondary('VIEW MY REQUESTS')),
          'VIEW MY REQUESTS',
        );
        tester.semantics.tap(find.semantics.byLabel('VIEW MY REQUESTS'));
        await tester.pumpAndSettle();
        expect(find.byType(TeamRequestsScreen), findsOneWidget);
      },
    );

    testWidgets(
      'after sending: PAY NOW and View request are buttons of their own a screen reader can press',
      (tester) async {
        final server = team.TeamServer(paid: true);
        String? opened;
        final original = openPayPage;
        openPayPage = (context, url, title) async => opened = url;
        addTearDown(() => openPayPage = original);
        final c = team.signedIn(server);
        int? viewed;
        await team.mount(
          tester,
          Builder(
            builder: (context) => TextButton(
              onPressed: () async => viewed = await Navigator.of(context)
                  .push<int>(
                    MaterialPageRoute(
                      builder: (_) => TeamRequestFormScreen(
                        c,
                        allowance: const {
                          'next_request': {
                            'billing': 'paid',
                            'total': '108.90',
                            'currency': 'AUD',
                          },
                          'can_submit': true,
                        },
                      ),
                    ),
                  ),
              child: const Text('open the form'),
            ),
          ),
        );
        await team.tap(tester, find.text('open the form'));
        await team.tap(tester, find.byKey(const Key('team-sport')));
        await team.tap(tester, find.text('Rugby League').last);
        await team.tap(tester, find.byKey(const Key('team-garments')));
        await team.tap(tester, find.text('Jersey'));
        await team.tap(tester, find.text('DONE'));
        await tester.enterText(
          find.byKey(const Key('team-description')),
          'Black and teal jersey with a tribal pattern',
        );
        await team.tap(tester, find.text('SEND DESIGN REQUEST'));
        expect(find.text('Your reference: TEAM-1009'), findsOneWidget);

        expectOwnButton(_node(tester, gradient('PAY NOW')), 'PAY NOW');
        expectOwnButton(_node(tester, secondary('View request')), 'View request');
        expect(
          find.semantics.byPredicate(
            (n) =>
                n.flagsCollection.isButton &&
                n.label.contains('SENT TO 3DEEZI DESIGN TEAM'),
          ),
          findsNothing,
          reason: 'the card is not a button',
        );
        await expectEveryButtonOwn(tester, 'TEAM sent');

        tester.semantics.tap(find.semantics.byLabel('PAY NOW'));
        await tester.pumpAndSettle();
        expect(opened, 'https://test.example/invoices/INV-2042?key=abc');
        tester.semantics.tap(find.semantics.byLabel('View request'));
        await tester.pumpAndSettle();
        expect(viewed, 9);
      },
    );

    testWidgets(
      'request detail: Message, Request revisions, Approve and Order this design are buttons of their own',
      (tester) async {
        final server = team.TeamServer();
        await team.mount(tester, TeamRequestScreen(team.signedIn(server), 3));
        await expectEveryButtonOwn(tester, 'TEAM request in review');
        expect(find.widgetWithText(SecondaryButton, 'Message'), findsOneWidget);
        server.status = 'approved';
        await team.mount(
          tester,
          TeamRequestScreen(
            team.signedIn(server),
            3,
            key: const ValueKey('approved'),
          ),
        );
        await tester.scrollUntilVisible(
          find.widgetWithText(SecondaryButton, 'Order this design'),
          300,
          scrollable: find.byType(Scrollable).first,
        );
        await expectEveryButtonOwn(tester, 'TEAM request approved');
      },
    );
  });

  group('every screen with a SecondaryButton', () {
    testWidgets('Profile: Sign in or register, pressed by a screen reader', (
      tester,
    ) async {
      final c = AppController(store: FakeStore())..screen = AppScreen.profile;
      await mountPhone(tester, c);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.widgetWithText(SecondaryButton, 'Sign in or register'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await expectEveryButtonOwn(tester, 'Profile');
      expectOwnButton(
        _node(tester, secondary('Sign in or register')),
        'Sign in or register',
      );
      tester.semantics.tap(find.semantics.byLabel('Sign in or register'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(c.screen, AppScreen.auth);
    });

    testWidgets('Plans & pricing: every plan button', (tester) async {
      final c = AppController(store: FakeStore())..screen = AppScreen.pricing;
      await mountPhone(tester, c);
      await tester.pumpAndSettle();
      await expectEveryButtonOwn(tester, 'Plans');
      expect(find.byType(SecondaryButton), findsWidgets);
    });

    testWidgets('Save project: EXPORT DESIGN and View My Projects', (
      tester,
    ) async {
      final c = AppController(store: FakeStore())..screen = AppScreen.home;
      await mountPhone(tester, c);
      c.startDyo();
      c.go(AppScreen.studio);
      await tester.pump(const Duration(milliseconds: 400));
      await tapText(tester, 'Save');
      await tester.enterText(find.byType(TextField), 'Thunder Home');
      await tapText(tester, 'SAVE PROJECT', last: true);
      expect(find.text('EXPORT DESIGN'), findsOneWidget);
      await expectEveryButtonOwn(tester, 'Saved');
      tester.semantics.tap(find.semantics.byLabel('View My Projects'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(c.screen, AppScreen.projects);
    });

    testWidgets('Studio: the Patterns and Logos sheets', (tester) async {
      final c = AppController(store: FakeStore())..screen = AppScreen.home;
      await mountPhone(tester, c);
      c.startDyo();
      c.go(AppScreen.studio);
      await tester.pump(const Duration(milliseconds: 400));
      for (final tool in ['Patterns', 'Logos']) {
        await tapText(tester, tool);
        await tester.pumpAndSettle();
        expect(find.byType(SecondaryButton), findsWidgets, reason: tool);
        await expectEveryButtonOwn(tester, 'Studio $tool');
        await tester.tapAt(const Offset(20, 20)); // closes the sheet
        await tester.pumpAndSettle();
      }
    });

    testWidgets('Studio: Artwork & layers, with and without a print layout', (
      tester,
    ) async {
      final c = AppController(store: FakeStore());
      addTearDown(c.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AnimatedBuilder(
              animation: c,
              builder: (_, _) =>
                  SingleChildScrollView(child: StudioArtworkTool(c)),
            ),
          ),
        ),
      );
      await expectEveryButtonOwn(tester, 'Artwork');
      c.edit(
        () => c.layout = copyLayout({
          'asset': 9,
          'name': 'Club print',
          'roles': ['front', 'back'],
          'parts': ['tee'],
        }),
      );
      await tester.pumpAndSettle();
      expect(
        find.widgetWithText(SecondaryButton, 'REMOVE PRINT LAYOUT'),
        findsOneWidget,
      );
      await expectEveryButtonOwn(tester, 'Artwork with a print layout');
    });

    testWidgets('Showcase: Share and Use as cover', (tester) async {
      final c = AppController(store: FakeStore())..screen = AppScreen.showcase;
      c.showcases.add(base64Decode(team.TeamServer.png));
      await mountPhone(tester, c);
      await tester.pumpAndSettle();
      final thumb = find.byType(GlowCard).last;
      await tester.ensureVisible(thumb);
      await tester.tap(thumb);
      await tester.pumpAndSettle();
      expect(find.widgetWithText(SecondaryButton, 'Use as cover'), findsOneWidget);
      await expectEveryButtonOwn(tester, 'Showcase');
    });
  });

  group('3DEEZI ASSIST launcher', () {
    late PointerInterceptorPlatform original;
    setUp(() => original = PointerInterceptorPlatform.instance);
    tearDown(() => PointerInterceptorPlatform.instance = original);

    Future<AssistController> mountAssist(WidgetTester tester) async {
      final c = AppController(store: FakeStore())..screen = AppScreen.projects;
      final assist = AssistController(c);
      addTearDown(assist.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(width: 400, height: 800, child: AssistOverlay(assist)),
          ),
        ),
      );
      return assist;
    }

    void expectLauncher(String label) {
      final nodes = find.semantics.byLabel(label).evaluate().toList();
      expect(nodes, hasLength(1), reason: 'one node named "$label"');
      final n = nodes.single;
      expect(n.flagsCollection.isButton, isTrue);
      expect(n.tooltip, isEmpty, reason: 'named once, not "3DEEZI ASSIST $label"');
      expect(n.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
      expect(n.flagsCollection.isFocused, isNot(Tristate.none), reason: 'Tab reaches it');
    }

    for (final web in [false, true]) {
      testWidgets(
        '${web ? 'web build' : 'phone'}: one focusable button named "Ask 3DEEZI ASSIST", no nameless stop; it opens and closes the chat',
        (tester) async {
          if (web) PointerInterceptorPlatform.instance = _WebLikeInterceptor();
          final assist = await mountAssist(tester);
          expectLauncher('Ask 3DEEZI ASSIST');
          expect(
            _unnamedFocusStops(),
            isEmpty,
            reason: 'nothing focusable without a name',
          );
          tester.semantics.tap(find.semantics.byLabel('Ask 3DEEZI ASSIST'));
          await tester.pumpAndSettle();
          expect(assist.open, isTrue);
          expect(find.text('AI help assistant'), findsOneWidget);
          expectLauncher('Hide 3DEEZI ASSIST');
          expect(
            _unnamedFocusStops(),
            isEmpty,
            reason: 'the open chat has no nameless focus stop either',
          );
          expectNoNestedButtons('Assist chat');
          tester.semantics.tap(find.semantics.byLabel('Hide 3DEEZI ASSIST'));
          await tester.pumpAndSettle();
          expect(assist.open, isFalse);
          expect(find.text('AI help assistant'), findsNothing);
          // A finger (or the mouse) still opens it.
          await tester.tap(find.byKey(const ValueKey('assist-launcher')));
          await tester.pumpAndSettle();
          expect(assist.open, isTrue);
        },
      );
    }
  });
}
