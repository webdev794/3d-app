import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/widgets/ui.dart' show OverViewer;

import 'flow_test.dart' show tapText;
import 'studio_panel_test.dart' show closeApp, openStudio;

/// Tap the kit to choose the colour (191.png): the viewer's 'colourPick'
/// message switches the open Colours panel to the tapped part's colour.
void main() {
  bool lit(WidgetTester tester, int i) =>
      tester
          .getSemantics(find.byKey(ValueKey('colour-tab-$i')))
          .flagsCollection
          .isSelected ==
      Tristate.isTrue;

  testWidgets('a tap on the kit switches the Colours tab; the tip shows once', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final handle = tester.ensureSemantics();
    var c = await openStudio(tester, 390, 844);
    // Panel closed: tap-to-pick is off, nothing listens.
    expect(c.colourPick, isNull);

    await tapText(tester, 'Colours');
    await tester.pumpAndSettle();
    expect(c.colourPick, isNotNull);
    expect(find.text('Tip: tap the kit to pick a colour.'), findsOneWidget);
    expect(lit(tester, 0), isTrue);

    c.colourPick!({'type': 'colourPick', 'hit': true, 'slot': 'secondary'});
    await tester.pumpAndSettle();
    expect(lit(tester, 1), isTrue);
    expect(lit(tester, 0), isFalse);
    // The tip goes once used.
    expect(find.text('Tip: tap the kit to pick a colour.'), findsNothing);

    c.colourPick!({'type': 'colourPick', 'hit': true, 'slot': 'accent'});
    await tester.pumpAndSettle();
    expect(lit(tester, 2), isTrue);

    // The tabs still work by hand.
    await tester.tap(find.byKey(const ValueKey('colour-tab-0')));
    await tester.pumpAndSettle();
    expect(lit(tester, 0), isTrue);

    // Closed: no listener, a late message changes nothing.
    await tester.tap(find.byKey(const ValueKey('colour-done')));
    await tester.pumpAndSettle();
    expect(c.colourPick, isNull);

    // Opened again: the tip is not shown a second time.
    await tapText(tester, 'Colours');
    await tester.pumpAndSettle();
    expect(find.text('Tip: tap the kit to pick a colour.'), findsNothing);
    await closeApp(tester, c);

    // A hoodie area: the hood gets its own colour row in the panel.
    c = await openStudio(tester, 390, 844);
    c.update(() => c.garment = 'Hoodie');
    await tapText(tester, 'Colours');
    await tester.pumpAndSettle();
    c.colourPick!({
      'type': 'colourPick',
      'hit': true,
      'slot': 'main',
      'area': 'hood',
    });
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('colour-area')), findsOneWidget);
    expect(find.textContaining('Hood: #'), findsOneWidget);
    // A kit colour tab leaves the area.
    await tester.tap(find.byKey(const ValueKey('colour-tab-1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('colour-area')), findsNothing);
    handle.dispose();
    await closeApp(tester, c);
  });

  testWidgets('a tap on the pattern: the Pattern tab; a picture pattern '
      'shows the Kit colours tip', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final handle = tester.ensureSemantics();
    final c = await openStudio(tester, 390, 844);
    await tapText(tester, 'Colours');
    await tester.pumpAndSettle();
    c.colourPick!({'type': 'colourPick', 'hit': true, 'slot': 'pattern'});
    await tester.pumpAndSettle();
    expect(lit(tester, 3), isTrue);
    expect(find.byKey(const ValueKey('colour-picture-tip')), findsNothing);

    c.colourPick!({'type': 'colourPick', 'hit': true, 'slot': 'main'});
    await tester.pumpAndSettle();
    c.colourPick!({'type': 'colourPick', 'hit': true, 'slot': 'pattern-image'});
    await tester.pumpAndSettle();
    expect(
      find.text('Switch to Kit colours to recolour this pattern.'),
      findsOneWidget,
    );
    // A tab by hand clears the tip.
    await tester.tap(find.byKey(const ValueKey('colour-tab-0')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('colour-picture-tip')), findsNothing);
    handle.dispose();
    await closeApp(tester, c);
  });

  testWidgets('Front / Back / Side: every press turns the 3D, also the view '
      'already chosen', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final c = await openStudio(tester, 390, 844);
    final bar = find.byKey(const ValueKey('studio-views'));
    // Over the 3D's web frame, the bar takes its own clicks.
    expect(
      find.ancestor(of: bar, matching: find.byType(OverViewer)),
      findsOneWidget,
    );
    Future<void> press(String view) async {
      await tester.tap(find.descendant(of: bar, matching: find.text(view)));
      await tester.pump();
    }

    expect(c.view, 'Front');
    await press('Front');
    await press('Front');
    expect(c.viewPresses, 2);
    await press('Back');
    expect((c.view, c.viewPresses), ('Back', 3));
    await closeApp(tester, c);
  });

  testWidgets('other panels: no tap-to-pick', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final c = await openStudio(tester, 390, 844);
    await tapText(tester, 'Patterns');
    await tester.pumpAndSettle();
    expect(c.colourPick, isNull);
    await closeApp(tester, c);
  });
}
