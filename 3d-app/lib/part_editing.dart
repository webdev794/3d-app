import 'dart:async';

import 'package:flutter/material.dart';

import 'app_controller.dart';
import 'design_document.dart';
import 'project_sync.dart';

/// Task 9.134, Parts: one part of the kit (a sleeve, the front, the back,
/// the side panels ...) edited on its own, in the 3D viewer's and the
/// website's format (scratchpad TP1/parts.md):
///
///     design.parts = {<partKey>: {colour, fade, pattern, patternColour, patternOpacity}}
///     design.layers[i].clip = <partKey>   // an object shown on that part only
///
/// Only the parts changed are kept: a design without them looks and saves
/// exactly as before.

/// A top's parts, as the viewer names them. Left and right are the
/// wearer's (on the front view the left sleeve is on the right of the
/// screen).
const topParts = [
  'front',
  'back',
  'leftSleeve',
  'rightSleeve',
  'collar',
  'sides',
  'hem',
];

/// The socks' own printed parts (with their front and back).
const sockParts = ['sockBand', 'sockHoops', 'sockFoot'];

/// The cap's own printed parts (with its front and back).
const capParts = [
  'capBrim',
  'capUnder',
  'capPiping',
  'capSweep',
  'capSweepLow',
];

/// The skirt's own printed part (with its front, back, side panels and hem).
const skirtParts = ['skirtBand'];

/// The shorts' parts (the Shorts, or the shorts of a Full Kit).
const shortsParts = [
  'shortsFront',
  'shortsBack',
  'shortsSides',
  'shortsHem',
  'waistband',
];

const partLabels = {
  'front': 'Front',
  'back': 'Back',
  'leftSleeve': 'Left sleeve',
  'rightSleeve': 'Right sleeve',
  'collar': 'Collar',
  'sides': 'Side panels',
  'hem': 'Hem',
  'shortsFront': 'Shorts front',
  'shortsBack': 'Shorts back',
  'shortsSides': 'Shorts side stripes',
  'shortsHem': 'Shorts hems',
  'waistband': 'Waistband',
  'sockBand': 'Top band',
  'sockHoops': 'Hoops',
  'sockFoot': 'Heel & toe',
  'capBrim': 'Brim',
  'capUnder': 'Under the brim',
  'capPiping': 'Piping',
  'capSweep': 'Side sweep',
  'capSweepLow': 'Lower side sweep',
  'skirtBand': 'Waistband',
};

/// "Left sleeve" for 'leftSleeve'.
String partLabel(String key) => partLabels[key] ?? key;

/// The parts [garment] (the app's garment name) has, in the panel's order.
List<String> partsOf(String garment) => switch (garment) {
  'Singlet' ||
  'Netball dress' => const ['front', 'back', 'collar', 'sides', 'hem'],
  // Their hood, collar and rib keep their own area colours (Colours).
  'Hoodie' || 'Zip hoodie' || 'Varsity jacket' || 'Track jacket' => const [
    'front',
    'back',
    'leftSleeve',
    'rightSleeve',
    'sides',
    'hem',
  ],
  'Socks' => const ['front', 'back', ...sockParts],
  'Cap' => const ['front', 'back', ...capParts],
  'Skirt' => const ['front', 'back', 'sides', 'hem', ...skirtParts],
  'Shorts' => shortsParts,
  'Full Kit' => const [...topParts, ...shortsParts],
  _ => topParts,
};

/// The 3D piece a part is on (a layer's `part`): 'top' or 'shorts'.
String partPiece(String key) => shortsParts.contains(key) ? 'shorts' : 'top';

/// The collar and the waistband are a 3D rib of their own: a colour only (no
/// fade, pattern or objects).
bool partColourOnly(String key) => key == 'collar' || key == 'waistband';

final _hexColour = RegExp(r'^#[0-9a-fA-F]{6}$');
String? _colour(Object? value) =>
    value is String && _hexColour.hasMatch(value) ? value : null;

/// A number kept as an int when whole (90, not 90.0), as the website saves it.
num _number(double value) =>
    value == value.roundToDouble() ? value.round() : value;

const _keep = Object();

/// A fade across a part, drawn over its colour: from [from] to [to] (null:
/// it fades out into what is under it, the part's colour or the kit) in the
/// direction [angle] (degrees: 0 top to bottom, 90 left to right, 180 bottom
/// to top, 270 right to left).
@immutable
class PartFade {
  const PartFade({required this.from, this.to, this.angle = 0});
  final String from;
  final String? to;
  final double angle;

