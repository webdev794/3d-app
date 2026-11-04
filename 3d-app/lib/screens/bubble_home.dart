import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart' show DragStartBehavior;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app_controller.dart';
import '../assist.dart';
import '../widgets/bubble_page.dart' show BubbleAssistLink;
import '../widgets/glass_bubble.dart' show HomeGlassPainter;
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
    this.icon,
    this.art,
    this.box = const Size(.36, .23),
  });
  final String id, name, label;
  final Offset at;
  final IconData? icon;

  /// The client's painted picture (brush word + object). When it loads it
  /// replaces the icon and label; if it ever fails the icon face shows.
  final String? art;
  final Size box;
}

const _spots = [
  _Spot(
    'ai',
    'AI DESIGNER',
    'AI',
    Offset(.28, .29),
    box: Size(.42, .21),
    art: 'assets/images/art/home_ai.png',
  ),
  _Spot(
    'dyo',
    'DESIGN YOUR OWN',
    'DYO',
    Offset(.72, .29),
    box: Size(.42, .21),
    art: 'assets/images/art/home_dyo.png',
  ),
  _Spot(
    'artboard',
    'ARTBOARD',
    'ARTBOARD',
    Offset(.28, .515),
    art: 'assets/images/art/home_artboard.png',
    box: Size(.42, .21),
    icon: Icons.draw_rounded,
  ),
  _Spot(
    'team',
    'DESIGN TEAM',
    'TEAM',
    Offset(.72, .515),
    art: 'assets/images/art/home_team.png',
    box: Size(.42, .21),
    icon: Icons.groups_rounded,
  ),
  _Spot(
    'to3d',
    'ARTWORK TO 3D',
    'TO 3D',
    Offset(.5, .735),
    art: 'assets/images/art/home_to3d.png',
    box: Size(.42, .21),
    icon: Icons.view_in_ar_rounded,
  ),
];

/// One option's face: its icon over its label. [glow] tints it all cyan
/// (the blurred glow behind a lit option).
class _SpotFace extends StatelessWidget {
  const _SpotFace(this.spot, {this.glow = false, this.showName = true});
  final _Spot spot;
  final bool glow;

  /// Off while this option is chosen: the pop-up beside it shows the name.
  final bool showName;

  Widget _img(String path) => Image.asset(
    path,
    fit: BoxFit.contain,
    filterQuality: FilterQuality.high,
    errorBuilder: (_, _, _) => Icon(
      spot.icon ?? Icons.checkroom_rounded,
      size: 48,
      color: const Color(0xffe8fbff),
    ),
  );

