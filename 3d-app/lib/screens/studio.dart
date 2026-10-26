import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/scheduler.dart';

import '../ai_service.dart';
import '../app_controller.dart';
import '../assist.dart';
import '../design_document.dart' show studioPatterns;
import '../export_service.dart';
import '../project_sync.dart';
import '../widgets/drag_tray.dart';
import '../widgets/flow_ui.dart';
import '../widgets/kit_viewer_3d.dart';
import '../widgets/showroom.dart';
import '../widgets/studio_tools.dart';
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

  /// The "Drag to kit" tray of assets and patterns.
  bool _tray = false;
  final _stageKey = GlobalKey();
  final _viewerKey = GlobalKey();

  /// The tool open in the panel under the 3D, or null.
  String? _panel;

  /// The Colours panel also shows Fabric type and Gradient fill.
  bool _more = false;

  AppController get c => widget.c;
  bool get _live3d => c.show3d && KitViewer3D.supported;
  late final AssistRunner _assistRunner = _assist;

  @override
  void initState() {
    super.initState();
    AssistBridge.register('studio', _assistRunner);
  }

  @override
  void dispose() {
    AssistBridge.unregister('studio', _assistRunner);
    if (c.closeStudioPanel == _closePanel) c.closeStudioPanel = null;
    _prompt.dispose();
    super.dispose();
  }

  /// 3DEEZI ASSIST commands: turn the kit, open a tool, switch the garment or
  /// the 2D panels. Returns what was done.
  Future<String> _assist(String action, String value) async {
    switch (action) {
      case 'view':
        if (value == '360')
          throw AssistError(
            'The app has Front, Side and Back views (no 360° view).',
          );
        final view = const {
          'front': 'Front',
          'side': 'Side',
          'back': 'Back',
        }[value];
        if (view == null)
          throw AssistError('The views are front, side and back.');
        if (c.boardMode) c.update(() => c.boardMode = false);
        final error = await c.showView(view);
        if (error != null) throw AssistError(error);
        return '$view view';
      case 'panel':
        if (value == 'ai')
          throw AssistError(
            'Type your change in the "Ask 3DEEZI to change anything" bar.',
          );
        if (value == 'close') {
          Navigator.of(context).popUntil((route) => route.isFirst);
          _closePanel();
          return 'Panel closed';
        }
        final tool = const {
          'colours': 'Colours',
          'patterns': 'Patterns',
          'logos': 'Artwork',
          'text': 'Text',
          'numbers': 'Text',
          'garment': 'Garment',
          'presets': 'Presets',
        }[value];
        if (tool == null) throw AssistError('There is no such Studio panel.');
        Navigator.of(context).popUntil((route) => route.isFirst);
        _openTool(tool);
        return '$tool panel open';
      case 'garment':
        final name = ProjectSync.garments.entries
            .where((e) => e.value == value)
            .firstOrNull
            ?.key;
        if (name == null) throw AssistError('That garment is not available.');
        c.edit(() => c.garment = name);
        return 'Garment: $name';
      case 'board':
        if (!KitViewer3D.supported)
          throw AssistError('2D panels are not available here.');
        c.update(() => c.boardMode = value == '2d');
        return value == '2d' ? '2D print panels' : '3D view';
      case 'export':
        final kind = const {
          'png': ExportKind.mockup,
          'front-back': ExportKind.frontBack,
          'pdf': ExportKind.pdf,
        }[value];
        if (kind == null) {
          throw AssistError(
            'The app exports the 3D mockup, Front & back, high resolution, social, '
            'design pack and PDF design sheet from Export.',
          );
        }
        await c.captureViews(panels: kind == ExportKind.pdf);
        return exportDesign(c, kind);
      case 'design':
        // Direct edits, as in the tools: number, name, wordmark, colours, pattern.
        final said = <String>[];
        final changes = <VoidCallback>[];
        for (final pair in value.split(',').map((x) => x.trim())) {
          if (pair.isEmpty) continue;
          final i = pair.indexOf('=');
          final key = i < 0 ? pair : pair.substring(0, i);
          final v = i < 0 ? '' : pair.substring(i + 1).trim();
          switch (key) {
            case 'number':
              final n = v.replaceAll(RegExp(r'\D'), '');
              if (n.isEmpty) throw AssistError('The number needs digits.');
              final digits = n.substring(0, n.length.clamp(0, 3));
              changes.add(() => c.number = digits);
              said.add('number $digits');
            case 'name':
              final name = v.toUpperCase();
              changes.add(() => c.backName = name);
              said.add('name $name');
            case 'wordmark':
              final text = v.toUpperCase();
              changes.add(() => c.logoText = text);
              said.add('wordmark $text');
            case 'main' || 'secondary' || 'accent':
              final m = RegExp(r'^#?([0-9a-fA-F]{6})$').firstMatch(v);
              if (m == null) throw AssistError('"$v" is not a colour I know.');
              final colour = Color(0xff000000 | int.parse(m[1]!, radix: 16));
              changes.add(
                () => switch (key) {
                  'main' => c.mainColor = colour,
                  'secondary' => c.secondaryColor = colour,
                  _ => c.accentColor = colour,
                },
              );
              said.add('$key #${m[1]}');
            case 'pattern':
              final name = studioPatterns
                  .where((p) => p.toLowerCase() == v.toLowerCase())
                  .firstOrNull;
              final pattern =
                  name ?? (v.toLowerCase() == 'none' ? 'Solid' : null);
              if (pattern == null) {
                throw AssistError(
                  'Patterns are: ${studioPatterns.join(', ')}.',
                );
              }
              changes.add(() => c.pattern = pattern);
              said.add('pattern $pattern');
            case 'patternColor':
              said.add('pattern colour (not in the app)');
            default:
              throw AssistError('I can\'t set "$key" here.');
          }
        }
        if (changes.isEmpty) throw AssistError('Nothing to change.');
        c.edit(() {
          for (final change in changes) {
            change();
          }
        });
        return 'Changed ${said.join(', ')}';
      case 'studioAi':
        // Anything else about the kit's look: the Studio AI, as if typed in
        // the "Ask 3DEEZI" bar.
        if (!AiService.enabled) {
          throw AssistError('AI is not set up in this build.');
        }
        return 'Studio AI: ${await c.askAi(value)}';
    }
    throw AssistError("The Studio can't do that.");
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
      await c.captureViews(panels: next == AppScreen.saveProject);
      if (!mounted) return;
      setState(() => _busy = null);
    }
    c.go(next);
  }

  Future<void> _exportBoard() async {
    setState(() => _busy = 'Exporting artboard...');
    try {
      final image = await c.captureBoard?.call();
      if (!mounted) return;
      if (image == null) {
        showToast(context, 'The artboard is not ready. Please try again.');
        return;
      }
      final box = context.findRenderObject() as RenderBox?;
      final origin = box == null
          ? null
          : box.localToGlobal(Offset.zero) & box.size;
      final message = await shareImage(
        image,
        '3DEEZI-artboard.png',
        origin: origin,
      );
      if (mounted) showToast(context, message);
    } on Object catch (error) {
      if (mounted) showToast(context, '$error');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  // ---------- layout
  @override
  Widget build(BuildContext context) {
    final stage = Stack(
      key: _stageKey,
      children: [
        Positioned.fill(
          child: _live3d
              // Drawn a little larger than the box on a tall phone view, so
              // the kit fills more of it (as on the website); the 2D panels
              // and the viewer's own screens get exactly the box.
              ? _Zoomed(
                  enabled: !c.boardMode && !c.viewerModal,
                  child: KitViewer3D(
                    key: _viewerKey,
                    controller: c,
                    height: double.infinity,
                  ),
                )
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
        // Front / Back / Side at the foot of the 3D, as on the website
        // (172.jpg): the sides stay clear for the kit.
        if (!_preview && !c.boardMode && !c.viewerModal)
          Positioned(
            left: 0,
            right: 0,
            bottom: 10,
            child: Center(
              child: _ViewBar(
                view: c.view,
                onView: (view) async {
                  final error = await c.showView(view);
                  if (error != null && context.mounted) {
                    showToast(context, error);
                  }
                },
              ),
            ),
          ),
        if (!_preview &&
            !c.boardMode &&
            !c.viewerModal &&
            c.renderFront != null &&
            KitViewer3D.supported)
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
        // The sport's garment tile the kit was chosen as ("Netball dress",
        // task 9.99), as on the website's stage.
        if (!_preview &&
            !c.boardMode &&
            !c.viewerModal &&
            c.productName.isNotEmpty)
          Positioned(
            top: 12,
            left: 70,
            right: 70,
            child: IgnorePointer(
              child: Center(
                child: Container(
                  key: const ValueKey('studio-product'),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xcc08131e),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0x3300d9ed)),
                  ),
                  child: Text(
                    '${c.sport} · ${c.productName}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11.5),
                  ),
                ),
              ),
            ),
          ),
        if (_busy != null || c.renderingBack || c.printBusy)
          Positioned(
            // Above the Front / Back / Side bar.
            bottom: !_preview && !c.boardMode && !c.viewerModal ? 56 : 12,
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

    final panel = _preview ? null : _panel;
    return LayoutBuilder(
      builder: (context, box) => Column(
        children: [
          _StudioBar(
            c: c,
            preview: _preview,
            onBack: c.back,
            onPreview: () {
              // Preview shows the kit alone: the panel closes.
              if (!_preview) _closePanel();
              setState(() => _preview = !_preview);
              if (_preview) c.studioClearance.value = 0;
            },
            onSave: () => _leave(AppScreen.saveProject),
            onShowcase: () => _leave(AppScreen.showcase),
          ),
          // While a tool panel is open, the 3D takes this row's room too.
          if (!_preview && panel == null)
            SizedBox(
              height: 44,
              child: ChipRow(
                children: [
                  ActionChipPill(
                    'Artboard',
                    onTap: () => c.go(AppScreen.artboard),
                  ),
                  ActionChipPill(
                    c.boardMode ? 'Back to 3D' : '2D panels',
                    selected: c.boardMode,
                    onTap: KitViewer3D.supported
                        ? () => c.update(() {
                            c.show3d = true;
                            c.boardMode = !c.boardMode;
                          })
                        : null,
                  ),
                  // On the 2D panels its own buttons come first, so they show
                  // on a phone without scrolling the row.
                  if (c.boardMode) ...[
                    // Pinch or drag on the panels works too; these are the
                    // same zoom steps as the website's buttons.
                    ActionChipPill(
                      'Zoom −',
                      onTap: () => c.zoomBoard?.call('out'),
                    ),
                    ActionChipPill(
                      'Zoom +',
                      onTap: () => c.zoomBoard?.call('in'),
                    ),
                    ActionChipPill(
                      'Fit',
                      onTap: () => c.zoomBoard?.call('fit'),
                    ),
                    if (c.marks.isNotEmpty)
                      // The wordmark, crest, sponsor, name and number back in
                      // their places (and shown again if removed).
                      ActionChipPill(
                        'Reset layout',
                        onTap: () => c.edit(() => c.marks = {}),
                      ),
                    ActionChipPill(
                      'Export board',
                      onTap: _busy == null ? _exportBoard : null,
                    ),
                  ],
                  ActionChipPill(
                    'Drag to kit',
                    selected: _tray,
                    onTap: () => setState(() => _tray = !_tray),
                  ),
                  ActionChipPill('Artwork', onTap: () => _openTool('Artwork')),
                  ActionChipPill('Presets', onTap: () => _openTool('Presets')),
                ],
              ),
            ),
          if (_tray && !_preview && panel == null) DragTray(c),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: DragTarget<KitDrop>(
                onAcceptWithDetails: (details) async {
                  // The 3D may be drawn larger than the stage: the drop is
                  // placed on the 3D's own box.
                  final box =
                      (_viewerKey.currentContext ?? _stageKey.currentContext)
                              ?.findRenderObject()
                          as RenderBox?;
                  if (box == null) return;
                  final note = await DragTray.drop(
                    c,
                    details.data,
                    details.offset,
                    box,
                  );
                  if (note != null && mounted) showToast(context, note);
                },
                builder: (context, candidates, _) => DecoratedBox(
                  position: DecorationPosition.foreground,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(18),
                    border: candidates.isEmpty
                        ? null
                        : Border.all(color: Palette.cyan, width: 2.5),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: stage,
                  ),
                ),
              ),
            ),
          ),
          // A tool opens as a compact panel under the 3D (client pictures
          // 172.jpg and 173.jpg): the kit stays in view above it and every
          // change shows on it live.
          if (panel != null)
            _HeightReport(
              onHeight: _clearance,
              child: _ToolPanel(
                key: ValueKey('studio-panel-$panel'),
                title: panel,
                maxHeight: math.max(
                  220,
                  box.maxHeight * (panel == 'Colours' ? .5 : .42),
                ),
                onClose: _closePanel,
                action: panel == 'Colours'
                    ? _PanelAction(
                        key: const ValueKey('colour-more'),
                        icon: _more ? Icons.expand_less_rounded : Icons.tune,
                        label: _more ? 'Less' : 'Gradient & fabric',
                        onTap: () => setState(() => _more = !_more),
                      )
                    : null,
                child: _panelBody(panel),
              ),
            )
          else if (!_preview)
            _HeightReport(
              onHeight: _clearance,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(height: 6),
                  _ToolTabs(onTap: _openTool),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 6, 12, 4),
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(2, 0, 4, 0),
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
                            visualDensity: VisualDensity.compact,
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
                                contentPadding: EdgeInsets.symmetric(
                                  vertical: 11,
                                ),
                              ),
                            ),
                          ),
                          IconButton.filled(
                            tooltip: 'Send',
                            visualDensity: VisualDensity.compact,
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
                    height: 42,
                    child: ChipRow(
                      padding: const EdgeInsets.fromLTRB(12, 4, 12, 6),
                      children: [
                        for (final (label, action) in [
                          (
                            'Make it black',
                            () => _ask('Make the main colour black'),
                          ),
                          ('Add pattern', _newPattern),
                          (
                            'Change collar',
                            () => _ask(
                              'Change the collar to a contrasting colour',
                            ),
                          ),
                          ('Add logo', _addLogo),
                        ])
                          ActionChipPill(
                            label,
                            onTap: _busy == null ? action : null,
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 4),
                ],
              ),
            ),
        ],
      ),
    );
  }

  /// The height of the controls under the 3D, for the round Assist button.
  void _clearance(double height) {
    if (!mounted || (c.studioClearance.value - height).abs() < .5) return;
    c.studioClearance.value = height;
  }

  /// The tool tabs open their panel under the 3D; Artwork and Preset designs
  /// are tall tools and keep their sheet.
  static const _panels = {'Colours', 'Patterns', 'Logos', 'Text', 'Garment'};

  void _openTool(String tool) {
    if (_panels.contains(tool)) {
      setState(() {
        _panel = tool;
        _more = false;
        _preview = false;
      });
      c.closeStudioPanel = _closePanel;
      return;
    }
    _closePanel();
    _openSheet(tool);
  }

  void _closePanel() {
    if (c.closeStudioPanel == _closePanel) c.closeStudioPanel = null;
    if (_panel == null || !mounted) return;
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      _panel = null;
      _more = false;
    });
  }

  Widget _panelBody(String tool) => switch (tool) {
    'Colours' => _ColoursTool(c, more: _more, onDone: _closePanel),
    'Patterns' => _PatternsTool(c, onGenerate: _newPattern),
    'Logos' => _LogosTool(c, onSponsor: _addSponsor, onUpload: _addLogo),
    'Text' => _TextTool(c),
    _ => _GarmentTool(c),
  };

  // A tall tool (Preset designs, Artwork) fills the screen: useSafeArea keeps
  // it below the iPhone notch, and SheetTop gives it a ✕ and a drag handle
  // (iPhones have no Back button; Android Back closes it too).
  void _openSheet(String tool) => showModalBottomSheet<void>(
    context: context,
    backgroundColor: Palette.surface,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (sheet) => AnimatedBuilder(
      animation: c,
      builder: (context, _) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SheetTop(),
          Flexible(
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                20,
                0,
                20,
                20 + MediaQuery.viewInsetsOf(context).bottom,
              ),
              child: SingleChildScrollView(
                child: tool == 'Artwork'
                    ? StudioArtworkTool(c)
                    : StudioPresetsTool(c),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

/// Reports its child's height after layout (once per change).
class _HeightReport extends SingleChildRenderObjectWidget {
  const _HeightReport({required this.onHeight, super.child});
  final ValueChanged<double> onHeight;
  @override
  RenderObject createRenderObject(BuildContext context) =>
      _RenderHeightReport(onHeight);
  @override
  void updateRenderObject(BuildContext context, _RenderHeightReport render) =>
      render.onHeight = onHeight;
}

class _RenderHeightReport extends RenderProxyBox {
  _RenderHeightReport(this.onHeight);
  ValueChanged<double> onHeight;
  double? _sent;

  @override
  void performLayout() {
    super.performLayout();
    final height = size.height;
    if (height == _sent) return;
    _sent = height;
    SchedulerBinding.instance.addPostFrameCallback((_) => onHeight(height));
  }
}

/// The compact tool panel under the 3D (173.jpg): its name, an optional
/// action and a ✕ on top, the tool below (scrolling when it is taller than
/// [maxHeight]).
class _ToolPanel extends StatelessWidget {
  const _ToolPanel({
    super.key,
    required this.title,
    required this.maxHeight,
    required this.onClose,
    required this.child,
    this.action,
  });
  final String title;
  final double maxHeight;
  final VoidCallback onClose;
  final Widget child;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.fromLTRB(8, 6, 8, 6),
    constraints: BoxConstraints(maxHeight: maxHeight),
    decoration: BoxDecoration(
      color: Palette.surface,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: Palette.cyan.withValues(alpha: .3)),
      boxShadow: const [
        BoxShadow(color: Colors.black54, blurRadius: 16, offset: Offset(0, -3)),
      ],
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 2, 4, 0),
          child: Row(
            children: [
              Text(
                title.toUpperCase(),
                maxLines: 1,
                style: const TextStyle(
                  fontFamily: 'Rajdhani',
                  fontWeight: FontWeight.w700,
                  fontSize: 17,
                  letterSpacing: .6,
                  color: Palette.text,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Align(alignment: Alignment.centerRight, child: action),
              ),
              IconButton(
                key: const ValueKey('sheet-close'),
                tooltip: 'Close',
                style: IconButton.styleFrom(
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  minimumSize: const Size(38, 34),
                  padding: EdgeInsets.zero,
                ),
                onPressed: onClose,
                icon: const Icon(Icons.close, color: Palette.text, size: 20),
              ),
            ],
          ),
        ),
        Flexible(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(12, 2, 12, 10),
            child: child,
          ),
        ),
      ],
    ),
  );
}

