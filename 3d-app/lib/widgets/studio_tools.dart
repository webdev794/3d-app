import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/services.dart';

import '../app_controller.dart';
import '../design_document.dart';
import '../project_sync.dart';
import 'flow_ui.dart';
import 'ui.dart';

/// Tools edit the same document as the web studio and the live 2D board.
class StudioArtworkTool extends StatefulWidget {
  const StudioArtworkTool(this.c, {super.key});
  final AppController c;

  @override
  State<StudioArtworkTool> createState() => _StudioArtworkToolState();
}

class _StudioArtworkToolState extends State<StudioArtworkTool> {
  final _text = TextEditingController();
  bool _processing = false;
  AppController get c => widget.c;

  void _add(Map<String, dynamic> layer) {
    if (c.layers.length >= 40) {
      showToast(context, 'A design supports up to 40 artwork layers.');
      return;
    }
    c.addLayer(layer);
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _upload() async {
    final image = await pickPhoto(context);
    if (!mounted || image == null) return;
    final src = ProjectSync.dataUrl(image);
    if (src == null) {
      showToast(context, 'Choose a PNG, JPEG or WebP image.');
      return;
    }
    if (src.length > 4000000) {
      showToast(context, 'Choose a smaller image (under 3 MB) for artwork.');
      return;
    }
    c.artwork.add(image);
    _add({'type': 'image', 'name': 'Artwork', 'src': src});
  }

  Future<void> _process({bool removeBg = false, String? tint}) async {
    final layer = c.selectedLayer;
    final process = c.processArtwork;
    if (layer == null || layer['src'] is! String || process == null) return;
    setState(() => _processing = true);
    try {
      final src = await process(
        layer['src'] as String,
        removeBg: removeBg,
        tint: tint,
      );
      if (!mounted) return;
      if (c.layers.any((item) => item['id'] == layer['id'])) {
        c.changeLayer(layer['id'] as String, {'src': src});
      }
    } on Object catch (error) {
      if (mounted) showToast(context, '$error');
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  void _change(Map<String, dynamic> patch) {
    final id = c.selectedLayerId;
    if (id != null) c.changeLayer(id, patch);
  }

  Widget _slider(
    String label,
    String field,
    double min,
    double max,
    double fallback,
  ) {
    final value = (c.selectedLayer?[field] as num?)?.toDouble() ?? fallback;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$label: ${value.toStringAsFixed(field == 'rot' ? 0 : 2)}',
          style: const TextStyle(color: Palette.muted, fontSize: 12),
        ),
        Slider(
          key: ValueKey('layer-$field'),
          min: min,
          max: max,
          value: value.clamp(min, max),
          onChangeStart: (_) => c.edit(() {}),
          onChanged: (next) {
            final id = c.selectedLayerId;
            if (id != null) c.changeLayer(id, {field: next}, record: false);
          },
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final layer = c.selectedLayer;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const ScreenTitle('ARTWORK & LAYERS', size: 20, align: TextAlign.left),
        const SizedBox(height: 8),
        const Text(
          'Add artwork here, then use the artboard to drag, resize and rotate it.',
          style: TextStyle(color: Palette.muted, fontSize: 12),
        ),
        const SizedBox(height: 12),
        SecondaryButton(
          label: 'UPLOAD IMAGE / LOGO',
          icon: Icons.upload,
          onPressed: _processing ? null : _upload,
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _text,
                maxLength: 120,
                decoration: const InputDecoration(
                  labelText: 'Artwork text',
                  counterText: '',
                ),
              ),
            ),
            IconButton(
              tooltip: 'Add text layer',
              icon: const Icon(Icons.add),
              onPressed: () {
                if (_text.text.trim().isEmpty) return;
                _add({
                  'type': 'text',
                  'text': _text.text.trim(),
                  'size': 0.06,
                  'color': ProjectSync.hex(c.accentColor),
                });
                _text.clear();
              },
            ),
          ],
        ),
        const SectionLabel('Add a shape'),
        Wrap(
          spacing: 8,
          children: [
            for (final shape in ['rectangle', 'ellipse', 'triangle'])
              ActionChipPill(
                shape,
                onTap: () => _add({
                  'type': 'shape',
                  'shape': shape,
                  'h': 0.12,
                  'color': ProjectSync.hex(c.accentColor),
                }),
              ),
          ],
        ),
        const SectionLabel('Layers'),
        if (c.layers.isEmpty)
          const Text(
            'No artwork layers yet.',
            style: TextStyle(color: Palette.muted),
          ),
        for (final item in c.layers.reversed)
          ListTile(
            contentPadding: EdgeInsets.zero,
            selected: item['id'] == c.selectedLayerId,
            selectedColor: Palette.cyan,
            leading: Icon(switch (item['type']) {
              'text' => Icons.text_fields,
              'shape' => Icons.category_outlined,
              _ => Icons.image_outlined,
            }),
            title: Text(
              '${item['text'] ?? item['name'] ?? item['shape'] ?? 'Image'}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: Text('${item['part']} / ${item['side']}'),
            onTap: () => c.selectLayer(item['id'] as String),
            trailing: IconButton(
              tooltip: 'Delete layer',
              onPressed: () => c.removeLayer(item['id'] as String),
              icon: const Icon(Icons.delete_outline),
            ),
          ),
        if (layer != null) ...[
          const SectionLabel('Selected artwork'),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              for (final side in ['front', 'back'])
                ActionChipPill(
                  side,
                  selected: layer['side'] == side,
                  onTap: () => _change({'side': side}),
                ),
              if (c.garment == 'Full Kit')
                for (final part in ['top', 'shorts'])
                  ActionChipPill(
                    part,
                    selected: layer['part'] == part,
                    onTap: () => _change({
                      'part': part,
                      'y': part == 'shorts' ? 0.23 : 0.43,
                    }),
                  ),
              ActionChipPill(
                'Duplicate',
                onTap: () {
                  final copy = {...layer}..remove('id');
                  copy['x'] = ((copy['x'] as num?) ?? 0) + 0.03;
                  _add(copy);
                },
              ),
              ActionChipPill(
                'Bring forward',
                onTap: () => c.edit(() {
                  c.layers = [
                    ...c.layers.where((item) => item['id'] != layer['id']),
                    layer,
                  ];
                }),
              ),
            ],
          ),
          if (layer['type'] == 'text')
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: TextFormField(
                key: ValueKey(layer['id']),
                initialValue: layer['text'] as String? ?? '',
                maxLength: 120,
                decoration: const InputDecoration(labelText: 'Edit text'),
                onChanged: (value) => _change({'text': value}),
              ),
            ),
          _slider('Horizontal position', 'x', -0.38, 0.38, 0),
          _slider('Height from hem', 'y', 0, 0.8, 0.43),
          if (layer['type'] == 'text')
            _slider('Text size', 'size', 0.015, 0.25, 0.06)
          else
            _slider('Width', 'w', 0.025, 0.6, 0.16),
          if (layer['type'] == 'shape')
            _slider('Height', 'h', 0.025, 0.6, 0.12),
          _slider('Rotation', 'rot', -180, 180, 0),
          _slider('Opacity', 'opacity', 0.1, 1, 1),
          if (layer['type'] == 'image') ...[
            const Text(
              'Background removal clears a connected, plain background. Complex photos may need a prepared transparent PNG.',
              style: TextStyle(color: Palette.muted, fontSize: 11),
            ),
            const SizedBox(height: 8),
            SecondaryButton(
              label: _processing ? 'PROCESSING...' : 'REMOVE BACKGROUND',
              icon: Icons.auto_fix_high,
              onPressed: _processing || c.processArtwork == null
                  ? null
                  : () => _process(removeBg: true),
            ),
            const SectionLabel('Tint artwork'),
          ] else
            const SectionLabel('Artwork colour'),
          Wrap(
            spacing: 8,
            children: [
              for (final color in [
                Colors.white,
                Colors.black,
                c.mainColor,
                c.secondaryColor,
                c.accentColor,
              ])
                IconButton(
                  tooltip: 'Use ${ProjectSync.hex(color)}',
                  icon: Icon(Icons.circle, color: color),
                  onPressed: _processing
                      ? null
                      : () => layer['type'] == 'image'
                            ? _process(tint: ProjectSync.hex(color))
                            : _change({'color': ProjectSync.hex(color)}),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class StudioGradientTool extends StatelessWidget {
  const StudioGradientTool(this.c, {super.key});
  final AppController c;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const SectionLabel('Gradient'),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          ActionChipPill(
            'No gradient',
            selected: c.gradient == null,
            onTap: () => c.edit(() => c.gradient = null),
          ),
          for (final angle in [0, 45, 90, 180])
            ActionChipPill(
              '${angle}°',
              selected: c.gradient?['angle'] == angle,
              onTap: () => c.edit(
                () => c.gradient = {
                  'from': ProjectSync.hex(c.mainColor),
                  'to': ProjectSync.hex(c.secondaryColor),
                  'angle': angle,
                },
              ),
            ),
        ],
      ),
      const SizedBox(height: 8),
      const Text(
        'Uses the current primary and secondary colours. Select an angle to apply them.',
        style: TextStyle(color: Palette.muted, fontSize: 11),
      ),
    ],
  );
}

