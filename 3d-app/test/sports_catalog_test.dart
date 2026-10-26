import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/ai_service.dart';
import 'package:three_deezi/project_sync.dart';
import 'package:three_deezi/screens/create_home.dart';
import 'package:three_deezi/sports_catalog.dart';
import 'package:three_deezi/widgets/ai_stage.dart';
import 'package:three_deezi/widgets/category_icon.dart';

/// The app's sports list (lib/sports_catalog.dart) against the website's
/// config/catalog.php, and every category's pictures and symbol (task 9.79).
void main() {
  // The website's sports (config/catalog.php): id, group, style hint, heading,
  // "More teamwear" and the garment tiles ($tile, $near and $soon calls).
  final php = File('website/config/catalog.php').readAsStringSync();
  final block = php.substring(
    php.indexOf(r'$sports = ['),
    php.indexOf('\nreturn ['),
  );
  final starts = [
    for (final m in RegExp(r"\['id' => '").allMatches(block)) m.start,
    block.length,
  ];
  const str = r"'((?:[^'\\]|\\.)*)'";
  String? field(String text, String key) =>
      RegExp("'$key' => $str").firstMatch(text)?[1]?.replaceAll(r"\'", "'");
  final tileCall = RegExp(
    r'\$(tile|near|soon)\(' +
        str +
        ', ' +
        str +
        r"((?:, '[^']*')*)\)( \+ \['design' => \['trackStyle' => '(\w+)'\]\])?",
  );
  final website = [
    for (var i = 0; i + 1 < starts.length; i++)
      (String text) {
        return (
          id: field(text, 'id')!,
          group: field(text, 'group')!,
          prompt: field(text, 'prompt'),
          heading: field(text, 'heading'),
          more: !text.contains("'more' => false"),
          subtitle: field(text, 'subtitle'),
          selectHint: field(text, 'select_hint'),
          descriptions: !text.contains("'descriptions' => false"),
          backdrop: field(text, 'backdrop'),
          // The AI designer's marking rules (netball: no names or numbers,
          // position letters instead).
          names: !text.contains("'names' => false"),
          numbers: !text.contains("'numbers' => false"),
          positions: [
            for (final p in RegExp(r"'([^']*)'").allMatches(
              RegExp(r"'positions' => \[([^\]]*)\]").firstMatch(text)?[1] ?? '',
            ))
              p[1]!,
          ],
          tiles: [
            for (final m in tileCall.allMatches(text))
              (
                kind: m[1]!,
                name: m[2]!.replaceAll(r"\'", "'"),
                description: m[3]!.replaceAll(r"\'", "'"),
                args: [
                  for (final a in RegExp(r"'([^']*)'").allMatches(m[4]!)) a[1]!,
                ],
                trackStyle: m[6],
              ),
          ],
        );
      }(block.substring(starts[i], starts[i + 1])),
  ];
  const garmentIds = {
    'Jersey': 'jersey',
    'Full Kit': 'fullkit',
    'Shorts': 'shorts',
    'Training Tee': 'tee',
    'Singlet': 'singlet',
    'Netball dress': 'netball-dress',
    'Polo': 'polo',
    'Polo with pocket': 'pocketpolo',
    'Hoodie': 'hoodie',
    'Zip hoodie': 'ziphoodie',
    'Varsity jacket': 'varsity',
    'Track jacket': 'trackjacket',
  };

  test('the same categories as the website, with the same groups, garments '
      'and style hints', () {
    expect(website.length, sportCategories.length);
    expect(sportCategories.length, greaterThanOrEqualTo(29));
    for (final w in website) {
      final s = sportWithId(w.id);
      expect(s, isNotNull, reason: w.id);
      expect(s!.group, w.group, reason: w.id);
      expect(s.hint, w.prompt, reason: w.id);
      expect(s.heading, w.heading, reason: w.id);
      expect(s.more, w.more, reason: w.id);
      // The garment step's own settings (American Football, images/165.jpg).
      expect(s.subtitle, w.subtitle, reason: w.id);
      expect(s.selectHint, w.selectHint, reason: w.id);
      expect(s.descriptions, w.descriptions, reason: w.id);
      expect(s.backdrop, w.backdrop, reason: w.id);
      expect(s.names, w.names, reason: w.id);
      expect(s.numbers, w.numbers, reason: w.id);
      expect(s.positions, w.positions, reason: w.id);
      if (s.backdrop != null) {
        expect(
          File('assets/images/showroom/${s.backdrop}.webp').existsSync(),
          isTrue,
          reason: w.id,
        );
      }
      // The same garment tiles (task 9.99): names, descriptions, 3D garments,
      // fit, the garment still to build, the picture and the track style.
      expect(s.tiles.length, w.tiles.length, reason: w.id);
      expect(w.tiles.length, greaterThanOrEqualTo(6), reason: w.id);
      for (var i = 0; i < w.tiles.length; i++) {
        final a = s.tiles[i], b = w.tiles[i], why = '${w.id} ${b.name}';
        expect(a.name, b.name, reason: why);
        expect(a.description, b.description, reason: why);
        expect(a.trackStyle, b.trackStyle, reason: why);
        final (fit, garment, future, art) = switch (b.kind) {
          'tile' => (
            'exact',
            b.args[0],
            null,
            b.args.elementAtOrNull(1) ?? b.args[0],
          ),
          'near' => (
            'nearest',
            b.args[0],
            b.args[1],
            b.args.elementAtOrNull(2) ?? b.args[0],
          ),
          _ => ('soon', null, b.args[0], b.args[1]),
        };
        expect(a.fit, fit, reason: why);
        expect(garmentIds[a.garment], garment, reason: why);
        expect(a.future, future, reason: why);
        expect(a.art, art, reason: why);
      }
    }
    // Ids and names are unique; the old sports keep theirs.
    expect(
      {for (final s in sportCategories) s.id}.length,
      sportCategories.length,
    );
    expect(
      {for (final s in sportCategories) s.name}.length,
      sportCategories.length,
    );
    expect(ProjectSync.sports['Soccer'], 'football');
    expect(ProjectSync.sports['Ice Hockey'], 'hockey');
    expect(ProjectSync.sports['Training / Gym'], 'training');
    expect(ProjectSync.sports['American Football'], 'american-football');
    expect(ProjectSync.sports['Darts & Pool'], 'darts');
    // Netball's rules are read from the website's list, not left out.
    final netball = website.firstWhere((w) => w.id == 'netball');
    expect(netball.names, isFalse);
    expect(netball.numbers, isFalse);
    expect(netball.positions, ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK']);
  });

  test('every category has its pictures, symbol, AI tile and garments', () {
    for (final s in sportCategories) {
      expect(
        File('assets/images/showroom/kit-${s.id}.webp').existsSync(),
        isTrue,
        reason: 'kit picture ${s.id}',
      );
      expect(
        File('assets/images/ai_designer/sport-${s.id}.webp').existsSync(),
        isTrue,
        reason: 'AI tile ${s.id}',
      );
      expect(
        categoryOutlines.containsKey(categorySymbol(s.id)),
        isTrue,
        reason: 'symbol ${s.id}',
      );
      expect(s.garments, isNotEmpty);
      for (final g in s.garments) {
        expect(
          garmentTiles.any((t) => t.$1 == g),
          isTrue,
          reason: '$g ${s.id}',
        );
      }
    }
    // The AI JSON schema's sport list and the AI row cover them all.
    expect(designSports, [for (final s in sportCategories) s.name]);
    expect(aiQuickSports.map((t) => t.id).toSet(), {
      for (final s in sportCategories) s.id,
    });
    expect(aiQuickSports.take(3).map((t) => t.label), [
      'Rugby League',
      'Rugby Union',
      'Netball',
    ]);
    expect(dyoSports.length, sportCategories.length);
  });

  test('briefs find the new sports; the old words still work', () {
    expect(
      sportInBrief('navy american football jersey')?.id,
      'american-football',
    );
    expect(sportInBrief('golf polo for our club day')?.id, 'golf');
    expect(sportInBrief('tennis dress, white and green')?.id, 'tennis');
    expect(sportInBrief('athletics singlet for nationals')?.id, 'athletics');
    expect(sportInBrief('swim club deck coat')?.id, 'swimming');
    expect(sportInBrief('darts shirt with my name')?.id, 'darts');
    expect(sportInBrief('baseball jersey with pinstripes')?.id, 'softball');
    expect(sportInBrief('soccer kit in red')?.id, 'football');
    expect(sportInBrief('a touch of gold on the sleeves'), isNull);
    expect(sportInBrief('boxing club gear')?.id, 'fight-wear');
    expect(sportInBrief('gym singlet')?.id, 'training');
  });

  test(
    'the AI gets the style hint with the sport; old sports read as before',
    () {
      expect(sportForAi('Rugby League'), 'Rugby League');
      expect(sportForAi('Golf'), startsWith('Golf (golf: '));
      expect(sportForAi('Someone else'), 'Someone else');
    },
  );

  test('the garment step offers the sport\'s own tiles and More teamwear', () {
    // The client's Netball list (images/157.jpg).
    expect(GarmentScreen.tilesFor('Netball').map((t) => t.name), [
      'Netball dress',
      'Netball skirt',
      'Singlet with bib',
      'Training singlet',
      'Training T-shirt',
      'Netball bibs',
      'Tracksuit',
      'Hoodie',
    ]);
    expect(GarmentScreen.tilesFor('Netball').first.garment, 'Netball dress');
    expect(GarmentScreen.tilesFor('Netball')[1].soon, isTrue);
    // More teamwear: the 3D garments Netball's own tiles do not use.
    expect(GarmentScreen.moreFor('Netball').map((t) => t.garment), [
      'Full Kit',
      'Jersey',
      'Shorts',
      'Polo',
      'Polo with pocket',
      'Zip hoodie',
      'Varsity jacket',
    ]);
    // The client's Rugby League list (images/160.jpg): 11 tiles, all shown.
    final league = GarmentScreen.tilesFor('Rugby League');
    expect(league.length, 11);
    expect(league.first.name, 'Rugby League Kit');
    expect(league.first.garment, 'Full Kit');
    expect(league[7].trackStyle, 'hood');
    expect(GarmentScreen.moreFor('Rugby League'), isEmpty);
    expect(sportWithId('rugby-union')!.heading, 'Rugby');
    // A sport's garments are worked out from its tiles.
    expect(sportWithId('darts')!.garments, [
      'Polo with pocket',
      'Polo',
      'Training Tee',
      'Hoodie',
      'Zip hoodie',
    ]);
    expect(
      GarmentScreen.tilesFor('Unknown sport').map((t) => t.garment),
      garmentTiles.map((t) => t.$1),
    );
    // Every tile's picture is in the app.
    for (final s in sportCategories) {
      for (final t in s.tiles) {
        expect(
          File('assets/images/showroom/garment-${t.art}.webp').existsSync(),
          isTrue,
          reason: '${s.id} ${t.name}',
        );
      }
    }
  });
}
