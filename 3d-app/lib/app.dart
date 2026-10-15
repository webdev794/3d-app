import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'app_controller.dart';
import 'assist.dart';
import 'screens/ai_designer.dart';
import 'screens/artboard.dart';
import 'screens/business.dart';
import 'screens/create_home.dart';
import 'screens/library.dart';
import 'screens/onboarding.dart';
import 'screens/showcase.dart';
import 'screens/studio.dart';
import 'widgets/assist_overlay.dart';
import 'widgets/ui.dart';

class ThreeDeeziApp extends StatefulWidget {
  const ThreeDeeziApp({super.key, this.controller});
  final AppController? controller;
  @override
  State<ThreeDeeziApp> createState() => _ThreeDeeziAppState();
}

class _ThreeDeeziAppState extends State<ThreeDeeziApp> {
  late final AppController c = widget.controller ?? AppController();
  late final AssistController assist = AssistController(c);
  @override
  void dispose() {
    assist.dispose();
    if (widget.controller == null) c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: '3DEEZI · Sportswear Designer',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      brightness: Brightness.dark,
      useMaterial3: true,
      scaffoldBackgroundColor: Palette.bg,
      fontFamily: 'Inter',
      colorScheme: const ColorScheme.dark(
        primary: Palette.cyan,
        secondary: Palette.blue,
        surface: Palette.surface,
      ),
      textTheme: const TextTheme(
        titleLarge: TextStyle(
          fontFamily: 'Rajdhani',
          fontWeight: FontWeight.w700,
        ),
        headlineLarge: TextStyle(
          fontFamily: 'Rajdhani',
          fontWeight: FontWeight.w700,
        ),
        headlineMedium: TextStyle(
          fontFamily: 'Rajdhani',
          fontWeight: FontWeight.w700,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Palette.surface,
        hintStyle: const TextStyle(color: Palette.muted, fontSize: 13),
        contentPadding: const EdgeInsets.all(16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: const BorderSide(color: Palette.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: const BorderSide(color: Palette.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: const BorderSide(color: Palette.cyan),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(foregroundColor: Palette.muted),
      ),
      dividerColor: Palette.border,
    ),
    home: AnimatedBuilder(
      animation: Listenable.merge([c, assist]),
      builder: (context, _) => PopScope(
        canPop:
            !assist.open &&
            (c.screen == AppScreen.home ||
                c.screen == AppScreen.onboarding ||
                c.screen == AppScreen.splash),
        onPopInvokedWithResult: (didPop, result) {
          // Back closes the help chat first.
          if (didPop) return;
          if (assist.open) {
            assist.minimise();
          } else {
            c.back();
          }
        },
        child: LayoutBuilder(
          builder: (context, constraints) {
            final desktop = constraints.maxWidth >= 900;
            final phone = _Phone(
              controller: c,
              assist: assist,
              framed: desktop,
            );
            return Scaffold(
              body: Container(
                decoration: const BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment(.45, -.15),
                    radius: 1.05,
                    colors: [
                      Color(0xff092436),
                      Color(0xff050b11),
                      Color(0xff030609),
                    ],
                  ),
                ),
                child: desktop
                    ? Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 1140),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              SizedBox(width: 370, child: _PresentationRail(c)),
                              const SizedBox(width: 90),
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 24,
                                ),
                                child: SizedBox(
                                  width: 418,
                                  height: math.min(
                                    880,
                                    constraints.maxHeight - 48,
                                  ),
                                  child: phone,
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                    : SafeArea(
                        child: Center(
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 520),
                            child: phone,
                          ),
                        ),
                      ),
              ),
            );
          },
        ),
      ),
    ),
  );
}

class _Phone extends StatelessWidget {
  const _Phone({
    required this.controller,
    required this.assist,
    required this.framed,
  });
  final AppController controller;
  final AssistController assist;
  final bool framed;
  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: Palette.bg,
      borderRadius: BorderRadius.circular(framed ? 38 : 0),
      border: framed
          ? Border.all(color: const Color(0xff405060), width: 2)
          : null,
      boxShadow: framed
          ? [
              BoxShadow(
                color: Palette.cyan.withValues(alpha: .08),
                blurRadius: 65,
                spreadRadius: 2,
              ),
              const BoxShadow(
                color: Colors.black54,
                blurRadius: 35,
                offset: Offset(0, 25),
              ),
            ]
          : null,
    ),
    clipBehavior: Clip.antiAlias,
    child: Column(
      children: [
        if (framed || kIsWeb)
          Padding(
            padding: const EdgeInsets.fromLTRB(25, 12, 23, 8),
            child: Row(
              children: [
                const Text(
                  '9:41',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                ),
                const Spacer(),
                if (framed)
                  Container(
                    width: 78,
                    height: 19,
                    decoration: BoxDecoration(
                      color: Colors.black,
                      borderRadius: BorderRadius.circular(20),
                    ),
                  ),
                const Spacer(),
                const Icon(Icons.signal_cellular_alt, size: 13),
                const SizedBox(width: 4),
                const Icon(Icons.wifi, size: 13),
                const SizedBox(width: 4),
                const Icon(Icons.battery_full, size: 16),
              ],
            ),
          ),
        Expanded(
          child: Stack(
            fit: StackFit.expand,
            children: [
              Scaffold(
                backgroundColor: Colors.transparent,
                body: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 260),
                  child: KeyedSubtree(
                    key: ValueKey(controller.screen),
                    child: _screen(controller),
                  ),
                ),
              ),
              // 3DEEZI ASSIST, the help chat, over every screen.
              AssistOverlay(assist),
            ],
          ),
        ),
        if (framed || kIsWeb)
          Container(
            margin: const EdgeInsets.symmetric(vertical: 7),
            width: 108,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: .3),
              borderRadius: BorderRadius.circular(9),
            ),
          ),
      ],
    ),
  );
  Widget _screen(AppController c) => switch (c.screen) {
    AppScreen.splash => SplashScreen(c),
    AppScreen.onboarding => OnboardingScreen(c),
    AppScreen.auth => AuthScreen(c),
    AppScreen.home => CreateHomeScreen(c),
    AppScreen.aiDesigner => AiDesignerScreen(c),
    AppScreen.generating => AiGeneratingScreen(c),
    AppScreen.concepts => ConceptsScreen(c),
    AppScreen.sport => SportCarouselScreen(c),
    AppScreen.garment => GarmentScreen(c),
    AppScreen.studio => DesignStudioScreen(c),
    AppScreen.saveProject => SaveProjectScreen(c),
    AppScreen.export => ExportScreen(c),
    AppScreen.projects => ProjectsScreen(c),
    AppScreen.assets => AssetsScreen(c),
    AppScreen.profile => ProfileScreen(c),
    AppScreen.showcase => ShowcaseScreen(c),
    AppScreen.artboard => ArtboardScreen(c),
    AppScreen.pricing => PricingScreen(c),
    AppScreen.orders => OrdersScreen(c),
  };
}

