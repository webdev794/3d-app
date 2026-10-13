import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../ai_service.dart';
import '../app_controller.dart';
import '../export_service.dart';
import '../widgets/flow_ui.dart';
import '../widgets/kit_viewer_3d.dart';
import '../widgets/showroom.dart';
import '../widgets/ui.dart';
import 'create_home.dart' show comingSoonGarments, garmentTiles;

const _swatches = <Color>[
  Color(0xff0b1016),
  Color(0xffeaf7ff),
  Color(0xff9aa6b2),
  Color(0xff10233f),
  Color(0xff157cdd),
  Color(0xff00c2cc),
  Color(0xffe92137),
  Color(0xffff7a0a),
  Color(0xffffc52f),
  Color(0xff169f67),
  Color(0xff8155c8),
  Color(0xffea4aab),
];

/// 10 · Design Studio: live 3D kit, tools, AI assist.
class DesignStudioScreen extends StatefulWidget {
  const DesignStudioScreen(this.c, {super.key});
  final AppController c;
  @override
  State<DesignStudioScreen> createState() => _DesignStudioScreenState();
}

class _DesignStudioScreenState extends State<DesignStudioScreen> {
  final _prompt = TextEditingController();
  String? _busy;

  /// A reference image attached to the next request.
  Uint8List? _askImage;
  bool _preview = false;

  AppController get c => widget.c;
  bool get _live3d => c.show3d && KitViewer3D.supported;

  @override
  void dispose() {
    _prompt.dispose();
    super.dispose();
  }

