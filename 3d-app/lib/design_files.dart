import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';

import 'api_client.dart' show ApiException;
import 'app_controller.dart';
import 'widgets/ui.dart';
import 'widgets/viewer_host_stub.dart'
    if (dart.library.js_interop) 'widgets/viewer_host_web.dart'
    if (dart.library.io) 'widgets/viewer_host_io.dart';

/// AI Designer design files (client 2026-11-02, picture 295.jpg): besides
/// pictures, a PDF, SVG, AI, EPS, PSD, TIFF or HEIC can be attached to the
/// brief. The AI reads pictures, so the file is drawn as one: pictures by
/// Flutter, PDF / SVG (and TIFF / HEIC where the WebView opens them) by the
/// same pdf.js the 3D viewer uses (assets/viewer/reader.html, hidden), and the
/// rest by the server when it can (`POST /convert/picture`); otherwise a plain
/// message to save it as PDF, SVG or PNG. The file itself is kept with the
/// picture (uploaded to Assets with it when the designs are saved).
class ReferenceFile {
  ReferenceFile({
    required this.name,
    required this.label,
    this.original,
    this.page = 1,
    this.pages = 1,
  });

  /// The file's name and its type as shown on the chip (PDF, AI, SVG…).
  final String name, label;

  /// The design file as picked (null for a picture used as it is).
  final Uint8List? original;
  final int page, pages;

  /// The picture's asset once saved with the file (Recent designs keep it).
  int? assetId;
}

const designExtensions = [
  'pdf', 'svg', 'ai', 'eps', 'ps', 'psd', 'tif', 'tiff', 'heic', 'heif', //
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp',
];
const designTypesText = 'PDF, SVG, AI, EPS, PSD, TIFF, PNG, JPG or WebP';
const designMaxBytes = 25 * 1024 * 1024;
const _pictureMaxBytes = 10 * 1024 * 1024;

/// What a file is, from its first bytes (an AI file saved with PDF
/// compatibility is a PDF inside): pdf, svg, eps, psd, tiff, heic or picture;
/// null when it is none of them.
String? designKind(Uint8List bytes, String name) {
  final head = latin1.decode(
    bytes.sublist(0, bytes.length < 1024 ? bytes.length : 1024),
    allowInvalid: true,
  );
  final ext = name.toLowerCase().split('.').last;
  bool starts(List<int> sig) =>
      bytes.length >= sig.length &&
      [for (var i = 0; i < sig.length; i++) bytes[i] == sig[i]].every((x) => x);
  if (head.contains('%PDF-')) return 'pdf';
  if (head.startsWith('%!PS') || starts([0xc5, 0xd0, 0xd3, 0xc6])) {
    return 'eps';
  }
  if (head.startsWith('8BPS')) return 'psd';
  if (starts([0x49, 0x49, 0x2a, 0]) || starts([0x4d, 0x4d, 0, 0x2a])) {
    return 'tiff';
  }
  if (head.length >= 12 &&
      head.substring(4, 8) == 'ftyp' &&
      const [
        'heic',
        'heix',
        'hevc',
        'heim',
        'heis',
        'mif1',
        'msf1',
      ].contains(head.substring(8, 12))) {
    return 'heic';
  }
  if (RegExp(r'<svg[\s>]', caseSensitive: false).hasMatch(head) ||
      (ext == 'svg' && head.trimLeft().startsWith('<'))) {
    return 'svg';
  }
  if (starts([0x89, 0x50, 0x4e, 0x47]) ||
      starts([0xff, 0xd8, 0xff]) ||
      head.startsWith('GIF8') ||
      head.startsWith('BM') ||
      (head.startsWith('RIFF') &&
          head.length >= 12 &&
          head.substring(8, 12) == 'WEBP')) {
    return 'picture';
  }
  return null;
}

/// The type shown on the chip: the file's own ending (AI, PDF, EPS…).
String designLabel(String name, String kind) {
  final ext = name.toLowerCase().split('.').last;
  final known = designExtensions.contains(ext) && name.contains('.');
  return (known ? ext : kind).replaceAll('jpeg', 'jpg').toUpperCase();
}

