import 'dart:math' as math;
import 'dart:ui' show PointerDeviceKind;

import 'package:flutter/gestures.dart' show PointerScrollEvent;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../sports_catalog.dart';
import 'ui.dart';

/// A quick pick on the AI Designer's sports row (as the website's
/// AiStage.tsx). [sport] is the app's sport name the AI designs for (since
/// 2026-10-21 fight wear, fishing and workwear are categories of their own;
/// they still name themselves in the brief, [brief]).
/// [garments]: the garment chips offered when the brief names none.
class AiQuickSport {
  const AiQuickSport(
    this.id,
    this.label,
    this.sport, {
    this.brief,
    this.garments = aiAllGarments,
  });
  final String id, label, sport;
  final String? brief;
  final List<String> garments;
  String get art => 'assets/images/ai_designer/sport-$id.webp';
}

const aiAllGarments = [
  'Jersey',
  'Full Kit',
  'Shorts',
  'Training Tee',
  'Singlet',
  'Polo',
];

/// The row's first eleven (the client's order), then every other category of
/// lib/sports_catalog.dart in its order; garments come from the catalogue.
const _aiFirst = [
  'rugby-league',
  'rugby-union',
  'netball',
  'football',
  'basketball',
  'fight-wear',
  'fishing',
  'workwear',
  'afl',
  'hockey',
  'training',
];

/// Categories that also name themselves at the start of the brief.
const _aiBriefs = {
  'fight-wear': 'Fight wear',
  'fishing': 'Fishing apparel',
  'workwear': 'Workwear',
};

AiQuickSport _aiTile(SportCategory s) => AiQuickSport(
  s.id,
  s.aiLabel ?? s.name,
  s.name,
  brief: _aiBriefs[s.id],
  garments: s.garments,
);

final aiQuickSports = <AiQuickSport>[
  for (final id in _aiFirst) _aiTile(sportWithId(id)!),
  for (final s in sportCategories)
    if (!_aiFirst.contains(s.id)) _aiTile(s),
];

/// The longest brief the AI Designer takes (as the website).
const maxBrief = 4000;

/// 3620 → "3,620".
String formatCount(int n) =>
    n.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');

/// Keeps the brief to [maxBrief] characters: a longer paste keeps the first
/// [maxBrief] and calls [onCut] (to say so) instead of failing silently.
class BriefLimit extends TextInputFormatter {
  BriefLimit(this.onCut);
  final VoidCallback onCut;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    if (newValue.text.length <= maxBrief) return newValue;
    WidgetsBinding.instance.addPostFrameCallback((_) => onCut());
    final text = newValue.text.substring(0, maxBrief);
    final at = newValue.selection.baseOffset.clamp(0, maxBrief);
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: at),
    );
  }
}

/// The garment a brief names, if any ("navy polo" → Polo; "jersey and
/// shorts" → Full Kit), as the website's garmentInBrief.
String? garmentInBrief(String text) {
  final t = text.toLowerCase();
  bool has(String pattern) => RegExp(pattern).hasMatch(t);
  final top =
      has(
        r'\bjerseys?\b|\bguernseys?\b|\bjumpers?\b|\bshirts?\b|\blong[- ]sleeves?\b',
      ) &&
      !has(r'\bt-?shirts?\b|\bpolo shirts?\b');
  final shorts = has(r'\bshorts\b');
  if (has(r'\bfull[- ]?kits?\b|\bkits?\b|\buniforms?\b|\bstrips?\b') ||
      (top && shorts)) {
    return 'Full Kit';
  }
  // The track suit jacket (a track top, a tracksuit's jacket) is its own 3D
  // garment, with a collar or a hood.
  if (has(
    r'\btrack ?(?:suit )?(?:jackets?|tops?)\b|\btracksuit (?:jackets?|tops?)\b|\btrack suits?\b|\btracksuits?\b',
  ))
    return 'Track jacket';
  // Hoodies are 3D garments of their own (a zip one too); "hood" alone
  // (a fishing shirt's hood, "childhood") is not one.
  if (has(
    r'\bzip(?:ped)?[- ]?(?:up[- ]?|through[- ]?)?hood(?:ie|y)s?\b|\bfull[- ]zip hood(?:ie|y)s?\b',
  ))
    return 'Zip hoodie';
  if (has(
    r'\bhood(?:ie|y)s?\b|\bhooded (?:jumpers?|sweat\w*|tops?|pullovers?)\b',
  ))
    return 'Hoodie';
  // The varsity (letterman, baseball or college) jacket is its own 3D garment.
  if (has(
    r"\bvarsity jackets?\b|\bletterm[ae]n(?:'s)? jackets?\b|\bletter jackets?\b|\bletterm[ae]n\b|\b(?:baseball|college) jackets?\b",
  ))
    return 'Varsity jacket';
  if (has(
    r'\bpocket polos?\b|\bpolos? (?:shirts? )?with (?:a )?(?:chest )?pockets?\b',
  ))
    return 'Polo with pocket';
  if (has(r'\bpolos?\b')) return 'Polo';
  // A dress (netball, tennis) is the women's netball dress (task 9.126).
  if (has(r'\bdress(es)?\b')) return 'Netball dress';
  if (has(r'\bsinglets?\b|\bvests?\b|\btank tops?\b|\bbodysuits?\b')) {
    return 'Singlet';
  }
  if (has(
    r'\bt-?shirts?\b|\btees?\b|\bjackets?\b|\bhi-?vis\b|\brash ?guards?\b',
  )) {
    return 'Training Tee';
  }
  if (shorts) return 'Shorts';
  if (top) return 'Jersey';
  return null;
}

