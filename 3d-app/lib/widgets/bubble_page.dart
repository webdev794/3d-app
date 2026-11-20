import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import '../app_controller.dart';
import 'glass_bubble.dart';
import 'notification_bell.dart';
import 'ui.dart';

/// A main page in the bubble look (client picture images/334, 2026-11-03):
/// the dark navy backdrop with the faint emblem, the 3DEEZI wordmark with the
/// bell in the top-right corner (an optional small pill top-left), ONE big
/// glass bubble holding the page, and the stretchy glass tab bar.
class BubblePage extends StatelessWidget {
  const BubblePage({
    super.key,
    required this.c,
    required this.title,
    required this.child,
    this.subtitle,
    this.leading,
    this.bubbleKey,
    this.scrolls = false,
    this.onBellClosed,
    this.onRefresh,
    this.compact = false,
    this.bell,
    this.backdrop,
    this.fullHeadingRoom = false,
    this.bottomRoom,
    this.bubble = true,
  });

  /// Off: no glass bubble (the 3DEEZI TEAM screens, client 2026-11-10). The
  /// page stands straight on the backdrop: the header (the corner pill, the
  /// wordmark, the bell) and the title stay put on the page's side margins
  /// ([kPageSide]), and [child] fills the rest down to the tab bar, fading
  /// out softly under the title once scrolled and at the bottom. [child]
  /// keeps its own side margins (a picture may run to the screen's edges)
  /// and room for 3DEEZI Assist's round button ([kAssistRoom]). [scrolls],
  /// [compact] and the bubble's room settings do not apply.
  final bool bubble;

  /// A [compact] page whose last rows are narrower than the bubble (the
  /// sport picker's Custom… and Design capsules, client 489): its own room
  /// under the content, from the bottom dome's height, so they sit lower
  /// in the dome. Null = the working pages' room.
  final double Function(double dome)? bottomRoom;

  /// A [compact] page that still keeps the main pages' room over its title
  /// and the same bubble as Projects (the order form, user 2026-11-06:
  /// CREATE ORDER FORM as far below the rim as PROJECTS).
  final bool fullHeadingRoom;

  /// A backdrop of the page's own behind the bubble (the sport and garment
  /// pickers keep their stadium and sport backgrounds); the main pages keep
  /// the navy one.
  final Widget? backdrop;

  /// A bell of the page's own in the top-right corner (e.g. 3DEEZI TEAM's,
  /// which counts only TEAM notifications); the main pages keep the default.
  final Widget? bell;

  /// A working page in the bubble (order form, order details): less room
  /// over the title and at the sides, so forms keep their width. The main
  /// pages (Home, Projects, Orders, Profile) leave it off.
  final bool compact;
  final AppController c;
  final String title;
  final String? subtitle;

  /// The bubble's content under the title (fills the rest of the bubble).
  final Widget child;

  /// A small pill at the top-left of the header (e.g. Assets).
  final Widget? leading;
  final Key? bubbleKey;

  /// The whole bubble scrolls and grows with [child] (which then must not
  /// use Expanded): cards keep their full size on short screens.
  final bool scrolls;

  /// Pull-to-refresh on the page's scroll (only with [scrolls]).
  final Future<void> Function()? onRefresh;

  /// The scrolling page: the header scrolls away with the bubble.
  Widget _wrap(Widget col) {
    if (!scrolls) return col;
    final view = SingleChildScrollView(
      key: const ValueKey('bubble-scroll'),
      physics: const AlwaysScrollableScrollPhysics(),
      child: col,
    );
    return onRefresh == null
        ? view
        : RefreshIndicator(onRefresh: onRefresh!, child: view);
  }

  Widget _fill(Widget w) => scrolls ? w : Expanded(child: w);

