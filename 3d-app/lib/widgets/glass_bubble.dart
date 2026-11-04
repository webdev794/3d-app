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
    this.dome,
  });
  final Widget child;
  final double radius;
  final EdgeInsetsGeometry padding;
  final Color accent;

  /// The soft organic outline (client images 340 / 341): each point is
  /// (height fraction, inset in px) down the right side, mirrored on the
  /// left; a negative inset bulges out. Null = a plain rounded rectangle.
  final List<Offset>? blob;

  /// With [pageBlob]: the top and bottom dome's height in px (Home's,
  /// [homeDomeHeight]); null = from the bubble's own size.
  final double? dome;

  /// A gentle blob for the tall pages (Projects, Profile).
  static const pageBlob = [Offset(.1, 0), Offset(.5, -4), Offset(.9, 0)];

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    child: CustomPaint(
      // The rim is drawn in its own layer, cached until the size changes.
      // Page bubbles share Home's glass (shape, rim, lights, glow).
      painter: identical(blob, pageBlob)
          ? HomeGlassPainter(dome: dome)
          : _GlassPainter(radius: radius, accent: accent, glow: 1, blob: blob),
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
        blob: bubbleRim ? GlassBubble.pageBlob : null,
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
    stroke(10, const Color(0xff36d4ff).withValues(alpha: .55), 6),
  );
  canvas.save();
  canvas.clipPath(path);
  // Inner glow, about 8 px, fading inward.
  canvas.drawPath(
    path,
    stroke(20, const Color(0xff2ac4ff).withValues(alpha: .26), 6),
  );
  // The rim core: about 5 px of saturated cyan inside the edge.
  canvas.drawPath(
    path,
    stroke(7, Colors.white, 0)
      ..shader = ui.Gradient.linear(
        Offset.zero,
        Offset(w, h),
        [
          const Color(0xff7aeaff).withValues(alpha: .95),
          const Color(0xff1cc8f6).withValues(alpha: .9),
          const Color(0xff40dcfa).withValues(alpha: .95),
        ],
        [0, .5, 1],
      ),
  );
  // Wider and brighter through the corners.
  for (final at in corners) {
    canvas.drawPath(
      path,
      stroke(12, Colors.white, 0)
        ..shader = ui.Gradient.radial(at, radius * 1.1, [
          const Color(0xffa8f2ff).withValues(alpha: .55),
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
        const Color(0xffe6faff).withValues(alpha: .2),
        const Color(0xffbff1ff).withValues(alpha: 0),
      ]),
  );
  canvas.restore();
  // The white reflection inside the band, through the corners.
  if (inner != null) {
    for (final at in corners) {
      canvas.drawPath(
        inner,
        stroke(2.2, Colors.white, 0)
          ..shader = ui.Gradient.radial(
            at,
            radius * 1.6,
            [
              Colors.white.withValues(alpha: .85),
              Colors.white.withValues(alpha: .4),
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
  canvas.drawPath(path, stroke(1.8, const Color(0xffbff6ff), 0));
  final m = Matrix4.identity()
    ..translateByDouble(w / 2, h / 2, 0, 1)
    ..scaleByDouble(1 - 5 * k / w, 1 - 5 * k / h, 1, 1)
    ..translateByDouble(-w / 2, -h / 2, 0, 1);
  final drift = path.transform(m.storage);
  for (final (width, alpha, blur) in [(3.0, .3, 0.0), (1.4, .9, 0.0)]) {
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
            const Color(0xff07243f).withValues(alpha: .82),
            const Color(0xff020e1c).withValues(alpha: .86),
            const Color(0xff051c34).withValues(alpha: .84),
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
            Colors.white.withValues(alpha: .08),
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
        ..shader = ui.Gradient.radial(
          size.center(Offset.zero),
          math.max(size.width, size.height) * .62,
          [
            const Color(0xff010a16).withValues(alpha: .9),
            const Color(0xff021326).withValues(alpha: .88),
            const Color(0xff06284a).withValues(alpha: .84),
          ],
          [0, .6, 1],
        ),
    );
    paintPageRim(
      canvas,
      r,
      size,
      radius,
      k: glow >= 1 ? 1 : .6,
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

/// Height of the top / bottom dome: [kDomeH] of the half-height, but never
/// more than [kDomeW] of the half-width, so the tall scrolling pages
/// (Profile, Projects) get the same top curve as Home, not a pointed dome.
const kDomeH = .42, kDomeW = .7;

/// The size of Home's glass on a screen whose space above the tab bar is
/// [area] (lib/screens/bubble_home.dart): full width (600 at most), under
/// Home's 6 px gap, 52 px logo row and 30.4 px Classic view row, and at
/// least 1.45 x as tall as wide. The bubble pages (Projects, Profile, Orders,
/// My orders) take their width, dome and heading room from it, so they
/// match Home on every phone.
Size homeGlassSize(Size area) {
  final w = math.min(area.width, 600.0);
  return Size(w, math.max(area.height - 88.4, w * 1.45));
}

/// The height of Home's top and bottom dome on that screen (as
/// [HomeGlassPainter] works it out for Home's glass).
double homeDomeHeight(Size area) {
  final s = homeGlassSize(area);
  return math.min(s.height / 2 * kDomeH, s.width / 2 * kDomeW);
}

/// Room above a bubble page's heading: its letters sit at least as far
/// below the rim as Home's LET'S CREATE (Home: the title's box at 8.5 % of
/// the glass height, its letters about 2 % lower).
double bubbleHeadingRoom(Size area) => homeGlassSize(area).height * .1;

/// Room under a bubble page's content, so the corners of a full-width last
/// row (corner radius [corner], [side] px in from the bubble's sides) keep
/// [clear] px from the rim where the bottom dome curves in. [width] is the
/// bubble's, [dome] its dome height. The drawn rim is about .947 of the
/// half-width and .99 of the dome, 2.5 px in from the edge.
double bubbleBottomRoom(
  double width,
  double dome, {
  double side = 28,
  double corner = 23,
  double clear = 16,
}) {
  final a = width / 2 * .947, r = dome * .99, d = corner + clear;
  // The corner's centre, from the middle; how high it must sit above the
  // bottom of the dome to keep [d] from the rim (an ellipse [d] smaller).
  final k = ((width / 2 - side - corner) / math.max(a - d, 1)).clamp(0.0, 1.0);
  final centre = r - math.max(r - d, 0) * math.sqrt(1 - k * k);
  return math.max(14.0, centre - corner + 2.5);
}

/// The glass: an organic blob (a raised lobe at the top left, fuller
/// corners and a slightly pinched waist, like the client's picture) with a
/// deep navy body, soft glassy swirls and a thick bright cyan rim. Its edge
/// stretches towards [pullAt] by [pull] (0 to 1), floats with [t], and forms
/// a rounded pocket (its own lobe) around [pocketAt] by [pocket] (0 to 1).

class HomeGlassPainter extends CustomPainter {
  HomeGlassPainter({
    this.t = 0,
    this.pullAt = Offset.zero,
    this.pull = 0,
    this.pocketAt,
    this.pocket = 0,
    this.pocketR = 0,
    this.pocketStrong = false,
    this.dome,
  });
  final double t, pull, pocket, pocketR;
  final Offset pullAt;
  final Offset? pocketAt;
  final bool pocketStrong;

  /// The bubble pages: this dome height in px (Home's, [homeDomeHeight]),
  /// and the top and bottom kept at the edge however tall the page grows.
  /// Null (Home): the dome from this glass's own size.
  final double? dome;

  /// The outline's points from the last [_blob], in order of direction.
  List<Offset> _outline = const [];

  /// Angular distance between two directions, 0 to pi.
  static double _ang(double a, double b) {
    var d = (a - b).abs() % (2 * math.pi);
    if (d > math.pi) d = 2 * math.pi - d;
    return d;
  }

  static double _bump(double d, double sigma) =>
      math.exp(-(d * d) / (2 * sigma * sigma));

  Path _blob(Size s) {
    final c = s.center(Offset.zero);
    final a = s.width / 2, b = s.height / 2;
    const n = 120;
    final ph = t * 2 * math.pi;
    final toward = pullAt - c;
    final dir = toward.direction;
    final o = pocketAt == null ? null : pocketAt! - c;
    // How wide the pocket looks from the centre of the glass.
    final half = o == null
        ? 0.0
        : math.atan2(pocketR, math.max(o.distance, 1)).clamp(.2, 1.1);
    final pts = <Offset>[];
    // (Pages: the straight part of the sides, for the breathing below.)
    var sides = 0.0;
    for (var k = 0; k < n; k++) {
      final th = k / n * 2 * math.pi;
      // Tall rounded rectangle (client 399/403): flat top and bottom,
      // nearly straight sides, large corners (about 20% of the width).
      // Client 406: much rounder, bubble-like corners (~38% of the width),
      // so the top and bottom curve from corner to corner.
      final r = math.min(s.width * .3, b);
      final ax = a - r, by = b - r;
      final per = 4 * ax + 4 * by + 2 * math.pi * r;
      var u = (k / n) * per;
      double x, y;
      if (u < by) {
        x = a;
        y = u; // right side, downward from the middle
      } else if ((u -= by) < math.pi * r / 2) {
        final g = u / r;
        x = ax + r * math.cos(g);
        y = by + r * math.sin(g);
      } else if ((u -= math.pi * r / 2) < 2 * ax) {
        x = ax - u;
        y = b;
      } else if ((u -= 2 * ax) < math.pi * r / 2) {
        final g = math.pi / 2 + u / r;
        x = -ax + r * math.cos(g);
        y = by + r * math.sin(g);
      } else if ((u -= math.pi * r / 2) < 2 * by) {
        x = -a;
        y = by - u;
      } else if ((u -= 2 * by) < math.pi * r / 2) {
        final g = math.pi + u / r;
        x = -ax + r * math.cos(g);
        y = -by + r * math.sin(g);
      } else if ((u -= math.pi * r / 2) < 2 * ax) {
        x = -ax + u;
        y = -b;
      } else if ((u -= 2 * ax) < math.pi * r / 2) {
        final g = 1.5 * math.pi + u / r;
        x = ax + r * math.cos(g);
        y = -by + r * math.sin(g);
      } else {
        u -= math.pi * r / 2;
        x = a;
        y = -by + u;
      }
      // Client 406/410: a half-oval dome on top and bottom (as wide as the
      // glass, about half the bubble's half-height tall) and straight sides.
      {
        final ry = dome == null
                ? math.min(b * kDomeH, a * kDomeW)
                : math.min(dome!, b),
            sb = b - ry;
        sides = sb;
        final arc =
            math.pi *
            (3 * (a + ry) - math.sqrt((3 * a + ry) * (a + 3 * ry))) /
            2;
        final tot = 2 * arc + 4 * sb;
        var v = (k / n) * tot;
        if (v < sb) {
          x = a;
          y = v;
        } else if ((v -= sb) < arc) {
          final g = v / arc * math.pi;
          x = a * math.cos(g);
          y = sb + ry * math.sin(g);
        } else if ((v -= arc) < 2 * sb) {
          x = -a;
          y = sb - v;
        } else if ((v -= 2 * sb) < arc) {
          final g = math.pi + v / arc * math.pi;
          x = a * math.cos(g);
          y = -sb + ry * math.sin(g);
        } else {
          v -= arc;
          x = a;
          y = -sb + v;
        }
        // Soft shoulders (client 412): the sides bow out a little in the
        // middle and ease in towards the domes, so the side flows into the
        // dome with no sudden turn; a few px further from the screen edge.
        x *= .97 * .985;
      }
      // Only a very slight soft bow on the sides, and faint breathing.
      final side = math.pow(1 - (y / b).clamp(-1.0, 1.0).abs(), 2).toDouble();
      x += x.sign * a * .012 * side * (x.abs() >= a - .5 ? 1 : 0);
      final f =
          .99 +
          .0025 * math.sin(3 * th + ph) +
          .002 * math.sin(5 * th - 2 * ph + 1) +
          .0015 * math.sin(7 * th + 3 * ph);
      // Pages: the breathing shapes the domes about their own base, so a
      // long page keeps Home's top and bottom right at the edge.
      var p = dome == null
          ? Offset(x, y) * f
          : Offset(
              x * f,
              y.abs() <= sides ? y : y.sign * (sides + (y.abs() - sides) * f),
            );
      if (pull > 0) {
        final diff = _ang(p.direction, dir);
        final g = _bump(diff, .42);
        final reach = (toward.distance / math.max(p.distance, 1)).clamp(
          0.0,
          1.2,
        );
        final bulge = pull * g * (6 + 22 * reach);
        // The far side gives a little, so the glass feels like one volume.
        final give = pull * _bump(math.pi - diff, .5) * 6;
        p = p + Offset.fromDirection(p.direction, bulge - give);
      }
      if (o != null && pocket > 0) {
        final diff = _ang(p.direction, o.direction);
        // The surface pulls out round the chosen option ...
        final need = o.distance + pocketR * 1.1;
        var push = 24 * _bump(diff, half);
        if (p.distance < need) {
          push += (need - p.distance) * _bump(diff, half * .85);
        }
        // ... with only a slight waist beside it, so it stays one surface.
        final neck = 8 * _bump(diff - half * 1.5, .2);
        p = p + Offset.fromDirection(p.direction, pocket * (push - neck));
      }
      // Soft limit: near the frame the glass compresses instead of running
      // into the logo row or the nav.
      double soft(double v, double lo, double hi) {
        const m = 3.0;
        if (v < lo + m) return lo + m - (lo + m - v) * .25;
        if (v > hi - m) return hi - m + (v - hi + m) * .25;
        return v;
      }

      final q = c + p;
      pts.add(Offset(soft(q.dx, 0, s.width), soft(q.dy, 0, s.height)));
    }
    _outline = pts;
    final path = Path()..moveTo(pts[0].dx, pts[0].dy);
    for (var i = 0; i < n; i++) {
      final p0 = pts[(i - 1 + n) % n], p1 = pts[i];
      final p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      final c1 = p1 + (p2 - p0) / 6, c2 = p2 - (p3 - p1) / 6;
      path.cubicTo(c1.dx, c1.dy, c2.dx, c2.dy, p2.dx, p2.dy);
    }
    return path..close();
  }

  /// Faint folds inside the glass, as fractions of its size: start, two
  /// control points, end, relative width and strength.
  static const _swirls = [
    (
      Offset(.07, .36),
      Offset(.06, .10),
      Offset(.36, .02),
      Offset(.62, .10),
      .1,
      .4,
    ),
    (
      Offset(.62, .08),
      Offset(.93, .12),
      Offset(1.0, .40),
      Offset(.86, .56),
      .09,
      .34,
    ),
    (
      Offset(.06, .56),
      Offset(.0, .82),
      Offset(.2, .97),
      Offset(.48, .94),
      .1,
      .38,
    ),
    (
      Offset(.54, .97),
      Offset(.86, .96),
      Offset(.99, .76),
      Offset(.9, .56),
      .09,
      .34,
    ),
    (
      Offset(.14, .46),
      Offset(.36, .36),
      Offset(.62, .64),
      Offset(.88, .5),
      .08,
      .22,
    ),
  ];

  /// A light streak just inside the outline, between the directions
  /// [from] and [to] (radians, 0 = right, clockwise), [inset] px in, fading
  /// in and out at its ends.
  void _streak(
    Canvas canvas,
    Offset c,
    double from,
    double to,
    double inset,
    double width,
    double alpha,
    double blur,
    Color colour,
  ) {
    final n = _outline.length;
    double norm(double a) => (a % (2 * math.pi) + 2 * math.pi) % (2 * math.pi);
    final a0 = norm(from), span = norm(to - from);
    final idx = <int>[];
    for (var k = 0; k < n; k++) {
      final th = k / n * 2 * math.pi;
      if (norm(th - a0) <= span) idx.add(k);
    }
    if (idx.length < 2) return;
    // Order the points along the arc.
    idx.sort(
      (p, q) => norm(
        p / n * 2 * math.pi - a0,
      ).compareTo(norm(q / n * 2 * math.pi - a0)),
    );
    Offset at(int k) {
      final p = _outline[k];
      final d = c - p;
      return p + d / math.max(d.distance, 1) * inset;
    }

    // One path along the arc, faded in and out by a sweep gradient round
    // the centre (one draw instead of a blurred line per segment).
    final line = Path()..moveTo(at(idx[0]).dx, at(idx[0]).dy);
    for (var i = 1; i < idx.length; i++) {
      final p = at(idx[i]);
      line.lineTo(p.dx, p.dy);
    }
    final rot = Matrix4.identity()
      ..translateByDouble(c.dx, c.dy, 0, 1)
      ..rotateZ(a0)
      ..translateByDouble(-c.dx, -c.dy, 0, 1);
    final on = colour.withValues(alpha: alpha);
    final off = colour.withValues(alpha: 0);
    canvas.drawPath(
      line,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = width
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..shader = ui.Gradient.sweep(
          c,
          [off, on, on, off],
          const [0, .35, .65, 1],
          TileMode.clamp,
          0,
          math.max(span, .01),
          rot.storage,
        )
        ..maskFilter = blur > 2
            ? MaskFilter.blur(BlurStyle.normal, blur)
            : null,
    );
  }

  @override
  void paint(Canvas canvas, Size s) {
    if (s.isEmpty) return;
    final path = _blob(s);
    final w = s.width, h = s.height;
    final c = s.center(Offset.zero);
    final ph = t * 2 * math.pi;
    // The body: dark and translucent, so the page and the 3 mark read
    // through it; a little bluer towards the edge where light gathers.
    canvas.drawPath(
      path,
      Paint()
        ..shader = ui.Gradient.radial(
          Offset(w * .5, h * .48),
          math.max(w, h) * .6,
          const [Color(0xe6010a16), Color(0xe6021326), Color(0xe606284a)],
          const [0, .6, 1],
        ),
    );
    canvas.save();
    canvas.clipPath(path);
    // Faint folds drifting slowly in the glass.
    for (var i = 0; i < 0; i++) {
      // (folds off: clear glass, client 388)
      final (p0, p1, p2, p3, width, strength) = _swirls[i];
      final wob = Offset(
        math.sin(ph + i * 1.3) * w * .012,
        math.cos(ph + i * .9) * h * .01,
      );
      Offset at(Offset f) => Offset(f.dx * w, f.dy * h) + wob;
      final a0 = at(p0), a1 = at(p1), a2 = at(p2), a3 = at(p3);
      final swirl = Path()
        ..moveTo(a0.dx, a0.dy)
        ..cubicTo(a1.dx, a1.dy, a2.dx, a2.dy, a3.dx, a3.dy);
      canvas.drawPath(
        swirl,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeCap = StrokeCap.round
          ..strokeWidth = w * width
          ..color = const Color(0xff2b7fe8).withValues(alpha: strength * .55)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 18),
      );
    }
    // Light gathering inside the edge.
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 40
        ..color = const Color(0xff1a6fe0).withValues(alpha: .12)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 28),
    );
    // A soft sheen at the top left.
    canvas.drawRect(
      Offset.zero & s,
      Paint()
        ..shader = ui.Gradient.radial(Offset(w * .22, h * .1), w * .55, [
          Colors.white.withValues(alpha: .09),
          Colors.white.withValues(alpha: 0),
        ]),
    );
    // The pocket: the glass gathers into a lens round the chosen option,
    // lit on the side where the surface pulls out and melting into the
    // body on the inner side (no separate outlined ring).
    final o0 = pocketAt;
    if (o0 != null && pocket > 0) {
      final k = pocket * (pocketStrong ? 1 : .55);
      // Never past the rim: keep the full size and move the centre in.
      final r = pocketR;
      final m = r + 10;
      final o = Offset(
        s.width < 2 * m ? s.width / 2 : o0.dx.clamp(m, s.width - m),
        s.height < 2 * m ? s.height / 2 : o0.dy.clamp(m, s.height - m),
      );
      final out = o - c;
      final u = out / math.max(out.distance, 1);
      canvas.drawCircle(
        o,
        r,
        Paint()
          ..shader = ui.Gradient.radial(
            o,
            r,
            [
              const Color(0xff3fb8ff).withValues(alpha: .24 * k),
              const Color(0xff1f8fff).withValues(alpha: .1 * k),
              const Color(0xff1f8fff).withValues(alpha: 0),
            ],
            const [0, .75, 1],
          ),
      );
      final box = Rect.fromCircle(center: o, radius: r * 1.5);
      canvas.saveLayer(box, Paint());
      canvas.drawCircle(
        o,
        r * 1.08,
        Paint()
          ..shader = ui.Gradient.radial(
            o,
            r * 1.08,
            [
              const Color(0x003fb8ff),
              const Color(0xff3fb8ff).withValues(alpha: .38 * k),
              const Color(0xffcdf6ff).withValues(alpha: .62 * k),
              const Color(0x003fb8ff),
            ],
            const [.66, .84, .93, 1],
          ),
      );
      // Fade the side facing the middle of the glass.
      canvas.drawRect(
        box,
        Paint()
          ..blendMode = BlendMode.dstIn
          ..shader = ui.Gradient.linear(o - u * r, o + u * r, [
            Colors.white.withValues(alpha: .2),
            Colors.white,
          ]),
      );
      canvas.restore();
      // The lens catches the light at its top left.
      canvas.drawArc(
        Rect.fromCircle(center: o, radius: r * .86),
        -2.75,
        1.05,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeCap = StrokeCap.round
          ..strokeWidth = 3.5
          ..color = Colors.white.withValues(alpha: .7 * k),
      );
    }
    // Directional highlights: a long bright reflection round the top-left
    // corner, and a softer one at the bottom right.
    _streak(canvas, c, -3.0, -1.6, 10, 12, .38, 7, Colors.white);
    _streak(canvas, c, .25, 1.15, 10, 8, .3, 6, const Color(0xff9fe8ff));
    canvas.restore();
    // The edge (client 373): a strong, soft cyan glow INSIDE the glass only
    // (clipped, nothing spills outside) and one thin crisp cyan-white line.
    canvas.save();
    canvas.clipPath(path);
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 24
        ..color = const Color(0xff4fdcff).withValues(alpha: .4)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12),
    );
    canvas.restore();
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.6
        ..color = const Color(0xff9feeff),
    );
    _whiteLights(canvas, path, s);
  }

  /// White light on the glass (client 373): long soft white streaks inside
  /// the rim on both sides, brightest at mid-height, and white gloss on the
  /// top and bottom curves. Gradients only, no blur.
  void _whiteLights(Canvas canvas, Path path, Size s) {
    Path inset(double d) => path.transform(
      (Matrix4.identity()
            ..translateByDouble(s.width / 2, s.height / 2, 0, 1)
            ..scaleByDouble(1 - d / s.width, 1 - d / s.height, 1, 1)
            ..translateByDouble(-s.width / 2, -s.height / 2, 0, 1))
          .storage,
    );
    final r = Offset.zero & s;
    Shader blue(double a) => LinearGradient(
      colors: [
        const Color(0xff1fa8ff).withValues(alpha: a),
        const Color(0xff1fa8ff).withValues(alpha: 0),
        const Color(0xff1fa8ff).withValues(alpha: 0),
        const Color(0xff1fa8ff).withValues(alpha: a),
      ],
      stops: const [0, .16, .84, 1],
    ).createShader(r);
    Shader blueEnds(double a) => LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        const Color(0xff1fa8ff).withValues(alpha: a),
        const Color(0xff1fa8ff).withValues(alpha: 0),
        const Color(0xff1fa8ff).withValues(alpha: 0),
        const Color(0xff1fa8ff).withValues(alpha: a),
      ],
      stops: const [0, .1, .9, 1],
    ).createShader(r);
    void band(
      double y0,
      double y1,
      Path p,
      double w,
      Shader sh, [
      double blur = 0,
    ]) {
      canvas.save();
      canvas.clipRect(Rect.fromLTRB(0, s.height * y0, s.width, s.height * y1));
      canvas.drawPath(
        p,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = w
          ..strokeCap = StrokeCap.round
          ..shader = sh
          ..maskFilter = blur > 0
              ? MaskFilter.blur(BlurStyle.normal, blur)
              : null,
      );
      canvas.restore();
    }

    // A wide soft blue glow down both sides and round the ends (client 373).
    canvas.save();
    canvas.clipPath(path);
    band(0, 1, inset(30), 40, blue(.16), 16);
    band(0, 1, inset(30), 30, blueEnds(.14), 16);
    // Many small lights all round just inside the rim (client 373): each
    // bright at its centre and fading out, uneven in size and spacing.
    paintRimLights(canvas, inset(14), homeRimLights, 1.2 + .25 * pull);
    canvas.restore();
  }

  @override
  bool shouldRepaint(HomeGlassPainter o) =>
      o.t != t ||
      o.pull != pull ||
      o.pullAt != pullAt ||
      o.pocketAt != pocketAt ||
      o.pocket != pocket ||
      o.pocketR != pocketR ||
      o.pocketStrong != pocketStrong ||
      o.dome != dome;
}

