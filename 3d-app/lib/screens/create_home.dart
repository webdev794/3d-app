import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart' show DragStartBehavior;
import 'package:flutter/material.dart';

import '../accessory_art.dart';
import '../ai_service.dart';
import '../api_client.dart';
import '../app_controller.dart';
import '../assist.dart';
import '../custom_choice.dart';
import '../project_sync.dart';
import '../sports_catalog.dart';
import '../widgets/bubble_page.dart'
    show BubblePage, BubbleCornerPill, BubbleFillScroll;
import '../widgets/category_icon.dart';
import '../widgets/flow_ui.dart';
import '../widgets/glass_bubble.dart' show GlassRim;
import '../widgets/notification_bell.dart';
import '../widgets/showroom.dart';
import '../widgets/ui.dart';
import 'ai_designer.dart' show cropCrest;
import 'signage.dart' show SignageBar;
import 'team.dart' show TeamScreen;

/// 4 · Home (client mock-up images/197.jpg, 2026-10-28): the 3DEEZI wordmark
/// with the bell, "LET'S CREATE", four picture tiles with titles only (AI
/// DESIGNER, DESIGN YOUR OWN, ARTBOARD, DESIGN TEAM), the slim ARTWORK TO 3D
/// bar (Convert), then the Assist link. Ordering lives on the Orders tab.
class CreateHomeScreen extends StatelessWidget {
  const CreateHomeScreen(this.c, {super.key, this.onTryNewHome});
  final AppController c;

