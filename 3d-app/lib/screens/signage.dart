import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';

import '../api_client.dart';
import '../app_controller.dart';
import '../marquee.dart';
import '../project_sync.dart';
import '../widgets/bubble_page.dart' show BubbleRoute;
import '../widgets/ui.dart' show showToast;
import '../widgets/viewer_host_stub.dart'
    if (dart.library.js_interop) '../widgets/viewer_host_web.dart'
    if (dart.library.io) '../widgets/viewer_host_io.dart';

// SIGNAGE & MARQUEES in the app (client mockups 297 / 298, 2026-11-02), as
// on the website (pages/Signage.tsx): the landing page with the products and
// MARQUEE SETUP, and the Marquee Studio with the shared 3D marquee
// (assets/viewer/marquee.html).

const _bg = Color(0xff020810);
const _panel = Color(0xff0a1a2b);
const _line = Color(0x662a6c94);
const _cyan = Color(0xff22d4ff);
const _muted = Color(0xff8eabc1);

TextStyle _heading(double size, {Color color = Colors.white}) => TextStyle(
  fontFamily: 'Rajdhani',
  fontWeight: FontWeight.w700,
  fontSize: size,
  letterSpacing: .6,
  color: color,
);

Color _colour(String hex) =>
    Color(int.parse('ff${hex.substring(1)}', radix: 16));

/// Picks a picture (PNG, JPEG or WebP) as a data URL, or null.
Future<String?> _pickPicture(BuildContext context) async {
  final file = await openFile(
    acceptedTypeGroups: const [
      XTypeGroup(
        label: 'Pictures',
        extensions: ['png', 'jpg', 'jpeg', 'webp'],
        mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
        uniformTypeIdentifiers: [
          'public.png',
          'public.jpeg',
          'org.webmproject.webp',
        ],
      ),
    ],
  );
  if (file == null) return null;
  final bytes = await file.readAsBytes();
  if (bytes.length > 3 * 1024 * 1024) {
    if (context.mounted) {
      showToast(context, 'Pick a picture under 3 MB.');
    }
    return null;
  }
  final mime = bytes.length > 3 && bytes[0] == 0x89 && bytes[1] == 0x50
      ? 'image/png'
      : bytes.length > 11 && bytes[8] == 0x57 && bytes[9] == 0x45
      ? 'image/webp'
      : 'image/jpeg';
  return 'data:$mime;base64,${base64Encode(bytes)}';
}

// ---------- the shared 3D marquee

/// The 3D marquee (assets/viewer/marquee.html) in a WebView or iframe: the
/// design is painted on it, a tap on a panel calls [onZonePick], each repaint
/// sends the panels' small previews ([onPanels]), and with a [tool] a drag
/// moves or scales the selected layer ([onLayerChange]). [showroom]: the
/// landing page's stage. Shows a plain placeholder where no WebView exists
/// (tests).
class MarqueeView extends StatefulWidget {
  const MarqueeView({
    super.key,
    required this.design,
    this.view = 'Front',
    this.showroom = false,
    this.zone,
    this.layer,
    this.tool,
    this.onZonePick,
    this.onPanels,
    this.onLayerChange,
  });

  final Map<String, dynamic> design;
  final String view;
  final bool showroom;
  final String? zone;
  final ({String zone, String id})? layer;
  final String? tool;
  final ValueChanged<String>? onZonePick;
  final ValueChanged<Map<String, Uint8List>>? onPanels;
  final ValueChanged<Map<String, dynamic>>? onLayerChange;

  static bool get supported => ViewerHost.supported;

  @override
  State<MarqueeView> createState() => MarqueeViewState();
}

class MarqueeViewState extends State<MarqueeView> {
  ViewerHost? _host;
  bool _ready = false;
  final _sent = <String, String>{};
  final _captures = <String, Completer<Uint8List?>>{};

  @override
  void initState() {
    super.initState();
    if (!MarqueeView.supported) return;
    _host = ViewerHost(
      _onMessage,
      file: 'marquee.html',
      query: widget.showroom ? 'scene=showroom' : '',
    );
  }

  @override
  void dispose() {
    _host?.dispose();
    for (final c in _captures.values) {
      if (!c.isCompleted) c.complete(null);
    }
    super.dispose();
  }

  @override
  void didUpdateWidget(MarqueeView old) {
    super.didUpdateWidget(old);
    _sync();
  }

  void _send(String cmd, Object? arg, {bool always = false}) {
    final json = jsonEncode({'cmd': cmd, 'arg': arg});
    if (!always && _sent[cmd] == json) return;
    _sent[cmd] = json;
    _host?.send(json);
  }

  void _sync() {
    if (!_ready) return;
    _send('setDesign', widget.design);
    _send('setView', widget.view);
    _send('selectZone', widget.zone);
    final l = widget.layer;
    _send('selectLayer', l == null ? null : {'zone': l.zone, 'id': l.id});
    _send('tool', widget.tool);
  }

  /// Snaps the camera to [view] again (a view button tapped twice).
  void setView(String view) => _send('setView', view, always: true);

  /// A picture of the marquee from [view] (PNG bytes), or null.
  Future<Uint8List?> capture([String view = 'Front']) {
    if (!_ready) return Future.value(null);
    final done = _captures[view] = Completer<Uint8List?>();
    _send('capture', view, always: true);
    return done.future.timeout(
      const Duration(seconds: 20),
      onTimeout: () => null,
    );
  }

  void _onMessage(String message) {
    if (!mounted) return;
    Map<String, dynamic> msg;
    try {
      final v = jsonDecode(message);
      if (v is! Map<String, dynamic>) return;
      msg = v;
    } on FormatException {
      return;
    }
    switch (msg['type']) {
      case 'ready':
        setState(() => _ready = true);
        _sent.clear();
        _sync();
      case 'zonePick':
        if (msg['zone'] is String)
          widget.onZonePick?.call(msg['zone'] as String);
      case 'panels':
        final images = msg['images'];
        if (images is Map) {
          widget.onPanels?.call({
            for (final e in images.entries)
              if (ProjectSync.bytes(e.value) case final b?) '${e.key}': b,
          });
        }
      case 'layerChange':
        widget.onLayerChange?.call(msg);
      case 'capture':
        final pending = _captures.remove('${msg['view']}');
        pending?.complete(ProjectSync.bytes(msg['data']));
    }
  }

