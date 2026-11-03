import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart' show DragStartBehavior;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app_controller.dart';
import '../widgets/notification_bell.dart';
import '../widgets/ui.dart';
import 'create_home.dart' show artworkTo3dFlow;
import 'team.dart' show TeamScreen;

part 'bubble_tutorial.dart';

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
/// fractions of the glass area. The five sit evenly round the centre "3"
/// (a pentagon). Each shows one clean icon (the real jersey art for AI and
/// DYO, a crisp glass badge for the others) and its [label] in one style.
class _Spot {
  const _Spot(
    this.id,
    this.name,
    this.label,
    this.at, {
    this.jersey,
    this.icon,
  });
  final String id, name, label;
  final Offset at;
  final String? jersey;
  final IconData? icon;
  Size get box => const Size(.36, .23);
}

const _spots = [
  _Spot(
    'ai',
    'AI DESIGNER',
    'AI',
    Offset(.5, .165),
    jersey: 'assets/images/art/bubble_jersey_ai.webp',
  ),
  _Spot(
    'dyo',
    'DESIGN YOUR OWN',
    'DYO',
    Offset(.8, .4),
    jersey: 'assets/images/art/bubble_jersey_dyo.webp',
  ),
  _Spot(
    'artboard',
    'ARTBOARD',
    'ARTBOARD',
    Offset(.2, .4),
    icon: Icons.draw_rounded,
  ),
  _Spot(
    'team',
    'DESIGN TEAM',
    'TEAM',
    Offset(.31, .775),
    icon: Icons.groups_rounded,
  ),
  _Spot(
    'to3d',
    'ARTWORK TO 3D',
    'TO 3D',
    Offset(.69, .775),
    icon: Icons.view_in_ar_rounded,
  ),
];

/// One option's face: its icon over its label. [glow] tints it all cyan
/// (the blurred glow behind a lit option).
class _SpotFace extends StatelessWidget {
  const _SpotFace(this.spot, {this.glow = false});
  final _Spot spot;
  final bool glow;

