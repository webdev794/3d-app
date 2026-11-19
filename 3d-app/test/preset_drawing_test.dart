import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/design_document.dart';

/// PRESETRL 2026-11-19: the Rugby League presets are design pictures
/// ('preset:<id>') that a project keeps and the app has bundled.
void main() {
  test('a preset design picture key is kept, others are not', () {
    final layout = copyLayout({
      'asset': 'preset:rl-c02-01',
      'name': 'Rugby League Chevron Strike',
      'roles': ['front', 'back'],
      'parts': ['jersey'],
      'kind': 'drawing',
    });
    expect(layout?['asset'], 'preset:rl-c02-01');
    expect(layout?['kind'], 'drawing');
    expect(copyLayout({'asset': '../x', 'name': 'x', 'roles': []}), isNull);
    expect(isPresetDrawing('preset:rl-c03-06'), isTrue);
    expect(isPresetDrawing('preset:../x'), isFalse);
  });

  test('every Rugby League preset has its bundled picture and thumbnail', () {
    final list =
        jsonDecode(File('assets/presets.json').readAsStringSync()) as List;
    final rl = [
      for (final p in list.cast<Map>())
        if (p['sport'] == 'rugby-league') p,
    ];
    expect(rl, hasLength(12));
    for (final p in rl) {
      expect(
        File('assets/images/presets/${p['id']}.webp').existsSync(),
        isTrue,
      );
      expect(
        File('assets/images/presets/drawings/${p['id']}.jpg').existsSync(),
        isTrue,
      );
      expect((p['design'] as Map)['layout']['asset'], 'preset:${p['id']}');
    }
  });
}
