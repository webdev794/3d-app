import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../design_document.dart' show studioPatterns;
import '../own_patterns.dart';
import '../part_editing.dart';
import 'studio_tools.dart' show patternAreas;
import 'ui.dart';

/// What is being dragged onto the kit: an image (logo, artwork) or a pattern.
class KitDrop {
  const KitDrop.image(this.image)
    : pattern = null,
      own = null,
      onPart = false,
      label = null,
      area = null;
  const KitDrop.pattern(this.pattern)
    : image = null,
      own = null,
      onPart = false,
      label = null,
      area = null;

  /// One of My patterns (own_patterns.dart), put on in the chosen mode.
  const KitDrop.own(this.own)
    : image = null,
      pattern = null,
      onPart = false,
      label = null,
      area = null;

  /// A pattern held in the Patterns panel (client 607): it goes on the part
  /// that lights up under the finger (the front, the back, a sleeve ...), as
  /// the website's Studio. [pattern] is a pattern name or a picture (data
  /// URL); [own] one of My patterns, in the mode of the picture on [area]
  /// (the panel's chosen area, null: the whole garment).
  const KitDrop.panel({this.pattern, this.own, required this.label, this.area})
    : image = null,
      onPart = true;
  final Uint8List? image;
  final String? pattern;
  final OwnPattern? own;
  final bool onPart;
  final String? label;
  final String? area;
}

const _feedbackSize = 64.0;

/// The finger's place in the drag preview: the preview rides just above the
/// finger, so the part glowing under the finger (and where the drop lands)
/// stays in view.
const dragHotSpot = Offset(_feedbackSize / 2, _feedbackSize + 16);

/// A strip of the user's assets and the patterns: press and hold, then drag
/// onto the 3D kit (or the 2D panels). Logos land where they are dropped;
/// patterns fill the garment area they are dropped on.
class DragTray extends StatelessWidget {
  const DragTray(this.c, {super.key});
  final AppController c;

