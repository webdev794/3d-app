import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'ai_service.dart';
import 'app_controller.dart';
import 'export_service.dart';
import 'part_editing.dart';
import 'project_sync.dart';
import 'screens/product_mockup.dart' show ProductMockup;
import 'widgets/flow_ui.dart';
import 'widgets/ui.dart';

/// "See it on a player" (tasks.md 9.128 C): the kit worn by a photoreal
/// athlete in the sport's own setting. Mirrors the website's
/// app/Services/PlayerShot.php.
class PlayerShot {
  static const poses = {
    'front':
        'standing facing the camera in a confident hero pose, full upper body '
        'and thighs in frame, the whole front of the kit clearly visible',
    'action':
        'in a dynamic game-action moment typical of the sport, sharp motion, '
        'the kit clearly visible and in focus',
    'team':
        'in a team photo: the player in the front centre with three or four '
        'team-mates behind, every player wearing the identical kit',
  };
  static const poseNames = {
    'front': 'Front',
    'action': 'Action',
    'team': 'Team photo',
  };

  static const _settings = {
    'netball':
        'on an indoor netball court with painted court lines and a netball hoop behind, arena lighting',
    'rugby':
        'on a green rugby field with white rugby posts behind, floodlit stadium crowd softly blurred',
    'afl':
        'on an oval Australian rules football ground with tall goal posts, floodlit stands blurred',
    'american':
        'on an American football field with yard lines and goal posts, stadium lights',
    'football':
        'on a football (soccer) pitch with a goal net behind, floodlit stadium blurred',
    'soccer':
        'on a football (soccer) pitch with a goal net behind, floodlit stadium blurred',
    'basketball':
        'on an indoor basketball court with a hoop and hardwood floor, arena lighting',
    'hockey':
        'on a blue artificial hockey turf with a hockey goal, floodlights',
    'cricket':
        'on a cricket ground with the pitch and stumps, stadium under lights',
    'tennis': 'on a tennis court with the net behind, bright daylight',
    'golf': 'on a golf course fairway with the green behind, soft daylight',
    'athletic': 'on a red running track in an athletics stadium',
    'swim': 'on a pool deck beside an indoor swimming pool with lane ropes',
    'cycling': 'on a scenic road with a road bike, soft daylight',
    'bmx': 'at a BMX race track with dirt jumps and a start gate',
    'volleyball': 'on an indoor volleyball court with the net behind',
    'softball': 'on a softball diamond with the infield behind',
    'baseball': 'on a baseball diamond with the infield behind',
    'lacrosse': 'on a lacrosse field with a goal behind',
    'touch': 'on a grass touch football field under floodlights',
    'darts':
        'in a darts and pool bar with a dartboard and pool table behind, warm lighting',
    'bowls': 'on a lawn bowls green on a sunny day',
    'esports': 'in an esports arena with gaming PCs and RGB lighting',
    'fight': 'in a combat gym with an octagon cage behind',
    'fishing': 'on a boat at sea on a sunny day',
    'workwear': 'at a work site with a warehouse behind, daylight',
    'gym': 'in a modern gym with weights and racks behind',
    'training': 'on a training ground with cones and goals behind',
  };

  static String setting(String sport, String garment) {
    final s = '$sport $garment'.toLowerCase();
    for (final e in _settings.entries) {
      if (s.contains(e.key)) return e.value;
    }
    return 'in a modern sports venue with soft natural light';
  }

  /// Netball dresses are worn by women; otherwise the user's choice.
  static bool womenOnly(String garment) =>
      garment.toLowerCase().contains('dress');
  static String player(String asked, String garment) =>
      womenOnly(garment) ? 'female' : (asked == 'female' ? 'female' : 'male');

  /// The 3D front and back captures (two pictures) wear the 3DEEZI "3D"
  /// shield unless the club has a logo: named so it is not misread as "30".
  /// A single AI design picture has its own crest.
  static String _badge(int pictures) =>
      pictures > 1 ? ', ${ProductMockup.badge}' : '';

