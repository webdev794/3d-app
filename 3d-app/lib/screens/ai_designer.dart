import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../ai_service.dart';
import '../api_client.dart' show ApiException;
import '../app_controller.dart';
import '../sports_catalog.dart';
import '../design_document.dart' show isHoodie, isVarsity, isTrack;
import '../export_service.dart';
import '../player_shot.dart';
import '../widgets/ai_stage.dart';
import '../widgets/flow_ui.dart';
import '../widgets/recent_designs.dart';
import '../widgets/showroom.dart';
import '../widgets/ui.dart';
import 'image_editor.dart';

const _sampleBriefs = [
  'Create a black and cyan rugby league jersey with Maori inspired patterns.',
  'Navy and gold soccer home kit for the Harbour City Hawks, sharp and modern.',
  'Bold orange and black basketball singlet with lightning side panels.',
  'Clean white training tee with electric blue raglan sleeves and fine stripes.',
];

/// 5 · AI Designer: describe, add references, generate.
class AiDesignerScreen extends StatefulWidget {
  const AiDesignerScreen(this.c, {super.key});
  final AppController c;
  @override
  State<AiDesignerScreen> createState() => _AiDesignerScreenState();
}

class _AiDesignerScreenState extends State<AiDesignerScreen> {
  late final TextEditingController _text = TextEditingController(
    text: widget.c.brief,
  );
  bool _busy = false;

  /// The sports tile chosen (optional), the garment picked from the quick
  /// chips, and whether the chips are asking for it.
  String? _tile, _garment;
  bool _askGarment = false;

