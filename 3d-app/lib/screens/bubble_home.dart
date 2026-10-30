import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart' show DragStartBehavior;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_controller.dart';
import '../widgets/notification_bell.dart';
import '../widgets/ui.dart';
import 'create_home.dart' show artworkTo3dFlow;
import 'team.dart' show TeamScreen;

/// The phone home as ONE interactive glass bubble (client 2026-10-30, the
/// HB1 pictures): AI, DYO, ARTBOARD, TEAM and TO 3D sit on one glowing
/// teal-blue glass. Touch and drag towards one: the glass stretches to the
/// finger with a light trail, the option lights up with its full name and
/// "Release to enter"; release opens it after a short glass expansion. Drag
/// back to the centre or release outside to cancel. A tap, a mouse click,
/// hover and the keyboard (arrows + Enter) work too. "Classic view" switches
/// back to the tile home ([onSwitchToClassic]).
class BubbleHomeScreen extends StatefulWidget {
  const BubbleHomeScreen(this.c, {super.key, required this.onSwitchToClassic});
  final AppController c;
  final VoidCallback onSwitchToClassic;

  @override
  State<BubbleHomeScreen> createState() => _BubbleHomeScreenState();
}

/// One destination on the glass: [at] is its centre and [box] its size, as
/// fractions of the glass area; [art] is cropped from the client's picture.
class _Spot {
  const _Spot(
    this.id,
    this.word,
    this.name,
    this.art,
    this.at,
    this.box, {
    required this.wordSize,
    required this.artWidth,
    this.stars = false,
  });
  final String id, word, name, art;
  final Offset at;
  final Size box;
  final double wordSize, artWidth;

  /// AI's small star cluster beside the jersey.
  final bool stars;
}

const _spots = [
  _Spot(
    'ai',
    'AI',
    'AI DESIGNER',
    'assets/images/art/bubble_dyo.webp',
    Offset(.29, .25),
    Size(.48, .30),
    wordSize: 64,
    artWidth: 140,
    stars: true,
  ),
  _Spot(
    'dyo',
    'DYO',
    'DESIGN YOUR OWN',
    'assets/images/art/bubble_dyo.webp',
    Offset(.73, .33),
    Size(.40, .27),
    wordSize: 56,
    artWidth: 140,
  ),
  _Spot(
    'artboard',
    'ARTBOARD',
    'ARTBOARD',
    'assets/images/art/bubble_pen.webp',
    Offset(.24, .72),
    Size(.38, .19),
    wordSize: 34,
    artWidth: 74,
  ),
  _Spot(
    'team',
    'TEAM',
    'DESIGN TEAM',
    'assets/images/art/bubble_team.webp',
    Offset(.5, .835),
    Size(.32, .17),
    wordSize: 36,
    artWidth: 104,
  ),
  _Spot(
    'to3d',
    'TO 3D',
    'ARTWORK TO 3D',
    'assets/images/art/bubble_cube.webp',
    Offset(.77, .72),
    Size(.32, .19),
    wordSize: 36,
    artWidth: 74,
  ),
];

const _cyan = Color(0xff3fd4ff);