  /// A hex colour in plain words ("#240c12" → "near-black burgundy"); the
  /// image model reads a bare hex code loosely (bug 2026-10-27,
  /// images/193.jpg). The same rules as the website's PlayerShot::colourName.
  static String colourName(String hex) {
    final m = RegExp(r'^#?([0-9a-fA-F]{6})$').firstMatch(hex.trim());
    if (m == null) return 'colour';
    final v = int.parse(m[1]!, radix: 16);
    final r = (v >> 16 & 255) / 255, g = (v >> 8 & 255) / 255;
    final b = (v & 255) / 255;
    final mx = math.max(r, math.max(g, b)), mn = math.min(r, math.min(g, b));
    final d = mx - mn, l = (mx + mn) / 2;
    final s = d == 0 ? 0.0 : d / (1 - (2 * l - 1).abs());
    if (d < 0.06 || s < 0.12) {
      return l < 0.1
          ? 'black'
          : l < 0.22
          ? 'near-black charcoal'
          : l < 0.42
          ? 'dark grey'
          : l < 0.68
          ? 'grey'
          : l < 0.9
          ? 'light grey'
          : 'white';
    }
    final h = mx == r
        ? 60 * (((g - b) / d + 6) % 6)
        : mx == g
        ? 60 * ((b - r) / d + 2)
        : 60 * ((r - g) / d + 4);
    final hue = h < 10 || h >= 338
        ? (l > 0.55 ? 'pinkish red' : 'red')
        : h < 20
        ? 'red-orange'
        : h < 40
        ? 'orange'
        : h < 52
        ? 'gold'
        : h < 66
        ? 'yellow'
        : h < 90
        ? 'lime green'
        : h < 150
        ? 'green'
        : h < 172
        ? 'teal green'
        : h < 195
        ? 'cyan'
        : h < 215
        ? 'sky blue'
        : h < 240
        ? 'blue'
        : h < 258
        ? 'indigo'
        : h < 290
        ? 'purple'
        : h < 320
        ? 'magenta'
        : 'pink';
    final reds = const ['red', 'pinkish red', 'pink', 'magenta'].contains(hue);
    final blues = const ['blue', 'indigo', 'sky blue'].contains(hue);
    final warm = const ['red-orange', 'orange', 'gold', 'yellow'].contains(hue);
    if (l < 0.12) {
      return 'near-black ${reds
          ? 'burgundy'
          : blues
          ? 'navy'
          : hue}';
    }
    if (l < 0.3) {
      return reds
          ? 'dark burgundy'
          : blues
          ? 'navy'
          : warm
          ? 'dark brown'
          : 'dark $hue';
    }
    if (warm && l < 0.38) return 'brown';
    if (l > 0.85) {
      return warm
          ? 'cream'
          : reds
          ? 'pale pink'
          : 'very pale $hue';
    }
    if (l > 0.7) return reds ? 'light pink' : 'light $hue';
    return '${s > 0.7
        ? 'bright '
        : s < 0.35
        ? 'muted '
        : ''}${l < 0.4 ? 'deep ' : ''}$hue';
  }

  /// The kit's colour list ("body: #240c12", …) with every hex code named.
  static List<String> namedColours(List<String> colours) => [
    for (final c in colours)
      if (c.trim().isNotEmpty)
        c.trim().replaceAllMapped(
          RegExp(r'#[0-9a-fA-F]{6}\b'),
          (m) => '${m[0]!.toLowerCase()} (${colourName(m[0]!)})',
        ),
  ];

  /// What the garment covers: 'top', 'full' (top and shorts), 'shorts' or
  /// 'dress'.
  static String coverage(String garment) {
    final g = garment.toLowerCase();
    if (RegExp(r'full ?kit').hasMatch(g)) return 'full';
    if (g.contains('dress')) return 'dress';
    if (RegExp(r'\bshorts\b').hasMatch(g)) return 'shorts';
    return 'top';
  }

  /// The kit to copy: its colours by area in words, then the lettering. The
  /// Studio's 3D renders (two pictures) are lit by blue and pink stadium
  /// light, which is not part of the kit.
  static String _kitSection(
    List<String> colours,
    String logoText,
    int pictures,
  ) {
    final named = namedColours(colours);
    final logo = logoText.trim().toUpperCase();
    return '${named.isNotEmpty ? 'THE KIT, to copy exactly: ${named.join('; ')}. These are its true colours: use each one only for its own area, and take the pattern\'s shape and placement, the trims, the crest and the logos from the kit pictures' : 'THE KIT, to copy exactly: take its colours, pattern, trims, crest and logos from the kit picture'}'
        '${pictures > 1 ? '. The kit pictures are 3D renders under coloured stadium lights: the blue and pink light, the dark backdrop and the podium are not part of the kit' : ''}'
        '. No other colours, no gradients or patterns that the kit does not '
        'have. Lettering: the same crest and logos in the same places'
        '${logo.isEmpty ? '' : ', the team wordmark on the chest reads exactly "$logo"'}'
        '${_badge(pictures)}';
  }

  /// The back's name and number, in capitals as the 3D kit draws them.
  static String _backLettering(
    String logoText,
    String backName,
    String number,
    String lead,
  ) {
    final logo = logoText.trim().toUpperCase();
    final back = backName.trim().isEmpty ? logo : backName.trim().toUpperCase();
    if (back.isEmpty) return '';
    return '$lead reads exactly "$back"'
        '${number.trim().isEmpty ? '' : ' with the number "${number.trim()}"'}';
  }

  static String prompt({
    required String sport,
    required String garment,
    String player = 'male',
    String pose = 'front',
    List<String> colours = const [],
    String logoText = '',
    String backName = '',
    String number = '',
    int pictures = 1,
  }) {
    final who = PlayerShot.player(player, garment);
    final refs = pictures > 1
        ? 'The reference images show the front and the back of the garment; '
              'they are only references for the design: make ONE single '
              'photograph, never a collage, split image or two panels.'
        : 'The reference image shows the garment design.';
    // Only the user's garment carries the design (images/193.jpg).
    final wear = switch (coverage(garment)) {
      'full' =>
        'The kit is the top and the matching shorts, both as in the kit '
            'pictures, with plain socks.',
      'dress' => 'The dress is the whole kit, with plain socks.',
      'shorts' =>
        'Only the shorts are the user\'s design: the athlete wears them with '
            'a plain top in a simple matching solid colour, with no logos, '
            'numbers or graphics on it.',
      _ =>
        'Only the $garment is the user\'s design: the athlete wears it with '
            'plain shorts and socks in a simple matching solid colour, with no '
            'logos, numbers or graphics on them.',
    };
    return 'A premium photorealistic sports photograph of a real $who athlete '
        'wearing this exact $sport $garment, ${poses[pose] ?? poses['front']}, '
        '${setting(sport, garment)}. $refs '
        '${_kitSection(colours, logoText, pictures)}'
        '${pose != 'front' ? _backLettering(logoText, backName, number, ', where the back shows the lettering') : ''}'
        '. $wear Do not add, remove or change any text, logos or graphics; do '
        'not invent sponsors. The garment fits the athlete naturally with real '
        'fabric folds, stitching and slight sheen. A believable athlete with a '
        'natural face and body, professional sports photography, sharp focus '
        'on the kit, cinematic lighting, shallow depth of field, ultra-detailed, '
        'no watermark, no UI, no text overlays.';
  }

  /// Your own photo: that person dressed in the kit, everything else kept.
  /// Only what the garment covers changes (a jersey: the top; their own
  /// shorts, socks and shoes stay), and nothing of their old clothes carries
  /// over (bug 2026-10-27, images/193.jpg).
  static String personPrompt({
    required String sport,
    required String garment,
    List<String> colours = const [],
    String logoText = '',
    String backName = '',
    String number = '',
    int kitPictures = 1,
  }) {
    final (swap, keep) = switch (coverage(garment)) {
      'full' => (
        'replace their top with the kit\'s top and their shorts or trousers '
            'with the kit\'s matching shorts',
        ', and their own socks and shoes',
      ),
      'dress' => (
        'replace their top and their shorts, trousers or skirt with the kit '
            'dress',
        ', and their own socks and shoes',
      ),
      'shorts' => (
        'replace ONLY their shorts or trousers with the kit shorts',
        ', and their own top, socks and shoes',
      ),
      _ => (
        'replace ONLY their top (shirt, jersey or jacket) with the kit $garment',
        ', and their own shorts or trousers, socks and shoes (do not turn them '
            'into kit shorts or socks, do not add a number or logo to them)',
      ),
    };
    return 'Image 1 is a photo of a real person. '
        '${kitPictures > 1 ? 'Images 2 and 3 show the front and back' : 'Image 2 shows the design'}'
        ' of a $sport $garment (the kit). Edit image 1 only: $swap, worn '
        'naturally and fitted to their body and pose. Keep the person\'s face, '
        'identity, skin, hair, body shape, pose, hands, framing, lighting and '
        'background exactly as in image 1$keep; change nothing else. Ignore '
        'the clothes the person wears in image 1: none of their colours, '
        'logos, badges, numbers or patterns may appear on the kit. '
        '${_kitSection(colours, logoText, kitPictures)}'
        '${_backLettering(logoText, backName, number, ', any visible back lettering')}'
        '. Do not add, remove or change any text, logos or graphics. Real '
        'fabric folds and stitching, photoreal, ONE single photograph (not a '
        'collage), no watermark, no text overlays.';
  }

  /// The image size that keeps the photo's shape.
  static Future<String> sizeFor(Uint8List photo) async {
    try {
      final codec = await ui
          .instantiateImageCodec(photo)
          .timeout(const Duration(seconds: 3));
      final f = (await codec.getNextFrame().timeout(
        const Duration(seconds: 3),
      )).image;
      final w = f.width, h = f.height;
      f.dispose();
      return w > h * 1.15
          ? '1536x1024'
          : h > w * 1.15
          ? '1024x1536'
          : '1024x1024';
    } on Object {
      return '1024x1536';
    }
  }
}

