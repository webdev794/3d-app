import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'ui.dart';

/// 3DEEZI Rewards, coming soon: the small card at the bottom of the home
/// screen, in the style of the website's homepage banner (client design
/// 2026-10-20). A glowing gift, the 3DEEZI wordmark with REWARDS, its line and
/// a COMING SOON pill that does nothing yet (read out as a disabled button).
class RewardsComingSoonCard extends StatelessWidget {
  const RewardsComingSoonCard({super.key});

  static const _rule = Color(0xff3b4659);

  @override
  Widget build(BuildContext context) => Semantics(
    container: true,
    explicitChildNodes: true,
    label: '3DEEZI Rewards: coming soon',
    child: DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xd952d4ec)),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xff04111f), Color(0xff020a14)],
        ),
        boxShadow: [
          BoxShadow(color: Palette.cyan.withValues(alpha: .3), blurRadius: 14),
          const BoxShadow(color: Color(0x2400a8e8), blurRadius: 40),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(13),
        child: CustomPaint(
          painter: const _RewardsBackdrop(),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 14, 16, 14),
            child: Row(
              children: [
                const SizedBox(
                  width: 92,
                  height: 64,
                  child: CustomPaint(painter: GiftPainter()),
                ),
                Container(
                  width: 1,
                  height: 58,
                  margin: const EdgeInsets.only(left: 6, right: 14),
                  color: _rule,
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Semantics(
                              label: '3DEEZI',
                              image: true,
                              child: const BrandLogo(width: 84),
                            ),
                            Container(
                              width: 1,
                              height: 15,
                              margin: const EdgeInsets.symmetric(horizontal: 8),
                              color: _rule,
                            ),
                            const Text(
                              'REWARDS',
                              style: TextStyle(
                                fontFamily: 'Rajdhani',
                                fontWeight: FontWeight.w700,
                                fontSize: 21,
                                height: 1,
                                letterSpacing: .7,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Something rewarding is on the way.',
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.3,
                          letterSpacing: .2,
                          color: Color(0xffe9f0f7),
                        ),
                      ),
                      const SizedBox(height: 11),
                      const _ComingSoonPill(),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

/// COMING SOON in the homepage's cyan → electric blue → violet gradient. Not a
/// button yet: nothing happens on tap.
class _ComingSoonPill extends StatelessWidget {
  const _ComingSoonPill();

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    enabled: false,
    label: 'Coming soon',
    excludeSemantics: true,
    child: FittedBox(
      fit: BoxFit.scaleDown,
      alignment: Alignment.centerLeft,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(99),
          gradient: const LinearGradient(
            colors: [
              Color(0xff12d8f7),
              Color(0xff139dfb),
              Color(0xff2a5cff),
              Color(0xff5b43fb),
              Color(0xffa04cf9),
            ],
            stops: [0, .24, .5, .74, 1],
          ),
          boxShadow: const [
            BoxShadow(color: Color(0x591aa6ff), blurRadius: 14),
            BoxShadow(color: Color(0x2e6a4dff), blurRadius: 30),
          ],
        ),
        child: const Padding(
          padding: EdgeInsets.symmetric(horizontal: 24, vertical: 10),
          child: Text(
            'COMING SOON',
            maxLines: 1,
            style: TextStyle(
              fontFamily: 'Rajdhani',
              fontWeight: FontWeight.w700,
              fontSize: 15,
              height: 1,
              letterSpacing: 1.6,
              color: Colors.white,
              shadows: [
                Shadow(
                  color: Color(0x730b1f5a),
                  blurRadius: 3,
                  offset: Offset(0, 1),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

/// Faint stars towards the two ends and light waves along the bottom.
class _RewardsBackdrop extends CustomPainter {
  const _RewardsBackdrop();

  static const _stars = [
    (.03, .18, .8),
    (.08, .62, .6),
    (.13, .3, .5),
    (.17, .84, .7),
    (.21, .12, .5),
    (.05, .9, .5),
    (.8, .2, .6),
    (.85, .7, .8),
    (.9, .35, .5),
    (.95, .14, .7),
    (.97, .58, .5),
    (.88, .9, .6),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final all = Offset.zero & size;
    canvas.drawRect(
      all,
      Paint()
        ..shader = const RadialGradient(
          center: Alignment.bottomLeft,
          radius: .9,
          colors: [Color(0x590f3d7a), Color(0x000f3d7a)],
        ).createShader(Rect.fromLTWH(0, 0, w * .6, h * 2)),
    );
    final star = Paint()..color = const Color(0x99c4ecff);
    for (final (x, y, r) in _stars) {
      canvas.drawCircle(Offset(x * w, y * h), r, star);
    }
    final left = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..shader = const LinearGradient(
        colors: [Color(0xd92f8dff), Color(0x592a7bff), Color(0x002a7bff)],
        stops: [0, .5, 1],
      ).createShader(Rect.fromLTWH(0, 0, w * .45, h));
    final right = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..shader = const LinearGradient(
        colors: [Color(0x003a8dff), Color(0x663aa0ff), Color(0xe659c8ff)],
        stops: [0, .5, 1],
      ).createShader(Rect.fromLTWH(w * .6, 0, w * .4, h));
    for (final (y, dip) in [(.74, .1), (.84, .08), (.93, .06)]) {
      canvas.drawPath(
        Path()
          ..moveTo(-4, h * y)
          ..cubicTo(
            w * .1,
            h * (y - dip),
            w * .2,
            h * (y + dip),
            w * .45,
            h * (y - dip * 1.6),
          ),
        left,
      );
    }
    for (final (y, x0) in [(.5, .62), (.66, .7), (.8, .76)]) {
      canvas.drawPath(
        Path()
          ..moveTo(w * x0, h + 4)
          ..cubicTo(
            w * (x0 + .12),
            h * .98,
            w * .9,
            h * (y + .12),
            w + 4,
            h * y,
          ),
        right,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// The gift as on the website (RewardsBanner.tsx, the same outline in a
/// 186 × 130 box): a neon outline box with a ribbon and bow, three sparkles
/// around it. Parts are drawn back to front; the outline runs cyan to violet
/// (bottom right) and glows.
class GiftPainter extends CustomPainter {
  const GiftPainter();

  static const _parts = <(String, int?)>[
    ('M124 70L142 61V114L124 123Z', null), // side, its own gradient
    ('M131 66.5L135 64.5V118.5L131 120.5Z', 0xff11306a),
    ('M44 70H124V120Q124 124 120 124H48Q44 124 44 120Z', null), // front
    ('M70 70H82V124H70Z', 0xff0d4566),
    ('M128 54L146 45V61L128 70Z', 0xff101b40),
    ('M135 50.5L139 48.5V64.5L135 66.5Z', 0xff143a74),
    ('M40 54L58 45H146L128 54Z', 0xff0d2f50),
    ('M47 50.5H135L139 48.5H51Z', 0xff16557c),
    ('M70 54L88 45H100L82 54Z', 0xff16557c),
    ('M40 54H128V67Q128 70 125 70H43Q40 70 40 67Z', 0xff0a2341),
    ('M70 54H82V70H70Z', 0xff0e4a6c),
    (
      'M84 47C76 42 58 35 56 23C54 12 66 8 74 16C80 23 83 36 84 47Z',
      0xff0a2848,
    ),
    (
      'M86 47C94 42 113 33 117 21C120 10 107 6 99 14C92 22 87 36 86 47Z',
      0xff0a2848,
    ),
    (
      'M77 41C70 35 64 28 62 22M93 41C101 34 108 27 110 20',
      0,
    ), // folds, no fill
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final s = math.min(size.width / 186, size.height / 130);
    canvas.save();
    canvas.translate((size.width - 186 * s) / 2, (size.height - 130 * s) / 2);
    canvas.scale(s);
    final line = const LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [
        Color(0xff9ef9ff),
        Color(0xff2fd3ff),
        Color(0xff3b7bff),
        Color(0xffa65cff),
      ],
      stops: [0, .38, .72, 1],
    ).createShader(const Rect.fromLTRB(40, 8, 146, 124));
    final paths = [for (final (d, _) in _parts) _svgPath(d)];
    final knot = Path()
      ..addOval(
        Rect.fromCenter(center: const Offset(85, 47.5), width: 13, height: 9.2),
      );
    final sparkles = Path()
      ..addPath(_sparkle(14, 32, 13), Offset.zero)
      ..addPath(_sparkle(172, 31, 8), Offset.zero)
      ..addPath(_sparkle(172, 83, 7.5), Offset.zero);
    // A soft glow behind, from every outline.
    final glow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..shader = line
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5);
    for (final p in paths) {
      canvas.drawPath(p, glow);
    }
    canvas.drawPath(
      sparkles,
      Paint()
        ..color = const Color(0xcc39d6ff)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5),
    );
    // The parts, back to front: fill, then the bright outline.
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.1
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round
      ..shader = line;
    for (var i = 0; i < paths.length; i++) {
      final fill = _parts[i].$2;
      if (fill != 0) {
        canvas.drawPath(
          paths[i],
          Paint()
            ..shader = fill == null
                ? _faceShader(i == 0, paths[i].getBounds())
                : null
            ..color = Color(fill ?? 0xff000000),
        );
      }
      canvas.drawPath(paths[i], stroke);
    }
    canvas.drawPath(knot, Paint()..color = const Color(0xff3fdcff));
    canvas.drawPath(knot, stroke);
    canvas.drawPath(sparkles, Paint()..color = const Color(0xffb4f9ff));
    canvas.restore();
  }

  static Shader _faceShader(bool side, Rect r) => LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: side
        ? const [Color(0xff0d1838), Color(0xff24104f)]
        : const [Color(0xff0b2747), Color(0xff050c1d)],
  ).createShader(r);

  /// A 4-point sparkle centred on (x, y).
  static Path _sparkle(double x, double y, double r) {
    final k = r * .16;
    return Path()
      ..moveTo(x, y - r)
      ..quadraticBezierTo(x + k, y - k, x + r, y)
      ..quadraticBezierTo(x + k, y + k, x, y + r)
      ..quadraticBezierTo(x - k, y + k, x - r, y)
      ..quadraticBezierTo(x - k, y - k, x, y - r)
      ..close();
  }

  /// The few SVG path commands the gift uses (absolute M L H V Q C Z).
  static Path _svgPath(String d) {
    final path = Path();
    final tokens = RegExp(
      r'[A-Z]|-?\d*\.?\d+',
    ).allMatches(d).map((m) => m[0]!).toList();
    var i = 0;
    var cmd = '';
    var x = 0.0, y = 0.0;
    double n() => double.parse(tokens[i++]);
    while (i < tokens.length) {
      if (RegExp(r'^[A-Z]$').hasMatch(tokens[i])) cmd = tokens[i++];
      switch (cmd) {
        case 'M':
          x = n();
          y = n();
          path.moveTo(x, y);
          cmd = 'L';
        case 'L':
          x = n();
          y = n();
          path.lineTo(x, y);
        case 'H':
          x = n();
          path.lineTo(x, y);
        case 'V':
          y = n();
          path.lineTo(x, y);
        case 'Q':
          final x1 = n(), y1 = n();
          x = n();
          y = n();
          path.quadraticBezierTo(x1, y1, x, y);
        case 'C':
          final x1 = n(), y1 = n(), x2 = n(), y2 = n();
          x = n();
          y = n();
          path.cubicTo(x1, y1, x2, y2, x, y);
        case 'Z':
          path.close();
          cmd = '';
        default:
          i++;
      }
    }
    return path;
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
