import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../ai_service.dart';
import '../app_controller.dart';
import '../assist.dart';
import '../project_sync.dart';
import '../sports_catalog.dart';
import '../widgets/category_icon.dart';
import '../widgets/flow_ui.dart';
import '../widgets/notification_bell.dart';
import '../widgets/showroom.dart';
import '../widgets/ui.dart';
import 'order_entry.dart' show OrderFormScreen, OrderUploadScreen;
import 'team.dart' show TeamScreen;

/// 4 · Home (client picture images/166.jpg, 2026-10-23): the 3DEEZI wordmark
/// with the bell, "What would you like to create?", four picture tiles (AI
/// DESIGNER, DESIGN YOUR OWN, ARTBOARD, 3DEEZI TEAM); under them ORDERS
/// (Create order form, Upload your order, My orders) and the Preferred
/// suppliers strip (coming soon), then the Assist link and a quiet Convert
/// line.
class CreateHomeScreen extends StatelessWidget {
  const CreateHomeScreen(this.c, {super.key});
  final AppController c;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Expanded(
        child: Stack(
          children: [
            const Positioned.fill(child: _HomeBackdrop()),
            LayoutBuilder(
              builder: (context, box) {
                // Phones fill the width; a tablet keeps the phone's layout.
                final w = math.min(box.maxWidth, 500.0);
                final title = (w * .082).clamp(25.0, 36.0);
                return SingleChildScrollView(
                  padding: const EdgeInsets.only(bottom: 18),
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
                                  // The notification bell (signed in).
                                  Positioned(
                                    right: 0,
                                    child: NotificationBell(c),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 14),
                            Text.rich(
                              const TextSpan(
                                children: [
                                  TextSpan(text: 'What would you like\nto '),
                                  TextSpan(
                                    text: 'create?',
                                    style: TextStyle(color: Palette.cyan),
                                  ),
                                ],
                              ),
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: title,
                                fontWeight: FontWeight.w800,
                                height: 1.12,
                                letterSpacing: -.3,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'Choose how you want to start.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 15.5,
                                color: Color(0xffd3dee8),
                              ),
                            ),
                            const SizedBox(height: 18),
                            _tileRow(
                              _HomeTile(
                                key: const ValueKey('home-tile-ai'),
                                art: 'assets/images/art/home_tile_ai.webp',
                                title: 'AI DESIGNER',
                                sub: 'Describe your idea',
                                onTap: c.startAi,
                              ),
                              _HomeTile(
                                key: const ValueKey('home-tile-dyo'),
                                art: 'assets/images/art/home_tile_dyo.webp',
                                title: 'DESIGN YOUR OWN',
                                sub: 'Build your kit in 3D',
                                onTap: c.startDyo,
                              ),
                            ),
                            const SizedBox(height: 12),
                            _tileRow(
                              _HomeTile(
                                key: const ValueKey('home-tile-artboard'),
                                art:
                                    'assets/images/art/home_tile_artboard.webp',
                                title: 'ARTBOARD',
                                sub: 'Create and edit artwork',
                                onTap: () => c.go(AppScreen.artboard),
                              ),
                              // 3DEEZI TEAM (client brief 2026-10-21): real
                              // designers create it for you.
                              _HomeTile(
                                key: const ValueKey('home-tile-team'),
                                art: 'assets/images/art/home_tile_team.webp',
                                title: '3DEEZI TEAM',
                                sub: 'Let our designers help',
                                onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute<void>(
                                    builder: (_) => TeamScreen(c),
                                  ),
                                ),
                              ),
                            ),
                            // ORDERS and Preferred suppliers (client
                            // 2026-10-23): under the tiles, which stay first.
                            const SizedBox(height: 18),
                            _OrdersRow(c),
                            const SizedBox(height: 12),
                            const _SuppliersStrip(),
                            const SizedBox(height: 8),
                            const Center(child: _AssistLink()),
                            // One quiet line for Convert, which has no other
                            // way in (Plans & pricing is on Profile; ORDER
                            // WITH 3DEEZI and Rewards are on the Orders tab).
                            Center(
                              child: TextButton.icon(
                                key: const ValueKey('home-convert'),
                                onPressed: () => convertFlow(context, c),
                                style: TextButton.styleFrom(
                                  foregroundColor: const Color(0xff9fb0bf),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 6,
                                  ),
                                  minimumSize: const Size(0, 36),
                                ),
                                icon: const Icon(
                                  Icons.document_scanner_outlined,
                                  size: 16,
                                ),
                                label: const Text(
                                  'Convert an image to 3D',
                                  style: TextStyle(fontSize: 12.5),
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
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

  Widget _tileRow(Widget a, Widget b) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(child: a),
      const SizedBox(width: 12),
      Expanded(child: b),
    ],
  );
}

/// The home's dark navy backdrop with the faint large 3DEEZI emblem.
class _HomeBackdrop extends StatelessWidget {
  const _HomeBackdrop();

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
            ),
          ),
        ),
      ),
    ],
  );
}

