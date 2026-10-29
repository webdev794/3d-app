import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:image_picker/image_picker.dart';

import '../api_client.dart';
import '../app_controller.dart';
import '../design_document.dart';
import '../project_sync.dart';
import 'ui.dart';
import 'viewer_host_stub.dart'
    if (dart.library.js_interop) 'viewer_host_web.dart'
    if (dart.library.io) 'viewer_host_io.dart';

/// The real-time 3D kit (Three.js, bundled in assets/viewer). Mirrors the
/// controller's design into the viewer and exposes view snaps and captures.
/// Runs in a WebView on phones and an iframe on the web; falls back to
/// [KitPreview] where neither exists (tests).
class KitViewer3D extends StatefulWidget {
  const KitViewer3D({super.key, required this.controller, this.height = 380});
  final AppController controller;
  final double height;

  static bool get supported => ViewerHost.supported;

  @override
  State<KitViewer3D> createState() => KitViewer3DState();
}

class KitViewer3DState extends State<KitViewer3D> {
  late ViewerHost _host;

  /// The viewer was opened with the HQ jersey (?hq=1); a change reopens it.
  late bool _hq;
  bool _ready = false;
  String? _sentDesign, _sentView;
  int? _sentPresses;
  Uint8List? _sentPattern, _sentLogo, _sentSponsor;
  final _captures = <String, Completer<Uint8List?>>{};
  final _requests = <String, Completer<Map<String, dynamic>?>>{};
  int _nextRequest = 0;
  bool? _sentBoard;
  String? _sentSelection;
  String? _typedField;
  DateTime _typedAt = DateTime(0);
  bool? _sentPick, _sentPartPick, _sentObjects;

  AppController get c => widget.controller;

  @override
  void initState() {
    super.initState();
    if (!KitViewer3D.supported) return;
    _hq = c.hqJersey;
    _host = _openHost();
    c.addListener(_sync);
    c.captureMockup = capture;
    c.captureBoard = captureBoard;
    c.processArtwork = processArtwork;
    c.pickGarment = pickGarment;
    c.hoverGarment = _hoverGarment;
    c.glowPart = _glowPart;
    c.viewerPassThrough = _passThrough;
    c.zoomBoard = _zoomBoard;
    c.checkLayout = _checkLayout;
  }

  ViewerHost _openHost() => ViewerHost(_onMessage, query: _hq ? 'hq=1' : '');

  /// The HQ jersey is chosen when the viewer starts: a new viewer, sent
  /// everything again once it is ready.
  void _reopen() {
    _host.dispose();
    _hq = c.hqJersey;
    _ready = false;
    c.viewerReady = false;
    _sentDesign = _sentView = _sentSelection = null;
    _sentPattern = _sentLogo = _sentSponsor = null;
    _sentBoard = _sentPick = _sentPartPick = _sentObjects = null;
    setState(() => _host = _openHost());
  }

  void _zoomBoard(String how) => _send('boardZoom', how);

  @override
  void dispose() {
    if (KitViewer3D.supported) {
      _host.dispose();
      c.removeListener(_sync);
      if (c.captureMockup == capture) c.captureMockup = null;
      if (c.captureBoard == captureBoard) c.captureBoard = null;
      if (c.zoomBoard == _zoomBoard) c.zoomBoard = null;
      if (c.checkLayout == _checkLayout) {
        c.checkLayout = null;
        c.viewerReady = false;
      }
      if (c.viewerModal) c.viewerModal = false;
      if (c.processArtwork == processArtwork) c.processArtwork = null;
      if (c.pickGarment == pickGarment) c.pickGarment = null;
      if (c.hoverGarment == _hoverGarment) c.hoverGarment = null;
      if (c.glowPart == _glowPart) c.glowPart = null;
      if (c.viewerPassThrough == _passThrough) c.viewerPassThrough = null;
      for (final pending in _captures.values) {
        if (!pending.isCompleted) pending.complete(null);
      }
      for (final pending in _requests.values) {
        if (!pending.isCompleted) pending.complete(null);
      }
    }
    super.dispose();
  }

