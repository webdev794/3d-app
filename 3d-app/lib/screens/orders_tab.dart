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
                final title = (w * .13).clamp(34.0, 60.0);
                return SingleChildScrollView(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Center(
                    child: SizedBox(
                      width: w,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const SizedBox(height: 6),
                            SizedBox(
                              width: double.infinity,
                              height: 52,
                              child: Stack(
                                alignment: Alignment.center,
                                children: [
                                  BrandLogo(width: math.min(w * .6, 260)),
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
                              radius: 48,
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
                                      fontSize: 17,
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
                                  _MyOrdersTile(
                                    key: const ValueKey(
                                      'orders-tile-my-orders',
                                    ),
                                    onTap: () => c.go(AppScreen.orders),
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
    fontWeight: FontWeight.w700,
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
          semanticsLabel: '$title. $sub',
          child: Column(
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(16),
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
      final s = (box.maxWidth / 330).clamp(.85, 1.4);
      return AspectRatio(
        aspectRatio: 1.75,
        child: GlassCard(
          radius: 30,
          onTap: onTap,
          semanticsLabel: 'MY ORDERS. View orders and track progress.',
          child: Column(
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(22, 12, 22, 6),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: Image.asset(
                      'assets/images/art/order_tile_my_orders.webp',
                      fit: BoxFit.cover,
                      width: double.infinity,
                      alignment: const Alignment(-.4, 0),
                      filterQuality: FilterQuality.medium,
                      errorBuilder: (_, _, _) => const SizedBox(),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 2, 14, 12),
                child: SizedBox(
                  height: 44 * s,
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
              ),
            ],
          ),
        ),
      );
    },
  );
}

/// The glass bar under MY ORDERS.
class _BarPainter extends CustomPainter {
  const _BarPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final r = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(size.height / 2),
    );
    canvas.drawRRect(
      r,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xff1b5a86), Color(0xff0b2a48)],
        ).createShader(Offset.zero & size),
    );
    canvas.drawRRect(
      r.deflate(.6),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = const Color(0xff7fdcff).withValues(alpha: .7),
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
      height: 66,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          children: [
            Icon(Icons.checkroom_rounded, size: 30, color: accent),
            const SizedBox(width: 8),
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