  @override
  Widget build(BuildContext context) {
    final Widget icon;
    if (spot.jersey != null) {
      icon = Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          Image.asset(
            spot.jersey!,
            fit: BoxFit.contain,
            filterQuality: FilterQuality.high,
            errorBuilder: (_, _, _) => const SizedBox.shrink(),
          ),
          if (spot.id == 'ai')
            const Positioned(
              right: 0,
              top: 0,
              child: Icon(
                Icons.auto_awesome,
                color: Color(0xffd8f8ff),
                size: 22,
                shadows: [Shadow(color: _cyan, blurRadius: 10)],
              ),
            ),
        ],
      );
    } else {
      icon = LayoutBuilder(
        builder: (context, b) {
          final d = math.min(b.maxWidth, b.maxHeight) * .74;
          return Center(
            child: Container(
              width: d,
              height: d,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const RadialGradient(
                  center: Alignment(-.35, -.45),
                  colors: [
                    Color(0xff2a77c9),
                    Color(0xff0c2f62),
                    Color(0xff071c3e),
                  ],
                  stops: [0, .55, 1],
                ),
                border: Border.all(color: const Color(0xcc5fdcff), width: 1.6),
                boxShadow: const [
                  BoxShadow(color: Color(0x6619b6ff), blurRadius: 14),
                ],
              ),
              child: Icon(
                spot.icon,
                size: d * .52,
                color: const Color(0xffe8fbff),
                shadows: const [Shadow(color: _cyan, blurRadius: 12)],
              ),
            ),
          );
        },
      );
    }
    final face = Column(
      children: [
        Expanded(child: icon),
        const SizedBox(height: 2),
        SizedBox(
          height: 26,
          child: FittedBox(
            child: Text(
              spot.label,
              style: const TextStyle(
                fontFamily: 'Rajdhani',
                fontWeight: FontWeight.w700,
                fontSize: 22,
                height: 1,
                letterSpacing: 1.2,
                color: Color(0xffe6f9ff),
                shadows: [Shadow(color: _cyan, blurRadius: 10)],
              ),
            ),
          ),
        ),
      ],
    );
    return glow
        ? ColorFiltered(
            colorFilter: const ColorFilter.mode(_cyan, BlendMode.srcIn),
            child: face,
          )
        : face;
  }
}

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

  /// The option the glass pocket forms around (kept while it fades out).
  int? _pocketIdx;
  bool _reduce = false;

  /// The first-visit tutorial: checked once, shown shortly after the home
  /// has settled (phones only).
  bool _tutorial = false, _tutorialChecked = false;
  Timer? _tutorialTimer;

  Future<void> _checkTutorial() async {
    final seen = await BubbleTutorial.seen();
    if (!mounted || seen != false) return;
    _tutorialTimer = Timer(const Duration(milliseconds: 900), () {
      if (mounted) setState(() => _tutorial = true);
    });
  }

  void _closeTutorial() {
    setState(() => _tutorial = false);
    BubbleTutorial.markSeen();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (_reduce) {
      _float.stop();
    } else if (!_float.isAnimating) {
      _float.repeat();
    }
    if (!_tutorialChecked) {
      _tutorialChecked = true;
      _checkTutorial();
    }
  }

  @override
  void dispose() {
    _tutorialTimer?.cancel();
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
  Widget build(BuildContext context) => Stack(
    children: [
      Positioned.fill(child: _home(context)),
      if (_tutorial)
        Positioned.fill(
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: 1),
            duration: Duration(milliseconds: _reduce ? 0 : 320),
            builder: (context, v, child) => Opacity(opacity: v, child: child),
            child: BubbleTutorial(onDone: _closeTutorial),
          ),
        ),
    ],
  );

  Widget _home(BuildContext context) => Column(
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
                    width: double
                        .infinity, // (full width: the bell sits in the corner, clear of the logo)
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
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(4, 0, 4, 4),
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
      // (The tab bar stretches and ripples with the finger: BottomNav, StretchyNav.)
      BottomNav(controller: widget.c),
    ],
  );

  Widget _glass(Size s) {
    _area = s;
    final lit = _opening ?? _sel ?? _hoverSel;
    if (lit != null) _pocketIdx = lit;
    // Read on every frame (inside the AnimatedBuilder), so the spring back
    // after a cancel really relaxes the glass.
    double pullNow() => _reduce
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
                child: TweenAnimationBuilder<double>(
                  tween: Tween(end: lit == null ? 0.0 : 1.0),
                  duration: Duration(milliseconds: _reduce ? 0 : 220),
                  curve: Curves.easeOutCubic,
                  builder: (context, pocket, _) => AnimatedBuilder(
                    animation: Listenable.merge([_float, _spring, _open]),
                    builder: (context, _) {
                      final t = _float.value;
                      final pull = pullNow();
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
                          pocketAt: _pocketIdx == null
                              ? null
                              : _centreOf(_pocketIdx!),
                          pocket: pocket,
                          pocketR: _pocketIdx == null
                              ? 0
                              : _boxOf(_pocketIdx!).longestSide * .5,
                          pocketStrong: labelFor != null,
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
                              left: s.width * .3,
                              right: s.width * .3,
                              top: s.height * .41,
                              height: s.height * .17,
                              child: Transform.translate(
                                offset: drift + parallax,
                                child: _GlassMark(bright: labelFor != null),
                              ),
                            ),
                            for (var i = 0; i < _spots.length; i++)
                              _spotView(i, lit == i, drift),
                            if (labelFor == null)
                              Positioned(
                                left: 0,
                                right: 0,
                                top: s.height * .615 - 8,
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
        ),
        // The way back to the tile home, in the glass's top-left corner.
        Positioned(
          left: 2,
          top: 0,
          child: _ClassicButton(onTap: widget.onSwitchToClassic),
        ),
        if (labelFor != null) _label(labelFor),
      ],
    );
  }

  Widget _spotView(int i, bool lit, Offset drift) {
    final sp = _spots[i];
    final box = _boxOf(i);
    final chosen = _opening ?? _sel;
    final strong = chosen == i;
    // While one option is chosen, the others step back so it clearly
    // brightens.
    final dim = chosen != null && !strong;
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
    final ms = Duration(milliseconds: _reduce ? 0 : 180);
    return Positioned.fromRect(
      rect: box,
      child: Semantics(
        container: true,
        button: true,
        label: sp.name,
        hint: 'Opens ${sp.name.toLowerCase()}',
        onTap: () => _enter(i),
        child: ExcludeSemantics(
          child: Transform.translate(
            key: ValueKey('bubble-spot-${sp.id}'),
            offset: bob + lean,
            child: AnimatedScale(
              scale: strong ? 1.1 : (lit ? 1.05 : (dim ? .96 : 1)),
              duration: ms,
              curve: Curves.easeOut,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // The cyan glow behind a lit option.
                  AnimatedOpacity(
                    opacity: strong ? 1 : (lit ? .65 : (dim ? 0 : .22)),
                    duration: ms,
                    child: ImageFiltered(
                      imageFilter: ui.ImageFilter.blur(sigmaX: 9, sigmaY: 9),
                      child: _SpotFace(sp, glow: true),
                    ),
                  ),
                  AnimatedOpacity(
                    opacity: dim ? .55 : 1,
                    duration: ms,
                    child: ColorFiltered(
                      colorFilter: _brightness(
                        strong ? 1.32 : (lit ? 1.16 : 1),
                      ),
                      child: _SpotFace(sp),
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

  /// Scales the colours by [k]; above 1 also lifts them towards white.
  static ColorFilter _brightness(double k) {
    final add = k > 1 ? (k - 1) * 60 : 0.0;
    return ColorFilter.matrix([
      k, 0, 0, 0, add, //
      0, k, 0, 0, add, //
      0, 0, k, 0, add, //
      0, 0, 0, 1, 0, //
    ]);
  }

  /// "AI DESIGNER / Release to enter", right next to its option: under an
  /// upper one, over a lower one.
  Widget _label(int i) {
    final box = _boxOf(i);
    const w = 220.0;
    final upper = _spots[i].at.dy < .5;
    final top = upper ? box.bottom + 2 : math.max(0.0, box.top - 60);
    final left = (box.center.dx - w / 2)
        .clamp(0.0, math.max(0.0, _area.width - w))
        .toDouble();
    return Positioned(
      left: left,
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

/// The big 3DEEZI mark behind the glass, made glassy: a soft blue glow, a
/// light-to-blue gradient body and a bright upper-left edge.
/// The big mark behind the glass: the real 3DEEZI emblem (brand asset,
/// 1456 x 904), unaltered, seen through the glass.
class _GlassMark extends StatelessWidget {
  const _GlassMark({required this.bright});
  final bool bright;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: AnimatedOpacity(
      opacity: bright ? .62 : .45,
      duration: const Duration(milliseconds: 200),
      child: Image.asset(
        'assets/images/emblem-final.png',
        fit: BoxFit.contain,
        filterQuality: FilterQuality.high,
        errorBuilder: (_, _, _) => const SizedBox.shrink(),
      ),
    ),
  );
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

//// The glass: an organic blob (a raised lobe at the top left, fuller
/// corners and a slightly pinched waist, like the client's picture) with a
/// deep navy body, soft glassy swirls and a thick bright cyan rim. Its edge
/// stretches towards [pullAt] by [pull] (0 to 1), floats with [t], and forms
/// a rounded pocket (its own lobe) around [pocketAt] by [pocket] (0 to 1).
class _GlassPainter extends CustomPainter {
  _GlassPainter({
    required this.t,
    required this.pullAt,
    required this.pull,
    required this.pocketAt,
    required this.pocket,
    required this.pocketR,
    required this.pocketStrong,
  });
  final double t, pull, pocket, pocketR;
  final Offset pullAt;
  final Offset? pocketAt;
  final bool pocketStrong;

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
    for (var k = 0; k < n; k++) {
      final th = k / n * 2 * math.pi;
      final ct = math.cos(th), st = math.sin(th);
      const e = 2 / 2.9;
      final x = a * ct.sign * math.pow(ct.abs(), e).toDouble();
      final y = b * st.sign * math.pow(st.abs(), e).toDouble();
      // A soft glass pillow, gently organic: a little fuller at the top
      // left and the lower corners, the sides drawn in a touch below the
      // middle, all gently breathing.
      var f =
          .97 +
          .012 * _bump(_ang(th, -2.15), .4) +
          .008 * _bump(_ang(th, 2.4), .45) -
          .012 * _bump(_ang(th, .12), .3) -
          .012 * _bump(_ang(th, math.pi - .05), .3) +
          // Small travelling ripples, like a real bubble's surface.
          .007 * math.sin(3 * th + ph) +
          .006 * math.sin(5 * th - 2 * ph + 1) +
          .005 * math.sin(7 * th + 3 * ph) +
          .004 * math.sin(9 * th - ph + 2) +
          .003 * math.sin(11 * th + 2 * ph);
      var p = Offset(x, y) * f;
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
        const m = 8.0;
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

    for (var i = 0; i + 1 < idx.length; i++) {
      final u = (i + .5) / (idx.length - 1);
      final env = math.sin(math.pi * u);
      final p = at(idx[i]), q = at(idx[i + 1]);
      canvas.drawLine(
        p,
        q,
        Paint()
          ..strokeWidth = width
          ..strokeCap = StrokeCap.round
          ..color = colour.withValues(alpha: alpha * env)
          ..maskFilter = blur > 0
              ? MaskFilter.blur(BlurStyle.normal, blur)
              : null,
      );
    }
  }

  @override
  void paint(Canvas canvas, Size s) {
    if (s.isEmpty) return;
    final path = _blob(s);
    final w = s.width, h = s.height;
    final c = s.center(Offset.zero);
    final ph = t * 2 * math.pi;
    // A soft glow around the glass.
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 18
        ..color = const Color(0xff19a8ff).withValues(alpha: .42)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 22),
    );
    // The body: dark and translucent, so the page and the 3 mark read
    // through it; a little bluer towards the edge where light gathers.
    canvas.drawPath(
      path,
      Paint()
        ..shader = ui.Gradient.radial(
          Offset(w * .5, h * .48),
          math.max(w, h) * .6,
          const [Color(0xc4020a18), Color(0xc8041431), Color(0xd8082a63)],
          const [0, .6, 1],
        ),
    );
    canvas.save();
    canvas.clipPath(path);
    // Faint folds drifting slowly in the glass.
    for (var i = 0; i < _swirls.length; i++) {
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
      canvas.drawPath(
        swirl,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeCap = StrokeCap.round
          ..strokeWidth = 1.4
          ..color = const Color(0xffb8eeff).withValues(alpha: strength * .45)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, .8),
      );
    }
    // Faint ripple rings echoing the wavy edge.
    for (var k = 0; k < 3; k++) {
      final sc = .9 - k * .1 + .008 * math.sin(ph + k);
      canvas.save();
      canvas.translate(c.dx, c.dy);
      canvas.scale(sc, sc);
      canvas.translate(-c.dx, -c.dy);
      canvas.drawPath(
        path,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.6 / sc
          ..color = const Color(0xff8fe2ff).withValues(alpha: .12 - k * .03)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.5),
      );
      canvas.restore();
    }
    // Light gathering inside the edge.
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 70
        ..color = const Color(0xff1a6fe0).withValues(alpha: .34)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 28),
    );
    // The wide glass edge, as on the other pages (client images/344): a
    // soft glowing cyan-blue band, lighter on its inner edge, and a glossy
    // highlight along the top inside edge.
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 16
        ..color = const Color(0xff2aa8ff).withValues(alpha: .55)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2.5),
    );
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 18
        ..color = const Color(0xffa8ecff).withValues(alpha: .55)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.2),
    );
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 14
        ..color = const Color(0xff1f8ff0).withValues(alpha: .6),
    );
    canvas.save();
    canvas.clipRect(Rect.fromLTWH(0, 0, w, math.min(h * .3, 90)));
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 24
        ..shader = ui.Gradient.linear(
          Offset.zero,
          Offset(0, math.min(h * .3, 90)),
          [
            Colors.white.withValues(alpha: .5),
            Colors.white.withValues(alpha: 0),
          ],
        )
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
    );
    canvas.restore();
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
    final o = pocketAt;
    if (o != null && pocket > 0) {
      final k = pocket * (pocketStrong ? 1 : .55);
      final r = pocketR;
      final out = o - c;
      final u = out / math.max(out.distance, 1);
      canvas.drawCircle(
        o,
        r * 1.2,
        Paint()
          ..shader = ui.Gradient.radial(
            o,
            r * 1.2,
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
          ..color = Colors.white.withValues(alpha: .7 * k)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.6),
      );
    }
    // Directional highlights: a long bright reflection round the top-left
    // corner, and a softer one at the bottom right.
    _streak(canvas, c, -3.0, -1.6, 10, 12, .38, 7, Colors.white);
    _streak(canvas, c, -2.85, -1.75, 9, 3.4, .95, 1.1, Colors.white);
    _streak(canvas, c, -1.45, -.95, 8, 2.2, .5, 1, const Color(0xffd8f7ff));
    _streak(canvas, c, .25, 1.15, 10, 8, .3, 6, const Color(0xff9fe8ff));
    _streak(canvas, c, .35, 1.0, 9, 2.4, .6, 1, const Color(0xffd8f7ff));
    canvas.restore();
    // The outer edge of the rim: a cyan light and a fine bright line.
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 6
        ..color = const Color(0xff36d0ff).withValues(alpha: .85)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3.5),
    );
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4
        ..color = const Color(0xffc4f5ff),
    );
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = Colors.white.withValues(alpha: .9),
    );
  }

  @override
  bool shouldRepaint(_GlassPainter o) =>
      o.t != t ||
      o.pull != pull ||
      o.pullAt != pullAt ||
      o.pocketAt != pocketAt ||
      o.pocket != pocket ||
      o.pocketR != pocketR ||
      o.pocketStrong != pocketStrong;
}

