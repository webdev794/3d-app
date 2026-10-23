import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/widgets/order_review_garments.dart';

/// Three garment styles of 30 each (the client's example): a singlet with players, shorts with other sizes, a polo
/// with youth sizes.
List<Map<String, dynamic>> _rows() => [
  {'garment': 'singlet', 'fit': 'mens', 'label': 'Basketball singlet', 'project_id': 1, 'sizes': {'M': 8, 'S': 4, 'L': 10, 'XL': 6, '2XL': 2},
    'players': [{'name': 'F. SOUTAR', 'number': '86', 'size': 'L'}, {'name': 'J. RIVERA', 'number': '7', 'size': 'M'}]},
  {'garment': 'shorts', 'fit': 'mens', 'label': 'Training shorts', 'project_id': 1, 'sizes': {'S': 5, 'M': 8, 'L': 9, 'XL': 6, '2XL': 2}},
  {'garment': 'polo', 'fit': 'unisex', 'label': 'Team polo', 'sizes': {'XL': 5, 'Y12': 3, 'S': 5, 'Y10': 2, 'M': 8, 'L': 7}},
  {'garment': 'socks', 'sizes': {'M': 0}},
];

void main() {
  test('reviewLayoutFor: kit only for one matching kit', () {
    Map<String, dynamic> row(String g, int? p, Map<String, int> s) => {'garment': g, 'project_id': p, 'sizes': s};
    expect(reviewLayoutFor([row('singlet', 1, {'S': 4, 'M': 8}), row('shorts', 1, {'M': 8, 'S': 4})]), 'kit');
    expect(reviewLayoutFor([row('singlet', 1, {'S': 4}), row('shorts', 1, {'S': 4}), row('polo', null, {'S': 0})]), 'kit');
    expect(reviewLayoutFor([row('singlet', 1, {'S': 4, 'M': 8}), row('shorts', 1, {'S': 5, 'M': 8})]), 'multi');
    expect(reviewLayoutFor([row('jersey', 1, {'S': 4}), row('shorts', 2, {'S': 4})]), 'multi');
    expect(reviewLayoutFor([row('jersey', null, {'S': 4}), row('shorts', null, {'S': 4})]), 'multi');
    expect(reviewLayoutFor(_rows()), 'multi');
  });

  test('sizes in the site order, youth sizes with Kids', () {
    expect(orderedSizes({'Kids': 1, '4XL': 1, 'Y8': 1, 'XS': 1, 'M': 2, '2XL': 1, '10Y': 1, 'S': 1, 'YXL': 1, 'L': 1, 'XL': 0}).map((e) => e.key).toList(),
        // 10Y is a site size since 2026-10-22 (Kids 2Y–16Y); sizes the site doesn't list (Y8, YXL) still go with Kids.
        ['XS', 'S', 'M', 'L', '2XL', '4XL', '10Y', 'Y8', 'YXL', 'Kids']);
  });

  test('garments from the rows: names, fit, totals, artwork for rows without pictures', () {
    final g = multiGarmentsFrom(_rows(), artwork: 'https://example.com/logo.png', pictures: (r) => r['project_id'] == 1 ? (front: 'https://example.com/${r['garment']}-front.png', back: 'https://example.com/${r['garment']}-back.png') : (front: null, back: null));
    expect(g.length, 3);
    expect(g.map((x) => x.total).toList(), [30, 30, 30]);
    expect(summaryText(g), '3 garment styles · 90 garments');
    expect(g[0].detail, 'Mens fit');
    expect(g[0].players.length, 2);
    expect(g[1].front, 'https://example.com/shorts-front.png');
    expect(g[2].front, 'https://example.com/logo.png');
    expect(g[2].artwork, isTrue);
  });

  testWidgets('the sections, the chip and ORDER TOTALS', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final garments = multiGarmentsFrom(_rows());
    var edited = -1;
    await tester.pumpWidget(MaterialApp(theme: ThemeData.dark(), home: Scaffold(body: ListView(padding: const EdgeInsets.all(16), children: multiGarmentReview(garments, onEdit: (i) => edited = i)))));
    expect(find.text('3 garment styles · 90 garments'), findsOneWidget);
    expect(find.text('BASKETBALL SINGLET', findRichText: true), findsNothing); // inside a rich text with the number
    expect(find.byKey(const Key('garment-section-0')), findsOneWidget);
    expect(find.textContaining('01 — BASKETBALL SINGLET', findRichText: true), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('garment-section-0')), matching: find.text('Mockup prepared by 3DEEZI after you approve')), findsNWidgets(2));
    await tester.tap(find.text('Edit garment').first);
    expect(edited, 0);
    // Players open from the collapsed list.
    expect(find.text('F. SOUTAR'), findsNothing);
    await tester.tap(find.text('2 players · names & numbers'));
    await tester.pumpAndSettle();
    expect(find.text('F. SOUTAR'), findsOneWidget);
    // The polo's sizes, youth last, and its TOTAL.
    await tester.scrollUntilVisible(find.byKey(const Key('garment-section-2')), 300);
    await tester.scrollUntilVisible(find.byKey(const Key('total-garments')), 300);
    expect(tester.widget<Text>(find.byKey(const Key('total-styles'))).data, '3');
    expect(tester.widget<Text>(find.byKey(const Key('total-garments'))).data, '90');
    expect(find.text('Pricing pending confirmation.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