/// The kit handed to the player screen.
class PlayerKit {
  const PlayerKit({
    required this.pictures,
    required this.sport,
    required this.garment,
    this.name = '',
    this.colours = const [],
    this.logoText = '',
    this.backName = '',
    this.number = '',
  });

  /// The Studio's kit with fresh pictures of its live 3D.
  factory PlayerKit.fromStudio(AppController c, List<Uint8List> pictures) =>
      PlayerKit(
        pictures: pictures,
        sport: c.sport,
        garment: c.garmentLabel,
        name: c.projectName,
        colours: kitColours(c),
        logoText: c.logoText,
        backName: c.backName,
        number: c.number,
      );
  final List<Uint8List> pictures;
  final String sport, garment, name, logoText, backName, number;

  /// The kit's colours by area ("body: #240c12", …): see [kitColours].
  final List<String> colours;
}

final _hex = RegExp(r'^#[0-9a-fA-F]{6}$');

/// The 3D kit's patterns in words (viewer/src/texture.js patternTile).
const _patternWords = {
  'Chevron': 'thin chevron (V-shaped) lines evenly spaced from chest to hem',
  'Stripes': 'thin vertical pinstripes',
  'Velocity': 'angled speed stripes down both sides of the chest',
  'Blades': 'curved blade stripes sweeping up both sides from the hem',
  'Swirl': 'a dense maze of winding lines, like brain coral, over the shoulders and sleeves',
  'Hoops': 'horizontal hoops across the body',
  'Dots': 'a fine all-over dot pattern',
  'Diagonal': 'thin diagonal lines across the body',
  'Tribal': 'bands of small interlocking triangles across the body',
  'Camo': 'a camouflage pattern',
};

