import 'sports_catalog.dart';

/// Garment style (NK1 2026-11-02, the client's mockups images/299 and 300), as
/// the website's garmentStyle.ts: design.neck is the neck's shape ('round' |
/// 'v') on the garments whose 3D model can switch it, and on rugby jerseys one
/// of the rugby collar library (rc001-rc010, shallow-v); design.fit is a rugby
/// jersey's fit. null: the garment's own (its tile picture's). The 3D viewer
/// makes them (website/viewer/src/necks.js, rugbycollars.js).

/// The garments with a neck to choose (app names) and their own neck.
const neckGarments = {
  'Jersey': 'v',
  'Full Kit': 'v',
  'Training Tee': 'round',
  'Singlet': 'round',
  // (The Netball dress: its 3D model's own round neck; a V cuts the model's
  // neck and binds it with our own binding: user 2026-11-13.)
  'Netball dress': 'round',
  'Shooting shirt': 'v',
};
const neckLabels = {'round': 'Round neck', 'v': 'V-neck'};

/// The rugby collar library (id, code, name), as on the client's Rugby Jersey
/// Studio (images/300).
const rugbyCollars = [
  ('rc001', 'RC001', 'Round crew, contrast band'),
  ('rc002', 'RC002', 'V insert, tipped'),
  ('rc003', 'RC003', 'Round crew, double band'),
  ('rc004', 'RC004', 'Wing collar'),
  ('rc005', 'RC005', 'Round crew, tipped shoulders'),
  ('rc006', 'RC006', 'Grandad collar, 1 button'),
  ('rc007', 'RC007', 'V-neck, button placket'),
  ('rc008', 'RC008', 'Polo collar, 3 buttons'),
  ('rc009', 'RC009', 'Polo collar, 1 button'),
  ('rc010', 'RC010', 'Fold-down collar, crossover'),
  ('shallow-v', 'CUSTOM SHALLOW V', 'Custom shallow V'),
];
final neckValues = ['round', 'v', for (final c in rugbyCollars) c.$1];

/// A rugby jersey's fits (id, label, note).
const rugbyFits = [
  ('classic', 'Classic', 'Loose, traditional'),
  ('pro', 'Pro / Athletic', 'Fitted through the body'),
  ('tight', 'Tight / Compression', 'Close to the skin'),
];

/// Neck trim / collar colours offered first (the mockups' cyan, white, black).
const trimSwatches = [
  ('#16b4f0', 'Cyan'),
  ('#ffffff', 'White'),
  ('#111214', 'Black'),
];

bool isRugbySport(String sport) => sport.toLowerCase().contains('rugby');
bool hasNeckStyle(String garment) => neckGarments.containsKey(garment);

/// A garment with no neck at all (shorts, pants, skirts, socks, headwear), by
/// its name or product name.
bool hasNoNeck(String name) => RegExp(
      r'shorts|pants|tights|skirt|skort|socks|\bcap\b|\bhat\b|beanie',
      caseSensitive: false,
    ).hasMatch(name);

/// The polo's collar on the Darts & Pool polos (client 2026-11-17, 582), as
/// garmentStyle.ts: Button-up is the ready-made polo model's own
/// (polo-shirt.glb); Zip-up is its own ready-made model (polo-zip.glb), coming
/// soon until that file is wired by the shared recipe (its flag
/// zoneColors.poloZip): then poloZipReady = true (and POLO_ZIP_READY, and
/// poloZip in the model flags).
const poloZipReady = true;
bool hasPoloCollar(String sport, String garment) =>
    sport == 'Darts & Pool' && garment == 'Polo';
bool isZipPolo(Map<String, String> zoneColors) =>
    poloZipReady && _hex.hasMatch(zoneColors['poloZip'] ?? '');

