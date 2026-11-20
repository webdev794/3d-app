import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../ai_service.dart';
import '../app_controller.dart';
import '../export_service.dart';
import '../part_editing.dart';
import '../widgets/flow_ui.dart';
import '../widgets/ui.dart';

/// The Studio's Mockup (the website's Mockup button): studio product photos
/// (front, back, 3/4) of the design on a clean background, from the 3D
/// captures. The prompt matches the website's App\Services\ProductMockup.
class ProductMockup {
  static const views = [
    ('front', 'Front'),
    ('back', 'Back'),
    ('three-quarter', '3/4'),
  ];
  static const backgrounds = {
    'light-grey':
        'a seamless smooth light-grey (#e6e7e9) studio paper background with a very soft vignette',
    'white':
        'a seamless clean pure-white studio background, like an e-commerce product shot',
    'dark':
        'a seamless charcoal-grey (#2a2c30) studio background with a soft gradient falloff',
  };
  static const backgroundLabels = {
    'light-grey': 'Light grey',
    'white': 'White',
    'dark': 'Dark',
  };

  /// The 3DEEZI shield the 3D kit wears on the chest until the club has a
  /// logo: image models misread its small "3D" as "30". Also used by
  /// PlayerShot; matches the website's ProductMockup::BADGE.
  static const badge =
      'the small shield badge on the chest, if there is one, reads the letters 3D (three-D, not the number 30): a 3 and a capital letter D';

  static String prompt(
    String view,
    String background, {
    required String sport,
    required String garment,
    String logoText = '',
    String backName = '',
    String number = '',
    List<String> colors = const [],
  }) {
    // In capitals, as the 3D kit draws the wordmark and the back name.
    final logo = logoText.trim().toUpperCase(), num = number.trim();
    final back = backName.trim().isEmpty ? logo : backName.trim().toUpperCase();
    final text = view == 'back'
        ? (num.isNotEmpty
              ? 'the back name reads exactly "$back" and the back number reads exactly "$num"'
              : back.isNotEmpty
              ? 'the back lettering reads exactly "$back"'
              : 'the back keeps its graphics as they are')
        : '${logo.isNotEmpty ? 'the team wordmark on the chest reads exactly "$logo"' : 'the chest crest and graphics stay as they are'}'
              '${num.isNotEmpty ? ', and any front number reads "$num"' : ''}; $badge';
    final angle = switch (view) {
      'back' =>
        'Show the BACK of the garment, straight-on and centred. The first image is the back view to reproduce; the second is the front of the same garment, a guide to its true colours.',
      'three-quarter' =>
        'Show the garment turned about 35 degrees in a three-quarter front view, so the front plus one side and sleeve are visible, centred. The first image is the front and the second the back of the same garment: keep the front design from the first image and wrap the side panels naturally, matching both.',
      _ =>
        'Show the FRONT of the garment, straight-on and centred. The image is the front view to reproduce.',
    };
    final palette = colors
        .where((c) => RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(c))
        .take(6)
        .toList();
    return 'Create a premium studio product photograph (a catalogue mockup) of this ${'$sport $garment'.trim()}, from the reference 3D render. '
        '$angle '
        'Style: ghost-mannequin (invisible mannequin) product shot, the garment alone with a natural 3D body shape and an open neck showing the inside back collar; no person, no hanger, no visible mannequin. '
        'Background: ${backgrounds[background] ?? backgrounds['light-grey']}, with a soft natural contact shadow below the garment. '
        'Lighting: large soft key light from the upper left, gentle fill, subtle rim light, true-to-life colour, sharp focus, like a full-frame camera with an 85 mm lens. '
        'Fabric realism: fine sublimated polyester knit and mesh texture visible up close, realistic stitching and twin-needle hems, rib-knit collar and cuffs, soft natural folds, gentle drape and creases at the sleeves and waist, a subtle sheen on the print, real seams where the panels meet. '
        '${palette.isEmpty ? '' : "The design's true colours are ${palette.join(', ')} (the main body colour first): use exactly these, correcting any blue or dark tint from the 3D render's lighting. "}'
        'Keep the design EXACTLY as in the reference: the same colours (no colour shift), panel layout, pattern, stripes, collar style and trims, and every logo, crest, name and number in the same place, size and shape; '
        '$text; any crest or badge keeps its exact shape and its letters or numbers as drawn. Do not add, remove, restyle or invent any text, logos, sponsors, tags or graphics. '
        'Square frame, the garment filling about 80% of the height with even margins. No text overlay, no watermark, no UI, no props.';
  }
}

class ProductMockupScreen extends StatefulWidget {
  const ProductMockupScreen(this.c, {super.key});
  final AppController c;
  @override
  State<ProductMockupScreen> createState() => _ProductMockupScreenState();
}

class _ProductMockupScreenState extends State<ProductMockupScreen> {
  String _background = 'light-grey';
  String? _working;
  final Map<String, Uint8List> _shots = {};

  AppController get c => widget.c;
  Uint8List? get _front => c.mockupFront ?? c.renderFront;
  Uint8List? get _back => c.mockupBack;

