import 'dart:convert';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/services.dart';

import '../app_controller.dart';
import '../design_document.dart';
import '../gradient_presets.dart';
import '../project_sync.dart';
import 'flow_ui.dart';
import 'showroom.dart' show ColorWheel;
import 'ui.dart';

/// "1 panel", "6 panels": a print layout's panels on the kit.
String _panels(int n) => '$n panel${n == 1 ? '' : 's'}';

/// Patterns › the garment's areas (area key, label), as the website's Studio
/// (patternAreas): only the areas the 3D viewer paints on that garment
/// (viewer zones.js). Shorts have no shoulders or sleeves, and a singlet no
/// sleeves (its outline ends at x 0.254, the sleeve area starts at 0.27: a
/// pattern there painted nothing); the full kit's jersey has both.
List<(String, String)> patternAreas(String garment, {String? trackStyle}) {
  final shorts = garment == 'Shorts';
  return [
    ('body', shorts ? 'Body' : garmentZones['body']!),
    if (!shorts) ('yoke', garmentZones['yoke']!),
    if (!shorts && garment != 'Singlet') ('sleeves', garmentZones['sleeves']!),
    ('sides', garmentZones['sides']!),
    ('hem', shorts ? 'Leg hems' : garmentZones['hem']!),
    if (garment == 'Polo with pocket') ('pocket', garmentZones['pocket']!),
    // A hoodie's pocket is its kangaroo pocket.
    if (isHoodie(garment)) ...[('pocket', 'Kangaroo pocket'), ('hood', 'Hood')],
    // The track jacket's stand-up collar, or its hood.
    if (isTrack(garment)) ('hood', trackStyle == 'hood' ? 'Hood' : 'Collar'),
  ];
}

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

  /// A factory print layout, or a design picture ([picture]: the finished
  /// design's front and back drawn flat): kept with the saved assets, checked
  /// in the 3D view (this sheet closes for it), then put on the kit.
  Future<void> _uploadLayout({bool picture = false}) async {
    if (!c.signedIn) {
      showToast(
        context,
        picture
            ? 'Sign in to use your design picture: it is kept with your saved assets.'
            : 'Sign in to use print layouts: the file is kept with your saved assets.',
      );
      c.go(AppScreen.auth);
      return;
    }
    final file = await openFile(
      acceptedTypeGroups: [
        XTypeGroup(
          label: picture ? 'Design pictures' : 'Print layouts',
          extensions: ['pdf', 'svg', 'png', 'jpg', 'jpeg', if (picture) 'webp'],
          mimeTypes: [
            'application/pdf',
            'image/svg+xml',
            'image/png',
            'image/jpeg',
            if (picture) 'image/webp',
          ],
          uniformTypeIdentifiers: const [
            'com.adobe.pdf',
            'public.svg-image',
            'public.png',
            'public.jpeg',
          ],
        ),
      ],
    );
    if (file == null || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    void say(String text) {
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        SnackBar(
          content: Text(text),
          behavior: SnackBarBehavior.floating,
          backgroundColor: Palette.surface2,
          showCloseIcon: true,
          duration: const Duration(seconds: 4),
        ),
      );
    }

    if (ModalRoute.of(context) is PopupRoute) Navigator.of(context).pop();
    say('Reading ${file.name}…');
    try {
      final bytes = await file.readAsBytes();
      final message = picture
          ? await c.importDesignPicture(file.name, bytes)
          : await c.importPrintLayout(file.name, bytes);
      if (message != null) say(message);
    } on Object catch (error) {
      say('$error');
    }
  }

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
        const SectionLabel('My design picture'),
        const Text(
          'A finished picture of your design: the front and back of the '
          'garment drawn flat, side by side. It goes onto the 3D kit exactly '
          'as drawn: the whole pattern, your logos in their places. '
          'Singlets, jerseys, training tees and polos.',
          style: TextStyle(color: Palette.muted, fontSize: 12),
        ),
        const SizedBox(height: 8),
        if (c.layout case final layout? when layout['kind'] == 'drawing') ...[
          Row(
            children: [
              const Icon(Icons.check_circle, size: 16, color: Palette.cyan),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  '${layout['name']} · on the 3D kit as drawn',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          SecondaryButton(
            label: 'REMOVE DESIGN PICTURE',
            icon: Icons.layers_clear_outlined,
            onPressed: () {
              c.edit(() => c.layout = null);
              showToast(
                context,
                'Design picture removed: back to your designed kit. Put my '
                'design picture back (here) or Undo returns it.',
              );
            },
          ),
        ] else ...[
          if (c.shelvedLayouts['drawing'] case final back?) ...[
            SecondaryButton(
              label: 'PUT MY DESIGN PICTURE BACK',
              icon: Icons.undo,
              onPressed: () {
                c.putLayoutBack('drawing');
                showToast(
                  context,
                  '${back.layout['name']} is back on the 3D kit as drawn.',
                );
              },
            ),
            const SizedBox(height: 6),
          ],
          SecondaryButton(
            label: 'UPLOAD MY DESIGN PICTURE',
            icon: Icons.add_photo_alternate_outlined,
            onPressed: c.checkLayout == null
                ? null
                : () => _uploadLayout(picture: true),
          ),
        ],
        const SectionLabel('Factory print layout'),
        const Text(
          'The finished print file from the factory (PDF, SVG or PNG with the '
          'cut panels laid flat and named FRONT BODY, LEFT SLEEVE …): each '
          'panel goes onto the 3D kit, the same way every time.',
          style: TextStyle(color: Palette.muted, fontSize: 12),
        ),
        const SizedBox(height: 8),
        if (c.layout case final layout? when layout['kind'] != 'drawing') ...[
          Row(
            children: [
              const Icon(Icons.check_circle, size: 16, color: Palette.cyan),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  '${layout['name']} · '
                  '${_panels((layout['roles'] as List).where((role) => role != 'none').length)}'
                  ' on the kit',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5),
                ),
              ),
            ],
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            controlAffinity: ListTileControlAffinity.leading,
            value: layout['joinLines'] != false,
            onChanged: (on) =>
                c.edit(() => c.layout = {...layout, 'joinLines': on ?? true}),
            title: const Text(
              'Join the sleeve bands to the sleeves (no white line between them)',
              style: TextStyle(fontSize: 12.5),
            ),
          ),
          const SizedBox(height: 4),
          SecondaryButton(
            label: 'REMOVE PRINT LAYOUT',
            icon: Icons.layers_clear_outlined,
            onPressed: () {
              c.edit(() => c.layout = null);
              showToast(
                context,
                'Print layout removed: back to your designed kit. Put the '
                'print layout back (here) or Undo returns it.',
              );
            },
          ),
        ] else ...[
          if (c.shelvedLayouts['print'] case final back?) ...[
            SecondaryButton(
              label: 'PUT THE PRINT LAYOUT BACK',
              icon: Icons.undo,
              onPressed: () {
                c.putLayoutBack('print');
                showToast(context, '${back.layout['name']} is back on the 3D kit.');
              },
            ),
            const SizedBox(height: 6),
          ],
          SecondaryButton(
            label: 'UPLOAD PRINT LAYOUT',
            icon: Icons.upload_file,
            onPressed: c.checkLayout == null ? null : _uploadLayout,
          ),
        ],
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
          // Made in the Artboard: open the same design, change it and send it
          // again to update this artwork in place.
          if (layer['artboard'] case final num doc) ...[
            SecondaryButton(
              label: 'EDIT IN ARTBOARD',
              icon: Icons.draw_outlined,
              onPressed: () {
                if (ModalRoute.of(context) is PopupRoute) {
                  Navigator.of(context).pop();
                }
                c.editInArtboard(doc.toInt());
              },
            ),
            const SizedBox(height: 8),
          ],
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

