import 'package:flutter/material.dart';

import '../app_controller.dart';
import 'studio_tools.dart' show TeamPresets, applyStudioPreset;
import 'ui.dart';

/// PRESETS over the 3D's foot (client 25 Nov, 652.png): this kit's presets
/// (its sport's or garment's own first, then the 3DEEZI ones, as in Preset
/// designs) as round thumbnails in one row, ready to pick at any time; the
/// one on the kit has a tick. ✕ folds the row away to its PRESETS tab, and
/// the tab (or More › Presets) brings it back.
class PresetStrip extends StatefulWidget {
  const PresetStrip(this.c, {super.key});
  final AppController c;

  @override
  State<PresetStrip> createState() => _PresetStripState();
}

class _PresetStripState extends State<PresetStrip> {
  AppController get c => widget.c;
  late final Future<TeamPresets> _team = TeamPresets.load(c);

  static const double _size = 64;

  void _show(bool on) => c.update(() => c.presetStripHidden = !on);

  Widget _tab({required bool open}) => Material(
    color: const Color(0xcc08131e),
    shape: StadiumBorder(
      side: BorderSide(color: Palette.cyan.withValues(alpha: .45)),
    ),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      key: const ValueKey('preset-strip-tab'),
      onTap: () => _show(!open),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(9, 4, 11, 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.grid_view_rounded, size: 14, color: Palette.cyan),
            const SizedBox(width: 6),
            const Text(
              'PRESETS',
              style: TextStyle(
                fontSize: 11.5,
                letterSpacing: 1.2,
                fontWeight: FontWeight.w800,
                fontStyle: FontStyle.italic,
              ),
            ),
            if (!open) ...[
              const SizedBox(width: 4),
              const Icon(Icons.expand_less_rounded, size: 16),
            ],
          ],
        ),
      ),
    ),
  );

  Widget _bubble(TeamPresets team, Map preset, bool on) {
    final name = '${preset['name']}';
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 5),
      child: Tooltip(
        message: name,
        child: Semantics(
          button: true,
          selected: on,
          label: 'Preset $name',
          child: GestureDetector(
            key: ValueKey('preset-strip-${preset['id']}'),
            onTap: () => applyStudioPreset(
              context,
              c,
              name,
              (preset['design'] as Map).cast<String, dynamic>(),
              id: '${preset['id']}',
            ),
            child: SizedBox(
              width: _size + 6,
              height: _size + 6,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Positioned.fill(
                    child: Container(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: const Color(0xff0b1824),
                        border: Border.all(
                          color: on
                              ? Palette.cyan
                              : Colors.white.withValues(alpha: .28),
                          width: on ? 2.5 : 1.2,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: on
                                ? Palette.cyan.withValues(alpha: .55)
                                : const Color(0x66000000),
                            blurRadius: on ? 12 : 6,
                          ),
                        ],
                      ),
                      padding: const EdgeInsets.all(3),
                      child: ClipOval(child: team.image(preset)),
                    ),
                  ),
                  // The glass bubble's shine.
                  Positioned.fill(
                    child: IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.center,
                            colors: [
                              Colors.white.withValues(alpha: .22),
                              Colors.white.withValues(alpha: 0),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  if (on)
                    Positioned(
                      right: -2,
                      bottom: -2,
                      child: Container(
                        key: const ValueKey('preset-strip-tick'),
                        width: 22,
                        height: 22,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Palette.cyan,
                          border: Border.all(
                            color: const Color(0xff05090d),
                            width: 2,
                          ),
                        ),
                        child: const Icon(
                          Icons.check_rounded,
                          size: 14,
                          color: Color(0xff05090d),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final open = !c.presetStripHidden;
    return FutureBuilder<TeamPresets>(
      future: _team,
      builder: (context, snap) {
        final team = snap.data;
        final shown = team?.shownFor(c) ?? const <Map>[];
        if (team == null || shown.isEmpty) return const SizedBox.shrink();
        final onId = c.presetOnId;
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Row(
                children: [
                  OverViewer(child: _tab(open: open)),
                  const Spacer(),
                  if (open)
                    OverViewer(
                      child: Material(
                        color: const Color(0xcc08131e),
                        shape: CircleBorder(
                          side: BorderSide(
                            color: Palette.cyan.withValues(alpha: .35),
                          ),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          key: const ValueKey('preset-strip-close'),
                          onTap: () => _show(false),
                          child: const Tooltip(
                            message: 'Hide presets',
                            child: Padding(
                              padding: EdgeInsets.all(5),
                              child: Icon(Icons.close_rounded, size: 16),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            if (open) ...[
              const SizedBox(height: 6),
              OverViewer(
                child: SizedBox(
                  height: _size + 14,
                  child: ListView(
                    key: const ValueKey('preset-strip'),
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
                    children: [
                      for (final p in shown)
                        _bubble(team, p, onId == '${p['id']}'),
                    ],
                  ),
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}
