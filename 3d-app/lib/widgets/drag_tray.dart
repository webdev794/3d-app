import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../design_document.dart' show studioPatterns;
import 'ui.dart';

/// What is being dragged onto the kit: an image (logo, artwork) or a pattern.
class KitDrop {
  const KitDrop.image(this.image) : pattern = null;
  const KitDrop.pattern(this.pattern) : image = null;
  final Uint8List? image;
  final String? pattern;
}

const _feedbackSize = 64.0;

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

  /// Applies a drop at [global] over the stage ([stage] is its render box).
  static Future<String?> drop(
    AppController c,
    KitDrop drop,
    Offset global,
    RenderBox stage,
  ) async {
    final pick = c.pickGarment;
    if (pick == null) return 'The 3D kit is still loading.';
    final local = stage.globalToLocal(
      global + const Offset(_feedbackSize / 2, _feedbackSize / 2),
    );
    final hit = await pick(
      local.dx / stage.size.width,
      local.dy / stage.size.height,
    );
    if (hit == null || hit['hit'] != true)
      return 'Drop it directly onto the garment.';
    if (drop.pattern != null) {
      final zone = hit['zone'] as String? ?? 'body';
      c.edit(() => c.zones = {...c.zones, zone: drop.pattern!});
      return '${drop.pattern} added to the ${_zoneNames[zone] ?? zone}.';
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