class StudioZoneTool extends StatelessWidget {
  const StudioZoneTool(this.c, {super.key});
  final AppController c;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const SectionLabel('Patterns by garment area'),
      for (final zone in garmentZones.entries)
        if (c.garment != 'Shorts' || !['sleeves', 'yoke'].contains(zone.key))
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: DropdownButtonFormField<String>(
              key: ValueKey('${zone.key}-${c.zones[zone.key]}'),
              initialValue: c.zones[zone.key] ?? '',
              decoration: InputDecoration(labelText: zone.value),
              items: [
                const DropdownMenuItem(
                  value: '',
                  child: Text('Use whole garment'),
                ),
                const DropdownMenuItem(
                  value: 'None',
                  child: Text('No pattern'),
                ),
                for (final pattern in studioPatterns)
                  DropdownMenuItem(value: pattern, child: Text(pattern)),
              ],
              onChanged: (value) => c.edit(() {
                c.zones = {...c.zones};
                if (value == null || value.isEmpty) {
                  c.zones.remove(zone.key);
                } else {
                  c.zones[zone.key] = value;
                }
              }),
            ),
          ),
    ],
  );
}

class StudioPresetsTool extends StatefulWidget {
  const StudioPresetsTool(this.c, {super.key});
  final AppController c;
  @override
  State<StudioPresetsTool> createState() => _StudioPresetsToolState();
}

