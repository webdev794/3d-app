import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../ai_service.dart' show AiService, designPatterns;
import '../api_client.dart' show ApiException;
import '../app_controller.dart';
import '../design_document.dart' show studioPatterns;
import '../own_patterns.dart';
import 'drag_tray.dart';
import 'flow_ui.dart';
import 'studio_tools.dart' show StudioZoneTool, patternAreas;
import 'ui.dart';

/// The Patterns panel's thumbnails: every built-in pattern (as the website's
/// patternNames), then the AI patterns and My patterns.
const panelPatterns = ['None', ...studioPatterns];

/// Studio › Patterns (client 607 + mockup, 19 Nov): a see-through glass
/// panel over the 3D's foot (the kit keeps its size and place). The style
/// chips; a compact grid of thumbnails, 2 rows of 6 a page, swiped inside the
/// panel, with page dots; tap one for the chosen area, or press and hold and
/// drag it onto the garment: the panel steps aside, the part under the
/// finger lights up and the pattern goes on that part (off the garment
/// nothing changes). The bottom row: the garment area, Full colour / Kit
/// colours and Upload pattern; the pattern size, AI pattern and each area's
/// list under More.
class PatternsPanel extends StatefulWidget {
  const PatternsPanel(
    this.c, {
    super.key,
    required this.more,
    required this.onGenerate,
    required this.onUpload,
    required this.onDragging,
  });
  final AppController c;

  /// More is open (the panel header's action).
  final bool more;
  final VoidCallback onGenerate;

  /// Upload pattern, for the chosen area (null: the whole garment).
  final void Function(String? area) onUpload;

  /// A thumbnail is held and dragged (the panel shrinks to one line).
  final ValueChanged<bool> onDragging;

  @override
  State<PatternsPanel> createState() => _PatternsPanelState();
}

class _PatternsPanelState extends State<PatternsPanel> {
  AppController get c => widget.c;

  /// The garment area a tap applies to (null: the whole garment).
  String? _area;
  bool _dragging = false;
  int _page = 0;
  final _pages = PageController();

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  String get _areaLabel => _area == null
      ? 'whole garment'
      : patternAreas(c.garment, trackStyle: c.trackStyle)
            .firstWhere((a) => a.$1 == _area, orElse: () => (_area!, _area!))
            .$2
            .toLowerCase();

  static String _dataUrl(Uint8List bytes) =>
      'data:${patternPictureType(bytes) ?? 'image/png'};base64,${base64Encode(bytes)}';

  // ---------- tap to apply (the chosen area, or the whole garment)
  bool _nameOn(String name) => _area == null
      ? c.patternTile == null && c.pattern == name
      : c.zones[_area] == name;

  void _applyName(String name) => c.edit(() {
    if (_area == null) {
      c.pattern = name == 'None' ? 'Solid' : name;
      c.patternTile = null;
      c.zones = {};
    } else {
      c.zones = {...c.zones, _area!: name};
    }
  });

  void _applyTile(Uint8List tile) => c.edit(() {
    if (_area == null) {
      c.patternTile = tile;
    } else {
      c.zones = {...c.zones, _area!: _dataUrl(tile)};
    }
  });

  Future<void> _applyOwn(OwnPattern p) async {
    String message;
    try {
      message = await c.applyOwnPattern(p, area: _area);
    } on Object {
      message = 'This picture could not be read.';
    }
    if (mounted) showToast(context, message);
  }

  // ---------- drag
  void _dragStarted() {
    HapticFeedback.selectionClick();
    c.viewerPassThrough?.call(true);
    setState(() => _dragging = true);
    widget.onDragging(true);
  }

  void _dragEnded() {
    c.viewerPassThrough?.call(false);
    c.hoverGarment?.call(null);
    if (mounted) setState(() => _dragging = false);
    widget.onDragging(false);
  }

