import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/order_names.dart';
import 'package:three_deezi/screens/business.dart';

import 'features_test.dart' show FakeStore;
import 'sync_test.dart' show FakeServer;

/// A signed-in account with one saved kit on the fake server.
Future<(FakeServer, AppController, Project)> signedInWithKit(
  WidgetTester tester, {
  String backName = 'MANTIS',
}) async {
  final server = FakeServer();
  final c = AppController(
    store: FakeStore(),
    api: ApiClient(client: server.client, baseUrl: 'https://test.example'),
  );
  await tester.runAsync(() async {
    await c.register(
      name: 'Fabian',
      email: 'fabian@3deezi.com',
      password: 'Password123!',
      passwordConfirmation: 'Password123!',
    );
    await pumpEventQueue();
    c
      ..startDyo()
      ..backName = backName
      ..number = '23';
    await c.saveProject('Club Home');
    await pumpEventQueue();
  });
  return (server, c, c.projects.first);
}

/// Opens the order sheet for [p] on a large phone.
Future<void> openOrderSheet(
  WidgetTester tester,
  AppController c,
  Project p,
) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(430, 900);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      // The app's dark theme and font, so text has its real width.
      theme: ThemeData(
        brightness: Brightness.dark,
        useMaterial3: true,
        fontFamily: 'Inter',
      ),
      home: Scaffold(
        body: Builder(
          builder: (context) => Center(
            child: TextButton(
              onPressed: () => showOrderKitSheet(context, c, p),
              child: const Text('OPEN'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('OPEN'));
  await tester.pumpAndSettle();
}

Future<void> tap(WidgetTester tester, Finder target) async {
  await tester.ensureVisible(target);
  await tester.pumpAndSettle();
  await tester.tap(target);
  await tester.pumpAndSettle();
}

String? shownError() {
  const red = Color(0xffff6b78);
  final texts = find.byWidgetPredicate(
    (w) => w is Text && w.style?.color == red && w.style?.fontSize == 12.5,
  );
  return texts.evaluate().isEmpty
      ? null
      : (texts.evaluate().first.widget as Text).data;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final body = FontLoader('Inter')
      ..addFont(rootBundle.load('assets/fonts/Inter.ttf'));
    final display = FontLoader('Rajdhani')
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-Bold.ttf'));
    await Future.wait([body.load(), display.load()]);
  });
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('players pasted from Excel: tabs, commas, a heading, any column', () {
    final pasted = parsePlayers(
      'Name\tNumber\tSize\r\nSMITH\t7\tM\n\nJONES\t#10\txxl\n"Tui, A"\t3\tkids',
    );
    expect(
      [for (final p in pasted) '${p.name}|${p.number}|${p.size}'],
      ['SMITH|7|M', 'JONES|10|2XL', 'Tui, A|3|Kids'],
    );
    final commas = parsePlayers(
      'Player name, No., Size\n7, Smith, L\nNGATA,M\nLee\nBrown;12;s\n1234, XL',
    );
    expect(
      [for (final p in commas) '${p.name}|${p.number}|${p.size}'],
      ['Smith|7|L', 'NGATA||M', 'Lee||null', 'Brown|12|S', '1234||XL'],
    );
    expect(parsePlayers('\n  \n'), isEmpty);
  });

  test('sizes are counted from the list, which starts from the sizes', () {
    final players = [
      OrderPlayer(name: 'A', size: 'M'),
      OrderPlayer(name: 'B', size: 'Kids'),
      OrderPlayer(name: 'C', size: 'M'),
      OrderPlayer(name: 'D'),
    ];
    expect(countSizes(players), {'M': 2, 'Kids': 1});
    expect(countSizes(players).keys, ['M', 'Kids']);

    final rows = rowsForSizes(
      {'L': 2, 'S': 1},
      name: 'YOUR NAME',
      number: '#23',
    );
    expect([for (final r in rows) r.size], ['S', 'L', 'L']);
    expect([rows.first.name, rows.first.number], ['YOUR NAME', '23']);
    expect(rows[1].name, '');
    expect(rowsForSizes({}).single.size, isNull);
    expect(rowsForSizes({'M': 400}).length, maxPlayers);
  });

  test('what goes on the back is checked and sent', () {
    final same = OrderPlayer(name: 'your name', number: '23');
    expect(namesProblem(null, same, []), startsWith('Choose what goes'));
    expect(
      namesProblem(BackNames.same, same, []),
      'Change YOUR NAME to the name to print on every shirt.',
    );
    expect(
      namesProblem(BackNames.same, OrderPlayer(), []),
      startsWith('Add the name or the number'),
    );
    expect(namesProblem(BackNames.same, OrderPlayer(number: '9'), []), isNull);
    expect(
      namesProblem(BackNames.list, same, []),
      'Add the players’ names and numbers.',
    );
    expect(
      namesProblem(BackNames.list, same, [
        OrderPlayer(name: 'A', number: '1', size: 'M'),
        OrderPlayer(name: 'B', number: '2'),
      ]),
      'Player 2: choose a size.',
    );
    expect(
      namesProblem(BackNames.list, same, [OrderPlayer(size: 'M')]),
      'Player 1: add a name or a number.',
    );
    expect(
      namesProblem(BackNames.list, same, [
        OrderPlayer(name: 'Your Name', size: 'M'),
      ]),
      'Player 1: change YOUR NAME to the player’s name.',
    );
    expect(
      namesProblem(
        BackNames.list,
        same,
        List.generate(301, (i) => OrderPlayer(name: 'P$i', size: 'M')),
      ),
      'A list can have up to 300 players.',
    );
    expect(namesProblem(BackNames.none, same, []), isNull);

    expect(
      namesBody(BackNames.same, OrderPlayer(name: ' SMITH ', number: '7'), []),
      {
        'names': 'same',
        'players': [
          {'name': 'SMITH', 'number': '7'},
        ],
      },
    );
    expect(
      namesBody(BackNames.list, same, [
        OrderPlayer(name: 'A', number: '1', size: 'S'),
      ]),
      {
        'names': 'list',
        'players': [
          {'name': 'A', 'number': '1', 'size': 'S'},
        ],
      },
    );
    expect(namesBody(BackNames.none, same, []), {'names': 'none'});
  });

  testWidgets('the order sheet sends a players list pasted from Excel', (
    tester,
  ) async {
    final (server, c, kit) = await signedInWithKit(tester);
    expect(kit.remoteId, isNotNull);
    await openOrderSheet(tester, c, kit);
    expect(find.text('This design is final'), findsOneWidget);
    expect(find.text('Names and numbers on the back'), findsOneWidget);

    // Nothing chosen yet: the first problem is shown.
    await tap(tester, find.text('SEND ORDER REQUEST · 0 ITEMS'));
    expect(shownError(), 'Add at least one garment to the order.');

    await tap(tester, find.byTooltip('More M'));
    await tap(tester, find.byTooltip('More M'));
    await tap(tester, find.text('A different name and number for each player'));
    // One row for each garment counted above, the first with the design's
    // name and number.
    expect(
      find.text('2 players · the sizes above are counted from this list.'),
      findsOneWidget,
    );
    expect(find.widgetWithText(TextField, 'MANTIS'), findsOneWidget);

    await tap(tester, find.text('Paste from Excel'));
    await tester.enterText(
      find.widgetWithText(TextField, 'Players to paste'),
      'Name\tNumber\tSize\nSMITH\t7\tM\nJONES\t10\txl\nTUI\t#3\tkids',
    );
    await tap(tester, find.text('ADD THESE PLAYERS'));
    expect(find.text('Added 3 players.'), findsOneWidget);
    expect(
      find.text('3 players · the sizes above are counted from this list.'),
      findsOneWidget,
    );
    expect(find.textContaining('counted from the players list'), findsWidgets);

    await tap(tester, find.text('SEND ORDER REQUEST · 3 ITEMS'));
    expect(shownError(), 'Tick “This design is final” to place the order.');
    await tap(tester, find.text('This design is final'));
    await tap(tester, find.text('SEND ORDER REQUEST · 3 ITEMS'));
    await tester.pumpAndSettle();

    final sent = server.orders.single;
    expect(sent['project_id'], kit.remoteId);
    expect(sent['project_version'], 1);
    expect(sent['design_final'], isTrue);
    expect(sent['names'], 'list');
    expect(sent['sizes'], {'M': 1, 'XL': 1, 'Kids': 1});
    expect(sent['players'], [
      {'name': 'SMITH', 'number': '7', 'size': 'M'},
      {'name': 'JONES', 'number': '10', 'size': 'XL'},
      {'name': 'TUI', 'number': '3', 'size': 'Kids'},
    ]);
    // Ordering approves the kit.
    expect(kit.approved, isTrue);
    expect(find.text('Names and numbers on the back'), findsNothing);
  });

  testWidgets('the same name on every shirt: YOUR NAME is changed first', (
    tester,
  ) async {
    final (server, c, kit) = await signedInWithKit(
      tester,
      backName: 'YOUR NAME',
    );
    await openOrderSheet(tester, c, kit);
    await tap(tester, find.byTooltip('More L'));
    await tap(tester, find.text('This design is final'));
    await tap(tester, find.text('The same on every shirt'));
    expect(find.textContaining('YOUR NAME is the sample name'), findsOneWidget);
    await tap(tester, find.text('SEND ORDER REQUEST · 1 ITEM'));
    expect(
      shownError(),
      'Change YOUR NAME to the name to print on every shirt.',
    );
    expect(server.orders, isEmpty);

    await tester.enterText(
      find.widgetWithText(TextField, 'YOUR NAME'),
      'SMITH',
    );
    await tester.pump();
    expect(find.textContaining('YOUR NAME is the sample name'), findsNothing);
    await tap(tester, find.text('SEND ORDER REQUEST · 1 ITEM'));
    await tester.pumpAndSettle();
    expect(server.orders.single['names'], 'same');
    expect(server.orders.single['players'], [
      {'name': 'SMITH', 'number': '23'},
    ]);
    expect(server.orders.single['sizes'], {'L': 1});
  });
}
