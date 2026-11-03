import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// The app's bubble look (client 2026-11-03, images 333 / 334): deep blue
/// glass with a soft cyan glow round its edge, a bright rim and a sheen along
/// the top. [GlassBubble] is a page's big glass; [GlassCard] a card inside
/// it; [GlassPill] a rounded button (its [accent] colours the rim).
class GlassBubble extends StatelessWidget {
  const GlassBubble({
    super.key,
    required this.child,
    this.radius = 44,
    this.padding = const EdgeInsets.fromLTRB(14, 18, 14, 16),
    this.accent = const Color(0xff2fd2ff),
    this.blob,
  });
  final Widget child;
  final double radius;
  final EdgeInsetsGeometry padding;
  final Color accent;

  /// The soft organic outline (client images 340 / 341): each point is
  /// (height fraction, inset in px) down the right side, mirrored on the
  /// left; a negative inset bulges out. Null = a plain rounded rectangle.
  final List<Offset>? blob;

  /// A gentle blob for the tall pages (Projects, Profile).
  static const pageBlob = [Offset(.3, -2), Offset(.72, 3)];

  @override
  Widget build(BuildContext context) => CustomPaint(
    painter: _GlassPainter(radius: radius, accent: accent, glow: 1, blob: blob),
    child: Padding(padding: padding, child: child),
  );
}

/// A glass card inside a bubble: a lighter rim, a softer glow.
class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.radius = 24,
    this.onTap,
    this.accent = const Color(0xff2fd2ff),
    this.semanticsLabel,
  });
  final Widget child;
  final double radius;
  final VoidCallback? onTap;
  final Color accent;
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final card = CustomPaint(
      painter: _GlassPainter(radius: radius, accent: accent, glow: .25),
      child: Material(
        type: MaterialType.transparency,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(onTap: onTap, child: child),
      ),
    );
    if (semanticsLabel == null) return card;
    return Semantics(
      button: onTap != null,
      label: semanticsLabel,
      excludeSemantics: true,
      onTap: onTap,
      child: card,
    );
  }
}

/// A rounded glass button (the suppliers' "Make with …" pills).
class GlassPill extends StatelessWidget {
  const GlassPill({
    super.key,
    required this.child,
    required this.onTap,
    this.accent = const Color(0xff2fd2ff),
    this.semanticsLabel,
  });
  final Widget child;
  final VoidCallback onTap;
  final Color accent;
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) => GlassCard(
    radius: 40,
    onTap: onTap,
    accent: accent,
    semanticsLabel: semanticsLabel,
    child: child,
  );
}

/// The bubble shine on any rounded glass control (search box, filter
/// pills, tab bar): a curved gloss along its top edge, drawn on top.
class GlassShine extends StatelessWidget {
  const GlassShine({super.key, required this.child, this.radius = 22});
  final Widget child;
  final double radius;

  @override
  Widget build(BuildContext context) =>
      CustomPaint(foregroundPainter: _ShinePainter(radius), child: child);
}

class _ShinePainter extends CustomPainter {
  const _ShinePainter(this.radius);
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final r = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(math.min(radius, size.shortestSide / 2)),
    );
    final topH = math.min(radius * 1.2, size.height * .5);
    canvas.save();
    canvas.clipRRect(r);
    canvas.clipRect(Rect.fromLTWH(0, 0, size.width, topH));
    canvas.drawRRect(
      r.deflate(2.5),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..shader = ui.Gradient.linear(Offset.zero, Offset(0, topH), [
          Colors.white.withValues(alpha: .5),
          Colors.white.withValues(alpha: 0),
        ])
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_ShinePainter old) => old.radius != radius;
}