  /// The ready-made directions, with their names (as the website's).
  static const directions = [
    (0, 'Top to bottom', Icons.south_rounded),
    (180, 'Bottom to top', Icons.north_rounded),
    (90, 'Left to right', Icons.east_rounded),
    (270, 'Right to left', Icons.west_rounded),
    (45, 'Diagonal', Icons.south_east_rounded),
  ];

  /// Null unless it has a valid From colour.
  static PartFade? fromJson(Object? value) {
    if (value is! Map) return null;
    final from = _colour(value['from']);
    if (from == null) return null;
    final angle = value['angle'];
    return PartFade(
      from: from,
      to: _colour(value['to']),
      angle: angle is num && angle.isFinite ? angle.toDouble() : 0,
    );
  }

  Map<String, dynamic> toJson() => {
    'from': from,
    'to': to,
    'angle': _number(angle),
  };

  PartFade copyWith({String? from, Object? to = _keep, double? angle}) =>
      PartFade(
        from: from ?? this.from,
        to: identical(to, _keep) ? this.to : to as String?,
        angle: angle ?? this.angle,
      );

  /// The direction's name ("Top to bottom"), or the angle.
  String get directionName =>
      directions.where((d) => d.$1 == angle % 360).firstOrNull?.$2 ??
      '${angle.round()}°';
}

/// One part's own look (design.parts.<key>); every field optional.
@immutable
class PartStyle {
  const PartStyle({
    this.colour,
    this.fade,
    this.pattern,
    this.patternColour,
    this.patternOpacity,
  });

  /// Its own colour ('#rrggbb': a plain part, the kit's pattern is not
  /// drawn on it); null follows the kit.
  final String? colour;
  final PartFade? fade;

  /// A pattern on this part only: a built-in name (the Patterns names) or an
  /// uploaded picture (data: or https URL, as design.zones values); null:
  /// the kit's pattern.
  final String? pattern;

  /// The pattern's colour; null: the kit's Pattern colour.
  final String? patternColour;

  /// 0..1 (null: 1): the part's own pattern, or the kit's pattern on it.
  final double? patternOpacity;

  bool get isEmpty =>
      colour == null &&
      fade == null &&
      pattern == null &&
      patternColour == null &&
      patternOpacity == null;

  /// Reads design.parts.<key>; anything not valid is left out.
  factory PartStyle.fromJson(Object? value) {
    if (value is! Map) return const PartStyle();
    final pattern = value['pattern'], opacity = value['patternOpacity'];
    return PartStyle(
      colour: _colour(value['colour']),
      fade: PartFade.fromJson(value['fade']),
      pattern: pattern is String && pattern.isNotEmpty && pattern != 'None'
          ? pattern
          : null,
      patternColour: _colour(value['patternColour']),
      patternOpacity: opacity is num && opacity.isFinite
          ? opacity.toDouble().clamp(0, 1)
          : null,
    );
  }

  /// Only the fields set.
  Map<String, dynamic> toJson() => {
    'colour': ?colour,
    if (fade case final fade?) 'fade': fade.toJson(),
    'pattern': ?pattern,
    'patternColour': ?patternColour,
    if (patternOpacity case final opacity?) 'patternOpacity': _number(opacity),
  };

  /// As the website keeps it (parts.ts cleanPart): a pattern colour only
  /// with a pattern of its own, an opacity only under 100% (to the
  /// hundredth), a fade's angle in whole degrees.
  PartStyle cleaned() {
    final opacity = patternOpacity == null
        ? null
        : (patternOpacity! * 100).round() / 100;
    return PartStyle(
      colour: colour,
      fade: fade?.copyWith(angle: fade!.angle.roundToDouble()),
      pattern: pattern,
      patternColour: pattern == null ? null : patternColour,
      patternOpacity: opacity == null || opacity >= 1
          ? null
          : opacity.clamp(0.0, 1.0),
    );
  }

