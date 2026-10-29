import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/project_store.dart';
import 'package:three_deezi/project_sync.dart';
import 'package:three_deezi/screens/create_home.dart' show GarmentScreen;
import 'package:three_deezi/sports_catalog.dart';

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
      // The first garment that can be designed is chosen: the dress, on its
      // own 3D netball dress (task 9.126), no longer on the singlet.
      expect(c.productName, 'Netball dress');
      expect(c.garment, 'Netball dress');
      expect(find.text('NETBALL DRESS'), findsOneWidget);

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
      expect((c.garment, c.productName), ('Netball dress', 'Netball dress'));
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

  testWidgets(
    'a plain track jacket tile after a hooded one is the plain (collar) '
    'track jacket, as when it is chosen first (QA U)',
    (tester) async {
      final c = AppController(store: FakeStore());
      c.sport = 'Rugby League';
      GarmentScreen.startOn(c);
      c.screen = AppScreen.garment;
      await mountPhone(tester, c);
      await tester.pumpAndSettle();
      await revealTap(tester, 'HOODED TRACKSUIT');
      expect(c.trackStyle, 'hood');
      // Change sport: Soccer's Track jacket has no hood of its own.
      c.update(() {
        c.sport = 'Soccer';
        GarmentScreen.startOn(c);
      });
      await tester.pumpAndSettle();
      await revealTap(tester, 'TRACK JACKET');
      expect(
        (c.garment, c.productName, c.trackStyle),
        ('Track jacket', 'Track jacket', 'collar'),
      );
    },
  );

  testWidgets(
    'American Football: the client\'s 16 tiles, names only, its own subtitle, '
    'hint and field background (images/165.jpg)',
    (tester) async {
      final c = AppController(store: FakeStore());
      c.sport = 'American Football';
      GarmentScreen.startOn(c);
      c.screen = AppScreen.garment;
      await mountPhone(tester, c);
      await tester.pumpAndSettle();
      expect(
        find.text('AMERICAN FOOTBALL UNIFORMS & TEAMWEAR'),
        findsOneWidget,
      );
      expect(
        find.text(
          'Choose your game uniform, practice wear or sideline apparel.',
        ),
        findsOneWidget,
      );
      expect(find.text('Select a garment to customise.'), findsOneWidget);
      expect(GarmentScreen.tilesFor('American Football').map((t) => t.name), [
        'Game Kit', 'Game Jersey', 'Game Pants', 'Practice Jersey', //
        'Training Tee', 'Training Shorts', 'Compression Top',
        'Compression Shorts', 'Game Socks', 'Hoodie', 'Varsity Jacket',
        'Hooded Tracksuit', 'Waterproof Jacket', 'Cap', 'Bucket Hat',
        'Beanie',
      ]);
      expect(GarmentScreen.moreFor('American Football'), isEmpty);
      expect((c.garment, c.productName), ('Full Kit', 'Game Kit'));
      // Names only: no description lines, no "3D preview uses" notes.
      expect(find.text('Game jersey, pants and socks.'), findsNothing);
      expect(find.textContaining('3D preview uses'), findsNothing);
      // The field background, not the shared stadium.
      final bg = tester
          .widgetList<Image>(find.byType(Image))
          .map((i) => (i.image as AssetImage).assetName);
      expect(
        bg,
        contains('assets/images/showroom/stage-american-football.webp'),
      );
      expect(bg, isNot(contains('assets/images/showroom/stadium-stage.webp')));
      // The coming-soon pants cannot be chosen; the game jersey can.
      await revealTap(tester, 'GAME PANTS');
      expect(c.productName, 'Game Kit');
      await revealTap(tester, 'GAME JERSEY');
      expect((c.garment, c.productName), ('Football jersey', 'Game Jersey'));
      expect(GarmentScreen.projectNameFor(c), 'American Football Game Jersey');
      await tester.pump(const Duration(seconds: 3));
    },
  );

  testWidgets(
    'the sport chooser keeps the stadium background (American Football chosen)',
    (tester) async {
      final c = AppController(store: FakeStore());
      c.sport = 'American Football';
      c.screen = AppScreen.sport;
      await mountPhone(tester, c);
      await tester.pumpAndSettle();
      final images = tester
          .widgetList<Image>(find.byType(Image))
          .map((i) => i.image)
          .whereType<AssetImage>()
          .map((i) => i.assetName);
      expect(images, contains('assets/images/showroom/stadium-stage.webp'));
      expect(
        images,
        isNot(contains('assets/images/showroom/stage-american-football.webp')),
      );
      await tester.pump(const Duration(seconds: 3));
    },
  );

  testWidgets(
    'every sport: its garment step and pictures, every tile on its 3D garment, '
    'Continue opens the Studio with its name (linked modules of 9.106)',
    (tester) async {
      final missing = <String>[];
      for (final sport in sportCategories) {
        final c = AppController(store: FakeStore());
        c.sport = sport.name;
        GarmentScreen.showAll.value = false;
        GarmentScreen.startOn(c);
        c.screen = AppScreen.garment;
        // A fresh app for each sport (the last one ended in the Studio).
        await tester.pumpWidget(const SizedBox());
        await mountPhone(tester, c);
        await tester.pumpAndSettle();
        final title = sport.heading ?? sport.name;
        final heading = sport.group == 'apparel'
            ? '$title teamwear'
            : '$title uniforms & teamwear';
        expect(
          find.text(heading.toUpperCase()),
          findsOneWidget,
          reason: sport.id,
        );
        expect(
          find.text(
            sport.subtitle ?? 'Choose what you want to design for $title.',
          ),
          findsOneWidget,
          reason: sport.id,
        );
        expect(
          find.byKey(const ValueKey('garment-hint')),
          sport.selectHint == null ? findsNothing : findsOneWidget,
          reason: sport.id,
        );
        final images = tester
            .widgetList<Image>(find.byType(Image))
            .map((i) => i.image)
            .whereType<AssetImage>()
            .map((i) => i.assetName);
        expect(
          images,
          contains(
            'assets/images/showroom/${sport.backdrop ?? 'stadium-stage'}.webp',
          ),
          reason: sport.id,
        );
        // Every tile's picture is in the app (no missing picture).
        for (final t in sport.tiles) {
          final file = 'assets/images/showroom/garment-${t.art}.webp';
          if (!File(file).existsSync()) missing.add('${sport.id}: $file');
        }
        // Every tile, tapped: a 3D garment puts its garment, name and
        // settings on the kit; a coming-soon one changes nothing.
        for (final t in sport.tiles) {
          final before = (c.garment, c.productName);
          await revealTap(tester, t.name.toUpperCase());
          if (t.soon) {
            expect((c.garment, c.productName), before, reason: t.name);
            continue;
          }
          expect(
            (c.garment, c.productName),
            (t.garment, t.name),
            reason: '${sport.id} ${t.name}',
          );
          if (t.trackStyle != null) {
            expect(c.trackStyle, t.trackStyle, reason: t.name);
          }
        }
        // Continue: the Studio, on the last tile's 3D garment, with its name.
        final last = sport.tiles.lastWhere((t) => !t.soon);
        await revealTap(tester, last.name.toUpperCase());
        // The "coming soon in 3D" note of a tapped coming-soon tile sits over
        // the button for a moment.
        await tester.pump(const Duration(seconds: 4));
        await revealTap(tester, 'CONTINUE TO STUDIO');
        expect(c.screen, AppScreen.studio, reason: sport.id);
        expect((c.garment, c.productName), (last.garment, last.name));
        expect(
          find.textContaining('${sport.name} · ${last.name}'),
          findsOneWidget,
          reason: sport.id,
        );
        await tester.pump(const Duration(seconds: 3));
      }
      expect(missing, isEmpty);
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