/// The wordmark with the Zip-up collar (MODELQ5 2026-11-19, as
/// garmentStyle.ts poloCollarMarks): small on the right chest, clear of the
/// zip down the centre front; back to the Darts & Pool polos' own place
/// (centred, y 0.503) with Button-up, unless it was moved in between.
const zipPoloWordmark = {'x': -0.09, 'y': 0.607, 'scale': 0.42};
Map<String, dynamic> poloCollarMarks(Map<String, dynamic> marks, bool zip) {
  final all = Map<String, dynamic>.from(marks);
  final w = Map<String, dynamic>.from(
    (all['top_wordmark'] as Map?) ?? const <String, dynamic>{},
  );
  if (zip) {
    all['top_wordmark'] = {...w, ...zipPoloWordmark};
  } else if (w['x'] == zipPoloWordmark['x'] &&
      w['y'] == zipPoloWordmark['y'] &&
      w['scale'] == zipPoloWordmark['scale']) {
    all['top_wordmark'] = {...w, 'x': 0.0, 'y': 0.503, 'scale': 1.0};
  }
  return all;
}

/// A rugby jersey (or the rugby kit's jersey): the collar library and the fit.
bool hasRugbyStyle(String sport, String garment) =>
    isRugbySport(sport) && (garment == 'Jersey' || garment == 'Full Kit');

final _hex = RegExp(r'^#[0-9a-fA-F]{6}$');

/// The Basketball singlet tile's own 3D model (its look's
/// zoneColors.bballSinglet, BBSINGLET 2026-11-13): its own neck is a V (null
/// for any other design); its round neck is our own neck piece filled in on
/// it, as garmentStyle.ts.
String? bballOwnNeck(String garment, Map<String, String> zoneColors) =>
    garment == 'Singlet' && _hex.hasMatch(zoneColors['bballSinglet'] ?? '')
    ? 'v'
    : null;

/// The Rugby League Jersey tile on its own 3D model (FBJERSEY 2026-11-13,
/// zoneColors.fbJersey, as garmentStyle.ts): its own round neck; the collar
/// library but for the collars whose own pieces (a wing collar, fold-down
/// polo collars) do not yet sit cleanly on it; its own Regular fit and a
/// slimmer Pro fit ('tight').
bool isModelJersey(String garment, Map<String, String> zoneColors) =>
    garment == 'Jersey' && _hex.hasMatch(zoneColors['fbJersey'] ?? '');
const _notOnModel = <String>[]; // every collar is made on it (FBJERSEY round 3)
List<(String, String, String)> collarsFor(
  String garment,
  Map<String, String> zoneColors,
) => isModelJersey(garment, zoneColors)
    ? [
        for (final c in rugbyCollars)
          if (!_notOnModel.contains(c.$1)) c,
      ]
    : rugbyCollars;
List<(String, String, String)> fitsFor(
  String garment,
  Map<String, String> zoneColors,
) => isModelJersey(garment, zoneColors)
    ? const [
        ('pro', 'Regular', 'The jersey as made'),
        ('tight', 'Pro fit', 'Slimmer, athletic'),
      ]
    : rugbyFits;

/// A tile on a ready-made 3D model shows that model's own neck only (user
/// 2026-11-16: nothing is cut; other neck styles come later, laid on top), as
/// garmentStyle.ts MODEL_OWN_NECKS: its look's flag and the model's own neck.
const modelOwnNecks = {
  // (The Rugby Union jersey's V-neck model, RUGBYV 2026-11-19.)
  'rugbyVJersey': 'v',
  'scJersey': 'v',
  'aflGuernsey': 'round',
  'trainingSinglet': 'round',
  'trainingTee': 'round',
  'rugbyJersey': 'round',
  // (the retired old Rugby League jersey model's flag: its designs show the new model: RUGBYJ)
  'fbJersey': 'round',
  'womenRugbyJersey': 'v',
};

/// A model's own neck by its name where it is not a plain round or V neck
/// (RUGBYJ 2026-11-18, the user: the Rugby League jersey's "Stand-up
/// collar"), as garmentStyle.ts MODEL_NECK_NAMES.
const modelNeckNames = {
  'rugbyJersey': 'Stand-up collar',
  'fbJersey': 'Stand-up collar',
};

/// The name of a neck style on this design: the model's own name for its own
/// neck, else "Round neck" / "V-neck".
String neckName(String garment, Map<String, String> zoneColors, String id) {
  for (final e in modelNeckNames.entries) {
    if (_hex.hasMatch(zoneColors[e.key] ?? '') &&
        fixedNeck(garment, zoneColors) == id) {
      return e.value;
    }
  }
  return neckLabels[id] ?? id;
}
String? fixedNeck(String garment, Map<String, String> zoneColors) {
  if (!hasNeckStyle(garment)) return null;
  for (final e in modelOwnNecks.entries) {
    if (_hex.hasMatch(zoneColors[e.key] ?? '')) return e.value;
  }
  // (Every training tee is on its ready-made model: its own round neck.)
  if (garment == 'Training Tee') return 'round';
  return null;
}

