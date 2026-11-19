import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../design_document.dart' show studioPatterns;
import '../own_patterns.dart' show isPatternPicture;
import '../part_editing.dart';
import '../project_sync.dart';
import 'flow_ui.dart';
import 'showroom.dart' show ColorWheel;
import 'ui.dart';

const _label = TextStyle(
  fontSize: 10.5,
  letterSpacing: 1.2,
  color: Palette.muted,
  fontWeight: FontWeight.w700,
);
const _note = TextStyle(fontSize: 11.5, color: Palette.muted);

/// Task 9.134: the PART panel under the Studio's 3D, in the Colours panel's
/// look. A tap on one part of the kit (the front, a sleeve, the side panels
/// ...) opens it on that part, and the part list on top switches to another.
/// COLOUR: its own colour, or Follow kit colour. FADE: two colours and a
/// direction. PATTERN: a pattern on this part only, its colour and its
/// opacity. OBJECTS: a logo or text on this part only, cut to its edges.
/// Every change shows on the 3D at once and is one Undo step.
class PartPanel extends StatefulWidget {
  const PartPanel(
    this.c, {
    super.key,
    required this.partKey,
    required this.onPart,
    required this.onDone,
    this.at,
    this.swatches = const [],
    this.pickImage,
    this.patternTab,
  });

  /// Changes each time a tap on the kit's pattern asks for the PATTERN tab
  /// (task 9.137).
  final int? patternTab;
  final AppController c;

  /// The part edited (design.parts key, see part_editing.dart).
  final String partKey;

  /// Another part chosen in the part list (the 3D has lit it up).
  final ValueChanged<String> onPart;
  final VoidCallback onDone;

  /// Where the part was tapped on the kit ({part, side, x, y}, garment
  /// metres): a new logo or text goes there. Null: the part's middle.
  final Map<String, dynamic>? at;

  /// Ready-made colours on the colour wheels (the Studio's).
  final List<Color> swatches;

  /// Picks a logo picture; null: the photo library or camera (tests give
  /// their own).
  final Future<Uint8List?> Function(BuildContext context)? pickImage;

  @override
  State<PartPanel> createState() => _PartPanelState();
}

class _PartPanelState extends State<PartPanel> {
  /// 0 Colour, 1 Fade, 2 Pattern, 3 Objects.
  int _tab = 0;

  /// The fade colour the wheel sets: 0 From, 1 To.
  int _stop = 0;
  bool _dragging = false;
  final _text = TextEditingController();
  final _chip = GlobalKey(), _tabRow = GlobalKey(), _patternChip = GlobalKey();

  AppController get c => widget.c;
  String get _key => widget.partKey;

  @override
  void initState() {
    super.initState();
    _showChip();
  }

  @override
  void didUpdateWidget(PartPanel old) {
    super.didUpdateWidget(old);
    if (widget.patternTab != old.patternTab &&
        widget.patternTab != null &&
        !partColourOnly(widget.partKey)) {
      _tab = 2;
      _dragging = false;
      _showTab();
    }
    if (old.partKey == widget.partKey) return;
    _stop = 0;
    _dragging = false;
    if (partColourOnly(widget.partKey)) _tab = 0;
    _showChip();
    if (_tab == 2) _showTab();
  }