/// GRADIENT FILL in the Colours tool: CHOOSE GRADIENT opens the presets sheet; From, To and Angle edit the selected
/// colour zone's gradient (the stops between From and To are kept), and it can be turned off (solid colour).
class StudioGradientTool extends StatefulWidget {
  const StudioGradientTool(this.c, {super.key, this.slot = 0});
  final AppController c;

  /// The selected colour zone: 0 Primary, 1 Secondary, 2 Accent (solid only).
  final int slot;

  @override
  State<StudioGradientTool> createState() => _StudioGradientToolState();
}

class _StudioGradientToolState extends State<StudioGradientTool> {
  bool _dragging = false;
  AppController get c => widget.c;

  void _live(Map<String, dynamic> g) {
    if (_dragging) {
      c.update(() => setZoneGradient(c, widget.slot, g));
    } else {
      _dragging = true;
      c.edit(() => setZoneGradient(c, widget.slot, g));
    }
  }

  @override
  Widget build(BuildContext context) {
    final slot = widget.slot;
    final g = zoneGradient(c, slot);
    final stops = g == null ? const <GradientStop>[] : gradientStops(g);
    final angle = ((g?['angle'] as num?) ?? 0).toDouble();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel('Gradient fill'),
        if (slot == 2)
          const Text(
            'Names, numbers and the wordmark stay a solid colour. Choose Primary or Secondary for a gradient fill.',
            style: TextStyle(color: Palette.muted, fontSize: 11),
          )
        else ...[
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              key: const ValueKey('choose-gradient'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Palette.text,
                side: const BorderSide(color: Palette.cyan, width: 1.5),
                backgroundColor: Palette.cyan.withValues(alpha: .06),
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: () => showGradientPresets(context, c, slot),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('CHOOSE GRADIENT', style: TextStyle(fontWeight: FontWeight.w800, letterSpacing: 1.4, fontSize: 12)),
                  Icon(Icons.chevron_right, size: 18),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          if (g == null || stops.isEmpty)
            const Text(
              'Solid colour. Choose a gradient to blend colours across this zone.',
              style: TextStyle(color: Palette.muted, fontSize: 11),
            )
          else ...[
            Row(
              children: [
                for (final (i, label) in const [(0, 'From'), (1, 'To')]) ...[
                  if (i == 1) const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(label, style: const TextStyle(color: Palette.muted, fontSize: 11)),
                        const SizedBox(height: 6),
                        GestureDetector(
                          key: ValueKey('gradient-$label'),
                          onTap: () => showGradientPresets(context, c, slot, editStop: i == 0 ? 0 : stops.length - 1),
                          child: Container(
                            height: 40,
                            decoration: BoxDecoration(
                              color: (i == 0 ? stops.first : stops.last).color,
                              borderRadius: BorderRadius.circular(7),
                              border: Border.all(color: Palette.border),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
            if (stops.length > 2) ...[
              const SizedBox(height: 8),
              Container(
                height: 20,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: flutterGradient(stops),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: Palette.border),
                ),
                child: Text(
                  '${stops.length} COLOURS',
                  style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 1.4, color: Colors.white),
                ),
              ),
            ],
            const SizedBox(height: 8),
            Text('Angle · ${angle.round()}°', style: const TextStyle(color: Palette.muted, fontSize: 11)),
            Slider(
              key: const ValueKey('gradient-angle'),
              value: angle.clamp(0, 360).toDouble(),
              max: 360,
              divisions: 72,
              activeColor: Palette.cyan,
              onChanged: (v) => _live({...g, 'angle': v.round()}),
              onChangeEnd: (_) => _dragging = false,
            ),
            TextButton.icon(
              key: const ValueKey('gradient-off'),
              onPressed: () => c.edit(() => setZoneGradient(c, slot, null)),
              icon: const Icon(Icons.close, size: 15),
              label: const Text('Turn gradient off · solid colour', style: TextStyle(fontSize: 12)),
              style: TextButton.styleFrom(foregroundColor: Palette.muted),
            ),
          ],
        ],
      ],
    );
  }
}

/// GRADIENT PRESETS as a compact bottom sheet: the presets, then CREATE CUSTOM GRADIENT (stops, colour wheel and
/// hex). Every choice is one undo step and shows on the 3D kit at once; closing (X, a tap outside, Back) keeps it.
Future<void> showGradientPresets(BuildContext context, AppController c, int slot, {int? editStop}) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black26,
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * .62, maxWidth: 560),
      builder: (_) => GradientPresetsSheet(c: c, slot: slot, editStop: editStop),
    );

