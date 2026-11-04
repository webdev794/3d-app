import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Artwork to 3D for headwear and accessories (CP1, client 2026-11-02: the
/// MANTIS cap sheet), as the website's resources/js/accessoryArt.ts. The
/// artwork is read by the AI (AiService.readAccessory: the model, its parts'
/// colours and where its front, back and side logos are); each logo is cut
/// out with its background taken away and put on its place on our 3D model
/// as an image layer, to move, resize and recolour in the Studio.

/// The app's accessories the artwork goes on (garment names, sports_catalog
/// garmentIds), and the website id of each.
const accessoryGarments = {
  'Cap': 'cap',
  '5 panel cap': 'five-panel-cap',
  'Bucket hat': 'bucket-hat',
  'Beanie': 'beanie',
  'Socks': 'socks',
  'Skirt': 'skirt',
};
bool isAccessory(String garment) => accessoryGarments.containsKey(garment);

/// A logo's box in the picture (fractions), with its height on a side.
typedef MarkBox = ({Rect box, String level});

/// The AI's reading of an accessory artwork.
class AccessoryReading {
  const AccessoryReading({
    required this.garment,
    required this.name,
    required this.main,
    required this.trim,
    required this.brim,
    required this.under,
    required this.accent,
    required this.frontText,
    required this.marks,
    required this.views,
  });

  /// The app's garment name ('Cap', …): the one the user chose.
  final String garment, name, frontText;
  final Color main, trim, brim, under, accent;

  /// front, back, left, right (the wearer's sides).
  final Map<String, MarkBox> marks;

  /// front, back: the whole garment in that view (for the logos' size).
  final Map<String, Rect> views;

  static Color _hex(Object? v, Color fallback) {
    final s = (v ?? '').toString().trim().replaceFirst('#', '');
    if (!RegExp(r'^[0-9a-fA-F]{6}$').hasMatch(s)) return fallback;
    return Color(0xff000000 | int.parse(s, radix: 16));
  }

  static Rect? _box(Object? b, double min, double max) {
    if (b is! Map || b['found'] != true) return null;
    double f(Object? v) => ((v as num?)?.toDouble() ?? 0).clamp(0.0, 1.0);
    final r = Rect.fromLTRB(f(b['x0']), f(b['y0']), f(b['x1']), f(b['y1']));
    if (r.width < min || r.height < min * 0.5) return null;
    if (r.width > max || r.height > max) return null;
    return r;
  }

  /// From the AI's JSON (the same schema as the website's
  /// OpenAiDesigner::readAccessory); [asked] the garment the user chose.
  factory AccessoryReading.fromJson(Map<String, dynamic> s, String asked) {
    final main = _hex(s['mainColor'], const Color(0xff0b1016));
    final brim = _hex(s['brimColor'], main);
    final marks = <String, MarkBox>{};
    for (final k in ['front', 'back', 'left', 'right']) {
      final b = _box(s[k], 0.01, 0.6);
      if (b == null) continue;
      final level = s[k] is Map ? '${(s[k] as Map)['level'] ?? ''}' : '';
      marks[k] = (
        box: b,
        level: const ['low', 'middle', 'high'].contains(level)
            ? level
            : 'middle',
      );
    }
    final views = <String, Rect>{};
    for (final k in ['front', 'back']) {
      final b = _box(s['${k}View'], 0.05, 1);
      if (b != null) views[k] = b;
    }
    final word = '${s['frontText'] ?? ''}'
        .replaceAll(RegExp(r'\b3\s?DEEZI\b', caseSensitive: false), '')
        .trim()
        .toUpperCase();
    return AccessoryReading(
      garment: isAccessory(asked) ? asked : 'Cap',
      name: '${s['name'] ?? ''}'.trim(),
      main: main,
      trim: _hex(s['trimColor'], main),
      brim: brim,
      under: _hex(s['underColor'], brim),
      accent: _hex(s['accentColor'], Colors.white),
      frontText: word.length > 20 ? word.substring(0, 20) : word,
      marks: marks,
      views: views,
    );
  }
}

/// A logo cut from the picture: a PNG, transparent behind it, and its width
/// and height in fractions of the picture.
typedef CutLogo = ({Uint8List png, double aspect, double w, double h});

/// Cuts the logo in [box] (fractions of [picture]) out: the background
/// colour (the commonest round the box's edge) is taken away from the edge
/// inwards, so a letter's own holes stay; then trimmed to what is left.
Future<CutLogo?> cutLogo(Uint8List picture, Rect box) async {
  try {
    final codec = await ui.instantiateImageCodec(picture);
    final image = (await codec.getNextFrame()).image;
    final pw = image.width.toDouble(), ph = image.height.toDouble();
    const pad = 0.1;
    final src = Rect.fromLTRB(
      math.max(0, (box.left - box.width * pad) * pw),
      math.max(0, (box.top - box.height * pad) * ph),
      math.min(pw, (box.right + box.width * pad) * pw),
      math.min(ph, (box.bottom + box.height * pad) * ph),
    );
    if (src.width < 6 || src.height < 6) return null;
    final k = math.min(4.0, 640 / math.max(src.width, src.height));
    final w = math.max(1, (src.width * k).round());
    final h = math.max(1, (src.height * k).round());
    final recorder = ui.PictureRecorder();
    Canvas(recorder).drawImageRect(
      image,
      src,
      Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()),
      Paint()..filterQuality = FilterQuality.high,
    );
    final drawn = await recorder.endRecording().toImage(w, h);
    final data = await drawn.toByteData(format: ui.ImageByteFormat.rawRgba);
    if (data == null) return null;
    final px = data.buffer.asUint8List();
    // The background: the commonest colour round the edge.
    final counts = <int, List<int>>{};
    void edge(int x, int y) {
      final i = (y * w + x) * 4;
      if (px[i + 3] < 40) return;
      final key = (px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | px[i + 2] >> 4;
      final e = counts.putIfAbsent(key, () => [0, px[i], px[i + 1], px[i + 2]]);
      e[0]++;
    }

    for (var x = 0; x < w; x++) {
      edge(x, 0);
      edge(x, h - 1);
    }
    for (var y = 0; y < h; y++) {
      edge(0, y);
      edge(w - 1, y);
    }
    if (counts.isNotEmpty) {
      final bg = counts.values.reduce((a, b) => a[0] >= b[0] ? a : b);
      int dist(int i) =>
          (px[i] - bg[1]).abs() +
          (px[i + 1] - bg[2]).abs() +
          (px[i + 2] - bg[3]).abs();
      final seen = Uint8List(w * h);
      final stack = <int>[];
      void push(int x, int y) {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        final p = y * w + x;
        if (seen[p] == 1) return;
        seen[p] = 1;
        if (dist(p * 4) <= 90) stack.add(p);
      }

      for (var x = 0; x < w; x++) {
        push(x, 0);
        push(x, h - 1);
      }
      for (var y = 0; y < h; y++) {
        push(0, y);
        push(w - 1, y);
      }
      while (stack.isNotEmpty) {
        final p = stack.removeLast(), i = p * 4, d = dist(i);
        px[i + 3] = d <= 45
            ? 0
            : (px[i + 3] * math.min(1, (d - 45) / 45)).round();
        final x = p % w, y = p ~/ w;
        push(x + 1, y);
        push(x - 1, y);
        push(x, y + 1);
        push(x, y - 1);
      }
    }
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3] > 40) {
          x0 = math.min(x0, x);
          x1 = math.max(x1, x);
          y0 = math.min(y0, y);
          y1 = math.max(y1, y);
        }
      }
    }
    final ui.Image keyed;
    if (x1 - x0 < 3 || y1 - y0 < 3) {
      // Nothing left (a logo in the background's own colour): as it is.
      keyed = drawn;
      x0 = 0;
      y0 = 0;
      x1 = w - 1;
      y1 = h - 1;
    } else {
      final buffer = await ui.ImmutableBuffer.fromUint8List(px);
      final descriptor = ui.ImageDescriptor.raw(
        buffer,
        width: w,
        height: h,
        pixelFormat: ui.PixelFormat.rgba8888,
      );
      keyed =
          (await (await descriptor.instantiateCodec()).getNextFrame()).image;
    }
    final ow = x1 - x0 + 1, oh = y1 - y0 + 1;
    final out = ui.PictureRecorder();
    Canvas(out).drawImageRect(
      keyed,
      Rect.fromLTWH(x0.toDouble(), y0.toDouble(), ow.toDouble(), oh.toDouble()),
      Rect.fromLTWH(0, 0, ow.toDouble(), oh.toDouble()),
      Paint(),
    );
    final png = await (await out.endRecording().toImage(
      ow,
      oh,
    )).toByteData(format: ui.ImageByteFormat.png);
    if (png == null) return null;
    return (
      png: png.buffer.asUint8List(),
      aspect: ow / oh,
      w: ow / k / pw,
      h: oh / k / ph,
    );
  } on Object {
    return null;
  }
}

