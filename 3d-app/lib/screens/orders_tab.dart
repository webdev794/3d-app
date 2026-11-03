import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../assist.dart';
import '../widgets/notification_bell.dart';
import '../widgets/glass_bubble.dart';
import '../widgets/ui.dart';
import 'order_entry.dart' show OrderFormScreen, OrderUploadScreen;

/// The Orders tab (client picture images/333.jpg, 2026-11-03): the 3DEEZI
/// wordmark with the bell, then ONE glass bubble holding ORDERS "Create,
/// upload or track.", the CREATE ORDER and UPLOAD ORDER cards and the wide MY
/// ORDERS card; below it PREFERRED SUPPLIERS (Make with 3DEEZI / Make with
/// Mantis: the order form with that maker), REWARDS · COMING SOON and the
/// Assist link.
class OrdersTabScreen extends StatefulWidget {
  const OrdersTabScreen(this.c, {super.key});
  final AppController c;
  @override
  State<OrdersTabScreen> createState() => _OrdersTabScreenState();
}

class _OrdersTabScreenState extends State<OrdersTabScreen> {
  AppController get c => widget.c;

  @override
  void initState() {
    super.initState();
    // 3DEEZI ASSIST's /orders/new and /orders/upload: open the form once the tab is on screen.
    AssistController.orderEntry.addListener(_entry);
    WidgetsBinding.instance.addPostFrameCallback((_) => _entry());
  }

  @override
  void dispose() {
    AssistController.orderEntry.removeListener(_entry);
    super.dispose();
  }

  void _entry() {
    final what = AssistController.orderEntry.value;
    if (what == null || !mounted) return;
    AssistController.orderEntry.value = null;
    _open(
      context,
      () => what == 'upload' ? OrderUploadScreen(c) : OrderFormScreen(c),
    );
  }

