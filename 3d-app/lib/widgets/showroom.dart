import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'ui.dart';

/// The 3DEEZI emblem spinning inside glowing orbit rings with travelling
/// sparks: the "creating your design" loader.
class EmblemLoader extends StatefulWidget {
  const EmblemLoader({super.key, this.size = 230});
  final double size;

  @override
  State<EmblemLoader> createState() => _EmblemLoaderState();
}

class _EmblemLoaderState extends State<EmblemLoader>
    with SingleTickerProviderStateMixin {
  late final AnimationController _t = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 12),
  )..repeat();

  @override
  void dispose() {
    _t.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox.square(
    dimension: widget.size,
    child: AnimatedBuilder(
      animation: _t,
      builder: (context, _) {
        final v = _t.value;
        // The emblem turns once every 2.4 s and rests briefly between turns.
        final spin = ((v * 5) % 1 / .6).clamp(0.0, 1.0);
        return Stack(
          alignment: Alignment.center,
          children: [
            CustomPaint(
              size: Size.square(widget.size),
              painter: _OrbitPainter(v),
            ),
            Transform(
              alignment: Alignment.center,
              transform: Matrix4.identity()
                ..setEntry(3, 2, .0018)
                ..rotateY(Curves.easeInOut.transform(spin) * 2 * math.pi),
              child: Container(
                width: widget.size * .46,
                decoration: BoxDecoration(
                  boxShadow: [
                    BoxShadow(
                      color: Palette.cyan.withValues(alpha: .35),
                      blurRadius: 30,
                    ),
                  ],
                ),
                child: Image.asset('assets/images/emblem-final.png'),
              ),
            ),
          ],
        );
      },
    ),
  );
}

class _OrbitPainter extends CustomPainter {
  _OrbitPainter(this.t);
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2;
    void arc(double radius, double start, double sweep, Color color, double w) {
      canvas.drawArc(
        Rect.fromCircle(center: c, radius: radius),
        start,
        sweep,
        false,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = w
          ..strokeCap = StrokeCap.round
          ..maskFilter = const MaskFilter.blur(BlurStyle.solid, 3),
      );
    }

    final a = t * 2 * math.pi;
    // Faint full rings, then bright arcs turning in opposite directions.
    canvas.drawCircle(
      c,
      r * .92,
      Paint()
        ..color = Palette.cyan.withValues(alpha: .14)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    arc(r * .86, a * 3.7, 1.9, Palette.cyan.withValues(alpha: .85), 2.5);
    arc(r * .86, a * 3.7 + math.pi, .9, Palette.cyan.withValues(alpha: .35), 2);
    arc(r * .7, -a * 5.4, 1.3, const Color(0xcc7560ff), 2.2);
    arc(r * .7, -a * 5.4 + math.pi, 1.1, const Color(0x8836e3ee), 2);
    final glow = Paint()
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5);
    for (final (radius, speed, color) in [
      (r * .86, 3.7, Palette.cyan),
      (r * .7, -5.4, const Color(0xffa99bff)),
      (r * .97, 1.6, const Color(0xff36e3ee)),
    ]) {
      final p = c + Offset.fromDirection(a * speed, radius);
      canvas.drawCircle(p, 6, glow..color = color.withValues(alpha: .7));
      canvas.drawCircle(p, 3, Paint()..color = color);
    }
  }

  @override
  bool shouldRepaint(_OrbitPainter old) => old.t != t;
}

/// The floodlit stadium behind the showroom screens.
class StageBackground extends StatelessWidget {
  const StageBackground({super.key, required this.child, this.dim = false});
  final Widget child;
  final bool dim;

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      Image.asset(
        'assets/images/showroom/stadium-stage.webp',
        fit: BoxFit.cover,
        alignment: const Alignment(0, .35),
        color: dim ? const Color(0x99000000) : null,
        colorBlendMode: dim ? BlendMode.darken : null,
      ),
      const DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xee040a12),
              Color(0x55040a12),
              Color(0x00040a12),
              Color(0xcc040a12),
            ],
            stops: [0, .28, .6, 1],
          ),
        ),
      ),
      child,
    ],
  );
}

