import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../assist.dart';
import '../widgets/notification_bell.dart';
import '../widgets/rewards_card.dart' show GiftPainter;
import '../widgets/ui.dart';
import 'order_entry.dart' show OrderFormScreen, OrderUploadScreen;

/// The Orders tab (client picture images/168.jpg, 2026-10-23): the 3DEEZI
/// wordmark with the bell, "ORDER WITH 3DEEZI", the CREATE ORDER FORM and
/// UPLOAD YOUR ORDER tiles, the wide MY ORDERS tile, the 3DEEZI Rewards
/// "Coming soon" strip and the Assist link. The tiles open the existing
/// screens: the order form, the upload order screen and My orders.
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
                final title = (w * .1).clamp(30.0, 48.0);
                return SingleChildScrollView(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Center(
                    child: SizedBox(
                      width: w,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const SizedBox(height: 6),
                            SizedBox(
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
                            const SizedBox(height: 14),
                            Semantics(
                              header: true,
                              label: 'ORDER WITH 3DEEZI',
                              excludeSemantics: true,
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Column(
                                  children: [
                                    Text(
                                      'ORDER WITH',
                                      style: _headline(title, Colors.white),
                                    ),
                                    Text(
                                      '3DEEZI',
                                      style: _headline(title, Palette.cyan),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'Start an order. Follow its progress.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 16,
                                color: Color(0xffd3dee8),
                              ),
                            ),
                            const SizedBox(height: 16),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: _OrderTile(
                                    key: const ValueKey('orders-tile-form'),
                                    art:
                                        'assets/images/art/order_tile_form.webp',
                                    title: 'CREATE ORDER FORM',
                                    sub: 'Let 3DEEZI Assist help',
                                    onTap: () => _open(
                                      context,
                                      () => OrderFormScreen(c),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _OrderTile(
                                    key: const ValueKey('orders-tile-upload'),
                                    art:
                                        'assets/images/art/order_tile_upload.webp',
                                    title: 'UPLOAD YOUR ORDER',
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
                              key: const ValueKey('orders-tile-my-orders'),
                              onTap: () => c.go(AppScreen.orders),
                            ),
                            const SizedBox(height: 12),
                            const _RewardsStrip(),
                            const SizedBox(height: 2),
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
    height: .98,
    letterSpacing: .6,
    color: colour,
    shadows: colour == Palette.cyan
        ? [Shadow(color: Palette.cyan.withValues(alpha: .45), blurRadius: 18)]
        : null,
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

const _tileFill = Color(0xff07121d);

/// The tiles' glowing cyan frame.
BoxDecoration _glow() => BoxDecoration(
  borderRadius: BorderRadius.circular(18),
  boxShadow: [
    BoxShadow(
      color: Palette.cyan.withValues(alpha: .32),
      blurRadius: 16,
      spreadRadius: -2,
    ),
  ],
);

ShapeBorder _frame() => RoundedRectangleBorder(
  borderRadius: BorderRadius.circular(18),
  side: BorderSide(
    color: const Color(0xff1fb6ff).withValues(alpha: .85),
    width: 1.6,
  ),
);

/// CREATE ORDER FORM / UPLOAD YOUR ORDER: the picture, the title and its
/// sub-line at the bottom.
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
      // Lettering grows with the tile (175 px wide on a 390 px phone).
      final s = (box.maxWidth / 175).clamp(.82, 1.45);
      return AspectRatio(
        aspectRatio: .82,
        child: Semantics(
          button: true,
          label: '$title. $sub',
          excludeSemantics: true,
          onTap: onTap,
          child: DecoratedBox(
            decoration: _glow(),
            child: Material(
              color: _tileFill,
              shape: _frame(),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onTap,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Positioned(
                      top: 0,
                      left: 0,
                      right: 0,
                      child: AspectRatio(
                        aspectRatio: 1,
                        child: Image.asset(
                          art,
                          fit: BoxFit.cover,
                          filterQuality: FilterQuality.medium,
                          errorBuilder: (_, _, _) => const SizedBox(),
                        ),
                      ),
                    ),
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Color(0x0007121d), _tileFill],
                          stops: [.6, .82],
                        ),
                      ),
                    ),
                    Positioned(
                      left: 8,
                      right: 8,
                      bottom: 12 * s,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Text(
                              title,
                              maxLines: 1,
                              style: TextStyle(
                                fontFamily: 'Rajdhani',
                                fontWeight: FontWeight.w700,
                                fontSize: 20 * s,
                                height: 1.1,
                                letterSpacing: .3,
                                color: Colors.white,
                              ),
                            ),
                          ),
                          SizedBox(height: 3 * s),
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Text(
                              sub,
                              maxLines: 1,
                              style: TextStyle(
                                fontSize: 12.5 * s,
                                color: const Color(0xffd3dee8),
                              ),
                            ),
                          ),
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
    },
  );
}

/// MY ORDERS: the order-tracking picture on the left, "MY ORDERS" and its
/// line on the right.
class _MyOrdersTile extends StatelessWidget {
  const _MyOrdersTile({super.key, required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final w = box.maxWidth;
      final s = (w / 362).clamp(.85, 1.4);
      return AspectRatio(
        aspectRatio: 2,
        child: Semantics(
          button: true,
          label: 'MY ORDERS. View orders and track progress.',
          excludeSemantics: true,
          onTap: onTap,
          child: DecoratedBox(
            decoration: _glow(),
            child: Material(
              color: _tileFill,
              shape: _frame(),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onTap,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Positioned(
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: w * .72,
                      child: Image.asset(
                        'assets/images/art/order_tile_my_orders.webp',
                        fit: BoxFit.cover,
                        alignment: const Alignment(-.4, 0),
                        filterQuality: FilterQuality.medium,
                        errorBuilder: (_, _, _) => const SizedBox(),
                      ),
                    ),
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [Color(0x0007121d), _tileFill],
                          stops: [.56, .72],
                        ),
                      ),
                    ),
                    Positioned(
                      left: w * .66,
                      right: 10 * s,
                      top: 0,
                      bottom: 0,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerLeft,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('MY', style: _big(Colors.white, s)),
                                Text('ORDERS', style: _big(Palette.cyan, s)),
                              ],
                            ),
                          ),
                          SizedBox(height: 5 * s),
                          Text(
                            'View orders and track progress.',
                            style: TextStyle(
                              fontSize: 12.5 * s,
                              height: 1.3,
                              color: const Color(0xffd3dee8),
                            ),
                          ),
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
    },
  );

  static TextStyle _big(Color colour, double s) => TextStyle(
    fontFamily: 'Rajdhani',
    fontWeight: FontWeight.w700,
    fontSize: 32 * s,
    height: .95,
    letterSpacing: .4,
    color: colour,
  );
}

/// 3DEEZI | REWARDS, coming soon: the slim strip under the tiles. Nothing to
/// tap yet.
class _RewardsStrip extends StatelessWidget {
  const _RewardsStrip();

  static const _rule = Color(0xff3b4659);

  @override
  Widget build(BuildContext context) => Semantics(
    key: const ValueKey('orders-rewards'),
    label: '3DEEZI Rewards: coming soon',
    excludeSemantics: true,
    child: Container(
      height: 60,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0x9952d4ec)),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xff061322), Color(0xff030b15)],
        ),
        boxShadow: [
          BoxShadow(color: Palette.cyan.withValues(alpha: .16), blurRadius: 12),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Row(
        children: [
          SizedBox(
            width: 86,
            height: 60,
            // The glowing gift; its square picture fades out at the edges.
            child: ShaderMask(
              blendMode: BlendMode.dstIn,
              shaderCallback: (r) => const RadialGradient(
                radius: .62,
                colors: [Colors.white, Colors.white, Color(0x00ffffff)],
                stops: [0, .62, 1],
              ).createShader(r),
              child: Image.asset(
                'assets/images/art/order_rewards_gift.webp',
                fit: BoxFit.cover,
                filterQuality: FilterQuality.medium,
                errorBuilder: (_, _, _) =>
                    const CustomPaint(painter: GiftPainter()),
              ),
            ),
          ),
          Container(
            width: 1,
            height: 40,
            margin: const EdgeInsets.only(left: 4, right: 14),
            color: _rule,
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const BrandLogo(width: 92),
                        Container(
                          width: 1,
                          height: 16,
                          margin: const EdgeInsets.symmetric(horizontal: 9),
                          color: _rule,
                        ),
                        const Text(
                          'REWARDS',
                          style: TextStyle(
                            fontFamily: 'Rajdhani',
                            fontWeight: FontWeight.w700,
                            fontSize: 22,
                            height: 1,
                            letterSpacing: .8,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 5),
                  const Text(
                    'Coming soon.',
                    maxLines: 1,
                    style: TextStyle(fontSize: 13.5, color: Color(0xffe9f0f7)),
                  ),
                ],
              ),
            ),
          ),
        ],
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
