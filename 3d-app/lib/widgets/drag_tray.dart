import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../design_document.dart' show studioPatterns;
import '../own_patterns.dart';
import 'ui.dart';

/// What is being dragged onto the kit: an image (logo, artwork) or a pattern.
class KitDrop {
  const KitDrop.image(this.image) : pattern = null, own = null;
  const KitDrop.pattern(this.pattern) : image = null, own = null;

  /// One of My patterns (own_patterns.dart), put on in the chosen mode.
  const KitDrop.own(this.own) : image = null, pattern = null;
  final Uint8List? image;
  final String? pattern;
  final OwnPattern? own;
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
          feedback: Material(
            color: Colors.transparent,
            child: Container(
              width: _feedbackSize,
              height: _feedbackSize,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Palette.cyan, width: 2),
                boxShadow: [
                  BoxShadow(
                    color: Palette.cyan.withValues(alpha: .5),
                    blurRadius: 16,
                  ),
                ],
              ),
              child: child,
            ),
          ),
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
              _PatternSwatch(pattern, c.secondaryColor, c.mainColor),
              KitDrop.pattern(pattern),
              pattern,
            ),
        ],
      ),
    );
  }

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

  static const _zoneNames = {
    'body': 'chest & body',
    'yoke': 'shoulders',
    'sleeves': 'sleeves',
    'sides': 'side panels',
    'hem': 'hem',
    'pocket': 'chest pocket',
  };
}

class _PatternSwatch extends StatelessWidget {
  const _PatternSwatch(this.name, this.ink, this.base);
  final String name;
  final Color ink, base;
  @override
  Widget build(BuildContext context) =>
      CustomPaint(painter: _SwatchPainter(name, ink, base));
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
      default:
        canvas.drawLine(Offset.zero, Offset(w, h), p);
    }
  }

  @override
  bool shouldRepaint(_SwatchPainter old) =>
      old.name != name || old.ink != ink || old.base != base;
}
