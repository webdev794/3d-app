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
