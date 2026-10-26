import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/ai_service.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/project_store.dart';
import 'package:three_deezi/project_sync.dart';
import 'package:three_deezi/screens/create_home.dart' show garmentTiles;
import 'package:three_deezi/screens/order_entry.dart';
import 'package:three_deezi/sports_catalog.dart';
import 'package:three_deezi/widgets/ai_stage.dart';
import 'package:three_deezi/widgets/studio_tools.dart';

import 'features_test.dart' show FakeStore;

/// The netball dress (tasks.md 9.126): a women's fitted dress, its own 3D
/// garment, as on the website (config/catalog.php, NetballDressTest.php).
void main() {
  test('the Netball dress tile is its own 3D garment, in every garment list', () {
    final tile = sportNamed('Netball')!.tiles.first;
    expect((tile.name, tile.garment, tile.fit), ('Netball dress', 'Netball dress', 'exact'));
    expect(sportNamed('Netball')!.garments.first, 'Netball dress');
    expect(garmentIds['Netball dress'], 'netball-dress');
    expect(garmentTiles, contains(('Netball dress', 'netball-dress')));
    expect(aiDesignGarments, contains('Netball dress'));
    // An AI netball picture's print sheet goes onto the dress as drawn.
    expect(DesignReading.drawn, contains('Netball dress'));
    expect(DesignReading.garments['netball-dress']!.$1, 'Netball dress');
    // Netball keeps its marking rules: no names or numbers, position letters.
    final netball = sportNamed('Netball')!;
    expect((netball.names, netball.numbers), (false, false));
    expect(netball.positions, contains('GS'));
  });

  test('a netball dress saves and reopens as itself, on disk and on the server', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    c.garment = 'Netball dress';
    final project = Project(
      title: 'Panthers',
      sport: 'Netball',
      garment: 'Netball dress',
      mode: 'DYO',
      kit: c.kit,
      updated: DateTime.now(),
    );
    final sent = jsonDecode(jsonEncode(ProjectSync.toServer(project))) as Map<String, dynamic>;
    expect(sent['garment'], 'netball-dress');
    final disk = ProjectStore.decode(jsonDecode(jsonEncode(ProjectStore.encode(project))), {});
    final server = ProjectSync.fromServer({...sent, 'id': 9, 'version': 1});
    expect(disk.garment, 'Netball dress');
    expect(server.garment, 'Netball dress');
  });

  test('briefs, pattern areas and orders know the dress', () {
    expect(garmentInBrief('A black and gold netball dress for the Panthers'), 'Netball dress');
    expect(garmentInBrief('Tennis dresses in white'), 'Netball dress');
    expect(garmentInBrief('A basketball singlet'), 'Singlet');
    // Sleeveless: no sleeve area.
    expect(patternAreas('Netball dress').map((a) => a.$1), isNot(contains('sleeves')));
    // Ordered on a singlet row, named by the design ("Netball dress").
    expect(orderGarmentFor('Netball dress'), 'singlet');
    expect(isDesignRow('Netball dress', 'singlet'), isTrue);
    expect(isDesignRow('netball-dress', 'jersey'), isFalse);
  });
}