/// The page bubble's glass edge (client images/341, 350), shared by every
/// page bubble and Home: a 6-8 px soft outer glow at about half strength, a
/// 6 px very bright cyan core (cyan-white at its centre) and an 8 px inner
/// glow fading into the glass, ~18 px in all; a glossy top highlight; and
/// a violet-pink sheen at the lower corners, strongest at the bottom right.
void paintPageRim(Canvas canvas, Path path, Size size, double radius) {
  Paint stroke(double width, Color colour, double blur) => Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = width
    ..color = colour
    ..maskFilter = blur > 0 ? MaskFilter.blur(BlurStyle.normal, blur) : null;
  canvas.drawPath(
    path,
    stroke(26, const Color(0xff1a8cff).withValues(alpha: .28), 12),
  );
  canvas.drawPath(
    path,
    stroke(16, const Color(0xff1ab4ff).withValues(alpha: .5), 4),
  );
  canvas.save();
  canvas.clipPath(path);
  canvas.drawPath(
    path,
    stroke(30, const Color(0xff1ad0ff).withValues(alpha: .32), 6),
  );
  // The violet-pink sheen, within the band.
  for (final (at, strength) in [
    (Offset(size.width - radius * .3, size.height - radius * .3), 1.0),
    (Offset(radius * .3, size.height - radius * .3), .8),
  ]) {
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 34
        ..shader = ui.Gradient.radial(
          at,
          60,
          [
            const Color(0xffff7ad9).withValues(alpha: .75 * strength),
            const Color(0xff9b6bff).withValues(alpha: .55 * strength),
            const Color(0xff9b6bff).withValues(alpha: 0),
          ],
          [0, .45, 1],
        )
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
    );
  }
  // The glossy highlight along the top inside edge.
  final topH = math.min(radius * 1.1, size.height * .3);
  canvas.clipRect(Rect.fromLTWH(0, 0, size.width, topH));
  canvas.drawPath(
    path,
    Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 22
      ..shader = ui.Gradient.linear(Offset.zero, Offset(0, topH), [
        const Color(0xffbff1ff).withValues(alpha: .3),
        const Color(0xffbff1ff).withValues(alpha: 0),
      ])
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
  );
  canvas.restore();
  // The 6 px bright core on the edge, cyan-white at its centre.
  canvas.drawPath(path, stroke(6, const Color(0xff4fd8ff), 1.2));
  canvas.drawPath(
    path,
    stroke(1.6, const Color(0xffd8f8ff).withValues(alpha: .9), 0),
  );
}

class _GlassPainter extends CustomPainter {
  const _GlassPainter({
    required this.radius,
    required this.accent,
    required this.glow,
    this.blob,
  });
  final double radius, glow;
  final Color accent;
  final List<Offset>? blob;