  /// A working page's scrolling content ([room] under the title), kept
  /// inside the bubble's own outline at every scroll position (client 492:
  /// rows ran past the curved top under the title): clipped to the outline
  /// a little inside the rim, fading out softly under the title once
  /// scrolled, and at the bottom following the curve. [bubble] is the
  /// bubble's size, the content sits [side] px in and [below] px above its
  /// bottom.
  Widget _working(
    Size bubble,
    double dome,
    double side,
    double below,
    BoxConstraints room,
  ) {
    final clip = _BubbleClip(
      bubble: bubble,
      dome: dome,
      offset: Offset(side, bubble.height - below - room.maxHeight),
    );
    // The scrolling content follows the bubble's own bottom curve (the
    // outline below), so a full-width last row at the end of the scroll,
    // e.g. Edit profile's Save changes, keeps its corners; it fades out
    // softly at the very bottom, so nothing ends in a hard cut.
    final content = _BottomFade(child: child);
    return ClipPath(
      clipper: clip,
      // The content starts just below where the curved top still cuts into
      // the rows' sides, and fades out softly there once scrolled, so text
      // under the title fades instead of being sliced by the curve (QA
      // 2026-11-10: Edit profile's "Your name" read "our name").
      child: Padding(
        padding: EdgeInsets.only(top: clip.topCut(room.biggest)),
        child: _TopFade(child: content),
      ),
    );
  }

  /// Called when the bell's sheet closes (a page that reloads then).
  final VoidCallback? onBellClosed;

  /// The header: the wordmark in the middle, the corner pill on the left and
  /// the bell on the right; [w] is the page's width.
  Widget _header(double w) => SizedBox(
    width: double.infinity,
    height: 52,
    child: Stack(
      alignment: Alignment.center,
      children: [
        // (narrower beside a corner pill, so the two never touch)
        BrandLogo(width: math.min(w * (leading == null ? .56 : .46), 246)),
        if (leading != null) Positioned(left: 0, child: leading!),
        Positioned(
          right: 0,
          child: bell ?? NotificationBell(c, onClosed: onBellClosed),
        ),
      ],
    ),
  );

