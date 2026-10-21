import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../ai_service.dart';
import '../api_client.dart' show ApiException;
import '../app_controller.dart';
import '../design_document.dart' show isHoodie;
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
                                  'HD primary',
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
      unawaited(renderDesign(c, o, 'medium', view: 'front'));
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
  final v = view ?? o.view ?? 'front';
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
    if (run == c.resultsRun) c.update(() => o.busy = false);
  }
}

/// 7 · The AI designer's results (client visual 138.jpg): the PRIMARY DESIGN
/// card with Open in 3D Designer and Download, a row of three options, then
/// the prompt bar with the brief to refine it. Each design keeps its 3D kit
/// spec, so any of them opens in the Studio as an editable kit.
class ConceptsScreen extends StatefulWidget {
  const ConceptsScreen(this.c, {super.key});
  final AppController c;

  @override
  State<ConceptsScreen> createState() => _ConceptsScreenState();
}

class _ConceptsScreenState extends State<ConceptsScreen> {
  late final _refine = TextEditingController(text: widget.c.brief);
  AppController get c => widget.c;

  @override
  void dispose() {
    _refine.dispose();
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

  /// "Make primary": the option swaps places with the primary at once.
  void _makePrimary(int index) => c.update(() {
    final list = [...c.concepts];
    final first = list[0];
    list[0] = list[index];
    list[index] = first;
    c.concepts = list;
    c.selectedConcept = 0;
  });

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

  /// "Open in 3D Designer" (MAKE IT 3D): the primary drawn flat, front and
  /// back, by the same AI, then on the 3D kit through the design-picture
  /// check. Sample designs (no AI) open as editable kits.
  Future<void> _openIn3d() async {
    final primary = c.concepts.first;
    final image = primary.image;
    if (image == null) return _open(0);
    // A design picture goes on a singlet, jersey, tee or polo (with or
    // without the pocket) only: a hoodie takes the design's colours, pattern
    // and wordmark, with the first attached logo as its crest.
    if (isHoodie(c.aiGarment ?? c.garment)) {
      _open(0);
      if (c.logoImage == null && c.references.isNotEmpty) {
        c.update(() => c.logoImage = c.references.first);
      }
      showToast(context, hoodieDesignNote);
      return;
    }
    // Kept for when this screen has gone (Back to create while drawing).
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
    c.mockupImage = image;
    final Uint8List sheet;
    try {
      sheet = await c.mockupPrintSheet(frontOnly: primary.view == 'front');
    } on AiException catch (e) {
      if (c.screen == AppScreen.concepts) say('Make it 3D: ${e.message}');
      return;
    }
    // Back to the brief (or a new Generate) meanwhile: the user stays where
    // they went; the print sheet is kept in Artwork.
    if (c.screen != AppScreen.concepts) {
      say('Your print sheet is ready in Assets › Artwork.');
      return;
    }
    c.go(AppScreen.studio);
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

  /// The ⋮ menu: Make primary, Make HD, Download, Edit image, Regenerate,
  /// Customise in 3D Studio.
  Widget _menu(int index) {
    final o = c.concepts[index];
    final hasPicture = o.image != null || o.asset != null;
    // Designs from the AI (sample designs have no direction to render).
    final ai = o.direction != null;
    return PopupMenuButton<String>(
      tooltip: index == 0
          ? 'Primary design actions'
          : 'Design ${index + 1} actions',
      icon: const Icon(Icons.more_vert_rounded, color: Colors.white, size: 20),
      color: Palette.surface2,
      onSelected: (action) => switch (action) {
        'primary' => _makePrimary(index),
        'hd' => renderDesign(c, o, 'high', view: 'presentation'),
        'download' => _download(index),
        'edit' => _edit(index),
        'again' => renderDesign(c, o, o.quality ?? 'medium'),
        _ => _open(index),
      },
      itemBuilder: (_) => [
        if (index > 0)
          const PopupMenuItem(value: 'primary', child: Text('Make primary')),
        if (ai && o.quality != 'high')
          PopupMenuItem(
            value: 'hd',
            enabled: !o.busy,
            child: const Text('Make HD · 10 credits'),
          ),
        if (hasPicture)
          const PopupMenuItem(value: 'download', child: Text('Download')),
        if (hasPicture)
          const PopupMenuItem(value: 'edit', child: Text('Edit image')),
        if (ai)
          PopupMenuItem(
            value: 'again',
            enabled: !o.busy,
            child: Text(index == 0 ? 'Regenerate' : 'Regenerate this option'),
          ),
        const PopupMenuItem(
          value: 'studio',
          child: Text('Customise in 3D Studio'),
        ),
      ],
    );
  }

  Widget _picture(Concept? o, {required bool big}) {
    if (o == null) {
      // Waiting for the plan while a Generate runs; otherwise nothing yet.
      return Center(
        child: c.concepts.isEmpty || c.planError != null
            ? const Icon(Icons.image_outlined, color: Palette.muted)
            : const CircularProgressIndicator(strokeWidth: 2),
      );
    }
    final hasPicture = o.image != null || o.asset != null;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (hasPicture)
          artImage(bytes: o.image, asset: o.asset, fit: BoxFit.cover)
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
        else
          Center(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                o.error ?? 'No picture yet.',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 11.5),
              ),
            ),
          ),
        if (hasPicture && o.busy)
          const ColoredBox(
            color: Color(0x8802060b),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final list = c.concepts;
    final primary = list.isEmpty ? null : list.first;
    final hasPicture = primary?.image != null || primary?.asset != null;
    return Column(
      children: [
        TopBar(onBack: _backToCreate, title: 'Your designs'),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            children: [
              // The PRIMARY DESIGN card.
              GlowCard(
                selected: true,
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      AspectRatio(
                        aspectRatio: 3 / 2,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              _picture(primary, big: true),
                              Positioned(
                                top: 8,
                                left: 8,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xe60b4c99),
                                    borderRadius: BorderRadius.circular(99),
                                  ),
                                  child: const Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        Icons.settings,
                                        size: 13,
                                        color: Palette.cyan,
                                      ),
                                      SizedBox(width: 5),
                                      Text(
                                        'PRIMARY DESIGN',
                                        style: TextStyle(
                                          fontSize: 10.5,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: .6,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              if (primary != null)
                                Positioned(top: 0, right: 0, child: _menu(0)),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      // Side by side where the full labels fit; on phones
                      // (QA 2026-10-21: "Open in 3D …" cut at 390 px) the
                      // two buttons go on two rows.
                      LayoutBuilder(
                        builder: (context, box) {
                          final open = GradientButton(
                            label: c.sheetBusy
                                ? 'Drawing the print sheet…'
                                : 'Open in 3D Designer',
                            icon: Icons.view_in_ar_outlined,
                            compact: true,
                            onPressed:
                                primary == null || c.sheetBusy || !hasPicture
                                ? null
                                : _openIn3d,
                          );
                          final download = OutlinedButton.icon(
                            onPressed: hasPicture ? () => _download(0) : null,
                            icon: const Icon(Icons.download_rounded, size: 18),
                            label: const Text('Download'),
                          );
                          if (box.maxWidth < 420) {
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                open,
                                const SizedBox(height: 8),
                                download,
                              ],
                            );
                          }
                          return Row(
                            children: [
                              Expanded(child: open),
                              const SizedBox(width: 8),
                              Expanded(child: download),
                            ],
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              // The three options: a swipe row; tap one to make it primary.
              SizedBox(
                height: 132,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: 3,
                  separatorBuilder: (_, _) => const SizedBox(width: 10),
                  itemBuilder: (context, i) {
                    final index = i + 1;
                    final o = index < list.length ? list[index] : null;
                    return SizedBox(
                      width: 198,
                      child: GlowCard(
                        glow: false,
                        onTap: o != null && (o.image != null || o.asset != null)
                            ? () => _makePrimary(index)
                            : null,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(14),
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              o == null && c.planError != null && i == 0
                                  ? Center(
                                      child: TextButton(
                                        onPressed: () => startResults(c),
                                        child: const Text('Try again'),
                                      ),
                                    )
                                  : _picture(o, big: false),
                              Positioned(
                                top: 6,
                                left: 6,
                                child: Container(
                                  width: 26,
                                  height: 26,
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: const Color(0xb302060b),
                                    border: Border.all(color: Palette.cyan),
                                  ),
                                  child: Text(
                                    '${index + 1}',
                                    style: const TextStyle(
                                      color: Palette.cyan,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ),
                              if (o != null)
                                Positioned(
                                  top: -4,
                                  right: -4,
                                  child: _menu(index),
                                ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              if (c.planError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'More designs: ${c.planError}',
                    style: const TextStyle(fontSize: 12, color: Palette.muted),
                  ),
                ),
              // Each attached reference picture can go straight onto the 3D kit, as on the website.
              if (c.references.isNotEmpty) _ReferencesToKit(c),
            ],
          ),
        ),
        // The prompt bar with the brief: refine it or write a new one.
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
          child: Container(
            padding: const EdgeInsets.fromLTRB(16, 2, 4, 2),
            decoration: BoxDecoration(
              color: const Color(0xe6050c14),
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: Palette.cyan.withValues(alpha: .7)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    key: const ValueKey('refine-brief'),
                    controller: _refine,
                    minLines: 1,
                    maxLines: 3,
                    style: const TextStyle(fontSize: 13.5),
                    decoration: const InputDecoration(
                      border: InputBorder.none,
                      hintText: 'Refine your brief or describe a new design…',
                    ),
                  ),
                ),
                IconButton.filled(
                  tooltip: 'Generate again',
                  onPressed: _generateAgain,
                  style: IconButton.styleFrom(
                    backgroundColor: Palette.cyan,
                    foregroundColor: Colors.black,
                  ),
                  icon: const Icon(Icons.arrow_upward_rounded),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Said when an AI design opens on a hoodie (no design picture on hoodies yet).
const hoodieDesignNote =
    'Hoodies take your design’s colours and logo; full print designs on '
    'hoodies are coming.';