/// Small lights round the rim (client 373): position along the edge (0-1),
/// size in px and strength. Uneven on purpose, like light on real glass.
const homeRimLights = <(double, double, double)>[
  (.02, 22, .95),
  (.07, 10, .6),
  (.11, 26, 1),
  (.17, 12, .7),
  (.22, 18, .85),
  (.29, 9, .55),
  (.34, 24, .95),
  (.39, 14, .7),
  (.45, 20, .9),
  (.5, 11, .6),
  (.55, 28, 1),
  (.61, 13, .7),
  (.66, 19, .85),
  (.72, 8, .5),
  (.77, 25, .95),
  (.83, 12, .65),
  (.88, 21, .9),
  (.94, 10, .6),
];

/// Draws [lights] along [p]: each an oval along the edge, white at its
/// centre and fading through cyan to nothing. [k] brightens them all.
void paintRimLights(
  Canvas canvas,
  Path p,
  List<(double, double, double)> lights,
  double k,
) {
  for (final m in p.computeMetrics()) {
    for (final (f, size, a) in lights) {
      final tan = m.getTangentForOffset(m.length * f);
      if (tan == null) continue;
      final al = (a * k).clamp(0.0, 1.0);
      canvas.save();
      canvas.translate(tan.position.dx, tan.position.dy);
      canvas.rotate(-tan.angle);
      canvas.scale(.9 + (f * 97) % 1 * 1.6, .22 + (f * 53) % 1 * .3);
      canvas.drawCircle(
        Offset.zero,
        size * 2,
        Paint()
          ..shader = ui.Gradient.radial(
            Offset.zero,
            size * 2,
            [
              Colors.white.withValues(alpha: al),
              const Color(0xff6fdcff).withValues(alpha: al * .85),
              const Color(0xff2ab8ff).withValues(alpha: al * .35),
              const Color(0xff2ab8ff).withValues(alpha: 0),
            ],
            const [0, .25, .6, 1],
          ),
      );
      canvas.restore();
    }
    break;
  }
}