/// Files: pictures and design files (Android lists unknown endings such as
/// .ai and .eps as plain data, so those are offered too and checked here).
Future<({String name, Uint8List bytes})?> pickDesignFile(
  BuildContext context,
) async {
  try {
    final file = await openFile(
      acceptedTypeGroups: [
        const XTypeGroup(
          label: 'Pictures and design files',
          extensions: designExtensions,
          mimeTypes: [
            'application/pdf',
            'image/svg+xml',
            'application/postscript',
            'application/illustrator',
            'image/vnd.adobe.photoshop',
            'image/tiff',
            'image/heic',
            'image/heif',
            'image/png',
            'image/jpeg',
            'image/webp',
            'image/gif',
            'image/bmp',
            'application/octet-stream',
          ],
          uniformTypeIdentifiers: [
            'com.adobe.pdf',
            'public.svg-image',
            'com.adobe.illustrator.ai-image',
            'com.adobe.encapsulated-postscript',
            'com.adobe.postscript',
            'com.adobe.photoshop-image',
            'public.tiff',
            'public.heic',
            'public.heif',
            'public.png',
            'public.jpeg',
            'org.webmproject.webp',
            'com.compuserve.gif',
            'com.microsoft.bmp',
          ],
        ),
      ],
    );
    if (file == null) return null;
    return (name: file.name, bytes: await file.readAsBytes());
  } on Object {
    if (context.mounted) showToast(context, 'Could not open your files.');
    return null;
  }
}

/// One attached file as the picture the AI reads and what it came from; null
/// when nothing is attached (no page chosen). Throws [ApiException] with a
/// plain message when the file cannot be used.
Future<({Uint8List picture, ReferenceFile file})?> designReference(
  BuildContext context,
  AppController c,
  String name,
  Uint8List bytes,
) async {
  if (bytes.length > designMaxBytes) {
    throw ApiException(
      '$name is over 25 MB. Use a smaller file, or save it as PDF or PNG.',
    );
  }
  final kind = designKind(bytes, name);
  if (kind == null) {
    throw ApiException(
      '$name can\'t be attached. Use a picture or a design file: $designTypesText.',
    );
  }
  final label = designLabel(name, kind);
  ({Uint8List picture, ReferenceFile file}) done(
    Uint8List picture, {
    int page = 1,
    int pages = 1,
    bool keep = true,
  }) => (
    picture: picture,
    file: ReferenceFile(
      name: name,
      label: label,
      original: keep ? bytes : null,
      page: page,
      pages: pages,
    ),
  );
  if (kind == 'picture' || kind == 'tiff' || kind == 'heic') {
    final asIs =
        kind == 'picture' &&
        bytes.length <= _pictureMaxBytes &&
        !label.startsWith('GIF') &&
        !label.startsWith('BMP');
    final picture = await _flutterPicture(bytes, asIs: asIs);
    if (picture != null) return done(picture, keep: !asIs);
    if (kind == 'picture') {
      throw ApiException('$name could not be read. Save it as PNG or JPG.');
    }
  }
  // PDF, SVG (TIFF and HEIC Flutter could not open): the hidden reader page.
  if (const ['pdf', 'svg', 'tiff', 'heic'].contains(kind) &&
      ViewerHost.supported &&
      context.mounted) {
    final reader = _Reader(context);
    try {
      final type = const {
        'pdf': 'application/pdf',
        'svg': 'image/svg+xml',
        'tiff': 'image/tiff',
        'heic': 'image/heic',
      }[kind]!;
      final src = 'data:$type;base64,${base64Encode(bytes)}';
      final first = await reader.draw(src, thumbs: kind == 'pdf' ? 24 : 0);
      if (first != null) {
        final pages = first.pages;
        var page = 1, picture = first.image;
        if (pages > 1 && context.mounted) {
          final chosen = await _askPage(context, name, pages, first.thumbs);
          if (chosen == null) return null;
          page = chosen;
          if (page != 1) {
            picture = (await reader.draw(src, page: page))?.image ?? picture;
          }
        }
        return done(picture, page: page, pages: pages);
      }
    } finally {
      reader.close();
    }
  }
  // The server, when it can (EPS, PSD, TIFF…).
  if (!c.signedIn || !c.api.configured) {
    throw ApiException(
      'Sign in to attach $label files: they are read on our server. '
      'Or save it as PDF, SVG or PNG.',
    );
  }
  try {
    final first = await c.api.designPicture(bytes, name: name);
    var picture = first.image, page = 1;
    if (first.pages > 1 && context.mounted) {
      final chosen = await _askPage(context, name, first.pages, const []);
      if (chosen == null) return null;
      page = chosen;
      if (page != 1) {
        picture = (await c.api.designPicture(
          bytes,
          name: name,
          page: page,
        )).image;
      }
    }
    return done(picture, page: page, pages: first.pages);
  } on ApiException catch (e) {
    throw ApiException(
      e.status == 422
          ? e.message
          : '$name could not be read. Please save it as PDF, SVG or PNG and upload that.',
    );
  }
}

