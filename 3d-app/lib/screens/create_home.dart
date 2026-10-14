import 'package:flutter/material.dart';

import '../ai_service.dart';
import '../app_controller.dart';
import '../project_sync.dart';
import '../widgets/flow_ui.dart';
import '../widgets/showroom.dart';
import '../widgets/ui.dart';

/// 4 · Create home, as the website: a stadium hero, then three glowing
/// paths (AI Powered, Design Your Own, Artboard).
class CreateHomeScreen extends StatefulWidget {
  const CreateHomeScreen(this.c, {super.key});
  final AppController c;
  @override
  State<CreateHomeScreen> createState() => _CreateHomeScreenState();
}

class _CreateHomeScreenState extends State<CreateHomeScreen> {
  final _paths = GlobalKey();

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.only(bottom: 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _Hero(
                  onStart: () => Scrollable.ensureVisible(
                    _paths.currentContext!,
                    duration: const Duration(milliseconds: 450),
                    curve: Curves.easeOut,
                  ),
                  onStudio: c.exploreStudio,
                ),
                Padding(
                  key: _paths,
                  padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const ScreenTitle(
                        'How do you want to ',
                        highlight: 'create?',
                        size: 24,
                      ),
                      const SizedBox(height: 14),
                      _PathCard(
                        art: 'assets/images/art/home_ai.jpg',
                        icon: Icons.auto_awesome,
                        title: 'AI POWERED',
                        sub: 'SPORTSWEAR',
                        body:
                            'Describe it. Create it. Refine it.\nTurn your brief into your next kit.',
                        action: 'START WITH AI',
                        onTap: c.startAi,
                      ),
                      const SizedBox(height: 16),
                      _PathCard(
                        art: 'assets/images/art/home_dyo.jpg',
                        icon: Icons.view_in_ar_outlined,
                        title: 'DESIGN',
                        sub: 'YOUR OWN',
                        body:
                            'Choose your sport. Customize every\ndetail in 3D. Make it yours.',
                        action: 'START DESIGNING',
                        onTap: c.startDyo,
                      ),
                      const SizedBox(height: 16),
                      _PathCard(
                        illustration: const _MiniArtboard(),
                        icon: Icons.draw_outlined,
                        title: '3DEEZI',
                        sub: 'ARTBOARD',
                        body:
                            'Arrange logos, shapes, and artwork.\nBring your composition into the 3D kit.',
                        action: 'OPEN ARTBOARD',
                        onTap: () => c.go(AppScreen.artboard),
                      ),
                      const SizedBox(height: 18),
                      SecondaryButton(
                        label: 'Convert an image to 3D',
                        icon: Icons.document_scanner_outlined,
                        onPressed: () => convertFlow(context, c),
                      ),
                      const SizedBox(height: 10),
                      SecondaryButton(
                        label: 'Plans & pricing',
                        icon: Icons.workspace_premium_outlined,
                        onPressed: () => c.go(AppScreen.pricing),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        BottomNav(controller: c),
      ],
    );
  }
}

