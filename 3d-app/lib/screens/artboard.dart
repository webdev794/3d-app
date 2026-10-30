import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../ai_service.dart' show designGarments;
import '../api_client.dart';
import '../app_controller.dart';
import '../assist.dart';
import '../export_service.dart';
import '../widgets/flow_ui.dart';
import '../widgets/ui.dart';
import '../widgets/viewer_host_stub.dart'
    if (dart.library.js_interop) '../widgets/viewer_host_web.dart'
    if (dart.library.io) '../widgets/viewer_host_io.dart';

/// Where artwork from the Artboard can go on a garment (the website's
/// placements, the same kit coordinates): id, label, part, side, x, y, w, rot.
const artboardPlacements =
    <(String, String, String, String, double, double, double, double)>[
      ('left-chest', 'Left chest', 'top', 'front', 0.105, 0.6, 0.075, 0),
      ('right-chest', 'Right chest', 'top', 'front', -0.105, 0.6, 0.075, 0),
      ('centre-chest', 'Centre chest', 'top', 'front', 0, 0.5, 0.17, 0),
      ('full-front', 'Full front', 'top', 'front', 0, 0.36, 0.32, 0),
      ('left-sleeve', 'Left sleeve', 'top', 'front', 0.375, 0.54, 0.055, -24),
      ('right-sleeve', 'Right sleeve', 'top', 'front', -0.375, 0.54, 0.055, 24),
      ('back-top', 'Back neck', 'top', 'back', 0, 0.66, 0.16, 0),
      ('back-centre', 'Back centre', 'top', 'back', 0, 0.4, 0.26, 0),
      ('shorts-left', 'Shorts left leg', 'shorts', 'front', 0.15, 0.2, 0.07, 0),
      (
        'shorts-right',
        'Shorts right leg',
        'shorts',
        'front',
        -0.15,
        0.2,
        0.07,
        0,
      ),
    ];

/// The parts of a garment artwork can go on.
List<String> artboardParts(String garment) => garment == 'Shorts'
    ? const ['shorts']
    : garment == 'Full Kit'
    ? const ['top', 'shorts']
    : const ['top'];

/// The layer position for a placement id on [garment] (the first that fits
/// when the id is unknown or not on that garment).
Map<String, dynamic> artboardPlacement(String? id, String garment) {
  final parts = artboardParts(garment);
  final fits = artboardPlacements.where((p) => parts.contains(p.$3)).toList();
  final p =
      fits.where((p) => p.$1 == id).firstOrNull ??
      fits.firstWhere(
        (p) => p.$1 == (garment == 'Shorts' ? 'shorts-left' : 'left-chest'),
        orElse: () => fits.first,
      );
  return {
    'part': p.$3,
    'side': p.$4,
    'x': p.$5,
    'y': p.$6,
    'w': p.$7,
    'rot': p.$8,
  };
}

/// The 3DEEZI Artboard (CorelDRAW-style artwork editor), the same page the
/// website uses. "Send to 3D Studio" puts the artwork on the kit, linked to
/// the design kept in the account (Edit in Artboard opens it again, sending
/// again updates it in place); File > Save to my account and Open from my
/// account keep designs and templates in the account (see projects.js).
class ArtboardScreen extends StatefulWidget {
  const ArtboardScreen(this.c, {super.key});
  final AppController c;
  @override
  State<ArtboardScreen> createState() => _ArtboardScreenState();
}

class _ArtboardScreenState extends State<ArtboardScreen> {
  ViewerHost? _host;

  /// 3DEEZI ASSIST commands sent to the page, waiting for its answer.
  final _assistWaiting = <int, Completer<String>>{};
  int _assistId = 0;
  late final AssistRunner _assistRunner = _assist;

  /// Phones: the page's colour panel is open under the artwork. It has its
  /// own Assist button, so the round one makes way meanwhile (viewerModal).
  bool _colourDock = false;

