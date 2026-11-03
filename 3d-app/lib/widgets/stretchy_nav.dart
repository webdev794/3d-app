import 'dart:math' as math;

import 'package:flutter/material.dart';

/// The bottom tab bar as soft glass on every main page (user 2026-11-03, HB1
/// pictures 330 / 334): press
/// and drag it and it leans and stretches towards the finger with a light
/// ripple; on release it springs back with a small wobble. It only listens
/// (never claims the gesture), so a tap still switches tabs. With animations
/// off the bar stays plain.
class StretchyNav extends StatefulWidget {
  const StretchyNav({super.key, required this.child});
  final Widget child;

  @override
  State<StretchyNav> createState() => _StretchyNavState();
}

class _StretchyNavState extends State<StretchyNav>
    with TickerProviderStateMixin {
  // The pull back to rest (elastic) and the ripple ring.
  late final AnimationController _back = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 650),
  );
  late final AnimationController _ripple = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  );
  Offset? _start;
  Offset _pull = Offset.zero, _from = Offset.zero, _at = Offset.zero;

  @override
  void dispose() {
    _back.dispose();
    _ripple.dispose();
    super.dispose();
  }

  /// The pull, softened: it follows the finger less the further it goes.
  static Offset _soft(Offset d) {
    double ease(double v, double max) =>
        max * (2 / math.pi) * math.atan(v / (max * 2.2));
    return Offset(ease(d.dx, 22), ease(d.dy, 14));
  }

  void _down(PointerDownEvent e) {
    _back.stop();
    _start = e.localPosition - _pull;
    _at = e.localPosition;
    _ripple.forward(from: 0);
    setState(() {});
  }

  void _move(PointerMoveEvent e) {
    final start = _start;
    if (start == null) return;
    setState(() {
      _at = e.localPosition;
      _pull = _soft(e.localPosition - start);
    });
  }

  void _up(PointerEvent e) {
    if (_start == null) return;
    _start = null;
    _from = _pull;
    _back.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      return widget.child;
    }
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: _down,
      onPointerMove: _move,
      onPointerUp: _up,
      onPointerCancel: _up,
      child: AnimatedBuilder(
        animation: Listenable.merge([_back, _ripple]),
        builder: (context, child) {
          if (_start == null && _back.isAnimating) {
            _pull = _from * (1 - Curves.elasticOut.transform(_back.value));
          } else if (_start == null && _back.isCompleted) {
            _pull = Offset.zero;
          }
          final p = _pull;
          // Stretch along the pull, a touch thinner across it (the glass keeps its volume).
          final sx = 1 + p.dx.abs() / 260 - p.dy.abs() / 900;
          final sy = 1 + p.dy.abs() / 120 - p.dx.abs() / 700;
          return LayoutBuilder(
            builder: (context, box) {
              final w = box.maxWidth;
              // Leans from the side the finger is on.
              final ax = w.isFinite && w > 0
                  ? (_at.dx / w * 2 - 1).clamp(-1.0, 1.0)
                  : 0.0;
              return Stack(
                clipBehavior: Clip.none,
                children: [
                  Transform(
                    alignment: Alignment(-ax * .6, p.dy < 0 ? 1 : -1),
                    transform: Matrix4.identity()
                      ..translateByDouble(p.dx * .55, p.dy * .7, 0, 1)
                      ..scaleByDouble(sx, sy, 1, 1),
                    child: child,
                  ),
                  if (_ripple.isAnimating || _start != null)
                    Positioned.fill(
                      child: IgnorePointer(
                        child: CustomPaint(
                          painter: _NavRipplePainter(
                            at: _at + Offset(p.dx * .55, p.dy * .7),
                            t: _ripple.value,
                            held: _start != null,
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          );
        },
        child: widget.child,
      ),
    );
  }
}

/// A soft cyan ring spreading from the finger, and a glow under it while held.
class _NavRipplePainter extends CustomPainter {
  const _NavRipplePainter({
    required this.at,
    required this.t,
    required this.held,
  });
  final Offset at;
  final double t;
  final bool held;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.clipRRect(
      RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(34)),
    );
    if (t < 1) {
      final r = 10 + 70 * Curves.easeOut.transform(t);
      canvas.drawCircle(
        at,
        r,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.2 * (1 - t) + .4
          ..color = const Color(0xff5fe3ff).withValues(alpha: .55 * (1 - t))
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.5),
      );
    }
    if (held) {
      canvas.drawCircle(
        at,
        26,
        Paint()
          ..shader = RadialGradient(
            colors: [
              const Color(0xff7fe9ff).withValues(alpha: .28),
              const Color(0x0000c8ff),
            ],
          ).createShader(Rect.fromCircle(center: at, radius: 26)),
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_NavRipplePainter old) =>
      old.at != at || old.t != t || old.held != held;
}
