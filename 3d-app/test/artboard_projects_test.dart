import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/artboard.dart';

import 'features_test.dart' show FakeStore;

/// 5.119 and 5.62–5.68: Artboard designs in the account, artwork linked to
/// its design, updated in place when sent again.
void main() {
  test('artwork from the Artboard keeps its design and is updated in place', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    final at = artboardPlacement('back-centre', c.garment);
    expect(at['side'], 'back');
    expect(
      c.placeArtboardArtwork(
        src: 'data:image/png;base64,AAAA',
        name: 'Crest',
        doc: 7,
        at: at,
      ),
      'added',
    );
    final layer = c.layers.single;
    expect(layer['artboard'], 7);
    expect(layer['x'], 0.0);
    expect(layer['y'], 0.4);
    // Moved in the Studio, then sent again: same layer, same place, new picture.
    c.changeLayer(layer['id'] as String, {'x': 0.2});
    expect(
      c.placeArtboardArtwork(
        src: 'data:image/png;base64,BBBB',
        name: 'Crest v2',
        doc: 7,
      ),
      'updated',
    );
    expect(c.layers, hasLength(1));
    expect(c.layers.single['src'], 'data:image/png;base64,BBBB');
    expect(c.layers.single['x'], 0.2);
    expect(c.layers.single['name'], 'Crest v2');
    c.undo();
    expect(c.layers.single['src'], 'data:image/png;base64,AAAA');
    // Another design is a new layer; a picture without a design too.
    c.placeArtboardArtwork(
      src: 'data:image/png;base64,CCCC',
      name: 'Badge',
      doc: 8,
    );
    c.placeArtboardArtwork(src: 'data:image/png;base64,DDDD', name: 'Picture');
    expect(c.layers, hasLength(3));
    expect(c.layers.last.containsKey('artboard'), isFalse);
  });

  test('shorts get shorts placements; a new kit starts on the garment', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    expect(artboardPlacement('left-chest', 'Shorts')['part'], 'shorts');
    expect(artboardPlacement('shorts-right', 'Full Kit')['x'], -0.15);
    c.newKit('Polo');
    expect(c.garment, 'Polo');
    expect(c.layers, isEmpty);
    c.editInArtboard(12);
    expect(c.openArtboardDoc, 12);
    expect(c.screen, AppScreen.artboard);
  });

  test('designs are saved, listed and opened through the API', () async {
    final sent = <http.Request>[];
    final api = ApiClient(
      baseUrl: 'https://test.example',
      client: MockClient((r) async {
        sent.add(r);
        final data = switch ((r.method, r.url.path)) {
          ('GET', '/api/v1/artboards') => [
            {'id': 3, 'name': 'Crest', 'template': false},
          ],
          ('GET', '/api/v1/artboards/3') => {
            'id': 3,
            'name': 'Crest',
            'document': '{"objects":[]}',
          },
          ('POST', '/api/v1/artboards') || ('PATCH', '/api/v1/artboards/3') => {
            'id': 3,
            'name': 'Crest',
            'version': 2,
          },
          _ => {'message': 'Design deleted.'},
        };
        return http.Response(jsonEncode({'data': data}), 200);
      }),
    )..token = 't';
    expect((await api.artboards(template: true)).single['name'], 'Crest');
    expect(sent.last.url.query, 'template=1');
    expect((await api.artboard(3))['document'], '{"objects":[]}');
    await api.saveArtboard(
      name: 'Crest',
      document: '{"objects":[]}',
      template: true,
    );
    expect(jsonDecode(sent.last.body), containsPair('template', true));
    await api.saveArtboard(
      id: 3,
      name: 'Crest',
      document: '{"objects":[]}',
      version: 1,
    );
    expect(sent.last.method, 'PATCH');
    expect(jsonDecode(sent.last.body), containsPair('expected_version', 1));
    await api.deleteArtboard(3);
    expect(sent.last.method, 'DELETE');
  });
}