/// A glowing cyan rule, the thicker "hairline" used across the app.
class GlowLine extends StatelessWidget {
  const GlowLine({super.key});

  @override
  Widget build(BuildContext context) => Container(
    height: 2,
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        colors: [
          Color(0x0000d9ed),
          Palette.cyan,
          Color(0xff36e3ee),
          Color(0xff7560ff),
          Color(0x007560ff),
        ],
      ),
      boxShadow: [
        BoxShadow(color: Palette.cyan.withValues(alpha: .6), blurRadius: 10),
      ],
    ),
  );
}

/// Hue ring around a saturation/brightness disc, a brightness slider, hex
/// entry and recent colours. [onChanged] fires while dragging; [onDone] once
/// a pick is finished (one undo step).
class ColorWheel extends StatefulWidget {
  const ColorWheel({
    super.key,
    required this.color,
    required this.onChanged,
    this.onDone,
  });
  final Color color;
  final ValueChanged<Color> onChanged;
  final ValueChanged<Color>? onDone;

  /// Shared across the session, newest first.
  static final List<Color> recent = [];

  @override
  State<ColorWheel> createState() => _ColorWheelState();
}

class _ColorWheelState extends State<ColorWheel> {
  late HSVColor _hsv = HSVColor.fromColor(widget.color);
  late final _hex = TextEditingController(text: _hexOf(widget.color));
  bool? _ring;
  final _key = GlobalKey();

  static String _hexOf(Color c) =>
      c.toARGB32().toRadixString(16).padLeft(8, '0').substring(2).toUpperCase();

  @override
  void didUpdateWidget(ColorWheel old) {
    super.didUpdateWidget(old);
    if (_ring == null && widget.color.toARGB32() != _hsv.toColor().toARGB32()) {
      _hsv = HSVColor.fromColor(widget.color);
      _hex.text = _hexOf(widget.color);
    }
  }

  @override
  void dispose() {
    _hex.dispose();
    super.dispose();
  }

  void _emit(HSVColor next) {
    setState(() => _hsv = next);
    final color = next.toColor();
    _hex.text = _hexOf(color);
    widget.onChanged(color);
  }

  void _done() {
    final color = _hsv.toColor();
    ColorWheel.recent
      ..removeWhere((c) => c.toARGB32() == color.toARGB32())
      ..insert(0, color);
    if (ColorWheel.recent.length > 7) ColorWheel.recent.removeLast();
    widget.onDone?.call(color);
    setState(() {});
  }