  @override
  Widget build(BuildContext context) {
    final host = _host;
    if (host == null) {
      return Container(
        key: const ValueKey('marquee-view-placeholder'),
        color: const Color(0xff03070c),
        alignment: Alignment.center,
        child: const Icon(Icons.festival_outlined, color: _cyan, size: 64),
      );
    }
    return Stack(
      fit: StackFit.expand,
      children: [
        host.build(),
        if (!_ready)
          const ColoredBox(
            color: Color(0xe603070c),
            child: Center(
              child: Text(
                'Putting up your marquee…',
                style: TextStyle(color: _muted),
              ),
            ),
          ),
      ],
    );
  }
}

// ---------- the way in (the home screen)

/// SIGNAGE & MARQUEES on the home screen: opens [SignageScreen].
class SignageBar extends StatelessWidget {
  const SignageBar(this.c, {super.key});
  final AppController c;

  @override
  Widget build(BuildContext context) => Semantics(
    key: const ValueKey('home-signage-bar'),
    button: true,
    label: 'Signage and marquees',
    excludeSemantics: true,
    child: Material(
      color: const Color(0xff071a2b),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: Color(0xd91fb6ff), width: 1.2),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => Navigator.of(
          context,
        ).push(MaterialPageRoute<void>(builder: (_) => SignageScreen(c))),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 12, 10),
          child: Row(
            children: [
              const Icon(Icons.festival_outlined, color: _cyan, size: 26),
              const SizedBox(width: 10),
              Expanded(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'SIGNAGE & MARQUEES',
                    maxLines: 1,
                    style: _heading(19),
                  ),
                ),
              ),
              const Icon(Icons.chevron_right, color: _cyan),
            ],
          ),
        ),
      ),
    ),
  );
}

// ---------- the landing page

/// The products (Marquees ready, the others COMING SOON), each with the
/// 3DEEZI "3" emblem and wordmark (branding, BR1 2026-11-02).
const signageProducts = [
  (
    id: 'marquees',
    name: 'Marquees',
    ready: true,
    icon: Icons.festival_outlined,
  ),
  (
    id: 'feather-flags',
    name: 'Feather flags',
    ready: false,
    icon: Icons.flag_outlined,
  ),
  (
    id: 'pull-up-banners',
    name: 'Pull-up banners',
    ready: false,
    icon: Icons.crop_portrait,
  ),
  (
    id: 'banners',
    name: 'Banners',
    ready: false,
    icon: Icons.crop_landscape_outlined,
  ),
  (
    id: 'table-covers',
    name: 'Table covers',
    ready: false,
    icon: Icons.table_restaurant_outlined,
  ),
  (
    id: 'backdrops',
    name: 'Backdrops',
    ready: false,
    icon: Icons.panorama_outlined,
  ),
];

/// SIGNAGE & MARQUEES (the website's /signage): the product tiles, the 3D
/// stage, MARQUEE SETUP, START DESIGNING and Upload artwork; signed in, the
/// account's saved marquees.
class SignageScreen extends StatefulWidget {
  const SignageScreen(this.c, {super.key});
  final AppController c;

  @override
  State<SignageScreen> createState() => _SignageScreenState();
}

class _SignageScreenState extends State<SignageScreen> {
  Map<String, dynamic> _design = defaultMarquee();
  String _view = 'Front';
  Future<List<Map<String, dynamic>>>? _saved;

  @override
  void initState() {
    super.initState();
    _loadSaved();
  }

  void _loadSaved() {
    if (!widget.c.signedIn) return;
    _saved = widget.c.api.projects().then(
      (list) => [
        for (final p in list)
          if (p['garment'] == 'marquee') p,
      ],
    );
  }

  void _setup(String key, Object value) =>
      setState(() => _design = {..._design, key: value});

