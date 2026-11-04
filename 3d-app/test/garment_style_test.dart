import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/garment_style.dart';
import 'package:three_deezi/project_store.dart';
import 'package:three_deezi/project_sync.dart';
import 'package:three_deezi/widgets/garment_style_tool.dart';

import 'features_test.dart' show FakeStore;

/// Garment style (NK1 2026-11-02): the neck style, a rugby jersey's collar and
/// fit, as the website's Style tool.
void main() {
  test('the neck, collar and fit are kept on disk and on the server', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    c.garment = 'Jersey';
    c.neck = 'rc006';
    c.fit = 'tight';
    final project = Project(
      title: 'Tigers',
      sport: 'Rugby League',
      garment: 'Jersey',
      mode: 'DYO',
      kit: c.kit,
      updated: DateTime.now(),
    );
    final sent =
        jsonDecode(jsonEncode(ProjectSync.toServer(project)))
            as Map<String, dynamic>;
    expect((sent['design'] as Map)['neck'], 'rc006');
    expect((sent['design'] as Map)['fit'], 'tight');
    final disk = ProjectStore.decode(
      jsonDecode(jsonEncode(ProjectStore.encode(project))),
      {},
    );
    final server = ProjectSync.fromServer({...sent, 'id': 7, 'version': 1});
    for (final restored in [disk, server]) {
      expect(restored.kit.neck, 'rc006');
      expect(restored.kit.fit, 'tight');
    }
    // Unset: not sent (older servers refuse the fields); undo puts it back.
    c.edit(() => c.neck = null);
    final plain = ProjectSync.toServer(
      Project(
        title: 'Plain',
        sport: 'Rugby League',
        garment: 'Jersey',
        mode: 'DYO',
        kit: c.kit,
        updated: DateTime.now(),
      ),
    );
    expect((plain['design'] as Map).containsKey('neck'), isFalse);
    c.undo();
    expect(c.neck, 'rc006');
    // Anything else read from a save is the garment's own.
    expect(readNeck('turtle'), isNull);
    expect(readFit('baggy'), isNull);
  });

  test('which garments have a neck to choose, and their own', () {
    expect(ownNeck('Jersey', const {}), 'v');
    expect(ownNeck('Training Tee', const {}), 'round');
    expect(ownNeck('Singlet', const {}), 'round');
    expect(ownNeck('Netball dress', const {}), 'round');
    expect(ownNeck('Shooting shirt', const {}), 'v');
    expect(ownNeck('Full Kit', const {'crewNeck': '#27282a'}), 'round');
    for (final g in [
      'Polo',
      'Hoodie',
      'Track jacket',
      'Cap',
      'Socks',
      'Shorts',
      'Skirt',
    ]) {
      expect(hasNeckStyle(g), isFalse, reason: g);
    }
    expect(hasRugbyStyle('Rugby Union', 'Jersey'), isTrue);
    expect(hasRugbyStyle('Football', 'Jersey'), isFalse);
    expect(
      neckLabel('Jersey', 'rc006', const {}),
      'RC006 Grandad collar, 1 button',
    );
    expect(neckLabel('Training Tee', null, const {}), 'Round neck');
    expect(fitLabel(null), 'Pro / Athletic');
  });

  testWidgets(
    'the Style tool switches the neck, the trim and a rugby jersey\'s collar and fit',
    (tester) async {
      final c = AppController(store: FakeStore());
      addTearDown(c.dispose);
      Future<void> show() async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              // The Studio rebuilds its panel as the kit changes.
              body: ListenableBuilder(
                listenable: c,
                builder: (_, _) => SingleChildScrollView(
                  child: GarmentStyleTool(
                    c,
                    onGarment: () {},
                    onMoreColours: () {},
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pump();
      }

      c.sport = 'Basketball';
      c.garment = 'Singlet';
      await show();
      expect(find.text('Round neck selected'), findsOneWidget);
      expect(find.text('RUGBY COLLAR OPTIONS'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('neck-v')));
      await tester.pump();
      expect(c.neck, 'v');
      expect(find.text('V-neck selected'), findsOneWidget);
      // Back to the garment's own: unset again.
      await tester.ensureVisible(find.byKey(const ValueKey('neck-round')));
      await tester.tap(find.byKey(const ValueKey('neck-round')));
      await tester.pump();
      expect(c.neck, isNull);
      await tester.ensureVisible(find.byKey(const ValueKey('trim-White')));
      await tester.tap(find.byKey(const ValueKey('trim-White')));
      await tester.pump();
      expect((c.parts['collar'] as Map)['colour'], '#ffffff');

      c.sport = 'Rugby League';
      c.garment = 'Jersey';
      await show();
      expect(find.text('RUGBY COLLAR OPTIONS'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const ValueKey('collar-rc008')));
      await tester.tap(find.byKey(const ValueKey('collar-rc008')));
      await tester.pump();
      expect(c.neck, 'rc008');
      expect(
        find.text('Final shape to match supplier pattern.'),
        findsOneWidget,
      );
      await tester.ensureVisible(find.byKey(const ValueKey('fit-classic')));
      await tester.tap(find.byKey(const ValueKey('fit-classic')));
      await tester.pump();
      expect(c.fit, 'classic');

      c.garment = 'Polo';
      await show();
      expect(find.textContaining('keeps its own collar'), findsOneWidget);
    },
  );
}
