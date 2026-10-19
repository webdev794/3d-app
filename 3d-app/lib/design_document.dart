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