  Widget _tile({
    required Key key,
    required String label,
    required Widget art,
    required bool selected,
    required VoidCallback onTap,
    required KitDrop drop,
    required double size,
    VoidCallback? onDelete,
  }) => LongPressDraggable<KitDrop>(
    key: key,
    data: drop,
    delay: const Duration(milliseconds: 300),
    dragAnchorStrategy: (draggable, context, position) => dragHotSpot,
    onDragStarted: _dragStarted,
    onDragEnd: (_) => _dragEnded(),
    feedback: DragTray.feedback(art),
    child: Semantics(
      button: true,
      selected: selected,
      label: label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              children: [
                Container(
                  width: size,
                  height: size,
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    color: const Color(0xff0e1b29),
                    borderRadius: BorderRadius.circular(9),
                    border: Border.all(
                      color: selected
                          ? Palette.cyan
                          : Colors.white.withValues(alpha: .2),
                      width: selected ? 2 : 1.2,
                    ),
                    boxShadow: selected
                        ? [
                            BoxShadow(
                              color: Palette.cyan.withValues(alpha: .55),
                              blurRadius: 9,
                            ),
                          ]
                        : null,
                  ),
                  child: art,
                ),
                if (onDelete != null)
                  Positioned(
                    top: 2,
                    right: 2,
                    child: GestureDetector(
                      key: ValueKey(
                        'delete-${(key as ValueKey<String>).value}',
                      ),
                      onTap: onDelete,
                      child: const CircleAvatar(
                        radius: 9,
                        backgroundColor: Color(0xdd050c16),
                        child: Icon(
                          Icons.close,
                          size: 11,
                          color: Color(0xffff8f9a),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 3),
            SizedBox(
              width: size,
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 9.5,
                  height: 1.1,
                  color: selected ? Palette.cyan : Palette.text,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );

  List<Widget> _tiles(double size) {
    final own = c.ownPatterns ?? const <OwnPattern>[];
    final onArea = _area == null ? c.patternTile : zonePicture(c.zones[_area]);
    return [
      for (final name in panelPatterns)
        _tile(
          key: ValueKey('pattern-tile-$name'),
          label: name,
          art: PatternSwatch(name, c.patternInk, c.mainColor),
          selected: _nameOn(name),
          onTap: () => _applyName(name),
          drop: KitDrop.panel(pattern: name, label: name),
          size: size,
        ),
      for (final (i, tile) in c.aiPatterns.reversed.indexed)
        _tile(
          key: ValueKey('ai-pattern-$i'),
          label: 'AI ${c.aiPatterns.length - i}',
          art: artImage(bytes: tile),
          selected: _area == null
              ? identical(c.patternTile, tile)
              : c.zones[_area] == _dataUrl(tile),
          onTap: () => _applyTile(tile),
          drop: KitDrop.panel(
            pattern: _dataUrl(tile),
            label: 'AI pattern ${c.aiPatterns.length - i}',
          ),
          size: size,
        ),
      for (final p in own)
        _tile(
          key: ValueKey('own-pattern-${p.id}'),
          label: p.name,
          art: artImage(bytes: p.bytes),
          selected: madeFromOwnPattern(onArea, p.id),
          onTap: () => _applyOwn(p),
          drop: KitDrop.panel(own: p, label: p.name, area: _area),
          size: size,
          onDelete: () async {
            try {
              await c.deleteOwnPattern(p.id);
              if (mounted)
                showToast(context, 'Pattern deleted from My patterns.');
            } on ApiException catch (e) {
              if (mounted) showToast(context, e.message);
            }
          },
        ),
    ];
  }

  Widget _grid() => LayoutBuilder(
    builder: (context, box) {
      const gap = 6.0, per = 12;
      final size = ((box.maxWidth - gap * 5) / 6).floorToDouble() - 2;
      final tiles = _tiles(size);
      final pages = [
        for (var i = 0; i < tiles.length; i += per)
          tiles.sublist(i, i + per > tiles.length ? tiles.length : i + per),
      ];
      final pageHeight = (size + 18) * 2 + gap;
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: pageHeight,
            child: PageView(
              key: const ValueKey('pattern-pages'),
              controller: _pages,
              onPageChanged: (i) => setState(() => _page = i),
              children: [
                for (final page in pages)
                  Wrap(spacing: gap - 2, runSpacing: gap, children: page),
              ],
            ),
          ),
          if (pages.length > 1)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < pages.length; i++)
                    GestureDetector(
                      key: ValueKey('pattern-page-$i'),
                      behavior: HitTestBehavior.opaque,
                      onTap: () => _pages.animateToPage(
                        i,
                        duration: const Duration(milliseconds: 250),
                        curve: Curves.easeOut,
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 5,
                          vertical: 4,
                        ),
                        child: Container(
                          width: 7,
                          height: 7,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: i == _page
                                ? Palette.cyan
                                : Colors.white.withValues(alpha: .25),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
        ],
      );
    },
  );

  Widget _areaPicker() {
    final areas = patternAreas(c.garment, trackStyle: c.trackStyle);
    final value = areas.any((a) => a.$1 == _area) ? _area : null;
    return Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: const Color(0xcc071420),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withValues(alpha: .18)),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String?>(
          key: const ValueKey('pattern-area'),
          value: value,
          isExpanded: true,
          isDense: true,
          dropdownColor: Palette.surface2,
          iconEnabledColor: Palette.cyan,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(fontSize: 13, color: Palette.text),
          items: [
            const DropdownMenuItem(value: null, child: Text('Whole garment')),
            for (final (area, label) in areas)
              DropdownMenuItem(value: area, child: Text(label)),
          ],
          onChanged: (v) => setState(() => _area = v),
        ),
      ),
    );
  }