/// One home tile: a full-bleed picture with a glowing cyan border, the title
/// and its sub-line at the bottom.
class _HomeTile extends StatelessWidget {
  const _HomeTile({
    super.key,
    required this.art,
    required this.title,
    required this.sub,
    required this.onTap,
  });
  final String art, title, sub;
  final VoidCallback onTap;

  static const _fill = Color(0xff07121d);

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      // Lettering grows with the tile (168 px wide on a 390 px phone).
      final s = (box.maxWidth / 168).clamp(.82, 1.45);
      return AspectRatio(
        aspectRatio: .8,
        child: Semantics(
          button: true,
          label: '$title. $sub',
          excludeSemantics: true,
          onTap: onTap,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(
                  color: Palette.cyan.withValues(alpha: .32),
                  blurRadius: 16,
                  spreadRadius: -2,
                ),
              ],
            ),
            child: Material(
              color: _fill,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
                side: BorderSide(
                  color: const Color(0xff1fb6ff).withValues(alpha: .85),
                  width: 1.6,
                ),
              ),
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
                        ),
                      ),
                    ),
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Color(0x0007121d), _fill],
                          stops: [.52, .8],
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
                                fontSize: 21 * s,
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

/// ORDERS: Create order form, Upload your order and My orders, the Orders
/// tab's three ways in as compact buttons. Ordering needs an account: signed
/// out, the form and the upload ask to sign in first (as on the Orders tab).
class _OrdersRow extends StatelessWidget {
  const _OrdersRow(this.c);
  final AppController c;

  void _order(BuildContext context, Widget Function() screen) {
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
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Padding(
        padding: EdgeInsets.only(left: 2, bottom: 8),
        child: Text(
          'ORDERS',
          style: TextStyle(
            fontFamily: 'Rajdhani',
            fontWeight: FontWeight.w700,
            fontSize: 14,
            letterSpacing: 2.2,
            color: Palette.cyan,
          ),
        ),
      ),
      Row(
        children: [
          Expanded(
            child: _OrderButton(
              key: const ValueKey('home-order-form'),
              icon: Icons.assignment_outlined,
              label: 'Create order form',
              onTap: () => _order(context, () => OrderFormScreen(c)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _OrderButton(
              key: const ValueKey('home-order-upload'),
              icon: Icons.upload_file_outlined,
              label: 'Upload your order',
              onTap: () => _order(context, () => OrderUploadScreen(c)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _OrderButton(
              key: const ValueKey('home-my-orders'),
              icon: Icons.local_shipping_outlined,
              label: 'My orders',
              onTap: () => c.go(AppScreen.orders),
            ),
          ),
        ],
      ),
    ],
  );
}

/// A compact ORDERS button: an icon over its label, with the tiles' cyan edge.
class _OrderButton extends StatelessWidget {
  const _OrderButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: label,
    excludeSemantics: true,
    onTap: onTap,
    child: DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Palette.cyan.withValues(alpha: .16),
            blurRadius: 10,
            spreadRadius: -2,
          ),
        ],
      ),
      child: Material(
        color: const Color(0xff07121d),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: const Color(0xff1fb6ff).withValues(alpha: .6),
            width: 1.3,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            height: 82,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, color: Palette.cyan, size: 26),
                  const SizedBox(height: 7),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      height: 1.15,
                      color: Colors.white,
                    ),
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

/// 3DEEZI | PREFERRED SUPPLIERS, coming soon: a slim strip in the style of
/// the Orders tab's Rewards strip. The suppliers page comes later; nothing
/// to tap yet (the website's only partner form is the Corporate Partner
/// application, not a supplier one, so there is no link).
class _SuppliersStrip extends StatelessWidget {
  const _SuppliersStrip();