/// A small text action in a tool panel's header ("Gradient & fabric").
class _PanelAction extends StatelessWidget {
  const _PanelAction({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    child: InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: Palette.cyan),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Palette.cyan,
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

  // A fixed width per action, its label scaled down to fit: five actions and
  // Back always fit a 360 px phone, even with larger iPhone text sizes (the
  // bar overflowed by 48 px at 375 and 390).
  Widget _action(String label, IconData icon, VoidCallback? onTap) => InkWell(
    borderRadius: BorderRadius.circular(10),
    onTap: onTap,
    child: SizedBox(
      width: 54,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 20,
              color: onTap == null ? Palette.border : Palette.text,
            ),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                label,
                maxLines: 1,
                style: TextStyle(
                  fontSize: 9.5,
                  color: onTap == null ? Palette.border : Palette.muted,
                ),
              ),
            ),
          ],
        ),
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

/// Front / Back / Side as one bar at the foot of the 3D (the website's look,
/// 172.jpg).
class _ViewBar extends StatelessWidget {
  const _ViewBar({required this.view, required this.onView});
  final String view;
  final ValueChanged<String> onView;

  @override
  Widget build(BuildContext context) => Container(
    key: const ValueKey('studio-views'),
    padding: const EdgeInsets.all(3),
    decoration: BoxDecoration(
      color: const Color(0xd908131e),
      borderRadius: BorderRadius.circular(22),
      border: Border.all(color: Palette.cyan.withValues(alpha: .35)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final v in const ['Front', 'Back', 'Side'])
          Semantics(
            button: true,
            selected: view == v,
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: () => onView(v),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                constraints: const BoxConstraints(minWidth: 62),
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: view == v ? Palette.cyan : Colors.transparent,
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Text(
                  v,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: view == v ? Colors.black : Palette.text,
                  ),
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

/// The live 3D a little larger than its box, centred (the stage clips it), on
/// a tall phone view: the kit fills about 85% of the view's width instead of
/// about 75%, as on the website. A wide view (a tablet, or a short view while
/// a tool panel is open) keeps the box; so do the 2D panels and the viewer's
/// own screens ([enabled] false).
class _Zoomed extends StatelessWidget {
  const _Zoomed({required this.enabled, required this.child});
  final bool enabled;
  final Widget child;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final tall = box.maxHeight / math.max(1, box.maxWidth);
      final zoom = enabled ? (1 + (tall - 1) * .4).clamp(1.0, 1.14) : 1.0;
      final w = box.maxWidth * zoom, h = box.maxHeight * zoom;
      return OverflowBox(
        minWidth: w,
        maxWidth: w,
        minHeight: h,
        maxHeight: h,
        child: child,
      );
    },
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
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Column(
                  children: [
                    Icon(icon, size: 21, color: Palette.cyan),
                    const SizedBox(height: 3),
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

// ---------- tool panels
/// Colours (173.jpg): Primary / Secondary / Accent tabs, the compact wheel
/// with its swatch, HEX and brightness, recent and quick colours and Done.
/// [more] adds Fabric type and Gradient fill under them.
class _ColoursTool extends StatefulWidget {
  const _ColoursTool(this.c, {required this.more, required this.onDone});
  final AppController c;
  final bool more;
  final VoidCallback onDone;
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
                child: Semantics(
                  button: true,
                  selected: _slot == i,
                  child: GestureDetector(
                    onTap: () => setState(() => _slot = i),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      padding: const EdgeInsets.symmetric(vertical: 5),
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
                          fontSize: 10.5,
                          letterSpacing: .8,
                          fontWeight: FontWeight.w700,
                          color: _slot == i ? Palette.cyan : Palette.muted,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
      const SizedBox(height: 8),
      ColorWheel(
        key: ValueKey(_slot),
        compact: true,
        color: _current,
        swatches: _swatches,
        onChanged: _change,
        onDone: (_) => _dragging = false,
        trailing: FilledButton(
          key: const ValueKey('colour-done'),
          onPressed: widget.onDone,
          style: FilledButton.styleFrom(
            backgroundColor: Palette.cyan,
            foregroundColor: Colors.black,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            minimumSize: const Size(76, 34),
            padding: const EdgeInsets.symmetric(horizontal: 18),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
          child: const Text(
            'Done',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
          ),
        ),
      ),
      if (widget.more) ...[
        const SectionLabel('Fabric type'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final fabric in designFabrics)
              ActionChipPill(
                fabric,
                selected: c.fabric == fabric,
                onTap: () => c.edit(() => c.fabric = fabric),
              ),
          ],
        ),
        StudioGradientTool(c, slot: _slot),
      ],
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
      StudioZoneTool(c),
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
        ? '${widget.c.sport} ${widget.c.garmentLabel}'
        : widget.c.projectName,
  );
  bool _done = false;
  bool _saving = false;

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
                '${c.sport} · ${c.garmentLabel}',
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
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (c.saveError != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          c.saveError!,
                          style: const TextStyle(
                            color: Color(0xffff9b8d),
                            fontSize: 12,
                          ),
                        ),
                      ),
                    GradientButton(
                      label: _saving ? 'SAVING...' : 'SAVE PROJECT',
                      icon: Icons.bookmark_add_outlined,
                      onPressed: _saving
                          ? null
                          : () async {
                              setState(() => _saving = true);
                              final success = await c.saveProject(_name.text);
                              if (!mounted) return;
                              setState(() {
                                _saving = false;
                                _done = success;
                              });
                            },
                    ),
                  ],
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
        ExportKind.pdf,
        Icons.picture_as_pdf_outlined,
        'Design Sheet (PDF)',
        'Front & back views, colours and details',
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
