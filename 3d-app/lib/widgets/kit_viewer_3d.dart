import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../app_controller.dart';
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

  AppController get c => widget.controller;

  @override
  void initState() {
    super.initState();
    if (!KitViewer3D.supported) return;
    _host = ViewerHost(_onMessage);
    c.addListener(_sync);
    c.captureMockup = capture;
  }

  @override
  void dispose() {
    if (KitViewer3D.supported) {
      _host.dispose();
      c.removeListener(_sync);
      if (c.captureMockup == capture) c.captureMockup = null;
      for (final pending in _captures.values) {
        if (!pending.isCompleted) pending.complete(null);
      }
    }
    super.dispose();
  }

  void _onMessage(String message) {
    if (!mounted) return;
    final msg = jsonDecode(message) as Map<String, dynamic>;
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
      'patternColor': _hex(
        Color.lerp(c.mainColor, c.secondaryColor, 0.55) ?? c.secondaryColor,
      ),
    });
    if (design != _sentDesign) {
      _sentDesign = design;
      _send('setDesign', jsonDecode(design));
    }
    final tile = c.patternTile;
    if (tile != null && !identical(tile, _sentPattern)) {
      _sentPattern = tile;
      _send('setDesign', {
        'patternImage': 'data:image/png;base64,${base64Encode(tile)}',
      });
    }
    final logo = c.logoImage;
    if (!identical(logo, _sentLogo)) {
      _sentLogo = logo;
      _send('setDesign', {
        'logoImage': logo == null
            ? null
            : 'data:image/png;base64,${base64Encode(logo)}',
      });
    }
    final sponsor = c.sponsorImage;
    if (!identical(sponsor, _sentSponsor)) {
      _sentSponsor = sponsor;
      _send('setDesign', {
        'sponsorImage': sponsor == null
            ? null
            : 'data:image/png;base64,${base64Encode(sponsor)}',
      });
    }
    final view = c.view;
    if (view != _sentView) {
      _sentView = view;
      _send('setView', view);
    }
  }

  void _send(String cmd, Object? arg) =>
      _host.send(jsonEncode({'cmd': cmd, 'arg': arg}));

  /// PNG of the kit from [view] ('Front', 'Side' or 'Back').
  Future<Uint8List?> capture(String view) {
    if (!_ready) return Future.value(null);
    final pending = _captures[view] = Completer<Uint8List?>();
    _send('capture', view);
    return pending.future.timeout(
      const Duration(seconds: 8),
      onTimeout: () => null,
    );
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