  static const _rule = Color(0xff3b4659);

  @override
  Widget build(BuildContext context) => Semantics(
    key: const ValueKey('home-suppliers'),
    label: '3DEEZI Preferred suppliers: coming soon',
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
            width: 64,
            child: Center(
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      Palette.cyan.withValues(alpha: .3),
                      Palette.cyan.withValues(alpha: 0),
                    ],
                  ),
                  border: Border.all(
                    color: Palette.cyan.withValues(alpha: .55),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Palette.cyan.withValues(alpha: .35),
                      blurRadius: 12,
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.handshake_outlined,
                  color: Palette.cyan,
                  size: 22,
                ),
              ),
            ),
          ),
          Container(
            width: 1,
            height: 40,
            margin: const EdgeInsets.only(left: 2, right: 12),
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
                        const BrandLogo(width: 80),
                        Container(
                          width: 1,
                          height: 16,
                          margin: const EdgeInsets.symmetric(horizontal: 8),
                          color: _rule,
                        ),
                        const Text(
                          'PREFERRED SUPPLIERS',
                          style: TextStyle(
                            fontFamily: 'Rajdhani',
                            fontWeight: FontWeight.w700,
                            fontSize: 20,
                            height: 1,
                            letterSpacing: .6,
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

/// "Need a hand? Ask 3DEEZI Assist →": opens the help chat.
class _AssistLink extends StatelessWidget {
  const _AssistLink();

  @override
  Widget build(BuildContext context) => TextButton(
    key: const ValueKey('home-assist-link'),
    onPressed: () => AssistController.latest?.show(),
    style: TextButton.styleFrom(
      foregroundColor: Palette.cyan,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    ),
    child: const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.auto_awesome, size: 22, color: Palette.cyan),
        SizedBox(width: 10),
        Flexible(
          child: Text(
            'Need a hand? Ask 3DEEZI Assist',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
        ),
        SizedBox(width: 10),
        Icon(Icons.arrow_forward_rounded, size: 20, color: Palette.cyan),
      ],
    ),
  );
}

/// The sports offered in Design Your Own: (name, catalogue id, kit line,
/// quick-access group for the ALL / SPORTS / APPAREL filters), from
/// lib/sports_catalog.dart (as the website's catalogue).
final dyoSports = <(String, String, String, String)>[
  for (final s in sportCategories) (s.name, s.id, s.kit, s.group),
];

/// 8 · DYO sport selection: the kits rotate on a floodlit stadium stage.
class SportCarouselScreen extends StatefulWidget {
  const SportCarouselScreen(this.c, {super.key});
  final AppController c;
  @override
  State<SportCarouselScreen> createState() => _SportCarouselScreenState();
}

class _SportCarouselScreenState extends State<SportCarouselScreen> {
  static final _n = dyoSports.length;
  late int _index = dyoSports
      .indexWhere((s) => s.$1 == widget.c.sport)
      .clamp(0, _n - 1);
  // Endless: start far from either end so it rotates both ways.
  late final PageController _pages = PageController(
    viewportFraction: .42,
    initialPage: _n * 500 + _index,
  );
  final _tiles = ScrollController();

  /// The quick-access filter: 'all', 'sports' or 'apparel'.
  String _filter = 'all';
  static const _tileWidth = 92.0, _tileGap = 10.0;

  @override
  void dispose() {
    _pages.dispose();
    _tiles.dispose();
    super.dispose();
  }

  List<int> get _shown => [
    for (var i = 0; i < _n; i++)
      if (_filter == 'all' || dyoSports[i].$4 == _filter) i,
  ];

  /// A tile turns the stage the short way round to its kit (the screen stays).
  void _goTo(int i) {
    final page = (_pages.page ?? _pages.initialPage.toDouble()).round();
    var step = (i - page % _n) % _n;
    if (step > _n / 2) step -= _n;
    if (step != 0) _step(step);
  }

  /// The stage turned: light its tile (showing all when the filter hides
  /// it) and bring the tile into view.
  void _turned(int i) {
    setState(() {
      _index = i;
      if (_filter != 'all' && dyoSports[i].$4 != _filter) _filter = 'all';
    });
    // The page turns during a frame: this setState builds the row in the
    // next one (with 29 tiles, a filter change makes it longer), so reveal
    // after that frame.
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => WidgetsBinding.instance.addPostFrameCallback((_) => _revealTile()),
    );
  }

  void _revealTile([int hops = 0]) {
    if (!mounted || !_tiles.hasClients) return;
    final at = _shown.indexOf(_index);
    if (at < 0) return;
    final p = _tiles.position;
    final left = 16 + at * (_tileWidth + _tileGap);
    if (left >= p.pixels &&
        left + _tileWidth <= p.pixels + p.viewportDimension) {
      return;
    }
    // The row's full width from the tiles shown. The lazy row only knows its
    // extent as far as it has built tiles (29 of them since 2026-10-21), so
    // a far tile is reached in hops: to the known end, then on.
    final n = _shown.length;
    final end = math.max(
      0.0,
      32 + n * _tileWidth + (n - 1) * _tileGap - p.viewportDimension,
    );
    final target = (left - (p.viewportDimension - _tileWidth) / 2).clamp(
      0.0,
      end,
    );
    if (target > p.maxScrollExtent + 1 && hops < 8) {
      _tiles.jumpTo(p.maxScrollExtent);
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _revealTile(hops + 1),
      );
      WidgetsBinding.instance.scheduleFrame();
      return;
    }
    _tiles.animateTo(
      target,
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  /// A filter that hides the chosen category turns the stage to its first
  /// one, so a tile is always lit.
  void _chooseFilter(String f) {
    setState(() => _filter = f);
    if (f != 'all' && dyoSports[_index].$4 != f) {
      final first = dyoSports.indexWhere((s) => s.$4 == f);
      if (first >= 0) _goTo(first);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_tiles.hasClients) _tiles.jumpTo(0);
      _revealTile();
    });
  }

  void _step(int delta) => _pages.animateToPage(
    (_pages.page ?? _pages.initialPage.toDouble()).round() + delta,
    duration: const Duration(milliseconds: 420),
    curve: Curves.easeOutCubic,
  );

  @override
  Widget build(BuildContext context) {
    final sport = dyoSports[_index];
    return StageBackground(
      child: Column(
        children: [
          TopBar(onBack: widget.c.back, center: const BrandLogo(width: 120)),
          const Text(
            'DESIGN YOUR OWN',
            style: TextStyle(
              color: Palette.cyan,
              fontSize: 10.5,
              letterSpacing: 2.4,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          const ScreenTitle(
            'Different sports.\n',
            highlight: 'Same team spirit.',
            size: 27,
          ),
          const SizedBox(height: 6),
          const Text(
            'Choose your sport. Swipe to rotate.',
            style: TextStyle(color: Color(0xffc4d2df), fontSize: 12),
          ),
          const SizedBox(height: 8),
          _CategoryFilters(
            groups: [
              'all',
              for (final g in const ['sports', 'apparel'])
                if (dyoSports.any((s) => s.$4 == g)) g,
            ],
            value: _filter,
            onChanged: _chooseFilter,
          ),
          SizedBox(
            height: 92,
            child: ListView.separated(
              key: const ValueKey('dyo-tiles'),
              controller: _tiles,
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
              itemCount: _shown.length,
              separatorBuilder: (_, _) => const SizedBox(width: _tileGap),
              itemBuilder: (context, k) {
                final i = _shown[k];
                return _CategoryTile(
                  name: dyoSports[i].$1,
                  category: ProjectSync.sports[dyoSports[i].$1] ?? '',
                  width: _tileWidth,
                  selected: i == _index,
                  onTap: () => _goTo(i),
                );
              },
            ),
          ),
          Expanded(
            child: Stack(
              alignment: Alignment.center,
              children: [
                // The glowing stage ring under the kits.
                Positioned(
                  bottom: 6,
                  left: 18,
                  right: 18,
                  child: Container(
                    height: 74,
                    decoration: BoxDecoration(
                      borderRadius: const BorderRadius.all(
                        Radius.elliptical(400, 74),
                      ),
                      border: Border.all(
                        color: Palette.cyan.withValues(alpha: .75),
                        width: 2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Palette.cyan.withValues(alpha: .35),
                          blurRadius: 24,
                        ),
                      ],
                    ),
                  ),
                ),
                PageView.builder(
                  controller: _pages,
                  onPageChanged: (i) => _turned(i % _n),
                  itemBuilder: (context, i) => AnimatedBuilder(
                    animation: _pages,
                    builder: (context, child) {
                      final page =
                          _pages.hasClients && _pages.position.haveDimensions
                          ? _pages.page ?? i.toDouble()
                          : _pages.initialPage.toDouble();
                      final d = (page - i).clamp(-2.0, 2.0);
                      final t = 1 - d.abs().clamp(0.0, 1.0);
                      return Transform(
                        alignment: Alignment.bottomCenter,
                        transform: Matrix4.identity()
                          ..setEntry(3, 2, .0012)
                          ..rotateY(d * .32)
                          ..scaleByDouble(.68 + .32 * t, .68 + .32 * t, 1, 1),
                        child: Opacity(
                          opacity: (.62 + .38 * t).clamp(0, 1),
                          child: child,
                        ),
                      );
                    },
                    child: GestureDetector(
                      onTap: () {
                        final current = (_pages.page ?? 0).round();
                        current == i ? _design() : _step(i - current);
                      },
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 34, top: 6),
                        child: Image.asset(
                          'assets/images/showroom/kit-${ProjectSync.sports[dyoSports[i % _n].$1] ?? 'rugby-league'}.webp',
                          fit: BoxFit.contain,
                          alignment: Alignment.bottomCenter,
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 6,
                  child: _ArrowButton(
                    icon: Icons.chevron_left_rounded,
                    onTap: () => _step(-1),
                  ),
                ),
                Positioned(
                  right: 6,
                  child: _ArrowButton(
                    icon: Icons.chevron_right_rounded,
                    onTap: () => _step(1),
                  ),
                ),
              ],
            ),
          ),
          // The centre sport's glowing label.
          Container(
            padding: const EdgeInsets.fromLTRB(26, 9, 26, 10),
            decoration: BoxDecoration(
              color: const Color(0xcc061824),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Palette.cyan, width: 2),
              boxShadow: [
                BoxShadow(
                  color: Palette.cyan.withValues(alpha: .45),
                  blurRadius: 18,
                ),
              ],
            ),
            child: Column(
              children: [
                ScreenTitle(sport.$1, size: 23),
                const SizedBox(height: 2),
                Text(
                  sport.$3,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: Color(0xffc4d2df),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // A dot each fits a dozen; more show as a count (the tiles pick any).
          if (_n <= 12)
            PageDots(count: _n, index: _index)
          else
            Text(
              '${_index + 1} / $_n',
              style: const TextStyle(
                color: Color(0xffc4d2df),
                fontSize: 12,
                letterSpacing: 1.2,
                fontWeight: FontWeight.w600,
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 14, 24, 20),
            child: GradientButton(
              label: 'DESIGN ${sport.$1.toUpperCase()}',
              icon: Icons.arrow_forward_rounded,
              onPressed: _design,
            ),
          ),
        ],
      ),
    );
  }

  void _design() {
    GarmentScreen.showAll.value = false;
    widget.c.update(() {
      widget.c.sport = dyoSports[_index].$1;
      // The sport's first garment, unless the kit already is one of its tiles.
      GarmentScreen.startOn(widget.c);
    });
    widget.c.go(AppScreen.garment);
  }
}

/// ALL · SPORTS · APPAREL over the quick-access tiles: the chosen one cyan
/// and underlined.
class _CategoryFilters extends StatelessWidget {
  const _CategoryFilters({
    required this.groups,
    required this.value,
    required this.onChanged,
  });
  final List<String> groups;
  final String value;
  final ValueChanged<String> onChanged;
  @override
  Widget build(BuildContext context) => Container(
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: Color(0x22ffffff))),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final g in groups)
          Semantics(
            button: true,
            selected: g == value,
            child: InkWell(
              onTap: () => onChanged(g),
              child: Container(
                padding: const EdgeInsets.fromLTRB(14, 6, 14, 7),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: g == value ? Palette.cyan : Colors.transparent,
                      width: 2,
                    ),
                  ),
                ),
                child: Text(
                  g.toUpperCase(),
                  style: TextStyle(
                    fontFamily: 'Rajdhani',
                    fontWeight: FontWeight.w700,
                    fontSize: 13.5,
                    letterSpacing: 1.8,
                    color: g == value ? Palette.cyan : const Color(0xffe9f1f7),
                  ),
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

/// One quick-access tile: the category's 2D outline symbol and its name.
class _CategoryTile extends StatelessWidget {
  const _CategoryTile({
    required this.name,
    required this.category,
    required this.width,
    required this.selected,
    required this.onTap,
  });
  final String name, category;
  final double width;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: selected,
    label: name,
    onTap: onTap,
    excludeSemantics: true,
    child: GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: width,
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(11),
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: selected
                ? const [Color(0xf20c2a3a), Color(0xf506131d)]
                : const [Color(0xeb0a1b28), Color(0xf2050d16)],
          ),
          border: Border.all(
            color: selected
                ? const Color(0xff38f3ff)
                : Palette.cyan.withValues(alpha: .33),
            width: selected ? 2 : 1.5,
          ),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: Palette.cyan.withValues(alpha: .55),
                    blurRadius: 12,
                  ),
                ]
              : null,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CategoryIcon(
              category,
              size: 34,
              color: selected
                  ? const Color(0xff5ff6ff)
                  : const Color(0xff19e3f2),
            ),
            const SizedBox(height: 5),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                name.toUpperCase(),
                maxLines: 1,
                style: const TextStyle(
                  fontFamily: 'Rajdhani',
                  fontWeight: FontWeight.w700,
                  fontSize: 12.5,
                  letterSpacing: .5,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _ArrowButton extends StatelessWidget {
  const _ArrowButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Material(
    color: const Color(0xcc05101a),
    shape: CircleBorder(
      side: BorderSide(color: Colors.white.withValues(alpha: .75), width: 1.5),
    ),
    shadowColor: Palette.cyan,
    elevation: 6,
    child: InkWell(
      customBorder: const CircleBorder(),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(7),
        child: Icon(icon, color: Colors.white, size: 26),
      ),
    ),
  );
}

/// The 3D garments: (name, showroom art id). "More teamwear" offers the ones
/// a sport's own tiles do not use.
const garmentTiles = <(String, String)>[
  ('Full Kit', 'fullkit'),
  ('Jersey', 'jersey'),
  ('Shorts', 'shorts'),
  ('Training Tee', 'tee'),
  ('Singlet', 'singlet'),
  ('Polo', 'polo'),
  ('Polo with pocket', 'pocketpolo'),
  ('Hoodie', 'hoodie'),
  ('Zip hoodie', 'ziphoodie'),
  ('Track jacket', 'trackjacket'),
  ('Varsity jacket', 'varsity'),
];

/// Shown in the Studio's garment list; not yet available in 3D.
const comingSoonGarments = <(String, String)>[
  ('Socks', 'socks'),
  ('Shoes', 'shoes'),
];

/// 9 · Step 2 (client visuals images/157.jpg and 160.jpg, task 9.99):
/// "<SPORT> UNIFORMS & TEAMWEAR", the sport's own garment tiles
/// (lib/sports_catalog.dart, as on the website) and "More teamwear" for every
/// other 3D garment. A tile without a 3D model of its own says which garment
/// the 3D preview uses; one with none close enough is COMING SOON.
class GarmentScreen extends StatelessWidget {
  const GarmentScreen(this.c, {super.key});
  final AppController c;

  /// "More teamwear" open (the sport chooser closes it).
  static final showAll = ValueNotifier(false);

  /// The sport's own tiles (an unknown sport: one per 3D garment).
  static List<GarmentTile> tilesFor(String sport) {
    final tiles = sportNamed(sport)?.tiles ?? const <GarmentTile>[];
    if (tiles.isNotEmpty) return tiles;
    return [for (final (name, _) in garmentTiles) GarmentTile(name, '', name)];
  }

  /// "More teamwear": the 3D garments the sport's tiles do not use (none for
  /// the client's Rugby lists).
  static List<GarmentTile> moreFor(String sport) {
    final s = sportNamed(sport);
    if (s != null && !s.more) return const [];
    final used = {for (final t in tilesFor(sport)) t.garment};
    return [
      for (final (name, _) in garmentTiles)
        if (!used.contains(name)) GarmentTile(name, '', name),
    ];
  }

  /// The tile the kit was chosen as: by its name; a plain 3D garment from
  /// "More teamwear" has an empty name.
  static GarmentTile? current(AppController c) {
    if (c.productName.isNotEmpty) {
      for (final t in tilesFor(c.sport)) {
        if (t.name == c.productName && t.garment == c.garment) return t;
      }
      return null;
    }
    for (final t in moreFor(c.sport)) {
      if (t.garment == c.garment) return t;
    }
    return null;
  }

  /// Puts the tile on the kit: its 3D garment, its name and its settings.
  static void choose(AppController c, GarmentTile t, {bool plain = false}) {
    if (t.garment == null) return;
    c.garment = t.garment!;
    c.productName = plain ? '' : t.name;
    // A tile without a style of its own is the plain (collar) track jacket,
    // also after a hooded tile was chosen (QA U: the hood was kept).
    c.trackStyle = t.trackStyle ?? 'collar';
  }

  /// A new sport (or a garment left from another one) starts on its first
  /// garment that can be designed.
  static void startOn(AppController c) {
    final tiles = tilesFor(c.sport);
    final mine =
        c.productName.isNotEmpty &&
        tiles.any((t) => t.name == c.productName && t.garment == c.garment);
    if (mine) return;
    for (final t in tiles) {
      if (!t.soon) return choose(c, t);
    }
  }

  /// The project's name when the kit opens: the tile's name ("Netball
  /// dress"), with the sport first when the name does not say it.
  static String projectNameFor(AppController c) {
    final label = c.garmentLabel;
    return label.toLowerCase().contains(c.sport.toLowerCase())
        ? label
        : '${c.sport} $label';
  }

  Widget _tile(
    BuildContext context,
    GarmentTile t, {
    bool selected = false,
    bool plain = false,
    bool described = true,
  }) {
    final soon = t.soon;
    final art = plain ? garmentIds[t.garment] ?? 'jersey' : t.art;
    final uses = t.fit == 'nearest' ? t.garment : null;
    return Semantics(
      label: t.name,
      selected: selected,
      button: !soon,
      child: Opacity(
        opacity: soon ? .6 : 1,
        child: GlowCard(
          key: ValueKey('garment-tile-${t.name}'),
          selected: selected,
          glow: selected,
          onTap: soon
              ? () => showToast(context, '${t.name}: coming soon in 3D.')
              : () => c.update(() => choose(c, t, plain: plain)),
          child: Stack(
            fit: StackFit.expand,
            children: [
              Padding(
                padding: EdgeInsets.fromLTRB(8, soon ? 24 : 8, 8, 0),
                child: Column(
                  children: [
                    Expanded(
                      child: Image.asset(
                        'assets/images/showroom/garment-$art.webp',
                        fit: BoxFit.contain,
                        // A picture still to come shows its 3D garment's.
                        errorBuilder: (_, _, _) => Image.asset(
                          'assets/images/showroom/garment-${garmentIds[t.garment] ?? 'jersey'}.webp',
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      t.name.toUpperCase(),
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontFamily: 'Rajdhani',
                        fontSize: 15,
                        height: 1.05,
                        fontWeight: FontWeight.w700,
                        letterSpacing: .5,
                      ),
                    ),
                    if (described && t.description.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          t.description,
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xffb7c6d6),
                            fontSize: 10.5,
                            height: 1.2,
                          ),
                        ),
                      ),
                    if (uses != null && described)
                      Text(
                        '3D preview uses ${uses.toLowerCase()}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Color(0xff5fdcea),
                          fontSize: 9.5,
                        ),
                      ),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
              if (selected)
                const Positioned(
                  top: 8,
                  right: 8,
                  child: Icon(
                    Icons.check_circle_rounded,
                    color: Palette.cyan,
                    size: 22,
                  ),
                ),
              if (soon)
                Positioned(
                  top: 8,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0x337560ff),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: const Color(0x997560ff)),
                      ),
                      child: const Text(
                        'COMING SOON',
                        style: TextStyle(fontSize: 8.5, letterSpacing: 1.2),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  SliverGrid _grid(List<Widget> children, {bool described = true}) =>
      SliverGrid.count(
        crossAxisCount: 2,
        mainAxisSpacing: described ? 12 : 10,
        crossAxisSpacing: described ? 12 : 10,
        // Names only (the client's American Football list): shorter tiles.
        childAspectRatio: described ? .68 : .92,
        children: children,
      );

  @override
  Widget build(BuildContext context) {
    final sport = sportNamed(c.sport);
    final title = sport?.heading ?? c.sport;
    final heading = sport?.group == 'apparel'
        ? '$title teamwear'
        : '$title uniforms & teamwear';
    final tiles = tilesFor(c.sport), more = moreFor(c.sport);
    final chosen = current(c);
    // Per-sport settings (config/catalog.php): subtitle, hint, names only and
    // an own background.
    final described = sport?.descriptions ?? true;
    final hint = sport?.selectHint;
    return StageBackground(
      dim: true,
      image: sport?.backdrop,
      child: Column(
        children: [
          TopBar(onBack: c.back),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: Palette.cyan, width: 2),
                    boxShadow: [
                      BoxShadow(
                        color: Palette.cyan.withValues(alpha: .45),
                        blurRadius: 12,
                      ),
                    ],
                  ),
                  child: const Text(
                    '2',
                    style: TextStyle(
                      fontFamily: 'Rajdhani',
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ScreenTitle(heading, size: 22, align: TextAlign.left),
                      Text(
                        sport?.subtitle ??
                            'Choose what you want to design for $title.',
                        style: const TextStyle(
                          color: Color(0xffc4d2df),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ValueListenableBuilder(
              valueListenable: showAll,
              builder: (context, all, _) => CustomScrollView(
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(18, 4, 18, 0),
                    sliver: _grid([
                      for (final t in tiles)
                        _tile(
                          context,
                          t,
                          described: described,
                          selected:
                              chosen != null &&
                              c.productName == t.name &&
                              chosen.garment == t.garment,
                        ),
                    ], described: described),
                  ),
                  if (more.isNotEmpty)
                    SliverToBoxAdapter(
                      child: Center(
                        child: TextButton(
                          key: const ValueKey('more-teamwear'),
                          onPressed: () => showAll.value = !all,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                all ? 'Less teamwear' : 'More teamwear',
                                style: const TextStyle(
                                  color: Palette.cyan,
                                  fontSize: 14,
                                ),
                              ),
                              Icon(
                                all
                                    ? Icons.expand_less_rounded
                                    : Icons.chevron_right_rounded,
                                color: Palette.cyan,
                                size: 18,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  if (all && more.isNotEmpty)
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(18, 0, 18, 10),
                      sliver: _grid([
                        for (final t in more)
                          _tile(
                            context,
                            t,
                            plain: true,
                            selected:
                                chosen != null &&
                                c.productName.isEmpty &&
                                chosen.garment == t.garment,
                          ),
                      ]),
                    ),
                  const SliverToBoxAdapter(child: SizedBox(height: 10)),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 6, 18, 8),
            child: Column(
              children: [
                if (hint != null)
                  Padding(
                    key: const ValueKey('garment-hint'),
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      hint,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Color(0xff3fd2ee),
                        fontSize: 13,
                      ),
                    ),
                  ),
                GradientButton(
                  label: 'CONTINUE TO STUDIO',
                  icon: Icons.arrow_forward_rounded,
                  onPressed: chosen == null
                      ? null
                      : () {
                          c.update(() => c.projectName = projectNameFor(c));
                          c.go(AppScreen.studio);
                        },
                ),
                TextButton.icon(
                  onPressed: c.back,
                  icon: const Icon(Icons.arrow_back_rounded, size: 18),
                  label: const Text('Change sport'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// CONVERT: pick a photo, sketch or mockup and open it as an editable 3D kit.
Future<void> convertFlow(BuildContext context, AppController c) async {
  if (!AiService.enabled) {
    showToast(context, 'Convert needs AI, which is not set up in this build.');
    return;
  }
  final image = await pickPhoto(context);
  if (image == null || !context.mounted) return;
  final navigator = Navigator.of(context);
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => const PopScope(
      canPop: false,
      child: Dialog(
        backgroundColor: Palette.surface,
        child: Padding(
          padding: EdgeInsets.fromLTRB(22, 26, 22, 26),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ScreenTitle('Converting your design…', size: 21),
              SizedBox(height: 6),
              Text(
                'Reading colours, pattern and lettering.',
                style: TextStyle(color: Palette.muted, fontSize: 12),
              ),
              SizedBox(height: 18),
              EmblemLoader(size: 180),
            ],
          ),
        ),
      ),
    ),
  );
  try {
    await c.convertImage(image);
    navigator.pop();
  } on AiException catch (e) {
    navigator.pop();
    if (context.mounted) showToast(context, e.message);
  } on Object {
    // Any other failure must not leave the user behind this un-closable
    // dialog (no Back button on an iPhone).
    navigator.pop();
    if (context.mounted) {
      showToast(context, 'Convert did not finish. Please try again.');
    }
  }
}
