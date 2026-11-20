import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/sports_catalog.dart';

import 'flow_test.dart' show mountPhone, tapText;

/// Design Your Own › Netball starts with an empty back (client 2026-10-26:
/// "netball you don't have numbers or names"), from the catalogue's rules;
/// other sports keep the sample name and 23. The order form starts from the
/// kit's back name and number, so it starts empty for netball too.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final display = FontLoader('Rajdhani')
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-Bold.ttf'));
    await display.load();
  });

  test('the back follows the sport\'s rules; typed text stays', () {
    ({String backName, String number}) back(
      String from,
      String to,
      String name,
      String number,
    ) => backForSport(
      from,
      to,
      backName: name,
      number: number,
      sampleName: 'MANTIS',
    );
    // Into netball: the samples go, a typed name and number stay.
    expect(back('Rugby League', 'Netball', 'MANTIS', '23'), (
      backName: '',
      number: '',
    ));
    expect(back('Rugby League', 'Netball', 'SMITH', '7'), (
      backName: 'SMITH',
      number: '7',
    ));
    // Out of netball: an empty back gets the samples again.
    expect(back('Netball', 'Rugby League', '', ''), (
      backName: 'MANTIS',
      number: '23',
    ));
    // Between other sports nothing changes, also an emptied back.
    expect(back('Rugby League', 'AFL', 'SMITH', '7'), (
      backName: 'SMITH',
      number: '7',
    ));
    expect(back('Rugby League', 'AFL', '', ''), (backName: '', number: ''));
  });

  testWidgets('Design Your Own: a netball tile starts with no back name or '
      'number, a rugby tile with the sample ones', (tester) async {
    final c = AppController()..screen = AppScreen.home;
    await mountPhone(tester, c);
    await tapText(tester, 'DESIGN YOUR OWN');
    await tester.pumpAndSettle();
    final row = find.byKey(const ValueKey('dyo-tiles'));

    // The row builds its tiles lazily: scroll it to the tile (left for the
    // first sports, right for the others).
    Future<void> design(String tile, String button, {double step = 120}) async {
      final target = find.descendant(of: row, matching: find.text(tile));
      await tester.scrollUntilVisible(
        target,
        step,
        scrollable: find
            .descendant(of: row, matching: find.byType(Scrollable))
            .first,
      );
      await tester.pumpAndSettle();
      await tester.tap(target);
      await tester.pumpAndSettle();
      await tapText(tester, button);
      expect(c.screen, AppScreen.garment, reason: tile);
    }

    // Netball: its first tile (Netball dress) opens with an empty back, in
    // the Studio and on the kit the order form starts from.
    await design('NETBALL', 'DESIGN NETBALL');
    expect(c.sport, 'Netball');
    expect(c.productName, 'Netball dress');
    expect((c.backName, c.number), ('', ''));
    await tapText(tester, 'CONTINUE TO STUDIO');
    expect(c.screen, AppScreen.studio);
    expect((c.kit.backName, c.kit.number), ('', ''));
    await tester.pump(const Duration(seconds: 1));

    // Change sport to Rugby League: the sample name and number come back.
    c.go(AppScreen.sport);
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();
    await design('RUGBY LEAGUE', 'DESIGN RUGBY LEAGUE', step: -120);
    expect(c.sport, 'Rugby League');
    expect((c.backName, c.number), ('MANTIS', '23'));

    // A new kit on a rugby tile keeps the defaults.
    c.startDyo();
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();
    await design('RUGBY LEAGUE', 'DESIGN RUGBY LEAGUE', step: -120);
    expect((c.backName, c.number), ('MANTIS', '23'));
    await tester.pump(const Duration(seconds: 1));
  });
}