  // ---------- AI
  Future<void> _ask(String change) async {
    if (!AiService.enabled) return _offline(change);
    setState(() => _busy = 'Updating your design…');
    final image = _askImage;
    setState(() => _askImage = null);
    try {
      final reply = await c.askAi(change, image: image);
      if (!mounted) return;
      showToast(context, reply);
      // Keep the photoreal render in step, in the background.
      final base = c.renderFront, current = c.spec;
      if (base != null && current != null) {
        setState(() => _busy = 'Refreshing AI render…');
        final spec = DesignSpec(
          designName: current.designName,
          detected: current.detected,
          summary: current.summary,
          findings: current.findings,
          mainColor: c.mainColor,
          secondaryColor: c.secondaryColor,
          accentColor: c.accentColor,
          pattern: c.pattern,
          fabric: c.fabric,
          logoText: c.logoText,
          renderPrompt:
              '${current.renderPrompt} Then apply this change: $change.',
          patternMotif: current.patternMotif,
          sport: current.sport,
          garment: current.garment,
        );
        final image = await c.ai.reviseRender(base, spec);
        if (!mounted) return;
        c.update(() {
          c.renderFront = image;
          c.renderBack = null;
          c.artwork.add(image);
        });
      }
    } on AiException catch (e) {
      if (mounted) showToast(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  /// Without an API key: simple local interpretations of common requests.
  void _offline(String change) {
    final lower = change.toLowerCase();
    const named = {
      'black': Color(0xff0b1016),
      'white': Color(0xffeaf7ff),
      'red': Color(0xffe92137),
      'blue': Color(0xff157cdd),
      'navy': Color(0xff10233f),
      'gold': Color(0xffffc52f),
      'yellow': Color(0xffffc52f),
      'green': Color(0xff169f67),
      'purple': Color(0xff8155c8),
      'pink': Color(0xffea4aab),
      'orange': Color(0xffff7a0a),
      'teal': Color(0xff00c2cc),
      'cyan': Color(0xff00c2cc),
    };
    final hit = named.entries.where((e) => lower.contains(e.key)).toList();
    c.edit(() {
      if (lower.contains('collar') && hit.isNotEmpty) {
        c.secondaryColor = hit.first.value;
      } else if (hit.isNotEmpty) {
        c.mainColor = hit.first.value;
        if (hit.length > 1) c.secondaryColor = hit[1].value;
      }
      if (lower.contains('stripe')) c.pattern = 'Stripes';
      if (lower.contains('chevron')) c.pattern = 'Chevron';
      if (lower.contains('plain') || lower.contains('solid'))
        c.pattern = 'Solid';
    });
    showToast(context, 'Design updated (demo mode).');
  }

  Future<void> _newPattern() async {
    if (!AiService.enabled) {
      const order = ['Velocity', 'Chevron', 'Stripes', 'Solid'];
      c.edit(() => c.pattern = order[(order.indexOf(c.pattern) + 1) % 4]);
      return;
    }
    setState(() => _busy = 'Designing a new pattern…');
    try {
      final tile = await c.ai.generatePattern(
        c.spec?.patternMotif.isNotEmpty == true
            ? c.spec!.patternMotif
            : 'bold geometric ${c.pattern.toLowerCase()} motif for ${c.sport}',
      );
      if (!mounted) return;
      c.aiPatterns.add(tile);
      c.edit(() => c.patternTile = tile);
      showToast(context, 'New AI pattern applied.');
    } on AiException catch (e) {
      if (mounted) showToast(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _addSponsor() async {
    final bytes = await pickPhoto(context);
    if (bytes == null) return;
    c.logos.add(bytes);
    c.edit(() => c.sponsorImage = bytes);
    if (mounted) showToast(context, 'Sponsor placed on the front.');
  }

  Future<void> _addLogo() async {
    final bytes = await pickPhoto(context);
    if (bytes == null) return;
    c.logos.add(bytes);
    c.edit(() => c.logoImage = bytes);
    if (mounted) showToast(context, 'Logo placed on the chest.');
  }

  void _send() {
    final text = _prompt.text.trim();
    if (text.isEmpty) {
      showToast(context, 'Describe a change, e.g. "make the collar gold".');
      return;
    }
    _prompt.clear();
    FocusScope.of(context).unfocus();
    _ask(text);
  }

  Future<void> _leave(AppScreen next) async {
    if (_live3d) {
      setState(() => _busy = 'Capturing your kit…');
      await c.captureViews();
      if (!mounted) return;
      setState(() => _busy = null);
    }
    c.go(next);
  }

  // ---------- layout
  @override
  Widget build(BuildContext context) {
    final stage = Stack(
      children: [
        Positioned.fill(
          child: _live3d
              ? KitViewer3D(controller: c, height: double.infinity)
              : c.renderFront != null && !c.show3d
              ? Padding(
                  padding: const EdgeInsets.all(12),
                  child: artImage(
                    bytes: c.currentRender ?? c.renderFront,
                    fit: BoxFit.contain,
                  ),
                )
              : KitPreview(controller: c, height: double.infinity),
        ),
        if (!_preview)
          Positioned(
            left: 10,
            top: 10,
            child: Column(
              children: [
                for (final (view, icon) in const [
                  ('Front', Icons.checkroom),
                  ('Side', Icons.view_sidebar_outlined),
                  ('Back', Icons.flip_outlined),
                ]) ...[
                  _ViewTile(
                    label: view,
                    icon: icon,
                    selected: c.view == view,
                    onTap: () async {
                      final error = await c.showView(view);
                      if (error != null && context.mounted) {
                        showToast(context, error);
                      }
                    },
                  ),
                  const SizedBox(height: 8),
                ],
              ],
            ),
          ),
        if (!_preview && c.renderFront != null && KitViewer3D.supported)
          Positioned(
            right: 10,
            top: 10,
            child: _ModeSwitch(
              show3d: c.show3d,
              onChanged: (v) => c.update(() {
                c.show3d = v;
                if (!v && c.view == 'Side') c.view = 'Front';
              }),
            ),
          ),
        if (_busy != null || c.renderingBack || c.printBusy)
          Positioned(
            bottom: 12,
            left: 0,
            right: 0,
            child: Center(
              child: BusyBadge(
                _busy ??
                    (c.printBusy
                        ? 'Creating AI print…'
                        : 'Rendering back view…'),
              ),
            ),
          ),
      ],
    );

    return Column(
      children: [
        _StudioBar(
          c: c,
          preview: _preview,
          onBack: c.back,
          onPreview: () => setState(() => _preview = !_preview),
          onSave: () => _leave(AppScreen.saveProject),
          onShowcase: () => _leave(AppScreen.showcase),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: stage,
            ),
          ),
        ),
        if (!_preview) ...[
          const SizedBox(height: 10),
          _ToolTabs(onTap: _openTool),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
            child: Container(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 0),
              decoration: BoxDecoration(
                color: Palette.surface,
                borderRadius: BorderRadius.circular(28),
                border: Border.all(
                  color: Palette.cyan.withValues(alpha: .75),
                  width: 2,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Palette.cyan.withValues(alpha: .28),
                    blurRadius: 16,
                  ),
                ],
              ),
              child: Row(
                children: [
                  IconButton(
                    tooltip: 'Attach a reference image',
                    onPressed: _busy != null
                        ? null
                        : () async {
                            final image = await pickPhoto(context);
                            if (image != null && mounted)
                              setState(() => _askImage = image);
                          },
                    icon: _askImage == null
                        ? const Icon(
                            Icons.add_photo_alternate_outlined,
                            size: 20,
                            color: Palette.cyan,
                          )
                        : ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: Image.memory(
                              _askImage!,
                              width: 26,
                              height: 26,
                              fit: BoxFit.cover,
                            ),
                          ),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _prompt,
                      enabled: _busy == null,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      style: const TextStyle(fontSize: 13),
                      decoration: const InputDecoration(
                        hintText: 'Ask 3DEEZI to change anything…',
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        disabledBorder: InputBorder.none,
                        filled: false,
                        contentPadding: EdgeInsets.symmetric(vertical: 13),
                      ),
                    ),
                  ),
                  IconButton.filled(
                    tooltip: 'Send',
                    onPressed: _busy == null ? _send : null,
                    style: IconButton.styleFrom(
                      backgroundColor: Palette.cyan,
                      foregroundColor: Colors.black,
                    ),
                    icon: const Icon(Icons.send_rounded, size: 18),
                  ),
                ],
              ),
            ),
          ),
          SizedBox(
            height: 46,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
              children: [
                for (final (label, action) in [
                  ('Make it black', () => _ask('Make the main colour black')),
                  ('Add pattern', _newPattern),
                  (
                    'Change collar',
                    () => _ask('Change the collar to a contrasting colour'),
                  ),
                  ('Add logo', _addLogo),
                ]) ...[
                  ActionChipPill(label, onTap: _busy == null ? action : null),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
          const SizedBox(height: 6),
        ],
      ],
    );
  }

  void _openTool(String tool) => showModalBottomSheet<void>(
    context: context,
    backgroundColor: Palette.surface,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (sheet) => AnimatedBuilder(
      animation: c,
      builder: (context, _) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          0,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: switch (tool) {
            'Colours' => _ColoursTool(c),
            'Patterns' => _PatternsTool(
              c,
              onGenerate: () {
                Navigator.pop(sheet);
                _newPattern();
              },
            ),
            'Logos' => _LogosTool(
              c,
              onSponsor: () {
                Navigator.pop(sheet);
                _addSponsor();
              },
              onUpload: () {
                Navigator.pop(sheet);
                _addLogo();
              },
            ),
            'Text' => _TextTool(c),
            _ => _GarmentTool(c),
          },
        ),
      ),
    ),
  );
}