  /// Phones: "Try the new home" under the logo row opens the glass-bubble
  /// home (lib/screens/home_switcher.dart); null hides it.
  final VoidCallback? onTryNewHome;

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
                            // Offered by the switcher on phones (and in the
                            // desktop preview's phone frame).
                            if (onTryNewHome != null)
                              Center(child: _TryNewHome(onTap: onTryNewHome!)),
                            const SizedBox(height: 14),
                            Text.rich(
                              const TextSpan(
                                children: [
                                  TextSpan(text: 'LET’S '),
                                  TextSpan(
                                    text: 'CREATE',
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
                                title: 'DESIGN TEAM',
                                sub: 'Let our designers help',
                                onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute<void>(
                                    builder: (_) => TeamScreen(c),
                                  ),
                                ),
                              ),
                            ),
                            // INSTANT 3D FROM ARTWORK (client 2026-10-26, as
                            // on the website's home page): Convert's way in,
                            // above ORDERS (it replaced a small grey line).
                            const SizedBox(height: 14),
                            _ArtworkBar(
                              onTap: () => artworkTo3dFlow(context, c),
                            ),
                            // SIGNAGE & MARQUEES (client 2026-11-02, the
                            // website's menu item): marquees and signage.
                            const SizedBox(height: 8),
                            SignageBar(c),
                            const SizedBox(height: 8),
                            const Center(child: _AssistLink()),
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

/// "Try the new home" (phones, client 2026-10-30): a small glass pill under
/// the logo row; its tap area is the full 48 px.
class _TryNewHome extends StatelessWidget {
  const _TryNewHome({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => TextButton.icon(
    key: const ValueKey('home-try-new'),
    onPressed: onTap,
    icon: const Icon(Icons.bubble_chart_outlined, size: 17),
    label: const Text('Try the new home'),
    style: TextButton.styleFrom(
      foregroundColor: Palette.cyan,
      backgroundColor: const Color(0x2212e1f0),
      shape: StadiumBorder(
        side: BorderSide(color: Palette.cyan.withValues(alpha: .55)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14),
      minimumSize: const Size(0, 34),
      tapTargetSize: MaterialTapTargetSize.padded,
      visualDensity: VisualDensity.compact,
      textStyle: const TextStyle(
        fontSize: 12.5,
        fontWeight: FontWeight.w600,
        letterSpacing: .3,
      ),
    ),
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
                                fontSize: 22 * s,
                                height: 1.1,
                                letterSpacing: .3,
                                color: Colors.white,
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

/// ARTWORK TO 3D › (client mock-up 2026-10-28): one slim glowing bar with
/// the artwork-to-3D picture; it starts Convert ([onTap]).
class _ArtworkBar extends StatelessWidget {
  const _ArtworkBar({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    key: const ValueKey('home-artwork-bar'),
    button: true,
    label: 'Artwork to 3D',
    excludeSemantics: true,
    onTap: onTap,
    child: Material(
      color: const Color(0xff071a2b),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: const Color(0xff1fb6ff).withValues(alpha: .85),
          width: 1.5,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: Row(
            children: [
              const SizedBox(
                width: 105,
                height: 60,
                child: FittedBox(child: _ArtworkTo3d()),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    'ARTWORK TO 3D',
                    maxLines: 1,
                    style: TextStyle(
                      fontFamily: 'Rajdhani',
                      fontWeight: FontWeight.w700,
                      fontSize: 22,
                      letterSpacing: .5,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.chevron_right_rounded,
                color: Palette.cyan,
                size: 30,
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

/// The bar's picture, as on the website: a flat jersey artwork on the
/// artboard (selection frame and handles), the glowing 3D step, the 3D kit.
class _ArtworkTo3d extends StatelessWidget {
  const _ArtworkTo3d();

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 140,
    height: 80,
    child: Stack(
      clipBehavior: Clip.none,
      children: [
        // The arrow from the artwork to the kit.
        Positioned(
          left: 44,
          width: 40,
          top: 39,
          child: Container(
            height: 2,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(2),
              gradient: const LinearGradient(
                colors: [
                  Color(0x4012e1f0),
                  Color(0xff12e1f0),
                  Color(0xff8c5cff),
                ],
              ),
              boxShadow: [
                BoxShadow(
                  color: Palette.cyan.withValues(alpha: .55),
                  blurRadius: 6,
                ),
              ],
            ),
          ),
        ),
        Positioned(
          left: 78,
          top: 36.5,
          child: Transform.rotate(
            angle: math.pi / 4,
            child: Container(
              width: 7,
              height: 7,
              decoration: const BoxDecoration(
                border: Border(
                  top: BorderSide(color: Color(0xff8c5cff), width: 2),
                  right: BorderSide(color: Color(0xff8c5cff), width: 2),
                ),
              ),
            ),
          ),
        ),
        // The kit, backlit.
        Positioned(
          left: 80,
          top: 8,
          width: 60,
          height: 64,
          child: DecoratedBox(
            decoration: const BoxDecoration(
              gradient: RadialGradient(
                center: Alignment(0, .15),
                radius: .62,
                colors: [
                  Color(0x8c2f86ff),
                  Color(0x261f7bff),
                  Color(0x001f7bff),
                ],
                stops: [0, .5, 1],
              ),
            ),
            child: Image.asset(
              'assets/images/showroom/garment-jersey.webp',
              fit: BoxFit.contain,
              filterQuality: FilterQuality.medium,
            ),
          ),
        ),
        // The flat artwork on the artboard, tilted.
        Positioned(
          left: 2,
          top: 10,
          child: Transform.rotate(
            angle: -6 * math.pi / 180,
            child: Container(
              width: 46,
              height: 56,
              decoration: BoxDecoration(
                color: const Color(0xff061420),
                borderRadius: BorderRadius.circular(3),
                border: Border.all(color: const Color(0xc400d9ed)),
                boxShadow: [
                  const BoxShadow(
                    color: Color(0xb0000000),
                    blurRadius: 10,
                    offset: Offset(0, 5),
                  ),
                  BoxShadow(
                    color: Palette.cyan.withValues(alpha: .18),
                    blurRadius: 10,
                  ),
                ],
              ),
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  const Center(
                    child: CustomPaint(
                      size: Size.square(36),
                      painter: _FlatJerseyPainter(),
                    ),
                  ),
                  for (final corner in const [
                    Alignment.topLeft,
                    Alignment.topRight,
                    Alignment.bottomLeft,
                    Alignment.bottomRight,
                  ])
                    Align(
                      alignment: corner,
                      child: Transform.translate(
                        offset: Offset(corner.x * 3, corner.y * 3),
                        child: Container(
                          width: 5,
                          height: 5,
                          decoration: BoxDecoration(
                            color: const Color(0xffd5ffff),
                            border: Border.all(color: const Color(0xff00d9ed)),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        // The 3D step on the arrow.
        Positioned(
          left: 45,
          top: 27,
          child: Container(
            width: 26,
            height: 26,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xff12e2f1), Color(0xff6d74ff)],
              ),
              border: Border.all(color: const Color(0xff071a2b), width: 2.5),
              boxShadow: [
                BoxShadow(
                  color: Palette.cyan.withValues(alpha: .6),
                  blurRadius: 10,
                ),
              ],
            ),
            child: const Text(
              '3D',
              style: TextStyle(
                fontFamily: 'Rajdhani',
                fontWeight: FontWeight.w700,
                fontSize: 10.5,
                height: 1,
                color: Color(0xff04192b),
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

/// A flat jersey in the 3DEEZI kit style (the website's GarmentIcon jersey,
/// 64-unit grid): navy with cyan and electric-blue flashes, a cyan collar.
class _FlatJerseyPainter extends CustomPainter {
  const _FlatJerseyPainter();

  static final _body = parseSvgPath(
    'M22 7 12 10.5 3 19.5 9.5 30 16 26.5V58H48V26.5L54.5 30 61 19.5 52 10.5 '
    '42 7C40.3 12.6 36.6 15.4 32 15.4C27.4 15.4 23.7 12.6 22 7Z',
  );
  static final _collar = parseSvgPath(
    'M22 7C23.7 12.6 27.4 15.4 32 15.4C36.6 15.4 40.3 12.6 42 7',
  );
  static final _flashes = [
    (parseSvgPath('M44 14 58 14 30 62 16 62Z'), .9),
    (parseSvgPath('M58 22 64 22 40 62 34 62Z'), .63),
    (parseSvgPath('M4 36 10 33 4 60 0 60Z'), .5),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 64, size.height / 64);
    const box = Rect.fromLTWH(0, 0, 64, 64);
    canvas.drawPath(
      _body,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xff173a63), Color(0xff0a1a30), Color(0xff040a14)],
          stops: [0, .55, 1],
        ).createShader(box),
    );
    canvas.save();
    canvas.clipPath(_body);
    for (final (path, opacity) in _flashes) {
      canvas.drawPath(
        path,
        Paint()
          ..shader = LinearGradient(
            colors: [
              const Color(0xff12e1f0).withValues(alpha: opacity),
              const Color(0xff2a6bff).withValues(alpha: opacity),
            ],
          ).createShader(box),
      );
    }
    canvas.restore();
    canvas.drawPath(
      _body,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..strokeJoin = StrokeJoin.round
        ..color = const Color(0xff2b5f8c),
    );
    canvas.drawPath(
      _collar,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2
        ..strokeJoin = StrokeJoin.round
        ..color = const Color(0xff12e1f0),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_FlatJerseyPainter old) => false;
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
  static const _cell = .46;
  late final PageController _pages = PageController(
    viewportFraction: _cell,
    initialPage: _n * 500 + _index,
  );

  /// Where each kit picture's garment starts and ends across the picture
  /// (fractions of its width, measured on the transparent pictures). The
  /// stage packs the kits by these, so a side kit sits just next to the
  /// centre one whatever its shape (user 2026-11-06: the side kits sat far
  /// out with big empty gaps). A picture not listed counts as (.1, .9).
  static const _kitSpan = <String, (double, double)>{
    'afl': (.24, .76),
    'american-football': (.15, .85),
    'athletics': (.16, .84),
    'basketball': (.24, .76),
    'bmx': (.21, .79),
    'cricket': (.21, .79),
    'cycling': (.11, .89),
    'darts': (.16, .84),
    'esports': (.15, .85),
    'fight-wear': (.05, .95),
    'fishing': (.04, .96),
    'football': (.09, .91),
    'golf': (.04, .96),
    'gymwear': (.18, .82),
    'headwear': (.05, .91),
    'hockey': (.08, .93),
    'lacrosse': (.18, .82),
    'lawn-bowls': (.09, .91),
    'netball': (.16, .84),
    'rugby-league': (.10, .90),
    'rugby-union': (.11, .89),
    'school-leavers': (.04, .96),
    'softball': (.20, .80),
    'swimming': (.23, .77),
    'teamwear': (.07, .93),
    'tennis': (.10, .90),
    'touch': (.06, .94),
    'training': (.22, .79),
    'volleyball': (.04, .96),
    'workwear': (.21, .79),
  };

  static String _kitSlug(int i) =>
      ProjectSync.sports[dyoSports[i % _n].$1] ?? 'rugby-league';

  /// A kit's size on the stage: full in the centre, .68 at the sides.
  static double _kitScale(int i, double page) =>
      .68 + .32 * (1 - (page - i).abs().clamp(0.0, 1.0));

  /// Centre-to-centre distance of kits [i] and [i] + 1: the garments' own
  /// half widths (as scaled) plus a small gap.
  static double _kitStep(int i, double page, double pic) {
    final a = _kitSpan[_kitSlug(i)] ?? (.1, .9);
    final b = _kitSpan[_kitSlug(i + 1)] ?? (.1, .9);
    return (a.$2 - .5) * pic * _kitScale(i, page) +
        pic * .07 +
        (.5 - b.$1) * pic * _kitScale(i + 1, page);
  }

  /// Kit [i]'s centre on the packed stage, from the stage's centre.
  static double _kitX(int i, double page, double pic) {
    final p0 = page.floor();
    var x = -(page - p0) * _kitStep(p0, page, pic);
    if (i >= p0) {
      for (var j = p0; j < i; j++) {
        x += _kitStep(j, page, pic);
      }
    } else {
      for (var j = i; j < p0; j++) {
        x -= _kitStep(j, page, pic);
      }
    }
    return x;
  }

  final _tiles = ScrollController();

  /// The quick-access filter: 'all', 'sports' or 'apparel'.
  String _filter = 'all';

  /// The category a filter is turning the stage to: the ones it passes on
  /// the way do not reset the filter (Headwear, an apparel, sits among the
  /// sports since 2026-11-02, CP1).
  int? _filterTarget;
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
      final passing = _filterTarget != null && _filterTarget != i;
      if (_filterTarget == i) _filterTarget = null;
      if (!passing && _filter != 'all' && dyoSports[i].$4 != _filter) {
        _filter = 'all';
      }
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
      if (first >= 0) {
        _filterTarget = first;
        _goTo(first);
      }
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_tiles.hasClients) _tiles.jumpTo(0);
      _revealTile();
    });
  }

  /// The stage's picture width (set by its layout) and the page a drag
  /// started on.
  double _pic = 0;
  double? _dragFrom;

  double get _page => _pages.hasClients && _pages.position.haveDimensions
      ? _pages.page ?? _pages.initialPage.toDouble()
      : _pages.initialPage.toDouble();

  /// A drag moves the kits with the finger (user 2026-11-06): the finger's
  /// move counts in the packed kit steps, not in whole pages.
  void _dragStart(DragStartDetails _) {
    if (!_pages.hasClients || !_pages.position.haveDimensions) return;
    _dragFrom = _page;
    _pages.jumpTo(_pages.position.pixels); // Stops a turn under way.
  }

  void _dragUpdate(DragUpdateDetails e) {
    if (_dragFrom == null || _pic <= 0) return;
    final page = _page, step = _kitStep(page.floor(), page, _pic);
    if (step <= 0) return;
    final next = page - (e.primaryDelta ?? e.delta.dx) / step;
    _pages.jumpTo(next * _pages.position.viewportDimension * _cell);
  }

  /// Let go: the nearest kit, or a flick turns one on in its direction (as
  /// a page view snaps).
  void _dragEnd(DragEndDetails e) {
    final from = _dragFrom;
    _dragFrom = null;
    if (from == null || !_pages.hasClients) return;
    final page = _page, v = e.primaryVelocity ?? e.velocity.pixelsPerSecond.dx;
    var target = page.round();
    if (v.abs() > 300) target = (v < 0 ? page + .5 : page - .5).round();
    _pages.animateToPage(
      target,
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  void _step(int delta) => _pages.animateToPage(
    (_pages.page ?? _pages.initialPage.toDouble()).round() + delta,
    duration: const Duration(milliseconds: 420),
    curve: Curves.easeOutCubic,
  );

  @override
  Widget build(BuildContext context) {
    final sport = dyoSports[_index];
    // No outer glass bubble here (client 2026-11-10: "I don't think we need
    // outside bubble here"): the picker stands straight on the stadium, its
    // rows lined up with the page edges ([_side]). The header (Back, the
    // wordmark, the bell) and the tab bar are the bubble pages' own.
    return Column(
      children: [
        Expanded(
          child: Stack(
            children: [
              const Positioned.fill(
                child: StageBackground(child: SizedBox.expand()),
              ),
              LayoutBuilder(
                builder: (context, box) {
                  final w = math.min(box.maxWidth, 520.0);
                  return Center(
                    child: SizedBox(
                      width: w,
                      child: Column(
                        children: [
                          const SizedBox(height: 10),
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: _side,
                            ),
                            child: SizedBox(
                              width: double.infinity,
                              height: 52,
                              child: Stack(
                                alignment: Alignment.center,
                                children: [
                                  BrandLogo(width: math.min(w * .46, 246)),
                                  Positioned(
                                    left: 0,
                                    child: BubbleCornerPill(
                                      key: const ValueKey('sport-bubble-back'),
                                      icon: Icons.arrow_back,
                                      label: 'Back',
                                      onTap: widget.c.back,
                                    ),
                                  ),
                                  Positioned(
                                    right: 0,
                                    child: NotificationBell(widget.c),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          // The options are small glass bubbles (client
                          // 489): the sport tiles, the arrows, the sport's
                          // name, Custom… and the Design button. On a phone
                          // the whole picker fits, the Design button in
                          // view; a very short window scrolls, the kit stage
                          // keeping [_minStage].
                          Expanded(
                            child: LayoutBuilder(
                              builder: (context, room) {
                                // Less room (a 360 × 780 phone): tighter
                                // spacing, so the kits keep their size.
                                final tight = room.maxHeight < 700;
                                return BubbleFillScroll(
                                  minFlex: (_) => _minStage,
                                  scrollKey: const ValueKey('sport-scroll'),
                                  children: _picker(sport, tight),
                                );
                              },
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
        BottomNav(controller: widget.c),
      ],
    );
  }

  /// The page's side margin: the header, the arrows, the stage ring, the
  /// first sport tile, Custom… and the Design button line up on it.
  static const _side = 16.0;

  /// The room under the Design button: 3DEEZI Assist's round button sits
  /// there, just over the tab bar (lib/widgets/assist_overlay.dart: 50 px,
  /// 92 px over the screen's foot, about 45 px over the tab bar), so it
  /// never covers the button.
  static const _assistRoom = 50.0;

  /// The least height of the kit stage before the picker scrolls.
  static const _minStage = 150.0;

  List<Widget> _picker((String, String, String, String) sport, bool tight) => [
    SizedBox(height: tight ? 2 : 8),
    const Text(
      'DESIGN YOUR OWN',
      style: TextStyle(
        color: Palette.cyan,
        fontSize: 10.5,
        letterSpacing: 2.4,
        fontWeight: FontWeight.w700,
      ),
    ),
    SizedBox(height: tight ? 3 : 6),
    ScreenTitle(
      'Different sports.\n',
      highlight: 'Same team spirit.',
      size: tight ? 22 : 27,
    ),
    SizedBox(height: tight ? 3 : 6),
    const Text(
      'Choose your sport. Swipe to rotate.',
      style: TextStyle(color: Color(0xffc4d2df), fontSize: 12),
    ),
    SizedBox(height: tight ? 2 : 8),
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
      // (Room above and below for the lit tile's glow.) The row runs to the
      // screen's edges, its first tile on the page margin. (A little lower
      // since 2026-11-10, client: "more room for 3D models".)
      height: tight ? 66 : 72,
      child: ListView.separated(
        key: const ValueKey('dyo-tiles'),
        controller: _tiles,
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(_side, 8, _side, 6),
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
    // The stage, the centre sport's glass capsule at its foot (client 489:
    // the kits stand just over it, the capsule over the ring's near side).
    Expanded(
      child: Stack(
        // The kits reach a little over the tiles row's empty glow room.
        clipBehavior: Clip.none,
        children: [
          Positioned.fill(
            top: -_kitRise,
            bottom: (tight ? 50 : 60) - _capOverlap,
            child: _stage(),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height: tight ? 50 : 60,
            child: Center(
              child: _SportName(
                name: sport.$1,
                kit: sport.$3,
                count: _n > 12 ? '${_index + 1} / $_n' : null,
                tight: tight,
              ),
            ),
          ),
        ],
      ),
    ),
    // A dot each fits a dozen; more show as a count in the capsule ("7 / 30",
    // user 2026-11-06: beside the kit line, so the kits get the room).
    if (_n <= 12)
      Center(
        child: PageDots(count: _n, index: _index),
      ),
    SizedBox(height: tight ? 0 : 2),
    // "Custom…" (client 2026-11-02): a sport we do not list, typed. It and
    // the Design button run margin to margin; both slimmer since 2026-11-10
    // (client: "maybe buttons smaller"), Custom… still 40 px to tap.
    Padding(
      padding: const EdgeInsets.symmetric(horizontal: _side),
      child: _GlassOutlineButton(
        key: const Key('dyo-custom-sport'),
        icon: Icons.edit_outlined,
        label: 'Custom… type your own sport',
        height: tight ? 28 : 32,
        onTap: _customSport,
      ),
    ),
    SizedBox(height: tight ? 2 : 4),
    Padding(
      padding: const EdgeInsets.fromLTRB(_side, 0, _side, _assistRoom),
      child: _GlossyButton(
        label: 'DESIGN ${sport.$1.toUpperCase()}',
        height: tight ? 40 : 44,
        onPressed: _design,
      ),
    ),
  ];

  /// How far the sport's capsule reaches up over the stage's foot.
  static const _capOverlap = 40.0;

  /// The room under a kit picture: its feet stand on the ring, a little
  /// behind the sport's capsule (user 2026-11-06, 490: bigger kits; client
  /// 2026-11-10: "much bigger").
  static const _kitPad = 24.0;

  /// How far the stage reaches up over the tiles row's glow room (the kit
  /// pictures' own empty top keeps them off the tiles).
  static const _kitRise = 11.0;

  /// The widest a kit picture gets, of the stage's width (2:3 pictures, so
  /// on a phone the stage's height sets their size).
  static const _kitWide = .62;

  /// The kits on their floodlit stage, the arrows at the sides.
  Widget _stage() => Stack(
    alignment: Alignment.center,
    children: [
      // The glowing stage ring under the kits.
      // (Where it stood by the capsule before the kits grew, 2026-11-10.)
      Positioned(
        bottom: _capOverlap - 24,
        left: _side,
        right: _side,
        child: Container(
          height: 74,
          decoration: BoxDecoration(
            borderRadius: const BorderRadius.all(Radius.elliptical(400, 74)),
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
      LayoutBuilder(
        builder: (context, box) {
          // The kit picture's width (2:3 pictures, [_kitPad] of
          // padding under them). A picture may be wider than its page
          // ([_cell] of the stage): the kits are packed by their
          // garments' own widths ([_kitX]), not by the pages.
          final cell = box.maxWidth * _cell;
          final pic = math.min(
            box.maxWidth * _kitWide,
            math.max(0.0, box.maxHeight - _kitPad) * 2 / 3,
          );
          _pic = pic;
          return GestureDetector(
            behavior: HitTestBehavior.translucent,
            supportedDevices: ScrollConfiguration.of(context).dragDevices,
            // (From the touch-down, so the kits keep up with the
            // finger from where it first touched.)
            dragStartBehavior: DragStartBehavior.down,
            onHorizontalDragStart: _dragStart,
            onHorizontalDragUpdate: _dragUpdate,
            onHorizontalDragEnd: _dragEnd,
            onHorizontalDragCancel: () => _dragEnd(DragEndDetails()),
            child: PageView.builder(
              controller: _pages,
              // Dragged by the detector above, 1:1 with the finger.
              // (No page snapping: it would pull the kits back
              // between finger moves; a drag's end snaps itself.)
              physics: const NeverScrollableScrollPhysics(),
              pageSnapping: false,
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
                  // Packed close to the centre kit; a kit further out
                  // than the side ones fades away as it comes near.
                  final far = d.abs() <= 1
                      ? 1.0
                      : ((1.6 - d.abs()) / .6).clamp(0.0, 1.0);
                  return Transform.translate(
                    offset: Offset(_kitX(i, page, pic) + d * cell, 0),
                    child: Transform(
                      alignment: Alignment.bottomCenter,
                      transform: Matrix4.identity()
                        ..setEntry(3, 2, .0012)
                        ..rotateY(d * .32)
                        ..scaleByDouble(.68 + .32 * t, .68 + .32 * t, 1, 1),
                      child: Opacity(
                        opacity: ((.62 + .38 * t) * far).clamp(0, 1),
                        child: child,
                      ),
                    ),
                  );
                },
                child: GestureDetector(
                  onTap: () {
                    final current = (_pages.page ?? 0).round();
                    current == i ? _design() : _step(i - current);
                  },
                  child: OverflowBox(
                    minWidth: 0,
                    maxWidth: pic,
                    alignment: Alignment.bottomCenter,
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: _kitPad),
                      child: Image.asset(
                        'assets/images/showroom/kit-${_kitSlug(i)}.webp',
                        fit: BoxFit.contain,
                        alignment: Alignment.bottomCenter,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
      // (Each arrow's 40 px tap room reaches 4 px past its bubble, so the
      // bubble itself stays on the page margin.)
      Positioned(
        left: _side - 4,
        child: _ArrowButton(
          icon: Icons.chevron_left_rounded,
          onTap: () => _step(-1),
        ),
      ),
      Positioned(
        right: _side - 4,
        child: _ArrowButton(
          icon: Icons.chevron_right_rounded,
          onTap: () => _step(1),
        ),
      ),
    ],
  );

  /// A typed sport: the garment step then offers every garment.
  Future<void> _customSport() async {
    final name = await askCustomName(
      context,
      title: 'Type your sport',
      hint: 'e.g. Lacrosse, Bowling',
    );
    if (name == null || !mounted) return;
    GarmentScreen.showAll.value = false;
    widget.c.update(() {
      final c = widget.c;
      final back = backForSport(
        c.sport,
        name,
        backName: c.backName,
        number: c.number,
        sampleName: c.logoText,
      );
      c
        ..sport = name
        ..backName = back.backName
        ..number = back.number;
      GarmentScreen.startOn(c);
    });
    widget.c.go(AppScreen.garment);
  }

  void _design() {
    GarmentScreen.showAll.value = false;
    widget.c.update(() {
      final c = widget.c, sport = dyoSports[_index].$1;
      // Netball has no player names or numbers (client 2026-10-26): its kits
      // start with an empty back; other sports keep the sample name and 23.
      final back = backForSport(
        c.sport,
        sport,
        backName: c.backName,
        number: c.number,
        sampleName: c.logoText,
      );
      c
        ..sport = sport
        ..backName = back.backName
        ..number = back.number;
      // The sport's first garment, unless the kit already is one of its tiles.
      GarmentScreen.startOn(c);
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

/// A small glass bubble round a DYO option (client 489): the glass rim of
/// the AI Designer's controls (glassy band, cyan glow, white lights) round
/// a dark centre. [lit] = the chosen one: a thicker, brighter rim and glow.
class _GlassOption extends StatelessWidget {
  const _GlassOption({
    required this.child,
    this.radius = 14,
    this.lit = false,
    this.rim = 2,
    this.glow = .35,
    this.onTap,
    this.shape,
  });
  final Widget child;
  final double radius, rim, glow;
  final bool lit;
  final VoidCallback? onTap;

  /// A round bubble when [CircleBorder]; else rounded by [radius].
  final ShapeBorder? shape;

  @override
  Widget build(BuildContext context) {
    // The lit one: a cyan line under the glass band and a soft cyan glow
    // round it. (A shadow, not the rim's own outer glow: in a scrolling row
    // that glow showed a dark box round the tile in the browser.)
    final side = lit
        ? const BorderSide(color: Color(0xff38f3ff), width: 2)
        : BorderSide.none;
    final glass = GlassRim(
      radius: radius,
      width: lit ? rim + 1 : rim,
      glow: lit ? 0 : glow,
      child: Material(
        color: lit ? const Color(0xf0082233) : const Color(0xe6040d16),
        shape: shape is CircleBorder
            ? CircleBorder(side: side)
            : RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(radius),
                side: side,
              ),
        clipBehavior: Clip.antiAlias,
        child: onTap == null
            ? child
            : InkWell(onTap: onTap, customBorder: shape, child: child),
      ),
    );
    if (!lit) return glass;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [
          BoxShadow(
            color: const Color(0xff2fe0ff).withValues(alpha: .6),
            blurRadius: 10,
            spreadRadius: .5,
          ),
        ],
      ),
      child: glass,
    );
  }
}

/// One quick-access tile: the category's 2D outline symbol and its name in
/// a small glass bubble (client 489), the chosen one lit.
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
    child: SizedBox(
      width: width,
      child: _GlassOption(
        radius: 14,
        lit: selected,
        rim: 1.8,
        glow: .3,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Flexible(
                child: CategoryIcon(
                  category,
                  size: 24,
                  color: selected
                      ? const Color(0xff5ff6ff)
                      : const Color(0xff19e3f2),
                ),
              ),
              const SizedBox(height: 3),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  name.toUpperCase(),
                  maxLines: 1,
                  style: const TextStyle(
                    fontFamily: 'Rajdhani',
                    fontWeight: FontWeight.w700,
                    fontSize: 12.5,
                    letterSpacing: .8,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

/// The stage's arrows: round glass bubbles (client 489).
class _ArrowButton extends StatelessWidget {
  const _ArrowButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => GestureDetector(
    // A smaller bubble since 2026-11-10 (client: "buttons smaller"), still
    // a 40 px tap.
    behavior: HitTestBehavior.opaque,
    onTap: onTap,
    child: SizedBox.square(
      dimension: 40,
      child: Center(
        child: _GlassOption(
          radius: 16,
          rim: 2,
          glow: .7,
          shape: const CircleBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(5),
            child: Icon(icon, color: Colors.white, size: 22),
          ),
        ),
      ),
    ),
  );
}

/// The centre sport under the stage (client 489): its name big and its kit
/// ("Singlet + Shorts") in a glass capsule.
class _SportName extends StatelessWidget {
  const _SportName({
    required this.name,
    required this.kit,
    this.count,
    this.tight = false,
  });
  final String name, kit;

  /// Where the sport is in the list ("7 / 30"), beside the kit line.
  final String? count;

  /// Less room: a little smaller.
  final bool tight;
  @override
  Widget build(BuildContext context) => _GlassOption(
    radius: 22,
    rim: 2.6,
    glow: .6,
    child: Padding(
      padding: EdgeInsets.fromLTRB(30, tight ? 4 : 6, 30, tight ? 5 : 7),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            name.toUpperCase(),
            maxLines: 1,
            style: TextStyle(
              fontFamily: 'Rajdhani',
              fontWeight: FontWeight.w700,
              fontSize: tight ? 22 : 25,
              height: 1.05,
              letterSpacing: 1,
              color: Colors.white,
            ),
          ),
          if (kit.isNotEmpty || count != null)
            Text(
              [if (kit.isNotEmpty) kit, ?count].join('  ·  '),
              maxLines: 1,
              style: TextStyle(
                fontSize: tight ? 12 : 13,
                fontWeight: FontWeight.w600,
                color: Color(0xffd3dee8),
              ),
            ),
        ],
      ),
    ),
  );
}

/// A full-width glass outline capsule with a cyan icon and label
/// (the pencil and "Custom... type your own sport", client 489).
class _GlassOutlineButton extends StatelessWidget {
  const _GlassOutlineButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.height = 38,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final double height;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: label,
    excludeSemantics: true,
    onTap: onTap,
    // The capsule may be slimmer than a finger: the tap takes at least
    // 40 px, the room over and under it too.
    child: GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: SizedBox(
        height: math.max(height, 40),
        width: double.infinity,
        child: Center(
          child: SizedBox(
            height: height,
            width: double.infinity,
            child: _GlassOption(
              radius: height / 2,
              rim: 1.8,
              glow: .3,
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(icon, size: 15, color: Palette.cyan),
                    const SizedBox(width: 7),
                    Flexible(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          label,
                          maxLines: 1,
                          style: const TextStyle(
                            color: Palette.cyan,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

/// The main action (client 489): a bright cyan glossy capsule, its glass
/// rim and a white gloss across the top, the label in dark navy.
class _GlossyButton extends StatelessWidget {
  const _GlossyButton({
    required this.label,
    required this.onPressed,
    this.height = 50,
  });
  final String label;
  final VoidCallback onPressed;
  final double height;
  @override
  Widget build(BuildContext context) {
    final r = BorderRadius.circular(height / 2);
    return Semantics(
      container: true,
      button: true,
      child: GlassRim(
        radius: height / 2,
        width: 2.2,
        glow: 1,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: r,
            gradient: const LinearGradient(
              colors: [Color(0xff4fe6ff), Color(0xff16c3f4), Color(0xff1a78e8)],
              stops: [0, .5, 1],
            ),
            boxShadow: [
              BoxShadow(
                color: Palette.cyan.withValues(alpha: .45),
                blurRadius: 18,
              ),
            ],
          ),
          child: Material(
            type: MaterialType.transparency,
            borderRadius: r,
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onPressed,
              child: SizedBox(
                height: height,
                child: Stack(
                  children: [
                    // The gloss: a soft white band over the top half.
                    Positioned(
                      left: 0,
                      right: 0,
                      top: 0,
                      height: height * .52,
                      child: const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Color(0x80ffffff), Color(0x14ffffff)],
                          ),
                        ),
                      ),
                    ),
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 22),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Flexible(
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(
                                  label,
                                  maxLines: 1,
                                  style: const TextStyle(
                                    color: Color(0xff04192b),
                                    fontWeight: FontWeight.w800,
                                    fontSize: 15,
                                    letterSpacing: .4,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            const Icon(
                              Icons.arrow_forward_rounded,
                              size: 19,
                              color: Color(0xff04192b),
                            ),
                          ],
                        ),
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
}

/// The 3D garments: (name, showroom art id). "More teamwear" offers the ones
/// a sport's own tiles do not use.
const garmentTiles = <(String, String)>[
  ('Full Kit', 'fullkit'),
  ('Jersey', 'jersey'),
  ('Shorts', 'shorts'),
  ('Training Tee', 'tee'),
  ('Singlet', 'singlet'),
  ('Netball dress', 'netball-dress'),
  ('Football jersey', 'nfljersey'),
  ('Compression top', 'compression'),
  ('Shooting shirt', 'shooting-shirt'),
  ('Socks', 'socks'),
  ('Cap', 'cap'),
  ('5 panel cap', 'five-panel-cap'),
  ('Skirt', 'skirt'),
  ('Bucket hat', 'bucket-hat'),
  ('Beanie', 'beanie'),
  ('Polo', 'polo'),
  ('Polo with pocket', 'pocketpolo'),
  ('Hoodie', 'hoodie'),
  ('Zip hoodie', 'ziphoodie'),
  ('Track jacket', 'trackjacket'),
  ('Varsity jacket', 'varsity'),
];

/// The kit is a tracksuit: the track jacket with its pants (task 9.173).
bool isTracksuit(AppController c) =>
    c.garment == 'Track jacket' &&
    RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(c.zoneColors['pantsStripe'] ?? '');

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
    final was = c.garment;
    c.garment = t.garment!;
    c.productName = plain ? '' : t.name;
    // A tile without a style of its own is the plain (collar) track jacket,
    // also after a hooded tile was chosen (QA U: the hood was kept).
    c.trackStyle = t.trackStyle ?? 'collar';
    // The tile's own neck and fit (Garment style: the picture's).
    c.neck = null;
    c.fit = null;
    // A tile with its own fabric type (the practice jersey's mesh) starts on it.
    if (t.fabric != null) c.fabric = t.fabric!;
    // The tile picture's look (task 9.154): the kit opens looking like it.
    if (t.look != null)
      c.startLook(tileLook(t.look!, picture: t.art), from: was);
  }

  /// Another 3D garment from the Studio's garment list (client 2026-10-29)
  /// opens looking like its picture there (garment-<art>.webp), so what is
  /// tapped is what opens, as its Design Your Own tile: the look of a tile
  /// with that picture (the sport's own first), else the picture's own
  /// ([pictureLooks]), else the sport's first tile of that garment (or any
  /// sport's). Own uploads and text stay; one undo step.
  /// Task 9.173: the Studio's Tracksuit item (the track jacket over its pants,
  /// shown by its look's pants stripe), from the sport's own tracksuit tile
  /// (else any sport's). One undo step.
  static void switchToSuit(AppController c) {
    if (isTracksuit(c)) return;
    final own = sportNamed(c.sport);
    final t =
        [
              ...tilesFor(c.sport),
              for (final s in sportCategories)
                if (s != own) ...s.tiles,
            ]
            .where(
              (t) =>
                  !t.soon &&
                  t.garment == 'Track jacket' &&
                  t.look != null &&
                  ((tileLook(t.look!)['zoneColors'] as Map?)?['pantsStripe'] !=
                      null),
            )
            .firstOrNull;
    if (t == null) return;
    c.edit(() => choose(c, t));
  }

  static void switchTo(AppController c, String name, String art) {
    // (Track jacket from a tracksuit: the jacket alone.)
    if (name == c.garment && !(name == 'Track jacket' && isTracksuit(c))) {
      return;
    }
    final own = sportNamed(c.sport);
    final tiles = [
      ...tilesFor(c.sport),
      for (final s in sportCategories)
        if (s != own) ...s.tiles,
    ].where((t) => !t.soon && t.garment == name).toList();
    final t =
        tiles.where((t) => t.art == art).firstOrNull ??
        (pictureLooks[art] != null
            ? GarmentTile(name, '', name, image: art)
            : tiles.firstOrNull);
    final was = c.garment;
    c.edit(() {
      c.garment = name;
      if (t == null) return;
      c.trackStyle = t.trackStyle ?? 'collar';
      c.neck = null;
      c.fit = null;
      if (t.fabric != null) c.fabric = t.fabric!;
      if (t.look != null) {
        c.startLook(tileLook(t.look!, picture: t.art), from: was);
      }
    });
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

  /// A garment typed in "Custom…" (client 2026-11-02): no tile of any sport
  /// has its name; the 3D kit is its nearest garment.
  static bool typed(AppController c) =>
      c.productName.isNotEmpty &&
      current(c) == null &&
      !sportCategories.any((s) => s.tiles.any((t) => t.name == c.productName));

  /// "Custom…", the last tile: type a garment; the 3D preview uses the
  /// nearest one we have.
  Widget _customTile(BuildContext context, {bool described = true}) {
    final on = typed(c);
    return GlowCard(
      key: const ValueKey('garment-tile-custom'),
      selected: on,
      glow: on,
      onTap: () async {
        final name = await askCustomName(
          context,
          title: 'Type your garment',
          initial: on ? c.productName : '',
          uses: (n) => '3D preview uses ${nearestGarment(n).toLowerCase()}',
        );
        if (name == null) return;
        c.update(() {
          c.garment = nearestGarment(name);
          c.productName = name;
          c.trackStyle = 'collar';
          c.neck = null;
          c.fit = null;
        });
      },
      child: Stack(
        fit: StackFit.expand,
        children: [
          Padding(
            padding: const EdgeInsets.all(8),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.edit_outlined, color: Palette.cyan, size: 38),
                const SizedBox(height: 8),
                Text(
                  on ? c.productName.toUpperCase() : 'CUSTOM…',
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
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    on
                        ? '3D preview uses ${c.garment.toLowerCase()}'
                        : 'Type your own garment.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: on
                          ? const Color(0xff5fdcea)
                          : const Color(0xffb7c6d6),
                      fontSize: 10.5,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (on)
            const Positioned(
              top: 8,
              right: 8,
              child: Icon(
                Icons.check_circle_rounded,
                color: Palette.cyan,
                size: 22,
              ),
            ),
        ],
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
    final heading = sport?.id == 'headwear'
        ? title
        : sport?.group == 'apparel'
        ? '$title teamwear'
        : '$title uniforms & teamwear';
    final tiles = tilesFor(c.sport), more = moreFor(c.sport);
    final chosen = current(c);
    // Per-sport settings (config/catalog.php): subtitle, hint, names only and
    // an own background.
    final described = sport?.descriptions ?? true;
    final hint = sport?.selectHint;
    // The bubble look (user 2026-11-05): the picker in the glass bubble.
    return BubblePage(
      c: c,
      title: '',
      compact: true,
      // (The sport's own background stays behind the bubble.)
      backdrop: StageBackground(
        dim: true,
        image: sport?.backdrop,
        child: const SizedBox.expand(),
      ),
      bubbleKey: const ValueKey('garment-bubble'),
      leading: BubbleCornerPill(
        key: const ValueKey('garment-bubble-back'),
        icon: Icons.arrow_back,
        label: 'Back',
        onTap: c.back,
      ),
      child: Column(
        children: [
          Expanded(
            child: ValueListenableBuilder(
              valueListenable: showAll,
              builder: (context, all, _) => CustomScrollView(
                slivers: [
                  // The heading scrolls away with the tiles: on a short phone
                  // the second row of tiles shows above Continue.
                  SliverToBoxAdapter(
                    child: Padding(
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
                                ScreenTitle(
                                  heading,
                                  size: 22,
                                  align: TextAlign.left,
                                ),
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
                  ),
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
                      _customTile(context, described: described),
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
                  onPressed: chosen == null && !typed(c)
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
Future<void> convertFlow(
  BuildContext context,
  AppController c, {
  Uint8List? picture,
}) async {
  if (!AiService.enabled) {
    showToast(context, 'Convert needs AI, which is not set up in this build.');
    return;
  }
  final image = picture ?? await pickPhoto(context);
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

/// What the user's artwork is (Artwork to 3D, task 9.153).
enum _ArtworkKind { layout, front, allOver, garment }

/// ARTWORK TO 3D (task 9.153): the user's own artwork (PDF, SVG, AI, PNG,
/// JPG or WebP) on the REAL 3D garment, editable in the Studio. A full print
/// layout's panels are checked and mapped onto the garment's print areas; one
/// design or logo goes on the front (to move and resize) or all over. The AI
/// reading is only an extra ("AI preview picture").
Future<void> artworkTo3dFlow(BuildContext context, AppController c) async {
  final picked = await pickArtwork(context);
  if (picked == null || !context.mounted) return;
  var name = picked.name.isEmpty ? 'artwork.png' : picked.name;
  final bytes = picked.bytes;
  final lower = name.toLowerCase();
  final head = latin1.decode(
    bytes.sublist(0, math.min(1024, bytes.length)),
    allowInvalid: true,
  );
  final pdf = head.contains('%PDF-');
  if (lower.endsWith('.ai') || lower.endsWith('.eps')) {
    if (!pdf) {
      showToast(
        context,
        'This file cannot be read here. In your design app use Save As › PDF, '
        'or Export › SVG, then upload that file.',
      );
      return;
    }
    name = name.replaceFirst(
      RegExp(r'\.(ai|eps)$', caseSensitive: false),
      '.pdf',
    );
  }
  final svg =
      !pdf && (name.toLowerCase().endsWith('.svg') || head.contains('<svg'));
  final type = pdf
      ? 'application/pdf'
      : svg
      ? 'image/svg+xml'
      : bytes.length > 3 && bytes[0] == 0x89 && bytes[1] == 0x50
      ? 'image/png'
      : bytes.length > 11 && bytes[8] == 0x57 && bytes[9] == 0x45
      ? 'image/webp'
      : 'image/jpeg';
  final ending = switch (type) {
    'application/pdf' => 'pdf',
    'image/svg+xml' => 'svg',
    'image/png' => 'png',
    'image/webp' => 'webp',
    _ => 'jpg',
  };
  if (!RegExp(r'\.(pdf|svg|png|jpe?g|webp)$').hasMatch(name.toLowerCase())) {
    name = '${name.replaceFirst(RegExp(r'\.[^.]*$'), '')}.$ending';
  }
  if (bytes.length > 30 * 1024 * 1024) {
    showToast(context, 'Choose a file smaller than 30 MB.');
    return;
  }
  // A wide picture is most likely a print layout (panels side by side).
  var wide = pdf;
  var look = (photo: false, main: null as Color?);
  if (!pdf && !svg) {
    try {
      final image = await decodeImageFromList(bytes);
      wide = image.width > image.height * 1.45;
      look = await _artworkLook(image);
    } on Object {
      wide = false;
    }
  }
  if (!context.mounted) return;
  final choice =
      await showModalBottomSheet<
        ({
          _ArtworkKind kind,
          String sport,
          String garment,
          String product,
          bool ai,
        })
      >(
        context: context,
        isScrollControlled: true,
        backgroundColor: Palette.surface,
        showDragHandle: true,
        builder: (_) => _ArtworkSheet(
          c: c,
          name: name,
          preview: pdf || svg ? null : bytes,
          kind: look.photo && AiService.enabled
              ? _ArtworkKind.garment
              : wide
              ? _ArtworkKind.layout
              : _ArtworkKind.front,
          photo: look.photo,
        ),
      );
  if (choice == null || !context.mounted) return;
  // A cap (bucket hat, socks, skirt): the AI preview is its own reading (its
  // logos cut out and put on their places), not a kit redrawn as a top.
  final accessoryAi =
      isAccessory(choice.garment) &&
      (choice.ai || choice.kind == _ArtworkKind.garment);
  if (choice.ai && !accessoryAi) {
    await convertFlow(context, c, picture: bytes);
    return;
  }
  if (!c.signedIn &&
      (choice.kind == _ArtworkKind.layout ||
          choice.kind == _ArtworkKind.garment)) {
    showToast(
      context,
      'Sign in to use print layouts: the file is kept with your saved assets.',
    );
    c.go(AppScreen.auth);
    return;
  }
  final messenger = ScaffoldMessenger.of(context);
  void say(String text) {
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text(text),
        behavior: SnackBarBehavior.floating,
        backgroundColor: Palette.surface2,
        showCloseIcon: true,
        duration: const Duration(seconds: 5),
      ),
    );
  }

  c.startArtworkKit(
    choice.sport,
    choice.garment,
    name.replaceFirst(RegExp(r'\.[^.]*$'), ''),
  );
  // A garment typed in "Custom…" names the kit (its 3D garment the nearest).
  if (choice.product.isNotEmpty) c.productName = choice.product;
  // The side panels and trims take the artwork's main colour (not the
  // default cyan); a logo's kit stays plain, its sides matching the body.
  final main = look.main;
  if (choice.kind == _ArtworkKind.front) {
    c.secondaryColor = c.mainColor;
  } else if (main != null) {
    c.secondaryColor = main;
    if (choice.kind == _ArtworkKind.allOver) c.mainColor = main;
  }
  // The Studio's 3D kit starts first.
  for (
    var t = 0;
    t < 300 &&
        (!c.viewerReady || c.checkLayout == null || c.processArtwork == null);
    t++
  ) {
    await Future<void>.delayed(const Duration(milliseconds: 200));
  }
  try {
    if (accessoryAi) {
      say('Reading $name: its colours and logos (about 15 s)…');
      await _accessoryOnKit(c, bytes, choice.garment);
      say(
        'Your logos are on the ${choice.garment.toLowerCase()}. Move or resize them in the 2D panels, then save.',
      );
      return;
    }
    if (choice.kind == _ArtworkKind.garment) {
      // A mock-up or photo of a garment: the AI path of "Open in 3D Designer"
      // (task 9.116): its colours and crest read, then redrawn as a flat
      // front and back print sheet, checked in the Studio.
      say('Reading $name and drawing its flat print sheet (about 30 s)…');
      DesignReading? reading;
      try {
        reading = await c.ai.readDesign(
          bytes,
          sport: choice.sport,
          garment: choice.product.isNotEmpty ? choice.product : choice.garment,
        );
      } on Object {
        reading = null;
      }
      // A cap (bucket hat, socks, skirt) in the picture: on that model with its
      // own logos, never redrawn as a top (CP1).
      if (reading != null && reading.exact && isAccessory(reading.garment)) {
        c.garment = reading.garment;
        await _accessoryOnKit(c, bytes, reading.garment);
        say(
          'Your logos are on the ${reading.garment.toLowerCase()}. Move or resize them in the 2D panels, then save.',
        );
        return;
      }
      if (reading != null) {
        final box = reading.crest;
        final logo = box == null ? null : await cropCrest(bytes, box);
        final r = reading;
        c.edit(() {
          c.mainColor = r.mainColor;
          // The side panels: the picture's trim colour, not the default cyan.
          c.secondaryColor = r.secondaryColor;
          c.accentColor = r.accentColor;
          if (logo != null) c.logoImage = logo;
        });
      }
      final sheet = await c.ai.printSheet(
        bytes,
        sport: choice.sport,
        garment: choice.product.isNotEmpty ? choice.product : choice.garment,
      );
      c.artwork.add(sheet);
      final done = await c.importDesignPicture(
        sheet.length > 4 && sheet[0] == 0x89
            ? 'ai-print-sheet.png'
            : 'ai-print-sheet.jpg',
        sheet,
        known: reading != null,
      );
      say(done ?? 'The print sheet is kept in Assets › Artwork.');
      return;
    }
    if (choice.kind == _ArtworkKind.layout) {
      say('Reading $name…');
      final done = await c.importPrintLayout(name, bytes);
      say(
        done ??
            'Print layout not put on. Use Artwork › Upload print layout to try again.',
      );
      return;
    }
    final process = c.processArtwork;
    if (process == null) {
      throw ApiException('The 3D kit is still starting. Please try again.');
    }
    // Vectors drawn sharp at print size; a PDF's white page left out.
    final src = await process(
      'data:$type;base64,${base64Encode(bytes)}',
      removeBg: pdf,
      maxSize: 1600,
    );
    final allOver = choice.kind == _ArtworkKind.allOver;
    if (!allOver && isAccessory(choice.garment)) {
      // A cap or bucket hat: on the front panels; socks and a skirt: their crest.
      var aspect = 1.0;
      try {
        final shown = await decodeImageFromList(ProjectSync.bytes(src)!);
        aspect = shown.width / math.max(1, shown.height);
      } on Object {
        aspect = 1;
      }
      final layer = accessoryFrontLayer(choice.garment, src, name, aspect);
      if (layer != null) {
        c.addLayer(layer);
        // Its 3DEEZI marks go on the back, clear of the customer's logo (BR1).
        final back = accessoryBackMarks(choice.garment);
        if (back != null) {
          c.edit(() {
            c.logoText = '3DEEZI';
            c.marks = {...c.marks, ...back};
          });
        }
      } else {
        final logo = ProjectSync.bytes(src);
        if (logo != null) c.edit(() => c.logoImage = logo);
      }
      say(
        'Your artwork is on the front. Drag and resize it in the 2D panels, then save.',
      );
      return;
    }
    await c.placeArtwork(src, name, allOver: allOver);
    say(
      allOver
          ? 'Your artwork is printed all over the kit. Save the project to keep it.'
          : 'Your artwork is on the front. Drag and resize it in the 2D panels, then save.',
    );
  } on Object catch (e) {
    say(
      e is ApiException
          ? e.message
          : 'That artwork could not go on the 3D kit.',
    );
  }
}

/// A cap (bucket hat, socks, skirt) artwork on the 3D model (CP1, client
/// 2026-11-02): the AI reads its colours and where its logos are; each logo
/// is cut out and put on its place (accessory_art.dart).
Future<void> _accessoryOnKit(
  AppController c,
  Uint8List picture,
  String garment,
) async {
  final r = await c.ai.readAccessory(picture, garment: garment);
  final placed = await accessoryLayers(r, picture);
  c.edit(() {
    c.mainColor = r.main;
    c.secondaryColor = r.trim;
    c.accentColor = r.accent;
    c.pattern = 'Solid';
    c.parts = accessoryParts(r);
    if (placed.crest != null) c.logoImage = placed.crest;
    // The front logo cut from the artwork is the customer's: the small
    // 3DEEZI marks go on the back, under its logo (BR1).
    final back = accessoryBackMarks(r.garment);
    if (placed.layers.any((l) => l['name'] == 'Front logo') && back != null) {
      c.logoText = '3DEEZI';
      c.marks = {...c.marks, ...back};
    } else if (r.frontText.isNotEmpty) {
      c.logoText = r.frontText;
    }
  });
  for (final layer in placed.layers) {
    c.addLayer(layer);
  }
  if (r.name.isNotEmpty) c.projectName = r.name;
}

/// The look of a picture (task 9.153), read from a small copy, no AI: a
/// photo or mock-up (an opaque edge in many shades, many colours) and its
/// main colour without its background.
Future<({bool photo, Color? main})> _artworkLook(ui.Image image) async {
  const n = 64;
  final recorder = ui.PictureRecorder();
  Canvas(recorder).drawImageRect(
    image,
    Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
    const Rect.fromLTWH(0, 0, n + 0.0, n + 0.0),
    Paint()..filterQuality = FilterQuality.low,
  );
  final small = await recorder.endRecording().toImage(n, n);
  final data = await small.toByteData(format: ui.ImageByteFormat.rawRgba);
  if (data == null) return (photo: false, main: null);
  final px = data.buffer.asUint8List();
  int key(int i) => (px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | px[i + 2] >> 4;
  final edge = <int, int>{};
  var clear = 0, rim = 0;
  for (var i = 0; i < n; i++) {
    for (final (x, y) in [(i, 0), (i, n - 1), (0, i), (n - 1, i)]) {
      final at = (y * n + x) * 4;
      rim++;
      if (px[at + 3] < 40) {
        clear++;
      } else {
        edge[key(at)] = (edge[key(at)] ?? 0) + 1;
      }
    }
  }
  final bg = clear > rim * 0.3 || edge.isEmpty
      ? -1
      : (edge.entries.toList()..sort((a, b) => b.value - a.value)).first.key;
  bool near(int k, int b) =>
      b >= 0 &&
      ((k >> 8) - (b >> 8)).abs() +
              (((k >> 4) & 15) - ((b >> 4) & 15)).abs() +
              ((k & 15) - (b & 15)).abs() <=
          2;
  final counts = <int, List<int>>{};
  for (var i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 40) continue;
    final k = key(i);
    if (near(k, bg)) continue;
    final e = counts.putIfAbsent(k, () => [0, 0, 0, 0]);
    e[0]++;
    e[1] += px[i];
    e[2] += px[i + 1];
    e[3] += px[i + 2];
  }
  final top = counts.values.isEmpty
      ? null
      : counts.values.reduce((a, b) => a[0] >= b[0] ? a : b);
  final photo = clear < rim * 0.3 && edge.length > 24 && counts.length > 220;
  return (
    photo: photo,
    main: top == null
        ? null
        : Color.fromARGB(
            255,
            top[1] ~/ top[0],
            top[2] ~/ top[0],
            top[3] ~/ top[0],
          ),
  );
}

class _ArtworkSheet extends StatefulWidget {
  const _ArtworkSheet({
    required this.c,
    required this.name,
    required this.preview,
    required this.kind,
    this.photo = false,
  });
  final bool photo;
  final AppController c;
  final String name;
  final Uint8List? preview;
  final _ArtworkKind kind;

  @override
  State<_ArtworkSheet> createState() => _ArtworkSheetState();
}

class _ArtworkSheetState extends State<_ArtworkSheet> {
  late _ArtworkKind kind = widget.kind;
  late SportCategory sport =
      sportCategories.where((s) => s.name == widget.c.sport).firstOrNull ??
      sportCategories.first;
  late String garment = _garments.contains(widget.c.garment)
      ? widget.c.garment
      : _garments.first;

  /// "Custom…" (client 2026-11-02): a sport or garment typed; a typed sport
  /// offers every garment, a typed garment uses the nearest 3D garment.
  late bool customSport =
      sportNamed(widget.c.sport) == null &&
      customName(widget.c.sport).isNotEmpty;
  bool customGarment = false;
  late final _sportText = TextEditingController(
    text: customSport ? customName(widget.c.sport) : '',
  );
  final _garmentText = TextEditingController();

  @override
  void dispose() {
    _sportText.dispose();
    _garmentText.dispose();
    super.dispose();
  }

  List<String> get _garments => customSport
      ? garmentIds.keys.toList()
      : sport.garments.isEmpty
      ? const ['Jersey']
      : sport.garments;

  bool get _missingName =>
      (customSport && customName(_sportText.text).isEmpty) ||
      (customGarment && customName(_garmentText.text).isEmpty);

  Widget _typed(TextEditingController text, String label, String hint) =>
      Padding(
        padding: const EdgeInsets.only(top: 8),
        child: TextField(
          controller: text,
          autofocus: true,
          maxLength: customMax,
          decoration: InputDecoration(
            labelText: label,
            hintText: hint,
            counterText: '',
          ),
          onChanged: (_) => setState(() {}),
        ),
      );

  Widget _option(_ArtworkKind k, String title, String hint) => ListTile(
    onTap: () => setState(() => kind = k),
    dense: true,
    contentPadding: EdgeInsets.zero,
    leading: Icon(
      kind == k ? Icons.radio_button_checked : Icons.radio_button_off,
      color: kind == k ? Palette.cyan : Palette.muted,
    ),
    title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
    subtitle: Text(
      hint,
      style: const TextStyle(color: Palette.muted, fontSize: 12),
    ),
  );

  static const _label = TextStyle(
    color: Palette.cyan,
    fontSize: 12,
    fontWeight: FontWeight.w700,
  );

  @override
  Widget build(BuildContext context) {
    // Headwear and accessories (CP1, client 2026-11-02 "a caps section"):
    // offered for every sport, under their own heading.
    final garments = _garments.where((g) => !isAccessory(g)).toList();
    final nearest = nearestGarment(_garmentText.text);
    final accessory = !customGarment && isAccessory(garment);
    if (accessory && kind == _ArtworkKind.layout) {
      kind = AiService.enabled && widget.preview != null
          ? _ArtworkKind.garment
          : _ArtworkKind.front;
    }
    void done(bool ai) => Navigator.pop(context, (
      kind: kind,
      sport: customSport ? customName(_sportText.text) : sport.name,
      garment: customGarment ? nearest : garment,
      product: customGarment ? customName(_garmentText.text) : '',
      ai: ai,
    ));
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          0,
          20,
          16 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const ScreenTitle('Artwork to 3D', size: 21),
            const SizedBox(height: 4),
            Text(
              widget.name,
              style: const TextStyle(color: Palette.muted, fontSize: 12),
              overflow: TextOverflow.ellipsis,
            ),
            if (widget.preview != null) ...[
              const SizedBox(height: 10),
              SizedBox(
                height: 120,
                child: Image.memory(widget.preview!, fit: BoxFit.contain),
              ),
            ],
            const SizedBox(height: 12),
            const Text('WHAT IS IT?', style: _label),
            if (AiService.enabled && widget.preview != null)
              _option(
                _ArtworkKind.garment,
                'Picture of a garment (mockup / photo)',
                accessory
                    ? 'A mock-up or artwork sheet of the cap or accessory (front, back, sides). AI reads its colours and logos and puts each logo on its place on the 3D model. Uses AI (a small fee per picture).'
                    : 'A mock-up or photo of the garment, front and back. AI redraws it flat and puts it on the 3D kit, sides, crest and number included. Uses AI (a small fee per picture).',
              ),
            if (!accessory)
              _option(
                _ArtworkKind.layout,
                'Full print layout',
                'Front, back and sleeve panels side by side. Each panel goes on its part of the garment.',
              ),
            _option(
              _ArtworkKind.front,
              'Logo or design on the front',
              'Move and resize it on the 3D kit.',
            ),
            _option(
              _ArtworkKind.allOver,
              'All-over print',
              'The design repeated over the whole garment.',
            ),
            const SizedBox(height: 8),
            const Text('CHOOSE THE GARMENT', style: _label),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              initialValue: customSport ? customValue : sport.name,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Sport'),
              items: [
                for (final s in sportCategories)
                  DropdownMenuItem(value: s.name, child: Text(s.name)),
                const DropdownMenuItem(
                  value: customValue,
                  child: Text(customLabel),
                ),
              ],
              onChanged: (v) => setState(() {
                customSport = v == customValue;
                if (!customSport) {
                  sport = sportCategories.firstWhere((s) => s.name == v);
                }
                if (!_garments.contains(garment) && !isAccessory(garment)) {
                  garment = _garments.first;
                }
              }),
            ),
            if (customSport)
              _typed(_sportText, 'Type your sport', 'e.g. Lacrosse, Bowling'),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              key: ValueKey('${sport.id}-$customSport'),
              initialValue: customGarment
                  ? customValue
                  : garments.contains(garment) || isAccessory(garment)
                  ? garment
                  : garments.first,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Garment'),
              items: [
                for (final g in garments)
                  DropdownMenuItem(value: g, child: Text(g)),
                const DropdownMenuItem(
                  value: '__headwear',
                  enabled: false,
                  child: Text(
                    'HEADWEAR & ACCESSORIES',
                    style: TextStyle(
                      color: Palette.cyan,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                for (final g in accessoryGarments.keys)
                  DropdownMenuItem(value: g, child: Text(g)),
                const DropdownMenuItem(
                  value: customValue,
                  child: Text(customLabel),
                ),
              ],
              onChanged: (v) => setState(() {
                if (v == '__headwear') return;
                customGarment = v == customValue;
                if (!customGarment) garment = v ?? garment;
              }),
            ),
            if (customGarment) ...[
              _typed(_garmentText, 'Type your garment', customPlaceholder),
              if (customName(_garmentText.text).isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    '3D preview uses ${nearest.toLowerCase()}',
                    key: const Key('artwork-custom-uses'),
                    style: const TextStyle(color: Palette.cyan, fontSize: 12),
                  ),
                ),
            ],
            if (widget.photo &&
                (kind == _ArtworkKind.front || kind == _ArtworkKind.allOver))
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  '${kind == _ArtworkKind.front ? 'This looks like a photo or mock-up with a background, not a logo: the whole picture would go on the chest.' : 'This looks like a photo or mock-up: the whole picture, background included, would repeat over the kit.'}'
                  '${AiService.enabled ? ' Choose “Picture of a garment” to put its design on the kit.' : ''}',
                  style: const TextStyle(
                    color: Color(0xffffd28a),
                    fontSize: 12,
                  ),
                ),
              ),
            if (kind == _ArtworkKind.layout)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'The Studio shows each panel it found: check it is the front, back or a sleeve, then put it on.',
                  style: TextStyle(color: Palette.muted, fontSize: 12),
                ),
              ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: _missingName ? null : () => done(false),
              icon: const Icon(Icons.view_in_ar),
              label: const Text('PUT IT ON THE 3D KIT'),
            ),
            if (AiService.enabled && widget.preview != null)
              TextButton.icon(
                onPressed: _missingName ? null : () => done(true),
                icon: const Icon(Icons.auto_awesome, size: 18),
                label: const Text('AI preview picture'),
              ),
          ],
        ),
      ),
    );
  }
}
