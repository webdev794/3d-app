import 'package:flutter/material.dart';

import '../ai_service.dart';
import '../app_controller.dart';
import '../project_sync.dart';
import '../widgets/flow_ui.dart';
import '../widgets/showroom.dart';
import '../widgets/ui.dart';

/// 4 · Create home: choose AI Powered or Design Your Own.
class CreateHomeScreen extends StatelessWidget {
  const CreateHomeScreen(this.c, {super.key});
  final AppController c;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Expanded(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
          child: Column(
            children: [
              const BrandLogo(width: 175, tagline: true),
              const SizedBox(height: 18),
              const ScreenTitle(
                'How do you want to\n',
                highlight: 'create?',
                size: 25,
              ),
              const SizedBox(height: 16),
              Expanded(
                child: _ModeCard(
                  art: 'assets/images/art/home_ai.jpg',
                  title: 'AI Powered',
                  caption: 'Sportswear',
                  body: 'Let 3DEEZI create it for you.',
                  action: 'START WITH AI',
                  onTap: c.startAi,
                ),
              ),
              const SizedBox(height: 14),
              Expanded(
                child: _ModeCard(
                  art: 'assets/images/art/home_dyo.jpg',
                  title: 'Design your own',
                  body: 'Choose your sport and build it yourself.',
                  action: 'START DESIGNING',
                  onTap: c.startDyo,
                ),
              ),
              const SizedBox(height: 12),
              SecondaryButton(
                label: 'Convert an image to 3D',
                icon: Icons.document_scanner_outlined,
                onPressed: () => convertFlow(context, c),
              ),
            ],
          ),
        ),
      ),
      BottomNav(controller: c),
    ],
  );
}

class _ModeCard extends StatelessWidget {
  const _ModeCard({
    required this.art,
    required this.title,
    required this.body,
    required this.action,
    required this.onTap,
    this.caption,
  });
  final String art, title, body, action;
  final String? caption;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GlowCard(
    onTap: onTap,
    child: Stack(
      fit: StackFit.expand,
      children: [
        artImage(asset: art, alignment: const Alignment(0, -.2)),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x00000000), Color(0xe6020508)],
              stops: [.35, .95],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.end,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ScreenTitle(title, size: 24, align: TextAlign.left),
              if (caption != null)
                Text(
                  caption!.toUpperCase(),
                  style: const TextStyle(
                    color: Palette.cyan,
                    fontSize: 12,
                    letterSpacing: 4.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              const SizedBox(height: 3),
              Text(
                body,
                style: const TextStyle(fontSize: 12, color: Color(0xffc9d6e0)),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: 215,
                child: GradientButton(
                  label: action,
                  icon: Icons.arrow_forward_rounded,
                  compact: true,
                  onPressed: onTap,
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
