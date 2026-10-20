import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../ai_service.dart';
import '../app_controller.dart';
import '../export_service.dart';
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

  AppController get c => widget.c;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _addReference() async {
    if (c.references.length >= 3) {
      showToast(context, 'Up to 3 reference images. Remove one first.');
      return;
    }
    final choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Palette.surface,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
          ],
        ),
      ),
    );
    if (!mounted || choice == null) return;
    if (choice == 'samples') return _pickSample();
    final bytes = await pickPhoto(
      context,
      source: choice == 'camera' ? ImageSource.camera : ImageSource.gallery,
    );
    if (bytes != null) {
      c.update(() {
        c.references.add(bytes);
        c.uploads.add(bytes);
      });
    }
  }

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

  void _generate() {
    final text = _text.text.trim();
    if (text.isEmpty && c.references.isEmpty) {
      showToast(context, 'Describe your kit or add a reference image.');
      return;
    }
    FocusScope.of(context).unfocus();
    c.update(() => c.brief = text);
    c.go(AppScreen.generating);
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      TopBar(
        onBack: c.back,
        center: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            BrandLogo(width: 120),
            SizedBox(height: 3),
            Caption('AI Designer'),
          ],
        ),
      ),
      Expanded(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 12),
          children: [
            // The brief, as a chat bubble from the user.
            Align(
              alignment: Alignment.centerRight,
              child: Container(
                padding: const EdgeInsets.all(15),
                decoration: BoxDecoration(
                  color: Palette.surface,
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(16),
                    topRight: Radius.circular(16),
                    bottomLeft: Radius.circular(16),
                    bottomRight: Radius.circular(4),
                  ),
                  border: Border.all(color: Palette.border),
                ),
                child: ValueListenableBuilder(
                  valueListenable: _text,
                  builder: (context, value, _) => Text(
                    value.text.trim().isEmpty
                        ? 'Describe the kit you want, e.g. "${_sampleBriefs.first}"'
                        : value.text,
                    style: TextStyle(
                      fontSize: 13.5,
                      height: 1.5,
                      color: value.text.trim().isEmpty
                          ? Palette.muted
                          : Palette.text,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 18),
            const SectionLabel('References', trailing: 'Up to 3'),
            Row(
              children: [
                for (var i = 0; i < 3; i++) ...[
                  Expanded(
                    child: AspectRatio(
                      aspectRatio: 1,
                      child: i < c.references.length
                          ? Stack(
                              fit: StackFit.expand,
                              children: [
                                GlowCard(
                                  radius: 12,
                                  glow: false,
                                  child: artImage(bytes: c.references[i]),
                                ),
                                Positioned(
                                  top: 4,
                                  right: 4,
                                  child: GestureDetector(
                                    onTap: () => c.update(
                                      () => c.references.removeAt(i),
                                    ),
                                    child: const CircleAvatar(
                                      radius: 11,
                                      backgroundColor: Colors.black87,
                                      child: Icon(Icons.close, size: 14),
                                    ),
                                  ),
                                ),
                              ],
                            )
                          : i == c.references.length
                          ? GlowCard(
                              radius: 12,
                              glow: false,
                              onTap: _addReference,
                              child: const Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.add,
                                    color: Palette.cyan,
                                    size: 30,
                                  ),
                                  SizedBox(height: 4),
                                  Text(
                                    'Add image',
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: Palette.muted,
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : DecoratedBox(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: Palette.border.withValues(alpha: .5),
                                ),
                              ),
                            ),
                    ),
                  ),
                  if (i < 2) const SizedBox(width: 10),
                ],
              ],
            ),
            const SizedBox(height: 6),
            const Text(
              'Logo, design, pattern or example',
              style: TextStyle(color: Palette.muted, fontSize: 11),
            ),
          ],
        ),
      ),
      if (AiService.enabled)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 2),
          child: SwitchListTile.adaptive(
            dense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 4),
            value: c.wantMockup,
            activeTrackColor: Palette.cyan,
            onChanged: (v) => c.update(() => c.wantMockup = v),
            title: const Text(
              'HD presentation mockup',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            subtitle: const Text(
              'Photoreal front, back and details, like ChatGPT',
              style: TextStyle(fontSize: 11, color: Palette.muted),
            ),
          ),
        ),
      // Composer + quick chips.
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 2, 6, 2),
          decoration: BoxDecoration(
            color: Palette.surface,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: Palette.cyan.withValues(alpha: .45)),
          ),
          child: Row(
            children: [
              const Icon(Icons.person_outline, size: 18, color: Palette.muted),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _text,
                  minLines: 1,
                  maxLines: 4,
                  enabled: !_busy,
                  textCapitalization: TextCapitalization.sentences,
                  // Pictures pasted from the keyboard's clipboard join the
                  // references, as with the add button.
                  contentInsertionConfiguration: ContentInsertionConfiguration(
                    allowedMimeTypes: const [
                      'image/png',
                      'image/jpeg',
                      'image/webp',
                    ],
                    onContentInserted: _insertPicture,
                  ),
                  style: const TextStyle(fontSize: 13),
                  decoration: const InputDecoration(
                    hintText: 'Ask 3DEEZI anything…',
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    filled: false,
                    contentPadding: EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
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
                      onPressed: _generate,
                      style: IconButton.styleFrom(
                        backgroundColor: Palette.cyan,
                        foregroundColor: Colors.black,
                      ),
                      icon: const Icon(Icons.send_rounded, size: 19),
                    ),
            ],
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            for (final mode in BriefMode.values)
              ActionChipPill(
                _label(mode),
                selected: c.briefMode == mode,
                onTap: _busy ? null : () => _chip(mode),
              ),
          ],
        ),
      ),
    ],
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
        if (identical(c.spec, spec)) c.update(() => c.patternTile = tile);
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
            onPressed: selected == null ? null : () => _open(context),
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
          ],
        ),
      ),
    );
  }
}