  AppController get c => widget.c;

  @override
  void initState() {
    super.initState();
    c.addListener(_leftWithColourDock);
    if (ViewerHost.supported) {
      _host = ViewerHost(_onMessage, page: 'artboard', channel: 'Artboard');
    }
  }

  /// Leaving the Artboard with the colour panel open (Send to 3D Studio, AI /
  /// DYO, back): the next screen and the Assist button show without it
  /// straight away.
  void _leftWithColourDock() {
    if (!_colourDock || c.screen == AppScreen.artboard) return;
    _colourDock = false;
    c.viewerModal = false;
  }

  @override
  void dispose() {
    c.removeListener(_leftWithColourDock);
    AssistBridge.unregister('artboard', _assistRunner);
    if (_colourDock && c.viewerModal) {
      c.viewerModal = false;
      WidgetsBinding.instance.addPostFrameCallback((_) => c.update(() {}));
    }
    for (final waiting in _assistWaiting.values) {
      waiting.completeError(AssistError('The Artboard was closed.'));
    }
    _host?.dispose();
    super.dispose();
  }

  /// Runs a 3DEEZI ASSIST command in the artboard page (show the grid, pick a
  /// tool, select the text, …) and returns what it did.
  Future<String> _assist(String action, String value) {
    final id = ++_assistId, done = Completer<String>();
    _assistWaiting[id] = done;
    _host?.send(
      jsonEncode({
        'cmd': 'assistMsg',
        'arg': {'id': id, 'action': action, 'value': value},
      }),
    );
    return done.future.timeout(
      const Duration(seconds: 10),
      onTimeout: () {
        _assistWaiting.remove(id);
        throw AssistError('The Artboard did not answer. Please try again.');
      },
    );
  }

  /// What the page needs to know: the account, the kit in the Studio, the
  /// garments and placements for Send to 3D Studio.
  void _sendHost() => _host?.send(
    jsonEncode({
      'cmd': 'host',
      'arg': {
        'docs': true,
        'signedIn': c.signedIn,
        'kit': {
          'name': c.projectName.isEmpty
              ? '${c.sport} ${c.garment}'
              : c.projectName,
          'garment': c.garment,
          'artboards': [
            for (final l in c.layers)
              if (l['artboard'] is num) l['artboard'],
          ],
        },
        'garments': [
          for (final g in designGarments)
            {'id': g, 'name': g, 'parts': artboardParts(g)},
        ],
        'placements': [
          for (final p in artboardPlacements)
            {'id': p.$1, 'label': p.$2, 'part': p.$3},
        ],
      },
    }),
  );

  /// The page's requests for designs in the account and for the projects.
  Future<void> _docs(Map<String, dynamic> msg) async {
    void reply(Map<String, Object?> arg) => _host?.send(
      jsonEncode({
        'cmd': 'docsReply',
        'arg': {'id': msg['id'], ...arg},
      }),
    );
    int? id(Object? v) => (v as num?)?.toInt();
    try {
      if (msg['op'] == 'projects') {
        // This device's saved kits (signed in or not); not the samples.
        reply({
          'ok': true,
          'data': [
            for (final p in c.projects)
              if (p.asset == null || p.persisted)
                {
                  'id': p.id,
                  'name': p.title,
                  'garment': p.garment,
                  'artboards': [
                    for (final l in p.kit.layers)
                      if (l['artboard'] is num) l['artboard'],
                  ],
                },
          ],
        });
        return;
      }
      if (!c.signedIn) {
        reply({
          'ok': false,
          'signin': true,
          'status': 401,
          'error': 'Sign in to keep your designs in your 3DEEZI account.',
        });
        return;
      }
      final Object? data = switch (msg['op']) {
        'list' => await c.api.artboards(template: msg['template'] == true),
        'get' => await c.api.artboard(id(msg['doc'])!),
        'save' => await c.api.saveArtboard(
          id: id(msg['doc']),
          name: '${msg['name'] ?? 'Artboard design'}',
          document: '${msg['document']}',
          preview: msg['preview'] as String?,
          template: msg['template'] == true,
          version: id(msg['version']),
        ),
        'delete' =>
          await c.api.deleteArtboard(id(msg['doc'])!).then((_) => null),
        _ => throw ApiException('The Artboard asked for something unknown.'),
      };
      reply({'ok': true, 'data': data});
    } on ApiException catch (e) {
      reply({'ok': false, 'error': e.message, 'status': e.status ?? 0});
    } on Object {
      reply({'ok': false, 'error': 'That did not work. Please try again.'});
    }
  }