  @override
  Widget build(BuildContext context) {
    // The client's own icon (with its pedestal); AI and DYO get their small
    // cyan word beside the jersey.
    final word = spot.id == 'ai' || spot.id == 'dyo';
    final Widget icon = !word
        ? _img(spot.art!)
        // The brush word sits on its own jersey (upper left for AI, upper
        // right for DYO), placed against the picture, not the bubble.
        : Center(
            child: AspectRatio(
              aspectRatio: 1.24,
              child: LayoutBuilder(
                builder: (context, b) {
                  final ww = b.maxWidth * (spot.id == 'ai' ? .34 : .44);
                  return Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Positioned.fill(child: _img(spot.art!)),
                      Positioned(
                        left: spot.id == 'ai' ? b.maxWidth * .02 : null,
                        right: spot.id == 'dyo' ? b.maxWidth * .0 : null,
                        top: -b.maxHeight * .08,
                        width: ww,
                        child: Image.asset(
                          'assets/images/art/home_word_${spot.id}.png',
                          fit: BoxFit.contain,
                          filterQuality: FilterQuality.high,
                          errorBuilder: (_, _, _) => const SizedBox.shrink(),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          );
    final face = Column(
      children: [
        Expanded(
          child: Stack(
            fit: StackFit.expand,
            children: [
              // (The pictures carry their own pedestals.)
              icon,
            ],
          ),
        ),
        const SizedBox(height: 3),
        SizedBox(
          height: 18,
          child: !showName
              ? null
              : FittedBox(
                  child: Text(
                    spot.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      height: 1,
                      letterSpacing: .5,
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
  bool _reduce = false, _artCached = false;

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
    if (!_artCached) {
      _artCached = true;
      for (final sp in _spots) {
        if (sp.art != null) {
          precacheImage(AssetImage(sp.art!), context, onError: (_, _) {});
        }
      }
    }
    if (!_tutorialChecked) {
      _tutorialChecked = true;
      _checkTutorial();
    }
  }

  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
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
                          BrandLogo(width: math.min(box.maxWidth * .56, 246)),
                          Positioned(
                            right: 0,
                            child: NotificationBell(widget.c),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                // The way back to the tile home, above the glass.
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 0),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Row(
                      children: [
                        _ClassicButton(onTap: widget.onSwitchToClassic),
                        const Spacer(),
                        _UpgradeButton(
                          onTap: () => widget.c.go(AppScreen.pricing),
                        ),
                      ],
                    ),
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.zero,
                    child: LayoutBuilder(
                      builder: (context, box) {
                        // A phone-shaped bubble on every screen: portrait,
                        // at most ~430 wide, centred (wide windows too).
                        // Portrait always: no wider than .75 x its height.
                        // Full width (phone width at most on wide
                        // windows); as tall as its content needs (at least
                        // the space), the page scrolls when it is longer.
                        final w = math.min(box.maxWidth, 600.0);
                        final h = math.max(box.maxHeight, w * 1.45);
                        // Drags on the glass stay the glass's (no drag
                        // scrolling); the page scrolls by wheel or the
                        // scrollbar when the window is short.
                        return ScrollConfiguration(
                          behavior: ScrollConfiguration.of(
                            context,
                          ).copyWith(dragDevices: const {}),
                          child: Scrollbar(
                            controller: _scroll,
                            thumbVisibility: h > box.maxHeight,
                            child: SingleChildScrollView(
                              controller: _scroll,
                              child: Center(
                                child: SizedBox(
                                  width: w,
                                  height: h,
                                  child: LayoutBuilder(
                                    builder: (context, b) => _glass(b.biggest),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      // (The tab bar stretches and ripples with the finger: BottomNav, StretchyNav.)
      ColoredBox(
        color: const Color(0xff050a14),
        child: BottomNav(controller: widget.c),
      ),
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
                      return CustomPaint(
                        painter: HomeGlassPainter(
                          t: _reduce ? 0 : t,
                          pullAt: pullAt,
                          pull: pull,
                          pocketAt: _pocketIdx == null
                              ? null
                              : _centreOf(_pocketIdx!),
                          pocket: pocket,
                          pocketR: _pocketIdx == null
                              ? 0
                              : () {
                                  // Just this option: its average half-side,
                                  // so a wide picture (AI) stays off its
                                  // neighbours.
                                  final b = _boxOf(_pocketIdx!);
                                  // ...and never past halfway to another
                                  // option, so two never overlap.
                                  var r = (b.width + b.height) * .25 + 4;
                                  final c = _centreOf(_pocketIdx!);
                                  for (var j = 0; j < _spots.length; j++) {
                                    if (j == _pocketIdx) continue;
                                    r = math.min(
                                      r,
                                      (_centreOf(j) - c).distance / 2 - 3,
                                    );
                                  }
                                  return r;
                                }(),
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
                            // "LET'S CREATE" at the top of the bubble.
                            Positioned(
                              left: 0,
                              right: 0,
                              top: s.height * .085,
                              height: s.height * .08,
                              child: const _Title(),
                            ),
                            // A big, faint dark "3" in the background at
                            // the top, behind the title and the top row.
                            Positioned(
                              left: s.width * .12,
                              right: s.width * .12,
                              top: s.height * .02,
                              height: s.height * .36,
                              child: Transform.translate(
                                offset: drift,
                                child: const Opacity(
                                  opacity: .16,
                                  child: ColorFiltered(
                                    colorFilter: ColorFilter.mode(
                                      Color(0xff3a4e66),
                                      BlendMode.srcIn,
                                    ),
                                    child: _GlassMark(bright: false),
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
                                top: s.height * .86,
                                child: const _DragHint(),
                              ),
                            Positioned(
                              left: 0,
                              right: 0,
                              top: s.height * .895,
                              child: Center(
                                child: BubbleAssistLink(
                                  onPressed: () =>
                                      AssistController.latest?.show(),
                                ),
                              ),
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
                      child: _SpotFace(sp, glow: true, showName: !strong),
                    ),
                  ),
                  AnimatedOpacity(
                    opacity: dim ? .55 : 1,
                    duration: ms,
                    child: ColorFiltered(
                      colorFilter: _brightness(
                        strong ? 1.32 : (lit ? 1.16 : 1),
                      ),
                      child: _SpotFace(sp, showName: !strong),
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
    final upper =
        _spots[i].at.dy < .6; // (only the bottom row's pop-up goes above it)
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
        colors: [Color(0xff07101e), Color(0xff050a14), Color(0xff03070e)],
        stops: [0, .55, 1],
      ),
    ),
  );
}

/// The big 3DEEZI mark (brand asset, unaltered); the tutorial's demo glass
/// still shows it.
class _GlassMark extends StatelessWidget {
  const _GlassMark({required this.bright});
  final bool bright;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: AnimatedOpacity(
      opacity: bright ? 1 : .88,
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

class _Title extends StatelessWidget {
  const _Title();

  @override
  Widget build(BuildContext context) => const IgnorePointer(
    child: FittedBox(
      child: Text(
        "LET'S CREATE",
        style: TextStyle(
          color: Colors.white,
          fontSize: 30,
          fontWeight: FontWeight.w900,
          letterSpacing: 1.5,
          shadows: [Shadow(color: _cyan, blurRadius: 14)],
        ),
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
          'SWIPE OR TAP TO EXPLORE',
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

/// "Upgrade ✦": opens the subscription plans.
class _UpgradeButton extends StatelessWidget {
  const _UpgradeButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: 'Upgrade: subscription plans',
    child: GestureDetector(
      key: const ValueKey('bubble-upgrade'),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: const LinearGradient(
            colors: [Color(0xff1f8fe0), Color(0xff0b4f9a)],
          ),
          border: Border.all(color: const Color(0xcc7fe6ff), width: 1.2),
          boxShadow: const [BoxShadow(color: Color(0x663fd4ff), blurRadius: 8)],
        ),
        child: const ExcludeSemantics(
          child: Text.rich(
            TextSpan(
              text: 'Upgrade ',
              children: [
                WidgetSpan(
                  alignment: PlaceholderAlignment.middle,
                  child: Icon(
                    Icons.auto_awesome,
                    size: 13,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
            style: TextStyle(
              color: Colors.white,
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              letterSpacing: .3,
            ),
          ),
        ),
      ),
    ),
  );
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