class GradientPresetsSheet extends StatefulWidget {
  const GradientPresetsSheet({super.key, required this.c, required this.slot, this.editStop});
  final AppController c;
  final int slot;
  final int? editStop;
  @override
  State<GradientPresetsSheet> createState() => _GradientPresetsSheetState();
}

class _GradientPresetsSheetState extends State<GradientPresetsSheet> {
  late bool _custom = widget.editStop != null;
  late int _stop = widget.editStop ?? 0;
  bool _dragging = false;
  AppController get c => widget.c;

  Map<String, dynamic>? get _g => zoneGradient(c, widget.slot);
  num get _angle => (_g?['angle'] as num?) ?? 0;

  void _apply(Map<String, dynamic>? g) => c.edit(() => setZoneGradient(c, widget.slot, g));
  void _live(Map<String, dynamic> g) {
    if (_dragging) {
      c.update(() => setZoneGradient(c, widget.slot, g));
    } else {
      _dragging = true;
      _apply(g);
    }
  }

  void _startCustom() {
    setState(() {
      _custom = true;
      _stop = 0;
    });
    if (_g == null) {
      final base = widget.slot == 0 ? c.mainColor : c.secondaryColor;
      final other = widget.slot == 0 ? c.secondaryColor : c.mainColor;
      _apply(makeGradient([GradientStop(ProjectSync.hex(base), 0), GradientStop(ProjectSync.hex(other), 1)], 0));
    }
  }