/// The sport a brief names when no tile was picked ("soccer" → Soccer).
AiQuickSport? sportInBrief(String text) {
  final t = text.toLowerCase();
  const words = [
    (r'rugby league|\bnrl\b', 'rugby-league'),
    (r'rugby union', 'rugby-union'),
    (r'\brugby\b', 'rugby-league'),
    (r'netball', 'netball'),
    (r'basketball', 'basketball'),
    // Before soccer, which also says "football".
    (r'american football|gridiron|\bnfl\b', 'american-football'),
    (
      r'touch football|\btouch (?:kit|team|club|jersey|tee|shirt|singlet|shorts)|oztag',
      'touch',
    ),
    (r'soccer|\bfootball\b|\bfc\b', 'football'),
    (r'\bafl\b|aussie rules|australian rules|guernsey', 'afl'),
    (r'hockey', 'hockey'),
    (
      r'boxing|\bmma\b|fight ?wear|martial arts|jiu.?jitsu|muay thai',
      'fight-wear',
    ),
    (r'fishing|angler', 'fishing'),
    (r'workwear|hi-?vis|tradie', 'workwear'),
    (r'\bgolf', 'golf'),
    (r'tennis', 'tennis'),
    (
      r'athletics|\brunning (?:club|team|kit|singlet)|track (?:and|&) field|cross[- ]country|marathon',
      'athletics',
    ),
    (r'swim|water ?polo|surf life', 'swimming'),
    (
      r'darts|billiards|snooker|\bpool (?:shirt|team|player|league|club)',
      'darts',
    ),
    (r'cricket', 'cricket'),
    (r'softball|baseball', 'softball'),
    (r'volleyball', 'volleyball'),
    (r'lacrosse', 'lacrosse'),
    (r'\bbmx\b|motocross|\bmx\b', 'bmx'),
    (r'cycling|cyclist|\bbike\b|bicycle', 'cycling'),
    (r'lawn bowls|\bbowls\b', 'lawn-bowls'),
    (r'e-?sports|gaming|\bgamers?\b', 'esports'),
    (r'school leavers|\bleavers\b|graduat', 'school-leavers'),
    (r'club casual|teamwear|clubwear|\bsupporters?\b', 'teamwear'),
    (r'gymwear|fitness|crossfit', 'gymwear'),
    (r'training|\bgym\b', 'training'),
  ];
  for (final (pattern, id) in words) {
    if (RegExp(pattern).hasMatch(t)) {
      return aiQuickSports.firstWhere((s) => s.id == id);
    }
  }
  return null;
}

/// The dark studio behind the AI Designer: the 3DEEZI emblem on the left and
/// the kit on the right (the website's picture), darker where the text sits.
class AiStageBackdrop extends StatelessWidget {
  const AiStageBackdrop({super.key});

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    // Its own box, not the window: the web preview shows the app in a phone frame.
    builder: (context, box) => _layers(box.maxWidth > box.maxHeight),
  );

  Widget _layers(bool wide) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.asset(
          wide
              ? 'assets/images/ai_designer/bg-1440.webp'
              : 'assets/images/ai_designer/bg-tall-1024.webp',
          fit: BoxFit.cover,
          alignment: wide ? const Alignment(0, .2) : Alignment.center,
          filterQuality: FilterQuality.medium,
          errorBuilder: (_, _, _) => const ColoredBox(color: Palette.bg),
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(0, -.25),
              radius: .9,
              colors: [Color(0xc402060b), Color(0x6602060b), Color(0x0002060b)],
              stops: [0, .55, 1],
            ),
          ),
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0x9902060b),
                Color(0x0002060b),
                Color(0x0002060b),
                Color(0xff02060b),
              ],
              stops: [0, .2, .72, 1],
            ),
          ),
        ),
      ],
    );
  }
}

/// The sports row: a tile only sets the sport for the design (the screen
/// stays); tap the chosen one again to clear it. Swipes sideways.
class AiSportRow extends StatefulWidget {
  const AiSportRow({super.key, required this.selected, required this.onSelect});
  final String? selected;
  final ValueChanged<String> onSelect;

  @override
  State<AiSportRow> createState() => _AiSportRowState();
}