/// Where a logo goes on a model's print (garment metres: the viewer's
/// capprint.js / hatprint.js) and its size limits; [across] about how wide
/// the whole garment looks in a front or back view.
typedef _Place = ({
  String side,
  double x,
  double y,
  double w,
  double min,
  double max,
  double maxH,
  double across,
});
const _capBand = 0.09;
const Map<String, Map<String, _Place>> _places = {
  // The cap: the band at y 0.09, the crown 0.2 high; the front panel ±0.102,
  // the side panels to ±0.153 on the front half (+x the wearer's left).
  'Cap': {
    'front': (
      side: 'front',
      x: 0,
      y: _capBand + 0.068,
      w: 0.1,
      min: 0.05,
      max: 0.15,
      maxH: 0.085,
      across: 0.2,
    ),
    'back': (
      side: 'back',
      x: 0,
      y: _capBand + 0.085,
      w: 0.06,
      min: 0.03,
      max: 0.1,
      maxH: 0.05,
      across: 0.2,
    ),
    'left': (
      side: 'front',
      x: 0.128,
      y: _capBand + 0.05,
      w: 0.036,
      min: 0.02,
      max: 0.044,
      maxH: 0.04,
      across: 0,
    ),
    'right': (
      side: 'front',
      x: -0.128,
      y: _capBand + 0.05,
      w: 0.036,
      min: 0.02,
      max: 0.044,
      maxH: 0.04,
      across: 0,
    ),
  },
  // The bucket hat: the crown's side from y 0.054 to 0.145.
  'Bucket hat': {
    'front': (
      side: 'front',
      x: 0,
      y: 0.1,
      w: 0.1,
      min: 0.04,
      max: 0.14,
      maxH: 0.07,
      across: 0.24,
    ),
    'back': (
      side: 'back',
      x: 0,
      y: 0.12,
      w: 0.07,
      min: 0.03,
      max: 0.12,
      maxH: 0.045,
      across: 0.24,
    ),
    'left': (
      side: 'front',
      x: 0.115,
      y: 0.1,
      w: 0.04,
      min: 0.02,
      max: 0.05,
      maxH: 0.05,
      across: 0,
    ),
    'right': (
      side: 'front',
      x: -0.115,
      y: 0.1,
      w: 0.04,
      min: 0.02,
      max: 0.05,
      maxH: 0.05,
      across: 0,
    ),
  },
};

