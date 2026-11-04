part of 'bubble_home.dart';

/// "A QUICK LOOK AROUND" (client picture 301, 2026-11-02): shown once over
/// the bubble home on the first visit, and again from Profile (Help). A
/// short animated demo on the real glass: swipe towards an option, it
/// lights up, release to open, or just tap. Skip and START CREATING close
/// it; "Replay tutorial" plays the demo again.
class BubbleTutorial extends StatefulWidget {
  const BubbleTutorial({super.key, required this.onDone});

  /// Skip or START CREATING.
  final VoidCallback onDone;

  /// Saved on the device once the tutorial has been closed.
  static const seenKey = 'bubble_tutorial_seen';

  /// True while the tutorial is open (the switcher's slow-phone check
  /// waits for it).
  static final showing = ValueNotifier<bool>(false);

  /// Whether the tutorial was already seen on this device; null when the
  /// device cannot keep it (then it is not shown).
  static Future<bool?> seen() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getBool(seenKey) ?? false;
    } catch (_) {
      return null;
    }
  }

  static Future<void> markSeen() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(seenKey, true);
    } catch (_) {}
  }

  /// Opens the tutorial as its own page (Profile's Help row).
  static Future<void> open(BuildContext context) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (context) => Scaffold(
        backgroundColor: const Color(0xff030a14),
        body: SafeArea(
          child: BubbleTutorial(onDone: () => Navigator.of(context).pop()),
        ),
      ),
    ),
  );

  @override
  State<BubbleTutorial> createState() => _BubbleTutorialState();
}

