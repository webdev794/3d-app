import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../api_client.dart' show ApiException;
import '../app_controller.dart';
import '../own_patterns.dart';
import 'flow_ui.dart';
import 'studio_tools.dart' show patternAreas;
import 'ui.dart';

/// Studio › Patterns › My patterns (as the website's OwnPatterns.tsx): the
/// colours of each pattern picture on the kit (Full colour / Kit colours, read
/// from the picture the kit has, so they stay right after closing the panel,
/// an undo or a save and reopen), the upload tile, the account's own patterns
/// and the pattern size.
class OwnPatternsTool extends StatelessWidget {
  const OwnPatternsTool(this.c, {super.key, required this.onUpload});
  final AppController c;
  final VoidCallback onUpload;

  @override
  Widget build(BuildContext context) {
    final places = <(String?, String, Uint8List)>[
      if (c.patternTile case final tile?) (null, 'Whole garment', tile),
      for (final (area, label) in patternAreas(
        c.garment,
        trackStyle: c.trackStyle,
      ))
        if (zonePicture(c.zones[area]) case final picture?)
          (area, label, picture),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel('My patterns'),
        if (places.isEmpty) ...[
          const Opacity(
            opacity: .45,
            child: Wrap(
              spacing: 8,
              children: [
                ActionChipPill('Full colour', onTap: null),
                ActionChipPill('Kit colours', onTap: null),
              ],
            ),
          ),
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text(
              'No pattern picture on the kit yet. Tap one of your patterns '
              'for the whole garment, or drag it from Drag to kit onto an '
              'area; then choose its colours here.',
              key: ValueKey('own-pattern-tip'),
              style: TextStyle(fontSize: 11, color: Palette.muted),
            ),
          ),
        ] else
          for (final (area, label, picture) in places)
            _ColoursRow(c, area: area, label: label, picture: picture),
        const SizedBox(height: 8),
        SizedBox(
          height: 74,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              _tile(
                key: const ValueKey('upload-pattern'),
                selected: false,
                onTap: onUpload,
                child: const Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.add, color: Palette.cyan),
                    Text(
                      'Upload\npattern',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 10, color: Palette.cyan),
                    ),
                  ],
                ),
              ),
              for (final p in c.ownPatterns ?? const <OwnPattern>[])
                _tile(
                  key: ValueKey('own-pattern-${p.id}'),
                  selected: madeFromOwnPattern(c.patternTile, p.id),
                  onTap: () async {
                    String message;
                    try {
                      message = await c.applyOwnPattern(p);
                    } on Object {
                      message = 'This picture could not be read.';
                    }
                    if (context.mounted) showToast(context, message);
                  },
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      artImage(bytes: p.bytes),
                      Positioned(
                        top: 2,
                        right: 2,
                        child: GestureDetector(
                          key: ValueKey('delete-pattern-${p.id}'),
                          onTap: () async {
                            try {
                              await c.deleteOwnPattern(p.id);
                              if (context.mounted) {
                                showToast(
                                  context,
                                  'Pattern deleted from My patterns.',
                                );
                              }
                            } on ApiException catch (e) {
                              if (context.mounted) {
                                showToast(context, e.message);
                              }
                            }
                          },
                          child: const CircleAvatar(
                            radius: 10,
                            backgroundColor: Color(0xdd050c16),
                            child: Icon(
                              Icons.close,
                              size: 12,
                              color: Color(0xffff8f9a),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        Text(
          c.signedIn
              ? 'PNG, JPG or WebP up to 5 MB, kept with your account (website '
                    'too). Tap for the whole garment, or hold and drag from '
                    'Drag to kit onto an area.'
              : 'Sign in to upload your own pattern.',
          style: const TextStyle(fontSize: 11, color: Palette.muted),
        ),
        if (c.patternTile != null || c.zones.values.any(isPatternPicture)) ...[
          const SectionLabel('Pattern size'),
          Slider(
            key: const ValueKey('pattern-size'),
            min: 0.1,
            max: 1,
            divisions: 18,
            value: (c.patternScale ?? 0.3).clamp(0.1, 1),
            label: 'Pattern size',
            // One undo step for the whole drag.
            onChangeStart: (_) => c.edit(() {}),
            onChanged: (v) => c.update(() => c.patternScale = v),
          ),
        ],
      ],
    );
  }

  static Widget _tile({
    Key? key,
    required bool selected,
    required VoidCallback onTap,
    required Widget child,
  }) => Padding(
    key: key,
    padding: const EdgeInsets.only(right: 10),
    child: SizedBox(
      width: 74,
      child: GlowCard(
        radius: 10,
        selected: selected,
        glow: false,
        onTap: onTap,
        child: child,
      ),
    ),
  );
}

/// One pattern picture on the kit and its colours, as the picture has them.
class _ColoursRow extends StatelessWidget {
  const _ColoursRow(
    this.c, {
    required this.area,
    required this.label,
    required this.picture,
  });
  final AppController c;
  final String? area;
  final String label;
  final Uint8List picture;

  @override
  Widget build(BuildContext context) => FutureBuilder<String?>(
    key: ValueKey('own-colours-${area ?? 'all'}-${identityHashCode(picture)}'),
    future: patternModeOf(picture),
    builder: (context, snap) {
      final mode = snap.data;
      final where = area == null ? 'whole garment' : label.toLowerCase();
      return Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: const TextStyle(fontSize: 12, color: Palette.muted),
              ),
            ),
            for (final (m, text) in const [
              ('full', 'Full colour'),
              ('kit', 'Kit colours'),
            ]) ...[
              const SizedBox(width: 6),
              ActionChipPill(
                text,
                key: ValueKey('own-mode-${area ?? 'all'}-$m'),
                selected: mode == m,
                onTap: mode == null || mode == m
                    ? null
                    : () async {
                        bool changed;
                        try {
                          changed = await c.setPatternMode(area, m);
                        } on Object {
                          changed = false;
                        }
                        if (changed && context.mounted) {
                          showToast(
                            context,
                            'The pattern on the $where is now in '
                            '${m == 'full' ? 'full colour' : 'kit colours'}.',
                          );
                        }
                      },
              ),
            ],
          ],
        ),
      );
    },
  );
}