/// The 5-panel cap takes the cap's places; the beanie its front logo on the
/// cuff (beanie.js: the cuff from y 0 to about .068).
Map<String, _Place>? _placesOf(String garment) => switch (garment) {
  '5 panel cap' => _places['Cap'],
  'Beanie' => const {
    'front': (
      side: 'front',
      x: 0,
      y: 0.033,
      w: 0.08,
      min: 0.03,
      max: 0.11,
      maxH: 0.034,
      across: 0.22,
    ),
    'back': (
      side: 'back',
      x: 0,
      y: 0.033,
      w: 0.06,
      min: 0.03,
      max: 0.1,
      maxH: 0.034,
      across: 0.22,
    ),
  },
  _ => _places[garment],
};

/// The small 3DEEZI marks (the "3" over the word) when the customer's logo
/// takes the front (BR1 2026-11-02: never the word over the customer's
/// art): on the back, low, under the back logo (viewer marks top_crest /
/// top_wordmark).
Map<String, Map<String, dynamic>>? accessoryBackMarks(String garment) =>
    switch (garment) {
      'Cap' || '5 panel cap' => const {
        'top_crest': {
          'side': 'back',
          'x': 0.0,
          'y': _capBand + 0.03,
          'scale': 0.6,
        },
        'top_wordmark': {
          'side': 'back',
          'x': 0.0,
          'y': _capBand + 0.011,
          'scale': 0.6,
        },
      },
      'Bucket hat' => const {
        'top_crest': {'side': 'back', 'x': 0.0, 'y': 0.085, 'scale': 0.55},
        'top_wordmark': {'side': 'back', 'x': 0.0, 'y': 0.067, 'scale': 0.55},
      },
      'Beanie' => const {
        'top_crest': {'side': 'back', 'x': 0.0, 'y': 0.035},
        'top_wordmark': {'side': 'back', 'x': 0.0, 'y': 0.0135},
      },
      _ => null,
    };