class _StudioBar extends StatelessWidget {
  const _StudioBar({
    required this.c,
    required this.preview,
    required this.onBack,
    required this.onPreview,
    required this.onSave,
    required this.onShowcase,
  });
  final AppController c;
  final bool preview;
  final VoidCallback onBack, onPreview, onSave, onShowcase;

  Widget _action(String label, IconData icon, VoidCallback? onTap) => InkWell(
    borderRadius: BorderRadius.circular(10),
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 20,
            color: onTap == null ? Palette.border : Palette.text,
          ),
          Text(
            label,
            style: TextStyle(
              fontSize: 9.5,
              color: onTap == null ? Palette.border : Palette.muted,
            ),
          ),
        ],
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 6, 8, 8),
    child: Row(
      children: [
        IconButton(
          tooltip: 'Back',
          onPressed: onBack,
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 19),
        ),
        const Spacer(),
        _action('Undo', Icons.undo_rounded, c.canUndo ? c.undo : null),
        _action('Redo', Icons.redo_rounded, c.canRedo ? c.redo : null),
        const Spacer(),
        _action(
          preview ? 'Done' : 'Preview',
          preview ? Icons.fullscreen_exit : Icons.fullscreen,
          onPreview,
        ),
        _action('Showcase', Icons.auto_awesome, onShowcase),
        _action('Save', Icons.bookmark_add_outlined, onSave),
      ],
    ),
  );
}

