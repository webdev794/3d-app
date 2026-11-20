import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/widgets/street_address_field.dart';

void main() {
  testWidgets('typing shows suggestions after a pause; a tap fills the address', (
    tester,
  ) async {
    final street = TextEditingController();
    final asked = <String>[];
    Map<String, dynamic>? picked;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StreetAddressField(
            controller: street,
            suggest: (q) async {
              asked.add(q);
              return [
                {
                  'label':
                      '7 Marabou Close, Narre Warren South VIC 3805, Australia',
                  'street': '7 Marabou Close',
                  'suburb': 'Narre Warren South',
                  'state': 'VIC',
                  'postcode': '3805',
                  'country': 'Australia',
                },
              ];
            },
            onPick: (a) => picked = a,
          ),
        ),
      ),
    );
    await tester.enterText(find.byKey(const Key('address-street')), '7 Ma');
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(
      find.byKey(const Key('address-street')),
      '7 Marabou',
    );
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pump();
    expect(asked, ['7 Marabou'], reason: 'one call after the pause');
    expect(find.byKey(const Key('address-suggestions')), findsOneWidget);
    await tester.tap(find.textContaining('Narre Warren South'));
    await tester.pump();
    expect(picked?['postcode'], '3805');
    expect(find.byKey(const Key('address-suggestions')), findsNothing);
  });

  testWidgets('nothing found or no connection: no list, typing stays', (
    tester,
  ) async {
    final street = TextEditingController();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StreetAddressField(
            controller: street,
            suggest: (q) async => throw Exception('offline'),
            onPick: (_) {},
          ),
        ),
      ),
    );
    await tester.enterText(
      find.byKey(const Key('address-street')),
      '12 Smith Street',
    );
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pump();
    expect(find.byKey(const Key('address-suggestions')), findsNothing);
    expect(street.text, '12 Smith Street');
  });
}
