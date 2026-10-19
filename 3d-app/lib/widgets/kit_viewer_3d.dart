import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

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
  late final ViewerHost _host;
  bool _ready = false;
  String? _sentDesign, _sentView;
  Uint8List? _sentPattern, _sentLogo, _sentSponsor;
  final _captures = <String, Completer<Uint8List?>>{};
  final _requests = <String, Completer<Map<String, dynamic>?>>{};
  int _nextRequest = 0;
  bool? _sentBoard;
  String? _sentSelection;

  AppController get c => widget.controller;

  @override
  void initState() {
    super.initState();
    if (!KitViewer3D.supported) return;
    _host = ViewerHost(_onMessage);
    c.addListener(_sync);
    c.captureMockup = capture;
    c.captureBoard = captureBoard;
    c.processArtwork = processArtwork;
    c.pickGarment = pickGarment;
    c.zoomBoard = _zoomBoard;
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
      if (c.processArtwork == processArtwork) c.processArtwork = null;
      if (c.pickGarment == pickGarment) c.pickGarment = null;
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
      case 'selection':
        if (c.selectedLayerId != msg['id']) {
          _sentSelection = msg['id'] as String?;
          c.selectLayer(_sentSelection);
        }
      case 'captureBoard':
      case 'image':
      case 'pick':
        _requests.remove(msg['id'])?.complete(msg);
    }
  }

  static String _hex(Color color) =>
      '#${color.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}';

  /// Pushes only what changed: the design JSON is small, the pattern tile is
  /// sent once per new tile.
  void _sync() {
    if (!_ready || !mounted) return;
    final design = jsonEncode({
      'garment': switch (c.garment) {
        'Singlet' => 'singlet',
        'Training Tee' => 'tee',
        'Polo' => 'polo',
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
      'gradient': c.gradient,
      'marks': c.marks,
      'patternColor': _hex(
        Color.lerp(c.mainColor, c.secondaryColor, 0.55) ?? c.secondaryColor,
      ),
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
    if (view != _sentView) {
      _sentView = view;
      _send('setView', view);
    }
    if (_sentBoard != c.boardMode) {
      _sentBoard = c.boardMode;
      _send('board', c.boardMode);
    }
    if (_sentSelection != c.selectedLayerId) {
      _sentSelection = c.selectedLayerId;
      _send('select', c.selectedLayerId);
    }
  }

  void _send(String cmd, Object? arg) =>
      _host.send(jsonEncode({'cmd': cmd, 'arg': arg}));

  Future<Map<String, dynamic>?> _request(
    String command,
    Map<String, dynamic> argument,
  ) async {
    if (!_ready) return null;
    final id = 'flutter-${_nextRequest++}';
    final pending = Completer<Map<String, dynamic>?>();
    _requests[id] = pending;
    _send(command, {'id': id, ...argument});
    try {
      return await pending.future.timeout(
        const Duration(seconds: 15),
        onTimeout: () => null,
      );
    } finally {
      _requests.remove(id);
    }
  }

  Future<Uint8List?> captureBoard() async =>
      ProjectSync.bytes((await _request('captureBoard', {}))?['data']);

  Future<String> processArtwork(
    String src, {
    bool removeBg = false,
    String? tint,
  }) async {
    final result = await _request('processImage', {
      'src': src,
      'removeBg': removeBg,
      'tint': tint,
      'maxSize': 1024,
    });
    if (result?['data'] is String) return result!['data'] as String;
    throw StateError(
      result?['error'] as String? ??
          'The artwork editor is not ready. Please try again.',
    );
  }

  Future<Map<String, dynamic>?> pickGarment(double x, double y) =>
      _request('pick', {'x': x, 'y': y});

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
