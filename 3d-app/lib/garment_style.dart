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

/// The garment's own neck (the Full kit picture's crew-neck look makes its
/// jersey's round).
String? ownNeck(String garment, Map<String, String> zoneColors) {
  if (!hasNeckStyle(garment)) return null;
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
String? neckOf(String garment, String? neck, Map<String, String> zoneColors) {
  if (!hasNeckStyle(garment)) return null;
  return neck != null && neckValues.contains(neck)
      ? neck
      : ownNeck(garment, zoneColors);
}

/// "V-neck", "Round neck", "RC006 Grandad collar, 1 button".
String? neckLabel(
  String garment,
  String? neck,
  Map<String, String> zoneColors,
) {
  final n = neckOf(garment, neck, zoneColors);
  if (n == null) return null;
  for (final (id, code, name) in rugbyCollars) {
    if (id == n) return id == 'shallow-v' ? name : '$code $name';
  }
  return neckLabels[n];
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