const _levels = {
  'Cap': {
    'low': _capBand + 0.024,
    'middle': _capBand + 0.055,
    'high': _capBand + 0.095,
  },
  'Bucket hat': {'low': 0.07, 'middle': 0.1, 'high': 0.125},
};
const _labels = {
  'front': 'Front logo',
  'back': 'Back logo',
  'left': 'Left side label',
  'right': 'Right side label',
};

/// The image layers for an accessory artwork (cap and bucket hat: the
/// front, back and side logos on their places; empty for socks and skirt,
/// whose front logo is their crest: [crest]).
Future<({List<Map<String, dynamic>> layers, Uint8List? crest})> accessoryLayers(
  AccessoryReading r,
  Uint8List picture,
) async {
  final spots = _placesOf(r.garment);
  if (spots == null) {
    final front = r.marks['front'];
    final logo = front == null ? null : await cutLogo(picture, front.box);
    return (layers: <Map<String, dynamic>>[], crest: logo?.png);
  }
  final layers = <Map<String, dynamic>>[];
  for (final key in ['front', 'back', 'left', 'right']) {
    final place = spots[key], mark = r.marks[key];
    if (place == null || mark == null) continue;
    final logo = await cutLogo(picture, mark.box);
    if (logo == null) continue;
    final view = r.views[key];
    var w = view != null && place.across > 0
        ? logo.w / view.width * place.across
        : place.w;
    w = math.min(
      math.min(place.max, math.max(place.min, w)),
      place.maxH * logo.aspect,
    );
    final side = key == 'left' || key == 'right';
    layers.add({
      'type': 'image',
      'name': _labels[key],
      'src': 'data:image/png;base64,${base64Encode(logo.png)}',
      'side': place.side,
      'x': place.x,
      'y': side ? (_levels[r.garment]?[mark.level] ?? place.y) : place.y,
      'w': double.parse(w.toStringAsFixed(4)),
    });
  }
  return (layers: layers, crest: null);
}

/// One logo on the front of a cap or bucket hat ("Logo or design on the
/// front"); null for socks and skirt (their crest takes it).
Map<String, dynamic>? accessoryFrontLayer(
  String garment,
  String src,
  String name,
  double aspect,
) {
  final place = _placesOf(garment)?['front'];
  if (place == null) return null;
  final w = math.min(place.w, place.maxH * aspect);
  return {
    'type': 'image',
    'name': name,
    'src': src,
    'side': 'front',
    'x': place.x,
    'y': place.y,
    'w': double.parse(w.toStringAsFixed(4)),
  };
}

/// The parts' own colours for the reading (the brim's top and underside).
Map<String, dynamic> accessoryParts(AccessoryReading r) {
  String hex(Color c) =>
      '#${(c.toARGB32() & 0xffffff).toRadixString(16).padLeft(6, '0').toUpperCase()}';
  return switch (r.garment) {
    'Cap' || '5 panel cap' => {
      'capBrim': {'colour': hex(r.brim)},
      'capUnder': {'colour': hex(r.under)},
    },
    'Bucket hat' => {
      'hatBrim': {'colour': hex(r.brim)},
      'hatUnder': {'colour': hex(r.under)},
    },
    _ => <String, dynamic>{},
  };
}
