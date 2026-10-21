import 'dart:math' as math;

import 'package:flutter/painting.dart';

import 'app_controller.dart';

/// One colour of a gradient fill: [at] runs 0 (start) to 1 (end).
class GradientStop {
  const GradientStop(this.hex, this.at);
  final String hex;
  final double at;
  Color get color =>
      Color(0xff000000 | (int.tryParse(hex.substring(1), radix: 16) ?? 0));
  Map<String, dynamic> toJson() => {
    'color': hex,
    'at': (at * 1000).round() / 1000,
  };
}

/// A ready-made gradient in DYO Studio → Colours → GRADIENT PRESETS.
class GradientPreset {
  const GradientPreset(this.id, this.name, this.stops);
  final String id, name;
  final List<GradientStop> stops;
}

/// The same list as the website's (website/resources/js/gradientPresets.json; test/gradient_presets_test.dart checks
/// they match). Two stops each, except Sunset: orange, pink and purple.
const gradientPresets = [
  GradientPreset('cyan-blue', 'CYAN / BLUE', [
    GradientStop('#12e1f0', 0),
    GradientStop('#2f6bff', 1),
  ]),
  GradientPreset('blue-violet', 'BLUE / VIOLET', [
    GradientStop('#2f6bff', 0),
    GradientStop('#8b3dff', 1),
  ]),
  GradientPreset('sunset', 'SUNSET', [
    GradientStop('#ff8a00', 0),
    GradientStop('#ff3d7f', .5),
    GradientStop('#7b2ff7', 1),
  ]),
  GradientPreset('black-red', 'BLACK / RED', [
    GradientStop('#0b0b0f', 0),
    GradientStop('#e10600', 1),
  ]),
  GradientPreset('black-gold', 'BLACK / GOLD', [
    GradientStop('#0b0b0f', 0),
    GradientStop('#d4a017', 1),
  ]),
  GradientPreset('teal-navy', 'TEAL / NAVY', [
    GradientStop('#00a19a', 0),
    GradientStop('#0b1f4d', 1),
  ]),
  GradientPreset('green-yellow', 'GREEN / YELLOW', [
    GradientStop('#19b34a', 0),
    GradientStop('#f5e200', 1),
  ]),
  GradientPreset('white-grey', 'WHITE / GREY', [
    GradientStop('#ffffff', 0),
    GradientStop('#8a929c', 1),
  ]),
];

final _hex = RegExp(r'^#[0-9a-fA-F]{6}$');

/// All of a gradient's stops, in order (a two-colour gradient from before stops: its from and to).
List<GradientStop> gradientStops(Map gradient) {
  final stops = <GradientStop>[
    if (gradient['stops'] is List)
      for (final s in gradient['stops'] as List)
        if (s is Map && _hex.hasMatch('${s['color']}'))
          GradientStop(
            '${s['color']}'.toLowerCase(),
            ((s['at'] as num?)?.toDouble() ?? 0).clamp(0, 1).toDouble(),
          ),
  ];
  if (stops.length < 2) {
    if (!_hex.hasMatch('${gradient['from']}') ||
        !_hex.hasMatch('${gradient['to']}'))
      return [];
    return [
      GradientStop('${gradient['from']}'.toLowerCase(), 0),
      GradientStop('${gradient['to']}'.toLowerCase(), 1),
    ];
  }
  return stops..sort((a, b) => a.at.compareTo(b.at));
}

/// A gradient as the design stores it; from and to stay the first and last colours.
Map<String, dynamic> makeGradient(
  List<GradientStop> stops,
  num angle, {
  String? preset,
}) {
  final sorted = [...stops]..sort((a, b) => a.at.compareTo(b.at));
  return {
    'from': sorted.first.hex,
    'to': sorted.last.hex,
    'angle': angle,
    'stops': [for (final s in sorted) s.toJson()],
    'preset': preset,
  };
}

/// The colour zones of the app's Colours tool: 0 Primary (design 'gradient'), 1 Secondary (design 'gradients'),
/// 2 Accent (names, numbers and the wordmark: solid only).
Map<String, dynamic>? zoneGradient(AppController c, int slot) => switch (slot) {
  0 => c.gradient,
  1 => (c.gradients?['secondary'] as Map?)?.cast<String, dynamic>(),
  _ => null,
};

/// Gives one zone this gradient (null: back to its solid colour); the other zones keep theirs.
void setZoneGradient(
  AppController c,
  int slot,
  Map<String, dynamic>? gradient,
) {
  if (slot == 0) {
    c.gradient = gradient;
  } else if (slot == 1) {
    final others = {...?c.gradients};
    if (gradient == null) {
      others.remove('secondary');
    } else {
      others['secondary'] = gradient;
    }
    c.gradients = others.isEmpty ? null : others;
  }
}

/// The kit's angle (0 = top to bottom, 90 = left to right) as a Flutter gradient.
LinearGradient flutterGradient(List<GradientStop> stops, {double? angle}) {
  if (angle == null) {
    return LinearGradient(
      colors: [for (final s in stops) s.color],
      stops: [for (final s in stops) s.at],
    );
  }
  final a = angle * math.pi / 180;
  final dx = math.sin(a), dy = -math.cos(a);
  // Flutter's y runs down; the kit's angle 0 starts at the top.
  return LinearGradient(
    begin: Alignment(-dx, dy),
    end: Alignment(dx, -dy),
    colors: [for (final s in stops) s.color],
    stops: [for (final s in stops) s.at],
  );
}