  /// A copy with the fields given (null clears one).
  PartStyle copyWith({
    Object? colour = _keep,
    Object? fade = _keep,
    Object? pattern = _keep,
    Object? patternColour = _keep,
    Object? patternOpacity = _keep,
  }) => PartStyle(
    colour: identical(colour, _keep) ? this.colour : colour as String?,
    fade: identical(fade, _keep) ? this.fade : fade as PartFade?,
    pattern: identical(pattern, _keep) ? this.pattern : pattern as String?,
    patternColour: identical(patternColour, _keep)
        ? this.patternColour
        : patternColour as String?,
    patternOpacity: identical(patternOpacity, _keep)
        ? this.patternOpacity
        : patternOpacity as double?,
  );
}

/// Where a new object goes on a part chosen from the part list (no tap to
/// place it), as the website's (parts.ts partSpots): on the print, in
/// garment metres (y up from the hem, x 0 down the middle, + the wearer's
/// left), clear of the wordmark, crest, name and number.
({String side, double x, double y}) partSpot(String garment, String key) =>
    switch (key) {
      'back' => (side: 'back', x: 0.0, y: 0.2),
      'leftSleeve' => (side: 'front', x: 0.37, y: 0.6),
      'rightSleeve' => (side: 'front', x: -0.37, y: 0.6),
      'collar' => (side: 'front', x: 0.0, y: 0.7),
      // A singlet's side panel ends at its outline (x 0.254); the skirt's are low on its sides.
      'sides' when garment == 'Skirt' => (side: 'front', x: 0.23, y: 0.12),
      'sides' => (
        side: 'front',
        x: garment == 'Singlet' ? 0.227 : 0.265,
        y: 0.3,
      ),
      'hem' => (side: 'front', x: 0.0, y: 0.07),
      'shortsFront' => (side: 'front', x: -0.12, y: 0.25),
      'shortsBack' => (side: 'back', x: 0.12, y: 0.25),
      'shortsSides' => (side: 'front', x: 0.26, y: 0.2),
      'shortsHem' => (side: 'front', x: -0.15, y: 0.05),
      'waistband' => (side: 'front', x: 0.0, y: 0.4),
      'skirtBand' => (side: 'front', x: 0.0, y: 0.32),
      _ => (side: 'front', x: 0.0, y: 0.22),
    };

/// A part's look in one line, as the website's design sheet writes it
/// (parts.ts partSummary): "Own colour #E92137 · Fade #FFC52F > clear (0°) ·
/// Pattern Hoops #05727A 40%" (the PDF fonts have no arrow: ">").
String partSummary(PartStyle style) {
  final fade = style.fade;
  final opacity = style.patternOpacity == null
      ? ''
      : ' ${(style.patternOpacity! * 100).round()}%';
  final pattern = style.pattern;
  return [
    if (style.colour case final colour?) 'Own colour ${colour.toUpperCase()}',
    if (fade != null)
      'Fade ${fade.from.toUpperCase()} > '
          '${fade.to?.toUpperCase() ?? 'clear'} (${_number(fade.angle)}°)',
    if (pattern != null)
      'Pattern ${_picture.hasMatch(pattern) ? 'My pattern' : pattern}'
          '${style.patternColour == null ? '' : ' ${style.patternColour!.toUpperCase()}'}'
          '$opacity'
    else if (opacity.isNotEmpty)
      'Kit pattern$opacity',
  ].join(' · ');
}

/// An uploaded pattern picture rather than a pattern name.
final _picture = RegExp(r'^(data:|/|https?:)');

/// Editing the kit's parts (the Studio's Part panel), each change as the
/// other Studio tools: shown on the 3D at once and one Undo step.
extension PartEditing on AppController {
  /// The parts with a look of their own, in the part list's order.
  List<String> get changedParts => [
    for (final key in const [
      ...topParts,
      ...shortsParts,
      ...sockParts,
      ...capParts,
      ...skirtParts,
    ])
      if (parts[key] is Map) key,
  ];

  /// The colours the parts add to the kit (their own colours, fades and
  /// pattern colours), each once, lower case: the Mockup's true colours
  /// after the kit's three.
  List<String> get partColours {
    final out = <String>[];
    for (final key in changedParts) {
      final style = partStyleOf(key);
      for (final hex in [
        style.colour,
        style.fade?.from,
        style.fade?.to,
        style.patternColour,
      ]) {
        if (hex != null && !out.contains(hex.toLowerCase())) {
          out.add(hex.toLowerCase());
        }
      }
    }
    return out;
  }

  /// [key]'s own look (empty: it follows the kit).
  PartStyle partStyleOf(String key) => PartStyle.fromJson(parts[key]);