class _BubbleTutorialState extends State<BubbleTutorial>
    with TickerProviderStateMixin {
  @override
  void initState() {
    super.initState();
    BubbleTutorial.showing.value = true;
  }

  static const _length = Duration(seconds: 8);
  late final AnimationController _demo = AnimationController(
    vsync: this,
    duration: _length,
  );
  late final AnimationController _float = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 10),
  );
  bool _reduce = false, _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (_started) return;
    _started = true;
    if (_reduce) {
      // Reduced motion: one still frame of the lit option, paused.
      _demo.value = .5;
    } else {
      _demo.repeat();
      _float.repeat();
    }
  }

  @override
  void dispose() {
    BubbleTutorial.showing.value = false;
    _demo.dispose();
    _float.dispose();
    super.dispose();
  }

  void _togglePlay() => setState(() {
    if (_demo.isAnimating) {
      _demo.stop();
      _float.stop();
    } else {
      _demo.repeat();
      if (!_reduce) _float.repeat();
    }
  });

  void _replay() => setState(() {
    _demo.value = 0;
    _demo.repeat();
    if (!_reduce) _float.repeat();
  });

  static String _clock(double seconds) =>
      '0:${seconds.floor().toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    const title = TextStyle(
      fontFamily: 'Rajdhani',
      fontWeight: FontWeight.w700,
      fontSize: 29,
      height: 1.05,
      letterSpacing: .6,
      color: Color(0xffe8f8ff),
    );
    return DecoratedBox(
      key: const ValueKey('bubble-tutorial'),
      decoration: const BoxDecoration(
        gradient: RadialGradient(
          center: Alignment(0, -.3),
          radius: 1.2,
          colors: [Color(0xff0a2547), Color(0xff051428), Color(0xff030a14)],
          stops: [0, .55, 1],
        ),
      ),
      // Scrolls when the frame is short (the desktop preview), so the demo
      // glass can stay large.
      child: LayoutBuilder(
        builder: (context, box) {
          final w = box.maxWidth - 32;
          final demoH = (box.maxHeight - 370).clamp(w * .85, w / .72);
          return SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Column(
                children: [
                  SizedBox(
                    width: double.infinity,
                    height: 44,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        const BrandLogo(width: 150),
                        Positioned(
                          right: 0,
                          child: TextButton(
                            key: const ValueKey('tutorial-skip'),
                            onPressed: widget.onDone,
                            style: TextButton.styleFrom(
                              foregroundColor: const Color(0xffb9d8ea),
                              minimumSize: const Size(48, 40),
                            ),
                            child: const Text('Skip'),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'A QUICK LOOK AROUND',
                    textAlign: TextAlign.center,
                    style: title,
                  ),
                  const SizedBox(height: 2),
                  const Text(
                    'See how it works in a few seconds.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Color(0xffb9d0e0), fontSize: 13.5),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: demoH,
                    child: ExcludeSemantics(
                      child: AnimatedBuilder(
                        animation: Listenable.merge([_demo, _float]),
                        builder: (context, _) =>
                            _DemoGlass(time: _demo.value, float: _float.value),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  // The step being shown, under the glass (never over a label).
                  AnimatedBuilder(
                    animation: _demo,
                    builder: (context, _) => AnimatedSwitcher(
                      duration: const Duration(milliseconds: 250),
                      child: Container(
                        key: ValueKey(_DemoGlass.captionAt(_demo.value)),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 7,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xb3061a36),
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: const Color(0x663fd4ff)),
                        ),
                        child: Text(
                          _DemoGlass.captionAt(_demo.value),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13.5,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  _playerBar(),
                  const SizedBox(height: 10),
                  const Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: 'SWIPE. ',
                          style: TextStyle(color: Color(0xff3fd4ff)),
                        ),
                        TextSpan(text: 'HIGHLIGHT. RELEASE.'),
                      ],
                    ),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontFamily: 'Rajdhani',
                      fontWeight: FontWeight.w700,
                      fontSize: 21,
                      letterSpacing: .8,
                      color: Color(0xffe8f8ff),
                    ),
                  ),
                  const Text(
                    'You can also tap any option.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Color(0xffc4d8e6), fontSize: 13.5),
                  ),
                  const SizedBox(height: 10),
                  _StartButton(onTap: widget.onDone),
                  const SizedBox(height: 2),
                  TextButton(
                    key: const ValueKey('tutorial-replay'),
                    onPressed: _replay,
                    style: TextButton.styleFrom(
                      foregroundColor: const Color(0xff3fd4ff),
                      minimumSize: const Size(48, 36),
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                    ),
                    child: const Text(
                      'Replay tutorial',
                      style: TextStyle(
                        decoration: TextDecoration.underline,
                        decorationColor: Color(0xff3fd4ff),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const Text(
                    'Watch again anytime in Profile, under Help.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Color(0xff8fa8ba), fontSize: 11.5),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _playerBar() => AnimatedBuilder(
    animation: _demo,
    builder: (context, _) {
      final secs = _length.inMilliseconds / 1000;
      return Container(
        height: 40,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        decoration: BoxDecoration(
          color: const Color(0xcc061428),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0x553fd4ff)),
        ),
        child: Row(
          children: [
            IconButton(
              key: const ValueKey('tutorial-play'),
              tooltip: _demo.isAnimating ? 'Pause' : 'Play',
              onPressed: _togglePlay,
              iconSize: 22,
              color: Colors.white,
              icon: Icon(
                _demo.isAnimating
                    ? Icons.pause_rounded
                    : Icons.play_arrow_rounded,
              ),
            ),
            Text(
              '${_clock(_demo.value * secs)} / ${_clock(secs)}',
              style: const TextStyle(color: Colors.white, fontSize: 12),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: SizedBox(
                  height: 5,
                  child: Stack(
                    children: [
                      const Positioned.fill(
                        child: ColoredBox(color: Color(0x33ffffff)),
                      ),
                      FractionallySizedBox(
                        widthFactor: _demo.value.clamp(0.0, 1.0),
                        child: const ColoredBox(color: Color(0xff3fd4ff)),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: 14),
          ],
        ),
      );
    },
  );
}

class _StartButton extends StatelessWidget {
  const _StartButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: 'Start creating',
    child: ExcludeSemantics(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          key: const ValueKey('tutorial-start'),
          onTap: onTap,
          borderRadius: BorderRadius.circular(30),
          child: Ink(
            height: 54,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(30),
              gradient: const LinearGradient(
                colors: [
                  Color(0xff19c6ff),
                  Color(0xff1f6fff),
                  Color(0xff6a4dff),
                ],
                stops: [0, .6, 1],
              ),
              border: Border.all(color: const Color(0x99c8f4ff), width: 1.2),
              boxShadow: const [
                BoxShadow(color: Color(0x8019b6ff), blurRadius: 22),
              ],
            ),
            child: const Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'START CREATING',
                    style: TextStyle(
                      fontFamily: 'Rajdhani',
                      fontWeight: FontWeight.w700,
                      fontSize: 21,
                      letterSpacing: 1,
                      color: Colors.white,
                    ),
                  ),
                  SizedBox(width: 10),
                  Icon(Icons.arrow_forward_rounded, color: Colors.white),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

/// The demo: the real glass and options, driven by [time] (0–1 over the
/// demo) instead of a finger.
class _DemoGlass extends StatelessWidget {
  const _DemoGlass({required this.time, required this.float});
  final double time, float;

  static const _ai = 0, _dyo = 1;
  static const _captions = [
    'Swipe towards an option',
    'It lights up: release to enter',
    'Release to open',
    'Or just tap an option',
  ];

  /// The step shown under the glass at demo time [t].
  static String captionAt(double t) =>
      _captions[t < .3
          ? 0
          : t < .58
          ? 1
          : t < .78
          ? 2
          : 3];

  /// 0→1 as [t] goes from [a] to [b], eased.
  static double _ramp(double t, double a, double b) =>
      Curves.easeInOut.transform(((t - a) / (b - a)).clamp(0.0, 1.0));

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final s = box.biggest;
      Offset at(int i) =>
          Offset(_spots[i].at.dx * s.width, _spots[i].at.dy * s.height);
      Rect rect(int i) => Rect.fromCenter(
        center: at(i),
        width: _spots[i].box.width * s.width,
        height: _spots[i].box.height * s.height,
      );
      final t = time;
      final mid = Offset(s.width * .5, s.height * .55);
      // The swipe: towards AI, hold, release, the glass opens and settles.
      final swipe = t >= .08 && t < .6;
      final move = _ramp(t, .1, .4);
      final finger = Offset.lerp(mid, at(_ai), move)!;
      final aiLit = (t >= .3 && t < .72);
      final open = t < .58
          ? 0.0
          : t < .66
          ? _ramp(t, .58, .66)
          : 1 - _ramp(t, .66, .74);
      final tapDyo = t >= .8 && t < .96;
      final pocketIdx = tapDyo ? _dyo : _ai;
      final pocket = tapDyo
          ? _ramp(t, .8, .84) * (1 - _ramp(t, .92, .96))
          : _ramp(t, .3, .36) * (1 - _ramp(t, .66, .74));
      final pull = swipe ? 1.0 : 0.0;
      final lit = tapDyo ? _dyo : (aiLit ? _ai : null);
      final strong = (aiLit && t >= .36) || (tapDyo && t >= .82);
      return ClipRRect(
        borderRadius: BorderRadius.circular(28),
        clipBehavior: Clip.none,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned.fill(
              child: CustomPaint(
                painter: HomeGlassPainter(
                  t: float,
                  pullAt: swipe ? finger : mid,
                  pull: pull,
                  pocketAt: pocket > 0 ? at(pocketIdx) : null,
                  pocket: pocket,
                  pocketR: rect(pocketIdx).longestSide * .5,
                  pocketStrong: strong,
                ),
                foregroundPainter: _TrailPainter(
                  start: swipe && move > 0 ? mid : null,
                  finger: swipe && move > 0 ? finger : null,
                  target: aiLit && swipe ? at(_ai) : null,
                  open: open,
                  reduce: false,
                  ring: null,
                  ringRadius: s.shortestSide * .21,
                ),
                child: Stack(
                  children: [
                    Positioned(
                      left: s.width * .2,
                      right: s.width * .2,
                      top: s.height * .345,
                      height: s.height * .23,
                      child: _GlassMark(bright: lit != null),
                    ),
                    for (var i = 0; i < _spots.length; i++)
                      Positioned.fromRect(
                        rect: rect(i),
                        child: Transform.scale(
                          scale: lit == i ? (strong ? 1.1 : 1.05) : 1,
                          child: Opacity(
                            opacity: lit != null && lit != i ? .6 : 1,
                            child: ColorFiltered(
                              colorFilter: _BubbleHomeScreenState._brightness(
                                lit == i ? (strong ? 1.3 : 1.15) : 1,
                              ),
                              child: _SpotFace(_spots[i]),
                            ),
                          ),
                        ),
                      ),
                    if (tapDyo)
                      Positioned.fill(
                        child: CustomPaint(
                          painter: _TapPulse(
                            at: at(_dyo),
                            k: _ramp(t, .8, .88),
                          ),
                        ),
                      ),
                    if (aiLit && t < .6)
                      Positioned(
                        left: 0,
                        width: s.width * .62,
                        top: rect(_ai).bottom,
                        child: const Column(
                          children: [
                            Text(
                              'AI DESIGNER',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                shadows: [Shadow(color: _cyan, blurRadius: 12)],
                              ),
                            ),
                            Text(
                              'Release to enter',
                              style: TextStyle(
                                color: Color(0xffd8f6ff),
                                fontSize: 12.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    },
  );
}

/// A tap: a ring spreading out from [at] as [k] goes 0→1.
class _TapPulse extends CustomPainter {
  _TapPulse({required this.at, required this.k});
  final Offset at;
  final double k;

  @override
  void paint(Canvas canvas, Size size) {
    if (k <= 0 || k >= 1) return;
    canvas.drawCircle(
      at,
      12 + 34 * k,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4
        ..color = Colors.white.withValues(alpha: 1 - k)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2),
    );
    canvas.drawCircle(
      at,
      9,
      Paint()..color = _cyan.withValues(alpha: (1 - k) * .9),
    );
  }

  @override
  bool shouldRepaint(_TapPulse o) => o.k != k || o.at != at;
}