  void _onMessage(String message) {
    if (!mounted) return;
    final Map<String, dynamic> msg;
    try {
      final value = jsonDecode(message);
      if (value is! Map<String, dynamic>) return;
      msg = value;
    } on FormatException {
      return;
    }
    switch (msg['type']) {
      case 'ready':
        setState(() => _ready = true);
        c.viewerReady = true;
        _sentPick = _sentPartPick = _sentObjects = null;
        // This app answers the viewer's requests for print layout files.
        // and picks pictures for "Upload picture here" on the kit (task 9.144).
        _send('features', {'layouts': true, 'images': true});
        _sync();
      case 'capture':
        final data = msg['data'] as String?;
        _captures
            .remove(msg['view'])
            ?.complete(
              data == null ? null : base64Decode(data.split(',').last),
            );
      case 'layers':
        c.edit(() => c.layers = copyLayers(msg['layers']));
      case 'marks':
        c.edit(() => c.marks = copyMarks(msg['marks']));
      case 'markText':
        // A word edited on the 3D kit (task 9.144).
        final value = '${msg['value'] ?? ''}';
        // A typing burst (the same word, under 3 s apart) is one Undo step.
        final field = '${msg['field']}', now = DateTime.now();
        final burst =
            field == _typedField &&
            now.difference(_typedAt) < const Duration(seconds: 3);
        _typedField = field;
        _typedAt = now;
        void set(VoidCallback change) =>
            burst ? c.update(change) : c.edit(change);
        switch (field) {
          case 'logoText':
            set(() => c.logoText = value);
          case 'backName':
            set(() => c.backName = value);
          case 'number':
            set(() => c.number = value);
        }
      case 'wantImage':
        unawaited(_pickImage('${msg['id'] ?? ''}'));
      case 'selection':
        if (c.selectedLayerId != msg['id']) {
          _sentSelection = msg['id'] as String?;
          c.selectLayer(_sentSelection);
        }
      case 'colourPick':
        // A tap on the kit while the Colours panel is open (the viewer
        // glows the part itself); a tap on empty space is ignored.
        if (msg['hit'] == true) c.colourPick?.call(msg);
      case 'partPick':
        // A tap on one part of the kit (task 9.134; the viewer lights up the
        // whole part): the Studio opens its Part panel.
        if (msg['hit'] == true) c.partPick?.call(msg);
      case 'modal':
        c.update(() => c.viewerModal = msg['open'] == true);
      case 'layoutWanted':
        if (msg['asset'] case final int asset) unawaited(_sendLayout(asset));
      case 'layoutError':
        showToast(
          context,
          'Print layout: ${msg['message'] ?? 'it could not be loaded.'} The '
          'kit is shown without it (Artwork, Factory print layout).',
        );
      case 'captureBoard':
      case 'image':
      case 'pick':
      case 'layout':
        _requests.remove(msg['id'])?.complete(msg);
    }
  }

  static String _hex(Color color) =>
      '#${color.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}';