/// Floodlit stadium hero with the campaign line.
class _Hero extends StatelessWidget {
  const _Hero({required this.onStart, required this.onStudio});
  final VoidCallback onStart, onStudio;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 450,
    child: Stack(
      fit: StackFit.expand,
      children: [
        artImage(
          asset: 'assets/images/art/home_hero.webp',
          alignment: const Alignment(.55, 0),
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: [Color(0xf2020509), Color(0x99020509), Color(0x00020509)],
              stops: [0, .55, 1],
            ),
          ),
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x00000000), Color(0xff05090d)],
              stops: [.7, 1],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const BrandLogo(width: 120, tagline: true),
              const Spacer(),
              const Text(
                'FROM IDEA TO YOUR TEAM’S NEXT KIT',
                style: TextStyle(
                  color: Palette.cyan,
                  fontSize: 9.5,
                  letterSpacing: 2.2,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              const Text.rich(
                TextSpan(
                  children: [
                    TextSpan(text: 'YOUR NEXT\n'),
                    TextSpan(
                      text: 'GAME CHANGER.\n',
                      style: TextStyle(color: Palette.cyan),
                    ),
                    TextSpan(text: 'STARTS HERE.'),
                  ],
                ),
                style: TextStyle(
                  fontFamily: 'Rajdhani',
                  fontWeight: FontWeight.w700,
                  fontSize: 36,
                  height: .98,
                  shadows: [Shadow(color: Color(0xaa000000), blurRadius: 12)],
                ),
              ),
              const SizedBox(height: 8),
              const SizedBox(
                width: 260,
                child: Text(
                  'Create sportswear with AI, real-time 3D, and your own artwork.',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: Color(0xffc9d6e0)),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: 230,
                child: GradientButton(
                  label: 'START CREATING',
                  icon: Icons.arrow_forward_rounded,
                  compact: true,
                  onPressed: onStart,
                ),
              ),
              const SizedBox(height: 4),
              TextButton.icon(
                onPressed: onStudio,
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                ),
                icon: const Icon(Icons.view_in_ar_outlined, size: 17),
                label: const Text(
                  'EXPLORE THE 3D STUDIO  →',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

/// A creation path tile with the website's cyan glow.
class _PathCard extends StatelessWidget {
  const _PathCard({
    this.art,
    this.illustration,
    required this.icon,
    required this.title,
    required this.sub,
    required this.body,
    required this.action,
    required this.onTap,
  });
  final String? art;
  final Widget? illustration;
  final IconData icon;
  final String title, sub, body, action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: '$title $sub',
    child: DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Palette.cyan.withValues(alpha: .33),
            blurRadius: 18,
            spreadRadius: -1,
          ),
          BoxShadow(
            color: Palette.cyan.withValues(alpha: .15),
            blurRadius: 46,
            spreadRadius: -4,
          ),
        ],
      ),
      child: Material(
        color: const Color(0xff061725),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: Palette.cyan.withValues(alpha: .67),
            width: 2,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            height: 232,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (art != null)
                  artImage(asset: art!, alignment: const Alignment(.6, -.2)),
                if (illustration != null)
                  Align(alignment: Alignment.topRight, child: illustration),
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                      colors: [
                        Color(0xee020810),
                        Color(0x55020810),
                        Color(0x00020810),
                      ],
                      stops: [0, .6, 1],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(icon, color: Palette.cyan, size: 26),
                          const SizedBox(width: 10),
                          Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(text: '$title\n'),
                                TextSpan(
                                  text: sub,
                                  style: const TextStyle(color: Palette.cyan),
                                ),
                              ],
                            ),
                            style: const TextStyle(
                              fontFamily: 'Rajdhani',
                              fontWeight: FontWeight.w700,
                              fontSize: 24,
                              height: 1,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        // Leave room for the Artboard tile's picture.
                        width: illustration == null ? null : 150,
                        child: Text(
                          illustration == null
                              ? body
                              : body.replaceAll('\n', ' '),
                          maxLines: 4,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xffc9d6e0),
                            height: 1.35,
                          ),
                        ),
                      ),
                      const Spacer(),
                      OutlinedButton.icon(
                        onPressed: onTap,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Palette.cyan,
                          side: const BorderSide(
                            color: Palette.cyan,
                            width: 1.4,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                        ),
                        iconAlignment: IconAlignment.end,
                        icon: const Icon(Icons.arrow_forward_rounded, size: 17),
                        label: Text(
                          action,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: .6,
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
}

/// The Artboard tile's picture: a tiny editor with the 3DEEZI emblem.
class _MiniArtboard extends StatelessWidget {
  const _MiniArtboard();

  @override
  Widget build(BuildContext context) => Container(
    width: 170,
    height: 150,
    margin: const EdgeInsets.fromLTRB(0, 18, 14, 0),
    decoration: BoxDecoration(
      color: const Color(0xff0b1622),
      borderRadius: BorderRadius.circular(10),
      border: Border.all(color: const Color(0xff234257)),
      boxShadow: [
        BoxShadow(color: Palette.cyan.withValues(alpha: .18), blurRadius: 18),
      ],
    ),
    child: Column(
      children: [
        Container(
          height: 16,
          padding: const EdgeInsets.symmetric(horizontal: 6),
          decoration: const BoxDecoration(
            color: Color(0xff1a2233),
            borderRadius: BorderRadius.vertical(top: Radius.circular(10)),
          ),
          child: Row(
            children: [
              for (final c in const [
                Color(0xffff5f57),
                Color(0xfffebc2e),
                Color(0xff28c840),
              ])
                Container(
                  width: 6,
                  height: 6,
                  margin: const EdgeInsets.only(right: 4),
                  decoration: BoxDecoration(color: c, shape: BoxShape.circle),
                ),
            ],
          ),
        ),
        Expanded(
          child: Row(
            children: [
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 5, vertical: 6),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    Icon(Icons.near_me_outlined, size: 13, color: Palette.cyan),
                    Icon(Icons.draw_outlined, size: 13, color: Palette.muted),
                    Icon(Icons.text_fields, size: 13, color: Palette.muted),
                    Icon(Icons.layers_outlined, size: 13, color: Palette.muted),
                  ],
                ),
              ),
              Expanded(
                child: Container(
                  margin: const EdgeInsets.fromLTRB(0, 6, 6, 6),
                  color: Colors.white,
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Image.asset(
                      'assets/images/emblem-final.png',
                      fit: BoxFit.contain,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (final c in const [
                Palette.cyan,
                Palette.blue,
                Color(0xff7b4dff),
                Color(0xffe8edf2),
              ])
                Container(
                  width: 12,
                  height: 12,
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  decoration: BoxDecoration(
                    color: c,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
            ],
          ),
        ),
      ],
    ),
  );
}

/// The sports offered in Design Your Own, with their artwork and kit line.
const dyoSports = <(String, String, String)>[
  ('Rugby League', 'sport_rugby_league', 'Jersey + Shorts'),
  ('Basketball', 'sport_basketball', 'Singlet + Shorts'),
  ('Soccer', 'sport_soccer', 'Jersey + Shorts'),
  ('AFL', 'sport_afl', 'Guernsey + Shorts'),
  ('Netball', 'sport_netball', 'Dress + Bodysuit'),
  ('Rugby Union', 'sport_rugby_union', 'Jersey + Shorts'),
  ('Ice Hockey', 'sport_ice_hockey', 'Jersey + Socks'),
  ('Training / Gym', 'sport_training', 'Tee + Hoodie'),
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

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
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
                  onPageChanged: (i) => setState(() => _index = i % _n),
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
          PageDots(count: _n, index: _index),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 14, 24, 20),
            child: GradientButton(
              label: 'DESIGN THIS SPORT',
              icon: Icons.arrow_forward_rounded,
              onPressed: _design,
            ),
          ),
        ],
      ),
    );
  }

  void _design() {
    widget.c.update(() => widget.c.sport = dyoSports[_index].$1);
    widget.c.go(AppScreen.garment);
  }
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