class _BubbleHomeScreenState extends State<BubbleHomeScreen>
    with TickerProviderStateMixin {
  // The slow float at rest, the spring back after a cancel, and the
  // ~300 ms glass expansion before a destination opens.
  late final AnimationController _float = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 10),
  );
  late final AnimationController _spring = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 520),
  );
  late final AnimationController _open = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 300),
  );
  final _focus = FocusNode(debugLabel: 'bubble-home');

  Size _area = Size.zero;
  Offset? _start, _finger, _hover;
  Offset _pullAt = Offset.zero;
  int? _sel, _hoverSel, _key, _opening;
  bool _reduce = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (_reduce) {
      _float.stop();
    } else if (!_float.isAnimating) {
      _float.repeat();
    }
  }

  @override
  void dispose() {
    _float.dispose();
    _spring.dispose();
    _open.dispose();
    _focus.dispose();
    super.dispose();
  }

  // ---- geometry -----------------------------------------------------------

  Offset _centreOf(int i) =>
      Offset(_spots[i].at.dx * _area.width, _spots[i].at.dy * _area.height);

  Rect _boxOf(int i) => Rect.fromCenter(
    center: _centreOf(i),
    width: _spots[i].box.width * _area.width,
    height: _spots[i].box.height * _area.height,
  );

  double get _reach => _area.shortestSide * .21;

  /// The option under [p], within [scale] × its activation radius (nearest
  /// wins); none near the centre of the glass.
  int? _hit(Offset p, {double scale = 1}) {
    final mid = _area.center(Offset.zero);
    if ((p - mid).distance < _area.shortestSide * .13) return null;
    int? best;
    var bestD = double.infinity;
    for (var i = 0; i < _spots.length; i++) {
      final d = (p - _centreOf(i)).distance;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best == null) return null;
    final inBox = _boxOf(best).deflate(4).contains(p);
    return bestD < _reach * scale || inBox ? best : null;
  }

  // ---- opening --------------------------------------------------------------

  void _go(int i) {
    final c = widget.c;
    switch (_spots[i].id) {
      case 'ai':
        c.startAi();
      case 'dyo':
        c.startDyo();
      case 'artboard':
        c.go(AppScreen.artboard);
      case 'team':
        Navigator.of(
          context,
        ).push(MaterialPageRoute<void>(builder: (_) => TeamScreen(c)));
      default:
        artworkTo3dFlow(context, c);
    }
  }

  Future<void> _enter(int i) async {
    if (_opening != null) return;
    setState(() {
      _opening = i;
      _sel = i;
    });
    HapticFeedback.selectionClick();
    _open.duration = Duration(milliseconds: _reduce ? 200 : 300);
    await _open.forward(from: 0);
    if (!mounted) return;
    _go(i);
    // A sheet or a pushed page leaves the home underneath: settle at rest.
    if (!mounted) return;
    setState(() {
      _opening = _sel = null;
      _start = _finger = null;
    });
    _open.value = 0;
    _spring.value = 0;
  }

  // ---- touch, mouse and keyboard ----------------------------------------

  void _panStart(DragStartDetails d) {
    if (_opening != null) return;
    _spring.stop();
    setState(() {
      _start = d.localPosition;
      _finger = d.localPosition;
      _pullAt = d.localPosition;
      _sel = _hit(d.localPosition);
    });
    _spring.value = 1;
  }

  void _panUpdate(DragUpdateDetails d) {
    if (_opening != null || _start == null) return;
    final sel = _hit(d.localPosition);
    if (sel != null && sel != _sel) HapticFeedback.selectionClick();
    setState(() {
      _finger = d.localPosition;
      _pullAt = d.localPosition;
      _sel = sel;
    });
  }

  void _panEnd([DragEndDetails? _]) {
    if (_opening != null) return;
    final sel = _sel;
    setState(() {
      _start = _finger = null;
    });
    if (sel != null) {
      _enter(sel);
    } else {
      // Cancel: the glass springs back to rest.
      setState(() => _sel = null);
      if (_reduce) {
        _spring.value = 0;
      } else {
        _spring.animateBack(0, curve: Curves.elasticOut);
      }
    }
  }

  void _onHover(PointerHoverEvent e) {
    if (_opening != null) return;
    final h = _hit(e.localPosition, scale: 1.25);
    if (h == _hoverSel && _hover == e.localPosition) return;
    setState(() {
      _hover = e.localPosition;
      _hoverSel = h;
    });
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent e) {
    if (e is! KeyDownEvent && e is! KeyRepeatEvent) {
      return KeyEventResult.ignored;
    }
    final k = e.logicalKey;
    if (k == LogicalKeyboardKey.enter ||
        k == LogicalKeyboardKey.numpadEnter ||
        k == LogicalKeyboardKey.space) {
      _enter(_key ?? 0);
      return KeyEventResult.handled;
    }
    final dir = switch (k) {
      LogicalKeyboardKey.arrowLeft => const Offset(-1, 0),
      LogicalKeyboardKey.arrowRight => const Offset(1, 0),
      LogicalKeyboardKey.arrowUp => const Offset(0, -1),
      LogicalKeyboardKey.arrowDown => const Offset(0, 1),
      _ => null,
    };
    if (dir == null) return KeyEventResult.ignored;
    final from = _key;
    if (from == null) {
      setState(() => _key = 0);
      return KeyEventResult.handled;
    }
    int? best;
    var bestScore = double.infinity;
    for (var i = 0; i < _spots.length; i++) {
      if (i == from) continue;
      final d = _centreOf(i) - _centreOf(from);
      final along = d.dx * dir.dx + d.dy * dir.dy;
      if (along <= 1) continue;
      final across = (d.dx * dir.dy - d.dy * dir.dx).abs();
      final score = along + across * 2;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best != null) setState(() => _key = best);
    return KeyEventResult.handled;
  }

  // ---- build ------------------------------------------------------------

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Expanded(
        child: Stack(
          children: [
            const Positioned.fill(child: _Backdrop()),
            Column(
              children: [
                const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: SizedBox(
                    height: 52,
                    child: LayoutBuilder(
                      builder: (context, box) => Stack(
                        alignment: Alignment.center,
                        children: [
                          BrandLogo(width: math.min(box.maxWidth * .52, 230)),
                          Positioned(
                            right: 0,
                            child: NotificationBell(widget.c),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                // The way back to the tile home, small and readable.
                Padding(
                  padding: const EdgeInsets.fromLTRB(10, 2, 10, 0),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: _ClassicButton(onTap: widget.onSwitchToClassic),
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(10, 2, 10, 8),
                    child: LayoutBuilder(
                      builder: (context, box) => _glass(box.biggest),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      BottomNav(controller: widget.c),
    ],
  );

  Widget _glass(Size s) {
    _area = s;
    final lit = _opening ?? _sel ?? _hoverSel;
    final pull = _reduce
        ? 0.0
        : _finger != null
        ? 1.0
        : math.max(
            _spring.value,
            _hover == null ? 0.0 : (_hoverSel != null ? .45 : .18),
          );
    final pullAt = _finger ?? _hover ?? _pullAt;
    final keyRing = _focus.hasFocus && _key != null ? _key : null;
    final labelFor = _opening ?? _sel;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Positioned.fill(
          child: Focus(
            focusNode: _focus,
            onFocusChange: (f) => setState(() {
              if (f) _key ??= 0;
            }),
            onKeyEvent: _onKey,
            child: MouseRegion(
              cursor: _hoverSel != null
                  ? SystemMouseCursors.click
                  : SystemMouseCursors.basic,
              onHover: _onHover,
              onExit: (_) => setState(() {
                _hover = null;
                _hoverSel = null;
              }),
              child: GestureDetector(
                key: const ValueKey('bubble-glass'),
                behavior: HitTestBehavior.opaque,
                excludeFromSemantics: true,
                dragStartBehavior: DragStartBehavior.down,
                onTapUp: (d) {
                  final i = _hit(d.localPosition, scale: 1.1);
                  if (i != null) _enter(i);
                },
                onPanStart: _panStart,
                onPanUpdate: _panUpdate,
                onPanEnd: _panEnd,
                onPanCancel: _panEnd,
                child: AnimatedBuilder(
                  animation: Listenable.merge([_float, _spring, _open]),
                  builder: (context, _) {
                    final t = _float.value;
                    final open = Curves.easeOutCubic.transform(_open.value);
                    final drift = _reduce
                        ? Offset.zero
                        : Offset(
                            math.sin(t * 2 * math.pi) * 3,
                            math.cos(t * 2 * math.pi) * 4,
                          );
                    final parallax = pull == 0
                        ? Offset.zero
                        : (pullAt - s.center(Offset.zero)) * (.05 * pull);
                    return CustomPaint(
                      painter: _GlassPainter(
                        t: _reduce ? 0 : t,
                        pullAt: pullAt,
                        pull: pull,
                        lit: lit == null ? null : _centreOf(lit),
                        litRadius: _reach * 1.05,
                        litStrong: labelFor != null,
                      ),
                      foregroundPainter: _TrailPainter(
                        start: _reduce ? null : _start,
                        finger: _finger,
                        target: labelFor == null ? null : _centreOf(labelFor),
                        open: open,
                        reduce: _reduce,
                        ring: keyRing == null ? null : _centreOf(keyRing),
                        ringRadius: _reach,
                      ),
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          // The large subtle 3DEEZI mark behind the glass,
                          // shifting slightly with the finger.
                          Positioned(
                            left: s.width * .18,
                            right: s.width * .18,
                            top: s.height * .36,
                            height: s.height * .24,
                            child: Transform.translate(
                              offset: drift + parallax,
                              child: Opacity(
                                opacity: labelFor != null ? .3 : .22,
                                child: Image.asset(
                                  'assets/images/emblem-final.png',
                                  fit: BoxFit.contain,
                                  color: const Color(0xffa6e8ff),
                                  colorBlendMode: BlendMode.srcIn,
                                  errorBuilder: (_, _, _) =>
                                      const SizedBox.shrink(),
                                ),
                              ),
                            ),
                          ),
                          for (var i = 0; i < _spots.length; i++)
                            _spotView(i, lit == i, drift),
                          if (labelFor == null)
                            Positioned(
                              left: 0,
                              right: 0,
                              top: s.height * .6 - 8,
                              child: const _DragHint(),
                            ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
        ),
        if (labelFor != null) _label(labelFor),
      ],
    );
  }

  Widget _spotView(int i, bool lit, Offset drift) {
    final sp = _spots[i];
    final box = _boxOf(i);
    final strong = (_opening ?? _sel) == i;
    // Each option floats a little on its own phase.
    final bob = _reduce
        ? Offset.zero
        : Offset(0, math.sin((_float.value + i * .17) * 2 * math.pi) * 2.5);
    // The lit option leans gently towards the finger.
    final lean = strong && _finger != null && !_reduce
        ? Offset.fromDirection(
            (_finger! - box.center).direction,
            math.min((_finger! - box.center).distance * .08, 8),
          )
        : Offset.zero;
    return Positioned.fromRect(
      rect: box,
      child: Semantics(
        button: true,
        label: sp.name,
        hint: 'Opens ${sp.name.toLowerCase()}',
        onTap: () => _enter(i),
        child: ExcludeSemantics(
          child: Transform.translate(
            key: ValueKey('bubble-spot-${sp.id}'),
            offset: bob + lean,
            child: AnimatedScale(
              scale: strong ? 1.08 : (lit ? 1.04 : 1),
              duration: Duration(milliseconds: _reduce ? 0 : 180),
              curve: Curves.easeOut,
              child: FittedBox(
                fit: BoxFit.contain,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _BrushWord(sp.word, size: sp.wordSize, lit: lit),
                    SizedBox(height: sp.wordSize * .02),
                    Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Padding(
                          padding: EdgeInsets.symmetric(
                            horizontal: sp.stars ? sp.artWidth * .2 : 0,
                          ),
                          child: Image.asset(
                            sp.art,
                            width: sp.artWidth,
                            fit: BoxFit.contain,
                            errorBuilder: (_, _, _) => SizedBox(
                              width: sp.artWidth,
                              height: sp.artWidth,
                            ),
                          ),
                        ),
                        if (sp.stars)
                          Positioned.fill(
                            child: CustomPaint(painter: _Stars(lit: lit)),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// "AI DESIGNER / Release to enter": under an upper option, over the
  /// centre of the glass for a lower one.
  Widget _label(int i) {
    final box = _boxOf(i);
    const w = 220.0;
    final upper = _spots[i].at.dy < .5;
    final top = upper ? box.bottom + 2 : _area.height * .5;
    final left = (box.center.dx - w / 2)
        .clamp(0.0, math.max(0.0, _area.width - w))
        .toDouble();
    return Positioned(
      left: upper ? left : (_area.width - w) / 2,
      top: top,
      width: w,
      child: IgnorePointer(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _spots[i].name,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 19,
                fontWeight: FontWeight.w800,
                letterSpacing: .6,
                shadows: [Shadow(color: _cyan, blurRadius: 14)],
              ),
            ),
            const SizedBox(height: 2),
            const Text(
              'Release to enter',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Color(0xffd8f6ff),
                fontSize: 14,
                fontWeight: FontWeight.w500,
                shadows: [Shadow(color: Colors.black54, blurRadius: 6)],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The dark navy page behind the glass.
class _Backdrop extends StatelessWidget {
  const _Backdrop();

  @override
  Widget build(BuildContext context) => const DecoratedBox(
    decoration: BoxDecoration(
      gradient: RadialGradient(
        center: Alignment(0, -.3),
        radius: 1.2,
        colors: [Color(0xff0a2547), Color(0xff051428), Color(0xff030a14)],
        stops: [0, .55, 1],
      ),
    ),
  );
}

/// Brush-style lettering: slanted, cyan-to-white, with a soft glow and a
/// faint dry-brush echo.
class _BrushWord extends StatelessWidget {
  const _BrushWord(this.text, {required this.size, required this.lit});
  final String text;
  final double size;
  final bool lit;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontFamily: 'Rajdhani',
      fontWeight: FontWeight.w700,
      fontSize: size,
      height: 1,
      letterSpacing: -size * .02,
    );
    final width = size * text.length * .62;
    return Transform(
      alignment: Alignment.center,
      transform: Matrix4.skewX(-.22),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // The dry-brush echo.
          Transform.translate(
            offset: Offset(-size * .06, size * .05),
            child: Text(
              text,
              style: style.copyWith(
                color: _cyan.withValues(alpha: lit ? .45 : .3),
              ),
            ),
          ),
          Text(
            text,
            style: style.copyWith(
              foreground: Paint()
                ..shader = ui.Gradient.linear(
                  Offset.zero,
                  Offset(width * .3, size),
                  [
                    Colors.white,
                    lit ? const Color(0xffbff4ff) : const Color(0xff7fe6ff),
                    const Color(0xff1aa6ff),
                  ],
                  [0, .45, 1],
                ),
              shadows: [
                Shadow(
                  color: _cyan.withValues(alpha: lit ? 1.0 : .75),
                  blurRadius: lit ? size * .45 : size * .28,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DragHint extends StatelessWidget {
  const _DragHint();

  @override
  Widget build(BuildContext context) => const IgnorePointer(
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.chevron_left, size: 18, color: _cyan),
        SizedBox(width: 6),
        Text(
          'DRAG TO EXPLORE',
          style: TextStyle(
            color: Color(0xffcdefff),
            fontSize: 11,
            fontWeight: FontWeight.w600,
            letterSpacing: 2.6,
          ),
        ),
        SizedBox(width: 6),
        Icon(Icons.chevron_right, size: 18, color: _cyan),
      ],
    ),
  );
}

/// AI's sparkles: four-pointed glowing stars around the jersey.
class _Stars extends CustomPainter {
  _Stars({required this.lit});
  final bool lit;

  static const _at = [
    (.07, .22, .13),
    (.15, .5, .08),
    (.05, .74, .07),
    (.9, .14, .1),
    (.95, .42, .07),
  ];

  @override
  void paint(Canvas canvas, Size s) {
    for (final (x, y, r) in _at) {
      final c = Offset(x * s.width, y * s.height);
      final o = r * s.width * .5, i = o * .26;
      final star = Path();
      for (var k = 0; k < 8; k++) {
        final rad = k.isEven ? o : i;
        final a = k * math.pi / 4 - math.pi / 2;
        final p = c + Offset.fromDirection(a, rad);
        k == 0 ? star.moveTo(p.dx, p.dy) : star.lineTo(p.dx, p.dy);
      }
      star.close();
      canvas.drawPath(
        star,
        Paint()
          ..color = _cyan.withValues(alpha: lit ? .95 : .7)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5),
      );
      canvas.drawPath(star, Paint()..color = const Color(0xffe8fbff));
    }
  }

  @override
  bool shouldRepaint(_Stars o) => o.lit != lit;
}

class _ClassicButton extends StatelessWidget {
  const _ClassicButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => TextButton.icon(
    key: const ValueKey('bubble-classic-view'),
    onPressed: onTap,
    style: TextButton.styleFrom(
      foregroundColor: const Color(0xffcdefff),
      backgroundColor: const Color(0xff06182c).withValues(alpha: .7),
      minimumSize: const Size(44, 30),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      visualDensity: VisualDensity.compact,
      shape: const StadiumBorder(side: BorderSide(color: Color(0x553fd4ff))),
      textStyle: TextStyle(
        fontFamily: DefaultTextStyle.of(context).style.fontFamily,
        fontSize: 12.5,
        fontWeight: FontWeight.w600,
      ),
    ),
    icon: const Icon(Icons.grid_view_rounded, size: 15),
    label: const Text('Classic view'),
  );
}

/// The glass: an organic rounded blob with a deep teal-blue body, a bright
/// glowing rim and soft reflections; its edge stretches towards [pullAt]
/// by [pull] (0–1) and floats with [t].
class _GlassPainter extends CustomPainter {
  _GlassPainter({
    required this.t,
    required this.pullAt,
    required this.pull,
    required this.lit,
    required this.litRadius,
    required this.litStrong,
  });
  final double t, pull, litRadius;
  final Offset pullAt;
  final Offset? lit;
  final bool litStrong;

  Path _blob(Size s) {
    final c = s.center(Offset.zero);
    final a = s.width / 2, b = s.height / 2;
    const n = 90;
    final ph = t * 2 * math.pi;
    final toward = pullAt - c;
    final dir = toward.direction;
    final pts = <Offset>[];
    for (var k = 0; k < n; k++) {
      final th = k / n * 2 * math.pi;
      final ct = math.cos(th), st = math.sin(th);
      // A rounded superellipse, a little fuller at the top left like the
      // client's picture, gently breathing.
      const e = 2 / 3.4;
      final x = a * ct.sign * math.pow(ct.abs(), e).toDouble();
      final y = b * st.sign * math.pow(st.abs(), e).toDouble();
      var f =
          .955 +
          .016 * math.sin(2 * th + ph) +
          .011 * math.sin(3 * th - 2 * ph + 1) +
          .006 * math.sin(5 * th + 3 * ph);
      var p = Offset(x, y) * f;
      if (pull > 0) {
        var diff = (p.direction - dir).abs();
        if (diff > math.pi) diff = 2 * math.pi - diff;
        final g = math.exp(-(diff * diff) / (2 * .42 * .42));
        final reach = (toward.distance / math.max(p.distance, 1)).clamp(
          0.0,
          1.2,
        );
        final bulge = pull * g * (6 + 22 * reach);
        // The far side gives a little, so the glass feels like one volume.
        final back = math.pi - diff;
        final give = pull * math.exp(-(back * back) / (2 * .5 * .5)) * 6;
        p = p + Offset.fromDirection(p.direction, bulge - give);
      }
      pts.add(c + p);
    }
    final path = Path()..moveTo(pts[0].dx, pts[0].dy);
    for (var i = 0; i < n; i++) {
      final p0 = pts[(i - 1 + n) % n], p1 = pts[i];
      final p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      final c1 = p1 + (p2 - p0) / 6, c2 = p2 - (p3 - p1) / 6;
      path.cubicTo(c1.dx, c1.dy, c2.dx, c2.dy, p2.dx, p2.dy);
    }
    return path..close();
  }

  @override
  void paint(Canvas canvas, Size s) {
    if (s.isEmpty) return;
    final path = _blob(s);
    final w = s.width, h = s.height;
    // Outer glow.
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 12
        ..color = const Color(0xff1ab8ff).withValues(alpha: .55)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 18),
    );
    // The glass body: deep teal-blue, lighter up top.
    canvas.drawPath(
      path,
      Paint()
        ..shader = ui.Gradient.radial(
          Offset(w * .42, h * .34),
          math.max(w, h) * .75,
          const [Color(0xf41c78ea), Color(0xf40b48c2), Color(0xf4062a80)],
          const [0, .55, 1],
        ),
    );
    canvas.save();
    canvas.clipPath(path);
    // Inner rim light: the glass glows along its edge.
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 34
        ..color = const Color(0xff36c8ff).withValues(alpha: .55)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 20),
    );
    // Soft sheen and reflections.
    canvas.drawRect(
      Offset.zero & s,
      Paint()
        ..shader = ui.Gradient.radial(Offset(w * .3, h * .16), w * .55, [
          Colors.white.withValues(alpha: .16),
          Colors.white.withValues(alpha: 0),
        ]),
    );
    canvas.save();
    canvas.translate(w * .2, h * .085);
    canvas.rotate(-.55);
    canvas.drawOval(
      Rect.fromCenter(center: Offset.zero, width: w * .34, height: h * .03),
      Paint()
        ..color = Colors.white.withValues(alpha: .32)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 7),
    );
    canvas.restore();
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(w * .86, h * .9),
        width: w * .3,
        height: h * .05,
      ),
      Paint()
        ..color = const Color(0xff8fe9ff).withValues(alpha: .16)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12),
    );
    // The lit option: a brighter pocket of glass with a glowing ring.
    final l = lit;
    if (l != null) {
      canvas.drawCircle(
        l,
        litRadius * 1.5,
        Paint()
          ..shader = ui.Gradient.radial(l, litRadius * 1.5, [
            const Color(0xff7fe3ff).withValues(alpha: litStrong ? .5 : .28),
            const Color(0xff3fbfff).withValues(alpha: 0),
          ]),
      );
      canvas.drawCircle(
        l,
        litRadius,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = litStrong ? 5 : 3
          ..color = _cyan.withValues(alpha: litStrong ? .8 : .45)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
      );
      canvas.drawCircle(
        l,
        litRadius,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.2
          ..color = Colors.white.withValues(alpha: litStrong ? .75 : .35),
      );
    }
    canvas.restore();
    // The bright rim.
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..color = const Color(0xff9beeff).withValues(alpha: .85)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2),
    );
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.1
        ..color = Colors.white.withValues(alpha: .8),
    );
  }

  @override
  bool shouldRepaint(_GlassPainter o) =>
      o.t != t ||
      o.pull != pull ||
      o.pullAt != pullAt ||
      o.lit != lit ||
      o.litStrong != litStrong ||
      o.litRadius != litRadius;
}

/// Over the options: the light trail from the touch point to the finger,
/// the keyboard focus ring and the opening glass expansion.
class _TrailPainter extends CustomPainter {
  _TrailPainter({
    required this.start,
    required this.finger,
    required this.target,
    required this.open,
    required this.reduce,
    required this.ring,
    required this.ringRadius,
  });
  final Offset? start, finger, target, ring;
  final double open, ringRadius;
  final bool reduce;

  @override
  void paint(Canvas canvas, Size s) {
    final a = start, b = finger;
    if (a != null && b != null && (b - a).distance > 6) {
      final d = b - a;
      final mid = a + d / 2;
      final normal = Offset(-d.dy, d.dx) / d.distance;
      final ctrl = mid + normal * (d.distance * .22);
      final trail = Path()
        ..moveTo(a.dx, a.dy)
        ..quadraticBezierTo(ctrl.dx, ctrl.dy, b.dx, b.dy);
      canvas.drawPath(
        trail,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 12
          ..strokeCap = StrokeCap.round
          ..color = _cyan.withValues(alpha: .35)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 9),
      );
      canvas.drawPath(
        trail,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3
          ..strokeCap = StrokeCap.round
          ..shader = ui.Gradient.linear(a, b, [
            _cyan.withValues(alpha: .25),
            Colors.white,
          ]),
      );
      // The touch ring where the drag began.
      canvas.drawCircle(
        a,
        17,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 6
          ..color = _cyan.withValues(alpha: .6)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 7),
      );
      canvas.drawCircle(
        a,
        17,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.5
          ..color = Colors.white.withValues(alpha: .9),
      );
      // The glowing tip under the finger.
      canvas.drawCircle(
        b,
        14,
        Paint()
          ..color = _cyan.withValues(alpha: .7)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
      );
      canvas.drawCircle(b, 5.5, Paint()..color = Colors.white);
    }
    final r = ring;
    if (r != null) {
      canvas.drawCircle(
        r,
        ringRadius,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 6
          ..color = _cyan.withValues(alpha: .55)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5),
      );
      canvas.drawCircle(
        r,
        ringRadius,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.5
          ..color = Colors.white,
      );
    }
    if (open > 0) {
      if (reduce || target == null) {
        // Reduced motion: a simple fade.
        canvas.drawRect(
          Offset.zero & s,
          Paint()..color = const Color(0xff9fe6ff).withValues(alpha: .7 * open),
        );
      } else {
        // The glass expands from the chosen option over the screen.
        final o = target!;
        final far = [
          Offset.zero,
          Offset(s.width, 0),
          Offset(0, s.height),
          Offset(s.width, s.height),
        ].map((p) => (p - o).distance).reduce(math.max);
        final rad = far * open + 1;
        canvas.drawCircle(
          o,
          rad,
          Paint()
            ..shader = ui.Gradient.radial(
              o,
              rad,
              [
                Colors.white.withValues(alpha: .9 * open),
                const Color(0xff5fd8ff).withValues(alpha: .75 * open),
                const Color(0xff1478d4).withValues(alpha: .6 * open),
              ],
              const [0, .6, 1],
            ),
        );
      }
    }
  }

  @override
  bool shouldRepaint(_TrailPainter o) =>
      o.start != start ||
      o.finger != finger ||
      o.target != target ||
      o.open != open ||
      o.ring != ring ||
      o.reduce != reduce ||
      o.ringRadius != ringRadius;
}