  /// Sets [key]'s look (an empty look takes the part back to the kit). One
  /// undo step; [record] false changes it live (after a recorded first
  /// change: a colour wheel or slider drag).
  void setPartStyle(String key, PartStyle style, {bool record = true}) {
    final clean = style.cleaned();
    void change() {
      final next = copyParts(parts);
      if (clean.isEmpty) {
        next.remove(key);
      } else {
        next[key] = clean.toJson();
      }
      parts = next;
    }

    if (record) {
      edit(change);
    } else {
      update(change);
    }
  }

  /// The objects (logo, text or shape layers) shown on [key] only.
  List<Map<String, dynamic>> partObjects(String key) => [
    for (final layer in layers)
      if (layer['clip'] == key) layer,
  ];

  /// [key] has a look of its own (the part list's mark, Reset part), as the
  /// website's part dot.
  bool partChanged(String key) => parts.containsKey(key);

  /// [key] back to the kit's colours and pattern, as one undo step; the
  /// objects on it stay (each has its own Remove), as the website's Reset.
  void resetPart(String key) =>
      edit(() => parts = copyParts(parts)..remove(key));

  /// Puts [object] (a layer: image, text or shape) on [key] only, cut to its
  /// edges: where the part was tapped ([at]: {part, side, x, y} from the
  /// viewer), else in the part's middle. One undo step; it is selected.
  void addPartObject(
    String key,
    Map<String, dynamic> object, {
    Map<String, dynamic>? at,
  }) {
    final piece = partPiece(key);
    final spot = partSpot(garment, key);
    final tapped =
        at != null &&
        (at['part'] ?? 'top') == piece &&
        at['x'] is num &&
        at['y'] is num;
    // Smaller on a sleeve, as the website's Parts panel.
    final sleeve = key == 'leftSleeve' || key == 'rightSleeve';
    addLayer({
      'part': piece,
      'side': tapped ? (at['side'] == 'back' ? 'back' : 'front') : spot.side,
      'x': tapped ? (at['x'] as num).toDouble() : spot.x,
      'y': tapped ? (at['y'] as num).toDouble() : spot.y,
      if (object['type'] == 'text') 'size': sleeve ? 0.04 : 0.05,
      if (object['type'] != 'text') 'w': sleeve ? 0.07 : 0.09,
      ...object,
      'clip': key,
    });
  }

  /// The colour [key] shows while it follows the kit (the colour wheel's
  /// start): the Primary for the body and sleeves, the Secondary for the
  /// side panels, hems and the rib collar and waistband; the varsity and
  /// track jacket areas' own colours where they have them.
  Color partKitColour(String key) {
    Color? area(String name) =>
        zoneColors[name] == null ? null : ProjectSync.color(zoneColors[name]);
    final sleeve = key == 'leftSleeve' || key == 'rightSleeve';
    if (isVarsity(garment)) {
      return sleeve
          ? area('sleeves') ?? secondaryColor
          : area('body') ?? mainColor;
    }
    if (isTrack(garment)) {
      final body = area('body') ?? mainColor;
      if (sleeve) return area('shoulder') ?? secondaryColor;
      if (key == 'sides') return area('side') ?? secondaryColor;
      if (key == 'hem') return area('cuffs') ?? body;
      return body;
    }
    if (isHoodie(garment)) return mainColor;
    // As the website's Parts panel: side panels and the rib follow the
    // Secondary, the rest the Primary.
    return key == 'sides' || key == 'shortsSides' || partColourOnly(key)
        ? secondaryColor
        : mainColor;
  }

  /// The colour [key] shows now: its own, else the kit's.
  Color partColour(String key) {
    final own = partStyleOf(key).colour;
    return own == null ? partKitColour(key) : ProjectSync.color(own);
  }

  /// The kit's pattern colour, as the 3D paints it on a part without one of
  /// its own.
  Color get kitPatternColour => patternColor == null
      ? defaultPatternColor
      : ProjectSync.color(patternColor);

  /// [key] chosen in the Part panel's list: the 3D turns to its side (the
  /// front or the back) and the whole part lights up.
  void showPart(String key) {
    if (key == 'back' || key == 'shortsBack') {
      unawaited(showView('Back'));
    } else if (key == 'front' || key == 'shortsFront') {
      unawaited(showView('Front'));
    }
    glowPart?.call({'part': partPiece(key), 'key': key});
  }
}