  /// A smooth closed curve (Catmull-Rom) through the top, the right side
  /// profile, the bottom and the mirrored left side.
  static Path blobPath(
    Size s,
    List<Offset> profile,
    double radius,
    double inset,
  ) {
    final w = s.width, h = s.height;
    final k = radius.clamp(8.0, math.min(w, h) / 2) * .5;
    final right = <Offset>[
      Offset(w * .7, inset + 1),
      Offset(w - k - inset, k + inset),
      for (final p in profile)
        Offset(w - p.dy - inset, (p.dx * h).clamp(k * 2, h - k * 2)),
      Offset(w - k - inset, h - k - inset),
      Offset(w * .7, h - inset - 1),
    ];
    final pts = <Offset>[
      Offset(w / 2, inset),
      ...right,
      Offset(w / 2, h - inset),
      for (final p in right.reversed) Offset(w - p.dx, p.dy),
    ];
    final n = pts.length;
    final path = Path()..moveTo(pts[0].dx, pts[0].dy);
    for (var i = 0; i < n; i++) {
      final p0 = pts[(i - 1 + n) % n], p1 = pts[i];
      final p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      path.cubicTo(
        p1.dx + (p2.dx - p0.dx) / 6,
        p1.dy + (p2.dy - p0.dy) / 6,
        p2.dx - (p3.dx - p1.dx) / 6,
        p2.dy - (p3.dy - p1.dy) / 6,
        p2.dx,
        p2.dy,
      );
    }
    return path..close();
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (blob != null) return _paintBlob(canvas, size, blob!);
    final r = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(radius.clamp(0, size.shortestSide / 2)),
    );
    // The soft glow outside the edge.
    canvas.drawRRect(
      r,
      Paint()
        ..color = accent.withValues(alpha: .38 * glow)
        ..maskFilter = MaskFilter.blur(BlurStyle.outer, 14 * glow + 4),
    );
    // The deep blue glass, a little lighter at the top.
    final body = HSLColor.fromColor(accent);
    canvas.drawRRect(
      r,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(0, 0),
          Offset(0, size.height),
          [
            body
                .withSaturation(.75)
                .withLightness(.2)
                .toColor()
                .withValues(alpha: .78),
            const Color(0xff071628).withValues(alpha: .86),
            body
                .withSaturation(.8)
                .withLightness(.14)
                .toColor()
                .withValues(alpha: .82),
          ],
          [0, .55, 1],
        ),
    );
    // Inner glow along the rim.
    canvas.save();
    canvas.clipRRect(r);
    canvas.drawRRect(
      r.deflate(1),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 10
        ..color = accent.withValues(alpha: .22 * glow + .06)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );
    // The sheen along the top.
    final sheen = RRect.fromRectAndRadius(
      Rect.fromLTWH(
        size.width * .08,
        3,
        size.width * .84,
        (size.height * .16).clamp(6, 40),
      ),
      Radius.circular(radius),
    );
    canvas.drawRRect(
      sheen,
      Paint()
        ..shader = ui.Gradient.linear(
          sheen.outerRect.topCenter,
          sheen.outerRect.bottomCenter,
          [
            Colors.white.withValues(alpha: .13),
            Colors.white.withValues(alpha: 0),
          ],
        ),
    );
    canvas.restore();
    if (glow >= 1) paintPageRim(canvas, Path()..addRRect(r), size, radius);
    // A glass card's bubble shine: a curved gloss along its top edge, over
    // a soft glassy edge band.
    if (glow < 1) {
      final topH = math.min(radius * 1.4, size.height * .45);
      canvas.save();
      canvas.clipRRect(r);
      canvas.clipRect(Rect.fromLTWH(0, 0, size.width, topH));
      canvas.drawRRect(
        r.deflate(2),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..shader = ui.Gradient.linear(Offset.zero, Offset(0, topH), [
            Colors.white.withValues(alpha: .3),
            Colors.white.withValues(alpha: 0),
          ])
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.2),
      );
      canvas.restore();
    }
    // A real bubble's rainbow shimmer: violet-pink fading in at the lower
    // corners, strongest at the bottom right (client images/350).
    if (glow < 1) {
      canvas.save();
      canvas.clipRRect(r);
      for (final (at, strength) in [
        (Offset(size.width - radius * .3, size.height - radius * .3), 1.0),
        (Offset(radius * .3, size.height - radius * .3), .9),
      ]) {
        canvas.drawRRect(
          r.deflate(glow >= 1 ? 8 : 1.5),
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = glow >= 1 ? 16 : 3
            ..shader = ui.Gradient.radial(
              at,
              glow >= 1 ? 58.0 : 30.0,
              [
                const Color(
                  0xffff7ad9,
                ).withValues(alpha: (glow >= 1 ? .8 : .35) * strength),
                const Color(
                  0xff9b6bff,
                ).withValues(alpha: (glow >= 1 ? .6 : .25) * strength),
                const Color(0xff9b6bff).withValues(alpha: 0),
              ],
              [0, .45, 1],
            )
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2.5),
        );
      }
      canvas.restore();
    }
    // The rim: a thin line on a card (page bubbles: paintPageRim).
    if (glow < 1)
      canvas.drawRRect(
        r.deflate(.8),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = glow >= 1 ? 1.6 : 1.5
          ..shader = ui.Gradient.linear(
            Offset.zero,
            Offset(size.width, size.height),
            [
              Color.lerp(
                accent,
                Colors.white,
                glow >= 1 ? .2 : .3,
              )!.withValues(alpha: glow >= 1 ? .9 : .7),
              accent.withValues(alpha: glow >= 1 ? .8 : .5),
              Color.lerp(
                accent,
                Colors.white,
                .15,
              )!.withValues(alpha: glow >= 1 ? .9 : .7),
            ],
            [0, .5, 1],
          ),
      );
  }

  void _paintBlob(Canvas canvas, Size size, List<Offset> profile) {
    final r = blobPath(size, profile, radius, 0);
    final body = HSLColor.fromColor(accent);
    canvas.drawPath(r, Paint()..color = accent.withValues(alpha: 0));
    canvas.drawPath(
      r,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset.zero,
          Offset(0, size.height),
          [
            body
                .withSaturation(.75)
                .withLightness(.2)
                .toColor()
                .withValues(alpha: .7),
            const Color(0xff071628).withValues(alpha: .82),
            body
                .withSaturation(.8)
                .withLightness(.14)
                .toColor()
                .withValues(alpha: .8),
          ],
          [0, .55, 1],
        ),
    );
    paintPageRim(canvas, r, size, radius);
  }

  @override
  bool shouldRepaint(_GlassPainter old) =>
      old.radius != radius ||
      old.accent != accent ||
      old.glow != glow ||
      old.blob != blob;
}