  @override
  Widget build(BuildContext context) {
    final seen = <int>{};
    final images = [
      for (final bytes in [...c.logos, ...c.uploads, ...c.artwork])
        if (seen.add(Object.hashAll(bytes.take(256)))) bytes,
    ];
    Widget tile(Widget child, KitDrop drop, String label) =>
        LongPressDraggable<KitDrop>(
          data: drop,
          delay: const Duration(milliseconds: 220),
          dragAnchorStrategy: (draggable, context, position) => dragHotSpot,
          onDragStarted: () => c.viewerPassThrough?.call(true),
          onDragEnd: (_) {
            c.viewerPassThrough?.call(false);
            c.hoverGarment?.call(null);
          },
          feedback: feedback(child),
          childWhenDragging: Opacity(opacity: .35, child: _frame(child, label)),
          child: _frame(child, label),
        );
    return SizedBox(
      height: 84,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        children: [
          if (images.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.only(right: 12),
                child: Text(
                  'Upload a logo in Artwork\nto drag it here.',
                  style: TextStyle(fontSize: 11, color: Palette.muted),
                ),
              ),
            ),
          for (final (i, bytes) in images.indexed)
            tile(
              Image.memory(bytes, fit: BoxFit.contain),
              KitDrop.image(bytes),
              'Logo ${i + 1}',
            ),
          const SizedBox(width: 8),
          for (final own in c.ownPatterns ?? const <OwnPattern>[])
            tile(
              Image.memory(own.bytes, fit: BoxFit.cover),
              KitDrop.own(own),
              own.name.length > 10 ? '${own.name.substring(0, 9)}…' : own.name,
            ),
          for (final pattern in studioPatterns)
            tile(
              PatternSwatch(pattern, c.patternInk, c.mainColor),
              KitDrop.pattern(pattern),
              pattern,
            ),
        ],
      ),
    );
  }

  /// What rides above the finger while a tile is dragged.
  static Widget feedback(Widget child) => Material(
    color: Colors.transparent,
    child: Container(
      width: _feedbackSize,
      height: _feedbackSize,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Palette.cyan, width: 2),
        boxShadow: [
          BoxShadow(color: Palette.cyan.withValues(alpha: .5), blurRadius: 16),
        ],
      ),
      child: child,
    ),
  );

  static Widget _frame(Widget child, String label) => Padding(
    padding: const EdgeInsets.only(right: 8),
    child: Column(
      children: [
        Container(
          width: 58,
          height: 58,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: const Color(0xff08131e),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Palette.cyan.withValues(alpha: .45)),
          ),
          child: child,
        ),
        const SizedBox(height: 3),
        Text(
          label,
          style: const TextStyle(fontSize: 9.5, color: Palette.muted),
        ),
      ],
    ),
  );

  /// The finger's place, 0..1 over [stage], for a drag preview at [global].
  static Offset at(Offset global, RenderBox stage) {
    final local = stage.globalToLocal(global + dragHotSpot);
    return Offset(local.dx / stage.size.width, local.dy / stage.size.height);
  }

  /// While dragging over the stage: the 3D kit glows the part under the
  /// finger (cleared once the finger is off the 3D).
  static void hover(AppController c, Offset global, RenderBox stage) {
    final p = at(global, stage);
    final inside = p.dx >= 0 && p.dx <= 1 && p.dy >= 0 && p.dy <= 1;
    c.hoverGarment?.call(inside ? p : null);
  }

  /// Applies a drop at [global] (the drag preview's corner) over the stage
  /// ([stage] is its render box): it lands on the part that glowed, under
  /// the finger.
  static Future<String?> drop(
    AppController c,
    KitDrop drop,
    Offset global,
    RenderBox stage,
  ) async {
    c.hoverGarment?.call(null);
    final pick = c.pickGarment;
    if (pick == null) return 'The 3D kit is still loading.';
    final p = at(global, stage);
    if (drop.onPart) return _onPart(c, drop, p, pick);
    final hit = await pick(p.dx, p.dy);
    if (hit == null || hit['hit'] != true)
      return 'Drop it directly onto the garment.';
    if (drop.pattern != null) {
      final zone = hit['zone'] as String? ?? 'body';
      c.edit(() => c.zones = {...c.zones, zone: drop.pattern!});
      return '${drop.pattern} added to the ${_zoneNames[zone] ?? zone}.';
    }
    if (drop.own != null) {
      final zone = hit['zone'] as String? ?? 'body';
      await c.applyOwnPattern(drop.own!, area: zone);
      return '${drop.own!.name} added to the ${_zoneNames[zone] ?? zone}.';
    }
    final bytes = drop.image!;
    final png = bytes.length > 3 && bytes[0] == 0x89 && bytes[1] == 0x50;
    c.addLayer({
      'type': 'image',
      'name': 'Logo',
      'src': 'data:image/${png ? 'png' : 'jpeg'};base64,${base64Encode(bytes)}',
      'part': hit['part'] ?? 'top',
      'side': hit['side'] ?? 'front',
      'x': (hit['x'] as num).toDouble(),
      'y': (hit['y'] as num).toDouble(),
      'w': 0.09,
    });
    return 'Logo placed. Use 2D panels to resize or rotate it.';
  }

  /// A pattern from the Patterns panel let go at [p] (0..1 over the 3D): on
  /// the part that lit up there (one undo step), else on the garment area
  /// there; off the garment nothing changes.
  static Future<String?> _onPart(
    AppController c,
    KitDrop drop,
    Offset p,
    Future<Map<String, dynamic>?> Function(double x, double y) pick,
  ) async {
    final label = drop.label ?? drop.pattern ?? 'Pattern';
    final missed =
        '$label not applied: let go over the garment to put it there.';
    if (p.dx < 0 || p.dx > 1 || p.dy < 0 || p.dy > 1) return missed;
    final hit = await pick(p.dx, p.dy);
    if (hit == null || hit['hit'] != true) return missed;
    final value = drop.own != null
        ? await c.ownPatternData(drop.own!, area: drop.area)
        : drop.pattern!;
    final key = hit['partKey'];
    // Track pants: the pattern goes on the whole pants, front and back,
    // never on the jacket (PATTERNDND).
    if (hit['kind'] == 'trackpants') {
      final none = value == 'None';
      c.edit(() {
        for (final k in const ['shortsFront', 'shortsBack']) {
          final style = c.partStyleOf(k);
          c.setPartStyle(
            k,
            style.copyWith(
              pattern: none ? null : value,
              patternOpacity: none
                  ? 0.0
                  : style.pattern != null
                  ? style.patternOpacity
                  : null,
            ),
            record: false,
          );
        }
      });
      return none
          ? 'Pattern taken off the pants.'
          : '$label applied to the pants.';
    }
    if (key is String &&
        partsOf(c.garment).contains(key) &&
        !partColourOnly(key)) {
      final style = c.partStyleOf(key), none = value == 'None';
      c.setPartStyle(
        key,
        style.copyWith(
          pattern: none ? null : value,
          patternOpacity: none
              ? 0.0
              : style.pattern != null
              ? style.patternOpacity
              : null,
        ),
      );
      final where = partLabel(key).toLowerCase();
      return none
          ? 'Pattern taken off the $where.'
          : '$label applied to the $where.';
    }
    final zone = hit['zone'];
    for (final (area, name) in patternAreas(
      c.garment,
      trackStyle: c.trackStyle,
    )) {
      if (area == zone) {
        c.edit(() => c.zones = {...c.zones, area: value});
        return '$label applied to the ${name.toLowerCase()}.';
      }
    }
    return key is String && partColourOnly(key)
        ? 'The ${partLabel(key).toLowerCase()} takes a colour only: drop the '
              'pattern on the front, back or a sleeve.'
        : missed;
  }

  static const _zoneNames = {
    'body': 'chest & body',
    'yoke': 'shoulders',
    'sleeves': 'sleeves',
    'sides': 'side panels',
    'hem': 'hem',
    'pocket': 'chest pocket',
  };
}

