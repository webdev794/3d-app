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
  });
  final Widget child;
  final double radius;
  final EdgeInsetsGeometry padding;
  final Color accent;

  @override
  Widget build(BuildContext context) => CustomPaint(
    painter: _GlassPainter(radius: radius, accent: accent, glow: 1),
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
      painter: _GlassPainter(radius: radius, accent: accent, glow: .55),
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

class _GlassPainter extends CustomPainter {
  const _GlassPainter({
    required this.radius,
    required this.accent,
    required this.glow,
  });
  final double radius, glow;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
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
    // The bright rim.
    canvas.drawRRect(
      r.deflate(.8),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..shader = ui.Gradient.linear(
          Offset.zero,
          Offset(size.width, size.height),
          [
            Color.lerp(accent, Colors.white, .55)!,
            accent.withValues(alpha: .75),
            Color.lerp(accent, Colors.white, .35)!,
          ],
          [0, .5, 1],
        ),
    );
  }

  @override
  bool shouldRepaint(_GlassPainter old) =>
      old.radius != radius || old.accent != accent || old.glow != glow;
}
