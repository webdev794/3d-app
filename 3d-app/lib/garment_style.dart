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
  // (Not the Netball dress since 2026-11-12: its 3D model has its own round
  // neck; a V built the old dress, which the client refused.)
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

/// A rugby jersey (or the rugby kit's jersey): the collar library and the fit.
bool hasRugbyStyle(String sport, String garment) =>
    isRugbySport(sport) && (garment == 'Jersey' || garment == 'Full Kit');

final _hex = RegExp(r'^#[0-9a-fA-F]{6}$');

/// The garment's own neck (the Full kit picture's crew-neck look makes its
/// jersey's round).
String? ownNeck(String garment, Map<String, String> zoneColors) {
  if (!hasNeckStyle(garment)) return null;
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