String _gradientWords(Map<dynamic, dynamic> g) {
  final list = g['stops'];
  final stops = list is List && list.length >= 2
      ? ([...list]..sort(
              (a, b) =>
                  ((a['at'] as num?) ?? 0).compareTo((b['at'] as num?) ?? 0),
            ))
            .map((s) => '${s['color']}')
            .toList()
      : ['${g['from']}', '${g['to']}'];
  final angle = (g['angle'] as num?) ?? 0;
  final way = angle == 0
      ? 'top to bottom'
      : angle == 90
      ? 'left to right'
      : 'at ${angle.round()}°';
  return 'a gradient of ${stops.join(', ')} ($way)';
}

/// The Studio kit's colours by area, in the 3D kit's own rules (body, the
/// pattern's ink, trims, lettering, areas): the image model needs to know
/// which colour goes where (bug 2026-10-27, images/193.jpg). The same list as
/// the website's kitColours (PlayerShot.tsx).
List<String> kitColours(AppController c) {
  String hex(Color x) => ProjectSync.hex(x);
  final own = c.patternColorOwn == true && _hex.hasMatch(c.patternColor ?? '')
      ? c.patternColor!.toLowerCase()
      : null;
  final bodyArea = c.zoneColors['body'];
  final gradients = c.gradients ?? const {};
  final lines = [
    'body: ${bodyArea != null && _hex.hasMatch(bodyArea)
        ? bodyArea.toLowerCase()
        : c.gradient != null
        ? _gradientWords(c.gradient!)
        : hex(c.mainColor)}',
  ];
  final words = _patternWords[c.pattern];
  if (c.layout != null) {
    lines.add('print: the factory print exactly as in the kit pictures');
  } else if (c.patternTile != null) {
    lines.add('print: a custom all-over print, exactly as in the kit pictures');
  } else if (words != null) {
    final g = gradients['patternColor'];
    final ink = g is Map
        ? _gradientWords(g)
        : own ?? hex(Color.lerp(c.mainColor, c.secondaryColor, 0.35)!);
    lines.add('pattern: $words, in $ink');
  } else {
    lines.add('pattern: none, a plain body');
  }
  for (final e in c.zones.entries) {
    final zone = _patternWords[e.value];
    if (zone != null) {
      lines.add('${e.key} pattern: $zone, in ${own ?? hex(c.secondaryColor)}');
    }
  }
  final trims = gradients['secondary'];
  lines.add(
    'collar, cuffs, side panels and trims: '
    '${trims is Map ? _gradientWords(trims) : hex(c.secondaryColor)}',
  );
  lines.add(
    'lettering (wordmark, name and number)'
    '${c.logoImage != null ? '' : ' and the small crest badge'}: '
    '${hex(c.accentColor)}',
  );
  for (final e in c.zoneColors.entries) {
    if (e.key != 'body' && _hex.hasMatch(e.value)) {
      final area = e.key.replaceAllMapped(
        RegExp('[A-Z]'),
        (m) => ' ${m[0]!.toLowerCase()}',
      );
      lines.add('$area: ${e.value.toLowerCase()}');
    }
  }
  // The parts with a look of their own (task 9.134), as the website.
  lines.addAll(fitColourLines(partColourLines(c), 14 - lines.length));
  return lines;
}

