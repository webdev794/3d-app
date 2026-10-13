import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../export_service.dart';
import '../widgets/flow_ui.dart';
import '../widgets/ui.dart';
import '../widgets/viewer_host_stub.dart'
    if (dart.library.js_interop) '../widgets/viewer_host_web.dart'
    if (dart.library.io) '../widgets/viewer_host_io.dart';

/// The 3DEEZI Artboard (CorelDRAW-style artwork editor), the same page the
/// website uses. "Send to 3D Studio" puts the artwork on the kit.
class ArtboardScreen extends StatefulWidget {
  const ArtboardScreen(this.c, {super.key});
  final AppController c;
  @override
  State<ArtboardScreen> createState() => _ArtboardScreenState();
}

class _ArtboardScreenState extends State<ArtboardScreen> {
  ViewerHost? _host;

  AppController get c => widget.c;

  @override
  void initState() {
    super.initState();
    if (ViewerHost.supported) {
      _host = ViewerHost(_onMessage, page: 'artboard', channel: 'Artboard');
    }
  }

  @override
  void dispose() {
    _host?.dispose();
    super.dispose();
  }

  static String _dataUrl(Uint8List bytes) {
    final png = bytes.length > 3 && bytes[0] == 0x89 && bytes[1] == 0x50;
    return 'data:image/${png ? 'png' : 'jpeg'};base64,${base64Encode(bytes)}';
  }

  Future<void> _onMessage(String message) async {
    final msg = jsonDecode(message) as Map<String, dynamic>;
    switch (msg['type']) {
      case 'ready':
        // The user's logos and artwork appear in the artboard's Assets tab.
        final images = [...c.logos, ...c.uploads, ...c.artwork].take(16);
        _host?.send(
          jsonEncode({
            'cmd': 'setAssets',
            'arg': [
              for (final (i, bytes) in images.indexed)
                {'name': 'Asset ${i + 1}', 'src': _dataUrl(bytes)},
            ],
          }),
        );
      case 'artwork':
        final data = msg['data'] as String?;
        if (data == null) return;
        c.logos.add(base64Decode(data.split(',').last));
        final shorts = c.garment == 'Shorts';
        c.addLayer({
          'type': 'image',
          'name': (msg['name'] as String?) ?? 'Artboard design',
          'src': data,
          'part': shorts ? 'shorts' : 'top',
          'side': 'front',
          'x': shorts ? 0.15 : 0.105,
          'y': shorts ? 0.2 : 0.6,
          'w': shorts ? 0.07 : 0.075,
        });
        c.go(AppScreen.studio);
        if (mounted) {
          showToast(
            context,
            'Artwork added to your kit. Move it in 2D panels or on the 3D kit.',
          );
        }
      case 'export':
        final data = msg['data'] as String?;
        // PNG, vector SVG and PDF all arrive as base64 data URLs.
        if (data == null || !data.contains(';base64,')) return;
        final note = await shareImage(
          base64Decode(data.split(',').last),
          (msg['name'] as String?) ?? '3deezi-artwork.png',
        );
        if (mounted) showToast(context, note);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      TopBar(
        onBack: c.back,
        title: 'Artboard',
        subtitle: 'Logos, shapes and artwork',
      ),
      Expanded(
        child: _host == null
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'The artboard opens on phones, tablets and the web app.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Palette.muted),
                  ),
                ),
              )
            : _host!.build(),
      ),
    ],
  );
}