  void _addStop(List<GradientStop> stops) {
    if (stops.length >= 6) return;
    var at = 0;
    for (var i = 1; i < stops.length; i++) {
      if (stops[i].at - stops[i - 1].at > stops[at + 1].at - stops[at].at) at = i - 1;
    }
    final mixed = Color.lerp(stops[at].color, stops[at + 1].color, .5)!;
    final next = [...stops]..insert(at + 1, GradientStop(ProjectSync.hex(mixed), (stops[at].at + stops[at + 1].at) / 2));
    _apply(makeGradient(next, _angle));
    setState(() => _stop = at + 1);
  }

  void _removeStop(List<GradientStop> stops, int i) {
    if (stops.length <= 2) return;
    _apply(makeGradient([...stops]..removeAt(i), _angle));
    setState(() => _stop = (i - 1).clamp(0, stops.length - 2));
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: c,
    builder: (context, _) {
      final g = _g;
      final stops = g == null ? const <GradientStop>[] : gradientStops(g);
      final stop = stops.isEmpty ? 0 : _stop.clamp(0, stops.length - 1);
      final zone = const ['PRIMARY', 'SECONDARY', 'ACCENT'][widget.slot];
      return Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xf70a1824), Color(0xfa050e18)]),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
          border: Border.all(color: Palette.cyan.withValues(alpha: .45), width: 1.2),
          boxShadow: [BoxShadow(color: Palette.cyan.withValues(alpha: .16), blurRadius: 20)],
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(width: 42, height: 4, margin: const EdgeInsets.only(bottom: 8), decoration: BoxDecoration(color: const Color(0xff3b5a69), borderRadius: BorderRadius.circular(2))),
                ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('GRADIENT PRESETS', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, letterSpacing: 1.8, fontSize: 14)),
                          const SizedBox(height: 4),
                          Text('Apply to selected colour zone · $zone', style: const TextStyle(color: Palette.muted, fontSize: 11.5)),
                        ],
                      ),
                    ),
                    IconButton(
                      key: const ValueKey('gradient-close'),
                      tooltip: 'Close',
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close, color: Palette.text, size: 20),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                GridView.count(
                  crossAxisCount: 4,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 1.25,
                  children: [
                    for (final p in gradientPresets)
                      _PresetSwatch(
                        p,
                        selected: g?['preset'] == p.id,
                        onTap: () {
                          setState(() => _custom = false);
                          _apply(makeGradient(p.stops, _angle, preset: p.id));
                        },
                      ),
                  ],
                ),
                if (_custom && stops.isNotEmpty) ...[
                  const Divider(color: Palette.border, height: 22),
                  const Text('CUSTOM GRADIENT', style: TextStyle(color: Palette.cyan, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.6)),
                  const SizedBox(height: 10),
                  LayoutBuilder(
                    builder: (context, box) => SizedBox(
                      height: 30,
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Positioned.fill(
                            left: 11,
                            right: 11,
                            child: DecoratedBox(
                              decoration: BoxDecoration(gradient: flutterGradient(stops), borderRadius: BorderRadius.circular(7), border: Border.all(color: Palette.border)),
                            ),
                          ),
                          for (final (i, s) in stops.indexed)
                            Positioned(
                              left: s.at * (box.maxWidth - 22),
                              top: 4,
                              child: GestureDetector(
                                key: ValueKey('gradient-stop-$i'),
                                onTap: () => setState(() => _stop = i),
                                child: Container(
                                  width: 22,
                                  height: 22,
                                  decoration: BoxDecoration(
                                    color: s.color,
                                    shape: BoxShape.circle,
                                    border: Border.all(color: i == stop ? Palette.cyan : Colors.white, width: i == stop ? 3 : 2),
                                    boxShadow: i == stop ? [BoxShadow(color: Palette.cyan.withValues(alpha: .7), blurRadius: 8)] : null,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(child: Text('Stop ${stop + 1} of ${stops.length} · ${(stops[stop].at * 100).round()}%', style: const TextStyle(color: Palette.muted, fontSize: 11))),
                      TextButton.icon(
                        key: const ValueKey('gradient-add-stop'),
                        onPressed: stops.length >= 6 ? null : () => _addStop(stops),
                        icon: const Icon(Icons.add, size: 15),
                        label: const Text('Add stop', style: TextStyle(fontSize: 11)),
                      ),
                      TextButton.icon(
                        key: const ValueKey('gradient-remove-stop'),
                        onPressed: stops.length <= 2 ? null : () => _removeStop(stops, stop),
                        icon: const Icon(Icons.remove, size: 15),
                        label: const Text('Remove', style: TextStyle(fontSize: 11)),
                      ),
                    ],
                  ),
                  Slider(
                    value: stops[stop].at,
                    activeColor: Palette.cyan,
                    onChanged: (v) {
                      final lo = stop > 0 ? stops[stop - 1].at + .01 : 0.0, hi = stop < stops.length - 1 ? stops[stop + 1].at - .01 : 1.0;
                      final next = [for (final (i, s) in stops.indexed) i == stop ? GradientStop(s.hex, v.clamp(lo, hi).toDouble()) : s];
                      _live(makeGradient(next, _angle));
                    },
                    onChangeEnd: (_) => _dragging = false,
                  ),
                  ColorWheel(
                    key: ValueKey('gradient-wheel-$stop'),
                    color: stops[stop].color,
                    onChanged: (color) => _live(makeGradient([for (final (i, s) in stops.indexed) i == stop ? GradientStop(ProjectSync.hex(color), s.at) : s], _angle)),
                    onDone: (_) => _dragging = false,
                  ),
                ],
                const Divider(color: Palette.border, height: 22),
                Center(
                  child: TextButton.icon(
                    key: const ValueKey('gradient-custom'),
                    onPressed: () => _custom ? setState(() => _custom = false) : _startCustom(),
                    icon: const Icon(Icons.add_circle_outline, size: 18),
                    label: Text(_custom ? 'DONE EDITING' : 'CREATE CUSTOM GRADIENT', style: const TextStyle(fontWeight: FontWeight.w800, letterSpacing: 1.3, fontSize: 12)),
                    style: TextButton.styleFrom(foregroundColor: Palette.cyan),
                  ),
                ),
                if (g != null)
                  Center(
                    child: TextButton(
                      key: const ValueKey('gradient-sheet-off'),
                      onPressed: () {
                        setState(() => _custom = false);
                        _apply(null);
                      },
                      child: const Text('Turn gradient off · solid colour', style: TextStyle(color: Palette.muted, fontSize: 11, decoration: TextDecoration.underline)),
                    ),
                  ),
                const Text('Select a preset to preview on your garment', textAlign: TextAlign.center, style: TextStyle(color: Color(0xff71899a), fontSize: 11)),
              ],
            ),
          ),
        ),
      );
    },
  );
}

