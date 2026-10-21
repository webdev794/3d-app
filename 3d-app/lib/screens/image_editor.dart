import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart' show kPrimaryButton;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api_client.dart';
import '../app_controller.dart';
import '../export_service.dart';
import '../image_tools.dart';
import '../widgets/flow_ui.dart';
import '../widgets/ui.dart';

/// Opens the image editor on a picture ([bytes], or a bundled [asset]):
/// Markup, Comment, Erase, Remove BG, Resize and Describe edits (the AI, on
/// the 3DEEZI server), every change a new version, like ChatGPT's image
/// editor (the website's components/ImageEditor.tsx). Answers the version
/// to use, or null when the editor was closed.
Future<Uint8List?> openImageEditor(
  BuildContext context,
  AppController c, {
  Uint8List? bytes,
  String? asset,
  String title = '',
  String fileName = '3deezi-image',
  String useLabel = 'Use',
}) async {
  final picture = bytes ?? (await rootBundle.load(asset!)).buffer.asUint8List();
  if (!context.mounted) return null;
  return Navigator.of(context).push<Uint8List>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => ImageEditorScreen(
        c: c,
        bytes: picture,
        title: title,
        fileName: fileName,
        useLabel: useLabel,
      ),
    ),
  );
}

/// The small "Edit" label on AI pictures that opens the editor.
class EditImageChip extends StatelessWidget {
  const EditImageChip({super.key, required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: const Color(0xe006131a),
    shape: StadiumBorder(
      side: BorderSide(color: Palette.cyan.withValues(alpha: .5)),
    ),
    child: InkWell(
      customBorder: const StadiumBorder(),
      onTap: onTap,
      child: const Padding(
        padding: EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.edit_outlined, size: 14, color: Palette.cyan),
            SizedBox(width: 5),
            Text(
              'Edit',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    ),
  );
}

enum _Tool { markup, comment, erase, background, resize }

const _hints = {
  _Tool.markup:
      'Draw on the picture or circle what to change, then describe the '
      'change below.',
  _Tool.comment:
      'Tap a spot and type a short note. Notes are sent with your '
      'description.',
  _Tool.erase:
      'Brush out a part. Make it see-through, or describe what goes there '
      'and edit with AI.',
  _Tool.background: 'Removes a plain background and makes it see-through.',
  _Tool.resize:
      'Choose a shape. Crop keeps the part in the frame (drag it); Extend '
      'lets the AI add the missing edges.',
};

const _forAi = 1536;

class _Version {
  _Version(this.image, this.label, {this.bytes, this.ai = false, this.detail});
  final ui.Image image;
  final String label;
  final String? detail;
  final bool ai;

  /// The picture's file: as it came (original, AI answer) or made on demand.
  Uint8List? bytes;
  bool kept = false;
}

class ImageEditorScreen extends StatefulWidget {
  const ImageEditorScreen({
    super.key,
    required this.c,
    required this.bytes,
    this.title = '',
    this.fileName = '3deezi-image',
    this.useLabel = 'Use',
  });

  final AppController c;
  final Uint8List bytes;
  final String title, fileName, useLabel;

  @override
  State<ImageEditorScreen> createState() => _ImageEditorScreenState();
}

class _ImageEditorScreenState extends State<ImageEditorScreen> {
  final _versions = <_Version>[];
  final _marks = <EditMark>[];
  final _describe = TextEditingController();
  var _current = 0;
  var _tool = _Tool.markup;
  final _brush = {_Tool.markup: 16.0, _Tool.erase: 30.0};
  var _strength = 40.0;
  EditRatio? _ratio;
  var _shift = .5;
  StrokeMark? _live;
  String? _busy, _error;
  bool? _ai;
  var _loadFailed = false;
  var _request = 0;
  Offset? _down;
  var _moved = false;
  double? _shiftStart;
  var _shown = Size.zero;

  AppController get c => widget.c;
  _Version? get _version => _versions.isEmpty ? null : _versions[_current];
  List<NoteMark> get _notes => _marks.whereType<NoteMark>().toList();
  bool get _erasing => _marks.any((m) => m is StrokeMark && m.erase);

  @override
  void initState() {
    super.initState();
    _open();
    c.api.aiAvailable().then(
      (on) => mounted ? setState(() => _ai = on) : null,
      onError: (Object _) => mounted ? setState(() => _ai = false) : null,
    );
    _describe.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _describe.dispose();
    for (final version in _versions) {
      version.image.dispose();
    }
    super.dispose();
  }

  Future<void> _open() async {
    try {
      final image = await _decode(widget.bytes);
      if (!mounted) return;
      setState(
        () => _versions.add(_Version(image, 'Original', bytes: widget.bytes)),
      );
    } on Object {
      if (mounted) setState(() => _loadFailed = true);
    }
  }

  void _add(
    ui.Image image,
    String label, {
    Uint8List? bytes,
    bool ai = false,
    String? detail,
  }) => setState(() {
    _versions.add(_Version(image, label, bytes: bytes, ai: ai, detail: detail));
    _current = _versions.length - 1;
    _error = null;
  });

  // ---------------------------------------------------------------- tools
  void _pointerDown(PointerDownEvent event) {
    if (_busy != null || _version == null) return;
    if (event.kind == ui.PointerDeviceKind.mouse &&
        event.buttons != kPrimaryButton) {
      return;
    }
    final at = _at(event.localPosition);
    _down = at;
    _moved = false;
    if (_tool == _Tool.markup || _tool == _Tool.erase) {
      setState(
        () => _live = StrokeMark(
          erase: _tool == _Tool.erase,
          size: _brush[_tool]! / _shown.width,
          points: [at],
        ),
      );
    } else if (_tool == _Tool.resize && _ratio != null) {
      _shiftStart = _shift;
    }
  }

  void _pointerMove(PointerMoveEvent event) {
    final start = _down, version = _version;
    if (start == null || version == null) return;
    final at = _at(event.localPosition);
    if (((at - start).dx * _shown.width).abs() > 6 ||
        ((at - start).dy * _shown.height).abs() > 6) {
      _moved = true;
    }
    final live = _live;
    if (live != null) {
      final last = live.points.last;
      final gap = Offset(
        (at.dx - last.dx) * _shown.width,
        (at.dy - last.dy) * _shown.height,
      );
      if (gap.distance >= 1.5) setState(() => live.points.add(at));
    } else if (_shiftStart != null && _ratio != null) {
      final w = version.image.width, h = version.image.height;
      final frame = cropFrame(w, h, _ratio!, 0);
      final across = w - frame.width > 1;
      final spare = across ? (w - frame.width) / w : (h - frame.height) / h;
      final delta = across ? at.dx - start.dx : at.dy - start.dy;
      if (spare > 0) {
        setState(() => _shift = (_shiftStart! + delta / spare).clamp(0, 1));
      }
    }
  }

  void _pointerUp(PointerUpEvent event) {
    final start = _down, live = _live;
    _down = null;
    _shiftStart = null;
    if (live != null) {
      setState(() {
        _marks.add(live);
        _live = null;
        _error = null;
      });
    } else if (_tool == _Tool.comment && start != null && !_moved) {
      _note(at: start);
    }
  }

  void _pointerCancel(PointerCancelEvent event) {
    _down = null;
    _shiftStart = null;
    if (_live != null) setState(() => _live = null);
  }

  Offset _at(Offset local) => Offset(
    (local.dx / _shown.width).clamp(0, 1),
    (local.dy / _shown.height).clamp(0, 1),
  );

  /// Adds a note at [at], or changes or deletes [note].
  Future<void> _note({Offset? at, NoteMark? note}) async {
    final text = await showDialog<String>(
      context: context,
      builder: (_) =>
          _NoteDialog(text: note?.text ?? '', existing: note != null),
    );
    if (text == null || !mounted) return;
    setState(() {
      final index = note == null ? -1 : _marks.indexOf(note);
      if (index >= 0 && text.trim().isEmpty) {
        _marks.removeAt(index);
      } else if (index >= 0) {
        _marks[index] = NoteMark(note!.at, text.trim());
      } else if (text.trim().isNotEmpty && at != null) {
        _marks.add(NoteMark(at, text.trim()));
      }
    });
  }

  void _undo() {
    if (_marks.isNotEmpty && _busy == null) {
      setState(() => _marks.removeLast());
    }
  }

  Future<void> _makeSeeThrough() async {
    final version = _version;
    if (version == null) return;
    final image = await _paintErased(version.image, _marks);
    if (!mounted) return;
    _add(image, 'Erased');
    setState(() => _marks.removeWhere((m) => m is StrokeMark && m.erase));
  }

  Future<void> _removeBackground() async {
    final version = _version;
    if (version == null) return;
    setState(() {
      _busy = 'Removing the background…';
      _error = null;
    });
    // Let the busy note show before the work starts.
    await Future<void>.delayed(const Duration(milliseconds: 40));
    try {
      final image = version.image;
      final pixels = removeBackground(
        await _rgba(image),
        image.width,
        image.height,
        _strength.round(),
      );
      final result = await _fromRgba(pixels, image.width, image.height);
      if (mounted) _add(result, 'No background');
    } on ImageEditException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _crop() async {
    final version = _version, ratio = _ratio;
    if (version == null || ratio == null) return;
    final image = version.image;
    final frame = cropFrame(image.width, image.height, ratio, _shift);
    final w = frame.width.round(), h = frame.height.round();
    final cropped = await _draw(
      w,
      h,
      (canvas, size) => canvas.drawImageRect(
        image,
        frame,
        Offset.zero & size,
        Paint()..filterQuality = FilterQuality.high,
      ),
    );
    if (!mounted) return;
    setState(() {
      final moved = moveMarks(
        _marks,
        Size(image.width.toDouble(), image.height.toDouble()),
        Size(w.toDouble(), h.toDouble()),
        (p) => Offset(
          (p.dx - frame.left) * w / frame.width,
          (p.dy - frame.top) * h / frame.height,
        ),
      );
      _marks
        ..clear()
        ..addAll(moved);
    });
    _add(cropped, 'Cropped ${ratio.id}');
  }

  bool _canUseAi() {
    if (_ai != true) {
      setState(
        () => _error = 'AI edits need AI to be connected on the server.',
      );
      return false;
    }
    if (!c.signedIn) {
      setState(
        () => _error =
            'Sign in first to edit with AI: it runs on the 3DEEZI server.',
      );
      return false;
    }
    return true;
  }

  Future<void> _describeEdits() async {
    final version = _version;
    final text = _describe.text.trim();
    final notes = _notes;
    if (version == null || _busy != null) return;
    if (text.isEmpty && notes.isEmpty) {
      setState(
        () => _error =
            'Describe the change you want, or add a note on the picture.',
      );
      return;
    }
    if (!_canUseAi()) return;
    final marks = [..._marks];
    final erasing = _erasing;
    // The picture as it is sent: erased parts see-through, at most 1536 px.
    final ui.Image picture;
    final Uint8List bytes;
    final String mime;
    final large = math.max(version.image.width, version.image.height) > _forAi;
    if (!erasing && !large && version.bytes != null) {
      picture = version.image;
      bytes = version.bytes!;
      mime = _mime(bytes);
    } else {
      final base = erasing
          ? await _paintErased(version.image, marks)
          : version.image;
      picture = large ? await _scaled(base, _forAi) : base;
      bytes = await _png(picture);
      mime = 'image/png';
    }
    final mask = await _mask(picture.width, picture.height, marks);
    final marked = await _marked(picture, marks);
    await _send(
      image: bytes,
      mime: mime,
      instruction: text,
      notes: notes,
      mask: mask,
      marked: marked,
      label: 'AI edit',
      detail: text.isEmpty ? notes.map((n) => n.text).join(' · ') : text,
      after: () {
        _marks.clear();
        _describe.clear();
      },
    );
  }

  Future<void> _extend() async {
    final version = _version, ratio = _ratio;
    if (version == null || ratio == null || _busy != null) return;
    if (!_canUseAi()) return;
    final base = await _scaled(version.image, _forAi);
    final wider = base.width / base.height < ratio.value;
    final w = wider ? (base.height * ratio.value).round() : base.width;
    final h = wider ? base.height : (base.width / ratio.value).round();
    final left = ((w - base.width) / 2).roundToDouble();
    final top = ((h - base.height) / 2).roundToDouble();
    final padded = await _draw(
      w,
      h,
      (canvas, size) => canvas.drawImage(base, Offset(left, top), Paint()),
    );
    final mask = await _draw(
      w,
      h,
      (canvas, size) => canvas.drawRect(
        Rect.fromLTWH(left, top, base.width.toDouble(), base.height.toDouble()),
        Paint()..color = const Color(0xff000000),
      ),
    );
    final extra = _describe.text.trim();
    final from = Size(
      version.image.width.toDouble(),
      version.image.height.toDouble(),
    );
    await _send(
      image: await _png(padded),
      mime: 'image/png',
      mask: await _png(mask),
      size: ratio.size,
      instruction:
          'Extend the picture into the empty see-through edges so it becomes '
          '${ratio.label.toLowerCase()}. Continue the background, floor and '
          'lighting naturally, and keep the picture itself exactly the same.'
          '${extra.isEmpty ? '' : ' Also: $extra'}',
      label: 'Extended ${ratio.id}',
      detail: 'Extended to ${ratio.label.toLowerCase()}',
      after: () {
        final moved = moveMarks(
          _marks,
          from,
          Size(w.toDouble(), h.toDouble()),
          (p) => Offset(
            p.dx * base.width / from.width + left,
            p.dy * base.height / from.height + top,
          ),
        );
        _marks
          ..clear()
          ..addAll(moved);
        if (extra.isNotEmpty) _describe.clear();
      },
    );
  }

  Future<void> _send({
    required Uint8List image,
    required String mime,
    required String label,
    required String detail,
    String? instruction,
    Uint8List? mask,
    Uint8List? marked,
    List<NoteMark> notes = const [],
    String? size,
    VoidCallback? after,
  }) async {
    final request = ++_request;
    setState(() {
      _busy = label == 'AI edit'
          ? 'Editing your picture… about a minute'
          : 'Extending your picture… about a minute';
      _error = null;
    });
    String url(Uint8List bytes, String type) =>
        'data:$type;base64,${base64Encode(bytes)}';
    double round(double value) => (value * 10000).round() / 10000;
    try {
      final answer = await c.api.editImage(
        image: url(image, mime),
        instruction: instruction,
        mask: mask == null ? null : url(mask, 'image/png'),
        marked: marked == null ? null : url(marked, 'image/png'),
        notes: [
          for (final note in notes)
            {'text': note.text, 'x': round(note.at.dx), 'y': round(note.at.dy)},
        ],
        size: size,
      );
      final bytes = base64Decode(answer.substring(answer.indexOf(',') + 1));
      final picture = await _decode(bytes);
      if (!mounted || request != _request) return;
      _add(picture, label, bytes: bytes, ai: true, detail: detail);
      setState(() => after?.call());
    } on ApiException catch (e) {
      if (mounted && request == _request) setState(() => _error = e.message);
    } on Object {
      if (mounted && request == _request) {
        setState(
          () => _error = 'The new picture could not be read. Try again.',
        );
      }
    } finally {
      if (mounted && request == _request) setState(() => _busy = null);
    }
  }

  void _cancel() => setState(() {
    _request++;
    _busy = null;
  });

  Future<Uint8List> _file(_Version version) async =>
      version.bytes ??= await _png(version.image);

  Future<void> _download() async {
    final version = _version;
    if (version == null) return;
    final box = context.findRenderObject() as RenderBox?;
    final bytes = await _file(version);
    final extension = switch (_mime(bytes)) {
      'image/png' => 'png',
      'image/webp' => 'webp',
      _ => 'jpg',
    };
    try {
      final status = await shareImage(
        bytes,
        '${widget.fileName}-v${_current + 1}.$extension',
        origin: box == null ? null : box.localToGlobal(Offset.zero) & box.size,
      );
      version.kept = true;
      if (mounted) showToast(context, status);
    } on Exception catch (e) {
      if (mounted) showToast(context, 'Download failed: $e');
    }
  }

  Future<void> _use() async {
    final version = _version;
    if (version == null || _current == 0 || _busy != null) return;
    final bytes = await _file(version);
    version.kept = true;
    if (mounted) Navigator.of(context).pop(bytes);
  }

  /// Close, Esc or Back: nothing changes where the picture came from. AI
  /// versions not yet used or downloaded are confirmed first.
  Future<void> _close() async {
    if (_busy != null) _cancel();
    if (_versions.any((v) => v.ai && !v.kept)) {
      final leave = await showDialog<bool>(
        context: context,
        builder: (dialog) => AlertDialog(
          backgroundColor: Palette.surface,
          title: const Text('Leave without your AI edits?'),
          content: const Text(
            'They are not saved anywhere yet. Use or download a version to '
            'keep it.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog, false),
              child: const Text('Keep editing'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialog, true),
              child: const Text('Leave'),
            ),
          ],
        ),
      );
      if (leave != true) return;
    }
    if (mounted) Navigator.of(context).pop();
  }

  // ---------------------------------------------------------------- build
  @override
  Widget build(BuildContext context) {
    final version = _version;
    final narrow = MediaQuery.sizeOf(context).width < 480;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close();
      },
      child: Focus(
        autofocus: true,
        onKeyEvent: (node, event) {
          if (event is! KeyDownEvent) return KeyEventResult.ignored;
          final typing =
              FocusManager.instance.primaryFocus?.context
                  ?.findAncestorStateOfType<EditableTextState>() !=
              null;
          if (event.logicalKey == LogicalKeyboardKey.escape) {
            _close();
            return KeyEventResult.handled;
          }
          final keys = HardwareKeyboard.instance;
          if (!typing &&
              event.logicalKey == LogicalKeyboardKey.keyZ &&
              (keys.isControlPressed || keys.isMetaPressed)) {
            _undo();
            return KeyEventResult.handled;
          }
          return KeyEventResult.ignored;
        },
        child: Scaffold(
          backgroundColor: Palette.bg,
          body: SafeArea(
            child: Column(
              children: [
                _header(version, narrow),
                _toolbar(),
                _options(version),
                Expanded(child: _stage(version)),
                if (_notes.isNotEmpty) _noteList(),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        color: Color(0xffffa3b3),
                        fontSize: 12,
                      ),
                    ),
                  ),
                _describeBox(version),
                _strip(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _header(_Version? version, bool narrow) => Container(
    padding: const EdgeInsets.fromLTRB(4, 6, 10, 6),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: Color(0x1affffff))),
    ),
    child: Row(
      children: [
        IconButton(
          tooltip: 'Close the editor',
          onPressed: _close,
          icon: const Icon(Icons.close_rounded, color: Palette.text),
        ),
        if (!narrow)
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const ScreenTitle(
                  'Edit image',
                  size: 20,
                  align: TextAlign.left,
                ),
                Text(
                  [
                    if (widget.title.isNotEmpty) widget.title,
                    if (version != null)
                      'Version ${_current + 1}: ${version.label}',
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Palette.muted, fontSize: 11),
                ),
              ],
            ),
          )
        else
          const Spacer(),
        IconButton(
          tooltip: 'Previous version',
          onPressed: _current > 0 && _busy == null
              ? () => setState(() => _current--)
              : null,
          icon: const Icon(Icons.chevron_left_rounded),
        ),
        Text(
          _versions.isEmpty ? '' : '${_current + 1} / ${_versions.length}',
          style: const TextStyle(fontSize: 12, color: Palette.text),
        ),
        IconButton(
          tooltip: 'Next version',
          onPressed: _current < _versions.length - 1 && _busy == null
              ? () => setState(() => _current++)
              : null,
          icon: const Icon(Icons.chevron_right_rounded),
        ),
        IconButton(
          tooltip: 'Download this version',
          onPressed: version == null || _busy != null ? null : _download,
          icon: const Icon(Icons.download_rounded, color: Palette.text),
        ),
        const SizedBox(width: 4),
        GradientButton(
          label: widget.useLabel,
          compact: true,
          onPressed: version == null || _current == 0 || _busy != null
              ? null
              : _use,
        ),
      ],
    ),
  );

  Widget _toolbar() {
    Widget tool(_Tool id, String label, Widget icon) {
      final selected = _tool == id;
      return Expanded(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2.5),
          child: Material(
            color: selected
                ? Palette.cyan.withValues(alpha: .12)
                : Palette.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(9),
              side: BorderSide(color: selected ? Palette.cyan : Palette.border),
            ),
            child: InkWell(
              borderRadius: BorderRadius.circular(9),
              onTap: _busy != null
                  ? null
                  : () => setState(() {
                      _tool = id;
                      _error = null;
                    }),
              child: Semantics(
                button: true,
                selected: selected,
                label: label,
                excludeSemantics: true,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 7),
                  child: Column(
                    children: [
                      IconTheme(
                        data: IconThemeData(
                          size: 19,
                          color: selected ? Palette.cyan : Palette.text,
                        ),
                        child: icon,
                      ),
                      const SizedBox(height: 3),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          label,
                          maxLines: 1,
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: selected ? Palette.cyan : Palette.text,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 6, 0),
      child: Row(
        children: [
          tool(_Tool.markup, 'Markup', const Icon(Icons.brush_outlined)),
          tool(
            _Tool.comment,
            'Comment',
            const Icon(Icons.add_comment_outlined),
          ),
          tool(_Tool.erase, 'Erase', const _EraserIcon()),
          tool(
            _Tool.background,
            'Remove BG',
            const Icon(Icons.hide_image_outlined),
          ),
          tool(_Tool.resize, 'Resize', const Icon(Icons.aspect_ratio_rounded)),
          IconButton(
            tooltip: 'Undo the last mark',
            onPressed: _marks.isEmpty || _busy != null ? null : _undo,
            icon: const Icon(Icons.undo_rounded),
          ),
          IconButton(
            tooltip: 'Remove all marks and notes',
            onPressed: _marks.isEmpty || _busy != null
                ? null
                : () => setState(_marks.clear),
            icon: const Icon(Icons.delete_sweep_outlined),
          ),
        ],
      ),
    );
  }

  Widget _options(_Version? version) {
    final ratio = _ratio;
    final controls = <Widget>[
      if (_tool == _Tool.markup || _tool == _Tool.erase)
        _slider(
          'Brush',
          _brush[_tool]!,
          4,
          _tool == _Tool.erase ? 90 : 60,
          (value) => setState(() => _brush[_tool] = value),
          '${_brush[_tool]!.round()} px',
        ),
      if (_tool == _Tool.erase)
        _smallButton(
          'Make see-through',
          Icons.layers_clear_outlined,
          _erasing && _busy == null ? _makeSeeThrough : null,
        ),
      if (_tool == _Tool.background) ...[
        _slider(
          'Strength',
          _strength,
          0,
          100,
          (value) => setState(() => _strength = value),
          '${_strength.round()}',
        ),
        _smallButton(
          'Remove background',
          Icons.hide_image_outlined,
          version == null || _busy != null ? null : _removeBackground,
        ),
      ],
      if (_tool == _Tool.resize) ...[
        for (final r in editRatios)
          ActionChipPill(
            r.label,
            selected: ratio?.id == r.id,
            icon: switch (r.id) {
              '1:1' => Icons.crop_square_rounded,
              '2:3' => Icons.crop_portrait_rounded,
              _ => Icons.crop_landscape_rounded,
            },
            onTap: () => setState(() {
              _ratio = r;
              _shift = .5;
            }),
          ),
        if (ratio != null && version != null)
          if (sameShape(version.image.width, version.image.height, ratio))
            Text(
              'Already ${ratio.label.toLowerCase()}.',
              style: const TextStyle(color: Palette.muted, fontSize: 12),
            )
          else ...[
            _smallButton(
              'Crop',
              Icons.crop_rounded,
              _busy == null ? _crop : null,
            ),
            _smallButton(
              'Extend with AI',
              Icons.open_in_full_rounded,
              _busy == null && _ai == true ? _extend : null,
            ),
          ],
      ],
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _hints[_tool]!,
            style: const TextStyle(color: Palette.muted, fontSize: 11.5),
          ),
          if (controls.isNotEmpty) ...[
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: controls,
            ),
          ],
        ],
      ),
    );
  }

  Widget _slider(
    String label,
    double value,
    double min,
    double max,
    ValueChanged<double> onChanged,
    String shown,
  ) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Text(label, style: const TextStyle(fontSize: 12)),
      SizedBox(
        width: 150,
        child: Slider(
          value: value.clamp(min, max),
          min: min,
          max: max,
          label: shown,
          onChanged: _busy == null ? onChanged : null,
          semanticFormatterCallback: (_) => '$label $shown',
        ),
      ),
      Text(shown, style: const TextStyle(fontSize: 11, color: Palette.muted)),
    ],
  );

  Widget _smallButton(String label, IconData icon, VoidCallback? onPressed) =>
      OutlinedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, size: 17),
        label: Text(label),
        style: OutlinedButton.styleFrom(
          foregroundColor: Palette.text,
          side: BorderSide(color: Palette.cyan.withValues(alpha: .55)),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          visualDensity: VisualDensity.compact,
        ),
      );

  Widget _stage(_Version? version) => Container(
    color: const Color(0xff060d15),
    child: LayoutBuilder(
      builder: (context, box) {
        if (version == null) {
          return Center(
            child: _loadFailed
                ? const Text(
                    'This picture could not be opened.',
                    style: TextStyle(color: Color(0xffffa3b3)),
                  )
                : const CircularProgressIndicator(color: Palette.cyan),
          );
        }
        final image = version.image;
        final fit = math.min(
          (box.maxWidth - 16) / image.width,
          (box.maxHeight - 16) / image.height,
        );
        final size = Size(image.width * fit, image.height * fit);
        _shown = size;
        final ratio = _ratio;
        final frame = _tool == _Tool.resize && ratio != null
            ? cropFrame(image.width, image.height, ratio, _shift)
            : null;
        final notes = _notes;
        return Stack(
          children: [
            Center(
              child: SizedBox.fromSize(
                size: size,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned.fill(
                      child: Semantics(
                        container: true,
                        label: 'Picture. ${_hints[_tool]}',
                        child: Listener(
                          onPointerDown: _pointerDown,
                          onPointerMove: _pointerMove,
                          onPointerUp: _pointerUp,
                          onPointerCancel: _pointerCancel,
                          child: CustomPaint(
                            painter: _PicturePainter(
                              image,
                              [..._marks, ?_live],
                              frame == null
                                  ? null
                                  : Rect.fromLTRB(
                                      frame.left / image.width,
                                      frame.top / image.height,
                                      frame.right / image.width,
                                      frame.bottom / image.height,
                                    ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    for (final (i, note) in notes.indexed)
                      Positioned(
                        left: note.at.dx * size.width - 15,
                        top: note.at.dy * size.height - 15,
                        child: _Pin(
                          number: i + 1,
                          text: note.text,
                          onTap: () => _note(note: note),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            if (_busy != null)
              Positioned.fill(
                child: ColoredBox(
                  color: const Color(0xb8030810),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        BusyBadge(_busy!),
                        if (_busy!.contains('about a minute')) ...[
                          const SizedBox(height: 10),
                          TextButton(
                            onPressed: _cancel,
                            child: const Text('Cancel'),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    ),
  );

  Widget _noteList() => Padding(
    padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
    child: Align(
      alignment: Alignment.centerLeft,
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final (i, note) in _notes.indexed)
            InputChip(
              avatar: CircleAvatar(
                backgroundColor: Palette.cyan,
                child: Text(
                  '${i + 1}',
                  style: const TextStyle(
                    fontSize: 10,
                    color: Color(0xff031423),
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              label: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 220),
                child: Text(
                  note.text,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12),
                ),
              ),
              onPressed: () => _note(note: note),
              onDeleted: () => setState(() => _marks.remove(note)),
              deleteButtonTooltipMessage: 'Delete note ${i + 1}',
              visualDensity: VisualDensity.compact,
            ),
        ],
      ),
    ),
  );

  Widget _describeBox(_Version? version) {
    final notes = _notes.length;
    final strokes = _marks.length - notes;
    final sent = [
      if (strokes > 0) '$strokes ${strokes == 1 ? 'mark' : 'marks'}',
      if (notes > 0) '$notes ${notes == 1 ? 'note' : 'notes'}',
    ].join(' and ');
    final ready =
        version != null &&
        _busy == null &&
        _ai == true &&
        (_describe.text.trim().isNotEmpty || notes > 0);
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
      decoration: const BoxDecoration(
        color: Color(0xff08111b),
        border: Border(top: BorderSide(color: Color(0x1affffff))),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: TextField(
              controller: _describe,
              enabled: _busy == null,
              minLines: 1,
              maxLines: 3,
              maxLength: 1000,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _describeEdits(),
              style: const TextStyle(fontSize: 13),
              decoration: InputDecoration(
                labelText: 'Describe edits',
                hintText: _ai == false
                    ? 'AI edits need AI to be connected on the server.'
                    : 'For example: make the collar gold',
                helperText: sent.isEmpty
                    ? 'Tip: mark up, comment or erase first to show where.'
                    : 'Sent with it: $sent.',
                helperMaxLines: 2,
                isDense: true,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Tooltip(
              message: 'Edit with AI',
              child: GradientButton(
                label: MediaQuery.sizeOf(context).width < 480
                    ? ''
                    : 'Edit with AI',
                icon: Icons.auto_awesome,
                compact: true,
                onPressed: ready ? _describeEdits : null,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _strip() => Container(
    height: 78,
    color: const Color(0xff08111b),
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      itemCount: _versions.length,
      separatorBuilder: (_, _) => const SizedBox(width: 8),
      itemBuilder: (context, i) {
        final version = _versions[i];
        final selected = i == _current;
        return Tooltip(
          message: version.detail ?? version.label,
          child: Semantics(
            button: true,
            selected: selected,
            label: 'Version ${i + 1}: ${version.label}',
            excludeSemantics: true,
            child: GestureDetector(
              onTap: _busy == null ? () => setState(() => _current = i) : null,
              child: Container(
                width: 74,
                decoration: BoxDecoration(
                  color: const Color(0xff05090d),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: selected ? Palette.cyan : Palette.border,
                    width: selected ? 2 : 1,
                  ),
                ),
                clipBehavior: Clip.antiAlias,
                child: Column(
                  children: [
                    Expanded(
                      child: ColoredBox(
                        color: const Color(0xffdfe4e9),
                        child: RawImage(
                          image: version.image,
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 2,
                      ),
                      child: Text(
                        '${i + 1} · ${version.label}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 9,
                          color: Palette.muted,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    ),
  );

  // ------------------------------------------------------------- pictures
  Future<ui.Image> _paintErased(ui.Image image, List<EditMark> marks) =>
      _draw(image.width, image.height, (canvas, size) {
        canvas.saveLayer(Offset.zero & size, Paint());
        canvas.drawImage(image, Offset.zero, Paint());
        for (final mark in marks) {
          if (mark is StrokeMark && mark.erase) {
            _stroke(canvas, mark, size, Paint()..blendMode = BlendMode.clear);
          }
        }
        canvas.restore();
      });

  /// The AI's mask: see-through where it may change the picture (brush
  /// marks, circled areas, round each note), or null without brush marks.
  Future<Uint8List?> _mask(int w, int h, List<EditMark> marks) async {
    if (!marks.any((m) => m is StrokeMark)) return null;
    final mask = await _draw(w, h, (canvas, size) {
      canvas.saveLayer(Offset.zero & size, Paint());
      canvas.drawRect(
        Offset.zero & size,
        Paint()..color = const Color(0xff000000),
      );
      Paint clear() => Paint()..blendMode = BlendMode.clear;
      for (final mark in marks) {
        switch (mark) {
          case NoteMark():
            canvas.drawCircle(
              Offset(mark.at.dx * w, mark.at.dy * h),
              math.max(w, h) * .07,
              clear(),
            );
          case StrokeMark():
            _stroke(canvas, mark, size, clear(), grow: mark.erase ? 1.15 : 1.6);
            if (circles(mark, w.toDouble(), h.toDouble())) {
              canvas.drawPath(_path(mark, size)..close(), clear());
            }
        }
      }
      canvas.restore();
    });
    return _png(mask);
  }

  /// A small copy with the markup and numbered pins drawn on.
  Future<Uint8List?> _marked(ui.Image picture, List<EditMark> marks) async {
    if (!marks.any((m) => m is NoteMark || (m is StrokeMark && !m.erase))) {
      return null;
    }
    final scale = math.min(1.0, 768 / math.max(picture.width, picture.height));
    final w = (picture.width * scale).round();
    final h = (picture.height * scale).round();
    final copy = await _draw(w, h, (canvas, size) {
      canvas.drawRect(
        Offset.zero & size,
        Paint()..color = const Color(0xff808080),
      );
      canvas.drawImageRect(
        picture,
        Offset.zero & Size(picture.width.toDouble(), picture.height.toDouble()),
        Offset.zero & size,
        Paint()..filterQuality = FilterQuality.medium,
      );
      for (final mark in marks) {
        if (mark is StrokeMark && !mark.erase) {
          _stroke(canvas, mark, size, Paint()..color = const Color(0xffff2d63));
        }
      }
      final radius = math.max(11.0, math.max(w, h) * .02);
      var number = 0;
      for (final mark in marks) {
        if (mark is! NoteMark) continue;
        number++;
        final at = Offset(mark.at.dx * w, mark.at.dy * h);
        canvas.drawCircle(at, radius, Paint()..color = Palette.cyan);
        canvas.drawCircle(
          at,
          radius,
          Paint()
            ..color = const Color(0xffffffff)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2,
        );
        final label = TextPainter(
          text: TextSpan(
            text: '$number',
            style: TextStyle(
              color: const Color(0xff031423),
              fontSize: radius * 1.15,
              fontWeight: FontWeight.w800,
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        label.paint(canvas, at - Offset(label.width / 2, label.height / 2));
      }
    });
    return _png(copy);
  }
}

// ------------------------------------------------------------------ helpers
Future<ui.Image> _draw(
  int width,
  int height,
  void Function(Canvas canvas, Size size) paint,
) {
  final recorder = ui.PictureRecorder();
  final size = Size(width.toDouble(), height.toDouble());
  paint(Canvas(recorder, Offset.zero & size), size);
  return recorder.endRecording().toImage(width, height);
}

Future<ui.Image> _decode(Uint8List bytes, {int largest = 2048}) async {
  final codec = await ui.instantiateImageCodec(bytes);
  final image = (await codec.getNextFrame()).image;
  if (math.max(image.width, image.height) <= largest) return image;
  return _scaled(image, largest);
}

/// A copy no larger than [largest] pixels on its long side.
Future<ui.Image> _scaled(ui.Image image, int largest) async {
  final scale = largest / math.max(image.width, image.height);
  if (scale >= 1) return image;
  final w = (image.width * scale).round(), h = (image.height * scale).round();
  return _draw(
    w,
    h,
    (canvas, size) => canvas.drawImageRect(
      image,
      Offset.zero & Size(image.width.toDouble(), image.height.toDouble()),
      Offset.zero & size,
      Paint()..filterQuality = FilterQuality.high,
    ),
  );
}

Future<Uint8List> _png(ui.Image image) async => (await image.toByteData(
  format: ui.ImageByteFormat.png,
))!.buffer.asUint8List();

Future<Uint8List> _rgba(ui.Image image) async => (await image.toByteData(
  format: ui.ImageByteFormat.rawStraightRgba,
))!.buffer.asUint8List();

/// Straight RGBA pixels as a picture (the engine takes them premultiplied).
Future<ui.Image> _fromRgba(Uint8List rgba, int width, int height) {
  final pixels = Uint8List.fromList(rgba);
  for (var o = 0; o < pixels.length; o += 4) {
    final a = pixels[o + 3];
    if (a == 255) continue;
    pixels[o] = pixels[o] * a ~/ 255;
    pixels[o + 1] = pixels[o + 1] * a ~/ 255;
    pixels[o + 2] = pixels[o + 2] * a ~/ 255;
  }
  final done = Completer<ui.Image>();
  ui.decodeImageFromPixels(
    pixels,
    width,
    height,
    ui.PixelFormat.rgba8888,
    done.complete,
  );
  return done.future;
}

String _mime(Uint8List bytes) {
  if (bytes.length > 3 && bytes[0] == 0x89 && bytes[1] == 0x50) {
    return 'image/png';
  }
  if (bytes.length > 11 && bytes[8] == 0x57 && bytes[9] == 0x45) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

Path _path(StrokeMark stroke, Size size) {
  final path = Path();
  for (final (i, p) in stroke.points.indexed) {
    final at = Offset(p.dx * size.width, p.dy * size.height);
    i == 0 ? path.moveTo(at.dx, at.dy) : path.lineTo(at.dx, at.dy);
  }
  return path;
}

void _stroke(
  Canvas canvas,
  StrokeMark stroke,
  Size size,
  Paint paint, {
  double grow = 1,
}) {
  final width = math.max(1.0, stroke.size * size.width * grow);
  if (stroke.points.length == 1) {
    final p = stroke.points.first;
    canvas.drawCircle(
      Offset(p.dx * size.width, p.dy * size.height),
      width / 2,
      paint..style = PaintingStyle.fill,
    );
    return;
  }
  canvas.drawPath(
    _path(stroke, size),
    paint
      ..style = PaintingStyle.stroke
      ..strokeWidth = width
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round,
  );
}

/// The picture with its erase marks (see-through), markup and crop frame.
class _PicturePainter extends CustomPainter {
  _PicturePainter(this.image, this.marks, this.crop);
  final ui.Image image;
  final List<EditMark> marks;

  /// The crop frame in fractions of the picture.
  final Rect? crop;

  @override
  void paint(Canvas canvas, Size size) {
    // A checkerboard shows the see-through parts.
    const cell = 9.0;
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xffe9edf1),
    );
    final dark = Paint()..color = const Color(0xffc9d0d7);
    canvas.save();
    canvas.clipRect(Offset.zero & size);
    for (var y = 0; y * cell < size.height; y++) {
      for (var x = y % 2; x * cell < size.width; x += 2) {
        canvas.drawRect(Rect.fromLTWH(x * cell, y * cell, cell, cell), dark);
      }
    }
    canvas.restore();
    canvas.saveLayer(Offset.zero & size, Paint());
    canvas.drawImageRect(
      image,
      Offset.zero & Size(image.width.toDouble(), image.height.toDouble()),
      Offset.zero & size,
      Paint()..filterQuality = FilterQuality.medium,
    );
    for (final mark in marks) {
      if (mark is StrokeMark && mark.erase) {
        _stroke(canvas, mark, size, Paint()..blendMode = BlendMode.clear);
      }
    }
    canvas.restore();
    for (final mark in marks) {
      if (mark is StrokeMark && !mark.erase) {
        _stroke(canvas, mark, size, Paint()..color = const Color(0xbcff3d6e));
      }
    }
    final frame = crop;
    if (frame != null) {
      final rect = Rect.fromLTRB(
        frame.left * size.width,
        frame.top * size.height,
        frame.right * size.width,
        frame.bottom * size.height,
      );
      canvas.drawPath(
        Path()
          ..fillType = PathFillType.evenOdd
          ..addRect(Offset.zero & size)
          ..addRect(rect),
        Paint()..color = const Color(0xa8020710),
      );
      canvas.drawRect(
        rect.deflate(1),
        Paint()
          ..color = Palette.cyan
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
    }
  }

  @override
  bool shouldRepaint(_PicturePainter old) => true;
}

class _Pin extends StatelessWidget {
  const _Pin({required this.number, required this.text, required this.onTap});
  final int number;
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: text,
    child: Semantics(
      button: true,
      label: 'Note $number: $text',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 30,
          height: 30,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Palette.cyan,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: const [
              BoxShadow(color: Color(0xbb000000), blurRadius: 10),
            ],
          ),
          child: Text(
            '$number',
            style: const TextStyle(
              color: Color(0xff031423),
              fontWeight: FontWeight.w800,
              fontSize: 13,
            ),
          ),
        ),
      ),
    ),
  );
}

/// Adds, changes or deletes a note. Answers the text, '' to delete, or
/// null when cancelled.
class _NoteDialog extends StatefulWidget {
  const _NoteDialog({required this.text, required this.existing});
  final String text;
  final bool existing;
  @override
  State<_NoteDialog> createState() => _NoteDialogState();
}

class _NoteDialogState extends State<_NoteDialog> {
  late final _field = TextEditingController(text: widget.text);

  @override
  void dispose() {
    _field.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    backgroundColor: Palette.surface,
    title: Text(widget.existing ? 'Change the note' : 'Add a note'),
    content: TextField(
      controller: _field,
      autofocus: true,
      maxLength: 300,
      textInputAction: TextInputAction.done,
      decoration: const InputDecoration(hintText: 'Type a short note'),
      onSubmitted: (text) => Navigator.pop(context, text),
    ),
    actions: [
      if (widget.existing)
        TextButton(
          onPressed: () => Navigator.pop(context, ''),
          child: const Text('Delete'),
        ),
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      TextButton(
        onPressed: () => Navigator.pop(context, _field.text),
        child: Text(widget.existing ? 'Save' : 'Add note'),
      ),
    ],
  );
}

/// An eraser (Material Icons has none).
class _EraserIcon extends StatelessWidget {
  const _EraserIcon();

  @override
  Widget build(BuildContext context) {
    final theme = IconTheme.of(context);
    final size = theme.size ?? 24;
    return CustomPaint(
      size: Size.square(size),
      painter: _EraserPainter(theme.color ?? Palette.text),
    );
  }
}

class _EraserPainter extends CustomPainter {
  _EraserPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    final pen = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.8 * s
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round;
    canvas.save();
    canvas.translate(12 * s, 11 * s);
    canvas.rotate(-math.pi / 4);
    final body = RRect.fromRectAndRadius(
      Rect.fromCenter(center: Offset.zero, width: 17 * s, height: 9 * s),
      Radius.circular(2 * s),
    );
    canvas.drawRRect(body, pen);
    canvas.drawLine(Offset(-2.5 * s, -4.5 * s), Offset(-2.5 * s, 4.5 * s), pen);
    canvas.restore();
    canvas.drawLine(Offset(9 * s, 21 * s), Offset(21 * s, 21 * s), pen);
  }

  @override
  bool shouldRepaint(_EraserPainter old) => old.color != color;
}