/// The parts with a look of their own (task 9.134) in words, one line each
/// ("left sleeve: #e92137, a fade of #ffc52f to clear (top to bottom)"): the
/// same lines as the website's partColourLines (PlayerShot.tsx).
List<String> partColourLines(AppController c) => [
  for (final key in c.changedParts)
    if (_partWords(c.partStyleOf(key)) case final words when words.isNotEmpty)
      '${partLabel(key).toLowerCase()}: $words',
];

String _partWords(PartStyle s) {
  final opacity = s.patternOpacity, fade = s.fade, pattern = s.pattern;
  final at = opacity == null ? '' : ' at ${(opacity * 100).round()}% opacity';
  String way(double angle) {
    final a = angle % 360;
    return a == 0
        ? 'top to bottom'
        : a == 90
        ? 'left to right'
        : a == 180
        ? 'bottom to top'
        : a == 270
        ? 'right to left'
        : 'at ${a.round()}°';
  }

  return [
    if (s.colour case final colour?) colour.toLowerCase(),
    if (fade != null)
      'a fade of ${fade.from.toLowerCase()} to '
          '${fade.to?.toLowerCase() ?? 'clear'} (${way(fade.angle)})',
    if (pattern != null)
      '${RegExp(r'^(data:|/|https?:)').hasMatch(pattern) ? 'a custom print, exactly as in the kit pictures' : _patternWords[pattern] ?? pattern.toLowerCase()}'
          '${s.patternColour == null ? '' : ' in ${s.patternColour!.toLowerCase()}'}$at'
    else if (opacity != null)
      opacity == 0 ? 'no pattern' : 'the kit pattern$at',
  ].join(', ');
}

