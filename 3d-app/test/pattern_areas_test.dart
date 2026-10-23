import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/sports_catalog.dart' show garmentIds;
import 'package:three_deezi/widgets/studio_tools.dart';

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show mountPhone, tapText;

/// The website's Studio › Patterns › Apply to area (resources/js/pages/Studio.tsx patternAreas, 2026-10-23), by
/// website garment id: the areas the 3D viewer paints on each garment.
List<String> websiteAreas(String id, {String? trackStyle}) {
  final shorts = id == 'shorts';
  return [
    shorts ? 'Body' : 'Chest & body',
    if (!shorts) 'Shoulders',
    if (!shorts && id != 'singlet') 'Sleeves',
    'Side panels',
    shorts ? 'Leg hems' : 'Hem',
    if (id == 'pocketpolo') 'Chest pocket',
    if (id == 'hoodie' || id == 'ziphoodie') ...['Kangaroo pocket', 'Hood'],
    if (id == 'trackjacket') trackStyle == 'hood' ? 'Hood' : 'Collar',
  ];
}

/// The labels of the area menus the Studio shows.
List<String?> shownAreas(WidgetTester tester) => [
  for (final d in tester.widgetList<InputDecorator>(
    find.descendant(
      of: find.byType(DropdownButtonFormField<String>),
      matching: find.byType(InputDecorator),
    ),
  ))
    d.decoration.labelText,
];

void main() {
  test('every 3D garment offers the same areas as the website', () {
    expect(garmentIds, hasLength(11));
    for (final MapEntry(key: garment, value: id) in garmentIds.entries) {
      expect(
        [for (final (_, label) in patternAreas(garment)) label],
        websiteAreas(id),
        reason: garment,
      );
    }
    expect(
      [for (final (_, label) in patternAreas('Track jacket', trackStyle: 'hood')) label],
      websiteAreas('trackjacket', trackStyle: 'hood'),
    );
    // No sleeves on the singlet; the full kit's jersey keeps them; shorts keep only what the viewer paints.
    expect([for (final (key, _) in patternAreas('Singlet')) key], isNot(contains('sleeves')));
    expect([for (final (key, _) in patternAreas('Full Kit')) key], containsAll(['yoke', 'sleeves']));
    expect([for (final (key, _) in patternAreas('Shorts')) key], ['body', 'sides', 'hem']);
  });

  testWidgets(
    'Studio › Patterns: the singlet has no Sleeves; the shorts read Body, Side panels, Leg hems and a pattern lands on the leg hems',
    (tester) async {
      final c = AppController(store: FakeStore())..screen = AppScreen.home;
      await mountPhone(tester, c);
      c.startDyo();
      c.update(() => c.garment = 'Singlet');
      c.go(AppScreen.studio);
      await tester.pump(const Duration(milliseconds: 400));
      await tapText(tester, 'Patterns');
      await tester.pumpAndSettle();
      expect(shownAreas(tester), ['Chest & body', 'Shoulders', 'Side panels', 'Hem']);
      expect(find.text('Sleeves'), findsNothing);
      await tester.tapAt(const Offset(20, 20)); // closes the sheet
      await tester.pumpAndSettle();

      c.update(() => c.garment = 'Shorts');
      await tester.pump(const Duration(milliseconds: 400));
      await tapText(tester, 'Patterns');
      await tester.pumpAndSettle();
      expect(shownAreas(tester), ['Body', 'Side panels', 'Leg hems']);
      final hems = find.widgetWithText(DropdownButtonFormField<String>, 'Leg hems');
      await tester.ensureVisible(hems);
      await tester.pumpAndSettle();
      await tester.tap(hems);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Tribal').last);
      await tester.pumpAndSettle();
      expect(c.zones, {'hem': 'Tribal'});
      expect(tester.takeException(), isNull);
    },
  );
}