/// "Preset designs": ready-made looks (All), the user's saved kits (My
/// designs) and starred presets (Favourites), as on the website.
class _StudioPresetsToolState extends State<StudioPresetsTool> {
  late final _presets = rootBundle
      .loadString('assets/presets.json')
      .then((text) => jsonDecode(text) as List);
  static const _favouritesKey = '3deezi.favouritePresets';
  int _tab = 0;
  String _query = '';
  Set<String> _favourites = {};

  AppController get c => widget.c;

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance()
        .then((p) {
          if (mounted) {
            setState(
              () =>
                  _favourites = (p.getStringList(_favouritesKey) ?? []).toSet(),
            );
          }
        })
        .catchError((Object _) {});
  }

  void _toggle(String id) {
    setState(
      () => _favourites.contains(id)
          ? _favourites.remove(id)
          : _favourites.add(id),
    );
    SharedPreferences.getInstance()
        .then((p) => p.setStringList(_favouritesKey, _favourites.toList()))
        .catchError((Object _) => false);
  }

  void _apply(String name, Map<String, dynamic> design) {
    c.applyPreset(design);
    showToast(context, '$name applied. Undo restores your previous style.');
  }

  Widget _card({
    required Widget image,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
    String? favouriteId,
  }) => GlowCard(
    glow: false,
    radius: 12,
    onTap: onTap,
    child: Stack(
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AspectRatio(aspectRatio: 1, child: image),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
              child: Column(
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 10.5,
                      color: Palette.muted,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        if (favouriteId != null)
          Positioned(
            left: 4,
            top: 4,
            child: IconButton(
              visualDensity: VisualDensity.compact,
              style: IconButton.styleFrom(
                backgroundColor: const Color(0xcc05101a),
              ),
              tooltip: _favourites.contains(favouriteId)
                  ? 'Remove from favourites'
                  : 'Add to favourites',
              onPressed: () => _toggle(favouriteId),
              icon: Icon(
                _favourites.contains(favouriteId)
                    ? Icons.star_rounded
                    : Icons.star_border_rounded,
                size: 18,
                color: _favourites.contains(favouriteId)
                    ? const Color(0xffffc52f)
                    : Colors.white70,
              ),
            ),
          ),
      ],
    ),
  );

  Widget _grid(List<Widget> children) => GridView.count(
    crossAxisCount: 2,
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    mainAxisSpacing: 10,
    crossAxisSpacing: 10,
    childAspectRatio: .74,
    children: children,
  );

  @override
  Widget build(BuildContext context) {
    final q = _query.toLowerCase();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const ScreenTitle('PRESET DESIGNS', size: 20, align: TextAlign.left),
        const SizedBox(height: 10),
        Row(
          children: [
            for (final (i, label) in const [
              'All designs',
              'My designs',
              'Favourites',
            ].indexed) ...[
              Expanded(
                child: ActionChipPill(
                  label,
                  selected: _tab == i,
                  onTap: () => setState(() => _tab = i),
                ),
              ),
              if (i < 2) const SizedBox(width: 6),
            ],
          ],
        ),
        const SizedBox(height: 10),
        TextField(
          onChanged: (v) => setState(() => _query = v),
          decoration: const InputDecoration(
            hintText: 'Search designs',
            prefixIcon: Icon(Icons.search_rounded, size: 18),
            isDense: true,
          ),
        ),
        const SizedBox(height: 12),
        if (_tab == 1)
          Builder(
            builder: (context) {
              final mine = c.projects
                  .where((p) => p.title.toLowerCase().contains(q))
                  .toList();
              if (mine.isEmpty) {
                return const Text(
                  'No saved designs yet. Save a kit and it appears here.',
                  style: TextStyle(color: Palette.muted),
                );
              }
              return _grid([
                for (final p in mine)
                  _card(
                    image: p.thumbnail != null || p.asset != null
                        ? artImage(bytes: p.thumbnail, asset: p.asset)
                        : DecoratedBox(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                colors: [p.kit.mainColor, p.kit.secondaryColor],
                              ),
                            ),
                          ),
                    title: p.title,
                    subtitle: 'Version ${p.version}',
                    onTap: () => _apply(p.title, {
                      'main': ProjectSync.hex(p.kit.mainColor),
                      'secondary': ProjectSync.hex(p.kit.secondaryColor),
                      'accent': ProjectSync.hex(p.kit.accentColor),
                      'pattern': p.kit.pattern,
                      'gradient': p.kit.gradient,
                      'zones': p.kit.zones,
                    }),
                  ),
              ]);
            },
          )
        else
          FutureBuilder<List>(
            future: _presets,
            builder: (context, snapshot) {
              if (snapshot.hasError)
                return const Text('Presets could not be loaded.');
              if (!snapshot.hasData)
                return const Center(child: CircularProgressIndicator());
              final shown = [
                for (final preset in snapshot.data!.cast<Map>())
                  if ((_tab == 0 || _favourites.contains(preset['id'])) &&
                      '${preset['name']} ${preset['description']}'
                          .toLowerCase()
                          .contains(q))
                    preset,
              ];
              if (shown.isEmpty) {
                return Text(
                  _tab == 2
                      ? 'Tap the star on any design to keep it here.'
                      : 'No designs match your search.',
                  style: const TextStyle(color: Palette.muted),
                );
              }
              return _grid([
                for (final preset in shown)
                  _card(
                    image: Image.asset(
                      'assets/images/presets/${preset['id']}.webp',
                      fit: BoxFit.cover,
                    ),
                    title: preset['name'] as String,
                    subtitle:
                        (preset['design'] as Map)['pattern'] as String? ?? '',
                    favouriteId: preset['id'] as String,
                    onTap: () => _apply(
                      preset['name'] as String,
                      (preset['design'] as Map).cast<String, dynamic>(),
                    ),
                  ),
              ]);
            },
          ),
      ],
    );
  }
}