class _PresentationRail extends StatelessWidget {
  const _PresentationRail(this.c);
  final AppController c;
  @override
  Widget build(BuildContext context) {
    final steps = [
      (AppScreen.onboarding, '01', 'Welcome', 'Splash, onboarding and sign in'),
      (AppScreen.home, '02', 'Create home', 'AI Powered or Design Your Own'),
      (
        AppScreen.aiDesigner,
        '03',
        'AI Designer',
        'Describe, upload, choose a concept',
      ),
      (AppScreen.sport, '04', 'Design your own', 'Sport carousel and garment'),
      (AppScreen.studio, '05', 'Design Studio', 'Live 3D, tools and AI assist'),
      (
        AppScreen.projects,
        '06',
        'Save, export, library',
        'Projects, assets and sharing',
      ),
    ];
    final active = switch (c.screen) {
      AppScreen.splash || AppScreen.onboarding || AppScreen.auth => 0,
      AppScreen.home => 1,
      AppScreen.aiDesigner || AppScreen.generating || AppScreen.concepts => 2,
      AppScreen.sport || AppScreen.garment => 3,
      AppScreen.studio || AppScreen.showcase || AppScreen.artboard => 4,
      _ => 5,
    };
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(vertical: 30),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const BrandLogo(width: 260, tagline: true),
          const SizedBox(height: 42),
          Row(
            children: [
              Container(
                width: 6,
                height: 6,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: Palette.cyan,
                ),
              ),
              const SizedBox(width: 9),
              const Text(
                'CLIENT PRESENTATION  /  01',
                style: TextStyle(
                  fontSize: 10,
                  color: Palette.cyan,
                  letterSpacing: 2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 15),
          const Text(
            'Your next kit.\nStarts here.',
            style: TextStyle(
              fontFamily: 'Rajdhani',
              fontSize: 53,
              height: .98,
              fontWeight: FontWeight.w700,
              letterSpacing: -1,
            ),
          ),
          const SizedBox(height: 18),
          const Text(
            'From the first spark to the final look.\nExplore the 3DEEZI design experience.',
            style: TextStyle(color: Palette.muted, fontSize: 13, height: 1.8),
          ),
          const SizedBox(height: 27),
          ...steps.indexed.map(
            (e) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                color: active == e.$1
                    ? const Color(0xff0d222e)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => switch (e.$2.$1) {
                    AppScreen.aiDesigner => c.startAi(),
                    AppScreen.sport => c.startDyo(),
                    final screen => c.go(screen),
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    child: Row(
                      children: [
                        Text(
                          e.$2.$2,
                          style: TextStyle(
                            color: active == e.$1
                                ? Palette.cyan
                                : Palette.muted,
                            fontFamily: 'Rajdhani',
                            fontWeight: FontWeight.w700,
                            fontSize: 17,
                          ),
                        ),
                        const SizedBox(width: 17),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                e.$2.$3,
                                style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                  color: active == e.$1
                                      ? Palette.text
                                      : const Color(0xffa6b7c5),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                e.$2.$4,
                                style: const TextStyle(
                                  color: Palette.muted,
                                  fontSize: 10,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Icon(
                          Icons.arrow_outward,
                          size: 15,
                          color: active == e.$1 ? Palette.cyan : Palette.border,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 23),
          const Divider(),
          const SizedBox(height: 12),
          const Text(
            'INTERACTIVE FLUTTER PROTOTYPE',
            style: TextStyle(
              color: Palette.muted,
              letterSpacing: 1.5,
              fontSize: 9,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'OpenAI design generation · real-time 3D studio',
            style: TextStyle(color: Color(0xff586d7d), fontSize: 10),
          ),
        ],
      ),
    );
  }
}
