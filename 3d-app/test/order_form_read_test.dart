import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/widgets/order_form_read.dart';

/// A reading as POST /order-drafts/{id}/read gives it for a club form like Te Arawa's (made-up names).
Map<String, dynamic> _reading() => {
  'source': 'ai',
  'file_name': 'Te Arawa U13 Mantis Order Form V3.xlsx',
  'items': [
    {
      'garment': 'jersey',
      'sport': 'rugby-league',
      'name': 'Rugby League Jersey',
      'sizes': {'XS': 1, 'Kids': 2},
      'players': [
        {'name': 'WALKER', 'number': '1', 'size': 'Kids'},
        {'name': 'PARKER', 'number': '4', 'size': null},
        {'name': 'FERRIS', 'number': '8', 'size': 'XS'},
        {'name': 'HALE', 'number': '6', 'size': 'Kids'},
      ],
    },
  ],
  'details': [
    {
      'form_sizes': {'10Y': 1, '16Y': 1},
      'player_sizes': ['10Y', '', 'XS', '16Y'],
    },
  ],
  'unknown': ['Jersey: PARKER 4 (size missing)'],
  'players': 4,
  'form': {'needed_by': '', 'needed_by_text': 'ASAP', 'team_name': 'TE ARAWA RUGBY LEAGUE U13'},
};

void main() {
  test('the reading becomes editable rows, and the order gets only its own fields', () {
    final rows = readRows(_reading());
    expect(rows, hasLength(1));
    expect(rows[0]['_form'], {'10Y': 1, '16Y': 1});
    expect((rows[0]['players'] as List)[0]['_written'], '10Y');
    expect(rowTotal(rows[0]), 3);

    final sent = cleanRows(rows);
    expect(sent, [
      {
        'garment': 'jersey',
        'sport': 'rugby-league',
        'sizes': {'XS': 1, 'Kids': 2},
        'players': [
          {'name': 'WALKER', 'number': '1', 'size': 'Kids'},
          {'name': 'PARKER', 'number': '4', 'size': null},
          {'name': 'FERRIS', 'number': '8', 'size': 'XS'},
          {'name': 'HALE', 'number': '6', 'size': 'Kids'},
        ],
      },
    ]);
    // An emptied row is not sent.
    (rows[0]['sizes'] as Map).updateAll((k, v) => 0);
    expect(cleanRows(rows), isEmpty);
    expect(readRows(null), isEmpty);
  });

  testWidgets('the review shows the AI-filled form to check: note, sizes, players, date words, totals and the lines to check', (tester) async {
    final rows = readRows(_reading());
    var changed = 0;
    var correct = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: StatefulBuilder(
              builder: (context, setState) => OrderFormReadView(
                rows: rows,
                reading: _reading(),
                fileName: 'Te Arawa U13 Mantis Order Form V3.xlsx',
                correct: correct,
                onCorrect: (v) => setState(() => correct = v),
                onChanged: () => setState(() {
                  changed++;
                  correct = false;
                }),
              ),
            ),
          ),
        ),
      ),
    );
    expect(find.textContaining('Read by 3DEEZI AI from Te Arawa U13 Mantis Order Form V3.xlsx'), findsOneWidget);
    expect(find.text('Date required on your form: ASAP'), findsOneWidget);
    expect(find.textContaining('As on your form: 10Y 1 · 16Y 1'), findsOneWidget);
    expect(find.text('Total: 3 garments · 4 players'), findsOneWidget);
    expect(find.textContaining('PARKER 4 (size missing)'), findsOneWidget);
    expect(find.text('WALKER'), findsOneWidget);
    expect(tester.widget<TextField>(find.byKey(const Key('size-0-Kids'))).controller!.text, '2');

    // Correcting a size box: the total follows and the tick is cleared.
    await tester.enterText(find.byKey(const Key('size-0-Kids')), '5');
    await tester.pump();
    expect(find.text('Total: 6 garments · 4 players'), findsOneWidget);
    expect(changed, 1);

    // Removing a player takes one off that player's size.
    await tester.tap(find.byTooltip('Remove this player').first);
    await tester.pump();
    expect((rows[0]['sizes'] as Map)['Kids'], 4);
    expect(tester.widget<TextField>(find.byKey(const Key('size-0-Kids'))).controller!.text, '4');
    expect(find.text('WALKER'), findsNothing);
  });

  testWidgets('with nothing read there is nothing to fill in', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: OrderFormReadView(rows: const [], reading: null, fileName: 'scan.heic', correct: false, onCorrect: (_) {}, onChanged: () {}),
        ),
      ),
    );
    expect(find.byKey(const Key('read-nothing')), findsOneWidget);
    expect(find.textContaining('Nothing to fill in here'), findsOneWidget);
    expect(find.byType(CheckboxListTile), findsNothing);
  });
}