  Future<void> _open({String? artwork, Map<String, dynamic>? project}) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MarqueeStudioScreen(
          widget.c,
          design: project == null
              ? copyMarquee(_design)
              : normalizeMarquee((project['design'] as Map?)?['marquee']),
          projectId: project?['id'] as int?,
          version: project?['version'] as int?,
          name: project?['name'] as String? ?? 'Custom marquee',
          artwork: artwork,
        ),
      ),
    );
    if (mounted) setState(_loadSaved);
  }

  @override
  Widget build(BuildContext context) {
    final walls = '${_design['walls']}';
    return BubbleRoute(
      c: widget.c,
      title: 'SIGNAGE & MARQUEES',
      bubbleKey: const ValueKey('signage-bubble'),
      child: ListView(
        key: const ValueKey('signage-list'),
        padding: const EdgeInsets.fromLTRB(2, 4, 2, 24),
        children: [
          Text.rich(
            TextSpan(
              children: [
                TextSpan(text: 'SIGNAGE & ', style: _heading(32)),
                TextSpan(
                  text: 'MARQUEES',
                  style: _heading(32, color: _cyan),
                ),
              ],
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          const Text(
            'Choose a product. Make it yours.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xffdce8f4), fontSize: 15),
          ),
          const SizedBox(height: 14),
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 1.05,
            children: [
              for (final p in signageProducts)
                _ProductTile(
                  key: ValueKey('signage-tile-${p.id}'),
                  name: p.name,
                  icon: p.icon,
                  ready: p.ready,
                  onTap: p.ready
                      ? () => _open()
                      : () => showToast(
                          context,
                          '${p.name} are coming soon. Marquees are ready to design now.',
                        ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: SizedBox(
              height: 330,
              child: MarqueeView(design: _design, view: _view, showroom: true),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'CUSTOM MARQUEE',
            textAlign: TextAlign.center,
            style: _heading(24),
          ),
          const Text(
            'Roof, valance & wall artwork',
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xffdbe6f0)),
          ),
          const SizedBox(height: 10),
          _GradientButton(
            key: const ValueKey('signage-start'),
            label: 'START DESIGNING',
            onTap: () => _open(),
          ),
          TextButton.icon(
            key: const ValueKey('signage-upload'),
            onPressed: () async {
              final art = await _pickPicture(context);
              if (art != null && mounted) await _open(artwork: art);
            },
            icon: const Icon(Icons.upload_outlined, color: _cyan),
            label: const Text(
              'Upload artwork',
              style: TextStyle(
                color: Colors.white,
                decoration: TextDecoration.underline,
              ),
            ),
          ),
          const SizedBox(height: 8),
          _Card(
            title: 'MARQUEE SETUP',
            children: [
              _Choice(
                label: 'Size',
                options: marqueeSizeLabels,
                value: '${_design['size']}',
                onChanged: (v) => _setup('size', v),
              ),
              _Choice(
                label: 'Walls',
                options: marqueeWallsLabels,
                value: walls,
                onChanged: (v) => _setup('walls', v),
              ),
              _Choice(
                label: 'View',
                options: const {
                  'Front': 'Front',
                  'Back': 'Back',
                  '360°': '360°',
                },
                value: _view,
                onChanged: (v) => setState(() => _view = v),
              ),
            ],
          ),
          if (_saved != null)
            FutureBuilder<List<Map<String, dynamic>>>(
              future: _saved,
              builder: (context, snap) {
                final list = snap.data ?? const [];
                if (list.isEmpty) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 14),
                  child: _Card(
                    title: 'MY MARQUEES',
                    children: [
                      for (final p in list)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: switch (ProjectSync.bytes(p['thumbnail'])) {
                            final b? => ClipRRect(
                              borderRadius: BorderRadius.circular(6),
                              child: Image.memory(
                                b,
                                width: 64,
                                height: 44,
                                fit: BoxFit.cover,
                              ),
                            ),
                            null => const Icon(
                              Icons.festival_outlined,
                              color: _cyan,
                            ),
                          },
                          title: Text(
                            '${p['name']}',
                            style: const TextStyle(color: Colors.white),
                          ),
                          subtitle: Text(
                            '${(p['design'] as Map?)?['productName'] ?? 'Custom marquee'} · v${p['version']}',
                            style: const TextStyle(color: _muted, fontSize: 12),
                          ),
                          trailing: const Icon(
                            Icons.chevron_right,
                            color: _cyan,
                          ),
                          onTap: () => _open(project: p),
                        ),
                    ],
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({
    super.key,
    required this.name,
    required this.icon,
    required this.ready,
    required this.onTap,
  });
  final String name;
  final IconData icon;
  final bool ready;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: ready ? const Color(0xff0b2b44) : const Color(0xff07121e),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(10),
      side: BorderSide(
        color: ready ? _cyan : const Color(0x22ffffff),
        width: ready ? 1.5 : 1,
      ),
    ),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Stack(
        children: [
          Center(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(4, 14, 4, 6),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    icon,
                    size: 30,
                    color: ready ? Colors.white : const Color(0xff7fdcff),
                  ),
                  const SizedBox(height: 5),
                  FittedBox(
                    child: Text(name.toUpperCase(), style: _heading(12)),
                  ),
                  const SizedBox(height: 5),
                  // The "3" emblem and the wordmark, as the brand pictures.
                  SizedBox(
                    height: 9,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Image.asset('assets/images/splash_mark.png', height: 9),
                        const SizedBox(width: 3),
                        Image.asset(
                          'assets/images/brand-wordmark.png',
                          height: 8,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (!ready)
            Positioned(
              top: 4,
              right: 4,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xff0d2a3f),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text(
                  'COMING SOON',
                  style: TextStyle(
                    color: Color(0xff79d6ff),
                    fontSize: 7,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
        ],
      ),
    ),
  );
}

class _GradientButton extends StatelessWidget {
  const _GradientButton({
    super.key,
    required this.label,
    required this.onTap,
    this.busy = false,
  });
  final String label;
  final VoidCallback? onTap;
  final bool busy;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(26),
      gradient: const LinearGradient(
        colors: [Color(0xff00e0e4), Color(0xff04c6f3), Color(0xff7560ff)],
      ),
      boxShadow: const [BoxShadow(color: Color(0x6600b8ff), blurRadius: 18)],
    ),
    child: Material(
      type: MaterialType.transparency,
      child: InkWell(
        borderRadius: BorderRadius.circular(26),
        onTap: busy ? null : onTap,
        child: SizedBox(
          height: 50,
          child: Center(
            child: busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Color(0xff031423),
                    ),
                  )
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        label,
                        style: _heading(16, color: const Color(0xff031423)),
                      ),
                      const SizedBox(width: 8),
                      const Icon(
                        Icons.arrow_forward,
                        color: Color(0xff031423),
                        size: 18,
                      ),
                    ],
                  ),
          ),
        ),
      ),
    ),
  );
}

class _Card extends StatelessWidget {
  const _Card({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  // (A Material, so the layer rows' highlight and ink show.)
  Widget build(BuildContext context) => Material(
    color: _panel,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(12),
      side: const BorderSide(color: _line),
    ),
    child: Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: _heading(18)),
          const Divider(color: Color(0x22ffffff)),
          ...children,
        ],
      ),
    ),
  );
}

class _Choice extends StatelessWidget {
  const _Choice({
    required this.label,
    required this.options,
    required this.value,
    required this.onChanged,
  });
  final String label;
  final Map<String, String> options;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 6, bottom: 4),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: _heading(15)),
        const SizedBox(height: 6),
        Row(
          children: [
            for (final e in options.entries)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: _Chip(
                    text: e.value,
                    on: e.key == value,
                    onTap: () => onChanged(e.key),
                  ),
                ),
              ),
          ],
        ),
      ],
    ),
  );
}