class _PresetSwatch extends StatelessWidget {
  const _PresetSwatch(this.p, {required this.selected, required this.onTap});
  final GradientPreset p;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => GestureDetector(
    key: ValueKey('gradient-preset-${p.id}'),
    onTap: onTap,
    child: Column(
      children: [
        Expanded(
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fill(
                child: Container(
                  decoration: BoxDecoration(
                    gradient: flutterGradient(p.stops),
                    borderRadius: BorderRadius.circular(9),
                    border: Border.all(color: selected ? Palette.cyan : Colors.white24, width: selected ? 2 : 1.2),
                    boxShadow: selected ? [BoxShadow(color: Palette.cyan.withValues(alpha: .45), blurRadius: 10)] : null,
                  ),
                ),
              ),
              if (selected)
                Positioned(
                  top: -6,
                  right: -6,
                  child: Container(
                    width: 19,
                    height: 19,
                    decoration: BoxDecoration(color: Palette.cyan, shape: BoxShape.circle, boxShadow: [BoxShadow(color: Palette.cyan.withValues(alpha: .7), blurRadius: 6)]),
                    child: const Icon(Icons.check, size: 13, color: Color(0xff03141c)),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Text(
          p.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w700, letterSpacing: .4, color: selected ? Colors.white : const Color(0xffc9dbe4)),
        ),
      ],
    ),
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
      for (final (area, label) in patternAreas(c.garment, trackStyle: c.trackStyle))
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: DropdownButtonFormField<String>(
            key: ValueKey('$area-${c.zones[area]}'),
            initialValue: c.zones[area] ?? '',
            decoration: InputDecoration(labelText: label),
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
                c.zones.remove(area);
              } else {
                c.zones[area] = value;
              }
            }),
          ),
        ),
      // The track jacket's style: its stand-up collar or a hood (as the website's TRACK JACKET STYLE).
      if (isTrack(c.garment)) ...[
        const SectionLabel('Track jacket style'),
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: SegmentedButton<String>(
            key: const ValueKey('track-style'),
            segments: const [
              ButtonSegment(value: 'collar', label: Text('Stand-up collar')),
              ButtonSegment(value: 'hood', label: Text('Hood')),
            ],
            selected: {c.trackStyle},
            onSelectionChanged: (v) => c.edit(() => c.trackStyle = v.first),
          ),
        ),
      ],
      // Hoodies, the varsity and track jackets: each area's own colour, from the kit's colours (or back to them).
      if (isHoodie(c.garment) || isVarsity(c.garment) || isTrack(c.garment)) ...[
        SectionLabel(isTrack(c.garment) ? 'Track jacket area colours' : isVarsity(c.garment) ? 'Varsity area colours' : 'Hoodie area colours'),
        for (final area in (isTrack(c.garment)
                ? {...trackAreas, if (c.trackStyle == 'hood') 'collar': 'Hood'}
                : isVarsity(c.garment)
                ? varsityAreas
                : hoodieAreas)
            .entries)
          if (area.key != 'zip' || c.garment == 'Zip hoodie')
            Row(
              key: ValueKey('area-${area.key}'),
              children: [
                Expanded(child: Text(area.value, style: const TextStyle(fontSize: 12))),
                for (final color in {c.mainColor, c.secondaryColor, c.accentColor, Colors.white, Colors.black})
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    tooltip: '${area.value}: ${ProjectSync.hex(color)}',
                    icon: Icon(
                      c.zoneColors[area.key] == ProjectSync.hex(color) ? Icons.check_circle : Icons.circle,
                      color: color,
                      size: 20,
                    ),
                    onPressed: () => c.edit(() => c.zoneColors = {...c.zoneColors, area.key: ProjectSync.hex(color)}),
                  ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  tooltip: '${area.value}: back to the kit colours',
                  icon: const Icon(Icons.restart_alt, size: 18),
                  onPressed: c.zoneColors.containsKey(area.key)
                      ? () => c.edit(() => c.zoneColors = {...c.zoneColors}..remove(area.key))
                      : null,
                ),
              ],
            ),
      ],
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

  Future<void> _apply(String name, Map<String, dynamic> design) async {
    await c.captureOwnThumb();
    if (!mounted) return;
    final on = c.layout;
    final replaced = on == null
        ? null
        : on['kind'] == 'drawing'
        ? 'design picture'
        : 'print layout';
    c.applyPreset(design);
    showToast(
      context,
      replaced == null
          ? '$name applied. Your logos and player details are preserved.'
          : '$name applied in place of your $replaced: Undo, or Artwork › '
                '${replaced == 'design picture' ? 'My design picture' : 'Factory print layout'}, '
                'puts it back.',
    );
  }

  /// YOUR DESIGN, first in All designs and My designs.
  List<Widget> _own() {
    final own = c.ownKit;
    if (own == null || !'your design'.contains(_query.toLowerCase())) {
      return const [];
    }
    final thumb = c.ownThumb;
    return [
      Stack(
        children: [
          _card(
            image: thumb != null
                ? Image.memory(thumb, fit: BoxFit.cover)
                : DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [own.mainColor, own.secondaryColor],
                      ),
                    ),
                  ),
            title: 'YOUR DESIGN',
            subtitle: own.layout == null
                ? 'Your own kit'
                : own.layout!['kind'] == 'drawing'
                ? 'Design picture'
                : 'Print layout',
            onTap: () {
              c.restoreOwn();
              showToast(
                context,
                'Your design is back on the kit. Undo returns to the preset.',
              );
            },
          ),
          if (c.ownOn)
            const Positioned(
              right: 6,
              top: 6,
              child: Icon(Icons.check_circle, color: Palette.cyan, size: 18),
            ),
        ],
      ),
    ];
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
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (c.ownKit != null) _grid(_own()),
                    const Text(
                      'No saved designs yet. Save a kit and it appears here.',
                      style: TextStyle(color: Palette.muted),
                    ),
                  ],
                );
              }
              return _grid([
                ..._own(),
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
                if (_tab == 0) ..._own(),
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