  /// Ordering needs an account: signed out, sign in first.
  void _open(BuildContext context, Widget Function() screen) {
    if (!c.signedIn) {
      showToast(context, 'Sign in to place an order.');
      c.go(AppScreen.auth);
      return;
    }
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => screen()));
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Expanded(
        child: Stack(
          children: [
            const Positioned.fill(child: _OrdersBackdrop()),
            LayoutBuilder(
              builder: (context, box) {
                // Phones fill the width; a tablet keeps the phone's layout.
                final w = math.min(box.maxWidth, 500.0);
                final title = (w * .113).clamp(34.0, 50.0);
                return SingleChildScrollView(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Center(
                    child: SizedBox(
                      width: w,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const SizedBox(height: 18),
                            SizedBox(
                              width: double.infinity,
                              height: 52,
                              child: Stack(
                                alignment: Alignment.center,
                                children: [
                                  BrandLogo(width: math.min(w * .56, 246)),
                                  Positioned(
                                    right: 0,
                                    child: NotificationBell(c),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                            // One glass bubble holds the three ways in
                            // (client picture images/333, 2026-11-03).
                            GlassBubble(
                              key: const ValueKey('orders-bubble'),
                              // A gentle two-lobe outline (images/341): a shallow waist at 0.6;
                              // the lower lobe round My orders is the widest.
                              blob: const [
                                Offset(.3, 2),
                                Offset(.6, 6),
                                Offset(.8, -3),
                              ],
                              padding: const EdgeInsets.fromLTRB(
                                22,
                                20,
                                22,
                                46,
                              ),
                              radius: 56,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Semantics(
                                    header: true,
                                    child: FittedBox(
                                      fit: BoxFit.scaleDown,
                                      child: Text(
                                        'ORDERS',
                                        style: _headline(title, Colors.white),
                                      ),
                                    ),
                                  ),
                                  const Text(
                                    'Create, upload or track.',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontSize: 18.5,
                                      color: Color(0xffd3dee8),
                                    ),
                                  ),
                                  const SizedBox(height: 16),
                                  Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Expanded(
                                        child: _OrderTile(
                                          key: const ValueKey(
                                            'orders-tile-form',
                                          ),
                                          art:
                                              'assets/images/art/order_tile_form.webp',
                                          title: 'CREATE ORDER',
                                          sub: 'Fill in the order form',
                                          onTap: () => _open(
                                            context,
                                            () => OrderFormScreen(c),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: _OrderTile(
                                          key: const ValueKey(
                                            'orders-tile-upload',
                                          ),
                                          art:
                                              'assets/images/art/order_tile_upload.webp',
                                          title: 'UPLOAD ORDER',
                                          sub: 'Add your form and artwork',
                                          onTap: () => _open(
                                            context,
                                            () => OrderUploadScreen(c),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 12),
                                  Padding(
                                    padding: EdgeInsets.zero,
                                    child: _MyOrdersTile(
                                      key: const ValueKey(
                                        'orders-tile-my-orders',
                                      ),
                                      onTap: () => c.go(AppScreen.orders),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 18),
                            const _RuleHeading('PREFERRED SUPPLIERS'),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: _MakerPill(
                                    key: const ValueKey('orders-make-3deezi'),
                                    accent: const Color(0xff2fa8ff),
                                    logo: const BrandLogo(width: 92),
                                    name: '3DEEZI',
                                    onTap: () => _open(
                                      context,
                                      () => OrderFormScreen(c),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: _MakerPill(
                                    key: const ValueKey('orders-make-mantis'),
                                    accent: const Color(0xff2fe0b0),
                                    logo: const Text(
                                      'Mantis',
                                      maxLines: 1,
                                      style: TextStyle(
                                        fontSize: 24,
                                        height: 1,
                                        fontWeight: FontWeight.w900,
                                        fontStyle: FontStyle.italic,
                                        letterSpacing: -.3,
                                        color: Colors.white,
                                      ),
                                    ),
                                    name: 'Mantis',
                                    onTap: () => _open(
                                      context,
                                      () => OrderFormScreen(c, maker: 'Mantis'),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 18),
                            Semantics(
                              key: const ValueKey('orders-rewards'),
                              label: '3DEEZI Rewards: coming soon',
                              excludeSemantics: true,
                              child: const FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      'REWARDS · COMING SOON',
                                      style: TextStyle(
                                        fontFamily: 'Rajdhani',
                                        fontWeight: FontWeight.w700,
                                        fontSize: 16,
                                        letterSpacing: 2.2,
                                        color: Color(0xffd3dee8),
                                      ),
                                    ),
                                    SizedBox(width: 8),
                                    Icon(
                                      Icons.auto_awesome,
                                      size: 20,
                                      color: Palette.cyan,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            const Center(child: _AssistLink()),
                          ],
                        ),
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

  static TextStyle _headline(double size, Color colour) => TextStyle(
    fontFamily: 'Rajdhani',
    fontWeight: FontWeight.w800,
    fontSize: size,
    height: 1,
    letterSpacing: 2,
    color: colour,
    shadows: [
      Shadow(color: Palette.cyan.withValues(alpha: .35), blurRadius: 18),
    ],
  );
}

/// The Home's dark navy backdrop with the faint large 3DEEZI emblem.
class _OrdersBackdrop extends StatelessWidget {
  const _OrdersBackdrop();

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
          widthFactor: 1.25,
          child: Opacity(
            opacity: .07,
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

/// The tiles' lettering: Rajdhani, white, with a faint glow.
TextStyle _tileWord(double size) => TextStyle(
  fontFamily: 'Rajdhani',
  fontWeight: FontWeight.w700,
  fontSize: size,
  height: 1.05,
  letterSpacing: .6,
  color: Colors.white,
  shadows: [Shadow(color: Palette.cyan.withValues(alpha: .4), blurRadius: 10)],
);

/// CREATE ORDER / UPLOAD ORDER: a glass card, its picture above its title.
class _OrderTile extends StatelessWidget {
  const _OrderTile({
    super.key,
    required this.art,
    required this.title,
    required this.sub,
    required this.onTap,
  });
  final String art, title, sub;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final s = (box.maxWidth / 160).clamp(.82, 1.45);
      return AspectRatio(
        aspectRatio: .95,
        child: GlassCard(
          radius: 24,
          onTap: onTap,
          bubbleRim: true,
          semanticsLabel: '$title. $sub',
          child: Column(
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
                  child: Container(
                    // A light glass frame and sheen (images/341).
                    foregroundDecoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: const Color(0xff7fdcff).withValues(alpha: .35),
                        width: 1.2,
                      ),
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.white.withValues(alpha: .14),
                          Colors.white.withValues(alpha: 0),
                          Colors.white.withValues(alpha: 0),
                        ],
                        stops: const [0, .35, 1],
                      ),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      // Zoomed to the middle: the art's own blue
                      // lightning frame stays outside the tile.
                      child: Transform.scale(
                        scale: 1.3,
                        child: Image.asset(
                          art,
                          fit: BoxFit.cover,
                          width: double.infinity,
                          filterQuality: FilterQuality.medium,
                          errorBuilder: (_, _, _) => const SizedBox(),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: EdgeInsets.fromLTRB(6, 6 * s, 6, 10 * s),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(title, maxLines: 1, style: _tileWord(19 * s)),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}

/// MY ORDERS: the wide glass card, the order-tracking picture above a glass
/// "MY ORDERS" bar.
class _MyOrdersTile extends StatelessWidget {
  const _MyOrdersTile({super.key, required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final s = (box.maxWidth / 330).clamp(.85, 1.4).toDouble();
      // The see-through MY ORDERS pill sits inside the card, under the list
      // (client images/350).
      return AspectRatio(
        aspectRatio: 1.6,
        child: GlassCard(
          radius: 30,
          onTap: onTap,
          bubbleRim: true,
          semanticsLabel: 'MY ORDERS. View orders and track progress.',
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
            child: Column(
              children: [
                const Expanded(
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12),
                    child: _OrderListArt(),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 42 * s,
                  width: double.infinity,
                  child: CustomPaint(
                    painter: const _BarPainter(),
                    child: Center(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text('MY ORDERS', style: _tileWord(22 * s)),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

/// The clean order list in the MY ORDERS card (images/341): a dark glass
/// panel with three kits, order numbers, progress dots and a truck.
class _OrderListArt extends StatelessWidget {
  const _OrderListArt();

  static const _rows = [
    ('#10024', 'assets/images/art/bubble_jersey_dyo.webp', 2),
    ('#10023', 'assets/images/art/bubble_jersey_ai.webp', 2),
    ('#10022', 'assets/images/art/garment_jersey.jpg', 3),
  ];

  @override
  Widget build(BuildContext context) {
    const cyan = Color(0xff2fd2ff);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xcc050f1c),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: cyan.withValues(alpha: .35)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 6, 10, 6),
        child: FittedBox(
          fit: BoxFit.contain,
          child: SizedBox(
            width: 230,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  '3DEEZI',
                  style: TextStyle(
                    fontFamily: 'Rajdhani',
                    fontWeight: FontWeight.w800,
                    fontStyle: FontStyle.italic,
                    fontSize: 11,
                    color: Colors.white,
                  ),
                ),
                for (final (no, kit, done) in _rows)
                  Padding(
                    padding: const EdgeInsets.only(top: 5),
                    child: Row(
                      children: [
                        Container(
                          width: 34,
                          height: 34,
                          decoration: BoxDecoration(
                            color: const Color(0xff4f86b8),
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(
                              color: cyan.withValues(alpha: .5),
                            ),
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(3),
                            child: Image.asset(
                              kit,
                              fit: BoxFit.contain,
                              color: Colors.white.withValues(alpha: .14),
                              colorBlendMode: BlendMode.screen,
                              filterQuality: FilterQuality.medium,
                              errorBuilder: (_, _, _) =>
                                  CustomPaint(painter: _ShirtPainter(cyan)),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          no,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(width: 12),
                        for (var k = 0; k < 3; k++) ...[
                          if (k > 0)
                            Container(
                              width: 22,
                              height: 2,
                              color: k < done
                                  ? cyan
                                  : Colors.white.withValues(alpha: .3),
                            ),
                          Container(
                            width: 11,
                            height: 11,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: k < done
                                  ? cyan.withValues(alpha: .3)
                                  : Colors.transparent,
                              border: Border.all(
                                color: k < done
                                    ? cyan
                                    : Colors.white.withValues(alpha: .45),
                                width: 1.4,
                              ),
                            ),
                            child: k < done
                                ? const Icon(Icons.check, size: 7, color: cyan)
                                : null,
                          ),
                        ],
                        const Spacer(),
                        Icon(
                          Icons.local_shipping_outlined,
                          size: 16,
                          color: Colors.white.withValues(alpha: .75),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A small kit (jersey) icon for the order list.
class _ShirtPainter extends CustomPainter {
  const _ShirtPainter(this.colour);
  final Color colour;

  @override
  void paint(Canvas canvas, Size s) {
    final w = s.width, h = s.height;
    final p = Path()
      ..moveTo(w * .38, h * .14)
      ..lineTo(w * .2, h * .22)
      ..lineTo(w * .1, h * .42)
      ..lineTo(w * .27, h * .48)
      ..lineTo(w * .3, h * .88)
      ..lineTo(w * .7, h * .88)
      ..lineTo(w * .73, h * .48)
      ..lineTo(w * .9, h * .42)
      ..lineTo(w * .8, h * .22)
      ..lineTo(w * .62, h * .14)
      ..quadraticBezierTo(w * .5, h * .3, w * .38, h * .14)
      ..close();
    canvas.drawPath(p, Paint()..color = colour);
    canvas.drawPath(
      p,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = .8
        ..color = const Color(0xff2fd2ff),
    );
  }

  @override
  bool shouldRepaint(_ShirtPainter old) => old.colour != colour;
}

/// The MY ORDERS glass pill: lighter glass with a curved shine on top.
class _BarPainter extends CustomPainter {
  const _BarPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final r = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(size.height / 2),
    );
    // Dark, see-through glass.
    canvas.drawRRect(
      r,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0x40164a72), Color(0x30061428), Color(0x402a6ea0)],
          stops: [0, .55, 1],
        ).createShader(Offset.zero & size),
    );
    // A soft shine line along the top.
    canvas.save();
    canvas.clipRRect(r);
    canvas.clipRect(Rect.fromLTWH(0, 0, size.width, size.height * .5));
    canvas.drawRRect(
      r.deflate(2.5),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.white.withValues(alpha: .6),
            Colors.white.withValues(alpha: 0),
          ],
        ).createShader(Offset.zero & size)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, .8),
    );
    canvas.restore();
    // The thin bright rim.
    canvas.drawRRect(
      r.deflate(.6),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = const Color(0xffa8ecff).withValues(alpha: .8),
    );
  }

  @override
  bool shouldRepaint(_BarPainter old) => false;
}

/// "—— PREFERRED SUPPLIERS ——": a spaced heading between two thin rules.
class _RuleHeading extends StatelessWidget {
  const _RuleHeading(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    Widget rule() => Expanded(
      child: Container(
        height: 1,
        margin: const EdgeInsets.symmetric(horizontal: 8),
        color: const Color(0x5552d4ec),
      ),
    );
    return Semantics(
      header: true,
      child: Row(
        children: [
          rule(),
          Flexible(
            flex: 6,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                text,
                style: const TextStyle(
                  fontFamily: 'Rajdhani',
                  fontWeight: FontWeight.w700,
                  fontSize: 17,
                  letterSpacing: 2.4,
                  color: Colors.white,
                ),
              ),
            ),
          ),
          rule(),
        ],
      ),
    );
  }
}

/// "MAKE WITH <maker> ->": a glass pill with a small shirt, coloured by the
/// maker (3DEEZI blue, Mantis green). Opens the order form with that maker.
class _MakerPill extends StatelessWidget {
  const _MakerPill({
    super.key,
    required this.accent,
    required this.logo,
    required this.name,
    required this.onTap,
  });
  final Color accent;
  final Widget logo;
  final String name;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GlassPill(
    accent: accent,
    onTap: onTap,
    semanticsLabel: 'Make with $name',
    child: SizedBox(
      height: 72,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          children: [
            SizedBox(
              width: 30,
              height: 30,
              child: CustomPaint(
                painter: _ShirtPainter(accent.withValues(alpha: .25)),
              ),
            ),
            const SizedBox(width: 10),
            Container(
              width: 1,
              height: 34,
              color: Colors.white.withValues(alpha: .22),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'MAKE WITH',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: .8,
                        color: Color(0xffd3dee8),
                      ),
                    ),
                    const SizedBox(height: 3),
                    logo,
                  ],
                ),
              ),
            ),
            const Icon(
              Icons.arrow_forward_rounded,
              size: 20,
              color: Colors.white,
            ),
          ],
        ),
      ),
    ),
  );
}

/// "Need help? 3DEEZI Assist →": opens the help chat.
class _AssistLink extends StatelessWidget {
  const _AssistLink();

  @override
  Widget build(BuildContext context) => TextButton(
    key: const ValueKey('orders-assist-link'),
    onPressed: () => AssistController.latest?.show(),
    style: TextButton.styleFrom(
      foregroundColor: Palette.cyan,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    ),
    child: const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.auto_awesome, size: 22, color: Palette.cyan),
        SizedBox(width: 10),
        Flexible(
          child: Text(
            'Need help? 3DEEZI Assist',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
        ),
        SizedBox(width: 10),
        Icon(Icons.arrow_forward_rounded, size: 20, color: Palette.cyan),
      ],
    ),
  );
}