  /// Pushes only what changed: the design JSON is small, the pattern tile is
  /// sent once per new tile.
  void _sync() {
    if (!mounted) return;
    if (c.hqJersey != _hq) return _reopen();
    if (!_ready) return;
    final design = jsonEncode({
      'garment': switch (c.garment) {
        'Singlet' => 'singlet',
        'Netball dress' => 'netball-dress',
        'Football jersey' => 'nfljersey',
        'Compression top' => 'compression',
        'Training Tee' => 'tee',
        'Polo' => 'polo',
        'Polo with pocket' => 'pocketpolo',
        'Hoodie' => 'hoodie',
        'Zip hoodie' => 'ziphoodie',
        'Varsity jacket' => 'varsity',
        'Track jacket' => 'trackjacket',
        'Shorts' => 'shorts',
        'Full Kit' => 'fullkit',
        _ => 'jersey',
      },
      'main': _hex(c.mainColor),
      'secondary': _hex(c.secondaryColor),
      'accent': _hex(c.accentColor),
      'pattern': c.pattern,
      'logoText': c.logoText,
      'backName': c.backName,
      'number': c.number,
      'layers': c.layers,
      'zones': c.zones,
      'patternScale': c.patternScale ?? 0.3,
      'patternBody': c.patternBody ?? 0.06,
      'zoneColors': c.zoneColors,
      'trackStyle': c.trackStyle,
      'gradient': c.gradient,
      'gradients': c.gradients,
      'marks': c.marks,
      'layout': c.layout,
      'patternColor': c.patternColor ?? _hex(c.defaultPatternColor),
      // The pattern's own colour paints the built-in and area patterns too
      // (picked on the PATTERN tab or by tapping the pattern; viewer -37).
      'patternColorOwn': c.patternColorOwn == true,
      // The parts with a look of their own (task 9.134); always sent, so an
      // empty one clears the last.
      'parts': c.parts,
      // Colours › Fabric type: mesh holes, a satin sheen, a matt cotton feel
      // on the 3D kit (Standard: the garment's own fabric; viewer -40).
      'fabric': c.fabric,
    });
    if (design != _sentDesign) {
      _sentDesign = design;
      _send('setDesign', jsonDecode(design));
    }
    final tile = c.patternTile;
    if (!identical(tile, _sentPattern)) {
      _sentPattern = tile;
      _send('setDesign', {'patternImage': ProjectSync.dataUrl(tile)});
    }
    final logo = c.logoImage;
    if (!identical(logo, _sentLogo)) {
      _sentLogo = logo;
      _send('setDesign', {'logoImage': ProjectSync.dataUrl(logo)});
    }
    final sponsor = c.sponsorImage;
    if (!identical(sponsor, _sentSponsor)) {
      _sentSponsor = sponsor;
      _send('setDesign', {'sponsorImage': ProjectSync.dataUrl(sponsor)});
    }
    final view = c.view;
    if (view != _sentView || c.viewPresses != _sentPresses) {
      _sentView = view;
      _sentPresses = c.viewPresses;
      _send('setView', view);
    }
    if (_sentBoard != c.boardMode) {
      _sentBoard = c.boardMode;
      _send('board', c.boardMode);
    }
    final pick = c.colourPick != null;
    if (_sentPick != pick) {
      _sentPick = pick;
      _send('colourPick', pick);
    }
    // Taps open a part's panel; not while the Colours panel takes them.
    final parts = c.partPick != null && !pick && !c.boardMode;
    if (_sentPartPick != parts) {
      _sentPartPick = parts;
      _send('partPick', parts);
    }
    // Tap the crest, words and logos on the kit to edit them (task 9.144).
    final objects = !c.boardMode;
    if (_sentObjects != objects) {
      _sentObjects = objects;
      _send('objectEdit', objects);
    }
    if (_sentSelection != c.selectedLayerId) {
      _sentSelection = c.selectedLayerId;
      _send('select', c.selectedLayerId);
    }
  }