  static String _dataUrl(Uint8List bytes) {
    final png = bytes.length > 3 && bytes[0] == 0x89 && bytes[1] == 0x50;
    return 'data:image/${png ? 'png' : 'jpeg'};base64,${base64Encode(bytes)}';
  }

  Future<void> _onMessage(String message) async {
    final msg = jsonDecode(message) as Map<String, dynamic>;
    switch (msg['type']) {
      case 'start':
        // AI / DYO / HOME quick access on the Artboard's top bar (the
        // artwork is already saved in the page).
        if (msg['mode'] == 'ai') c.startAi();
        if (msg['mode'] == 'dyo') c.startDyo();
        if (msg['mode'] == 'home') c.go(AppScreen.home);
      case 'colourDock':
        // The colour panel under the artwork opened or closed (phones).
        _colourDock = msg['open'] == true;
        c.update(() => c.viewerModal = _colourDock);
      case 'assistOpen':
        // The colour panel's Assist button (the panel has closed).
        _colourDock = false;
        if (c.viewerModal) c.update(() => c.viewerModal = false);
        AssistController.latest?.show();
      case 'assist':
        final waiting = _assistWaiting.remove((msg['id'] as num?)?.toInt());
        final text = '${msg['text'] ?? ''}';
        if (msg['ok'] == true) {
          waiting?.complete(text);
        } else {
          waiting?.completeError(AssistError(text));
        }
      case 'docs':
        await _docs(msg);
      case 'signin':
        // The design is already kept in the page; sign in, then come back.
        c.go(AppScreen.auth);
      case 'ready':
        // 3DEEZI ASSIST can run commands here from now on.
        AssistBridge.register('artboard', _assistRunner);
        _sendHost();
        // Edit in Artboard: the design an artwork layer came from.
        final doc = c.openArtboardDoc;
        if (doc != null) {
          c.openArtboardDoc = null;
          _host?.send(
            jsonEncode({
              'cmd': 'openDoc',
              'arg': {'id': doc},
            }),
          );
        }
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
        // Where it goes: the kit in the Studio, a new kit or a project.
        final target = (msg['target'] as Map?)?.cast<String, dynamic>() ?? {};
        if (target['kind'] == 'garment' &&
            designGarments.contains(target['garment'])) {
          c.newKit(target['garment'] as String);
        } else if (target['kind'] == 'project') {
          final p = c.projects
              .where((p) => p.id == '${target['project']}')
              .firstOrNull;
          final open =
              c.selectedProject >= 0 &&
              c.selectedProject < c.projects.length &&
              c.projects[c.selectedProject] == p;
          if (p != null && !open) c.loadProject(p);
        }
        final name = (msg['name'] as String?) ?? 'Artboard design';
        final result = c.placeArtboardArtwork(
          src: data,
          name: name,
          doc: (msg['artboard'] as num?)?.toInt(),
          at: artboardPlacement(msg['placement'] as String?, c.garment),
        );
        c.go(AppScreen.studio);
        if (mounted) {
          showToast(context, switch (result) {
            'updated' => '$name updated on your kit: same place and size.',
            'full' => 'A design supports up to 40 artwork layers.',
            _ =>
              'Artwork added to your kit. Move it in 2D panels or on the 3D kit.',
          });
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