/// The garment's own neck (the Full kit picture's crew-neck look makes its
/// jersey's round).
String? ownNeck(String garment, Map<String, String> zoneColors) {
  if (!hasNeckStyle(garment)) return null;
  final fixed = fixedNeck(garment, zoneColors);
  if (fixed != null) return fixed;
  final bball = bballOwnNeck(garment, zoneColors);
  if (bball != null) return bball;
  if (isModelJersey(garment, zoneColors) &&
      !_hex.hasMatch(zoneColors['fbV'] ?? '')) {
    return 'round';
  }
  if (garment == 'Full Kit' && _hex.hasMatch(zoneColors['crewNeck'] ?? '')) {
    return 'round';
  }
  return neckGarments[garment];
}

/// The neck shown: the design's own choice, else the garment's.
/// The client's collar styles on the Rugby League jersey's model (picture
/// 611, RUGBYJ 2026-11-19; viewer modelcollars.js), as garmentStyle.ts
/// MODEL_COLLARS: id (the design's neck) and name. Warrior is the model's own
/// stand-up collar (no neck stored).
const modelCollars = <(String, String)>[
  ('grandfather', 'Grandfather'),
  ('crew', 'Crew'),
  ('mandarin', 'Mandarin'),
  ('keyhole', 'Keyhole'),
  ('viking', 'Viking'),
  ('warrior', 'Warrior'),
  ('traditional', 'Traditional'),
  ('perth', 'Perth'),
];
bool isModelCollar(String? id) => modelCollars.any((c) => c.$1 == id);

/// The collar styles a design can choose (the Rugby League jersey's model,
/// alone or in its kit), else null.
List<(String, String)>? modelCollarsFor(
  String garment,
  Map<String, String> zoneColors,
) =>
    (garment == 'Jersey' || garment == 'Full Kit') &&
        (_hex.hasMatch(zoneColors['rugbyJersey'] ?? '') ||
            _hex.hasMatch(zoneColors['fbJersey'] ?? ''))
    ? modelCollars
    : null;

String? neckOf(String garment, String? neck, Map<String, String> zoneColors) {
  if (!hasNeckStyle(garment)) return null;
  if (modelCollarsFor(garment, zoneColors) != null) {
    return isModelCollar(neck) ? neck : 'warrior';
  }
  return fixedNeck(garment, zoneColors) ??
      (neck != null && neckValues.contains(neck)
          ? neck
          : ownNeck(garment, zoneColors));
}

/// "V-neck", "Round neck", "RC006 Grandad collar, 1 button".
String? neckLabel(
  String garment,
  String? neck,
  Map<String, String> zoneColors,
) {
  final n = neckOf(garment, neck, zoneColors);
  if (n == null) return null;
  for (final (id, name) in modelCollarsFor(garment, zoneColors) ?? const <(String, String)>[]) {
    if (id == n) return '$name collar';
  }
  for (final (id, code, name) in rugbyCollars) {
    if (id == n) return id == 'shallow-v' ? name : '$code $name';
  }
  return neckName(garment, zoneColors, n);
}

bool isRugbyCollar(String? neck) => rugbyCollars.any((c) => c.$1 == neck);

String fitOf(String? fit) => fit == 'classic' || fit == 'tight' ? fit! : 'pro';
String fitLabel(String? fit) =>
    rugbyFits.firstWhere((f) => f.$1 == fitOf(fit)).$2;

/// A valid neck from a saved design (null: the garment's own).
String? readNeck(Object? v) => v is String && neckValues.contains(v) ? v : null;

/// A valid fit from a saved design (null: Pro, the tile's own).
String? readFit(Object? v) =>
    v == 'classic' || v == 'tight' ? v as String : null;

/// The viewer's garment id of an app garment name.
String viewerGarmentOf(String garment) => garmentIds[garment] ?? 'jersey';
