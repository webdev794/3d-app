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
    // A design picture (the garment's front and back drawn flat).
    if (value['kind'] == 'drawing') 'kind': 'drawing',
  };
}

Map<String, dynamic>? copyGradient(Object? value) => value is Map
    ? (jsonDecode(jsonEncode(value)) as Map).cast<String, dynamic>()
    : null;

/// The parts edited on their own (task 9.134, the website's `design.parts`):
/// `{leftSleeve: {colour, fade, pattern, patternColour, patternOpacity}}`,
/// only the parts changed (see part_editing.dart). Empty: the kit as before.
/// The server sends `[]` when there are none.
Map<String, dynamic> copyParts(Object? value) => value is Map
    ? {
        for (final entry in value.entries)
          if (entry.value is Map && (entry.value as Map).isNotEmpty)
            '${entry.key}': (jsonDecode(jsonEncode(entry.value)) as Map)
                .cast<String, dynamic>(),
      }
    : {};

const garmentZones = {
  'body': 'Chest & body',
  'yoke': 'Shoulders',
  'sleeves': 'Sleeves',
  'sides': 'Side panels',
  'hem': 'Hem',
  // Only on the pocket polo (pool and darts shirts) and hoodies (their kangaroo pocket).
  'pocket': 'Chest pocket',
  // Only on hoodies.
  'hood': 'Hood',
};

/// The hoodies (pull-over and full zip), as the app names them.
bool isHoodie(String garment) => garment == 'Hoodie' || garment == 'Zip hoodie';

/// A hoodie's own colour areas (AppController.zoneColors) and their labels; the zip only on the zip hoodie.
const hoodieAreas = {
  'hood': 'Hood',
  'lining': 'Hood lining',
  'rib': 'Cuffs & waistband',
  'pocket': 'Pocket',
  'zip': 'Zip',
  // Unset: no stripe (task 9.154).
  'stripe': 'Sleeve stripe',
};

/// The varsity (letterman) jacket, as the app names it.
bool isVarsity(String garment) => garment == 'Varsity jacket';

/// The varsity jacket's own colour areas (AppController.zoneColors), as the
/// website's VARSITY AREAS. Unset, the body, rib and snaps follow the main
/// colour, the sleeves and lining the secondary, the stripes and pocket trim
/// the sleeves.
const varsityAreas = {
  'body': 'Body (wool)',
  'sleeves': 'Sleeves (leather)',
  'rib': 'Collar, cuffs & waistband',
  'ribStripe': 'Rib stripes',
  'snaps': 'Snaps',
  'pocketTrim': 'Pocket trim',
  'lining': 'Quilted lining',
};

/// The track suit jacket, as the app names it.
bool isTrack(String garment) => garment == 'Track jacket';

/// The track jacket's own colour areas (AppController.zoneColors), as the
/// website's TRACK JACKET AREAS. Unset, the body follows the main colour, the
/// panels and zips the secondary, the stripe the accent, the collar (or hood)
/// and the cuffs the body.
const trackAreas = {
  'body': 'Body',
  'shoulder': 'Shoulder & sleeve panels',
  'side': 'Side panels',
  'stripe': 'Sleeve stripe',
  'collar': 'Collar',
  'cuffs': 'Cuffs & hem band',
  'zip': 'Zips',
};

const studioPatterns = [
  'Solid',
  'Stripes',
  'Chevron',
  'Velocity',
  'Blades',
  'Swirl',
  'Hoops',
  'Dots',
  'Diagonal',
  'Tribal',
  'Camo',
];
