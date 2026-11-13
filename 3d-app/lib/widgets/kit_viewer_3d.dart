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
  const KitViewer3D({
    super.key,
    required this.controller,
    this.height = 380,
    this.hidden = EdgeInsets.zero,
  });
  final AppController controller;
  final double height;

  /// The edges of the 3D the screen doesn't show (drawn larger than its box):
  /// the viewer keeps its logo / words menu in the rest.
  final EdgeInsets hidden;

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

  /// A whole design sent that the viewer has not answered yet (designApplied,
  /// or its error): the next one waits for it, so a colour drag never queues
  /// dozens of full repaints in the viewer (LIVEFIX L1 2026-11-12, as the
  /// website's host). The watch frees it if no answer ever comes.
  bool _designBusy = false;
  Timer? _designWatch;

  /// Designs sent and not answered yet (the pictures go on their own), and
  /// YOUR DESIGN's still a moment after the last is on (THUMB 2026-11-12).
  int _paints = 0;
  Timer? _stillTimer;

  /// The phone switched 3D off for the viewer (its 'webgl' error, LIVEFIX L1
  /// 2026-11-12): said plainly over the stage; cleared when the 3D comes back.
  bool _webglOff = false;

  /// The viewer could not put the design on (its setDesign error): said over
  /// the stage with what helps, and Try again (LIVEFIX L1 2026-11-12).
  bool _designFailed = false;

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
    c.neckShot = _neckShot;
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
    _designBusy = false;
    _designWatch?.cancel();
    c.viewerReady = false;
    _sentDesign = _sentView = _sentSelection = null;
    _sentPattern = _sentLogo = _sentSponsor = null;
    _sentBoard = _sentPick = _sentPartPick = _sentObjects = null;
    c.objectOnKit = false;
    setState(() => _host = _openHost());
  }

  void _zoomBoard(String how) => _send('boardZoom', how);

  /// The neck close-up (Garment style's NECK DETAIL), as JPEG bytes.
  Future<Uint8List?> _neckShot() async {
    final m = await _request(
      'neckShot',
      const {},
      wait: const Duration(seconds: 30),
    );
    return ProjectSync.bytes(m?['data']);
  }

  @override
  void dispose() {
    if (KitViewer3D.supported) {
      _host.dispose();
      _designWatch?.cancel();
      _stillTimer?.cancel();
      c.removeListener(_sync);
      if (c.captureMockup == capture) c.captureMockup = null;
      if (c.captureBoard == captureBoard) c.captureBoard = null;
      if (c.zoomBoard == _zoomBoard) c.zoomBoard = null;
      if (c.checkLayout == _checkLayout) {
        c.checkLayout = null;
        c.viewerReady = false;
      }
      if (c.viewerModal) c.viewerModal = false;
      if (c.objectOnKit) c.objectOnKit = false;
      if (c.processArtwork == processArtwork) c.processArtwork = null;
      if (c.pickGarment == pickGarment) c.pickGarment = null;
      if (c.hoverGarment == _hoverGarment) c.hoverGarment = null;
      if (c.glowPart == _glowPart) c.glowPart = null;
      if (c.neckShot == _neckShot) c.neckShot = null;
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
        setState(() {
          _ready = true;
          _webglOff = false;
          _designFailed = false;
        });
        c.viewerReady = true;
        _designBusy = false;
        _paints = 0;
        _sentPick = _sentPartPick = _sentObjects = null;
        // This app answers the viewer's requests for print layout files.
        // and picks pictures for "Upload picture here" on the kit (task 9.144).
        _send('features', {'layouts': true, 'images': true});
        _sendHidden();
        _sync();
      case 'designApplied':
        if (_paints > 0) _paints--;
        if (_designFailed) setState(() => _designFailed = false);
        _designDone();
        _stillLater();
      case 'error':
        if (msg['command'] == 'setDesign') {
          if (_paints > 0) _paints--;
          _designDone();
          debugPrint('3D could not apply the design: ${msg['message']} (${msg['step'] ?? ''})');
          setState(() => _designFailed = true);
        }
        if (msg['command'] == 'webgl') {
          debugPrint('3D switched off for the viewer: ${msg['message']}');
          setState(() => _webglOff = true);
        }
      case 'webglRestored':
        setState(() => _webglOff = false);
      case 'notice':
        final text = msg['message'];
        if (text is String && mounted) {
          ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(text)));
        }
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
      case 'objectSelected':
        final on = msg['on'] == true;
        if (c.objectOnKit != on) c.update(() => c.objectOnKit = on);
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
      case 'neckShot':
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
        'Shooting shirt' => 'shooting-shirt',
        'Socks' => 'socks',
        'Cap' => 'cap',
        '5 panel cap' => 'five-panel-cap',
        'Beanie' => 'beanie',
        'Skirt' => 'skirt',
        'Bucket hat' => 'bucket-hat',
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
      // Garment style: the neck (or rugby collar) and a rugby jersey's fit
      // (null: the garment's own; sent always so a reset clears the last).
      'neck': c.neck,
      'fit': c.fit,
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
    // One whole design in flight at a time; the latest goes when it is answered.
    if (design != _sentDesign && !_designBusy) {
      _sentDesign = design;
      _designBusy = true;
      _designWatch?.cancel();
      _designWatch = Timer(const Duration(seconds: 60), _designDone);
      _paints++;
      _send('setDesign', jsonDecode(design));
    }
    final tile = c.patternTile;
    if (!identical(tile, _sentPattern)) {
      _sentPattern = tile;
      _paints++;
      _send('setDesign', {'patternImage': ProjectSync.dataUrl(tile)});
    }
    final logo = c.logoImage;
    if (!identical(logo, _sentLogo)) {
      _sentLogo = logo;
      _paints++;
      _send('setDesign', {'logoImage': ProjectSync.dataUrl(logo)});
    }
    final sponsor = c.sponsorImage;
    if (!identical(sponsor, _sentSponsor)) {
      _sentSponsor = sponsor;
      _paints++;
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
    _stillLater();
  }

  /// YOUR DESIGN's still of the user's own kit: taken a moment after the
  /// viewer has put the latest design on and the changes have stopped.
  void _stillLater() {
    _stillTimer?.cancel();
    if (!_ready || _paints > 0 || c.ownKit == null) return;
    _stillTimer = Timer(const Duration(milliseconds: 1200), () {
      if (mounted && _ready && _paints == 0 && c.ownStillWanted) {
        unawaited(c.takeOwnStill());
      }
    });
  }

  /// The viewer answered the design in flight (or never did, after a
  /// minute): the latest design, if it changed meanwhile, goes now.
  void _designDone() {
    _designWatch?.cancel();
    if (!_designBusy) return;
    _designBusy = false;
    if (mounted) _sync();
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

  /// Tells the viewer which edges are out of sight (and that it runs in the
  /// app: its logo / words menu is compact and can be dragged).
  void _sendHidden() {
    final h = widget.hidden;
    _send('insets', {
      'top': h.top,
      'right': h.right,
      'bottom': h.bottom,
      'left': h.left,
    });
  }

  @override
  void didUpdateWidget(KitViewer3D old) {
    super.didUpdateWidget(old);
    if (KitViewer3D.supported && _ready && old.hidden != widget.hidden) {
      _sendHidden();
    }
  }

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
            if (_designFailed && !_webglOff)
              ColoredBox(
                color: const Color(0xff03060a),
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          'The 3D preview could not show this design. If it keeps happening, close and reopen the app.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Color(0xffe6f7ff), fontSize: 14, height: 1.45),
                        ),
                        const SizedBox(height: 14),
                        OutlinedButton(
                          onPressed: () {
                            setState(() => _designFailed = false);
                            _sentDesign = null;
                            _designBusy = false;
                            _sync();
                          },
                          child: const Text('Try again'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            if (_webglOff)
              const ColoredBox(
                color: Color(0xff03060a),
                child: Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      '3D was switched off on this screen. Close and reopen the app to continue.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Color(0xffe6f7ff), fontSize: 14, height: 1.45, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ),
            IgnorePointer(
              child: AnimatedOpacity(
                opacity: _ready || _webglOff ? 0 : 1,
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