/// A picture Flutter opens: as it is ([asIs]: a PNG, JPG or WebP the server
/// keeps), or redrawn as a PNG at most 2048 px on its longer side.
Future<Uint8List?> _flutterPicture(
  Uint8List bytes, {
  required bool asIs,
}) async {
  try {
    final probe = await ui.instantiateImageCodec(bytes);
    final frame = await probe.getNextFrame();
    final w = frame.image.width, h = frame.image.height;
    frame.image.dispose();
    probe.dispose();
    if (asIs) return bytes;
    final k = 2048 / (w > h ? w : h);
    final codec = await ui.instantiateImageCodec(
      bytes,
      targetWidth: k < 1 ? (w * k).round() : null,
      targetHeight: k < 1 ? (h * k).round() : null,
    );
    final image = (await codec.getNextFrame()).image;
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    codec.dispose();
    return data?.buffer.asUint8List();
  } on Object {
    return null;
  }
}

/// Which page of a PDF the AI reads (thumbnails when drawn); null: cancelled.
Future<int?> _askPage(
  BuildContext context,
  String name,
  int pages,
  List<Uint8List> thumbs,
) => showModalBottomSheet<int>(
  context: context,
  backgroundColor: Palette.surface,
  showDragHandle: true,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (sheet) => SafeArea(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Which page?',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(
            '$name has $pages pages. The AI reads the one you choose; the whole file is kept.',
            style: const TextStyle(color: Palette.muted, fontSize: 13),
          ),
          const SizedBox(height: 12),
          Flexible(
            child: GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: .78,
              children: [
                for (var i = 1; i <= (pages < 60 ? pages : 60); i++)
                  Semantics(
                    button: true,
                    label: 'Page $i',
                    child: InkWell(
                      borderRadius: BorderRadius.circular(10),
                      onTap: () => Navigator.pop(sheet, i),
                      child: Ink(
                        decoration: BoxDecoration(
                          color: const Color(0xff0a141e),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0x33ffffff)),
                        ),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            if (i <= thumbs.length)
                              Padding(
                                padding: const EdgeInsets.all(6),
                                child: Image.memory(
                                  thumbs[i - 1],
                                  fit: BoxFit.contain,
                                ),
                              ),
                            Align(
                              alignment: i <= thumbs.length
                                  ? Alignment.bottomRight
                                  : Alignment.center,
                              child: Padding(
                                padding: const EdgeInsets.all(6),
                                child: Text(
                                  '$i',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: i <= thumbs.length ? 12 : 20,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    ),
  ),
);

/// The hidden reader page (assets/viewer/reader.html, pdf.js): a 2-pixel
/// WebView over the app while a file is drawn, removed after.
class _Reader {
  _Reader(BuildContext context) {
    _host = ViewerHost(_onMessage, channel: 'Reader', file: 'reader.html');
    _entry = OverlayEntry(
      builder: (_) => Positioned(
        left: 0,
        top: 0,
        width: 2,
        height: 2,
        child: IgnorePointer(
          child: Opacity(opacity: .01, child: _host.build()),
        ),
      ),
    );
    Overlay.of(context, rootOverlay: true).insert(_entry);
  }

  late final ViewerHost _host;
  late final OverlayEntry _entry;
  final _ready = Completer<void>();
  final _answers = <String, Completer<Map<String, dynamic>>>{};
  int _next = 0;
  bool _closed = false;

  void _onMessage(String text) {
    try {
      final m = jsonDecode(text) as Map<String, dynamic>;
      if (m['type'] == 'ready' && !_ready.isCompleted) _ready.complete();
      if (m['type'] == 'drawn') _answers.remove('${m['id']}')?.complete(m);
    } on Object {
      // Not one of ours.
    }
  }

  static Uint8List? _bytes(Object? url) => url is String && url.contains(',')
      ? base64Decode(url.substring(url.indexOf(',') + 1))
      : null;

  /// The page (or picture) drawn: null when the reader could not draw it.
  Future<({Uint8List image, int pages, List<Uint8List> thumbs})?> draw(
    String src, {
    int page = 1,
    int thumbs = 0,
  }) async {
    if (_closed) return null;
    // Bundled pages start fast; a missed "ready" still gets one try.
    await _ready.future.timeout(const Duration(seconds: 15), onTimeout: () {});
    final id = 'r${_next++}';
    final answer = Completer<Map<String, dynamic>>();
    _answers[id] = answer;
    _host.send(
      jsonEncode({
        'cmd': 'draw',
        'arg': {
          'id': id,
          'src': src,
          'page': page,
          'long': 1600,
          'thumbs': thumbs,
        },
      }),
    );
    try {
      final m = await answer.future.timeout(const Duration(seconds: 60));
      final image = _bytes(m['image']);
      if (image == null) return null;
      return (
        image: image,
        pages: (m['pages'] as num?)?.toInt() ?? 1,
        thumbs: [
          for (final t in (m['thumbs'] as List?) ?? const [])
            if (_bytes(t) case final b?) b,
        ],
      );
    } on TimeoutException {
      _answers.remove(id);
      return null;
    }
  }

  void close() {
    if (_closed) return;
    _closed = true;
    _entry.remove();
    _host.dispose();
  }
}
