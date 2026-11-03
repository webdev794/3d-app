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
  static const pageBlob = [Offset(.1, 0), Offset(.5, -4), Offset(.9, 0)];

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    child: CustomPaint(
      // The rim is drawn in its own layer, cached until the size changes.
      painter: _GlassPainter(
        radius: radius,
        accent: accent,
        glow: 1,
        blob: blob,
      ),
      isComplex: true,
      child: RepaintBoundary(
        child: Padding(padding: padding, child: child),
      ),
    ),
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
    this.bubbleRim = false,
  });
  final Widget child;
  final double radius;
  final VoidCallback? onTap;

  /// A sub-bubble: the page rim at half size (soft layered glow, corner
  /// reflections) instead of the thin card line.
  final bool bubbleRim;
  final Color accent;
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final card = CustomPaint(
      painter: _GlassPainter(
        radius: radius,
        accent: accent,
        glow: bubbleRim ? .5 : .25,
      ),
      isComplex: true,
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
        ]),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_ShinePainter old) => old.radius != radius;
}

/// The page bubble's glass edge (client images/341, 350-356), shared by
/// every page bubble, Home and (at half size, [k] = .5) the sub-bubbles. The
/// outer edge is a crisp bright line; all the soft cyan glow sits INSIDE the
/// bubble, fading inward, wider and brighter through the rounded corners,
/// with a thin white reflection along the corner curves ([inner] = the
/// outline moved inwards) and a violet-pink sheen at both lower corners.
/// Outside the line only a faint, tight halo.
void paintPageRim(
  Canvas canvas,
  Path path,
  Size size,
  double radius, {
  Path? inner,
  double k = 1,
}) {
  Paint stroke(double width, Color colour, double blur) => Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = width * k
    ..color = colour
    ..maskFilter = blur > 0
        ? MaskFilter.blur(BlurStyle.normal, blur * k)
        : null;
  final w = size.width, h = size.height;
  final kc = radius * .3;
  final corners = [
    Offset(kc, kc),
    Offset(w - kc, kc),
    Offset(kc, h - kc),
    Offset(w - kc, h - kc),
  ];
  // A faint, tight halo outside.
  canvas.drawPath(
    path,
    stroke(4, const Color(0xff36c8ff).withValues(alpha: .25), 2),
  );
  canvas.save();
  canvas.clipPath(path);
  // Inner glow, about 8 px, fading inward.
  canvas.drawPath(
    path,
    stroke(18, const Color(0xff1ab4ff).withValues(alpha: .28), 4),
  );
  // The rim core: about 5 px of saturated cyan inside the edge.
  canvas.drawPath(
    path,
    stroke(10, Colors.white, 0)
      ..shader = ui.Gradient.linear(
        Offset.zero,
        Offset(w, h),
        [
          const Color(0xff5ae6fa).withValues(alpha: .85),
          const Color(0xff3cc8f0).withValues(alpha: .62),
          const Color(0xff2aa8e8).withValues(alpha: .5),
        ],
        [0, .5, 1],
      ),
  );
  // Wider and brighter through the corners.
  for (final at in corners) {
    canvas.drawPath(
      path,
      stroke(26, Colors.white, 0)
        ..shader = ui.Gradient.radial(at, radius * 1.1, [
          const Color(0xff5ae6fa).withValues(alpha: .6),
          const Color(0xff36c8ff).withValues(alpha: 0),
        ]),
    );
  }
  // The violet-pink sheen ON the outer curve of both lower corners.
  final ko = radius * .12;
  for (final (at, a) in [
    (Offset(w - ko, h - ko), 1.0),
    (Offset(ko, h - ko), .85),
  ]) {
    canvas.drawPath(
      path,
      stroke(9, Colors.white, 0)
        ..shader = ui.Gradient.radial(
          at,
          30 * k,
          [
            const Color(0xffff8ae0).withValues(alpha: .95 * a),
            const Color(0xffa070ff).withValues(alpha: .6 * a),
            const Color(0xffa070ff).withValues(alpha: 0),
          ],
          [0, .5, 1],
        ),
    );
  }
  // The glossy highlight along the top inside edge.
  final topH = math.min(radius * 1.1, h * .3);
  canvas.clipRect(Rect.fromLTWH(0, 0, w, topH));
  canvas.drawPath(
    path,
    stroke(24, Colors.white, 0)
      ..shader = ui.Gradient.linear(Offset.zero, Offset(0, topH), [
        const Color(0xffbff1ff).withValues(alpha: .2),
        const Color(0xffbff1ff).withValues(alpha: 0),
      ]),
  );
  canvas.restore();
  // The white reflection inside the band, through the corners.
  if (inner != null) {
    for (final at in corners) {
      canvas.drawPath(
        inner,
        stroke(1.4, Colors.white, 0)
          ..shader = ui.Gradient.radial(
            at,
            radius * 1.6,
            [
              Colors.white.withValues(alpha: .6),
              Colors.white.withValues(alpha: .25),
              Colors.white.withValues(alpha: 0),
            ],
            [0, .5, 1],
          ),
      );
    }
  }
  // The outer edge: a thin crisp line, plus a white highlight that drifts
  // a little inside, thick and bright on the upper left and top, thin and
  // fading elsewhere.
  canvas.drawPath(
    path,
    stroke(.9, const Color(0xffbff3ff).withValues(alpha: .6), 0),
  );
  final m = Matrix4.identity()
    ..translateByDouble(w / 2, h / 2, 0, 1)
    ..scaleByDouble(1 - 5 * k / w, 1 - 5 * k / h, 1, 1)
    ..translateByDouble(-w / 2, -h / 2, 0, 1);
  final drift = path.transform(m.storage);
  for (final (width, alpha, blur) in [(2.2, .3, 0.0), (1.0, .9, 0.0)]) {
    canvas.drawPath(
      drift,
      stroke(width, Colors.white, blur)
        ..shader = ui.Gradient.radial(
          Offset(w * .15, h * .02),
          math.max(w, h) * .75,
          [
            Colors.white.withValues(alpha: alpha),
            Colors.white.withValues(alpha: alpha * .35),
            Colors.white.withValues(alpha: 0),
          ],
          [0, .45, 1],
        ),
    );
  }
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
      Offset(w / 2, inset - 2),
      ...right,
      Offset(w / 2, h - inset + 2),
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
    // Page bubbles: one blurred outer glow; cards: a plain soft ring.
    if (glow >= 1) {
      canvas.drawRRect(
        r,
        Paint()
          ..color = accent.withValues(alpha: .38 * glow)
          ..maskFilter = MaskFilter.blur(BlurStyle.outer, 14 * glow + 4),
      );
    } else {
      canvas.drawRRect(
        r.inflate(1.5),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3
          ..color = accent.withValues(alpha: .16 * glow + .04),
      );
    }
    // The deep blue glass, a little lighter at the top.
    canvas.drawRRect(
      r,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(0, 0),
          Offset(0, size.height),
          [
            const Color(0xff011a2e).withValues(alpha: .82),
            const Color(0xff001624).withValues(alpha: .86),
            const Color(0xff011a2e).withValues(alpha: .84),
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
        ..shader = ui.Gradient.radial(
          r.center,
          math.max(size.width, size.height) * .75,
          [
            accent.withValues(alpha: 0),
            accent.withValues(alpha: .16 * glow + .05),
          ],
          [.6, 1],
        ),
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
    if (glow >= 1) {
      paintPageRim(
        canvas,
        Path()..addRRect(r),
        size,
        radius,
        inner: Path()..addRRect(r.deflate(9)),
      );
    }
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
          ]),
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
            ),
        );
      }
      canvas.restore();
    }
    if (glow == .5) {
      paintPageRim(
        canvas,
        Path()..addRRect(r),
        size,
        radius,
        inner: Path()..addRRect(r.deflate(5)),
        k: .5,
      );
      return;
    }
    // Cards and pills: a small white reflection through the corners.
    if (glow < 1) {
      final rr = radius.clamp(0, size.shortestSide / 2).toDouble();
      final k = rr * .3;
      for (final at in [
        Offset(k, k),
        Offset(size.width - k, k),
        Offset(k, size.height - k),
        Offset(size.width - k, size.height - k),
      ]) {
        canvas.drawRRect(
          r.deflate(2.5),
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = .9
            ..shader = ui.Gradient.radial(at, math.max(rr * 1.3, 8), [
              Colors.white.withValues(alpha: .45),
              Colors.white.withValues(alpha: 0),
            ]),
        );
      }
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

  /// A rounded rectangle whose sides bow out gently (~4 px on the long
  /// sides, ~2 px top and bottom), like a soft inflated bubble.
  static Path bowedPath(Size s, double radius, double inset) {
    final l = inset, t = inset, r = s.width - inset, b = s.height - inset;
    final rr = math.min(radius - inset, math.min(r - l, b - t) / 2);
    final cx = s.width / 2, cy = s.height / 2;
    const side = 4.0, top = 2.0;
    final c = Radius.circular(rr);
    return Path()
      ..moveTo(l + rr, t)
      ..quadraticBezierTo(cx, t - 2 * top, r - rr, t)
      ..arcToPoint(Offset(r, t + rr), radius: c)
      ..quadraticBezierTo(r + 2 * side, cy, r, b - rr)
      ..arcToPoint(Offset(r - rr, b), radius: c)
      ..quadraticBezierTo(cx, b + 2 * top, l + rr, b)
      ..arcToPoint(Offset(l, b - rr), radius: c)
      ..quadraticBezierTo(l - 2 * side, cy, l, t + rr)
      ..arcToPoint(Offset(l + rr, t), radius: c)
      ..close();
  }

  void _paintBlob(Canvas canvas, Size size, List<Offset> profile) {
    final bowed = identical(profile, GlassBubble.pageBlob);
    final r = bowed
        ? bowedPath(size, radius, 0)
        : blobPath(size, profile, radius, 0);
    canvas.drawPath(r, Paint()..color = accent.withValues(alpha: 0));
    canvas.drawPath(
      r,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset.zero,
          Offset(0, size.height),
          [
            const Color(0xff011a2e).withValues(alpha: .82),
            const Color(0xff001624).withValues(alpha: .86),
            const Color(0xff011a2e).withValues(alpha: .84),
          ],
          [0, .55, 1],
        ),
    );
    paintPageRim(
      canvas,
      r,
      size,
      radius,
      inner: bowed
          ? bowedPath(size, radius, 9)
          : blobPath(size, profile, radius, 9),
    );
  }

  @override
  bool shouldRepaint(_GlassPainter old) =>
      old.radius != radius ||
      old.accent != accent ||
      old.glow != glow ||
      old.blob != blob;
}