  /// A tab just opened shows from its top, never scrolled past (the panel
  /// may be scrolled down from the last tab); the Pattern tab also scrolls
  /// its chosen pattern into view (it may be at the end of its row).
  void _showTab() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (!mounted) return;
    final tabs = _tabRow.currentContext, chosen = _patternChip.currentContext;
    if (tabs != null) {
      Scrollable.ensureVisible(
        tabs,
        alignmentPolicy: ScrollPositionAlignmentPolicy.keepVisibleAtStart,
      );
    }
    if (_tab == 2 && chosen != null) {
      Scrollable.ensureVisible(
        chosen,
        alignment: .5,
        duration: const Duration(milliseconds: 200),
      );
    }
  });

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  /// The part's chip scrolled into view (a part tapped on the kit may be at
  /// the end of the list).
  void _showChip() => WidgetsBinding.instance.addPostFrameCallback((_) {
    final chip = _chip.currentContext;
    if (!mounted || chip == null) return;
    Scrollable.ensureVisible(
      chip,
      alignment: .5,
      duration: const Duration(milliseconds: 200),
    );
  });

  /// One undo step per change; a wheel or slider drag ([live]) is one step:
  /// its first change is recorded, the rest follow live.
  void _change(PartStyle Function(PartStyle style) apply, {bool live = false}) {
    final next = apply(c.partStyleOf(_key));
    if (live && _dragging) {
      c.setPartStyle(_key, next, record: false);
    } else {
      _dragging = live;
      c.setPartStyle(_key, next);
    }
  }

  @override
  Widget build(BuildContext context) {
    final parts = partsOf(c.garment);
    final style = c.partStyleOf(_key);
    final colourOnly = partColourOnly(_key);
    final tab = colourOnly ? 0 : _tab;
    return Column(
      key: const ValueKey('part-panel'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _partList(parts),
        const SizedBox(height: 8),
        if (!parts.contains(_key))
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              'The ${c.garmentLabel.toLowerCase()} has no '
              '${partLabel(_key).toLowerCase()}: choose a part above.',
              style: _note,
            ),
          )
        else ...[
          if (colourOnly)
            Text(
              'The ${partLabel(_key).toLowerCase()} is a rib of its own: it '
              'takes a colour.',
              style: _note,
            )
          else
            _tabs(tab),
          const SizedBox(height: 8),
          switch (tab) {
            0 => _colourTab(style),
            1 => _fadeTab(style),
            2 => _patternTab(style),
            _ => _objectsTab(),
          },
        ],
      ],
    );
  }

  // ---------- the part list and the tabs
  /// The garment's parts in one row (it scrolls sideways, fading at the edge,
  /// when they are more than fit).
  Widget _partList(List<String> parts) => SizedBox(
    key: const ValueKey('part-list'),
    height: 36,
    child: _ChipStrip(
      children: [
        for (final key in parts)
          KeyedSubtree(
            key: key == _key ? _chip : null,
            child: Semantics(
              selected: key == _key,
              child: ActionChipPill(
                partLabel(key),
                key: ValueKey('part-chip-$key'),
                selected: key == _key,
                // Parts with a look or objects of their own.
                icon: c.partChanged(key) ? Icons.edit : null,
                onTap: key == _key
                    ? null
                    : () {
                        FocusManager.instance.primaryFocus?.unfocus();
                        c.showPart(key);
                        widget.onPart(key);
                      },
              ),
            ),
          ),
      ],
    ),
  );

  Widget _tabs(int tab) => Container(
    key: _tabRow,
    padding: const EdgeInsets.all(3),
    decoration: BoxDecoration(
      color: Palette.bg,
      borderRadius: BorderRadius.circular(24),
      border: Border.all(color: Palette.border),
    ),
    child: Row(
      children: [
        for (final (i, label) in const [
          'Colour',
          'Fade',
          'Pattern',
          'Objects',
        ].indexed)
          Expanded(
            child: Semantics(
              button: true,
              selected: tab == i,
              child: GestureDetector(
                key: ValueKey('part-tab-$i'),
                onTap: () {
                  setState(() {
                    _tab = i;
                    _dragging = false;
                  });
                  _showTab();
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: tab == i ? Palette.cyan : Colors.transparent,
                      width: 1.5,
                    ),
                    boxShadow: tab == i
                        ? [
                            BoxShadow(
                              color: Palette.cyan.withValues(alpha: .4),
                              blurRadius: 10,
                            ),
                          ]
                        : null,
                    color: tab == i ? const Color(0xff05202d) : null,
                  ),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      label.toUpperCase(),
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 10.5,
                        letterSpacing: .8,
                        fontWeight: FontWeight.w700,
                        color: tab == i ? Palette.cyan : Palette.muted,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    ),
  );

  /// The compact colour wheel (as the Colours panel's) with Done beside its
  /// colours; [apply] makes the part's look from the colour.
  Widget _wheel(
    String id,
    Color colour,
    PartStyle Function(PartStyle style, Color v) apply,
  ) => ColorWheel(
    key: ValueKey('part-wheel-$_key-$id'),
    compact: true,
    color: colour,
    swatches: widget.swatches,
    onChanged: (v) => _change((s) => apply(s, v), live: true),
    onDone: (_) => _dragging = false,
    trailing: _done(),
  );

  Widget _done() => FilledButton(
    key: const ValueKey('part-done'),
    onPressed: widget.onDone,
    style: FilledButton.styleFrom(
      backgroundColor: Palette.cyan,
      foregroundColor: Colors.black,
      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      minimumSize: const Size(76, 34),
      padding: const EdgeInsets.symmetric(horizontal: 18),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    child: const Text(
      'Done',
      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
    ),
  );

  /// "Follow kit colour" and its like: on (ticked) while the part follows
  /// the kit; a tap takes it back to the kit.
  Widget _follow(
    Key key,
    String label,
    bool on,
    String detail,
    VoidCallback back,
  ) => Row(
    children: [
      Semantics(
        selected: on,
        child: ActionChipPill(
          label,
          key: key,
          selected: on,
          icon: on ? Icons.check : null,
          onTap: on ? null : back,
        ),
      ),
      const SizedBox(width: 10),
      Expanded(
        child: Text(
          detail,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: _note,
        ),
      ),
    ],
  );

  // ---------- COLOUR
  Widget _colourTab(PartStyle style) {
    final own = style.colour;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _follow(
          const ValueKey('part-follow'),
          'Follow kit colour',
          own == null,
          own == null
              ? 'Pick a colour to give it its own.'
              : 'Its own colour · ${own.toUpperCase()}',
          () => _change((s) => s.copyWith(colour: null)),
        ),
        const SizedBox(height: 8),
        _wheel(
          'colour',
          c.partColour(_key),
          (s, v) => s.copyWith(colour: ProjectSync.hex(v)),
        ),
      ],
    );
  }

  // ---------- FADE
  /// A first fade starts in a kit colour that stands out on the part.
  Color _fadeStart(Color base) => base.toARGB32() == c.secondaryColor.toARGB32()
      ? c.mainColor
      : c.secondaryColor;

  Widget _fadeTab(PartStyle style) {
    final fade = style.fade;
    final base = c.partColour(_key);
    final from = fade == null ? _fadeStart(base) : ProjectSync.color(fade.from);
    final to = fade?.to == null ? null : ProjectSync.color(fade!.to);
    PartFade made(PartStyle s) =>
        s.fade ?? PartFade(from: ProjectSync.hex(_fadeStart(base)));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            _stopSwatch(0, 'From', from, base),
            const SizedBox(width: 8),
            _stopSwatch(1, 'To', to, base),
            const SizedBox(width: 8),
            Semantics(
              selected: fade != null && to == null,
              child: ActionChipPill(
                'Fade out',
                key: const ValueKey('part-fade-out'),
                selected: fade != null && to == null,
                onTap: () {
                  setState(() => _stop = 0);
                  _change((s) => s.copyWith(fade: made(s).copyWith(to: null)));
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            const Text('DIRECTION', style: _label),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                fade == null
                    ? 'No fade yet: pick a direction or a colour.'
                    : fade.directionName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: _note,
              ),
            ),
          ],
        ),
        Row(
          children: [
            for (final (angle, name, icon) in PartFade.directions)
              IconButton(
                key: ValueKey('part-fade-dir-$angle'),
                tooltip: name,
                visualDensity: VisualDensity.compact,
                isSelected: fade != null && fade.angle % 360 == angle,
                color: Palette.muted,
                selectedIcon: Icon(icon, color: Palette.cyan),
                style: IconButton.styleFrom(
                  backgroundColor: fade != null && fade.angle % 360 == angle
                      ? Palette.cyan.withValues(alpha: .16)
                      : null,
                ),
                icon: Icon(icon),
                onPressed: () => _change(
                  (s) => s.copyWith(
                    fade: made(s).copyWith(angle: angle.toDouble()),
                  ),
                ),
              ),
            const Spacer(),
            if (fade != null)
              IconButton(
                key: const ValueKey('part-fade-off'),
                tooltip: 'Remove fade',
                visualDensity: VisualDensity.compact,
                color: Palette.muted,
                icon: const Icon(Icons.delete_outline, size: 20),
                onPressed: () {
                  setState(() => _stop = 0);
                  _change((s) => s.copyWith(fade: null));
                },
              ),
          ],
        ),
        const SizedBox(height: 4),
        _wheel(
          'fade-$_stop',
          _stop == 0 ? from : to ?? base,
          (s, v) => s.copyWith(
            fade: _stop == 0
                ? made(s).copyWith(from: ProjectSync.hex(v))
                : made(s).copyWith(to: ProjectSync.hex(v)),
          ),
        ),
      ],
    );
  }

  /// A fade colour; the wheel sets the one chosen. [colour] null: it fades
  /// out into [under].
  Widget _stopSwatch(int stop, String label, Color? colour, Color under) {
    final on = _stop == stop;
    return Expanded(
      child: Semantics(
        button: true,
        selected: on,
        label: 'Fade $label',
        child: GestureDetector(
          key: ValueKey('part-fade-${label.toLowerCase()}'),
          onTap: () => setState(() {
            _stop = stop;
            _dragging = false;
          }),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label.toUpperCase(), style: _label),
              const SizedBox(height: 4),
              Container(
                height: 30,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: colour,
                  gradient: colour == null
                      ? LinearGradient(
                          colors: [under, under.withValues(alpha: 0)],
                        )
                      : null,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: on ? Palette.cyan : Palette.border,
                    width: on ? 2 : 1,
                  ),
                ),
                child: colour == null
                    ? const Text(
                        'FADE OUT',
                        style: TextStyle(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1,
                          color: Palette.text,
                          shadows: [Shadow(blurRadius: 3)],
                        ),
                      )
                    : null,
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ---------- PATTERN
  /// As the website's: the kit's pattern (its opacity on this part), no
  /// pattern, or one of its own with its colour and opacity.
  Widget _patternTab(PartStyle style) {
    final own = style.pattern;
    final none = own == null && style.patternOpacity == 0;
    final opacity = style.patternOpacity ?? 1;
    final ink = style.patternColour == null
        ? c.kitPatternColour
        : ProjectSync.color(style.patternColour);
    final kitPattern =
        (c.pattern != 'Solid' && c.pattern != 'None') ||
        c.patternTile != null ||
        c.zones.values.any((z) => z != 'None');
    Widget choice(
      String label,
      String id,
      bool on,
      PartStyle Function(PartStyle s) apply,
    ) => KeyedSubtree(
      // The chosen one scrolls into view when the tab opens.
      key: on ? _patternChip : null,
      child: Semantics(
        selected: on,
        child: ActionChipPill(
          label,
          key: ValueKey('part-pattern-$id'),
          selected: on,
          onTap: () => _change(apply),
        ),
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 36,
          child: _ChipStrip(
            children: [
              choice(
                'Kit pattern',
                'kit',
                own == null && !none,
                (s) => s.copyWith(pattern: null, patternOpacity: null),
              ),
              choice(
                'No pattern',
                'none',
                none,
                (s) => s.copyWith(pattern: null, patternOpacity: 0.0),
              ),
              // One of My patterns (or Solid), put on this part on the
              // website.
              if (own != null &&
                  (own == 'Solid' || !studioPatterns.contains(own)))
                choice(
                  isPatternPicture(own) ? 'My pattern' : own,
                  'own',
                  true,
                  (s) => s,
                ),
              for (final pattern in studioPatterns)
                if (pattern != 'Solid')
                  choice(
                    pattern,
                    pattern,
                    own == pattern,
                    (s) => s.copyWith(
                      pattern: pattern,
                      patternOpacity: s.pattern == null
                          ? null
                          : s.patternOpacity,
                    ),
                  ),
            ],
          ),
        ),
        if (own == null && !none && !kitPattern)
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text(
              'The kit has no pattern: choose one for this part.',
              style: _note,
            ),
          ),
        if (!none) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              Text(
                own == null ? 'KIT PATTERN HERE' : 'PATTERN OPACITY',
                style: _label,
              ),
              const SizedBox(width: 6),
              const Expanded(
                child: Text(
                  'lower is more see-through',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 10.5, color: Palette.muted),
                ),
              ),
              Text('${(opacity * 100).round()}%', style: _label),
            ],
          ),
          SizedBox(
            height: 30,
            child: Slider(
              key: const ValueKey('part-pattern-opacity'),
              value: opacity.toDouble(),
              divisions: 20,
              activeColor: Palette.cyan,
              semanticFormatterCallback: (v) =>
                  'Pattern opacity ${(v * 100).round()}%',
              onChangeStart: (_) => _dragging = false,
              onChanged: (v) =>
                  _change((s) => s.copyWith(patternOpacity: v), live: true),
              onChangeEnd: (_) => _dragging = false,
            ),
          ),
        ],
        const SizedBox(height: 4),
        if (own != null) ...[
          _follow(
            const ValueKey('part-pattern-colour-kit'),
            'Kit pattern colour',
            style.patternColour == null,
            style.patternColour == null
                ? 'Pick a colour for the pattern on this part.'
                : 'Pattern colour · ${style.patternColour!.toUpperCase()}',
            () => _change((s) => s.copyWith(patternColour: null)),
          ),
          const SizedBox(height: 8),
          _wheel(
            'pattern',
            ink,
            (s, v) => s.copyWith(patternColour: ProjectSync.hex(v)),
          ),
        ] else
          Row(
            children: [
              const Expanded(
                child: Text(
                  'A pattern of its own on this part takes its own colour.',
                  style: TextStyle(fontSize: 11, color: Palette.muted),
                ),
              ),
              _done(),
            ],
          ),
      ],
    );
  }

  // ---------- OBJECTS
  bool _room() {
    if (c.layers.length < 40) return true;
    showToast(context, 'A design supports up to 40 artwork layers.');
    return false;
  }

  Future<void> _addLogo() async {
    final pick = widget.pickImage ?? pickPhoto;
    final bytes = await pick(context);
    if (bytes == null || !mounted) return;
    if (!c.logos.any((logo) => identical(logo, bytes))) c.logos.add(bytes);
    _placeLogo(bytes);
  }

  void _placeLogo(Uint8List bytes) {
    final src = ProjectSync.dataUrl(bytes);
    if (src == null) {
      showToast(context, 'Choose a PNG, JPEG or WebP image.');
      return;
    }
    if (src.length > 4000000) {
      showToast(context, 'Choose a smaller image (under 3 MB).');
      return;
    }
    if (!_room()) return;
    c.addPartObject(_key, {
      'type': 'image',
      'name': 'Logo',
      'src': src,
    }, at: widget.at);
  }

  void _addText() {
    final text = _text.text.trim();
    if (text.isEmpty) {
      showToast(context, 'Type the text to put on this part.');
      return;
    }
    if (!_room()) return;
    // In capitals and the kit's Accent, as the website's Parts panel.
    c.addPartObject(_key, {
      'type': 'text',
      'name': 'Text on the ${partLabel(_key).toLowerCase()}',
      'text': text.toUpperCase(),
      'color': ProjectSync.hex(c.accentColor),
    }, at: widget.at);
    _text.clear();
    FocusManager.instance.primaryFocus?.unfocus();
  }

  Widget _tile({
    required Key key,
    required VoidCallback onTap,
    required Widget child,
    String? label,
  }) => Padding(
    key: key,
    padding: const EdgeInsets.only(right: 8),
    child: SizedBox(
      width: 60,
      child: Semantics(
        button: true,
        label: label,
        child: GlowCard(radius: 10, glow: false, onTap: onTap, child: child),
      ),
    ),
  );

  Widget _objectsTab() {
    final objects = c.partObjects(_key);
    final name = partLabel(_key).toLowerCase();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (objects.isEmpty)
          Text(
            'A logo or text added here shows on the $name only, cut to its '
            'edges.',
            style: _note,
          )
        else
          for (final object in objects) _object(object),
        const SizedBox(height: 8),
        SizedBox(
          height: 60,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              _tile(
                key: const ValueKey('part-add-logo'),
                label: 'Add a logo to the $name',
                onTap: _addLogo,
                child: const Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.add, color: Palette.cyan, size: 20),
                    Text(
                      'Add logo',
                      style: TextStyle(fontSize: 10, color: Palette.cyan),
                    ),
                  ],
                ),
              ),
              // The logos used in this visit, one tap to put one here.
              for (final (i, logo) in c.logos.reversed.indexed)
                _tile(
                  key: ValueKey('part-logo-$i'),
                  label: 'Put this logo on the $name',
                  onTap: () => _placeLogo(logo),
                  child: Padding(
                    padding: const EdgeInsets.all(4),
                    child: artImage(bytes: logo, fit: BoxFit.contain),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextField(
                key: const ValueKey('part-text'),
                controller: _text,
                maxLength: 40,
                textCapitalization: TextCapitalization.characters,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _addText(),
                style: const TextStyle(fontSize: 13),
                decoration: const InputDecoration(
                  isDense: true,
                  counterText: '',
                  hintText: 'Text on this part',
                  contentPadding: EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              key: const ValueKey('part-add-text'),
              tooltip: 'Add text',
              onPressed: _addText,
              style: IconButton.styleFrom(
                backgroundColor: Palette.cyan,
                foregroundColor: Colors.black,
              ),
              icon: const Icon(Icons.add, size: 20),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            const Expanded(
              child: Text(
                'Move or resize it on the 2D panels.',
                style: TextStyle(fontSize: 11, color: Palette.muted),
              ),
            ),
            _done(),
          ],
        ),
      ],
    );
  }

  /// An object on this part: its name, its opacity, its colour (text and
  /// shapes) and Remove.
  Widget _object(Map<String, dynamic> object) {
    final id = '${object['id']}';
    final opacity = ((object['opacity'] as num?) ?? 1).toDouble().clamp(
      0.1,
      1.0,
    );
    final selected = c.selectedLayerId == id;
    final type = object['type'];
    return Container(
      key: ValueKey('part-object-$id'),
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.fromLTRB(10, 2, 2, 4),
      decoration: BoxDecoration(
        color: Palette.bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: selected ? Palette.cyan : Palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                switch (type) {
                  'text' => Icons.text_fields,
                  'shape' => Icons.category_outlined,
                  _ => Icons.image_outlined,
                },
                size: 16,
                color: Palette.cyan,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: GestureDetector(
                  onTap: () => c.selectLayer(id),
                  child: Text(
                    '${object['text'] ?? object['name'] ?? object['shape'] ?? 'Logo'}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5),
                  ),
                ),
              ),
              Text('${(opacity * 100).round()}%', style: _label),
              IconButton(
                key: ValueKey('part-object-delete-$id'),
                tooltip: 'Remove from this part',
                visualDensity: VisualDensity.compact,
                color: Palette.muted,
                icon: const Icon(Icons.delete_outline, size: 19),
                onPressed: () => c.removeLayer(id),
              ),
            ],
          ),
          SizedBox(
            height: 26,
            child: Slider(
              key: ValueKey('part-object-opacity-$id'),
              min: .1,
              divisions: 18,
              value: opacity,
              activeColor: Palette.cyan,
              semanticFormatterCallback: (v) => 'Opacity ${(v * 100).round()}%',
              onChangeStart: (_) => c.edit(() {}),
              onChanged: (v) =>
                  c.changeLayer(id, {'opacity': v}, record: false),
            ),
          ),
          if (type == 'text' || type == 'shape')
            Row(
              children: [
                for (final colour in {
                  Colors.white,
                  Colors.black,
                  c.mainColor,
                  c.secondaryColor,
                  c.accentColor,
                })
                  IconButton(
                    tooltip: 'Colour ${ProjectSync.hex(colour)}',
                    visualDensity: VisualDensity.compact,
                    icon: Icon(
                      object['color'] == ProjectSync.hex(colour)
                          ? Icons.check_circle
                          : Icons.circle,
                      color: colour,
                      size: 20,
                    ),
                    onPressed: () =>
                        c.changeLayer(id, {'color': ProjectSync.hex(colour)}),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

/// A row of chips that scrolls sideways, fading at its right edge (as
/// ChipRow), every chip built at once so the chosen one can be scrolled to.
class _ChipStrip extends StatelessWidget {
  const _ChipStrip({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => ShaderMask(
    blendMode: BlendMode.dstIn,
    shaderCallback: (rect) => LinearGradient(
      colors: [Colors.white, Colors.white, Colors.white.withValues(alpha: 0)],
      stops: [0, ((rect.width - 30) / rect.width).clamp(0, 1), 1],
    ).createShader(rect),
    child: SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      // Room to scroll the last chip clear of the fade.
      padding: const EdgeInsets.only(right: 30),
      child: Row(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            children[i],
          ],
        ],
      ),
    ),
  );
}

/// The Part panel's header action: the part back to the kit (its own look
/// and its objects go), one Undo step; greyed while it follows the kit.
class PartResetAction extends StatelessWidget {
  const PartResetAction(this.c, this.partKey, {super.key});
  final AppController c;
  final String partKey;

  @override
  Widget build(BuildContext context) {
    final on = c.partChanged(partKey);
    final colour = on ? Palette.cyan : Palette.border;
    return Semantics(
      button: true,
      enabled: on,
      child: InkWell(
        key: const ValueKey('part-reset'),
        borderRadius: BorderRadius.circular(10),
        onTap: on ? () => c.resetPart(partKey) : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.restart_alt, size: 16, color: colour),
              const SizedBox(width: 5),
              Flexible(
                child: Text(
                  'Reset part',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: colour,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
