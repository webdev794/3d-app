import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../ai_service.dart';
import '../api_client.dart' show ApiException;
import '../app_controller.dart';
import '../export_service.dart';
import '../widgets/ai_stage.dart';
import '../widgets/flow_ui.dart';
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
  void _generate([String? garmentChoice]) {
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
    });
    c.go(AppScreen.generating);
  }

  @override
  Widget build(BuildContext context) {
    final chosen = aiQuickSports.where((s) => s.id == _tile).firstOrNull;
    final width = MediaQuery.sizeOf(context).width;
    final garments =
        (chosen ?? sportInBrief(_text.text))?.garments ?? aiAllGarments;
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
                                for (final g in garments)
                                  ActionChipPill(g, onTap: () => _generate(g)),
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
                                  'HD presentation mockup',
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    color: Color(0xffb9c7d4),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        const SizedBox(height: 18),
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
      if (!c.mockupBusy && c.mockupImage == null) unawaited(c.startMockup());
      final specs = await c.ai.planConcepts(
        brief: c.brief,
        references: c.references,
        mode: c.briefMode,
        sport: c.aiSport,
        garment: c.aiGarment,
      );
      if (!_alive(run)) return;
      c.concepts = specs.map(Concept.new).toList();
      setState(() => _step = 2);
      await Future.wait([
        for (final concept in c.concepts)
          c.ai
              .renderConcept(concept.spec, references: c.references)
              .then((image) => concept.image = image)
              .catchError((Object e) {
                concept.error = '$e';
                return Uint8List(0);
              })
              .whenComplete(() {
                if (mounted) setState(() => _rendered++);
              }),
      ]);
      if (!_alive(run)) return;
      if (c.concepts.every((x) => x.image == null)) {
        throw AiException(c.concepts.first.error ?? 'Rendering failed.');
      }
      await _finish(run);
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
    c.concepts = [
      for (final (name, main, second, pattern, asset) in looks)
        Concept(
          DesignSpec(
            designName: name,
            detected: 'Rugby League Jersey',
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
                      Text(
                        label,
                        style: TextStyle(
                          fontSize: 13,
                          color: done ? Palette.text : Palette.muted,
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

/// 7 · Choose one of the four AI concepts.
class ConceptsScreen extends StatelessWidget {
  const ConceptsScreen(this.c, {super.key});
  final AppController c;

  void _open(BuildContext context) {
    final concept = c.concepts[c.selectedConcept];
    if (concept.image != null) c.artwork.add(concept.image!);
    c.openConcept(c.selectedConcept);
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

  /// The image editor on a concept's picture; Use replaces the picture.
  Future<void> _edit(BuildContext context, int index) async {
    final concept = c.concepts[index];
    final edited = await openImageEditor(
      context,
      c,
      bytes: concept.image,
      asset: concept.asset,
      title: 'Concept ${index + 1} · ${concept.spec.designName}',
      fileName: '3deezi-concept-${index + 1}',
    );
    if (edited == null) return;
    c.update(() => concept.image = edited);
    if (context.mounted) showToast(context, 'Concept picture updated.');
  }

  @override
  Widget build(BuildContext context) {
    final selected = c.concepts.isEmpty
        ? null
        : c.concepts[c.selectedConcept.clamp(0, c.concepts.length - 1)];
    return Column(
      children: [
        TopBar(
          onBack: c.back,
          title: 'Choose a design',
          trailing: [
            IconButton(
              tooltip: 'New concepts',
              onPressed: () => c.go(AppScreen.generating),
              icon: const Icon(Icons.refresh_rounded, color: Palette.cyan),
            ),
          ],
        ),
        Expanded(
          child: CustomScrollView(
            slivers: [
              if (c.mockupBusy ||
                  c.mockupImage != null ||
                  c.mockupError != null)
                SliverToBoxAdapter(child: _MockupCard(c)),
              // Each attached reference picture can go straight onto the 3D kit, as on the website.
              if (c.references.isNotEmpty)
                SliverToBoxAdapter(child: _ReferencesToKit(c)),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                sliver: SliverGrid.builder(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    childAspectRatio: .8,
                  ),
                  itemCount: c.concepts.length,
                  itemBuilder: (context, i) {
                    final concept = c.concepts[i];
                    final isSelected = i == c.selectedConcept;
                    return GlowCard(
                      selected: isSelected,
                      glow: isSelected,
                      onTap: () => c.update(() => c.selectedConcept = i),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          concept.image != null || concept.asset != null
                              ? artImage(
                                  bytes: concept.image,
                                  asset: concept.asset,
                                )
                              : const Center(
                                  child: Text(
                                    'Render failed',
                                    style: TextStyle(color: Palette.muted),
                                  ),
                                ),
                          Align(
                            alignment: Alignment.bottomLeft,
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.fromLTRB(10, 16, 10, 8),
                              decoration: const BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Color(0x00000000),
                                    Color(0xdd000000),
                                  ],
                                ),
                              ),
                              child: Text(
                                concept.spec.designName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                          if (isSelected)
                            const Positioned(
                              top: 8,
                              right: 8,
                              child: Icon(
                                Icons.check_circle_rounded,
                                color: Palette.cyan,
                                size: 22,
                              ),
                            ),
                          if (concept.image != null || concept.asset != null)
                            Positioned(
                              top: 6,
                              left: 6,
                              child: EditImageChip(
                                onTap: () => _edit(context, i),
                              ),
                            ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
        if (selected != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 4, 22, 0),
            child: Text(
              selected.spec.summary,
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Palette.muted,
                fontSize: 12,
                height: 1.45,
              ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(22, 14, 22, 20),
          child: GradientButton(
            label: 'OPEN IN DESIGN STUDIO',
            icon: Icons.arrow_forward_rounded,
            // Not while MAKE IT 3D is drawing: it opens the Studio by itself
            // with the print sheet (the concept would start its own print).
            onPressed: selected == null || c.sheetBusy
                ? null
                : () => _open(context),
          ),
        ),
      ],
    );
  }
}

/// The one-prompt HD presentation mockup on the concepts screen.
class _MockupCard extends StatelessWidget {
  const _MockupCard(this.c);
  final AppController c;

  /// "Make it 3D": the mockup drawn flat (front and back) by the same AI,
  /// then on the 3D kit through the design-picture check, in one tap.
  Future<void> _makeIt3d(BuildContext context) async {
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
        'Sign in to make it 3D: the print sheet is kept with your saved '
        'assets.',
      );
      c.go(AppScreen.auth);
      return;
    }
    final Uint8List sheet;
    try {
      sheet = await c.mockupPrintSheet();
    } on AiException catch (e) {
      if (c.screen == AppScreen.concepts) say('Make it 3D: ${e.message}');
      return;
    }
    // Back to the brief (or new concepts) meanwhile: the user stays where
    // they went; the print sheet is kept in Artwork.
    if (c.screen != AppScreen.concepts) {
      say('Your print sheet is ready in Assets › Artwork.');
      return;
    }
    c.go(AppScreen.studio);
    // The Studio's 3D kit starts first.
    for (var t = 0; t < 100 && c.checkLayout == null; t++) {
      await Future<void>.delayed(const Duration(milliseconds: 200));
    }
    try {
      final done = await c.importDesignPicture('ai-print-sheet.jpg', sheet);
      if (done != null) say(done);
    } on Object catch (e) {
      say(
        e is ApiException
            ? e.message
            : 'The print sheet could not go on the 3D kit.',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final image = c.mockupImage;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
      child: GlowCard(
        selected: image != null,
        onTap: image == null
            ? null
            : () => showDialog<void>(
                context: context,
                builder: (_) => Dialog.fullscreen(
                  backgroundColor: Colors.black,
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: InteractiveViewer(
                          maxScale: 5,
                          child: Image.memory(image, fit: BoxFit.contain),
                        ),
                      ),
                      Positioned(
                        top: 40,
                        right: 12,
                        child: IconButton.filled(
                          onPressed: () => Navigator.pop(context),
                          icon: const Icon(Icons.close),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AspectRatio(
              aspectRatio: 3 / 2,
              child: image != null
                  ? Image.memory(image, fit: BoxFit.cover)
                  : c.mockupError != null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(
                          'Mockup not created: ${c.mockupError}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                    )
                  : const Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        EmblemLoader(size: 120),
                        SizedBox(height: 8),
                        Text(
                          'Rendering your HD mockup… about a minute',
                          style: TextStyle(fontSize: 12, color: Palette.muted),
                        ),
                      ],
                    ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
              child: Row(
                children: [
                  const Icon(Icons.auto_awesome, color: Palette.cyan, size: 18),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'HD MOCKUP · ONE PROMPT',
                      style: TextStyle(
                        fontSize: 11.5,
                        letterSpacing: 1.4,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  if (image != null)
                    TextButton.icon(
                      onPressed: () async {
                        final edited = await openImageEditor(
                          context,
                          c,
                          bytes: image,
                          title: 'HD mockup',
                          fileName: '3deezi-mockup',
                        );
                        if (edited == null) return;
                        c.update(() {
                          c.mockupImage = edited;
                          c.artwork.add(edited);
                        });
                        if (context.mounted) {
                          showToast(
                            context,
                            'Mockup updated · also saved in Assets › Artwork.',
                          );
                        }
                      },
                      icon: const Icon(Icons.edit_outlined, size: 17),
                      label: const Text('Edit'),
                    ),
                  if (image != null)
                    TextButton.icon(
                      onPressed: () async {
                        final box = context.findRenderObject() as RenderBox?;
                        final message = await shareImage(
                          image,
                          '3deezi-mockup.jpg',
                          origin: box == null
                              ? null
                              : box.localToGlobal(Offset.zero) & box.size,
                        );
                        if (context.mounted) showToast(context, message);
                      },
                      icon: const Icon(Icons.ios_share, size: 17),
                      label: const Text('Save / share'),
                    ),
                ],
              ),
            ),
            if (c.mockupDirection != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
                child: Text(
                  c.mockupDirection!,
                  style: const TextStyle(fontSize: 12.5, height: 1.35),
                ),
              ),
            if (image != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
                child: FilledButton.icon(
                  onPressed: c.sheetBusy ? null : () => _makeIt3d(context),
                  icon: c.sheetBusy
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.view_in_ar_outlined, size: 18),
                  label: Text(
                    c.sheetBusy
                        ? 'Drawing the print sheet… about a minute'
                        : 'MAKE IT 3D',
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