class _ViewTile extends StatelessWidget {
  const _ViewTile({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
    color: Palette.bg.withValues(alpha: .75),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(10),
      side: BorderSide(color: selected ? Palette.cyan : Palette.border),
    ),
    child: InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: SizedBox(
        width: 48,
        height: 50,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 19,
              color: selected ? Palette.cyan : Palette.muted,
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 9,
                color: selected ? Palette.cyan : Palette.muted,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _ModeSwitch extends StatelessWidget {
  const _ModeSwitch({required this.show3d, required this.onChanged});
  final bool show3d;
  final ValueChanged<bool> onChanged;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(3),
    decoration: BoxDecoration(
      color: Palette.bg.withValues(alpha: .8),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: Palette.border),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final (label, value) in const [('3D', true), ('AI render', false)])
          GestureDetector(
            onTap: () => onChanged(value),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
              decoration: BoxDecoration(
                color: show3d == value ? Palette.cyan : Colors.transparent,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  color: show3d == value ? Colors.black : Palette.muted,
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

class _ToolTabs extends StatelessWidget {
  const _ToolTabs({required this.onTap});
  final ValueChanged<String> onTap;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 12),
    child: Row(
      children: [
        for (final (label, icon) in const [
          ('Colours', Icons.palette_outlined),
          ('Patterns', Icons.grid_view_rounded),
          ('Logos', Icons.shield_outlined),
          ('Text', Icons.text_fields_rounded),
          ('Garment', Icons.checkroom_outlined),
        ])
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => onTap(label),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(
                  children: [
                    Icon(icon, size: 22, color: Palette.cyan),
                    const SizedBox(height: 4),
                    Text(
                      label,
                      style: const TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

// ---------- tool sheets
class _SheetTitle extends StatelessWidget {
  const _SheetTitle(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: ScreenTitle(text, size: 20, align: TextAlign.left),
  );
}

class _ColoursTool extends StatefulWidget {
  const _ColoursTool(this.c);
  final AppController c;
  @override
  State<_ColoursTool> createState() => _ColoursToolState();
}

class _ColoursToolState extends State<_ColoursTool> {
  int _slot = 0;
  bool _dragging = false;
  AppController get c => widget.c;

  Color get _current => [c.mainColor, c.secondaryColor, c.accentColor][_slot];
  void _set(Color v) => switch (_slot) {
    0 => c.mainColor = v,
    1 => c.secondaryColor = v,
    _ => c.accentColor = v,
  };

  /// The first change of a drag is one undo step; the rest follow live.
  void _change(Color v) {
    if (_dragging) {
      c.update(() => _set(v));
    } else {
      _dragging = true;
      c.edit(() => _set(v));
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const _SheetTitle('Colours'),
      Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: Palette.bg,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Palette.border),
        ),
        child: Row(
          children: [
            for (final (i, label) in const [
              'Primary',
              'Secondary',
              'Accent',
            ].indexed)
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _slot = i),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: _slot == i ? Palette.cyan : Colors.transparent,
                        width: 1.5,
                      ),
                      boxShadow: _slot == i
                          ? [
                              BoxShadow(
                                color: Palette.cyan.withValues(alpha: .4),
                                blurRadius: 10,
                              ),
                            ]
                          : null,
                      color: _slot == i ? const Color(0xff05202d) : null,
                    ),
                    child: Text(
                      label.toUpperCase(),
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 11,
                        letterSpacing: .8,
                        fontWeight: FontWeight.w700,
                        color: _slot == i ? Palette.cyan : Palette.muted,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
      const SizedBox(height: 16),
      ColorWheel(
        key: ValueKey(_slot),
        color: _current,
        onChanged: _change,
        onDone: (_) => _dragging = false,
      ),
      const SizedBox(height: 14),
      const SectionLabel('Quick colours'),
      Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          for (final color in _swatches)
            GestureDetector(
              onTap: () => c.edit(() => _set(color)),
              child: Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: color,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: _current.toARGB32() == color.toARGB32()
                        ? Palette.cyan
                        : Palette.border,
                    width: _current.toARGB32() == color.toARGB32() ? 3 : 1,
                  ),
                ),
              ),
            ),
        ],
      ),
      const SectionLabel('Fabric type'),
      Wrap(
        spacing: 8,
        children: [
          for (final fabric in designFabrics)
            ActionChipPill(
              fabric,
              selected: c.fabric == fabric,
              onTap: () => c.edit(() => c.fabric = fabric),
            ),
        ],
      ),
    ],
  );
}

class _PatternsTool extends StatelessWidget {
  const _PatternsTool(this.c, {required this.onGenerate});
  final AppController c;
  final VoidCallback onGenerate;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const _SheetTitle('Patterns'),
      const SectionLabel('Panel style'),
      Wrap(
        spacing: 8,
        children: [
          for (final p in designPatterns)
            ActionChipPill(
              p,
              selected: c.pattern == p,
              onTap: () => c.edit(() => c.pattern = p),
            ),
        ],
      ),
      const SectionLabel('Print pattern'),
      SizedBox(
        height: 74,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            _tile(
              selected: c.patternTile == null,
              onTap: () => c.edit(() => c.patternTile = null),
              child: artImage(asset: 'assets/images/pattern_default.png'),
            ),
            for (final tile in c.aiPatterns.reversed)
              _tile(
                selected: identical(c.patternTile, tile),
                onTap: () => c.edit(() => c.patternTile = tile),
                child: artImage(bytes: tile),
              ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      SecondaryButton(
        label: AiService.enabled ? 'GENERATE AI PATTERN' : 'NEXT PANEL STYLE',
        icon: Icons.auto_awesome,
        onPressed: onGenerate,
      ),
    ],
  );

  Widget _tile({
    required bool selected,
    required VoidCallback onTap,
    required Widget child,
  }) => Padding(
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

class _LogosTool extends StatelessWidget {
  const _LogosTool(this.c, {required this.onUpload, required this.onSponsor});
  final AppController c;
  final VoidCallback onSponsor;
  final VoidCallback onUpload;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const _SheetTitle('Logos'),
      const SectionLabel('Chest logo'),
      SizedBox(
        height: 74,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: SizedBox(
                width: 74,
                child: GlowCard(
                  radius: 10,
                  glow: false,
                  selected: c.logoImage == null,
                  onTap: () => c.edit(() => c.logoImage = null),
                  child: const Center(
                    child: Text(
                      '3D\ncrest',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 11, color: Palette.muted),
                    ),
                  ),
                ),
              ),
            ),
            for (final logo in c.logos.reversed)
              Padding(
                padding: const EdgeInsets.only(right: 10),
                child: SizedBox(
                  width: 74,
                  child: GlowCard(
                    radius: 10,
                    glow: false,
                    selected: identical(c.logoImage, logo),
                    onTap: () => c.edit(() => c.logoImage = logo),
                    child: artImage(bytes: logo, fit: BoxFit.contain),
                  ),
                ),
              ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      SecondaryButton(
        label: 'UPLOAD LOGO',
        icon: Icons.upload_rounded,
        onPressed: onUpload,
      ),
      const SizedBox(height: 6),
      const Text(
        'PNG with a transparent background works best.',
        style: TextStyle(color: Palette.muted, fontSize: 11),
      ),
      const SectionLabel('Sponsor (front, below the wordmark)'),
      SizedBox(
        height: 74,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            _sponsorTile(
              selected: c.sponsorImage == null,
              onTap: () => c.edit(() => c.sponsorImage = null),
              child: const Center(
                child: Text(
                  'None',
                  style: TextStyle(fontSize: 11, color: Palette.muted),
                ),
              ),
            ),
            for (final logo in c.logos.reversed)
              _sponsorTile(
                selected: identical(c.sponsorImage, logo),
                onTap: () => c.edit(() => c.sponsorImage = logo),
                child: artImage(bytes: logo, fit: BoxFit.contain),
              ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      SecondaryButton(
        label: 'UPLOAD SPONSOR LOGO',
        icon: Icons.handshake_outlined,
        onPressed: onSponsor,
      ),
    ],
  );

  Widget _sponsorTile({
    required bool selected,
    required VoidCallback onTap,
    required Widget child,
  }) => Padding(
    padding: const EdgeInsets.only(right: 10),
    child: SizedBox(
      width: 74,
      child: GlowCard(
        radius: 10,
        glow: false,
        selected: selected,
        onTap: onTap,
        child: child,
      ),
    ),
  );
}

class _TextTool extends StatefulWidget {
  const _TextTool(this.c);
  final AppController c;
  @override
  State<_TextTool> createState() => _TextToolState();
}

class _TextToolState extends State<_TextTool> {
  late final _front = TextEditingController(text: widget.c.logoText);
  late final _name = TextEditingController(text: widget.c.backName);
  late final _number = TextEditingController(text: widget.c.number);
  bool _recorded = false;

  /// One Undo step for the whole text session.
  void _set(VoidCallback change) {
    if (_recorded) {
      widget.c.update(change);
    } else {
      _recorded = true;
      widget.c.edit(change);
    }
  }

  @override
  void dispose() {
    _front.dispose();
    _name.dispose();
    _number.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const _SheetTitle('Text'),
      const SectionLabel('Front wordmark'),
      TextField(
        controller: _front,
        maxLength: 12,
        textCapitalization: TextCapitalization.characters,
        onChanged: (v) => _set(() => widget.c.logoText = v.toUpperCase()),
      ),
      const SectionLabel('Back name'),
      TextField(
        controller: _name,
        maxLength: 14,
        textCapitalization: TextCapitalization.characters,
        onChanged: (v) => _set(() => widget.c.backName = v.toUpperCase()),
      ),
      const SectionLabel('Number'),
      TextField(
        controller: _number,
        maxLength: 2,
        keyboardType: TextInputType.number,
        onChanged: (v) => _set(() => widget.c.number = v),
      ),
    ],
  );
}

class _GarmentTool extends StatelessWidget {
  const _GarmentTool(this.c);
  final AppController c;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const _SheetTitle('Garment'),
      GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: .85,
        children: [
          for (final (name, art, soon) in [
            for (final (n, a) in garmentTiles) (n, a, false),
            for (final (n, a) in comingSoonGarments) (n, a, true),
          ])
            GlowCard(
              radius: 12,
              glow: false,
              selected: c.garment == name,
              onTap: soon
                  ? () => showToast(context, '$name are coming soon in 3D.')
                  : () => c.edit(() => c.garment = name),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Opacity(
                    opacity: soon ? .45 : 1,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(6, 6, 6, 22),
                      child: Image.asset(
                        'assets/images/showroom/garment-$art.webp',
                        fit: BoxFit.contain,
                      ),
                    ),
                  ),
                  Align(
                    alignment: Alignment.bottomCenter,
                    child: Container(
                      width: double.infinity,
                      color: Colors.black54,
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Text(
                        name,
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 10.5),
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    ],
  );
}

/// 11 · Save project with a version number.
class SaveProjectScreen extends StatefulWidget {
  const SaveProjectScreen(this.c, {super.key});
  final AppController c;
  @override
  State<SaveProjectScreen> createState() => _SaveProjectScreenState();
}

class _SaveProjectScreenState extends State<SaveProjectScreen> {
  late final _name = TextEditingController(
    text: widget.c.projectName.isEmpty
        ? '${widget.c.sport} ${widget.c.garment}'
        : widget.c.projectName,
  );
  bool _done = false;

  AppController get c => widget.c;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final preview = c.mockupFront ?? c.renderFront;
    return Column(
      children: [
        TopBar(onBack: c.back, title: 'Save project'),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
            children: [
              AspectRatio(
                aspectRatio: 1.05,
                child: GlowCard(
                  child: preview != null
                      ? artImage(bytes: preview, fit: BoxFit.cover)
                      : KitPreview(controller: c, height: 260),
                ),
              ),
              const SizedBox(height: 18),
              const SectionLabel('Project name'),
              TextField(
                controller: _name,
                enabled: !_done,
                textCapitalization: TextCapitalization.words,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 14,
                      ),
                      decoration: BoxDecoration(
                        color: Palette.surface,
                        borderRadius: BorderRadius.circular(13),
                        border: Border.all(color: Palette.border),
                      ),
                      child: Text(
                        _done
                            ? 'Version ${c.projects.first.version}'
                            : 'Version ${c.nextVersion}',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Icon(
                    _done ? Icons.bookmark_rounded : Icons.bookmark_border,
                    color: Palette.cyan,
                    size: 30,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '${c.mode == 'AI' ? 'AI design' : 'Design Your Own'} · '
                '${c.sport} · ${c.garment}',
                style: const TextStyle(color: Palette.muted, fontSize: 12),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
          child: _done
              ? Column(
                  children: [
                    GradientButton(
                      label: 'EXPORT DESIGN',
                      icon: Icons.ios_share_rounded,
                      onPressed: () => c.go(AppScreen.export),
                    ),
                    const SizedBox(height: 10),
                    SecondaryButton(
                      label: 'View My Projects',
                      icon: Icons.folder_open_outlined,
                      onPressed: () => c.go(AppScreen.projects),
                    ),
                  ],
                )
              : GradientButton(
                  label: 'SAVE PROJECT',
                  icon: Icons.bookmark_add_outlined,
                  onPressed: () {
                    c.saveProject(_name.text);
                    // The screen itself shows the saved state; a toast
                    // would cover the buttons below.
                    setState(() => _done = true);
                  },
                ),
        ),
      ],
    );
  }
}

/// 12 · Export / share in several formats.
class ExportScreen extends StatefulWidget {
  const ExportScreen(this.c, {super.key});
  final AppController c;
  @override
  State<ExportScreen> createState() => _ExportScreenState();
}

class _ExportScreenState extends State<ExportScreen> {
  ExportKind? _working;

  Future<void> _export(ExportKind kind) async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null
        ? null
        : box.localToGlobal(Offset.zero) & box.size;
    setState(() => _working = kind);
    try {
      final status = await exportDesign(widget.c, kind, origin: origin);
      if (mounted) showToast(context, status);
    } on ExportException catch (e) {
      if (mounted) showToast(context, e.message);
    } on Exception catch (e) {
      if (mounted) showToast(context, 'Export failed: $e');
    } finally {
      if (mounted) setState(() => _working = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    final Uint8List? preview = c.mockupFront ?? c.renderFront;
    final rows = [
      (
        ExportKind.mockup,
        Icons.view_in_ar_outlined,
        '3D Mockup (PNG)',
        'High quality render',
      ),
      (
        ExportKind.frontBack,
        Icons.flip_outlined,
        'Front & Back (PNG)',
        'Multiple angles',
      ),
      (
        ExportKind.hiRes,
        Icons.high_quality_outlined,
        'High Resolution (JPG)',
        'Print-quality image',
      ),
      (
        ExportKind.social,
        Icons.photo_size_select_large_outlined,
        'Social Media Image',
        'Square / Story / Post',
      ),
      (
        ExportKind.pack,
        Icons.folder_zip_outlined,
        'Full Design Pack (ZIP)',
        'Everything + design brief',
      ),
    ];
    return Column(
      children: [
        TopBar(onBack: c.back, title: 'Export design'),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 6, 18, 20),
            children: [
              SizedBox(
                height: 210,
                child: GlowCard(
                  child: preview != null
                      ? artImage(bytes: preview, fit: BoxFit.contain)
                      : KitPreview(controller: c, height: 210),
                ),
              ),
              const SizedBox(height: 16),
              for (final (kind, icon, title, sub) in rows)
                Padding(
                  padding: const EdgeInsets.only(bottom: 9),
                  child: SurfaceCard(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    onTap: _working == null ? () => _export(kind) : null,
                    child: Row(
                      children: [
                        Icon(icon, color: Palette.cyan, size: 24),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13.5,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                sub,
                                style: const TextStyle(
                                  color: Palette.muted,
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        ),
                        _working == kind
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(
                                Icons.chevron_right,
                                color: Palette.muted,
                              ),
                      ],
                    ),
                  ),
                ),
              Opacity(
                opacity: .45,
                child: SurfaceCard(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  child: const Row(
                    children: [
                      Icon(
                        Icons.architecture_outlined,
                        color: Palette.muted,
                        size: 24,
                      ),
                      SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Vector / Tech Pack (Future)',
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 13.5,
                              ),
                            ),
                            SizedBox(height: 2),
                            Text(
                              'AI, SVG, PDF · coming soon',
                              style: TextStyle(
                                color: Palette.muted,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