  Future<void> _generate() async {
    final front = _front, back = _back ?? _front;
    if (front == null || back == null) {
      showToast(context, 'Open the design in the 3D studio first.');
      return;
    }
    setState(_shots.clear);
    try {
      for (final (view, _) in ProductMockup.views) {
        setState(() => _working = view);
        final image = await c.ai.productMockup(
          ProductMockup.prompt(
            view,
            _background,
            sport: c.sport,
            garment: c.garment,
            logoText: c.logoText,
            backName: c.backName,
            number: c.number,
            // The kit's colours, then the parts' own (task 9.134), each
            // once, as the website's Mockup.
            colors: {
              for (final color in [
                c.mainColor,
                c.secondaryColor,
                c.accentColor,
              ])
                '#${(color.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}',
              ...c.partColours,
            }.toList(),
          ),
          switch (view) {
            'back' => [back, front],
            'three-quarter' => [front, back],
            _ => [front],
          },
        );
        if (!mounted) return;
        setState(() => _shots[view] = image);
      }
      if (mounted) showToast(context, 'Your mockups are ready.');
    } on AiException catch (e) {
      if (mounted) showToast(context, e.message);
    } finally {
      if (mounted) setState(() => _working = null);
    }
  }

  String get _slug => (c.projectName.isEmpty ? 'design' : c.projectName)
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9]+'), '-');

  Future<void> _download(String view) async {
    final image = _shots[view];
    if (image == null) return;
    try {
      final status = await shareImage(image, '3DEEZI-$_slug-mockup-$view.jpg');
      if (mounted) showToast(context, status);
    } on Exception catch (e) {
      if (mounted) showToast(context, 'Download failed: $e');
    }
  }

  Future<void> _downloadAll() async {
    for (final (view, _) in ProductMockup.views) {
      if (!mounted) return;
      await _download(view);
    }
  }

  void _keep() {
    c.update(() => c.artwork.addAll(_shots.values));
    showToast(
      context,
      '${_shots.length} mockup${_shots.length == 1 ? '' : 's'} saved in Assets › Artwork.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final busy = _working != null;
    return Column(
      children: [
        TopBar(
          onBack: c.back,
          title: 'Mockup',
          subtitle: 'Studio product photos of your design',
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            children: [
              const Text(
                'Front, back and 3/4 pictures on a clean background, with real '
                'fabric, stitching, folds and shadows. Your colours, print, '
                'crest, name and number stay as you made them.',
                style: TextStyle(color: Palette.muted, fontSize: 13),
              ),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                children: [
                  for (final (view, label) in ProductMockup.views)
                    GlowCard(
                      key: ValueKey('mockup-$view'),
                      radius: 12,
                      glow: false,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          if (_shots[view] != null)
                            artImage(bytes: _shots[view]!)
                          else
                            ColoredBox(
                              color: switch (_background) {
                                'white' => Colors.white,
                                'dark' => const Color(0xFF2A2C30),
                                _ => const Color(0xFFE6E7E9),
                              },
                              child: Center(
                                child: _working == view
                                    ? const CircularProgressIndicator()
                                    : Text(
                                        label,
                                        style: TextStyle(
                                          color: _background == 'dark'
                                              ? Colors.white70
                                              : Colors.black54,
                                        ),
                                      ),
                              ),
                            ),
                          if (_shots[view] != null)
                            Positioned(
                              right: 6,
                              bottom: 6,
                              child: IconButton.filledTonal(
                                tooltip: 'Download $label',
                                onPressed: busy ? null : () => _download(view),
                                icon: const Icon(
                                  Icons.download_rounded,
                                  size: 18,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
              const SectionLabel('Background'),
              Wrap(
                spacing: 8,
                children: [
                  for (final MapEntry(:key, :value)
                      in ProductMockup.backgroundLabels.entries)
                    ActionChipPill(
                      value,
                      selected: _background == key,
                      onTap: busy
                          ? null
                          : () => setState(() => _background = key),
                    ),
                ],
              ),
              if (_shots.isNotEmpty) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: SecondaryButton(
                        label: 'Download all',
                        icon: Icons.download_rounded,
                        onPressed: busy ? null : _downloadAll,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: SecondaryButton(
                        label: 'Save to my assets',
                        icon: Icons.create_new_folder_outlined,
                        onPressed: busy ? null : _keep,
                      ),
                    ),
                  ],
                ),
              ],
              if (!AiService.enabled) ...[
                const SizedBox(height: 14),
                const Text(
                  'Mockup needs the OpenAI connection, which is not '
                  'configured in this build.',
                  style: TextStyle(color: Palette.muted, fontSize: 12),
                ),
              ],
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
          child: GradientButton(
            label: busy
                ? 'MAKING MOCKUPS…'
                : _shots.isEmpty
                ? 'MAKE MOCKUPS'
                : 'MAKE AGAIN',
            icon: Icons.photo_camera_outlined,
            onPressed: busy || !AiService.enabled || _front == null
                ? null
                : _generate,
          ),
        ),
      ],
    );
  }
}