/// A small drawing of a built-in pattern: [ink] on [base].
class PatternSwatch extends StatelessWidget {
  const PatternSwatch(this.name, this.ink, this.base, {super.key});
  final String name;
  final Color ink, base;
  @override
  Widget build(BuildContext context) =>
      CustomPaint(painter: _SwatchPainter(name, visibleInk(ink, base), base));

  /// The pattern's colour, or (when it is too close to the kit's own, as a
  /// dark tee with a dark Secondary: client 653, every thumbnail blank) cyan
  /// on a dark kit and near-black on a light one, so each pattern shows.
  static Color visibleInk(Color ink, Color base) {
    double lum(Color c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    if ((lum(ink) - lum(base)).abs() >= 0.18) return ink;
    return lum(base) < 0.5 ? const Color(0xff16b4f0) : const Color(0xff0b1016);
  }
}

class _SwatchPainter extends CustomPainter {
  _SwatchPainter(this.name, this.ink, this.base);
  final String name;
  final Color ink, base;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = base);
    final p = Paint()
      ..color = ink
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke;
    final f = Paint()..color = ink;
    final w = size.width, h = size.height;
    switch (name) {
      case 'Solid':
        canvas.drawRect(Offset.zero & size, f);
      case 'Stripes':
        for (var x = 6.0; x < w; x += 12)
          canvas.drawLine(Offset(x, 0), Offset(x, h), p);
      case 'Hoops':
        for (var y = 6.0; y < h; y += 14)
          canvas.drawRect(Rect.fromLTWH(0, y, w, 6), f);
      case 'Chevron':
        for (var y = 6.0; y < h + 10; y += 13) {
          canvas.drawPath(
            Path()
              ..moveTo(0, y)
              ..lineTo(w / 2, y - 9)
              ..lineTo(w, y),
            p,
          );
        }
      case 'Diagonal':
        for (var x = -h; x < w; x += 12)
          canvas.drawLine(Offset(x, h), Offset(x + h, 0), p);
      case 'Dots':
        for (var y = 6.0; y < h; y += 11) {
          for (var x = 6.0; x < w; x += 11)
            canvas.drawCircle(Offset(x, y), 2.4, f);
        }
      case 'Velocity':
        for (var i = 0; i < 4; i++) {
          canvas.drawPath(
            Path()
              ..moveTo(w, 8.0 + i * 12)
              ..lineTo(w * .3, 14.0 + i * 12)
              ..lineTo(w, 18.0 + i * 12)
              ..close(),
            f,
          );
        }
      case 'Swirl':
        for (var y = 8.0; y < h; y += 16) {
          for (var x = 8.0; x < w; x += 16) {
            final path = Path();
            for (var t = 0.0; t <= 10; t += 0.3) {
              final r = 1 + t * 0.6;
              final o = Offset(x + r * math.cos(t), y + r * math.sin(t));
              if (t == 0) {
                path.moveTo(o.dx, o.dy);
              } else {
                path.lineTo(o.dx, o.dy);
              }
            }
            canvas.drawPath(path, p);
          }
        }
      case 'Blades':
        for (final s in const [-1.0, 1.0]) {
          for (var i = 0; i < 3; i++) {
            final x0 = w / 2 + s * w * (0.46 - i * 0.06);
            final tip = w / 2 + s * w * (0.14 + i * 0.08);
            canvas.drawPath(
              Path()
                ..moveTo(x0, h)
                ..quadraticBezierTo(
                  w / 2 + s * w * 0.18,
                  h * 0.7,
                  tip,
                  h * (0.15 + i * 0.2),
                )
                ..quadraticBezierTo(w / 2 + s * w * 0.3, h * 0.7, x0 + s * 4, h)
                ..close(),
              f,
            );
          }
        }
      case 'Tribal':
        for (var y = 8.0; y < h; y += 18) {
          for (var x = 0.0; x < w; x += 12) {
            canvas.drawPath(
              Path()
                ..moveTo(x, y)
                ..lineTo(x + 6, y + 9)
                ..lineTo(x + 12, y)
                ..close(),
              f,
            );
          }
        }
      case 'Camo':
        for (final (x, y, r) in const [
          (12.0, 14.0, 9.0),
          (38.0, 10.0, 7.0),
          (24.0, 34.0, 10.0),
          (48.0, 40.0, 8.0),
          (8.0, 48.0, 6.0),
        ]) {
          canvas.drawOval(
            Rect.fromCenter(
              center: Offset(x * w / 58, y * h / 58),
              width: r * 2.4,
              height: r * 1.6,
            ),
            f,
          );
        }
      // CLIENT25 2026-11-25 (more patterns), as the viewer draws them.
      case 'Sash':
        final sx = w / 58, sy = h / 58;
        canvas.drawLine(
          Offset(62 * sx, -4 * sy),
          Offset(-4 * sx, 62 * sy),
          Paint()
            ..color = ink
            ..strokeWidth = 12 * sx,
        );
        for (final o in const [-10.0, 10.0]) {
          canvas.drawLine(
            Offset((62 + o) * sx, (-4 + o) * sy),
            Offset((-4 + o) * sx, (62 + o) * sy),
            Paint()
              ..color = ink
              ..strokeWidth = 2 * sx,
          );
        }
      case 'Fade':
        canvas.drawRect(
          Offset.zero & size,
          Paint()
            ..shader = LinearGradient(
              begin: Alignment.bottomCenter,
              end: Alignment.topCenter,
              colors: [
                ink,
                ink.withValues(alpha: .7),
                ink.withValues(alpha: 0),
              ],
              stops: const [0, .35, 1],
            ).createShader(Offset.zero & size),
        );
      case 'Halftone':
        var row = 0;
        for (var y = h - 3; y > 0; y -= 6, row++) {
          final r = 2.9 * math.pow((y / h).clamp(0, 1), .85) * w / 58;
          if (r < .5) continue;
          for (var x = row.isOdd ? 3.0 : 0.0; x < w + 3; x += 6) {
            canvas.drawCircle(Offset(x, y), r, f);
          }
        }
      case 'Prism':
        var seed = 11;
        double rnd() => (seed = (seed * 16807) % 2147483647) / 2147483647;
        final pts = [
          for (var j = 0; j <= 4; j++)
            [
              for (var i = 0; i <= 4; i++)
                Offset(
                  w * i / 4 + (i > 0 && i < 4 ? (rnd() - .5) * w * .15 : 0),
                  h * j / 4 + (j > 0 && j < 4 ? (rnd() - .5) * h * .15 : 0),
                ),
            ],
        ];
        void tri(Offset a, Offset b, Offset c) {
          final k = rnd();
          if (k < .3) return;
          canvas.drawPath(
            Path()
              ..moveTo(a.dx, a.dy)
              ..lineTo(b.dx, b.dy)
              ..lineTo(c.dx, c.dy)
              ..close(),
            Paint()..color = ink.withValues(alpha: .2 + (k - .3) / .7 * .75),
          );
        }
        for (var j = 0; j < 4; j++) {
          for (var i = 0; i < 4; i++) {
            final a = pts[j][i], b = pts[j][i + 1];
            final c = pts[j + 1][i], d = pts[j + 1][i + 1];
            if ((i + j).isOdd) {
              tri(a, b, d);
              tri(a, d, c);
            } else {
              tri(a, b, c);
              tri(b, d, c);
            }
          }
        }
      case 'Brush':
        var seed = 5;
        double rnd() => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (final (x0, y0, x1, y1, bw) in const [
          (-2.0, 20.0, 60.0, 12.0, 12.0),
          (6.0, 32.0, 60.0, 28.0, 7.0),
          (-2.0, 50.0, 44.0, 42.0, 10.0),
        ]) {
          for (var b = 0; b < 9; b++) {
            final off = (rnd() - .5) * bw;
            final start = rnd() * .1, end = 1 - rnd() * .15;
            canvas.drawLine(
              Offset(
                (x0 + (x1 - x0) * start) * w / 58,
                (y0 + off + (y1 - y0) * start) * h / 58,
              ),
              Offset(
                (x0 + (x1 - x0) * end) * w / 58,
                (y0 + off + (y1 - y0) * end) * h / 58,
              ),
              Paint()
                ..color = ink.withValues(alpha: .5 + rnd() * .5)
                ..strokeWidth = (.8 + rnd() * 1.8) * w / 58
                ..strokeCap = StrokeCap.round,
            );
          }
        }
      case 'Waves':
        for (var x = 4.0; x < w + 4; x += 8) {
          final path = Path()..moveTo(x, 0);
          for (var y = 2.0; y <= h; y += 2) {
            path.lineTo(x + 2.5 * math.sin(y * .28 + x * .1), y);
          }
          canvas.drawPath(
            path,
            Paint()
              ..color = ink
              ..strokeWidth = 2
              ..style = PaintingStyle.stroke,
          );
        }
      default:
        canvas.drawLine(Offset.zero, Offset(w, h), p);
    }
  }

  @override
  bool shouldRepaint(_SwatchPainter old) =>
      old.name != name || old.ink != ink || old.base != base;
}