  Widget _modes() {
    final picture = c.patternPictureOn(_area);
    final key = _area ?? 'all';
    return FutureBuilder<String?>(
      key: ValueKey('own-colours-$key-${identityHashCode(picture)}'),
      future: picture == null ? Future.value(null) : patternModeOf(picture),
      builder: (context, snap) {
        final mode = picture == null ? null : snap.data;
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (m, text) in const [
              ('full', 'Full colour'),
              ('kit', 'Kit colours'),
            ]) ...[
              if (m == 'kit') const SizedBox(width: 5),
              ActionChipPill(
                text,
                key: ValueKey('own-mode-$key-$m'),
                selected: mode == m,
                onTap: mode == null || mode == m
                    ? null
                    : () async {
                        bool changed;
                        try {
                          changed = await c.setPatternMode(_area, m);
                        } on Object {
                          changed = false;
                        }
                        if (changed && mounted) {
                          showToast(
                            context,
                            'The pattern on the $_areaLabel is now in '
                            '${m == 'full' ? 'full colour' : 'kit colours'}.',
                          );
                        }
                      },
              ),
            ],
          ],
        );
      },
    );
  }

  Widget _upload() => OutlinedButton.icon(
    key: const ValueKey('upload-pattern'),
    onPressed: () => widget.onUpload(_area),
    icon: const Icon(Icons.add, size: 16),
    label: const Text('Upload pattern'),
    style: OutlinedButton.styleFrom(
      foregroundColor: Palette.cyan,
      side: BorderSide(color: Palette.cyan.withValues(alpha: .7)),
      minimumSize: const Size(0, 36),
      padding: const EdgeInsets.symmetric(horizontal: 9),
      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      textStyle: Theme.of(context).textTheme.labelLarge?.copyWith(
        fontSize: 12,
        fontWeight: FontWeight.w600,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
  );

  Widget _bottom() => LayoutBuilder(
    builder: (context, box) => box.maxWidth >= 430
        ? Row(
            children: [
              Expanded(child: _areaPicker()),
              const SizedBox(width: 6),
              _modes(),
              const SizedBox(width: 6),
              _upload(),
            ],
          )
        // A phone: the area and Upload pattern, then the colours.
        : Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: _areaPicker()),
                  const SizedBox(width: 6),
                  _upload(),
                ],
              ),
              const SizedBox(height: 6),
              _modes(),
            ],
          ),
  );

  Widget _more() {
    final picture = c.patternPictureOn(_area);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 10),
        Text(
          picture == null
              ? 'No pattern picture on the $_areaLabel yet. Tap one of your '
                    'patterns to put it there, then choose its colours.'
              : 'Full colour shows the picture\'s own colours; Kit colours '
                    'paints it in your kit\'s colours.',
          key: picture == null ? const ValueKey('own-pattern-tip') : null,
          style: const TextStyle(fontSize: 11, color: Palette.muted),
        ),
        const SizedBox(height: 4),
        Text(
          c.signedIn
              ? 'Your own patterns: PNG, JPG or WebP up to 5 MB, kept with '
                    'your account (website too).'
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
        const SizedBox(height: 8),
        SecondaryButton(
          label: AiService.enabled ? 'GENERATE AI PATTERN' : 'NEXT PANEL STYLE',
          icon: Icons.auto_awesome,
          onPressed: widget.onGenerate,
        ),
        StudioZoneTool(c),
      ],
    );
  }

  Widget _body() => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SizedBox(
        height: 34,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            for (final p in designPatterns)
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ActionChipPill(
                  p,
                  key: ValueKey('pattern-chip-$p'),
                  selected: _nameOn(p),
                  onTap: () => _applyName(p),
                ),
              ),
          ],
        ),
      ),
      const SizedBox(height: 8),
      _grid(),
      const SizedBox(height: 6),
      _bottom(),
      if (widget.more) _more(),
    ],
  );

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      // Held: the thumbnails stay (offstage, in the same place in the tree)
      // so the drag goes on; one line shows instead.
      Offstage(offstage: _dragging, child: _body()),
      if (_dragging)
        const Padding(
          key: ValueKey('pattern-drop-bar'),
          padding: EdgeInsets.symmetric(vertical: 6),
          child: Text(
            'Drop it on a part of the garment · outside cancels',
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12, color: Color(0xffcfeff5)),
          ),
        ),
    ],
  );
}
