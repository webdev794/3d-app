import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/project_store.dart';
import 'package:three_deezi/project_sync.dart';
import 'package:three_deezi/screens/create_home.dart' show GarmentScreen;

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show mountPhone;

/// Scrolls the garment step until [text] shows, then taps it.
Future<void> revealTap(WidgetTester tester, String text) async {
  final list = find
      .descendant(
        of: find.byType(CustomScrollView),
        matching: find.byType(Scrollable),
      )
      .first;
  // From the top: the tile may be above or below.
  tester.state<ScrollableState>(list).position.jumpTo(0);
  await tester.pump();
  await tester.scrollUntilVisible(find.text(text), 120, scrollable: list);
  await tester.pumpAndSettle();
  await tester.tap(find.text(text).first);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

/// Garments per sport (task 9.99, client visuals images/157.jpg and 160.jpg):
/// the app's garment step, the tile's name on the kit, in the Studio and in
/// saved projects.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final display = FontLoader('Rajdhani')
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Rajdhani-Bold.ttf'));
    await display.load();
  });

  testWidgets(
    'Netball: its own tiles, the dress first, More teamwear, the name in the Studio',
    (tester) async {
      final c = AppController(store: FakeStore());
      c.sport = 'Netball';
      GarmentScreen.showAll.value = false;
      GarmentScreen.startOn(c);
      c.screen = AppScreen.garment;
      await mountPhone(tester, c);
      await tester.pumpAndSettle();

      expect(find.text('NETBALL UNIFORMS & TEAMWEAR'), findsOneWidget);
      expect(
        find.text('Choose what you want to design for Netball.'),
        findsOneWidget,
      );
      // The first garment that can be designed is chosen: the dress, on the
      // singlet (no 3D dress yet), with the note.
      expect(c.productName, 'Netball dress');
      expect(c.garment, 'Singlet');
      expect(find.text('NETBALL DRESS'), findsOneWidget);
      expect(find.text('3D preview uses singlet'), findsWidgets);

      // The skirt is coming soon: tapping it changes nothing.
      await revealTap(tester, 'NETBALL SKIRT');
      expect(c.productName, 'Netball dress');
      expect(find.text('COMING SOON'), findsOneWidget);

      // The bibs, then the hoodie.
      await revealTap(tester, 'NETBALL BIBS');
      expect((c.garment, c.productName), ('Singlet', 'Netball bibs'));
      await revealTap(tester, 'HOODIE');
      expect((c.garment, c.productName), ('Hoodie', 'Hoodie'));

      // More teamwear: the other 3D garments, by their own names.
      await revealTap(tester, 'More teamwear');
      await revealTap(tester, 'POLO');
      expect((c.garment, c.productName), ('Polo', ''));

      await revealTap(tester, 'TRAINING T-SHIRT');
      expect((c.garment, c.productName), ('Training Tee', 'Training T-shirt'));
      await revealTap(tester, 'NETBALL DRESS');
      await revealTap(tester, 'CONTINUE TO STUDIO');
      expect(c.screen, AppScreen.studio);
      expect(c.projectName, 'Netball dress');
      expect(find.textContaining('Netball · Netball dress'), findsOneWidget);

      // Another garment in the Studio is no longer the dress.
      c.edit(() => c.garment = 'Polo');
      expect(c.productName, isEmpty);
      expect(c.garmentLabel, 'Polo');
      c.undo();
      expect((c.garment, c.productName), ('Singlet', 'Netball dress'));
    },
  );

  testWidgets(
    'Rugby League: the client\'s 11 tiles, no More teamwear; the hooded tracksuit starts with the hood',
    (tester) async {
      final c = AppController(store: FakeStore());
      c.sport = 'Rugby League';
      GarmentScreen.startOn(c);
      c.screen = AppScreen.garment;
      await mountPhone(tester, c);
      await tester.pumpAndSettle();
      expect(find.text('RUGBY LEAGUE UNIFORMS & TEAMWEAR'), findsOneWidget);
      expect((c.garment, c.productName), ('Full Kit', 'Rugby League Kit'));
      expect(GarmentScreen.moreFor('Rugby League'), isEmpty);
      await tester.scrollUntilVisible(
        find.text('WATERPROOF JACKET'),
        200,
        scrollable: find
            .descendant(
              of: find.byType(CustomScrollView),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      expect(find.text('More teamwear'), findsNothing);
      await revealTap(tester, 'HOODED TRACKSUIT');
      expect(
        (c.garment, c.productName, c.trackStyle),
        ('Track jacket', 'Hooded Tracksuit', 'hood'),
      );
      expect(GarmentScreen.projectNameFor(c), 'Rugby League Hooded Tracksuit');
    },
  );

  test(
    'the tile\'s name is kept on disk and on the server; an old project has none',
    () {
      final c = AppController(store: FakeStore());
      addTearDown(c.dispose);
      c.sport = 'Netball';
      c.garment = 'Singlet';
      c.productName = 'Netball dress';
      final project = Project(
        title: 'Firebirds',
        sport: 'Netball',
        garment: 'Singlet',
        mode: 'DYO',
        kit: c.kit,
        updated: DateTime.now(),
      );
      final sent =
          jsonDecode(jsonEncode(ProjectSync.toServer(project)))
              as Map<String, dynamic>;
      expect(sent['garment'], 'singlet');
      expect((sent['design'] as Map)['productName'], 'Netball dress');
      final disk = ProjectStore.decode(
        jsonDecode(jsonEncode(ProjectStore.encode(project))),
        {},
      );
      final server = ProjectSync.fromServer({...sent, 'id': 7, 'version': 1});
      for (final restored in [disk, server]) {
        expect(restored.kit.productName, 'Netball dress');
        expect(restored.kit.garment, 'Singlet');
      }
      // A plain garment sends no name (older servers refuse the field).
      c.garment = 'Polo';
      final plain = ProjectSync.toServer(
        Project(
          title: 'Polo',
          sport: 'Netball',
          garment: 'Polo',
          mode: 'DYO',
          kit: c.kit,
          updated: DateTime.now(),
        ),
      );
      expect((plain['design'] as Map).containsKey('productName'), isFalse);
      final old = ProjectSync.fromServer({
        ...sent,
        'id': 8,
        'version': 1,
        'design': {...(sent['design'] as Map)}..remove('productName'),
      });
      expect(old.kit.productName, isEmpty);
    },
  );
}