/// [lines] within the server's limits (PlayerShotController: 14 lines of at
/// most 200 characters): each on its own line while [room] lasts, else
/// several to a line. The same rule as the website's fitColourLines.
List<String> fitColourLines(List<String> lines, int room) {
  String clip(String s) => s.length > 200 ? s.substring(0, 200) : s;
  if (room <= 0 || lines.isEmpty) return const [];
  if (lines.length <= room) return [for (final l in lines) clip(l)];
  final packed = <String>[];
  for (final l in lines) {
    if (packed.isNotEmpty && packed.last.length + 2 + l.length <= 200) {
      packed.last = '${packed.last}; $l';
    } else {
      packed.add(clip(l));
    }
  }
  return packed.take(room).toList();
}

/// The Studio's "See it on a player": fresh front and back pictures of the
/// live 3D kit, taken now; never older captures or the AI render (bug
/// 2026-10-27). Signed out, it asks you to sign in.
Future<void> openPlayerShotFromStudio(
  BuildContext context,
  AppController c, {
  required bool live3d,
  required void Function(String? busy) busy,
}) async {
  if (!c.signedIn) {
    await openPlayerShot(context, c, PlayerKit.fromStudio(c, const []));
    return;
  }
  final capture = c.captureMockup;
  if (!live3d || capture == null) {
    showToast(
      context,
      'Show your kit in 3D first: the picture is made from the 3D kit.',
    );
    return;
  }
  busy('Capturing your kit…');
  Uint8List? front, back;
  try {
    front = await capture('Front');
    back = await capture('Back');
  } on Object {
    front = null;
  } finally {
    busy(null);
  }
  if (!context.mounted) return;
  if (front == null) {
    showToast(context, 'The 3D kit could not be captured. Please try again.');
    return;
  }
  await openPlayerShot(context, c, PlayerKit.fromStudio(c, [front, ?back]));
}

/// Opens "See it on a player"; signed out, it asks you to sign in first.
Future<void> openPlayerShot(
  BuildContext context,
  AppController c,
  PlayerKit kit,
) async {
  if (!c.signedIn) {
    showToast(context, 'Sign in to see your kit on a player.');
    c.go(AppScreen.auth);
    return;
  }
  if (kit.pictures.isEmpty) {
    showToast(context, 'Open the design in the 3D studio first.');
    return;
  }
  await Navigator.of(
    context,
  ).push(MaterialPageRoute<void>(builder: (_) => PlayerShotScreen(c, kit)));
}

class PlayerShotScreen extends StatefulWidget {
  const PlayerShotScreen(this.c, this.kit, {super.key, this.ai, this.photo});
  final AppController c;
  final PlayerKit kit;

  /// The AI to use (tests); the app's own otherwise.
  final AiService? ai;

  /// A photo already chosen (tests).
  final Uint8List? photo;
  @override
  State<PlayerShotScreen> createState() => _PlayerShotScreenState();
}

class _PlayerShotScreenState extends State<PlayerShotScreen> {
  late String _player = PlayerShot.womenOnly(widget.kit.garment)
      ? 'female'
      : 'male';
  String _pose = 'front';

  /// 'player' (an athlete) or 'photo' (your own photo of a person).
  late String _who = widget.photo == null ? 'player' : 'photo';
  late Uint8List? _photo = widget.photo;
  bool _busy = false;

  /// The controls under the picture and their height, measured after each
  /// layout (see build).
  final _controlsKey = GlobalKey();
  double _controlsHeight = 260;

  void _measureControls() {
    final h = _controlsKey.currentContext?.size?.height;
    if (h != null && mounted && (h - _controlsHeight).abs() > 0.5) {
      setState(() => _controlsHeight = h);
    }
  }

  final List<Uint8List> _shots = [];
  final Set<int> _saved = {};
  int _at = -1;

  AppController get c => widget.c;
  PlayerKit get kit => widget.kit;

