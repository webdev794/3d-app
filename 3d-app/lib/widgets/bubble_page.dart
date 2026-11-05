import 'dart:math' as math;

import 'package:flutter/material.dart';

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
  });

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

  /// Called when the bell's sheet closes (a page that reloads then).
  final VoidCallback? onBellClosed;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Expanded(
        child: Stack(
          children: [
            const Positioned.fill(child: BubbleBackdrop()),
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
                            child: SizedBox(
                              width: double.infinity,
                              height: 52,
                              child: Stack(
                                alignment: Alignment.center,
                                children: [
                                  // (narrower beside a corner pill, so the two never touch)
                                  BrandLogo(
                                    width: math.min(
                                      w * (leading == null ? .56 : .46),
                                      246,
                                    ),
                                  ),
                                  if (leading != null)
                                    Positioned(left: 0, child: leading!),
                                  Positioned(
                                    right: 0,
                                    child: NotificationBell(
                                      c,
                                      onClosed: onBellClosed,
                                    ),
                                  ),
                                ],
                              ),
                            ),
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
                                final dome = homeDomeHeight(area);
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
                                      28,
                                      compact
                                          ? math.min(
                                              bubbleHeadingRoom(area),
                                              40.0,
                                            )
                                          : bubbleHeadingRoom(area),
                                      28,
                                      // A working page scrolls down into the
                                      // bottom curve (clipped to it below).
                                      compact
                                          ? dome * .3 + 10
                                          : bubbleBottomRoom(
                                              inner.maxWidth,
                                              dome,
                                            ),
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
                                                    // The scrolling content
                                                    // follows the bottom curve.
                                                    ? ClipRRect(
                                                        borderRadius:
                                                            BorderRadius.vertical(
                                                              bottom: Radius.elliptical(
                                                                inner.maxWidth /
                                                                        2 -
                                                                    28,
                                                                dome * .5,
                                                              ),
                                                            ),
                                                        child: child,
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
  });
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
  late AppScreen _tab = widget.c.screen;

  @override
  void initState() {
    super.initState();
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
