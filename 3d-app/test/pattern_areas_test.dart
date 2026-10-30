import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/sports_catalog.dart' show garmentIds;
import 'package:three_deezi/widgets/studio_tools.dart';

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show mountPhone, tapText;

/// The website's Studio › Patterns › Apply to area (resources/js/pages/Studio.tsx patternAreas, 2026-10-26), by
/// website garment id: the areas the 3D viewer paints on each garment. The singlet and the netball dress are
/// sleeveless (viewer zones.js: the dress has no sleeve area). The skirt has its body, side panels and hem only
/// (viewer skirtprint.js skirtZones).
List<String> websiteAreas(String id, {String? trackStyle}) {
  // The socks, the cap and the bucket hat: one area, the whole garment (viewer zones.js).
  if (id == 'socks' || id == 'cap' || id == 'bucket-hat') return ['Body'];
  final shorts = id == 'shorts', skirt = id == 'skirt';
  return [
    shorts || skirt ? 'Body' : 'Chest & body',
    if (!shorts && !skirt) 'Shoulders',
    if (!shorts && !skirt && id != 'singlet' && id != 'netball-dress') 'Sleeves',
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
    // The app's garments are the website's 3D garments (config/catalog.php 'garments', name -> id), no more, no fewer.
    final php = File('website/config/catalog.php').readAsStringSync();
    final list = php.substring(php.indexOf("\n    'garments' => ["));
    expect(garmentIds, {
      for (final m in RegExp(
        r"\['id' => '([^']+)', 'name' => '([^']+)'",
      ).allMatches(list.substring(0, list.indexOf('\n    ],'))))
        m[2]!: m[1]!,
    });
    // websiteAreas above names the same garments as the website's own rules, and the same sleeveless ones.
    final tsx = File('website/resources/js/pages/Studio.tsx').readAsStringSync();
    final rules = tsx.substring(tsx.indexOf('function patternAreas('), tsx.indexOf('export default function Studio('));
    Set<String> named(String code) => {for (final m in RegExp(r"garment === '([\w-]+)'").allMatches(code)) m[1]!};
    expect(named(rules), {'socks', 'cap', 'bucket-hat', 'shorts', 'skirt', 'singlet', 'netball-dress', 'pocketpolo'});
    expect(named(rules.split('\n').firstWhere((line) => line.contains("label: 'Sleeves'"))), {'singlet', 'netball-dress'});
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
    // The netball dress: body, shoulders, side panels and hem, no sleeves.
    expect(patternAreas('Netball dress'), [
      ('body', 'Chest & body'),
      ('yoke', 'Shoulders'),
      ('sides', 'Side panels'),
      ('hem', 'Hem'),
    ]);
    expect([for (final (key, _) in patternAreas('Full Kit')) key], containsAll(['yoke', 'sleeves']));
    expect([for (final (key, _) in patternAreas('Shorts')) key], ['body', 'sides', 'hem']);
    // The skirt: Body, Side panels and Hem (no shoulders or sleeves).
    expect(patternAreas('Skirt'), [('body', 'Body'), ('sides', 'Side panels'), ('hem', 'Hem')]);
    // The socks, the cap and the bucket hat: Body only (the viewer paints nothing on other areas).
    for (final g in ['Socks', 'Cap', 'Bucket hat']) {
      expect(patternAreas(g), [('body', 'Body')], reason: g);
    }
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
      // The panel under the 3D closes with its ✕.
      await tester.tap(find.byKey(const ValueKey('sheet-close')));
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