  /// The page without the bubble (see [bubble]).
  Widget _plain() => Column(
    children: [
      Expanded(
        child: Stack(
          children: [
            Positioned.fill(child: backdrop ?? const BubbleBackdrop()),
            LayoutBuilder(
              builder: (context, box) {
                final w = math.min(box.maxWidth, 520.0);
                final size = (w * .113).clamp(34.0, 50.0);
                return Center(
                  child: SizedBox(
                    width: w,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const SizedBox(height: 10),
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: kPageSide,
                          ),
                          child: _header(w),
                        ),
                        const SizedBox(height: 6),
                        if (title.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: kPageSide,
                            ),
                            child: Semantics(
                              header: true,
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(
                                  title,
                                  style: bubbleTitle(size * .62),
                                ),
                              ),
                            ),
                          ),
                        if (subtitle != null)
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: kPageSide,
                            ),
                            child: Text(
                              subtitle!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontSize: 17,
                                color: Color(0xffd3dee8),
                              ),
                            ),
                          ),
                        const SizedBox(height: 8),
                        // The content scrolls under the title, fading out
                        // softly just below it, and fades out at the bottom
                        // over the tab bar.
                        Expanded(
                          child: KeyedSubtree(
                            key: bubbleKey,
                            child: _TopFade(child: _BottomFade(child: child)),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
      BottomNav(controller: c),
    ],
  );

  @override
  Widget build(BuildContext context) => bubble ? _bubbled() : _plain();

  /// The page in its glass bubble.
  Widget _bubbled() => Column(
    children: [
      Expanded(
        child: Stack(
          children: [
            Positioned.fill(child: backdrop ?? const BubbleBackdrop()),
            LayoutBuilder(
              builder: (context, box) {
                final w = math.min(box.maxWidth, 520.0);
                final size = (w * .113).clamp(34.0, 50.0);
                return Center(
                  child: SizedBox(
                    width: w,
                    child: _wrap(
                      Column(
                        mainAxisSize: scrolls
                            ? MainAxisSize.min
                            : MainAxisSize.max,
                        children: [
                          const SizedBox(height: 10),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: _header(w),
                          ),
                          const SizedBox(height: 8),
                          _fill(
                            LayoutBuilder(
                              builder: (context, inner) {
                                // Home's glass on this screen: the bubble is
                                // as wide as Home's (full width) with Home's
                                // top and bottom dome.
                                final area = Size(w, box.maxHeight);
                                // (A working page keeps a low dome, so a short
                                // screen still shows most of the form.)
                                // A working page on a short window: a smaller
                                // dome, so the form keeps most of the bubble
                                // (user 2026-11-06, 560 × 520).
                                final dome = compact && box.maxHeight < 640
                                    ? math.min(
                                        homeDomeHeight(area),
                                        math.max(22.0, box.maxHeight * .07),
                                      )
                                    : homeDomeHeight(area);
                                // A working page keeps 20-24 px clear of the
                                // rim, more on a wide, short bubble whose
                                // sides bow in (user 2026-11-06, 463).
                                final side = compact
                                    ? math.max(30.0, w * .075)
                                    : 28.0;
                                // A working page scrolls down into the bottom
                                // curve (clipped to it below), ending above
                                // where it curves in.
                                final below = compact
                                    ? bottomRoom?.call(dome) ?? dome * .55 + 12
                                    : bubbleBottomRoom(inner.maxWidth, dome);
                                final bubble = Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: GlassBubble(
                                    key: bubbleKey,
                                    radius: 64,
                                    // Gently bowed sides, like an inflated bubble.
                                    blob: GlassBubble.pageBlob,
                                    dome: dome,

                                    // Top: the heading as far below the rim as
                                    // Home's LET'S CREATE. Sides: clear of the
                                    // glowing rim. Bottom: room above the
                                    // rounded bottom, so the last full-width
                                    // row stays inside it.
                                    // (The same bubble as Projects on every
                                    // page, user 2026-11-05: Home's dome, the
                                    // rim and the room inside it.)
                                    padding: EdgeInsets.fromLTRB(
                                      side,
                                      compact && !fullHeadingRoom
                                          ? math.min(
                                              bubbleHeadingRoom(area),
                                              40.0,
                                            )
                                          : bubbleHeadingRoom(area),
                                      side,
                                      below,
                                    ),
                                    child: Column(
                                      mainAxisSize: scrolls
                                          ? MainAxisSize.min
                                          : MainAxisSize.max,
                                      crossAxisAlignment:
                                          CrossAxisAlignment.stretch,
                                      children: [
                                        if (title.isNotEmpty)
                                          Semantics(
                                            header: true,
                                            child: FittedBox(
                                              fit: BoxFit.scaleDown,
                                              child: Text(
                                                title,
                                                style: bubbleTitle(
                                                  compact ? size * .62 : size,
                                                ),
                                              ),
                                            ),
                                          ),
                                        if (subtitle != null)
                                          Text(
                                            subtitle!,
                                            textAlign: TextAlign.center,
                                            style: const TextStyle(
                                              fontSize: 17,
                                              color: Color(0xffd3dee8),
                                            ),
                                          ),
                                        if (title.isNotEmpty ||
                                            subtitle != null)
                                          SizedBox(height: compact ? 6 : 12),
                                        scrolls
                                            ? child
                                            : Expanded(
                                                child: compact
                                                    ? LayoutBuilder(
                                                        builder:
                                                            (
                                                              context,
                                                              room,
                                                            ) => _working(
                                                              Size(
                                                                inner.maxWidth,
                                                                inner.maxHeight -
                                                                    8,
                                                              ),
                                                              dome,
                                                              side,
                                                              below,
                                                              room,
                                                            ),
                                                      )
                                                    : child,
                                              ),
                                      ],
                                    ),
                                  ),
                                );
                                if (!scrolls) return bubble;
                                // Fills the screen under the header at least.
                                return ConstrainedBox(
                                  constraints: BoxConstraints(
                                    minHeight: math.max(0, box.maxHeight - 84),
                                  ),
                                  child: bubble,
                                );
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
      BottomNav(controller: c),
    ],
  );
}

/// A bubble page's big title (PROJECTS, ORDERS, PROFILE).
TextStyle bubbleTitle(double size) => TextStyle(
  fontFamily: 'Rajdhani',
  fontWeight: FontWeight.w800,
  fontSize: size,
  height: 1,
  letterSpacing: 1.4,
  color: Colors.white,
  shadows: [Shadow(color: Palette.cyan.withValues(alpha: .35), blurRadius: 18)],
);

/// A page's side margin without the bubble ([BubblePage.bubble] off): the
/// header, the title and the content line up on it, as on Design your own.
const kPageSide = 16.0;

/// The room 3DEEZI Assist's round button takes just over the tab bar
/// (lib/widgets/assist_overlay.dart: 50 px, 92 px over the screen's foot):
/// a page without the bubble ends its content this far above the tab bar
/// at rest, so the button never covers a button.
const kAssistRoom = 50.0;

/// A working page's content inside the bubble's own outline: the straight
/// sides, and the top and bottom domes a little inside the drawn rim (about
/// .947 of the bubble's half-width and .99 of the dome, as
/// [bubbleBottomRoom] says): [top] px in under the title, [inset] px at the
/// sides and the bottom. The bubble is [bubble] in size; the content sits
/// at [offset] in it.
class _BubbleClip extends CustomClipper<Path> {
  const _BubbleClip({
    required this.bubble,
    required this.dome,
    required this.offset,
  });
  final Size bubble;
  final double dome;
  final Offset offset;
  static const inset = 14.0, top = 10.0;

  double get _a => math.max(bubble.width / 2 * .947 - inset, 0.0);

  @override
  Path getClip(Size size) {
    final w = bubble.width, h = bubble.height, cx = w / 2, a = _a;
    final bt = math.max(dome * .99 - top, 0.0);
    final bb = math.max(dome * .99 - inset, 0.0);
    final path = Path()
      ..addOval(Rect.fromLTRB(cx - a, dome - bt, cx + a, dome + bt))
      ..addOval(Rect.fromLTRB(cx - a, h - dome - bb, cx + a, h - dome + bb));
    if (h - dome > dome) {
      path.addRect(Rect.fromLTRB(cx - a, dome, cx + a, h - dome));
    }
    return path.shift(-offset);
  }

  /// How far below the top of the content ([size]) the curved top still
  /// cuts into a row's text (its sides about 8 px in).
  double topCut(Size size) {
    final a = _a, bt = dome * .99 - top;
    // (The dome's middle line, below the content's top.)
    final mid = dome - offset.dy;
    final half = size.width / 2 - 8;
    if (a <= 0 || bt <= 0 || half >= a) return mid.clamp(0.0, 40.0);
    final up = bt * math.sqrt(1 - (half / a) * (half / a));
    // (At most 40 px, so a short window keeps its room.)
    return (mid - up).clamp(0.0, 40.0);
  }

  @override
  bool shouldReclip(_BubbleClip old) =>
      old.bubble != bubble || old.dome != dome || old.offset != offset;
}

/// A working page's content fades out softly under the title once it is
/// scrolled (at the top it shows in full).
class _TopFade extends StatefulWidget {
  const _TopFade({required this.child});
  final Widget child;

  @override
  State<_TopFade> createState() => _TopFadeState();
}

class _TopFadeState extends State<_TopFade> {
  var _scrolled = false;

  bool _onScroll(ScrollNotification n) {
    if (n.depth == 0 && n.metrics.axis == Axis.vertical) {
      final scrolled = n.metrics.pixels > n.metrics.minScrollExtent + .5;
      if (scrolled != _scrolled) setState(() => _scrolled = scrolled);
    }
    return false;
  }

  @override
  Widget build(BuildContext context) =>
      NotificationListener<ScrollNotification>(
        onNotification: _onScroll,
        child: TweenAnimationBuilder<double>(
          tween: Tween(end: _scrolled ? 22 : 0),
          duration: const Duration(milliseconds: 160),
          child: widget.child,
          builder: (context, length, child) => ShaderMask(
            blendMode: BlendMode.dstIn,
            shaderCallback: (r) => LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: const [Color(0x00ffffff), Colors.white],
              stops: [0, r.height > 0 ? (length / r.height).clamp(0, 1) : 0],
            ).createShader(r),
            child: child,
          ),
        ),
      );
}

/// A page's content fades out over its last 24 px, so nothing ends in a
/// hard cut.
class _BottomFade extends StatelessWidget {
  const _BottomFade({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => ShaderMask(
    blendMode: BlendMode.dstIn,
    shaderCallback: (r) => LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: const [Colors.white, Colors.white, Color(0x00ffffff)],
      stops: [0, r.height > 48 ? 1 - 24 / r.height : .5, 1],
    ).createShader(r),
    child: child,
  );
}

/// The bubble pages' dark navy backdrop with the faint large 3DEEZI emblem.
class BubbleBackdrop extends StatelessWidget {
  const BubbleBackdrop({super.key});

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      const DecoratedBox(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(0, -.55),
            radius: 1.1,
            colors: [Color(0xff0b2235), Color(0xff06111b), Color(0xff040a10)],
            stops: [0, .55, 1],
          ),
        ),
      ),
      Align(
        alignment: const Alignment(0, -.92),
        child: FractionallySizedBox(
          widthFactor: .85,
          child: Opacity(
            opacity: .06,
            child: Image.asset(
              'assets/images/emblem-final.png',
              fit: BoxFit.contain,
              color: const Color(0xff4fb8ff),
              colorBlendMode: BlendMode.srcIn,
              errorBuilder: (_, _, _) => const SizedBox(),
            ),
          ),
        ),
      ),
    ],
  );
}

/// "Need help? 3DEEZI Assist" with its arrow, under a bubble page's content.
class BubbleAssistLink extends StatelessWidget {
  const BubbleAssistLink({super.key, required this.onPressed});
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => TextButton(
    onPressed: onPressed,
    style: TextButton.styleFrom(
      foregroundColor: Palette.cyan,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      visualDensity: VisualDensity.compact,
    ),
    child: const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.auto_awesome, size: 18, color: Palette.cyan),
        SizedBox(width: 8),
        Flexible(
          child: Text(
            'Need help? 3DEEZI Assist',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ),
        SizedBox(width: 8),
        Icon(Icons.arrow_forward_rounded, size: 18, color: Palette.cyan),
      ],
    ),
  );
}

/// The small glass pill at a bubble page's top-left (e.g. Assets).
class BubbleCornerPill extends StatelessWidget {
  const BubbleCornerPill({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: const Color(0xcc0a1c30),
    shape: StadiumBorder(
      side: BorderSide(color: Palette.cyan.withValues(alpha: .45)),
    ),
    child: InkWell(
      customBorder: const StadiumBorder(),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 13, color: Palette.cyan),
            const SizedBox(width: 5),
            Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// A screen opened on top of a tab (order form, order details …) in the
/// bubble look (user 2026-11-05: the bubble on every app screen): the same
/// backdrop, header, bubble and tab bar as the main pages, with a Back pill
/// at the top-left. A tab bar tap closes it, so the tab shows.
class BubbleRoute extends StatefulWidget {
  const BubbleRoute({
    super.key,
    required this.c,
    required this.title,
    required this.child,
    this.bubbleKey,
    this.onBack,
    this.action,
    this.bell,
    this.fullHeadingRoom = false,
    this.bubble = true,
  });

  /// See [BubblePage.fullHeadingRoom].
  final bool fullHeadingRoom;

  /// See [BubblePage.bubble].
  final bool bubble;

  /// The page's own bell (see [BubblePage.bell]).
  final Widget? bell;
  final AppController c;
  final String title;
  final Widget child;
  final Key? bubbleKey;

  /// Back (default: close this screen).
  final VoidCallback? onBack;

  /// A small round button beside Back (e.g. Open on the website).
  final Widget? action;

  @override
  State<BubbleRoute> createState() => _BubbleRouteState();
}

class _BubbleRouteState extends State<BubbleRoute> {
  // Read now, not on first use: a lazy read in _tabChanged took the new tab
  // and swallowed the first tab bar tap (QA8 #1, Home from the order form).
  late AppScreen _tab;

  @override
  void initState() {
    super.initState();
    _tab = widget.c.screen;
    widget.c.addListener(_tabChanged);
  }

  @override
  void dispose() {
    widget.c.removeListener(_tabChanged);
    super.dispose();
  }

  void _tabChanged() {
    if (!mounted || widget.c.screen == _tab) return;
    _tab = widget.c.screen;
    if (ModalRoute.of(context)?.isCurrent ?? false) {
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Palette.bg,
    body: SafeArea(
      bottom: false,
      child: BubblePage(
        c: widget.c,
        title: widget.title,
        bubbleKey: widget.bubbleKey,
        compact: true,
        fullHeadingRoom: widget.fullHeadingRoom,
        bubble: widget.bubble,
        bell: widget.bell,
        leading: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            BubbleCornerPill(
              key: const ValueKey('bubble-back'),
              icon: Icons.arrow_back,
              label: 'Back',
              onTap: widget.onBack ?? () => Navigator.of(context).maybePop(),
            ),
            if (widget.action != null) ...[
              const SizedBox(width: 4),
              widget.action!,
            ],
          ],
        ),
        child: widget.child,
      ),
    ),
  );
}

/// A page column inside the bubble that fills the room like a Column with one
/// Expanded child, but never squeezes that child below [minFlex]: on a short
/// phone the whole page scrolls instead (the sport and garment pickers).
class BubbleFillScroll extends StatelessWidget {
  const BubbleFillScroll({
    super.key,
    required this.minFlex,
    required this.children,
    this.scrollKey,
  });

  /// The least height of the Expanded child, from the page width.
  final double Function(double width) minFlex;
  final List<Widget> children;
  final Key? scrollKey;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) => SingleChildScrollView(
      key: scrollKey,
      child: _FillColumn(
        flexIndex: children.indexWhere((w) => w is Expanded),
        minFlex: minFlex(box.maxWidth),
        minHeight: box.maxHeight.isFinite ? box.maxHeight : 0,
        children: [for (final w in children) w is Expanded ? w.child : w],
      ),
    ),
  );
}

class _FillColumn extends MultiChildRenderObjectWidget {
  const _FillColumn({
    required this.flexIndex,
    required this.minFlex,
    required this.minHeight,
    required super.children,
  });

  final int flexIndex;
  final double minFlex, minHeight;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _RenderFillColumn(flexIndex, minFlex, minHeight);

  @override
  void updateRenderObject(BuildContext context, _RenderFillColumn r) => r
    ..flexIndex = flexIndex
    ..minFlex = minFlex
    ..minHeight = minHeight;
}

class _FillParentData extends ContainerBoxParentData<RenderBox> {}

class _RenderFillColumn extends RenderBox
    with
        ContainerRenderObjectMixin<RenderBox, _FillParentData>,
        RenderBoxContainerDefaultsMixin<RenderBox, _FillParentData> {
  _RenderFillColumn(this._flexIndex, this._minFlex, this._minHeight);

  int _flexIndex;
  double _minFlex, _minHeight;

  set flexIndex(int v) {
    if (v == _flexIndex) return;
    _flexIndex = v;
    markNeedsLayout();
  }

  set minFlex(double v) {
    if (v == _minFlex) return;
    _minFlex = v;
    markNeedsLayout();
  }

  set minHeight(double v) {
    if (v == _minHeight) return;
    _minHeight = v;
    markNeedsLayout();
  }

  @override
  void setupParentData(RenderBox child) {
    if (child.parentData is! _FillParentData) {
      child.parentData = _FillParentData();
    }
  }

  @override
  void performLayout() {
    final w = constraints.maxWidth;
    // As a Column does: the fixed children first, at their own height…
    var fixed = 0.0, i = 0;
    for (var child = firstChild; child != null; child = childAfter(child)) {
      if (i++ != _flexIndex) {
        child.layout(BoxConstraints(maxWidth: w), parentUsesSize: true);
        fixed += child.size.height;
      }
    }
    // …then the Expanded one gets the rest, but never less than minFlex.
    final flex = math.max(_minFlex, _minHeight - fixed);
    var y = 0.0;
    i = 0;
    for (var child = firstChild; child != null; child = childAfter(child)) {
      if (i++ == _flexIndex) {
        child.layout(
          BoxConstraints(maxWidth: w, minHeight: flex, maxHeight: flex),
          parentUsesSize: true,
        );
      }
      (child.parentData! as _FillParentData).offset = Offset(
        (w - child.size.width) / 2,
        y,
      );
      y += child.size.height;
    }
    size = constraints.constrain(Size(w, math.max(y, _minHeight)));
  }

  @override
  void paint(PaintingContext context, Offset offset) =>
      defaultPaint(context, offset);

  @override
  bool hitTestChildren(BoxHitTestResult result, {required Offset position}) =>
      defaultHitTestChildren(result, position: position);
}