  /// "Upload picture here" on the kit: a picture from the gallery, sent back
  /// as a data URL (null when cancelled).
  Future<void> _pickImage(String id) async {
    String? data;
    try {
      final file = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1200,
        maxHeight: 1200,
      );
      if (file != null) {
        final bytes = await file.readAsBytes();
        final png = bytes.length > 4 && bytes[0] == 0x89 && bytes[1] == 0x50;
        data =
            'data:image/${png ? 'png' : 'jpeg'};base64,${base64Encode(bytes)}';
      }
    } catch (_) {
      data = null;
    }
    if (mounted) _send('imageChosen', {'id': id, 'data': data});
  }

  void _send(String cmd, Object? arg) =>
      _host.send(jsonEncode({'cmd': cmd, 'arg': arg}));

  Future<Map<String, dynamic>?> _request(
    String command,
    Map<String, dynamic> argument, {
    Duration wait = const Duration(seconds: 15),
  }) async {
    if (!_ready) return null;
    final id = 'flutter-${_nextRequest++}';
    final pending = Completer<Map<String, dynamic>?>();
    _requests[id] = pending;
    _send(command, {'id': id, ...argument});
    try {
      return await pending.future.timeout(wait, onTimeout: () => null);
    } finally {
      _requests.remove(id);
    }
  }

  /// A new print layout checked on screen in the 3D view (the user may take
  /// their time); see [AppController.checkLayout].
  Future<Map<String, dynamic>?> _checkLayout(
    String src,
    String name,
    int asset, {
    bool drawing = false,
    String? garment,
    bool known = false,
  }) async {
    final result = await _request('checkLayout', {
      'src': src,
      'name': name,
      'asset': asset,
      if (drawing) 'drawing': true,
      'garment': ?garment,
      if (known) 'known': true,
    }, wait: const Duration(minutes: 30));
    if (result?['error'] case final String error) throw ApiException(error);
    return result;
  }

  /// The design's print layout file, which the viewer has not read yet.
  Future<void> _sendLayout(int asset) async {
    try {
      if (!c.signedIn) {
        throw ApiException('Sign in to see this kit\u2019s print layout.');
      }
      final src = await c.api.assetDataUrl(asset);
      if (mounted) _send('layoutFile', {'asset': asset, 'src': src});
    } on Object catch (error) {
      if (mounted) _send('layoutFile', {'asset': asset, 'error': '$error'});
    }
  }

  Future<Uint8List?> captureBoard() async =>
      ProjectSync.bytes((await _request('captureBoard', {}))?['data']);

  Future<String> processArtwork(
    String src, {
    bool removeBg = false,
    String? tint,
    int maxSize = 1024,
  }) async {
    final result = await _request('processImage', {
      'src': src,
      'removeBg': removeBg,
      'tint': tint,
      'maxSize': maxSize,
    });
    if (result?['data'] is String) return result!['data'] as String;
    throw StateError(
      result?['error'] as String? ??
          'The artwork editor is not ready. Please try again.',
    );
  }

  Future<Map<String, dynamic>?> pickGarment(double x, double y) =>
      _request('pick', {'x': x, 'y': y});

  /// Drag to kit: the finger's place, sent once a frame while a pattern or
  /// logo is dragged over the kit (the viewer glows the part there); null
  /// clears the glow at once.
  void _passThrough(bool on) => _host.passThrough = on;

  /// Lights up a whole part ({part, key}: a part chosen in the Part panel's
  /// list); null clears the glow.
  void _glowPart(Map<String, dynamic>? part) {
    if (_ready) _send('glowPart', part);
  }

  Offset? _hoverAt;
  bool _hoverQueued = false;
  void _hoverGarment(Offset? at) {
    _hoverAt = at;
    if (at == null) {
      if (_ready) _send('dragHover', null);
      return;
    }
    if (_hoverQueued) return;
    _hoverQueued = true;
    SchedulerBinding.instance.scheduleFrameCallback((_) {
      _hoverQueued = false;
      final at = _hoverAt;
      if (at == null || !mounted || !_ready) return;
      _send('dragHover', {'x': at.dx, 'y': at.dy});
    });
  }

  /// PNG of the kit from [view] ('Front', 'Side' or 'Back').
  Future<Uint8List?> capture(String view) {
    if (!_ready) return Future.value(null);
    if (_captures.containsKey(view)) return _captures[view]!.future;
    final pending = _captures[view] = Completer<Uint8List?>();
    _send('capture', view);
    return pending.future
        .timeout(const Duration(seconds: 8), onTimeout: () => null)
        .whenComplete(() => _captures.remove(view));
  }

  @override
  Widget build(BuildContext context) {
    if (!KitViewer3D.supported) {
      return KitPreview(controller: c, height: widget.height);
    }
    return SizedBox(
      height: widget.height,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          fit: StackFit.expand,
          children: [
            _host.build(),
            IgnorePointer(
              child: AnimatedOpacity(
                opacity: _ready ? 0 : 1,
                duration: const Duration(milliseconds: 400),
                child: const ColoredBox(
                  color: Color(0xff03060a),
                  child: Center(
                    child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Palette.cyan,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
