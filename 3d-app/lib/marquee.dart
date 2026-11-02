// Signage & Marquees (client mockups 297 / 298, 2026-11-02): the marquee's
// design as the app's Marquee Studio edits it and the bundled 3D viewer
// (assets/viewer/marquee.html) paints it. The same JSON as the website's
// resources/js/marquee.ts; saved in a project as design.marquee (garment
// 'marquee').

/// The printable zones, in the Studio's order.
const marqueeZones = [
  'roof',
  'valanceFront',
  'valanceBack',
  'valanceLeft',
  'valanceRight',
  'wallLeft',
  'wallRight',
  'wallBack',
];

const marqueeZoneLabels = {
  'roof': 'Roof',
  'valanceFront': 'Front valance',
  'valanceBack': 'Back valance',
  'valanceLeft': 'Left valance',
  'valanceRight': 'Right valance',
  'wallLeft': 'Left wall',
  'wallRight': 'Right wall',
  'wallBack': 'Back wall',
};

const marqueeSizeLabels = {'3x3': '3 × 3 m', '3x6': '3 × 6 m'};
const marqueeWallsLabels = {
  'none': 'Roof only',
  'back': 'Back wall',
  'full': 'Full walls',
};
const marqueePatterns = [
  'Solid',
  'Blades',
  'Velocity',
  'Chevron',
  'Stripes',
  'Diagonal',
  'Hoops',
  'Dots',
  'Camo',
  'Tribal',
];

/// The mockups' colours (black, cyan, royal blue, white), then a few more.
const marqueeSwatches = [
  '#05080c',
  '#00c8ff',
  '#1560ff',
  '#ffffff',
  '#e4002b',
  '#ffcc00',
  '#00a650',
  '#7a2bd8',
  '#ff6a13',
  '#8a8f98',
];

/// The brand pictures (the "3" emblem and the wordmark) as layer sources;
/// the viewer draws them from its own inlined copies.
const brandLogo = '3deezi:logo', brandWordmark = '3deezi:wordmark';

final _hex = RegExp(r'^#[0-9a-fA-F]{6}$');
bool isHex(Object? v) => v is String && _hex.hasMatch(v);

/// Which walls a design has: 'full', 'half' or null for each wall zone.
Map<String, String?> marqueeWalls(Map<String, dynamic> d) {
  final walls = d['walls'] as String? ?? 'back';
  final full = walls == 'full';
  return {
    'wallBack': walls != 'none' ? 'full' : null,
    'wallLeft': full
        ? 'full'
        : d['halfWall'] == true
        ? 'half'
        : null,
    'wallRight': full ? 'full' : null,
  };
}

/// A zone's print size in metres, or null when the marquee has no such wall.
({double w, double h})? marqueeZoneSize(String zone, Map<String, dynamic> d) {
  final w = d['size'] == '3x6' ? 6.0 : 3.0;
  const depth = 3.0, eave = 2.1, valance = 0.26, half = 1.0, over = 0.035;
  switch (zone) {
    case 'roof':
      return (w: w + over * 2, h: depth + over * 2);
    case 'valanceFront' || 'valanceBack':
      return (w: w + over * 2, h: valance);
    case 'valanceLeft' || 'valanceRight':
      return (w: depth + over * 2, h: valance);
  }
  final kind = marqueeWalls(d)[zone];
  if (kind == null) return null;
  return (
    w: zone == 'wallBack' ? w : depth,
    h: kind == 'half' ? half : eave - 0.06,
  );
}

/// The zones this marquee has.
List<String> marqueeZonesOf(Map<String, dynamic> d) => [
  for (final z in marqueeZones)
    if (marqueeZoneSize(z, d) != null) z,
];

String marqueeZoneLabel(String zone, Map<String, dynamic> d) =>
    zone == 'wallLeft' && marqueeWalls(d)['wallLeft'] == 'half'
    ? 'Left half wall'
    : marqueeZoneLabels[zone] ?? zone;

String metres(double n) => '${(n * 100).round() / 100} m';

int _counter = 0;
String newLayerId(String zone, String what) =>
    '$zone-$what-${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}${(_counter++).toRadixString(36)}';

