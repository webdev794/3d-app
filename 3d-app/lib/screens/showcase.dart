import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../ai_service.dart';
import '../app_controller.dart';
import '../export_service.dart';
import '../widgets/flow_ui.dart';
import '../widgets/ui.dart';
import 'image_editor.dart';

/// Photoreal Showcase: turns the captured 3D kit into marketing images.
class ShowcaseScreen extends StatefulWidget {
  const ShowcaseScreen(this.c, {super.key});
  final AppController c;
  @override
  State<ShowcaseScreen> createState() => _ShowcaseScreenState();
}

class _ShowcaseScreenState extends State<ShowcaseScreen> {
  String _scene = AiService.showcaseScenes.keys.first;
  bool _back = false, _busy = false;
  int _selected = -1;

  AppController get c => widget.c;
  Uint8List? get _base =>
      _back ? c.mockupBack : (c.mockupFront ?? c.renderFront);

  Future<void> _generate() async {
    final base = _base;
    if (base == null) {
      showToast(context, 'Open the design in the 3D studio first.');
      return;
    }
    setState(() => _busy = true);
    try {
      final image = await c.ai.showcase(
        base,
        scene: _scene,
        sport: c.sport,
        garment: c.garment,
        logoText: _back ? c.backName : c.logoText,
        number: c.number,
        back: _back,
      );
      if (!mounted) return;
      c.update(() {
        c.showcases.add(image);
        c.artwork.add(image);
      });
      setState(() => _selected = c.showcases.length - 1);
    } on AiException catch (e) {
      if (mounted) showToast(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// The image editor on the shown showcase; Use replaces it and keeps a
  /// copy in Assets › Artwork, as every showcase is.
  Future<void> _edit(Uint8List image) async {
    final index = _selected;
    final edited = await openImageEditor(
      context,
      c,
      bytes: image,
      title: 'Showcase ${index + 1}',
      fileName: '3deezi-showcase-${index + 1}',
    );
    if (edited == null || !mounted || index >= c.showcases.length) return;
    c.update(() {
      c.showcases[index] = edited;
      c.artwork.add(edited);
    });
    showToast(context, 'Showcase updated · also saved in Assets › Artwork.');
  }

  Future<void> _share(Uint8List image) async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null
        ? null
        : box.localToGlobal(Offset.zero) & box.size;
    final name = (c.projectName.isEmpty ? 'design' : c.projectName)
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-');
    try {
      final status = await shareImage(
        image,
        '3DEEZI-$name-showcase-${_selected + 1}.jpg',
        origin: origin,
      );
      if (mounted) showToast(context, status);
    } on Exception catch (e) {
      if (mounted) showToast(context, 'Share failed: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final shown = _selected >= 0 && _selected < c.showcases.length
        ? c.showcases[_selected]
        : null;
    return Column(
      children: [
        TopBar(
          onBack: c.back,
          title: 'Showcase',
          subtitle: 'Photoreal images of your design',
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            children: [
              AspectRatio(
                aspectRatio: 1.5,
                child: GlowCard(
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (shown != null)
                        artImage(bytes: shown)
                      else if (_base != null)
                        Opacity(
                          opacity: .55,
                          child: artImage(bytes: _base, fit: BoxFit.contain),
                        )
                      else
                        const Center(
                          child: Text(
                            'Open your design in the 3D studio first.',
                            style: TextStyle(color: Palette.muted),
                          ),
                        ),
                      if (shown == null && !_busy && _base != null)
                        const Center(
                          child: Text(
                            'Your 3D kit → photoreal showcase',
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                      if (_busy)
                        const Center(
                          child: BusyBadge(
                            'Creating your showcase… about 1 min',
                          ),
                        ),
                      if (shown != null && !_busy)
                        Positioned(
                          top: 10,
                          right: 10,
                          child: EditImageChip(onTap: () => _edit(shown)),
                        ),
                    ],
                  ),
                ),
              ),
              if (shown != null) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: SecondaryButton(
                        label: 'Share',
                        icon: Icons.ios_share_rounded,
                        onPressed: () => _share(shown),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: SecondaryButton(
                        label: 'Use as cover',
                        icon: Icons.photo_outlined,
                        onPressed: () {
                          c.update(() => c.mockupFront = shown);
                          showToast(
                            context,
                            'Used as the project cover image.',
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ],
              const SectionLabel('Scene'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final scene in AiService.showcaseScenes.keys)
                    ActionChipPill(
                      scene,
                      selected: _scene == scene,
                      onTap: _busy
                          ? null
                          : () => setState(() => _scene = scene),
                    ),
                ],
              ),
              const SectionLabel('View'),
              Wrap(
                spacing: 8,
                children: [
                  for (final (label, back) in const [
                    ('Front', false),
                    ('Back', true),
                  ])
                    ActionChipPill(
                      label,
                      selected: _back == back,
                      onTap: _busy ? null : () => setState(() => _back = back),
                    ),
                ],
              ),
              if (c.showcases.isNotEmpty) ...[
                const SectionLabel('This session', trailing: 'Saved to Assets'),
                SizedBox(
                  height: 76,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      for (var i = c.showcases.length - 1; i >= 0; i--)
                        Padding(
                          padding: const EdgeInsets.only(right: 10),
                          child: SizedBox(
                            width: 114,
                            child: GlowCard(
                              radius: 10,
                              glow: false,
                              selected: i == _selected,
                              onTap: () => setState(() => _selected = i),
                              child: artImage(bytes: c.showcases[i]),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
              if (!AiService.enabled) ...[
                const SizedBox(height: 14),
                const Text(
                  'Showcase needs the OpenAI connection, which is not '
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
            label: _busy ? 'GENERATING…' : 'GENERATE SHOWCASE',
            icon: Icons.auto_awesome,
            onPressed: _busy || !AiService.enabled || _base == null
                ? null
                : _generate,
          ),
        ),
      ],
    );
  }
}