/// The garments offered: (name, showroom art id).
const garmentTiles = <(String, String)>[
  ('Full Kit', 'fullkit'),
  ('Jersey', 'jersey'),
  ('Shorts', 'shorts'),
  ('Training Tee', 'tee'),
  ('Singlet', 'singlet'),
  ('Polo', 'polo'),
];

/// Shown with the garments; not yet available in 3D.
const comingSoonGarments = <(String, String)>[
  ('Socks', 'socks'),
  ('Shoes', 'shoes'),
];

/// 9 · Select garment for the chosen sport.
class GarmentScreen extends StatelessWidget {
  const GarmentScreen(this.c, {super.key});
  final AppController c;

  Widget _tile(
    String name,
    String art, {
    bool selected = false,
    bool soon = false,
    VoidCallback? onTap,
  }) => Opacity(
    opacity: soon ? .55 : 1,
    child: GlowCard(
      selected: selected,
      glow: selected,
      onTap: onTap,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(10, soon ? 26 : 10, 10, 34),
            child: Image.asset(
              'assets/images/showroom/garment-$art.webp',
              fit: BoxFit.contain,
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                name,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          if (selected)
            const Positioned(
              top: 9,
              right: 9,
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
  );

  @override
  Widget build(BuildContext context) => StageBackground(
    dim: true,
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
                    const ScreenTitle(
                      'Select garment',
                      size: 24,
                      align: TextAlign.left,
                    ),
                    Text(
                      'Choose what you want to design for ${c.sport}.',
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
          child: GridView.count(
            crossAxisCount: 2,
            padding: const EdgeInsets.fromLTRB(18, 4, 18, 10),
            mainAxisSpacing: 14,
            crossAxisSpacing: 14,
            childAspectRatio: .9,
            children: [
              for (final (name, art) in garmentTiles)
                _tile(
                  name,
                  art,
                  selected: c.garment == name,
                  onTap: () => c.update(() => c.garment = name),
                ),
              for (final (name, art) in comingSoonGarments)
                _tile(
                  name,
                  art,
                  soon: true,
                  onTap: () =>
                      showToast(context, '$name are coming soon in 3D.'),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 6, 18, 8),
          child: Column(
            children: [
              GradientButton(
                label: 'CONTINUE TO STUDIO',
                icon: Icons.arrow_forward_rounded,
                onPressed: () {
                  c.update(() => c.projectName = '${c.sport} ${c.garment}');
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
  }
}