/// The mockups' marquee: black panels with cyan and royal blue blades, the
/// "3" emblem and the wordmark on every panel (as viewer marquee.js).
Map<String, dynamic> defaultMarquee() {
  Map<String, dynamic> blades(String id) => {
    'id': id,
    'type': 'pattern',
    'name': 'Blades',
    'color': '#00c8ff',
    'accent': '#1560ff',
    'scale': 1,
  };
  Map<String, dynamic> logo(String id, double x, double y, double w) => {
    'id': id,
    'type': 'image',
    'name': 'Logo',
    'src': brandLogo,
    'x': x,
    'y': y,
    'w': w,
  };
  Map<String, dynamic> word(String id, double x, double y, double w) => {
    'id': id,
    'type': 'image',
    'name': 'Wordmark',
    'src': brandWordmark,
    'x': x,
    'y': y,
    'w': w,
  };
  Map<String, dynamic> valance(String z) => {
    'color': '#05080c',
    'layers': [
      blades('$z-pattern'),
      logo('$z-logo', 0.25, 0.5, 0.09),
      word('$z-word', 0.53, 0.5, 0.36),
    ],
  };
  return {
    'size': '3x3',
    'walls': 'back',
    'halfWall': true,
    'zones': {
      'roof': {
        'color': '#05080c',
        'layers': [
          blades('roof-pattern'),
          logo('roof-logo', 0.5, 0.66, 0.2),
          word('roof-word', 0.5, 0.79, 0.3),
        ],
      },
      'valanceFront': valance('valanceFront'),
      'valanceBack': valance('valanceBack'),
      'valanceLeft': valance('valanceLeft'),
      'valanceRight': valance('valanceRight'),
      'wallBack': {
        'color': '#05080c',
        'layers': [
          blades('wallBack-pattern'),
          logo('wallBack-logo', 0.5, 0.42, 0.24),
          word('wallBack-word', 0.5, 0.66, 0.5),
        ],
      },
      'wallLeft': {
        'color': '#05080c',
        'layers': [
          blades('wallLeft-pattern'),
          logo('wallLeft-logo', 0.5, 0.33, 0.2),
          word('wallLeft-word', 0.5, 0.74, 0.5),
        ],
      },
      'wallRight': {
        'color': '#05080c',
        'layers': [
          blades('wallRight-pattern'),
          logo('wallRight-logo', 0.5, 0.42, 0.24),
          word('wallRight-word', 0.5, 0.66, 0.5),
        ],
      },
    },
  };
}

/// A saved or received design made whole: missing zones from the default,
/// unknown values back to the default's.
Map<String, dynamic> normalizeMarquee(Object? raw) {
  final base = defaultMarquee();
  if (raw is! Map) return base;
  final zones = Map<String, dynamic>.from(base['zones'] as Map);
  final rawZones = raw['zones'];
  if (rawZones is Map) {
    for (final z in marqueeZones) {
      final zd = rawZones[z];
      if (zd is Map && zd['layers'] is List) {
        zones[z] = {
          'color': isHex(zd['color'])
              ? zd['color']
              : (zones[z] as Map)['color'],
          'layers': [
            for (final l in zd['layers'] as List)
              if (l is Map && l['id'] is String) Map<String, dynamic>.from(l),
          ],
        };
      }
    }
  }
  return {
    'size': raw['size'] == '3x6' ? '3x6' : '3x3',
    'walls': raw['walls'] == 'none' || raw['walls'] == 'full'
        ? raw['walls']
        : 'back',
    'halfWall': raw['halfWall'] != false,
    'zones': zones,
  };
}

/// A deep copy (the Studio's undo history keeps whole designs).
Map<String, dynamic> copyMarquee(Map<String, dynamic> d) =>
    _copy(d) as Map<String, dynamic>;
Object? _copy(Object? v) => switch (v) {
  Map() => <String, dynamic>{
    for (final e in v.entries) '${e.key}': _copy(e.value),
  },
  List() => [for (final x in v) _copy(x)],
  _ => v,
};

/// The product's name on projects and orders: "Custom marquee 3 × 3 m".
String marqueeProductName(Map<String, dynamic> d) =>
    'Custom marquee ${marqueeSizeLabels[d['size']] ?? '3 × 3 m'}';

/// The project body the server keeps (POST/PATCH /projects), as the website
/// saves it (pages/Signage.tsx save).
Map<String, dynamic> marqueeProjectBody(
  String name,
  Map<String, dynamic> d, {
  String? thumbnail,
}) {
  final roof = (d['zones'] as Map)['roof'] as Map;
  final pattern = (roof['layers'] as List).cast<Map>().firstWhere(
    (l) => l['type'] == 'pattern',
    orElse: () => const {},
  );
  return {
    'name': name.trim().isEmpty ? 'Custom marquee' : name.trim(),
    'sport': 'training',
    'garment': 'marquee',
    'mode': 'dyo',
    'design': {
      'garment': 'marquee',
      'main': roof['color'],
      'secondary': isHex(pattern['color']) ? pattern['color'] : '#00c8ff',
      'accent': isHex(pattern['accent']) ? pattern['accent'] : '#1560ff',
      'pattern': 'Solid',
      'productName': marqueeProductName(d),
      'sportName': 'Signage & Marquees',
      'marquee': d,
    },
    'thumbnail': ?thumbnail,
  };
}

/// The order of [quantity] marquees of a saved project (POST /orders), as
/// the website's REVIEW DESIGN orders it.
Map<String, dynamic> marqueeOrderBody({
  required int projectId,
  int? version,
  required Map<String, dynamic> design,
  required int quantity,
  required String contact,
  String phone = '',
  String address = '',
  String notes = '',
}) => {
  'project_id': projectId,
  'project_version': ?version,
  'design_final': true,
  'names': 'none',
  'sizes': {'${design['size'] == '3x6' ? '3x6' : '3x3'} m': quantity},
  'contact_name': contact,
  if (phone.trim().isNotEmpty) 'phone': phone.trim(),
  if (address.trim().isNotEmpty) 'shipping_address': address.trim(),
  if (notes.trim().isNotEmpty) 'notes': notes.trim(),
};
