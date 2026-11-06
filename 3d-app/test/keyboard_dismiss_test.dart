import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_test/flutter_test.dart' as tw show testWidgets;
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/widgets/keyboard_dismiss.dart';
import 'package:three_deezi/widgets/ui.dart' show BottomNav;

/// The keyboard goes down on iPhones (user's picture 483, 2026-11-06): a tap
/// outside a text box, another screen or tab, a page closed.
void main() {
  // As on an iPhone.
  void testWidgets(String name, WidgetTesterCallback body) => tw.testWidgets(
    name,
    body,
    variant: TargetPlatformVariant.only(TargetPlatform.iOS),
  );

  Widget app(AppController c, Widget home) => MaterialApp(
    navigatorObservers: [KeyboardDismiss.observer],
    builder: (context, child) => KeyboardDismiss(controller: c, child: child!),
    home: Scaffold(body: home),
  );

  testWidgets('a tap outside closes it; the button still works', (t) async {
    final c = AppController()..screen = AppScreen.home;
    final node = FocusNode();
    var taps = 0;
    await t.pumpWidget(
      app(
        c,
        Column(
          children: [
            TextField(key: const ValueKey('box'), focusNode: node),
            const SizedBox(height: 200),
            ElevatedButton(
              key: const ValueKey('button'),
              onPressed: () => taps++,
              child: const Text('Go'),
            ),
            const SizedBox(height: 200, width: 300),
          ],
        ),
      ),
    );
    await t.tap(find.byKey(const ValueKey('box')));
    await t.pump();
    expect(node.hasPrimaryFocus, isTrue);
    expect(KeyboardDismiss.typing, isTrue);

    await t.tap(find.byKey(const ValueKey('button')));
    await t.pump();
    expect(node.hasFocus, isFalse);
    expect(taps, 1);

    // A drag that starts outside leaves the keyboard up.
    await t.tap(find.byKey(const ValueKey('box')));
    await t.pump();
    expect(node.hasPrimaryFocus, isTrue);
    await t.dragFrom(const Offset(390, 500), const Offset(0, -120));
    await t.pump();
    expect(node.hasPrimaryFocus, isTrue);

    // A tap on empty page closes it too.
    await t.tapAt(const Offset(390, 500));
    await t.pump();
    expect(node.hasFocus, isFalse);
    node.dispose();
  });

  testWidgets('buttons in the box\'s own tap region keep it up', (t) async {
    final c = AppController()..screen = AppScreen.home;
    final node = FocusNode();
    var sent = 0;
    await t.pumpWidget(
      app(
        c,
        TextFieldTapRegion(
          child: Row(
            children: [
              Expanded(child: TextField(focusNode: node)),
              IconButton(
                key: const ValueKey('send'),
                onPressed: () => sent++,
                icon: const Icon(Icons.send),
              ),
            ],
          ),
        ),
      ),
    );
    await t.tap(find.byType(TextField));
    await t.pump();
    await t.tap(find.byKey(const ValueKey('send')));
    await t.pump();
    expect(sent, 1);
    expect(node.hasPrimaryFocus, isTrue);
    node.dispose();
  });

  testWidgets('another screen or tab closes it', (t) async {
    final c = AppController()..screen = AppScreen.orderHub;
    final node = FocusNode();
    await t.pumpWidget(app(c, TextField(focusNode: node)));
    await t.tap(find.byType(TextField));
    await t.pump();
    expect(node.hasPrimaryFocus, isTrue);
    c.go(AppScreen.home);
    await t.pump();
    expect(node.hasFocus, isFalse);
    // Other changes on the same screen leave it alone.
    await t.tap(find.byType(TextField));
    await t.pump();
    c.update(() {});
    await t.pump();
    expect(node.hasPrimaryFocus, isTrue);
    node.dispose();
  });

  testWidgets('closing a page does not give the box underneath the keyboard '
      'again', (t) async {
    final c = AppController()..screen = AppScreen.home;
    final node = FocusNode();
    late BuildContext ctx;
    await t.pumpWidget(
      app(
        c,
        Builder(
          builder: (context) {
            ctx = context;
            return TextField(focusNode: node);
          },
        ),
      ),
    );
    await t.tap(find.byType(TextField));
    await t.pump();
    expect(node.hasPrimaryFocus, isTrue);
    // Opened while typing (not by a tap): the page takes the focus.
    Navigator.of(ctx).push(
      MaterialPageRoute<void>(builder: (_) => const Scaffold(body: Text('p'))),
    );
    await t.pumpAndSettle();
    expect(node.hasFocus, isFalse);
    Navigator.of(ctx).pop();
    await t.pumpAndSettle();
    expect(node.hasFocus, isFalse);
    expect(KeyboardDismiss.typing, isFalse);
    node.dispose();
  });

  testWidgets('the tab bar makes way while the keyboard is up', (t) async {
    final c = AppController()..screen = AppScreen.home;
    await t.pumpWidget(
      app(
        c,
        Align(
          alignment: Alignment.bottomCenter,
          child: BottomNav(controller: c),
        ),
      ),
    );
    expect(find.text('Projects'), findsOneWidget);
    t.view.viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(t.view.resetViewInsets);
    await t.pump();
    expect(find.text('Projects'), findsNothing);
    t.view.resetViewInsets();
    await t.pump();
    expect(find.text('Projects'), findsOneWidget);
  });
}
