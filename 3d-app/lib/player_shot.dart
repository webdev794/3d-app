import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'ai_service.dart';
import 'app_controller.dart';
import 'export_service.dart';
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
    // In capitals, as the 3D kit draws the wordmark and the back name.
    final logo = logoText.trim().toUpperCase();
    final back = backName.trim().isEmpty ? logo : backName.trim().toUpperCase();
    final refs = pictures > 1
        ? 'The reference images show the front and the back of the garment; '
              'they are only references for the design: make ONE single '
              'photograph, never a collage, split image or two panels.'
        : 'The reference image shows the garment design.';
    final c = colours.where((e) => e.isNotEmpty).join(', ');
    return 'A premium photorealistic sports photograph of a real $who athlete '
        'wearing this exact $sport $garment, ${poses[pose] ?? poses['front']}, '
        '${setting(sport, garment)}. $refs Reproduce the garment EXACTLY as in '
        'the reference: the same colours${c.isEmpty ? '' : ' ($c)'}, the same '
        'panel layout, print pattern and graphics, collar and trims, the same '
        'crest and logos in the same places'
        '${logo.isEmpty ? '' : ', the team wordmark on the chest reads exactly "$logo"'}'
        '${_badge(pictures)}'
        '${back.isNotEmpty && pose != 'front' ? ', where the back shows the lettering reads exactly "$back"${number.trim().isEmpty ? '' : ' with the number "${number.trim()}"'}' : ''}'
        '. Do not add, remove or change any text, logos or graphics; do not '
        'invent sponsors. The garment fits the athlete naturally with real '
        'fabric folds, stitching and slight sheen. A believable athlete with a '
        'natural face and body, professional sports photography, sharp focus '
        'on the kit, cinematic lighting, shallow depth of field, ultra-detailed, '
        'no watermark, no UI, no text overlays.';
  }

  /// Your own photo: that person dressed in the kit, everything else kept.
  static String personPrompt({
    required String sport,
    required String garment,
    List<String> colours = const [],
    String logoText = '',
    String backName = '',
    String number = '',
    int kitPictures = 1,
  }) {
    final logo = logoText.trim().toUpperCase();
    final back = backName.trim().isEmpty ? logo : backName.trim().toUpperCase();
    final c = colours.where((e) => e.isNotEmpty).join(', ');
    final full = RegExp(r'full ?kit', caseSensitive: false).hasMatch(garment);
    return 'Image 1 is a photo of a real person. '
        '${kitPictures > 1 ? 'Images 2 and 3 show the front and back' : 'Image 2 shows the design'}'
        ' of a $sport $garment. Edit image 1 only: replace the person\'s '
        'clothing with this exact garment'
        '${full ? ' (the top and the matching shorts)' : ''}, worn naturally '
        'and fitted to their body and pose. Keep the person\'s face, identity, '
        'skin, hair, body shape, pose, hands, framing, lighting and background '
        'exactly as in image 1; change nothing else. Reproduce the garment '
        'EXACTLY: the same colours${c.isEmpty ? '' : ' ($c)'}, panel layout, '
        'print pattern and graphics, collar and trims, the same crest and '
        'logos in the same places'
        '${logo.isEmpty ? '' : ', the team wordmark on the chest reads exactly "$logo"'}'
        '${_badge(kitPictures)}'
        '${back.isEmpty ? '' : ', any visible back lettering reads exactly "$back"${number.trim().isEmpty ? '' : ' with the number "${number.trim()}"'}'}'
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
  final List<Uint8List> pictures;
  final String sport, garment, name, logoText, backName, number;
  final List<String> colours;
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
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                children: [
                  AspectRatio(
                    aspectRatio: 2 / 3,
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
                                  Text('Creating your picture… about 1 min'),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
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
                            _photo == null ? 'Choose a photo' : 'Change photo',
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
                      style: TextStyle(color: Palette.muted, fontSize: 12),
                    ),
                  ] else ...[
                    _chips(
                      const {'male': 'Male player', 'female': 'Female player'},
                      _player,
                      (v) => _player = v,
                      off: PlayerShot.womenOnly(kit.garment) ? {'male'} : {},
                    ),
                    const SizedBox(height: 8),
                    _chips(PlayerShot.poseNames, _pose, (v) => _pose = v),
                  ],
                  const SizedBox(height: 14),
                  if (shown == null)
                    GradientButton(
                      label: _busy ? 'Creating…' : 'Create picture',
                      icon: Icons.person_outline,
                      onPressed: _busy || (_who == 'photo' && _photo == null)
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
                            _who == 'photo' ? 'Try again' : 'Try another pose',
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
                    style: TextStyle(color: Palette.muted, fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