/// The row scrolls with a finger, a mouse drag or the wheel; round ‹ › buttons
/// page it and a soft fade marks the cut-off side (client 2026-10-28).
class _AiSportRowState extends State<AiSportRow> {
  final _scroll = ScrollController();
  bool _prev = false, _next = true;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_measure);
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _measure() {
    if (!mounted || !_scroll.hasClients) return;
    final p = _scroll.position;
    final prev = p.pixels > 2, next = p.pixels < p.maxScrollExtent - 2;
    if (prev != _prev || next != _next) {
      setState(() {
        _prev = prev;
        _next = next;
      });
    }
  }

  void _page(int dir) {
    if (!_scroll.hasClients) return;
    final p = _scroll.position;
    final step = math.max(p.viewportDimension - 116, 116.0);
    _scroll.animateTo(
      (p.pixels + dir * step).clamp(0.0, p.maxScrollExtent),
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
    );
  }

  Widget _arrow(int dir) => Material(
    key: ValueKey(dir < 0 ? 'ai-sports-prev' : 'ai-sports-next'),
    color: const Color(0xcc03101a),
    shape: CircleBorder(
      side: BorderSide(color: Palette.cyan.withValues(alpha: .7), width: 1.5),
    ),
    elevation: 3,
    child: InkWell(
      customBorder: const CircleBorder(),
      onTap: () => _page(dir),
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Icon(
          dir < 0 ? Icons.chevron_left_rounded : Icons.chevron_right_rounded,
          color: Colors.white,
          size: 22,
          semanticLabel: dir < 0 ? 'Previous sports' : 'More sports',
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 140,
    child: NotificationListener<ScrollMetricsNotification>(
      onNotification: (_) {
        _measure();
        return false;
      },
      child: Stack(
        children: [
          Positioned.fill(
            child: ShaderMask(
              blendMode: BlendMode.dstIn,
              shaderCallback: (r) => LinearGradient(
                colors: [
                  _prev ? Colors.transparent : Colors.black,
                  Colors.black,
                  Colors.black,
                  _next ? Colors.transparent : Colors.black,
                ],
                stops: [0, 40 / r.width, 1 - 40 / r.width, 1],
              ).createShader(r),
              child: ScrollConfiguration(
                behavior: ScrollConfiguration.of(
                  context,
                ).copyWith(dragDevices: PointerDeviceKind.values.toSet()),
                child: Listener(
                  // A plain mouse wheel (up/down) scrolls the row sideways.
                  onPointerSignal: (e) {
                    if (e is PointerScrollEvent &&
                        e.scrollDelta.dx == 0 &&
                        _scroll.hasClients) {
                      final p = _scroll.position;
                      _scroll.jumpTo(
                        (p.pixels + e.scrollDelta.dy).clamp(
                          0.0,
                          p.maxScrollExtent,
                        ),
                      );
                    }
                  },
                  child: ListView.separated(
                    controller: _scroll,
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 4,
                    ),
                    itemCount: aiQuickSports.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 10),
                    itemBuilder: (context, i) {
                      final s = aiQuickSports[i];
                      final on = s.id == widget.selected;
                      return Semantics(
                        button: true,
                        selected: on,
                        label: on
                            ? '${s.label}, chosen'
                            : 'Design for ${s.label}',
                        excludeSemantics: true,
                        child: GestureDetector(
                          onTap: () => widget.onSelect(s.id),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 180),
                            width: 106,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: on
                                    ? Palette.cyan
                                    : const Color(0x33ffffff),
                                width: on ? 2 : 1,
                              ),
                              boxShadow: on
                                  ? [
                                      BoxShadow(
                                        color: Palette.cyan.withValues(
                                          alpha: .45,
                                        ),
                                        blurRadius: 16,
                                      ),
                                    ]
                                  : const [],
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(11),
                              child: Stack(
                                fit: StackFit.expand,
                                children: [
                                  Image.asset(
                                    s.art,
                                    fit: BoxFit.cover,
                                    cacheWidth: 300,
                                    errorBuilder: (_, _, _) => const ColoredBox(
                                      color: Palette.surface,
                                    ),
                                  ),
                                  const DecoratedBox(
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        begin: Alignment.topCenter,
                                        end: Alignment.bottomCenter,
                                        colors: [
                                          Color(0x0002060b),
                                          Color(0xf002060b),
                                        ],
                                        stops: [.45, .95],
                                      ),
                                    ),
                                  ),
                                  Positioned(
                                    left: 4,
                                    right: 4,
                                    bottom: 16,
                                    child: Text(
                                      s.label.toUpperCase(),
                                      textAlign: TextAlign.center,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w800,
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                  Positioned(
                                    left: 42,
                                    right: 42,
                                    bottom: 8,
                                    child: Container(
                                      height: 2,
                                      color: Palette.cyan,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
          ),
          if (_prev)
            Positioned(
              left: 6,
              top: 0,
              bottom: 0,
              child: Center(child: _arrow(-1)),
            ),
          if (_next)
            Positioned(
              right: 6,
              top: 0,
              bottom: 0,
              child: Center(child: _arrow(1)),
            ),
        ],
      ),
    ),
  );
}