  void _pick(Offset local, Size size, {bool start = false}) {
    final c = size.center(Offset.zero);
    final d = local - c;
    final r = size.width / 2;
    if (start) _ring = d.distance > r * .78;
    if (_ring == true) {
      _emit(_hsv.withHue((math.atan2(d.dy, d.dx) * 180 / math.pi + 450) % 360));
    } else {
      // The disc: saturation left to right, brightness bottom to top.
      final disc = r * .66;
      _emit(
        _hsv
            .withSaturation(((d.dx + disc) / (2 * disc)).clamp(0, 1))
            .withValue((1 - (d.dy + disc) / (2 * disc)).clamp(0, 1)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final hue = HSVColor.fromAHSV(1, _hsv.hue, 1, 1).toColor();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: AspectRatio(
                aspectRatio: 1,
                child: LayoutBuilder(
                  builder: (context, box) {
                    final size = box.biggest;
                    final r = size.width / 2;
                    final ring = Offset.fromDirection(
                      (_hsv.hue - 90) * math.pi / 180,
                      r * .89,
                    );
                    final disc = r * .66;
                    final dot = Offset(
                      (_hsv.saturation * 2 - 1) * disc,
                      ((1 - _hsv.value) * 2 - 1) * disc,
                    );
                    return GestureDetector(
                      key: _key,
                      onPanStart: (e) =>
                          _pick(e.localPosition, size, start: true),
                      onPanUpdate: (e) => _pick(e.localPosition, size),
                      onPanEnd: (_) {
                        _ring = null;
                        _done();
                      },
                      onTapDown: (e) =>
                          _pick(e.localPosition, size, start: true),
                      onTapUp: (_) {
                        _ring = null;
                        _done();
                      },
                      child: Stack(
                        children: [
                          Positioned.fill(
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                gradient: const SweepGradient(
                                  transform: GradientRotation(-math.pi / 2),
                                  colors: [
                                    Color(0xffff0000),
                                    Color(0xffffff00),
                                    Color(0xff00ff00),
                                    Color(0xff00ffff),
                                    Color(0xff0000ff),
                                    Color(0xffff00ff),
                                    Color(0xffff0000),
                                  ],
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: Palette.cyan.withValues(alpha: .25),
                                    blurRadius: 18,
                                  ),
                                ],
                              ),
                            ),
                          ),
                          Positioned.fill(
                            child: Padding(
                              padding: EdgeInsets.all(r * .22),
                              child: const DecoratedBox(
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: Palette.surface,
                                ),
                              ),
                            ),
                          ),
                          Positioned.fill(
                            child: Padding(
                              padding: EdgeInsets.all(r - disc),
                              child: ClipOval(
                                child: DecoratedBox(
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(
                                      colors: [Colors.white, hue],
                                    ),
                                  ),
                                  child: const DecoratedBox(
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        begin: Alignment.topCenter,
                                        end: Alignment.bottomCenter,
                                        colors: [
                                          Color(0x00000000),
                                          Colors.black,
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          _handle(size.center(ring), hue, 24),
                          _handle(size.center(dot), _hsv.toColor(), 20),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ),
            const SizedBox(width: 12),
            SizedBox(
              height: 200,
              child: RotatedBox(
                quarterTurns: 3,
                child: SliderTheme(
                  data: SliderThemeData(
                    trackHeight: 10,
                    activeTrackColor: hue,
                    inactiveTrackColor: Colors.black,
                    thumbColor: Colors.white,
                    overlayShape: SliderComponentShape.noOverlay,
                  ),
                  child: Slider(
                    value: _hsv.value,
                    onChanged: (v) => _emit(_hsv.withValue(v)),
                    onChangeEnd: (_) => _done(),
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: _hsv.toColor(),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white24, width: 1.5),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextField(
                controller: _hex,
                maxLength: 6,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp('[0-9a-fA-F]')),
                ],
                style: const TextStyle(fontFamily: 'monospace', fontSize: 15),
                decoration: const InputDecoration(
                  prefixText: '#  ',
                  counterText: '',
                  labelText: 'HEX',
                ),
                onChanged: (text) {
                  if (text.length != 6) return;
                  final color = Color(0xff000000 | int.parse(text, radix: 16));
                  setState(() => _hsv = HSVColor.fromColor(color));
                  widget.onChanged(color);
                },
                onSubmitted: (_) => _done(),
              ),
            ),
          ],
        ),
        if (ColorWheel.recent.isNotEmpty) ...[
          const SizedBox(height: 14),
          const Text(
            'RECENT COLOURS',
            style: TextStyle(
              fontSize: 10.5,
              letterSpacing: 1.6,
              color: Palette.muted,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              for (final color in ColorWheel.recent)
                GestureDetector(
                  onTap: () {
                    _emit(HSVColor.fromColor(color));
                    _done();
                  },
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white38, width: 2),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _handle(Offset at, Color color, double size) => Positioned(
    left: at.dx - size / 2,
    top: at.dy - size / 2,
    child: IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 3),
          boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 6)],
        ),
      ),
    ),
  );
}