  Future<void> _make([String? pose]) async {
    final p = pose ?? _pose;
    setState(() {
      _busy = true;
      _pose = p;
    });
    try {
      final pictures = kit.pictures.take(2).toList();
      final ai = widget.ai ?? c.ai;
      final photo = _photo;
      if (_who == 'photo') {
        if (photo == null)
          throw AiException('Upload a photo of a person first.');
        if (!await ai.isPerson(photo)) {
          throw AiException(
            'That photo does not show a person. Choose a photo of someone '
            'standing, with their upper body in view.',
          );
        }
        final image = await ai.playerShot(
          PlayerShot.personPrompt(
            sport: kit.sport,
            garment: kit.garment,
            colours: kit.colours,
            logoText: kit.logoText,
            backName: kit.backName,
            number: kit.number,
            kitPictures: pictures.length,
          ),
          [photo, ...pictures],
          size: await PlayerShot.sizeFor(photo),
        );
        if (!mounted) return;
        setState(() {
          _shots.add(image);
          _at = _shots.length - 1;
        });
        return;
      }
      final image = await ai.playerShot(
        PlayerShot.prompt(
          sport: kit.sport,
          garment: kit.garment,
          player: _player,
          pose: p,
          colours: kit.colours,
          logoText: kit.logoText,
          backName: kit.backName,
          number: kit.number,
          pictures: pictures.length,
        ),
        pictures,
        size: p == 'team' ? '1536x1024' : '1024x1536',
      );
      if (!mounted) return;
      setState(() {
        _shots.add(image);
        _at = _shots.length - 1;
      });
    } on AiException catch (e) {
      if (mounted) showToast(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// The user's own photo (JPG, PNG or WebP, up to 10 MB); kept only in
  /// memory for this screen.
  Future<void> _pickPhoto() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    if (!mounted) return;
    final name = file.name.toLowerCase();
    if (!RegExp(r'\.(jpe?g|png|webp)$').hasMatch(name) &&
        !(file.mimeType ?? '').contains(RegExp('jpeg|png|webp'))) {
      showToast(context, 'Choose a JPG, PNG or WebP photo.');
      return;
    }
    if (bytes.length > 10 * 1024 * 1024) {
      showToast(context, 'Choose a photo smaller than 10 MB.');
      return;
    }
    setState(() => _photo = bytes);
  }

  void _another() {
    if (_who == 'photo') {
      _make();
      return;
    }
    final keys = PlayerShot.poses.keys.toList();
    _make(keys[(keys.indexOf(_pose) + 1) % keys.length]);
  }

  Future<void> _download() async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null
        ? null
        : box.localToGlobal(Offset.zero) & box.size;
    final name = (kit.name.isEmpty ? 'kit' : kit.name).toLowerCase().replaceAll(
      RegExp(r'[^a-z0-9]+'),
      '-',
    );
    final status = await shareImage(
      _shots[_at],
      '3DEEZI-$name-on-a-player-${_at + 1}.jpg',
      origin: origin,
    );
    if (mounted) showToast(context, status);
  }

  Future<void> _save() async {
    final at = _at;
    setState(() => _busy = true);
    try {
      await c.api.uploadAsset(
        _shots[at],
        filename: 'on-a-player-${at + 1}.jpg',
        type: 'artwork',
        contentType: 'image/jpeg',
      );
      c.update(() => c.artwork.add(_shots[at]));
      if (!mounted) return;
      setState(() => _saved.add(at));
      showToast(context, 'Saved in your Assets.');
    } on Exception catch (e) {
      if (mounted) showToast(context, 'Could not save: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _chips(
    Map<String, String> options,
    String value,
    void Function(String) pick, {
    Set<String> off = const {},
  }) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      for (final e in options.entries)
        ActionChipPill(
          e.value,
          selected: value == e.key,
          onTap: _busy || off.contains(e.key)
              ? null
              : () => setState(() => pick(e.key)),
        ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final shown = _at >= 0 ? _shots[_at] : null;
    return Scaffold(
      backgroundColor: Palette.bg,
      body: SafeArea(
        child: Column(
          children: [
            TopBar(
              onBack: () => Navigator.of(context).maybePop(),
              title: 'See it on a player',
              subtitle: 'Your kit, worn for real',
            ),
            Expanded(
              child: LayoutBuilder(
                builder: (context, box) {
                  // The picture takes the room the controls leave (measured
                  // after each layout), so the buttons stay on screen; the
                  // whole picture always shows (contain), from 220 px up to a
                  // 2:3 card (QA 2026-10-27, as the website's dialog).
                  WidgetsBinding.instance.addPostFrameCallback(
                    (_) => _measureControls(),
                  );
                  final picture = (box.maxHeight - 24 - _controlsHeight)
                      .clamp(220.0, math.max(220.0, (box.maxWidth - 32) * 1.5))
                      .toDouble();
                  return ListView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    children: [
                      SizedBox(
                        height: picture,
                        child: GlowCard(
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              if (shown != null)
                                InteractiveViewer(
                                  maxScale: 4,
                                  child: artImage(
                                    bytes: shown,
                                    fit: BoxFit.contain,
                                  ),
                                )
                              else
                                Opacity(
                                  opacity: .5,
                                  child: artImage(
                                    bytes: kit.pictures.first,
                                    fit: BoxFit.contain,
                                  ),
                                ),
                              if (_busy)
                                const FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      CircularProgressIndicator(),
                                      SizedBox(height: 10),
                                      Text(
                                        'Creating your picture… about 1 min',
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                      Column(
                        key: _controlsKey,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (_shots.length > 1) ...[
                            const SizedBox(height: 10),
                            SizedBox(
                              height: 64,
                              child: ListView(
                                scrollDirection: Axis.horizontal,
                                children: [
                                  for (var i = 0; i < _shots.length; i++)
                                    GestureDetector(
                                      onTap: () => setState(() => _at = i),
                                      child: Container(
                                        margin: const EdgeInsets.only(right: 8),
                                        width: 44,
                                        decoration: BoxDecoration(
                                          border: Border.all(
                                            color: i == _at
                                                ? Palette.cyan
                                                : Colors.transparent,
                                            width: 2,
                                          ),
                                        ),
                                        child: artImage(bytes: _shots[i]),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ],
                          const SizedBox(height: 14),
                          _chips(
                            const {
                              'player': 'An athlete',
                              'photo': 'Upload a photo of a person',
                            },
                            _who,
                            (v) => _who = v,
                          ),
                          const SizedBox(height: 8),
                          if (_who == 'photo') ...[
                            Row(
                              children: [
                                OutlinedButton.icon(
                                  onPressed: _busy ? null : _pickPhoto,
                                  icon: const Icon(Icons.photo_outlined),
                                  label: Text(
                                    _photo == null
                                        ? 'Choose a photo'
                                        : 'Change photo',
                                  ),
                                ),
                                const SizedBox(width: 10),
                                if (_photo != null)
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: SizedBox(
                                      height: 56,
                                      width: 42,
                                      child: artImage(bytes: _photo),
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Your photo is only used to make this picture. It isn\'t '
                              'kept unless you save the result.',
                              style: TextStyle(
                                color: Palette.muted,
                                fontSize: 12,
                              ),
                            ),
                          ] else ...[
                            _chips(
                              const {
                                'male': 'Male player',
                                'female': 'Female player',
                              },
                              _player,
                              (v) => _player = v,
                              off: PlayerShot.womenOnly(kit.garment)
                                  ? {'male'}
                                  : {},
                            ),
                            const SizedBox(height: 8),
                            _chips(
                              PlayerShot.poseNames,
                              _pose,
                              (v) => _pose = v,
                            ),
                          ],
                          const SizedBox(height: 14),
                          if (shown == null)
                            GradientButton(
                              label: _busy ? 'Creating…' : 'Create picture',
                              icon: Icons.person_outline,
                              onPressed:
                                  _busy || (_who == 'photo' && _photo == null)
                                  ? null
                                  : _make,
                            )
                          else
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                OutlinedButton.icon(
                                  onPressed: _busy ? null : _download,
                                  icon: const Icon(Icons.download),
                                  label: const Text('Download'),
                                ),
                                OutlinedButton.icon(
                                  onPressed: _busy ? null : _another,
                                  icon: const Icon(Icons.refresh),
                                  label: Text(
                                    _who == 'photo'
                                        ? 'Try again'
                                        : 'Try another pose',
                                  ),
                                ),
                                OutlinedButton.icon(
                                  onPressed: _busy || _saved.contains(_at)
                                      ? null
                                      : _save,
                                  icon: const Icon(Icons.bookmark_add_outlined),
                                  label: Text(
                                    _saved.contains(_at)
                                        ? 'Saved'
                                        : 'Save to my assets',
                                  ),
                                ),
                              ],
                            ),
                          const SizedBox(height: 8),
                          const Text(
                            'Each picture uses one AI generation, like the showcase.',
                            style: TextStyle(
                              color: Palette.muted,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