// Over the options: the light trail from the touch point to the finger,
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
    final a = start, f = finger;
    if (a != null && f != null) {
      // The arc runs from the touch point to the lit option (stopping just
      // inside it, so the arrow points into it), or to the finger.
      final t = target;
      var b = f;
      if (t != null && (t - a).distance > ringRadius) {
        final u = (t - a) / (t - a).distance;
        b = t - u * (ringRadius * .45);
      }
      final d = b - a;
      if (d.distance > 8) {
        final mid = a + d / 2;
        final normal = Offset(d.dy, -d.dx) / d.distance;
        final ctrl = mid + normal * (d.distance * .28);
        final trail = Path()
          ..moveTo(a.dx, a.dy)
          ..quadraticBezierTo(ctrl.dx, ctrl.dy, b.dx, b.dy);
        Paint line(double width, double blur) => Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = width
          ..strokeCap = StrokeCap.round
          ..maskFilter = blur > 0
              ? MaskFilter.blur(BlurStyle.normal, blur)
              : null;
        canvas.drawPath(
          trail,
          line(24, 14)..color = const Color(0xff19b6ff).withValues(alpha: .5),
        );
        canvas.drawPath(
          trail,
          line(8, 4)..color = _cyan.withValues(alpha: .85),
        );
        canvas.drawPath(
          trail,
          line(3.6, 0)
            ..shader = ui.Gradient.linear(a, b, [
              Colors.white.withValues(alpha: .55),
              Colors.white,
            ]),
        );
        // The arrow head, along the arc's direction at its end.
        final tan = b - ctrl;
        final u = tan / math.max(tan.distance, 1);
        final side = Offset(-u.dy, u.dx);
        final tip = b + u * 5;
        final base = b - u * 17;
        final head = Path()
          ..moveTo(tip.dx, tip.dy)
          ..lineTo((base + side * 11).dx, (base + side * 11).dy)
          ..lineTo((base - side * 11).dx, (base - side * 11).dy)
          ..close();
        canvas.drawPath(
          head,
          Paint()
            ..color = _cyan
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 7),
        );
        canvas.drawPath(head, Paint()..color = Colors.white);
      }
      // The touch point: a small glowing glass ball.
      canvas.drawCircle(
        a,
        24,
        Paint()
          ..color = _cyan.withValues(alpha: .55)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 14),
      );
      canvas.drawCircle(
        a,
        14,
        Paint()
          ..shader = ui.Gradient.radial(
            a + const Offset(-4, -5),
            17,
            const [
              Color(0xffffffff),
              Color(0xff9feaff),
              Color(0xff2aa8ff),
              Color(0xff0d5fc8),
            ],
            const [0, .25, .7, 1],
          ),
      );
      canvas.drawCircle(
        a,
        14,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.4
          ..color = const Color(0xffd8f8ff).withValues(alpha: .9),
      );
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
