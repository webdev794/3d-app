import 'dart:convert';

/// Shared renderer document fields. Copies keep undo snapshots independent
/// from mutable bridge payloads and preserve future layer properties on sync.
List<Map<String, dynamic>> copyLayers(Object? value) => value is List
    ? value
          .whereType<Map>()
          .map(
            (item) =>
                (jsonDecode(jsonEncode(item)) as Map).cast<String, dynamic>(),
          )
          .toList()
    : [];

Map<String, String> copyZones(Object? value) => value is Map
    ? {
        for (final entry in value.entries)
          if (entry.value is String) '${entry.key}': entry.value as String,
      }
    : {};

/// The fixed marks (wordmark, crest, sponsor, name, number) moved, resized,
/// turned or hidden on the 2D panels, keyed `top_wordmark` and so on (the
/// website's `design.marks`). The server sends `[]` when there are none.
Map<String, dynamic> copyMarks(Object? value) => value is Map
    ? {
        for (final entry in value.entries)
          if (entry.value is Map)
            '${entry.key}': (jsonDecode(jsonEncode(entry.value)) as Map)
                .cast<String, dynamic>(),
      }
    : {};

/// A factory print layout on the kit (the website's `design.layout`): the file
/// (`asset`, one of the user's saved assets), each panel found in it named in
/// the order found (`roles`, 'none' = not used), whether the plain strip under
/// the body panels is the hem fold, whether the white lines across the sleeves
/// are joined up (left out), and the parts it makes. Null when none.
Map<String, dynamic>? copyLayout(Object? value) {
  if (value is! Map) return null;
  final asset = value['asset'], roles = value['roles'], parts = value['parts'];
  if (asset is! int || roles is! List) return null;
  return {
    'asset': asset,
    'name': '${value['name'] ?? 'Print layout'}',
    'roles': [for (final role in roles) '$role'],
    'hemFold': value['hemFold'] != false,
    'joinLines': value['joinLines'] != false,
    'parts': [
      if (parts is List)
        for (final part in parts) '$part',
    ],
  };
}

Map<String, dynamic>? copyGradient(Object? value) => value is Map
    ? (jsonDecode(jsonEncode(value)) as Map).cast<String, dynamic>()
    : null;

const garmentZones = {
  'body': 'Chest & body',
  'yoke': 'Shoulders',
  'sleeves': 'Sleeves',
  'sides': 'Side panels',
  'hem': 'Hem',
};

const studioPatterns = [
  'Solid',
  'Stripes',
  'Chevron',
  'Velocity',
  'Hoops',
  'Dots',
  'Diagonal',
  'Tribal',
  'Camo',
];