  AppController get c => widget.c;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  /// (+): attach a picture (gallery, camera or a sample), or let the AI help
  /// with the brief (the chips that used to sit under the composer).
  Future<void> _openPlus() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Palette.surface,
      showDragHandle: true,
      isScrollControlled: true,
      // Below the iPhone notch if the list ever fills the screen.
      useSafeArea: true,
      builder: (sheet) => SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ListTile(
                leading: const Icon(Icons.photo_library_outlined),
                title: const Text('Upload image'),
                subtitle: const Text('Logo, design, pattern or example'),
                onTap: () => Navigator.pop(sheet, 'gallery'),
              ),
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined),
                title: const Text('Camera'),
                onTap: () => Navigator.pop(sheet, 'camera'),
              ),
              ListTile(
                leading: const Icon(Icons.collections_outlined),
                title: const Text('Sample references'),
                onTap: () => Navigator.pop(sheet, 'samples'),
              ),
              const Divider(height: 1),
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 12, 16, 2),
                child: Text(
                  'LET AI HELP WITH YOUR BRIEF',
                  style: TextStyle(
                    fontSize: 10.5,
                    letterSpacing: 1.6,
                    fontWeight: FontWeight.w700,
                    color: Palette.muted,
                  ),
                ),
              ),
              for (final mode in BriefMode.values)
                ListTile(
                  leading: Icon(_icon(mode), color: Palette.cyan),
                  title: Text(_label(mode)),
                  subtitle: Text(_hint(mode)),
                  trailing: c.briefMode == mode
                      ? const Icon(Icons.check, color: Palette.cyan)
                      : null,
                  onTap: () => Navigator.pop(sheet, mode.name),
                ),
            ],
          ),
        ),
      ),
    );
    if (!mounted || choice == null) return;
    final mode = BriefMode.values.where((m) => m.name == choice).firstOrNull;
    if (mode != null) return _chip(mode);
    if (c.references.length >= 3) {
      showToast(context, 'Up to 3 reference images. Remove one first.');
      return;
    }
    if (choice == 'samples') return _pickSample();
    return _pickImage(
      choice == 'camera' ? ImageSource.camera : ImageSource.gallery,
    );
  }

  /// The picture button in the bar (and Upload image / Camera in (+)).
  Future<void> _pickImage(ImageSource source) async {
    if (c.references.length >= 3) {
      showToast(context, 'Up to 3 reference images. Remove one first.');
      return;
    }
    final bytes = await pickPhoto(context, source: source);
    if (bytes != null) {
      c.update(() {
        c.references.add(bytes);
        c.uploads.add(bytes);
      });
    }
  }

  IconData _icon(BriefMode m) => switch (m) {
    BriefMode.inspire => Icons.auto_awesome,
    BriefMode.modify => Icons.tune,
    BriefMode.match => Icons.compare_outlined,
    BriefMode.improve => Icons.auto_fix_high,
  };

  String _hint(BriefMode m) => switch (m) {
    BriefMode.inspire => 'Write a brief for me',
    BriefMode.modify => 'Keep my reference, change the details',
    BriefMode.match => 'Match my reference closely',
    BriefMode.improve => 'Polish what I typed',
  };

  /// A picture pasted into the brief (from the keyboard's clipboard): a logo,
  /// a reference or a finished design to turn into 3D.
  void _insertPicture(KeyboardInsertedContent content) {
    final bytes = content.data;
    if (bytes == null || bytes.isEmpty) return;
    if (c.references.length >= 3) {
      showToast(context, 'Up to 3 reference images. Remove one first.');
      return;
    }
    c.update(() {
      c.references.add(bytes);
      c.uploads.add(bytes);
    });
    showToast(context, 'Picture added to your references.');
  }

  Future<void> _pickSample() async {
    final index = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: Palette.surface,
      showDragHandle: true,
      builder: (sheet) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: GridView.count(
          crossAxisCount: 4,
          shrinkWrap: true,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          children: [
            for (var i = 1; i <= 4; i++)
              GlowCard(
                radius: 10,
                glow: false,
                onTap: () => Navigator.pop(sheet, i),
                child: artImage(asset: 'assets/images/reference_$i.png'),
              ),
          ],
        ),
      ),
    );
    if (index == null) return;
    final data = await rootBundle.load('assets/images/reference_$index.png');
    c.update(() => c.references.add(data.buffer.asUint8List()));
  }

  Future<void> _chip(BriefMode mode) async {
    if ((mode == BriefMode.match || mode == BriefMode.modify) &&
        c.references.isEmpty) {
      showToast(context, 'Add a reference image to use ${_label(mode)}.');
      return;
    }
    if (mode == BriefMode.match || mode == BriefMode.modify) {
      c.update(() => c.briefMode = c.briefMode == mode ? null : mode);
      if (c.briefMode == null) return;
    }
    if (mode == BriefMode.improve && _text.text.trim().isEmpty) {
      showToast(context, 'Type an idea first, then tap Improve.');
      return;
    }
    if (!AiService.enabled) {
      if (mode == BriefMode.inspire) {
        _text.text = _sampleBriefs[math.Random().nextInt(_sampleBriefs.length)];
      }
      return;
    }
    setState(() => _busy = true);
    try {
      final rewritten = await c.ai.rewriteBrief(_text.text, mode);
      if (mounted) _text.text = rewritten;
    } on AiException catch (e) {
      if (mounted) showToast(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _label(BriefMode m) => switch (m) {
    BriefMode.inspire => 'Inspire',
    BriefMode.modify => 'Modify',
    BriefMode.match => 'Match',
    BriefMode.improve => 'Improve',
  };

  /// Generate: the sport from the tile (or the brief), the garment from the
  /// brief or a quick chip (asked only when the brief names none).
  void _generate([String? garmentChoice, String product = '']) {
    final text = _text.text.trim();
    if (text.isEmpty && c.references.isEmpty) {
      showToast(context, 'Describe your kit or add a reference image.');
      return;
    }
    final tile =
        aiQuickSports.where((s) => s.id == _tile).firstOrNull ??
        sportInBrief(text);
    final garment = garmentChoice ?? garmentInBrief(text) ?? _garment;
    if (garment == null) {
      setState(() => _askGarment = true);
      return;
    }
    var brief = text.isEmpty
        ? 'Create a design from my attached artwork.'
        : text;
    final category = tile?.brief;
    if (category != null &&
        !brief.toLowerCase().contains(
          category.split(' ').first.toLowerCase(),
        )) {
      brief = '$category: $brief';
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _askGarment = false;
      if (garmentChoice != null) _garment = garmentChoice;
    });
    c.update(() {
      c.brief = brief;
      c.aiSport = tile?.sport;
      c.aiGarment = garment;
      if (tile != null) c.sport = tile.sport;
      c.garment = garment;
      // The chip's own name ("Netball dress", task 9.99) names the kit, and
      // its own setting comes with it (a Hooded Tracksuit has the hood, as in
      // Design Your Own; the AI's design does not set it).
      c.productName = garmentChoice == garment ? product : '';
      final own = c.productName.isEmpty
          ? null
          : sportNamed(c.sport)?.tiles
                .where((t) => t.name == product && t.garment == garment)
                .firstOrNull;
      // Without a style of its own: the plain (collar) track jacket, also
      // after a hooded chip earlier in this session (QA U).
      c.trackStyle = own?.trackStyle ?? 'collar';
    });
    c.go(AppScreen.generating);
  }

  @override
  Widget build(BuildContext context) {
    final chosen = aiQuickSports.where((s) => s.id == _tile).firstOrNull;
    final width = MediaQuery.sizeOf(context).width;
    final chipSport = chosen ?? sportInBrief(_text.text);
    // The sport's own garment tiles by their names (as in Design Your Own),
    // else its garments.
    final own = [
      for (final t
          in sportNamed(chipSport?.sport)?.tiles ?? const <GarmentTile>[])
        if (!t.soon) (t.garment!, t.name),
    ];
    final garments = own.isNotEmpty
        ? own
        : [for (final g in chipSport?.garments ?? aiAllGarments) (g, '')];
    return Stack(
      children: [
        const Positioned.fill(child: AiStageBackdrop()),
        Column(
          children: [
            TopBar(onBack: c.back, center: const SizedBox.shrink()),
            Expanded(
              child: LayoutBuilder(
                builder: (context, box) => SingleChildScrollView(
                  padding: const EdgeInsets.only(bottom: 24),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: box.maxHeight - 24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        BrandLogo(width: math.min(320, width * .7)),
                        const SizedBox(height: 10),
                        const Text(
                          'AI SPORTSWEAR DESIGNER',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontFamily: 'Rajdhani',
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 4,
                            color: Color(0xfff3f7fb),
                          ),
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'DESIGN WITHOUT LIMITS',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontFamily: 'Rajdhani',
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 5,
                            color: Color(0xffe8eef5),
                          ),
                        ),
                        const SizedBox(height: 22),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 680),
                            child: _bar(chosen),
                          ),
                        ),
                        if (_askGarment)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                            child: Wrap(
                              alignment: WrapAlignment.center,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                Text(
                                  'What are we designing${chosen == null ? '' : ' for ${chosen.label}'}?',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                for (final (g, name) in garments)
                                  ActionChipPill(
                                    name.isEmpty ? g : name,
                                    onTap: () => _generate(g, name),
                                  ),
                              ],
                            ),
                          ),
                        if (AiService.enabled)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Transform.scale(
                                  scale: .75,
                                  child: Switch.adaptive(
                                    value: c.wantMockup,
                                    activeTrackColor: Palette.cyan,
                                    onChanged: (v) =>
                                        c.update(() => c.wantMockup = v),
                                  ),
                                ),
                                const Text(
                                  'HD primary',
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    color: Color(0xffb9c7d4),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        const SizedBox(height: 12),
                        // Recent designs: the latest briefs and projects,
                        // reopened with no new AI call.
                        RecentDesignsStrip(c),
                        const SizedBox(height: 14),
                        AiSportRow(
                          selected: _tile,
                          onSelect: (id) => setState(() {
                            _tile = _tile == id ? null : id;
                            _askGarment = false;
                          }),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  /// The prompt bar: (+), the brief, the picture button and Generate; the
  /// attached pictures sit above the text. (No voice input: the app has no
  /// speech package.)
  Widget _bar(AiQuickSport? chosen) => Container(
    padding: const EdgeInsets.all(6),
    decoration: BoxDecoration(
      color: const Color(0xd9061019),
      borderRadius: BorderRadius.circular(c.references.isEmpty ? 30 : 22),
      border: Border.all(color: Palette.cyan.withValues(alpha: .8), width: 1.4),
      boxShadow: [
        BoxShadow(color: Palette.cyan.withValues(alpha: .22), blurRadius: 18),
      ],
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (c.references.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(6, 2, 6, 6),
            child: Row(
              children: [
                for (var i = 0; i < c.references.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: SizedBox(
                      width: 48,
                      height: 48,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(9),
                            child: artImage(bytes: c.references[i]),
                          ),
                          Positioned(
                            top: 2,
                            right: 2,
                            child: Semantics(
                              button: true,
                              label: 'Remove picture ${i + 1}',
                              child: GestureDetector(
                                onTap: () =>
                                    c.update(() => c.references.removeAt(i)),
                                child: const CircleAvatar(
                                  radius: 9,
                                  backgroundColor: Colors.black87,
                                  child: Icon(Icons.close, size: 12),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            IconButton(
              tooltip: 'Attach and suggestions',
              onPressed: _busy ? null : _openPlus,
              style: IconButton.styleFrom(
                backgroundColor: const Color(0xff0e1b27),
                side: const BorderSide(color: Color(0x33ffffff)),
                fixedSize: const Size(42, 42),
              ),
              icon: const Icon(Icons.add, size: 22),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: TextField(
                controller: _text,
                minLines: 1,
                maxLines: 5,
                enabled: !_busy,
                textCapitalization: TextCapitalization.sentences,
                onChanged: (_) => setState(() {}),
                inputFormatters: [
                  BriefLimit(() {
                    if (mounted) {
                      showToast(
                        context,
                        'Your brief was shortened to ${formatCount(maxBrief)} characters.',
                      );
                    }
                  }),
                ],
                // Pictures pasted from the keyboard's clipboard join the
                // references, as with the picture button.
                contentInsertionConfiguration: ContentInsertionConfiguration(
                  allowedMimeTypes: const [
                    'image/png',
                    'image/jpeg',
                    'image/webp',
                  ],
                  onContentInserted: _insertPicture,
                ),
                style: const TextStyle(fontSize: 14.5),
                decoration: InputDecoration(
                  hintText: chosen == null
                      ? 'Describe your design...'
                      : 'Describe your ${chosen.label} design...',
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  disabledBorder: InputBorder.none,
                  filled: false,
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 4,
                    vertical: 12,
                  ),
                ),
              ),
            ),
            IconButton(
              tooltip: 'Upload a reference image',
              onPressed: _busy ? null : () => _pickImage(ImageSource.gallery),
              icon: const Icon(Icons.add_photo_alternate_outlined, size: 22),
            ),
            _busy
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                : IconButton.filled(
                    tooltip: 'Generate designs',
                    onPressed: () => _generate(),
                    style: IconButton.styleFrom(
                      backgroundColor: Palette.cyan,
                      foregroundColor: Colors.black,
                      fixedSize: const Size(44, 44),
                    ),
                    icon: const Icon(Icons.arrow_upward_rounded, size: 22),
                  ),
          ],
        ),
        // Over 3,500 characters: a small counter (the limit in amber).
        if (_text.text.length > maxBrief - 500)
          Align(
            alignment: Alignment.centerRight,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(0, 0, 56, 4),
              child: Text(
                '${formatCount(_text.text.length)} / ${formatCount(maxBrief)}',
                style: TextStyle(
                  fontSize: 11.5,
                  color: _text.text.length >= maxBrief
                      ? const Color(0xffffc46b)
                      : Palette.muted,
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

/// 6 · AI generating: plans four concepts, then renders them.
class AiGeneratingScreen extends StatefulWidget {
  const AiGeneratingScreen(this.c, {super.key});
  final AppController c;
  @override
  State<AiGeneratingScreen> createState() => _AiGeneratingScreenState();
}

class _AiGeneratingScreenState extends State<AiGeneratingScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _spin = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 6),
  )..repeat();
  int _step = 0, _rendered = 0;
  double _progress = .04;
  String? _error;
  Timer? _ease;
  int _run = 0;

  AppController get c => widget.c;

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    _ease?.cancel();
    _spin.dispose();
    super.dispose();
  }

  bool _alive(int run) =>
      mounted && run == _run && c.screen == AppScreen.generating;

  Future<void> _start() async {
    final run = ++_run;
    setState(() {
      _error = null;
      _step = 0;
      _rendered = 0;
      _progress = .04;
    });
    _ease?.cancel();
    _ease = Timer.periodic(const Duration(milliseconds: 200), (_) {
      if (!mounted) return;
      final cap = [.3, .38, .9, .97][_step];
      setState(() => _progress += (cap - _progress) * .03);
    });
    try {
      if (!AiService.enabled) return await _demo(run);
      // The results fill in as each picture arrives: no waiting here.
      _ease?.cancel();
      await Future<void>.delayed(Duration.zero);
      if (!_alive(run)) return;
      startResults(c);
      c.go(AppScreen.concepts);
    } on AiException catch (e) {
      _ease?.cancel();
      if (mounted && run == _run) setState(() => _error = e.message);
    }
  }

  /// Without an API key: four styled sample concepts.
  Future<void> _demo(int run) async {
    await Future<void>.delayed(const Duration(milliseconds: 1400));
    if (!_alive(run)) return;
    const looks = [
      ('Mantis Strike', 0xff0b1016, 0xff00c2cc, 'Chevron', 1),
      ('Gold Standard', 0xff10233f, 0xffffc52f, 'Velocity', 2),
      ('Heritage Bands', 0xff2a0d2c, 0xffe796e4, 'Stripes', 3),
      ('Clean Line', 0xff07203a, 0xff2b92dd, 'Solid', 5),
    ];
    // The garment and sport of the brief (a zip hoodie stays a zip hoodie in the Studio).
    final garment = aiDesignGarments.contains(c.aiGarment)
        ? c.aiGarment!
        : 'Jersey';
    final sport = c.aiSport ?? 'Rugby League';
    c.concepts = [
      for (final (name, main, second, pattern, asset) in looks)
        Concept(
          DesignSpec(
            designName: name,
            detected: '$sport $garment',
            sport: sport,
            garment: garment,
            summary: 'Sample concept (demo mode).',
            findings: const ['Demo concept'],
            mainColor: Color(main),
            secondaryColor: Color(second),
            accentColor: Color(second),
            pattern: pattern,
            fabric: 'Standard',
            logoText: 'MANTIS',
            renderPrompt: '',
            patternMotif: '',
          ),
        )..asset = 'assets/images/project_$asset.png',
    ];
    setState(() => _step = 2);
    for (var i = 0; i < 4; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 450));
      if (!_alive(run)) return;
      setState(() => _rendered++);
    }
    await _finish(run);
  }

  Future<void> _finish(int run) async {
    setState(() {
      _step = 3;
      _progress = 1;
    });
    _ease?.cancel();
    await Future<void>.delayed(const Duration(milliseconds: 700));
    if (_alive(run)) {
      c.selectedConcept = 0;
      c.go(AppScreen.concepts);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = [
      ('Understanding your brief', _step >= 2),
      ('Analysing references', _step >= 2),
      (
        _step == 2
            ? 'Creating design concepts ($_rendered/4)'
            : 'Creating design concepts',
        _step >= 3,
      ),
      ('Preparing 3D garment', _step >= 3 && _progress >= 1),
    ];
    return Column(
      children: [
        TopBar(onBack: c.back),
        const ScreenTitle('Creating your design…', size: 24),
        const SizedBox(height: 6),
        const Text(
          'Analysing your request and generating concepts.',
          style: TextStyle(color: Palette.muted, fontSize: 12),
        ),
        Expanded(child: Center(child: const EmblemLoader(size: 240))),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 26),
          child: Column(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: SizedBox(
                  height: 5,
                  child: Stack(
                    children: [
                      const Positioned.fill(
                        child: ColoredBox(color: Palette.surface2),
                      ),
                      FractionallySizedBox(
                        alignment: Alignment.centerLeft,
                        widthFactor: _progress.clamp(0, 1),
                        child: Container(
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [
                                Color(0xff00e0e4),
                                Color(0xff04c6f3),
                                Color(0xff7560ff),
                              ],
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: Palette.cyan.withValues(alpha: .7),
                                blurRadius: 8,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              for (final (label, done) in rows)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 7),
                  child: Row(
                    children: [
                      done
                          ? const Icon(
                              Icons.check_circle_rounded,
                              color: Palette.cyan,
                              size: 21,
                            )
                          : const SizedBox(
                              width: 21,
                              height: 21,
                              child: Padding(
                                padding: EdgeInsets.all(3),
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              ),
                            ),
                      const SizedBox(width: 12),
                      Flexible(
                        child: Text(
                          label,
                          style: TextStyle(
                            fontSize: 13,
                            color: done ? Palette.text : Palette.muted,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.fromLTRB(14, 8, 6, 8),
                  decoration: BoxDecoration(
                    color: const Color(0x33E92137),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0x88E92137)),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          _error!,
                          style: const TextStyle(fontSize: 11.5),
                        ),
                      ),
                      TextButton(onPressed: _start, child: const Text('Retry')),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 26),
            ],
          ),
        ),
      ],
    );
  }
}

/// The attached reference pictures, each with "Put my design on the 3D kit": the Studio opens and the picture goes
/// on the kit as drawn (AppController.importDesignPicture).
class _ReferencesToKit extends StatelessWidget {
  const _ReferencesToKit(this.c);
  final AppController c;

  static String _name(Uint8List b, int i) {
    final ext = b.length > 3 && b[0] == 0x89 && b[1] == 0x50
        ? 'png'
        : b.length > 11 &&
              b[8] == 0x57 &&
              b[9] == 0x45 &&
              b[10] == 0x42 &&
              b[11] == 0x50
        ? 'webp'
        : 'jpg';
    return 'design-picture-${i + 1}.$ext';
  }

  Future<void> _toKit(BuildContext context, int i) async {
    final messenger = ScaffoldMessenger.of(context);
    void say(String text) => messenger.showSnackBar(
      SnackBar(
        content: Text(text),
        behavior: SnackBarBehavior.floating,
        backgroundColor: Palette.surface2,
      ),
    );
    if (!c.signedIn) {
      say(
        'Sign in to put your design on the 3D kit: the picture is kept with your saved assets.',
      );
      c.go(AppScreen.auth);
      return;
    }
    final bytes = c.references[i];
    c.go(AppScreen.studio);
    // The Studio's 3D kit starts first.
    for (var t = 0; t < 100 && c.checkLayout == null; t++) {
      await Future<void>.delayed(const Duration(milliseconds: 200));
    }
    try {
      final done = await c.importDesignPicture(_name(bytes, i), bytes);
      if (done != null) say(done);
    } on Object catch (e) {
      say(
        e is ApiException
            ? e.message
            : 'That picture could not go on the 3D kit.',
      );
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Your pictures',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        for (final (i, bytes) in c.references.indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                SizedBox(
                  width: 56,
                  height: 56,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: artImage(bytes: bytes),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _toKit(context, i),
                    icon: const Icon(Icons.view_in_ar_outlined, size: 18),
                    label: const Text('Put my design on the 3D kit'),
                  ),
                ),
              ],
            ),
          ),
      ],
    ),
  );
}

/// Generate, fast like ChatGPT (client 2026-10-21; website /ai/designs): the
/// PRIMARY (the brief as written, under the full design rules) starts
/// rendering at once while one planning call gives its 3D kit spec and the
/// three options' directions; then the options render, all in parallel.
/// Medium quality unless "HD primary" is on. A newer Generate or Back to
/// create ends the run, so late pictures are dropped.
void startResults(AppController c) {
  final run = ++c.resultsRun;
  c.newAiSession();
  final primary = Concept(
    DesignSpec(
      designName: 'Your design',
      detected: c.garment,
      summary: 'Your brief, exactly as written.',
      findings: const [],
      mainColor: c.mainColor,
      secondaryColor: c.secondaryColor,
      accentColor: c.accentColor,
      pattern: c.pattern,
      fabric: 'Standard',
      logoText: c.logoText,
      renderPrompt: '',
      patternMotif: '',
      sport: c.sport,
      garment: c.garment,
    ),
    direction: const {'ownDesign': false},
  );
  c.concepts = [primary];
  c.selectedConcept = 0;
  c.planError = null;
  unawaited(
    renderDesign(
      c,
      primary,
      c.wantMockup ? 'high' : 'medium',
      view: 'presentation',
    ),
  );
  unawaited(_planOptions(c, run));
}

Future<void> _planOptions(AppController c, int run) async {
  try {
    final specs = await c.ai.planConcepts(
      brief: c.brief,
      references: c.references,
      mode: c.briefMode,
      sport: c.aiSport,
      garment: c.aiGarment,
    );
    if (run != c.resultsRun || specs.isEmpty) return;
    String hex(Color x) =>
        '#${x.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}';
    final options = [
      for (final spec in specs.skip(1).take(3))
        Concept(
          spec,
          direction: {
            'front': spec.renderPrompt,
            // Its own body colour: the dark body rule is for the primary only.
            'body': hex(spec.mainColor),
            'palette':
                '${hex(spec.mainColor)}, ${hex(spec.secondaryColor)}, ${hex(spec.accentColor)}',
            'ownDesign': false,
          },
        ),
    ];
    c.update(() {
      // The primary keeps its picture and takes the plan's 3D kit spec.
      c.concepts.first.spec = specs.first;
      c.concepts = [...c.concepts.take(1), ...options];
    });
    for (final o in options) {
      unawaited(renderDesign(c, o, 'medium', view: 'presentation'));
    }
  } on AiException catch (e) {
    if (run == c.resultsRun) c.update(() => c.planError = e.message);
  }
}

/// Renders one design (the primary, an option, "Make HD" or "Regenerate");
/// its card fills in when it arrives.
Future<void> renderDesign(
  AppController c,
  Concept o,
  String quality, {
  String? view,
}) async {
  final run = c.resultsRun;
  final v = view ?? o.view ?? 'presentation';
  c.update(() {
    o.busy = true;
    o.pending = quality;
    o.view = v;
    o.error = null;
  });
  try {
    final image = await c.ai.designMockup(
      brief: c.brief,
      sport: c.aiSport ?? c.sport,
      garment: c.aiGarment ?? c.garment,
      logos: c.references,
      direction: o.direction,
      quality: quality,
      view: v,
    );
    if (run != c.resultsRun) return;
    o.image = image;
    o.quality = quality;
    if (quality == 'high') c.artwork.add(image);
  } on AiException catch (e) {
    if (run == c.resultsRun) o.error = e.message;
  } finally {
    if (run == c.resultsRun) {
      c.update(() => o.busy = false);
      // Recent designs: saved once all the designs are in.
      c.saveAiSessionSoon();
    }
  }
}

/// 7 · YOUR DESIGNS, the AI designer's results (client visual 146.jpg, as the
/// website): the heading with a 1 / 4 counter, one large design edge to edge
/// (never cropped or stretched), the other designs as small floating
/// thumbnails in its bottom-right corner, then one compact row (Open in 3D
/// Designer and a download icon) and the slim "Refine this design…" bar,
/// which expands with the original brief. Make HD, Regenerate, Edit image
/// and Customise in 3D Studio are in the ⋯ menu on the picture. Each design
/// keeps its 3D kit spec, so any of them opens in the Studio as a kit.
class ConceptsScreen extends StatefulWidget {
  const ConceptsScreen(this.c, {super.key});
  final AppController c;

  @override
  State<ConceptsScreen> createState() => _ConceptsScreenState();
}

class _ConceptsScreenState extends State<ConceptsScreen> {
  late final _refine = TextEditingController(text: widget.c.brief);

  /// "Refine this design…": the change asked for the selected design (kept
  /// when the bar collapses); the bar expands while it has focus.
  final _change = TextEditingController();
  final _changeFocus = FocusNode();
  bool _refineOpen = false;

  /// The picture each design had before its last refine (⋯ Undo).
  final _previous = Expando<Uint8List>();
  AppController get c => widget.c;

  @override
  void initState() {
    super.initState();
    _changeFocus.addListener(() {
      if (_changeFocus.hasFocus && !_refineOpen && mounted) {
        setState(() => _refineOpen = true);
      }
    });
  }

  @override
  void dispose() {
    _refine.dispose();
    _change.dispose();
    _changeFocus.dispose();
    super.dispose();
  }

  void _say(String text) => ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(text),
      behavior: SnackBarBehavior.floating,
      backgroundColor: Palette.surface2,
    ),
  );

  /// "Customise in 3D Studio": the design's spec as an editable 3D kit.
  void _open(int index) {
    final concept = c.concepts[index];
    if (concept.image != null) c.artwork.add(concept.image!);
    c.openConcept(index);
    // The 3D kit's print pattern follows in the background.
    final spec = concept.spec;
    if (AiService.enabled && spec.patternMotif.isNotEmpty) {
      c.ai.generatePattern(spec.patternMotif).then((tile) {
        c.aiPatterns.add(tile);
        // A design picture put on meanwhile stays as drawn, without it.
        if (identical(c.spec, spec) && c.layout?['kind'] != 'drawing') {
          c.update(() => c.patternTile = tile);
        }
      }, onError: (_) {});
    }
  }

  /// The design shown large (client visual 146.jpg; the primary until a
  /// thumbnail is tapped). Open in 3D Designer, Download, Refine and ⋯ act
  /// on it.
  int get _sel => c.concepts.isEmpty
      ? 0
      : c.selectedConcept.clamp(0, c.concepts.length - 1);

  /// A thumbnail tapped: that design goes large and the one shown moves into
  /// the thumbnails. Each keeps its picture and edits; nothing is rendered
  /// again or charged.
  void _select(int index) => c.update(() => c.selectedConcept = index);

  Future<void> _edit(int index) async {
    final concept = c.concepts[index];
    final edited = await openImageEditor(
      context,
      c,
      bytes: concept.image,
      asset: concept.asset,
      title: 'Design ${index + 1} · ${concept.spec.designName}',
      fileName: '3deezi-design-${index + 1}',
    );
    if (edited == null) return;
    c.update(() => concept.image = edited);
    c.saveAiSessionSoon();
    if (mounted) showToast(context, 'Design picture updated.');
  }

  Future<void> _download(int index) async {
    final concept = c.concepts[index];
    final bytes =
        concept.image ??
        (concept.asset == null
            ? null
            : (await rootBundle.load(concept.asset!)).buffer.asUint8List());
    if (bytes == null || !mounted) return;
    final box = context.findRenderObject() as RenderBox?;
    final message = await shareImage(
      bytes,
      '3deezi-design-${index + 1}.jpg',
      origin: box == null ? null : box.localToGlobal(Offset.zero) & box.size,
    );
    if (mounted) showToast(context, message);
  }

  /// "Open in 3D Designer" (task 9.116): the primary picture read first (one
  /// cheap AI call) for the nearest 3D garment we have and its own colours,
  /// pattern, symbol and lettering (netball: the position letters), opened
  /// on that garment. A singlet, jersey, tee or polo then takes the picture
  /// itself: the same AI draws it flat, front and back, and the design-picture
  /// check puts it on as drawn. Never a refusal: the closest garment, with a
  /// note saying so; any step that fails leaves the kit in the picture's
  /// colours. Sample designs (no AI) open as editable kits.
  Future<void> _openIn3d() async {
    final index = _sel;
    final primary = c.concepts[index];
    final image = primary.image;
    if (image == null) return _open(index);
    // Kept for when this screen has gone (Back to create while drawing).
    final messenger = ScaffoldMessenger.of(context);
    void say(String text) => messenger.showSnackBar(
      SnackBar(
        content: Text(text),
        behavior: SnackBarBehavior.floating,
        backgroundColor: Palette.surface2,
      ),
    );
    final run = c.resultsRun;
    final asked = c.aiGarment ?? c.garment;
    DesignReading? reading;
    if (AiService.enabled) {
      c.update(() => c.readingBusy = true);
      try {
        reading = await c.ai.readDesign(
          image,
          sport: primary.spec.sport,
          garment: asked,
        );
      } on Object {
        reading = null;
      } finally {
        c.update(() => c.readingBusy = false);
      }
      if (c.resultsRun != run || c.screen != AppScreen.concepts) return;
    }
    // Not read (no AI, or the reading failed): the design's own spec on the
    // garment asked for, as before.
    final garment = reading?.garment ?? asked;
    var closest = '';
    if (reading != null) {
      final box = reading.crest;
      final logo =
          c.logoImage ??
          (c.references.isNotEmpty ? c.references.first : null) ??
          (box == null ? null : await cropCrest(image, box));
      final printBox = reading.print;
      final print = printBox == null ? null : await cropPrint(image, printBox);
      if (c.resultsRun != run || c.screen != AppScreen.concepts) return;
      closest = reading.exact
          ? ''
          : 'Shown on our ${garment.toLowerCase()}: the closest 3D garment '
                'to your ${reading.seen.isEmpty ? 'design' : reading.seen}. ';
      c.artwork.add(image);
      c.openReading(index, reading, logo: logo, print: print);
      if (print == null) _printFor(reading.motif);
    }
    // A design picture goes on a singlet, jersey, tee or polo (with or
    // without the pocket) only: other garments take the design's colours,
    // pattern, symbol and lettering.
    if (!DesignReading.drawn.contains(garment) &&
        (reading != null ||
            isHoodie(garment) ||
            isVarsity(garment) ||
            isTrack(garment))) {
      if (reading == null) return _openOnGarment(index, garment);
      say(
        '$closest${closest.isEmpty ? 'Your ${garment.toLowerCase()} takes' : 'It takes'} '
        'your design’s colours, pattern, symbol and lettering.',
      );
      return;
    }
    if (!c.signedIn) {
      if (reading != null) {
        say(
          '${closest}Sign in to put the picture itself on the 3D kit: the '
          'print sheet is kept with your saved assets.',
        );
        return;
      }
      say(
        'Sign in to make it 3D: the print sheet is kept with your saved '
        'assets.',
      );
      c.go(AppScreen.auth);
      return;
    }
    c.mockupImage = image;
    final Uint8List sheet;
    try {
      sheet = await c.mockupPrintSheet(
        frontOnly: primary.view == 'front',
        garment: reading?.garment,
      );
    } on AiException catch (e) {
      if (reading != null) {
        say(
          '${closest}The flat print sheet could not be drawn (${e.message}), '
          'so the kit takes your design’s colours, pattern, symbol and '
          'lettering.',
        );
      } else if (c.screen == AppScreen.concepts) {
        say('Make it 3D: ${e.message}');
      }
      return;
    }
    // Back to the brief, a new Generate or another design opened meanwhile:
    // the user stays where they went; the print sheet is kept in Artwork.
    if (reading == null
        ? c.screen != AppScreen.concepts
        : c.screen != AppScreen.studio || c.selectedConcept != index) {
      say('Your print sheet is ready in Assets › Artwork.');
      return;
    }
    c.go(AppScreen.studio);
    for (var t = 0; t < 100 && c.checkLayout == null; t++) {
      await Future<void>.delayed(const Duration(milliseconds: 200));
    }
    try {
      // A sheet moved apart (AiService.separateHalves) is a PNG.
      final done = await c.importDesignPicture(
        sheet.length > 4 && sheet[0] == 0x89
            ? 'ai-print-sheet.png'
            : 'ai-print-sheet.jpg',
        sheet,
        known: reading != null,
      );
      if (done != null) say('$closest$done');
    } on Object catch (e) {
      say(
        reading != null
            ? '${closest}The picture itself could not go on the 3D kit '
                  '(${e is ApiException ? e.message : 'it was not read'}), so '
                  'the kit takes your design’s colours, pattern, symbol '
                  'and lettering.'
            : e is ApiException
            ? e.message
            : 'The print sheet could not go on the 3D kit.',
      );
    }
  }

  /// The design's spec on [garment] (the picture could not be read): a
  /// hoodie or jacket takes the first attached logo as its crest.
  void _openOnGarment(int index, String garment) {
    _open(index);
    if (c.logoImage == null && c.references.isNotEmpty) {
      c.update(() => c.logoImage = c.references.first);
    }
    if (isHoodie(garment) || isVarsity(garment) || isTrack(garment)) {
      showToast(
        context,
        isTrack(garment)
            ? trackDesignNote
            : isVarsity(garment)
            ? varsityDesignNote
            : hoodieDesignNote,
      );
    }
  }

  /// The 3D kit's print pattern from the picture's motif, in the background
  /// (a design picture put on meanwhile stays as drawn, without it).
  void _printFor(String motif) {
    if (!AiService.enabled || motif.isEmpty) return;
    final spec = c.spec;
    c.ai.generatePattern(motif).then((tile) {
      c.aiPatterns.add(tile);
      if (identical(c.spec, spec) && c.layout?['kind'] != 'drawing') {
        c.update(() => c.patternTile = tile);
      }
    }, onError: (_) {});
  }

  void _backToCreate() {
    c.resultsRun++;
    c.back();
  }

  void _generateAgain() {
    final text = _refine.text.trim();
    if (text.length < 10) {
      _say('Tell us a little more: colours, style or your team name.');
      return;
    }
    FocusScope.of(context).unfocus();
    c.brief = text;
    c.go(AppScreen.generating);
  }

  /// "Refine this design…": the selected picture changed as described by the
  /// AI image editor (the same as Edit image › Describe), in its own
  /// proportions; ⋯ Undo last refine brings the old one back.
  Future<void> _refineSelected() async {
    if (c.concepts.isEmpty) return;
    final o = c.concepts[_sel];
    final text = _change.text.trim();
    if (o.busy) return;
    if (text.length < 3) {
      _say('Describe the change: for example “make the collar gold”.');
      return;
    }
    if (!c.signedIn) {
      _say('Sign in to refine a design with AI: it is kept with your designs.');
      c.go(AppScreen.auth);
      return;
    }
    final image =
        o.image ??
        (o.asset == null
            ? null
            : (await rootBundle.load(o.asset!)).buffer.asUint8List());
    if (image == null || !mounted) return;
    _changeFocus.unfocus();
    setState(() => _refineOpen = false);
    final run = c.resultsRun;
    c.update(() {
      o.busy = true;
      o.pending = 'refine';
    });
    final messenger = ScaffoldMessenger.of(context);
    try {
      final mime = image.isNotEmpty && image[0] == 0x89
          ? 'image/png'
          : 'image/jpeg';
      final answer = await c.api.editImage(
        image: 'data:$mime;base64,${base64Encode(image)}',
        instruction: text,
      );
      if (run != c.resultsRun) return;
      final bytes = base64Decode(answer.substring(answer.indexOf(',') + 1));
      _previous[o] = image;
      c.update(() => o.image = bytes);
      c.saveAiSessionSoon();
      _change.clear();
    } on ApiException catch (e) {
      if (run == c.resultsRun) {
        messenger.showSnackBar(
          SnackBar(
            content: Text('Refine: ${e.message}'),
            behavior: SnackBarBehavior.floating,
            backgroundColor: Palette.surface2,
          ),
        );
      }
    } finally {
      if (run == c.resultsRun) c.update(() => o.busy = false);
    }
  }

  /// The ⋯ menu on the large design: Make HD, Regenerate, Edit image, Undo
  /// last refine, Customise in 3D Studio and the attached pictures on the kit.
  Widget _menu(int index) {
    final o = c.concepts[index];
    final hasPicture = o.image != null || o.asset != null;
    // Designs from the AI (sample designs have no direction to render).
    final ai = o.direction != null;
    return _RoundButton(
      child: PopupMenuButton<String>(
        tooltip: 'Design ${index + 1} actions',
        padding: EdgeInsets.zero,
        icon: const Icon(
          Icons.more_horiz_rounded,
          color: Colors.white,
          size: 20,
        ),
        color: Palette.surface2,
        onSelected: (action) {
          switch (action) {
            case 'hd':
              renderDesign(c, o, 'high', view: 'presentation');
            case 'again':
              renderDesign(c, o, o.quality ?? 'medium');
            case 'edit':
              _edit(index);
            case 'undo':
              final before = _previous[o];
              if (before != null) {
                _previous[o] = null;
                c.update(() => o.image = before);
                c.saveAiSessionSoon();
              }
            case 'studio':
              _open(index);
            case 'player':
              final s = o.spec;
              openPlayerShot(
                context,
                c,
                PlayerKit(
                  pictures: [?o.image],
                  sport: c.sport,
                  garment: s.garment,
                  name: s.designName,
                  // The AI picture shows the true colours: no colour list.
                  logoText: s.logoText,
                  backName: s.logoText,
                ),
              );
            default:
              if (action.startsWith('picture-')) {
                _ReferencesToKit(
                  c,
                )._toKit(context, int.parse(action.substring(8)));
              }
          }
        },
        itemBuilder: (_) => [
          if (ai && o.quality != 'high')
            PopupMenuItem(
              value: 'hd',
              enabled: !o.busy,
              child: const Text('Make HD · 10 credits'),
            ),
          if (ai)
            PopupMenuItem(
              value: 'again',
              enabled: !o.busy,
              child: const Text('Regenerate this design'),
            ),
          if (hasPicture)
            PopupMenuItem(
              value: 'edit',
              enabled: !o.busy,
              child: const Text('Edit image'),
            ),
          if (_previous[o] != null)
            PopupMenuItem(
              value: 'undo',
              enabled: !o.busy,
              child: const Text('Undo last refine'),
            ),
          if (ai && o.image != null)
            PopupMenuItem(
              value: 'player',
              enabled: !o.busy,
              child: const Text('See it on a player'),
            ),
          const PopupMenuItem(
            value: 'studio',
            child: Text('Customise in 3D Studio'),
          ),
          for (var i = 0; i < c.references.length; i++)
            PopupMenuItem(
              value: 'picture-$i',
              child: Text(
                c.references.length == 1
                    ? 'Put my design on the 3D kit'
                    : 'Put my design ${i + 1} on the 3D kit',
              ),
            ),
        ],
      ),
    );
  }

  Widget _picture(Concept? o, {required bool big, BoxFit? fit}) {
    if (o == null) {
      // Waiting for the plan while a Generate runs; otherwise nothing yet.
      return Center(
        child: c.concepts.isEmpty || c.planError != null
            ? const Icon(Icons.image_outlined, color: Palette.muted)
            : const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
      );
    }
    final hasPicture = o.image != null || o.asset != null;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (hasPicture)
          artImage(
            bytes: o.image,
            asset: o.asset,
            fit: fit ?? (big ? BoxFit.contain : BoxFit.cover),
          )
        else if (o.busy)
          Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (big)
                const EmblemLoader(size: 110)
              else
                const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              if (big) ...[
                const SizedBox(height: 8),
                Text(
                  o.pending == 'high'
                      ? 'Rendering your HD design… about a minute'
                      : 'Rendering your design… about 40 seconds',
                  style: const TextStyle(fontSize: 12, color: Palette.muted),
                ),
              ],
            ],
          )
        else if (!big)
          const Center(
            child: Icon(Icons.refresh_rounded, color: Color(0xffffb4b4)),
          )
        else
          Center(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    o.error ?? 'No picture yet.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 12.5),
                  ),
                  if (o.direction != null && o.error != null)
                    TextButton(
                      onPressed: () => renderDesign(
                        c,
                        o,
                        o.pending == 'high' ? 'high' : 'medium',
                      ),
                      child: const Text('Try again'),
                    ),
                ],
              ),
            ),
          ),
        if (hasPicture && o.busy)
          ColoredBox(
            color: const Color(0x8802060b),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const CircularProgressIndicator(strokeWidth: 2),
                  if (big) ...[
                    const SizedBox(height: 10),
                    Text(
                      o.pending == 'refine'
                          ? 'Refining this design… about a minute'
                          : o.pending == 'high' && o.quality != 'high'
                          ? 'Rendering in HD… about a minute'
                          : 'Regenerating…',
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: Palette.cyan,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
      ],
    );
  }

  /// Full screen: the selected picture alone, pinch to zoom; closing returns
  /// to the same design.
  void _fullScreen(Concept o) => Navigator.of(context).push(
    PageRouteBuilder<void>(
      pageBuilder: (context, _, _) => _FullScreenPicture(o),
      transitionsBuilder: (_, animation, _, child) =>
          FadeTransition(opacity: animation, child: child),
    ),
  );

  /// One card of another design: a translucent dark frame with a thin cyan
  /// border and the design's number, the picture whole over its blurred
  /// backdrop; tap to show it large.
  Widget _thumb(int index) {
    final o = index < c.concepts.length ? c.concepts[index] : null;
    final ready =
        o != null &&
        (o.image != null ||
            o.asset != null ||
            o.error != null ||
            o.direction == null);
    final hasPicture = o != null && (o.image != null || o.asset != null);
    return Semantics(
      button: true,
      label: 'Design ${index + 1}: show this design',
      child: GestureDetector(
        key: ValueKey('thumb-$index'),
        onTap: ready ? () => _select(index) : null,
        child: Container(
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            color: const Color(0x9902060b),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Palette.cyan.withValues(alpha: .8)),
            boxShadow: const [
              BoxShadow(color: Color(0xbb000000), blurRadius: 14),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(9),
            child: Stack(
              fit: StackFit.expand,
              children: [
                const ColoredBox(color: Color(0xff02070d)),
                if (hasPicture) ...[
                  ImageFiltered(
                    imageFilter: ui.ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                    child: artImage(bytes: o.image, asset: o.asset),
                  ),
                  const ColoredBox(color: Color(0x88000000)),
                ],
                _picture(o, big: false, fit: BoxFit.contain),
                Positioned(
                  top: 4,
                  left: 4,
                  child: Container(
                    width: 22,
                    height: 22,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xc702060b),
                      border: Border.all(color: Palette.cyan, width: 1.5),
                    ),
                    child: Text(
                      '${index + 1}',
                      style: const TextStyle(
                        color: Palette.cyan,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// The other designs as bigger cards (client 2026-10-30, 240.jpg): stacked
  /// in a column beside the large design on wide screens, in a row under it
  /// on phones. Page elements only: never in a download.
  Widget _others(List<int> others, {required bool wide}) {
    if (others.isEmpty) return const SizedBox.shrink();
    if (!wide) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        child: LayoutBuilder(
          builder: (context, box) => SizedBox(
            key: const ValueKey('design-others'),
            height: (box.maxWidth * .24).clamp(78.0, 120.0),
            child: Row(
              children: [
                for (final (n, i) in others.indexed) ...[
                  if (n > 0) const SizedBox(width: 8),
                  Expanded(child: _thumb(i)),
                ],
              ],
            ),
          ),
        ),
      );
    }
    return LayoutBuilder(
      builder: (context, box) {
        const gap = 14.0, hint = 22.0;
        final h = math.max(
          0.0,
          math.min(
            300.0,
            (box.maxHeight - hint - gap * (others.length - 1)) / others.length,
          ),
        );
        return Column(
          key: const ValueKey('design-others'),
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(
              height: hint,
              child: Text(
                'Tap to switch',
                key: ValueKey('tap-to-switch'),
                textAlign: TextAlign.center,
                softWrap: false,
                style: TextStyle(fontSize: 12, color: Color(0xffc9d6e2)),
              ),
            ),
            for (final (n, i) in others.indexed) ...[
              if (n > 0) const SizedBox(height: gap),
              SizedBox(height: h, child: _thumb(i)),
            ],
          ],
        );
      },
    );
  }

  /// The large design in a wide frame over all the space it has (client
  /// 2026-10-30: bigger, not so narrow), the picture centred at its own
  /// proportions over its blurred backdrop (never cropped or stretched), with
  /// ⋯ and full screen.
  Widget _viewer(
    Concept? primary,
    int sel, {
    required bool wide,
  }) => LayoutBuilder(
    builder: (context, box) {
      final hasPicture = primary?.image != null || primary?.asset != null;
      final ratio =
          (primary?.image == null ? null : pictureRatio(primary!.image!)) ??
          (primary?.image == null && primary?.asset != null
              // The bundled sample pictures (demo mode) are landscape.
              ? 1.5
              : primary?.view == 'front'
              ? 1.0
              : 2 / 3);
      final l = resultsLayout(
        box.maxWidth,
        box.maxHeight,
        ratio,
        picture: hasPicture,
      );
      final radius = BorderRadius.circular(wide ? 16 : 0);
      return Container(
        key: const ValueKey('design-viewer'),
        width: box.maxWidth,
        height: box.maxHeight,
        foregroundDecoration: wide
            ? BoxDecoration(
                borderRadius: radius,
                border: Border.all(color: Palette.cyan.withValues(alpha: .25)),
              )
            : null,
        child: Stack(
          children: [
            Positioned.fill(
              child: ClipRRect(
                borderRadius: radius,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    const ColoredBox(color: Color(0xff02070d)),
                    if (hasPicture) ...[
                      ImageFiltered(
                        imageFilter: ui.ImageFilter.blur(
                          sigmaX: 22,
                          sigmaY: 22,
                        ),
                        child: artImage(
                          bytes: primary!.image,
                          asset: primary.asset,
                        ),
                      ),
                      const ColoredBox(color: Color(0x99000000)),
                    ],
                  ],
                ),
              ),
            ),
            Positioned(
              left: l.left,
              top: l.top,
              width: l.iw,
              height: l.ih,
              child: ClipRect(
                key: ValueKey('design-$sel-picture'),
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 240),
                  child: KeyedSubtree(
                    key: ValueKey('design-$sel-${identityHashCode(primary)}'),
                    child: _picture(primary, big: true),
                  ),
                ),
              ),
            ),
            if (primary != null)
              Positioned(
                top: 8,
                right: 8,
                child: Row(
                  children: [
                    _menu(sel),
                    if (hasPicture) ...[
                      const SizedBox(width: 8),
                      _RoundButton(
                        child: IconButton(
                          tooltip: 'Full screen',
                          padding: EdgeInsets.zero,
                          onPressed: () => _fullScreen(primary),
                          icon: const Icon(
                            Icons.fullscreen_rounded,
                            color: Colors.white,
                            size: 22,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
          ],
        ),
      );
    },
  );

  void _collapse() {
    _changeFocus.unfocus();
    if (_refineOpen) setState(() => _refineOpen = false);
  }

  /// The slim "Refine this design…" bar; focused, it expands with the
  /// original brief (edit it for four new designs). Its text is kept.
  Widget _refineBar(bool canRefine) => AnimatedContainer(
    duration: const Duration(milliseconds: 180),
    padding: const EdgeInsets.fromLTRB(14, 2, 4, 2),
    decoration: BoxDecoration(
      color: const Color(0xe6050c14),
      borderRadius: BorderRadius.circular(_refineOpen ? 20 : 28),
      border: Border.all(color: Palette.cyan.withValues(alpha: .7)),
      boxShadow: [
        BoxShadow(color: Palette.cyan.withValues(alpha: .12), blurRadius: 16),
      ],
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Icon(
              Icons.auto_awesome_outlined,
              color: Palette.cyan,
              size: 19,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                key: const ValueKey('refine-design'),
                controller: _change,
                focusNode: _changeFocus,
                minLines: 1,
                maxLines: _refineOpen ? 4 : 1,
                maxLength: 1000,
                style: const TextStyle(fontSize: 14.5),
                scrollPadding: const EdgeInsets.all(120),
                decoration: const InputDecoration(
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  filled: false,
                  isDense: true,
                  contentPadding: EdgeInsets.symmetric(vertical: 13),
                  counterText: '',
                  hintText: 'Refine this design…',
                ),
                onChanged: (_) => setState(() {}),
              ),
            ),
            if (_refineOpen)
              IconButton(
                tooltip: 'Collapse',
                onPressed: _collapse,
                icon: const Icon(Icons.expand_more_rounded),
              ),
            IconButton.filled(
              tooltip: 'Refine this design',
              onPressed: canRefine && _change.text.trim().isNotEmpty
                  ? _refineSelected
                  : null,
              style: IconButton.styleFrom(
                backgroundColor: Palette.cyan,
                foregroundColor: Colors.black,
                disabledBackgroundColor: Palette.cyan.withValues(alpha: .3),
              ),
              icon: const Icon(Icons.send_rounded, size: 19),
            ),
          ],
        ),
        if (_refineOpen) ...[
          const Divider(height: 8),
          const Padding(
            padding: EdgeInsets.only(top: 4),
            child: Text(
              'YOUR ORIGINAL BRIEF · EDIT IT FOR FOUR NEW DESIGNS',
              style: TextStyle(
                fontSize: 10,
                letterSpacing: 1.1,
                fontWeight: FontWeight.w700,
                color: Palette.muted,
              ),
            ),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  key: const ValueKey('refine-brief'),
                  controller: _refine,
                  minLines: 1,
                  maxLines: 4,
                  style: const TextStyle(fontSize: 13.5),
                  scrollPadding: const EdgeInsets.all(120),
                  decoration: const InputDecoration(
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    filled: false,
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(vertical: 12),
                    hintText: 'Your brief, or a new design…',
                  ),
                ),
              ),
              IconButton.filled(
                tooltip: 'Generate again',
                onPressed: _generateAgain,
                style: IconButton.styleFrom(
                  backgroundColor: Palette.blue,
                  foregroundColor: Colors.white,
                ),
                icon: const Icon(Icons.arrow_upward_rounded),
              ),
            ],
          ),
        ],
      ],
    ),
  );

  // Rebuilt on every change of the designs (a picture in, a switch, a refine).
  @override
  Widget build(BuildContext context) =>
      ListenableBuilder(listenable: c, builder: (context, _) => _page());

  Widget _page() {
    final list = c.concepts;
    final sel = _sel;
    final primary = list.isEmpty ? null : list[sel];
    final hasPicture = primary?.image != null || primary?.asset != null;
    // Four designs: while the plan is written the three options' places wait.
    final total =
        list.length == 1 && c.planError == null && list.first.direction != null
        ? 4
        : list.length;
    final others = [
      if (primary != null)
        for (var i = 0; i < total; i++)
          if (i != sel) i,
    ];
    final width = MediaQuery.sizeOf(context).width;
    // Wide screens: the other designs in a column at the right (240.jpg).
    final wide = width >= 720;
    final side = (width * .17).clamp(150.0, 250.0);
    return Column(
      children: [
        TopBar(
          onBack: _backToCreate,
          title: 'Your designs',
          trailing: [
            if (total > 0)
              Padding(
                padding: const EdgeInsets.only(right: 4),
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: '${sel + 1}',
                        style: const TextStyle(color: Palette.cyan),
                      ),
                      TextSpan(text: ' / $total'),
                    ],
                  ),
                  key: const ValueKey('design-counter'),
                  semanticsLabel: 'Design ${sel + 1} of $total',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Palette.muted,
                    letterSpacing: .5,
                  ),
                ),
              ),
          ],
        ),
        Expanded(
          child: wide
              ? Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(child: _viewer(primary, sel, wide: true)),
                      const SizedBox(width: _sideGap),
                      SizedBox(width: side, child: _others(others, wide: true)),
                    ],
                  ),
                )
              : _viewer(primary, sel, wide: false),
        ),
        if (!wide) _others(others, wide: false),
        TapRegion(
          onTapOutside: (_) => _collapse(),
          child: Padding(
            // Wide: the controls under the large design, as wide as it.
            padding: wide
                ? EdgeInsets.fromLTRB(16, 10, 16 + side + _sideGap, 10)
                : const EdgeInsets.fromLTRB(12, 8, 12, 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (!_refineOpen) ...[
                  Row(
                    children: [
                      Expanded(
                        child: GradientButton(
                          label: c.readingBusy
                              ? 'Reading your design…'
                              : c.sheetBusy
                              ? 'Drawing the print sheet…'
                              : 'Open in 3D Designer',
                          icon: Icons.view_in_ar_outlined,
                          onPressed:
                              primary == null ||
                                  c.sheetBusy ||
                                  c.readingBusy ||
                                  !hasPicture
                              ? null
                              : _openIn3d,
                        ),
                      ),
                      const SizedBox(width: 10),
                      SizedBox(
                        width: 58,
                        height: 52,
                        child: OutlinedButton(
                          key: const ValueKey('download-design'),
                          onPressed: hasPicture ? () => _download(sel) : null,
                          style: OutlinedButton.styleFrom(
                            padding: EdgeInsets.zero,
                            foregroundColor: Palette.cyan,
                            side: BorderSide(
                              color: Palette.cyan.withValues(alpha: .8),
                              width: 1.5,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(13),
                            ),
                          ),
                          child: Tooltip(
                            message: 'Download design ${sel + 1}',
                            child: const Icon(Icons.download_rounded, size: 24),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                ],
                // Clear of the 3DEEZI ASSIST button beside it.
                Padding(
                  padding: const EdgeInsets.only(right: 60),
                  child: _refineBar(hasPicture && !(primary?.busy ?? true)),
                ),
                if (c.planError != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      'More designs: ${c.planError}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Palette.muted,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// The gap between the large design and the column of the other designs.
const _sideGap = 20.0;

/// A small round translucent button on the picture (⋯, full screen).
class _RoundButton extends StatelessWidget {
  const _RoundButton({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    width: 40,
    height: 40,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: const Color(0xb30a1520),
      border: Border.all(color: const Color(0x2effffff)),
    ),
    child: Center(child: child),
  );
}

/// The selected design alone, full screen: pinch (or double-tap) to zoom,
/// drag to pan; × returns to the same design.
class _FullScreenPicture extends StatelessWidget {
  const _FullScreenPicture(this.o);
  final Concept o;
  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: const Color(0xff010409),
    body: Stack(
      children: [
        Positioned.fill(
          child: InteractiveViewer(
            key: const ValueKey('full-screen-zoom'),
            minScale: 1,
            maxScale: 6,
            child: Center(
              child: artImage(
                bytes: o.image,
                asset: o.asset,
                fit: BoxFit.contain,
              ),
            ),
          ),
        ),
        SafeArea(
          child: Align(
            alignment: Alignment.topRight,
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: _RoundButton(
                child: IconButton(
                  tooltip: 'Close full screen',
                  padding: EdgeInsets.zero,
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded, color: Colors.white),
                ),
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

/// Where the large design goes in its [w]×[h] frame, for a picture of aspect
/// [ar] (width / height): as big as it fits, centred, never cropped or
/// stretched (the website's viewerLayout); with no picture, the whole frame.
({double iw, double ih, double left, double top}) resultsLayout(
  double w,
  double h,
  double ar, {
  bool picture = true,
}) {
  if (!picture) return (iw: w, ih: h, left: 0.0, top: 0.0);
  final iw = math.max(0.0, math.min(w, h * ar));
  final ih = ar > 0 ? iw / ar : 0.0;
  return (
    iw: iw,
    ih: ih,
    left: ((w - iw) / 2).roundToDouble(),
    top: ((h - ih) / 2).roundToDouble(),
  );
}

/// A picture's width / height from its PNG or JPEG header (null: unknown).
double? pictureRatio(Uint8List b) {
  if (b.length > 24 && b[0] == 0x89 && b[1] == 0x50) {
    final w = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
    final h = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
    return w > 0 && h > 0 ? w / h : null;
  }
  if (b.length > 4 && b[0] == 0xff && b[1] == 0xd8) {
    var i = 2;
    while (i + 9 < b.length) {
      if (b[i] != 0xff) {
        i++;
        continue;
      }
      final m = b[i + 1];
      if (m == 0xd8 || m == 0x01 || m == 0xff || (m >= 0xd0 && m <= 0xd7)) {
        i += m == 0xff ? 1 : 2;
        continue;
      }
      final length = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m != 0xc4 && m != 0xc8 && m != 0xcc) {
        final h = (b[i + 5] << 8) | b[i + 6];
        final w = (b[i + 7] << 8) | b[i + 8];
        return w > 0 && h > 0 ? w / h : null;
      }
      i += 2 + length;
    }
  }
  return null;
}

/// Said when an AI design opens on the varsity jacket (no design picture on it yet).
const varsityDesignNote =
    'The varsity jacket takes your design’s colours and logo; full print '
    'designs on it are coming.';

/// Said when an AI design opens on the track jacket (no design picture on it yet).
const trackDesignNote =
    'The track jacket takes your design’s colours and logo; full print '
    'designs on it are coming.';

/// Said when an AI design opens on a hoodie (no design picture on hoodies yet).
const hoodieDesignNote =
    'Hoodies take your design’s colours and logo; full print designs on '
    'hoodies are coming.';

/// The club symbol cut from an AI picture ([box] in fractions of it, with a
/// little margin), as a small PNG for the 3D kit's chest (task 9.116).
Future<Uint8List?> cropCrest(Uint8List picture, Rect box) async {
  try {
    final codec = await ui.instantiateImageCodec(picture);
    final image = (await codec.getNextFrame()).image;
    final w = image.width.toDouble(), h = image.height.toDouble();
    const pad = 0.12;
    final src = Rect.fromLTRB(
      math.max(0, (box.left - box.width * pad) * w),
      math.max(0, (box.top - box.height * pad) * h),
      math.min(w, (box.right + box.width * pad) * w),
      math.min(h, (box.bottom + box.height * pad) * h),
    );
    if (src.width < 8 || src.height < 8) return null;
    final k = math.min(1.0, 320 / math.max(src.width, src.height));
    final out = Size(
      (src.width * k).roundToDouble(),
      (src.height * k).roundToDouble(),
    );
    final recorder = ui.PictureRecorder();
    Canvas(recorder).drawImageRect(
      image,
      src,
      Offset.zero & out,
      Paint()..filterQuality = FilterQuality.high,
    );
    final crest = await recorder.endRecording().toImage(
      out.width.toInt(),
      out.height.toInt(),
    );
    final data = await crest.toByteData(format: ui.ImageByteFormat.png);
    return data?.buffer.asUint8List();
  } on Object {
    return null;
  }
}

/// The viewer's mark for a full-colour print patch (viewer texture.js
/// PRINT_MARK): two exact pixels at its top left.
const printMark = [
  [3, 222, 177],
  [17, 61, 233],
];

/// A patch of the AI picture's own print ([box] in fractions of it, a little
/// inside its edges), as a marked PNG the 3D kit lays all over the body
/// (task 9.126).
Future<Uint8List?> cropPrint(Uint8List picture, Rect box) async {
  try {
    final codec = await ui.instantiateImageCodec(picture);
    final image = (await codec.getNextFrame()).image;
    final w = image.width.toDouble(), h = image.height.toDouble();
    const inset = 0.08;
    final src = Rect.fromLTWH(
      (box.left + box.width * inset) * w,
      (box.top + box.height * inset) * h,
      box.width * (1 - 2 * inset) * w,
      box.height * (1 - 2 * inset) * h,
    );
    if (src.width < 24 || src.height < 24) return null;
    final k = math.min(1.0, 512 / math.max(src.width, src.height));
    final ow = (src.width * k).round(), oh = (src.height * k).round();
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder)
      ..drawImageRect(
        image,
        src,
        Rect.fromLTWH(0, 0, ow.toDouble(), oh.toDouble()),
        Paint()..filterQuality = FilterQuality.high,
      );
    for (var i = 0; i < printMark.length; i++) {
      final [r, g, b] = printMark[i];
      canvas.drawRect(
        Rect.fromLTWH(i.toDouble(), 0, 1, 1),
        Paint()
          ..color = Color.fromARGB(255, r, g, b)
          ..isAntiAlias = false,
      );
    }
    final out = await recorder.endRecording().toImage(ow, oh);
    final data = await out.toByteData(format: ui.ImageByteFormat.png);
    return data?.buffer.asUint8List();
  } on Object {
    return null;
  }
}