class _Chip extends StatelessWidget {
  const _Chip({
    super.key,
    required this.text,
    required this.on,
    required this.onTap,
    this.icon,
  });
  final String text;
  final bool on;
  final VoidCallback? onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Material(
    color: on ? const Color(0xff0b3044) : const Color(0xff07121e),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(7),
      side: BorderSide(color: on ? _cyan : const Color(0x22ffffff)),
    ),
    child: InkWell(
      borderRadius: BorderRadius.circular(7),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null) ...[
              Icon(
                icon,
                size: 16,
                color: on ? Colors.white : const Color(0xffcfdbe7),
              ),
              const SizedBox(width: 5),
            ],
            Flexible(
              child: Text(
                text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: on ? Colors.white : const Color(0xffcfdbe7),
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

// ---------- the Marquee Studio

/// The Marquee Studio (the website's /signage/marquee): the 3D marquee, the
/// tools (Select, Colours, Logos, Text, Patterns, Upload), the zone's
/// artwork layers and its flat preview, the 2D layout, SAVE (My marquees, the
/// account's projects) and REVIEW DESIGN, which orders the marquee.
class MarqueeStudioScreen extends StatefulWidget {
  const MarqueeStudioScreen(
    this.c, {
    super.key,
    required this.design,
    this.projectId,
    this.version,
    this.name = 'Custom marquee',
    this.artwork,
  });
  final AppController c;
  final Map<String, dynamic> design;
  final int? projectId, version;
  final String name;

  /// A picture to put on the back wall (Upload artwork on the landing page).
  final String? artwork;

  @override
  State<MarqueeStudioScreen> createState() => MarqueeStudioScreenState();
}

class MarqueeStudioScreenState extends State<MarqueeStudioScreen> {
  final _viewer = GlobalKey<MarqueeViewState>();
  late Map<String, dynamic> design = copyMarquee(widget.design);
  late int? _id = widget.projectId, _version = widget.version;
  late final _name = TextEditingController(text: widget.name);
  final _past = <Map<String, dynamic>>[], _future = <Map<String, dynamic>>[];
  Map<String, dynamic>? _liveBase;
  bool _dirty = false, _saving = false;
  String tool = 'select';
  String zone = 'wallBack';
  String? layerId;
  String? _move;
  String _view = 'Front';
  String _target = 'panel';
  final _panels = <String, Uint8List>{};
  final _text = TextEditingController();

  List<String> get zones => marqueeZonesOf(design);
  String get current => zones.contains(zone)
      ? zone
      : (zones.contains('wallBack') ? 'wallBack' : 'roof');
  Map<String, dynamic> get zd =>
      (design['zones'] as Map)[current] as Map<String, dynamic>;
  List<Map<String, dynamic>> get layers =>
      (zd['layers'] as List).cast<Map<String, dynamic>>();
  Map<String, dynamic>? get layer =>
      layers.where((l) => l['id'] == layerId).firstOrNull;
  Map<String, dynamic>? get pattern =>
      layers.where((l) => l['type'] == 'pattern').firstOrNull;

  @override
  void initState() {
    super.initState();
    if (widget.artwork case final art?) {
      final z = zones.contains('wallBack') ? 'wallBack' : 'roof';
      final added = {
        'id': newLayerId(z, 'upload'),
        'type': 'image',
        'name': 'Your artwork',
        'src': art,
        'x': 0.5,
        'y': 0.5,
        'w': 1.0,
      };
      ((design['zones'] as Map)[z]['layers'] as List).add(added);
      zone = z;
      layerId = added['id'] as String;
      _dirty = true;
    }
    _pickTopLayer();
  }

  @override
  void dispose() {
    _name.dispose();
    _text.dispose();
    super.dispose();
  }

  void _pickTopLayer() {
    if (layers.any((l) => l['id'] == layerId)) return;
    layerId =
        (layers.reversed.where((l) => l['type'] != 'pattern').firstOrNull ??
                layers.firstOrNull)?['id']
            as String?;
  }

  /// Changes the design (kept in the undo history unless [live]: a drag or a
  /// slider, committed when it ends).
  void change(void Function(Map<String, dynamic> d) edit, {bool live = false}) {
    final before = copyMarquee(design);
    if (live) {
      _liveBase ??= before;
    } else {
      _past.add(_liveBase ?? before);
      if (_past.length > 50) _past.removeAt(0);
      _future.clear();
      _liveBase = null;
    }
    edit(design);
    setState(() {
      design = copyMarquee(design);
      _dirty = true;
      _pickTopLayer();
    });
  }

  void _commit() {
    final base = _liveBase;
    if (base == null) return;
    _liveBase = null;
    _past.add(base);
    _future.clear();
    setState(() {});
  }

  void _undo() {
    if (_past.isEmpty) return;
    setState(() {
      _future.insert(0, design);
      design = _past.removeLast();
      _dirty = true;
      _pickTopLayer();
    });
  }

  void _redo() {
    if (_future.isEmpty) return;
    setState(() {
      _past.add(design);
      design = _future.removeAt(0);
      _dirty = true;
      _pickTopLayer();
    });
  }

  Map<String, dynamic> _zoneOf(Map<String, dynamic> d) =>
      (d['zones'] as Map)[current] as Map<String, dynamic>;
  List _layersOf(Map<String, dynamic> d) => _zoneOf(d)['layers'] as List;
  void _patchLayer(
    String id,
    Map<String, dynamic> patch, {
    bool live = false,
  }) => change((d) {
    for (final l in _layersOf(d)) {
      if (l['id'] == id) (l as Map).addAll(patch);
    }
  }, live: live);

  void _addLayer(Map<String, dynamic> l) {
    change((d) => _layersOf(d).add(l));
    setState(() => layerId = l['id'] as String);
  }

  void _setPattern(String name) {
    final p = pattern;
    if (p != null) {
      _patchLayer(p['id'] as String, {'name': name});
    } else {
      change(
        (d) => _layersOf(d).insert(0, {
          'id': newLayerId(current, 'pattern'),
          'type': 'pattern',
          'name': name,
          'color': '#00c8ff',
          'accent': '#1560ff',
          'scale': 1,
        }),
      );
    }
  }

  void _setColour(String hex) {
    final t = _target;
    if (t == 'panel') {
      change((d) => _zoneOf(d)['color'] = hex);
    } else if (t == 'text' && layer?['type'] == 'text') {
      _patchLayer(layerId!, {'color': hex});
    } else if (pattern case final p?) {
      _patchLayer(p['id'] as String, {t == 'accent' ? 'accent' : 'color': hex});
    }
  }

  String get _colourValue => switch (_target) {
    'pattern' => '${pattern?['color'] ?? '#00c8ff'}',
    'accent' => '${pattern?['accent'] ?? '#1560ff'}',
    'text' => '${layer?['color'] ?? '#ffffff'}',
    _ => '${zd['color']}',
  };

  void _everyPanel(String what) {
    final source = Map<String, dynamic>.from(zd);
    final p = pattern;
    change((d) {
      final zones = d['zones'] as Map;
      for (final z in marqueeZones) {
        if (z == current) continue;
        final target = zones[z] as Map;
        if (what == 'colour') {
          target['color'] = source['color'];
        } else {
          final others = [
            for (final l in target['layers'] as List)
              if (l['type'] != 'pattern') l,
          ];
          target['layers'] = [
            if (p != null) {...copyMarquee(p), 'id': newLayerId(z, 'pattern')},
            ...others,
          ];
        }
      }
    });
    showToast(
      context,
      what == 'colour'
          ? 'Every panel has this colour now.'
          : 'Every panel has this pattern now.',
    );
  }

  void _layerMoved(Map<String, dynamic> m) {
    final z = m['zone'] as String?, id = m['id'] as String?;
    if (z == null || id == null) return;
    final finalMove = m['final'] == true;
    change((d) {
      for (final l in ((d['zones'] as Map)[z]['layers'] as List)) {
        if (l['id'] != id) continue;
        l['x'] = m['x'];
        l['y'] = m['y'];
        if (m['w'] != null) l['w'] = m['w'];
        if (m['size'] != null) l['size'] = m['size'];
      }
    }, live: !finalMove);
    if (finalMove) _commit();
  }

  Future<bool> _signIn() async {
    if (widget.c.signedIn) return true;
    showToast(context, 'Sign in to save your marquee to your account.');
    Navigator.of(context).popUntil((r) => r.isFirst);
    widget.c.go(AppScreen.auth);
    return false;
  }

  Future<bool> save() async {
    if (!await _signIn()) return false;
    setState(() => _saving = true);
    try {
      final shot = await _viewer.currentState?.capture('Front');
      final body = marqueeProjectBody(
        _name.text,
        design,
        thumbnail: shot == null
            ? null
            : 'data:image/png;base64,${base64Encode(shot)}',
      );
      final saved = _id == null
          ? await widget.c.api.createProject(body)
          : await widget.c.api.updateProject(_id!, {
              ...body,
              'expected_version': ?_version,
            });
      setState(() {
        _id = saved['id'] as int?;
        _version = saved['version'] as int?;
        _dirty = false;
      });
      if (mounted) showToast(context, 'Saved to My marquees.');
      return true;
    } on ApiException catch (e) {
      if (mounted) showToast(context, e.message);
      return false;
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _uploadTo({required bool fill}) async {
    final src = await _pickPicture(context);
    if (src == null || !mounted) return;
    _addLayer({
      'id': newLayerId(current, fill ? 'upload' : 'logo'),
      'type': 'image',
      'name': fill ? 'Your artwork' : 'Logo',
      'src': src,
      'x': 0.5,
      'y': 0.5,
      'w': fill ? 1.0 : 0.3,
    });
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final zs = marqueeZoneSize(current, design);
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        foregroundColor: Colors.white,
        titleSpacing: 0,
        title: Text('CUSTOM MARQUEE', style: _heading(19)),
        actions: [
          IconButton(
            key: const ValueKey('marquee-undo'),
            tooltip: 'Undo',
            onPressed: _past.isEmpty ? null : _undo,
            icon: const Icon(Icons.undo),
          ),
          IconButton(
            key: const ValueKey('marquee-redo'),
            tooltip: 'Redo',
            onPressed: _future.isEmpty ? null : _redo,
            icon: const Icon(Icons.redo),
          ),
          IconButton(
            key: const ValueKey('marquee-save'),
            tooltip: 'Save',
            onPressed: _saving ? null : save,
            icon: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_outlined),
          ),
        ],
      ),
      body: ListView(
        key: const ValueKey('marquee-studio-list'),
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text.rich(
                    TextSpan(
                      children: [
                        const TextSpan(
                          text: 'Signage & Marquees / ',
                          style: TextStyle(color: Color(0xff4fbde9)),
                        ),
                        const TextSpan(
                          text: 'Marquee Studio',
                          style: TextStyle(color: _cyan),
                        ),
                        TextSpan(
                          text:
                              '  ·  ${_dirty || _id == null ? 'Draft' : 'Saved'}',
                          style: const TextStyle(color: _muted),
                        ),
                      ],
                    ),
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
                DropdownButton<String>(
                  key: const ValueKey('marquee-size'),
                  value: '${design['size']}',
                  dropdownColor: _panel,
                  style: const TextStyle(color: Colors.white),
                  underline: const SizedBox.shrink(),
                  items: [
                    for (final e in marqueeSizeLabels.entries)
                      DropdownMenuItem(value: e.key, child: Text(e.value)),
                  ],
                  onChanged: (v) => change((d) => d['size'] = v),
                ),
              ],
            ),
          ),
          SizedBox(
            height: (size.height * .48).clamp(300.0, 520.0),
            child: Stack(
              fit: StackFit.expand,
              children: [
                MarqueeView(
                  key: _viewer,
                  design: design,
                  view: _view,
                  zone: current,
                  layer: layerId == null ? null : (zone: current, id: layerId!),
                  tool: _move,
                  onZonePick: (z) => setState(() {
                    zone = z;
                    _move = null;
                    layerId = null;
                    _pickTopLayer();
                  }),
                  onPanels: (p) => setState(() => _panels.addAll(p)),
                  onLayerChange: _layerMoved,
                ),
                Positioned(
                  left: 8,
                  right: 8,
                  bottom: 8,
                  child: Row(
                    children: [
                      for (final v in const [
                        'Front',
                        'Back',
                        'Left',
                        'Right',
                        '360°',
                      ])
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 2),
                            child: _Chip(
                              text: v,
                              on: _view == v,
                              onTap: () {
                                setState(() => _view = v);
                                _viewer.currentState?.setView(v);
                              },
                            ),
                          ),
                        ),
                      const SizedBox(width: 6),
                      _Chip(
                        key: const ValueKey('marquee-2d'),
                        text: '2D',
                        on: false,
                        onTap: _show2D,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          SizedBox(
            height: 74,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 6),
              children: [
                for (final (id, label, icon) in const [
                  ('select', 'SELECT', Icons.near_me_outlined),
                  ('colours', 'COLOURS', Icons.palette_outlined),
                  ('logos', 'LOGOS', Icons.auto_awesome_outlined),
                  ('text', 'TEXT', Icons.title),
                  ('patterns', 'PATTERNS', Icons.texture),
                  ('upload', 'UPLOAD', Icons.cloud_upload_outlined),
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: SizedBox(
                      width: 78,
                      child: Material(
                        color: _panel,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                          side: BorderSide(
                            color: tool == id ? _cyan : _line,
                            width: tool == id ? 1.5 : 1,
                          ),
                        ),
                        child: InkWell(
                          key: ValueKey('marquee-tool-$id'),
                          borderRadius: BorderRadius.circular(10),
                          onTap: () => setState(() => tool = id),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(icon, color: Colors.white, size: 22),
                              const SizedBox(height: 4),
                              Text(label, style: _heading(11)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: _Card(
              title: tool == 'select' ? 'EDIT PANEL' : tool.toUpperCase(),
              children: _toolPanel(),
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: _Card(
              title: 'ARTWORK LAYERS',
              children: [
                ReorderableListView(
                  key: const ValueKey('marquee-layers'),
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  buildDefaultDragHandles: false,
                  onReorderItem: (from, to) {
                    // The list shows the top layer first; [to] is already
                    // the place after [from] was taken out.
                    final n = layers.length;
                    change((d) {
                      final list = _layersOf(d);
                      final moving = list.removeAt(n - 1 - from);
                      list.insert((n - 1 - to).clamp(0, list.length), moving);
                    });
                  },
                  children: [
                    for (final (i, l) in layers.reversed.indexed)
                      ListTile(
                        key: ValueKey('layer-${l['id']}'),
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        selected: l['id'] == layerId,
                        selectedTileColor: const Color(0x330b2c40),
                        leading: IconButton(
                          tooltip: l['visible'] == false ? 'Show' : 'Hide',
                          icon: Icon(
                            l['visible'] == false
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                            color: _cyan,
                          ),
                          onPressed: () => _patchLayer(l['id'] as String, {
                            'visible': l['visible'] == false,
                          }),
                        ),
                        title: Text(
                          _layerTitle(l),
                          style: const TextStyle(color: Colors.white),
                        ),
                        onTap: () =>
                            setState(() => layerId = l['id'] as String),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (l['id'] == layerId)
                              IconButton(
                                tooltip: 'Delete',
                                icon: const Icon(
                                  Icons.delete_outline,
                                  color: Color(0xffff8fa3),
                                ),
                                onPressed: () => change(
                                  (d) => _layersOf(
                                    d,
                                  ).removeWhere((x) => x['id'] == l['id']),
                                ),
                              ),
                            ReorderableDragStartListener(
                              index: i,
                              child: const Icon(
                                Icons.drag_indicator,
                                color: _muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: _Card(
              title: 'PANEL PREVIEW',
              children: [
                Text(
                  '${marqueeZoneLabel(current, design).toUpperCase()}${zs == null ? '' : ' · ${metres(zs.w)} × ${metres(zs.h)}'}',
                  style: _heading(15),
                ),
                const SizedBox(height: 8),
                if (_panels[current] case final b?)
                  Image.memory(
                    b,
                    key: const ValueKey('marquee-panel-preview'),
                    fit: BoxFit.contain,
                    gaplessPlayback: true,
                  )
                else
                  const SizedBox(
                    height: 80,
                    child: Center(
                      child: Text(
                        'The preview shows once the 3D marquee is ready.',
                        style: TextStyle(color: _muted),
                      ),
                    ),
                  ),
                TextButton.icon(
                  onPressed: _show2D,
                  icon: const Icon(Icons.open_in_new, color: _cyan),
                  label: const Text(
                    'Open 2D layout',
                    style: TextStyle(color: _cyan),
                  ),
                ),
                const Text(
                  'Check each printable panel before approval.',
                  style: TextStyle(color: Color(0xffc5d4e1)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: _GradientButton(
              key: const ValueKey('marquee-review'),
              label: 'REVIEW DESIGN',
              onTap: _review,
            ),
          ),
        ],
      ),
    );
  }

  String _layerTitle(Map<String, dynamic> l) => switch (l['type']) {
    'pattern' => 'Background pattern',
    'text' => 'Text · ${l['text'] ?? ''}',
    _ => '${l['name'] ?? 'Logo'}',
  };

  Widget _swatches(String value, ValueChanged<String> onPick) => Wrap(
    spacing: 10,
    runSpacing: 10,
    children: [
      for (final hex in marqueeSwatches)
        GestureDetector(
          key: ValueKey('swatch-$hex'),
          onTap: () => onPick(hex),
          child: Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: _colour(hex),
              shape: BoxShape.circle,
              border: Border.all(
                color: value.toLowerCase() == hex
                    ? Colors.white
                    : const Color(0x44ffffff),
                width: 2,
              ),
              boxShadow: value.toLowerCase() == hex
                  ? const [BoxShadow(color: _cyan, blurRadius: 10)]
                  : null,
            ),
          ),
        ),
    ],
  );

  List<Widget> _toolPanel() {
    final l = layer;
    switch (tool) {
      case 'colours':
        return [
          Row(
            children: [
              for (final (t, label) in const [
                ('panel', 'Panel'),
                ('pattern', 'Pattern'),
                ('accent', 'Accent'),
                ('text', 'Text'),
              ])
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: _Chip(
                      text: label,
                      on: _target == t,
                      onTap:
                          (t == 'text' && l?['type'] != 'text') ||
                              ((t == 'pattern' || t == 'accent') &&
                                  pattern == null)
                          ? null
                          : () => setState(() => _target = t),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          _swatches(_colourValue, _setColour),
          TextButton(
            onPressed: () => _everyPanel('colour'),
            child: const Text(
              'Use this panel colour on every panel →',
              style: TextStyle(color: _cyan),
            ),
          ),
        ];
      case 'logos':
        return [
          Text(
            'Add a logo to the ${marqueeZoneLabel(current, design).toLowerCase()}, then Move or Scale it on the marquee.',
            style: const TextStyle(color: _muted),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              for (final (src, name, asset) in const [
                (brandLogo, '3DEEZI emblem', 'assets/images/splash_mark.png'),
                (
                  brandWordmark,
                  '3DEEZI wordmark',
                  'assets/images/brand-wordmark.png',
                ),
              ])
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: OutlinedButton(
                      key: ValueKey('marquee-logo-$src'),
                      onPressed: () => _addLayer({
                        'id': newLayerId(current, 'logo'),
                        'type': 'image',
                        'name': name,
                        'src': src,
                        'x': 0.5,
                        'y': 0.5,
                        'w': current.startsWith('valance') ? 0.3 : 0.32,
                      }),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Column(
                          children: [
                            Image.asset(asset, height: 30),
                            const SizedBox(height: 6),
                            Text(
                              name,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () => _uploadTo(fill: false),
            icon: const Icon(Icons.cloud_upload_outlined, color: _cyan),
            label: const Text(
              'Upload your logo',
              style: TextStyle(color: Colors.white),
            ),
          ),
        ];
      case 'text':
        final isText = l?['type'] == 'text';
        if (isText && _text.text != l!['text'])
          _text.text = '${l['text'] ?? ''}';
        return [
          OutlinedButton.icon(
            key: const ValueKey('marquee-add-text'),
            onPressed: () {
              final valance = current.startsWith('valance');
              _addLayer({
                'id': newLayerId(current, 'text'),
                'type': 'text',
                'name': 'Text',
                'text': 'YOUR TEAM',
                'color': '#ffffff',
                'x': 0.5,
                'y': valance ? 0.5 : 0.75,
                'size': valance ? 0.55 : 0.12,
              });
            },
            icon: const Icon(Icons.title, color: _cyan),
            label: Text(
              'Add text to the ${marqueeZoneLabel(current, design).toLowerCase()}',
              style: const TextStyle(color: Colors.white),
            ),
          ),
          if (isText) ...[
            const SizedBox(height: 10),
            TextField(
              key: const ValueKey('marquee-text-field'),
              controller: _text,
              maxLength: 60,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'Words',
                labelStyle: TextStyle(color: _muted),
              ),
              onChanged: (v) => _patchLayer(layerId!, {'text': v}, live: true),
              onEditingComplete: _commit,
              onTapOutside: (_) => _commit(),
            ),
            Row(
              children: [
                Expanded(
                  child: _Chip(
                    text: 'Sport italic',
                    on: l!['font'] != 'JerseyBlock',
                    onTap: () => _patchLayer(layerId!, {'font': 'Rajdhani'}),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: _Chip(
                    text: 'Jersey block',
                    on: l['font'] == 'JerseyBlock',
                    onTap: () => _patchLayer(layerId!, {'font': 'JerseyBlock'}),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            _swatches(
              '${l['color'] ?? '#ffffff'}',
              (hex) => _patchLayer(layerId!, {'color': hex}),
            ),
          ] else
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text(
                'Choose a text layer below to change its words.',
                style: TextStyle(color: _muted),
              ),
            ),
        ];
      case 'patterns':
        final p = pattern;
        return [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final name in marqueePatterns)
                _Chip(
                  key: ValueKey('marquee-pattern-$name'),
                  text: name,
                  on: (p?['name'] ?? 'Solid') == name,
                  onTap: () => _setPattern(name),
                ),
            ],
          ),
          if (p != null && p['name'] != 'Solid') ...[
            const SizedBox(height: 12),
            const Text('Pattern colour', style: TextStyle(color: _muted)),
            const SizedBox(height: 6),
            _swatches(
              '${p['color']}',
              (hex) => _patchLayer(p['id'] as String, {'color': hex}),
            ),
            const SizedBox(height: 10),
            const Text('Accent', style: TextStyle(color: _muted)),
            const SizedBox(height: 6),
            _swatches(
              '${p['accent']}',
              (hex) => _patchLayer(p['id'] as String, {'accent': hex}),
            ),
            Slider(
              value: ((p['scale'] as num?)?.toDouble() ?? 1).clamp(0.4, 2.5),
              min: 0.4,
              max: 2.5,
              label: 'Pattern size',
              onChanged: (v) =>
                  _patchLayer(p['id'] as String, {'scale': v}, live: true),
              onChangeEnd: (_) => _commit(),
            ),
          ],
          TextButton(
            onPressed: () => _everyPanel('pattern'),
            child: const Text(
              'Use this pattern on every panel →',
              style: TextStyle(color: _cyan),
            ),
          ),
        ];
      case 'upload':
        final zs = marqueeZoneSize(current, design);
        return [
          OutlinedButton.icon(
            key: const ValueKey('marquee-upload-art'),
            onPressed: () => _uploadTo(fill: true),
            icon: const Icon(Icons.cloud_upload_outlined, color: _cyan),
            label: Text(
              'Upload artwork for the ${marqueeZoneLabel(current, design).toLowerCase()}',
              style: const TextStyle(color: Colors.white),
            ),
          ),
          if (zs != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'Print area ${metres(zs.w)} × ${metres(zs.h)}. Your picture fills the panel\'s width.',
                style: const TextStyle(color: _muted),
              ),
            ),
        ];
    }
    // Select: the zones, the walls, the panel colour and the selected layer.
    final wallsValue =
        '${design['walls']}${design['halfWall'] == true && design['walls'] != 'full' ? '+half' : ''}';
    return [
      const Text('Design zone', style: TextStyle(color: Color(0xffdbe6ef))),
      const SizedBox(height: 8),
      Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final z in zones)
            _Chip(
              key: ValueKey('marquee-zone-$z'),
              text: marqueeZoneLabel(z, design),
              on: z == current,
              onTap: () => setState(() {
                zone = z;
                _move = null;
                layerId = null;
                _pickTopLayer();
              }),
            ),
        ],
      ),
      const SizedBox(height: 10),
      Row(
        children: [
          const Text('Walls  ', style: TextStyle(color: _muted)),
          Expanded(
            child: DropdownButton<String>(
              key: const ValueKey('marquee-walls'),
              isExpanded: true,
              value: wallsValue,
              dropdownColor: _panel,
              style: const TextStyle(color: Colors.white),
              items: [
                for (final (v, label) in const [
                  ('none', 'Roof only'),
                  ('none+half', 'Roof + half wall'),
                  ('back', 'Back wall'),
                  ('back+half', 'Back + half wall'),
                  ('full', 'Full walls'),
                ])
                  DropdownMenuItem(value: v, child: Text(label)),
              ],
              onChanged: (v) {
                if (v == null) return;
                final parts = v.split('+');
                change((d) {
                  d['walls'] = parts.first;
                  d['halfWall'] = parts.length > 1;
                });
              },
            ),
          ),
        ],
      ),
      const Divider(color: Color(0x22ffffff)),
      Text('COLOURS', style: _heading(15)),
      const SizedBox(height: 8),
      _swatches(
        '${zd['color']}',
        (hex) => change((d) => _zoneOf(d)['color'] = hex),
      ),
      const Divider(color: Color(0x22ffffff)),
      Text('SELECTED LAYER', style: _heading(15)),
      const SizedBox(height: 6),
      Text(
        l == null ? 'No layer' : _layerTitle(l),
        style: const TextStyle(color: Colors.white),
      ),
      const SizedBox(height: 8),
      Row(
        children: [
          Expanded(
            child: _Chip(
              key: const ValueKey('marquee-move'),
              icon: Icons.open_with,
              text: 'Move',
              on: _move == 'move',
              onTap: l == null || l['type'] == 'pattern'
                  ? null
                  : () =>
                        setState(() => _move = _move == 'move' ? null : 'move'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _Chip(
              key: const ValueKey('marquee-scale'),
              icon: Icons.open_in_full,
              text: 'Scale',
              on: _move == 'scale',
              onTap: l == null || l['type'] == 'pattern'
                  ? null
                  : () => setState(
                      () => _move = _move == 'scale' ? null : 'scale',
                    ),
            ),
          ),
        ],
      ),
      if (_move != null)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(
            _move == 'move'
                ? 'Drag the layer on the marquee to move it.'
                : 'Drag up or down on the marquee to resize the layer.',
            style: const TextStyle(color: _muted, fontSize: 12),
          ),
        ),
      if (l != null && l['type'] != 'pattern')
        Slider(
          value: ((l['type'] == 'image' ? l['w'] : l['size']) as num? ?? 0.3)
              .toDouble()
              .clamp(0.02, 1.0),
          min: 0.02,
          max: 1,
          label: 'Size',
          onChanged: (v) => _patchLayer(layerId!, {
            l['type'] == 'image' ? 'w' : 'size': v,
          }, live: true),
          onChangeEnd: (_) => _commit(),
        ),
    ];
  }

  void _show2D() => showModalBottomSheet<void>(
    context: context,
    backgroundColor: _bg,
    isScrollControlled: true,
    builder: (context) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: .8,
      builder: (context, scroll) => ListView(
        controller: scroll,
        padding: const EdgeInsets.all(16),
        children: [
          Text('2D LAYOUT', style: _heading(22)),
          const Text(
            'Every printable panel flat. Tap one to edit it.',
            style: TextStyle(color: _muted),
          ),
          const SizedBox(height: 10),
          for (final z in zones)
            _flat(z, () {
              Navigator.of(context).pop();
              setState(() {
                zone = z;
                layerId = null;
                _pickTopLayer();
              });
            }),
        ],
      ),
    ),
  );

  Widget _flat(String z, VoidCallback onTap) {
    final s = marqueeZoneSize(z, design)!;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        key: ValueKey('flat-$z'),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: const Color(0xff07121d),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: z == current ? _cyan : const Color(0x1cffffff),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AspectRatio(
                aspectRatio: s.w / s.h,
                child: _panels[z] == null
                    ? const ColoredBox(color: Colors.black)
                    : Image.memory(_panels[z]!, fit: BoxFit.contain),
              ),
              const SizedBox(height: 4),
              Text(
                '${marqueeZoneLabel(z, design)}  ·  ${metres(s.w)} × ${metres(s.h)}',
                style: const TextStyle(color: Colors.white, fontSize: 13),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// REVIEW DESIGN: every panel, "I have checked every panel", then the
  /// order (how many, contact, delivery). The marquee is saved first.
  Future<void> _review() async {
    var checked = false, ordering = false, busy = false;
    var quantity = 1;
    final contact = TextEditingController(text: widget.c.user?.name ?? ''),
        phone = TextEditingController(),
        address = TextEditingController(),
        notes = TextEditingController();
    String? error;
    final ordered = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: _bg,
      isScrollControlled: true,
      builder: (sheet) => StatefulBuilder(
        builder: (sheet, set) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: .9,
          builder: (context, scroll) => ListView(
            key: const ValueKey('marquee-review-list'),
            controller: scroll,
            padding: const EdgeInsets.all(16),
            children: [
              Text('REVIEW DESIGN', style: _heading(22, color: _cyan)),
              Text(
                '${_name.text} · ${marqueeSizeLabels[design['size']]}',
                style: _heading(20),
              ),
              const SizedBox(height: 8),
              if (!ordering) ...[
                const Text(
                  'Check each printable panel.',
                  style: TextStyle(color: _muted),
                ),
                const SizedBox(height: 8),
                for (final z in zones)
                  _flat(z, () => Navigator.of(sheet).pop(false)),
                CheckboxListTile(
                  key: const ValueKey('marquee-final'),
                  value: checked,
                  activeColor: _cyan,
                  contentPadding: EdgeInsets.zero,
                  title: const Text(
                    'I have checked every panel. This design is final.',
                    style: TextStyle(color: Colors.white),
                  ),
                  onChanged: (v) => set(() => checked = v ?? false),
                ),
                _GradientButton(
                  key: const ValueKey('marquee-order'),
                  label: 'ORDER THIS MARQUEE',
                  onTap: checked
                      ? () {
                          if (!widget.c.signedIn) {
                            Navigator.of(sheet).pop(false);
                            _signIn();
                            return;
                          }
                          set(() => ordering = true);
                        }
                      : null,
                ),
              ] else ...[
                const Text(
                  'How many, and where to send them. We\'ll confirm the price and timing before anything is made.',
                  style: TextStyle(color: _muted),
                ),
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'How many marquees',
                        style: TextStyle(color: Colors.white),
                      ),
                    ),
                    IconButton(
                      onPressed: quantity > 1
                          ? () => set(() => quantity--)
                          : null,
                      icon: const Icon(
                        Icons.remove_circle_outline,
                        color: _cyan,
                      ),
                    ),
                    Text(
                      '$quantity',
                      key: const ValueKey('marquee-quantity'),
                      style: _heading(20),
                    ),
                    IconButton(
                      onPressed: quantity < 500
                          ? () => set(() => quantity++)
                          : null,
                      icon: const Icon(Icons.add_circle_outline, color: _cyan),
                    ),
                  ],
                ),
                for (final (ctl, label, lines) in [
                  (contact, 'Contact name', 1),
                  (phone, 'Phone', 1),
                  (address, 'Delivery address', 2),
                  (notes, 'Notes', 2),
                ])
                  TextField(
                    controller: ctl,
                    maxLines: lines,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      labelText: label,
                      labelStyle: const TextStyle(color: _muted),
                    ),
                  ),
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      error!,
                      style: const TextStyle(color: Color(0xffff8fa3)),
                    ),
                  ),
                const SizedBox(height: 14),
                _GradientButton(
                  key: const ValueKey('marquee-place-order'),
                  label: 'PLACE ORDER',
                  busy: busy,
                  onTap: () async {
                    if (contact.text.trim().isEmpty) {
                      set(() => error = 'Add a contact name.');
                      return;
                    }
                    set(() {
                      busy = true;
                      error = null;
                    });
                    try {
                      if (_dirty || _id == null) {
                        if (!await save() || _id == null) {
                          set(() => busy = false);
                          return;
                        }
                      }
                      await widget.c.api.createOrder(
                        marqueeOrderBody(
                          projectId: _id!,
                          version: _version,
                          design: design,
                          quantity: quantity,
                          contact: contact.text.trim(),
                          phone: phone.text,
                          address: address.text,
                          notes: notes.text,
                        ),
                      );
                      if (sheet.mounted) Navigator.of(sheet).pop(true);
                    } on ApiException catch (e) {
                      set(() {
                        busy = false;
                        error = e.message;
                      });
                    }
                  },
                ),
              ],
            ],
          ),
        ),
      ),
    );
    // (After the sheet's closing animation, which still shows the fields.)
    Future<void>.delayed(const Duration(seconds: 1), () {
      for (final t in [contact, phone, address, notes]) {
        t.dispose();
      }
    });
    if (ordered == true && mounted) {
      showToast(
        context,
        'Your marquee order is in. We will confirm the price and timing.',
      );
    }
  }
}
