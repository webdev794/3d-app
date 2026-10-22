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
  // The website's sports: id, name, group, garment ids and style hint.
  final php = File('website/config/catalog.php').readAsStringSync();
  final block = php.substring(
    php.indexOf("'sports' => ["),
    // The garment list itself (each sport also has a 'garments' entry).
    php.indexOf(RegExp(r"\n    'garments' => \[")),
  );
  final website = [
    for (final m in RegExp(
      r"\['id' => '([^']+)', 'name' => '((?:[^'\\]|\\.)+)'.*?'group' => '(\w+)', 'garments' => \[([^\]]*)\]((?:,\s*'prompt' => '((?:[^'\\]|\\.)*)')?)",
      dotAll: true,
    ).allMatches(block))
      (
        id: m[1]!,
        group: m[3]!,
        garments: RegExp(r"'(\w+)'").allMatches(m[4]!).map((g) => g[1]!).toList(),
        prompt: m[6]?.replaceAll(r"\'", "'"),
      ),
  ];
  const garmentIds = {
    'Jersey': 'jersey',
    'Full Kit': 'fullkit',
    'Shorts': 'shorts',
    'Training Tee': 'tee',
    'Singlet': 'singlet',
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
      expect(
        [for (final g in s.garments) garmentIds[g]],
        w.garments,
        reason: w.id,
      );
      expect(s.hint, w.prompt, reason: w.id);
    }
    // Ids and names are unique; the old sports keep theirs.
    expect({for (final s in sportCategories) s.id}.length, sportCategories.length);
    expect({for (final s in sportCategories) s.name}.length, sportCategories.length);
    expect(ProjectSync.sports['Soccer'], 'football');
    expect(ProjectSync.sports['Ice Hockey'], 'hockey');
    expect(ProjectSync.sports['Training / Gym'], 'training');
    expect(ProjectSync.sports['American Football'], 'american-football');
    expect(ProjectSync.sports['Darts & Pool'], 'darts');
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
        expect(garmentTiles.any((t) => t.$1 == g), isTrue, reason: '$g ${s.id}');
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
    expect(sportInBrief('navy american football jersey')?.id, 'american-football');
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

  test('the AI gets the style hint with the sport; old sports read as before',
      () {
    expect(sportForAi('Rugby League'), 'Rugby League');
    expect(sportForAi('Golf'), startsWith('Golf (golf: '));
    expect(sportForAi('Someone else'), 'Someone else');
  });

  test('the garment step offers the sport\'s garments, or all of them', () {
    expect(
      GarmentScreen.tilesFor('Darts & Pool').map((t) => t.$1),
      ['Polo with pocket', 'Polo', 'Training Tee'],
    );
    expect(GarmentScreen.tilesFor('Golf').map((t) => t.$1), ['Polo', 'Training Tee']);
    expect(GarmentScreen.tilesFor('Golf', all: true), garmentTiles);
    expect(GarmentScreen.tilesFor('Unknown sport'), garmentTiles);
  });
}
