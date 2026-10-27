import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'api_client.dart';
import 'app_controller.dart';

/// Studio › Patterns › My patterns (as the website's OwnPatterns.tsx): the
/// account's own pattern pictures, kept as saved assets of type "pattern", so
/// the same tiles show on the website and in the app.

/// The largest own pattern picture taken (as the website and the server).
const ownPatternMaxBytes = 5 * 1024 * 1024;

/// The 3D viewer's mark for a full-colour print tile (viewer texture.js
/// PRINT_MARK): two exact pixels at the top left of a PNG.
const _printMark = [
  [3, 222, 177],
  [17, 61, 233],
];

/// A zone value that is an own pattern picture rather than a pattern name.
bool isPatternPicture(String? value) =>
    value != null &&
    (value.startsWith('data:image/') ||
        value.startsWith('/') ||
        value.startsWith('http'));

/// A zone's pattern as people read it: pictures are "My pattern".
String patternLabel(String value) =>
    isPatternPicture(value) ? 'My pattern' : value;

/// The picture's type from its first bytes (PNG, JPEG, WebP), else null.
String? patternPictureType(Uint8List b) {
  if (b.length > 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4e) {
    return 'image/png';
  }
  if (b.length > 3 && b[0] == 0xff && b[1] == 0xd8) return 'image/jpeg';
  if (b.length > 12 &&
      ascii.decode(b.sublist(0, 4), allowInvalid: true) == 'RIFF' &&
      ascii.decode(b.sublist(8, 12), allowInvalid: true) == 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/// What this visit knows about the pattern pictures on the kit, keyed by the
/// picture itself (so undo, redo and closing the panel keep it): each
/// picture's mode, read once from its own pixels, and the My patterns tile it
/// was made from. The mode always comes from the picture the kit has (after a
/// save and reopen, or a picture made on the website).
final _modes = Expando<Future<String?>>('pattern mode');
final _madeFrom = Expando<int>('own pattern');

/// A zone's pattern picture as bytes (data URLs only), decoded once.
final _zonePictures = <String, Uint8List>{};
Uint8List? zonePicture(String? value) {
  if (value == null || !value.startsWith('data:image/')) return null;
  final known = _zonePictures[value];
  if (known != null) return known;
  try {
    final bytes = base64Decode(value.substring(value.indexOf(',') + 1));
    if (_zonePictures.length >= 16) {
      _zonePictures.remove(_zonePictures.keys.first);
    }
    return _zonePictures[value] = bytes;
  } on FormatException {
    return null;
  }
}

/// The mode of a pattern picture: 'full' (it carries the mark) or 'kit';
/// null when it can't be read.
Future<String?> patternModeOf(Uint8List picture) =>
    _modes[picture] ??= _readMode(picture);

Future<String?> _readMode(Uint8List picture) async {
  try {
    return await _marked(await _decode(picture)) ? 'full' : 'kit';
  } on Object {
    return null;
  }
}

/// Whether a pattern picture came from the My patterns tile [id] (this visit).
bool madeFromOwnPattern(Uint8List? picture, int id) =>
    picture != null && _madeFrom[picture] == id;

Future<ui.Image> _decode(Uint8List bytes) async {
  final codec = await ui.instantiateImageCodec(bytes);
  return (await codec.getNextFrame()).image;
}

/// Whether a picture carries the full-colour mark: its two top-left pixels,
/// read exactly (as the viewer does).
Future<bool> _marked(ui.Image image) async {
  if (image.width < 2) return false;
  final recorder = ui.PictureRecorder();
  ui.Canvas(recorder).drawImageRect(
    image,
    const ui.Rect.fromLTWH(0, 0, 2, 1),
    const ui.Rect.fromLTWH(0, 0, 2, 1),
    ui.Paint()
      ..blendMode = ui.BlendMode.src
      ..filterQuality = ui.FilterQuality.none,
  );
  final two = await recorder.endRecording().toImage(2, 1);
  final px = (await two.toByteData(
    format: ui.ImageByteFormat.rawStraightRgba,
  ))!.buffer.asUint8List();
  return _hasMark(px);
}

bool _hasMark(Uint8List px) => [
  for (var i = 0; i < 2; i++)
    px[i * 4] == _printMark[i][0] &&
        px[i * 4 + 1] == _printMark[i][1] &&
        px[i * 4 + 2] == _printMark[i][2],
].every((x) => x);

/// A pattern picture made ready for the 3D viewer (at most 768 px, PNG), from
/// an upload or from a picture already on the kit (as the website's
/// preparePattern). 'full' keeps its colours and see-through parts and is
/// marked, so the viewer repeats it as it is; 'kit' is unmarked, a stencil
/// painted in the kit's colours: its see-through pixels become white at the
/// faintest opacity (the stencil's "no ink"), so a later 'full' gives them
/// back.
Future<Uint8List> preparePattern(Uint8List bytes, String mode) async {
  final image = await _decode(bytes);
  var source = image;
  if (await _marked(image)) {
    // Already in full colour: its two mark pixels take the colours of the two
    // below them, as the viewer does.
    final recorder = ui.PictureRecorder();
    ui.Canvas(recorder)
      ..drawImage(image, ui.Offset.zero, ui.Paint())
      ..drawImageRect(
        image,
        const ui.Rect.fromLTWH(0, 1, 2, 1),
        const ui.Rect.fromLTWH(0, 0, 2, 1),
        ui.Paint()
          ..blendMode = ui.BlendMode.src
          ..filterQuality = ui.FilterQuality.none,
      );
    source = await recorder.endRecording().toImage(image.width, image.height);
  }
  final w0 = source.width, h0 = source.height;
  final k = (768 / (w0 > h0 ? w0 : h0)).clamp(0.0, 1.0);
  final w = (w0 * k).round().clamp(8, 768), h = (h0 * k).round().clamp(8, 768);
  final recorder = ui.PictureRecorder();
  ui.Canvas(recorder).drawImageRect(
    source,
    ui.Rect.fromLTWH(0, 0, w0.toDouble(), h0.toDouble()),
    ui.Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()),
    ui.Paint()
      ..blendMode = ui.BlendMode.src
      ..filterQuality = w == w0 && h == h0
          ? ui.FilterQuality.none
          : ui.FilterQuality.medium,
  );
  final drawn = await recorder.endRecording().toImage(w, h);
  // Premultiplied, as decodeImageFromPixels reads them back.
  final px = (await drawn.toByteData(
    format: ui.ImageByteFormat.rawRgba,
  ))!.buffer.asUint8List();
  for (var i = 0; i < px.length; i += 4) {
    if (mode == 'kit' && px[i + 3] == 0) {
      px.fillRange(i, i + 4, 1);
    } else if (mode == 'full' &&
        px[i + 3] == 1 &&
        px[i] == 1 &&
        px[i + 1] == 1 &&
        px[i + 2] == 1) {
      px.fillRange(i, i + 4, 0);
    }
  }
  if (mode == 'full') {
    for (var i = 0; i < 2; i++) {
      px.setAll(i * 4, [..._printMark[i], 255]);
    }
  } else if (_hasMark(px)) {
    px[0] ^= 1; // never marked by chance
  }
  final done = Completer<ui.Image>();
  ui.decodeImageFromPixels(px, w, h, ui.PixelFormat.rgba8888, done.complete);
  final out = await done.future;
  final png = (await out.toByteData(
    format: ui.ImageByteFormat.png,
  ))!.buffer.asUint8List();
  _modes[png] = Future.value(mode);
  return png;
}

/// Whether a prepared pattern is a full-colour one (carries the mark).
Future<bool> isFullColourPattern(Uint8List png) async =>
    _marked(await _decode(png));

typedef OwnPattern = ({int id, String name, Uint8List bytes});

extension OwnPatterns on AppController {
  /// Loads My patterns from the account (once; [force] again).
  Future<void> loadOwnPatterns({bool force = false}) async {
    if (!signedIn || (ownPatterns != null && !force)) return;
    final list = await api.assets();
    final items = <OwnPattern>[];
    for (final a in list.where((a) => a['type'] == 'pattern')) {
      try {
        final url = await api.assetDataUrl(a['id'] as int);
        items.add((
          id: a['id'] as int,
          name: '${a['name'] ?? 'Pattern'}',
          bytes: base64Decode(url.substring(url.indexOf(',') + 1)),
        ));
      } on Object {
        // A file that no longer loads is left out.
      }
    }
    ownPatterns = items;
    changed();
  }

  /// Keeps a new own pattern with the account and puts it on [area] (null:
  /// the whole garment). Answers what to tell the user.
  Future<String> uploadOwnPattern(
    String name,
    Uint8List bytes, {
    String? area,
  }) async {
    if (!signedIn) throw ApiException('Sign in to upload your own pattern.');
    final type = patternPictureType(bytes);
    if (type == null) throw ApiException('Choose a PNG, JPG or WebP picture.');
    if (bytes.length > ownPatternMaxBytes) {
      throw ApiException('Choose a picture smaller than 5 MB.');
    }
    final clean = name.replaceAll(RegExp(r'\.[^.]+$'), '');
    final id = await api.uploadAsset(
      bytes,
      filename: '$clean.${type.split('/').last.replaceAll('jpeg', 'jpg')}',
      type: 'pattern',
      contentType: type,
    );
    final item = (
      id: id,
      name: clean.isEmpty ? 'Pattern' : clean,
      bytes: bytes,
    );
    ownPatterns = [item, ...?ownPatterns];
    return applyOwnPattern(item, area: area);
  }

  /// The pattern picture on [area] (null: the whole garment), as the kit has
  /// it, or null.
  Uint8List? patternPictureOn(String? area) =>
      area == null ? patternTile : zonePicture(zones[area]);

  /// Puts an own pattern on [area] (null: the whole garment), as one undo
  /// step: in the mode of the picture already there, else [ownPatternMode].
  Future<String> applyOwnPattern(OwnPattern item, {String? area}) async {
    final on = patternPictureOn(area);
    final mode =
        (on == null ? null : await patternModeOf(on)) ?? ownPatternMode;
    final png = await preparePattern(item.bytes, mode);
    _madeFrom[png] = item.id;
    edit(() {
      if (area == null) {
        patternTile = png;
        pattern = 'Solid';
        zones = {};
        if (mode == 'kit') patternBody = 1;
      } else {
        zones = {...zones, area: 'data:image/png;base64,${base64Encode(png)}'};
      }
    });
    return '${item.name} applied ${area == null ? 'to the whole garment' : 'here'} '
        'in ${mode == 'full' ? 'full colour' : 'kit colours'}.';
  }

  /// Full colour or kit colours for the pattern picture on [area] (null: the
  /// whole garment), as one undo step. Answers whether the kit changed.
  Future<bool> setPatternMode(String? area, String mode) async {
    final before = area == null ? null : zones[area];
    final picture = patternPictureOn(area);
    if (picture == null || await patternModeOf(picture) == mode) return false;
    final png = await preparePattern(picture, mode);
    final from = _madeFrom[picture];
    if (from != null) _madeFrom[png] = from;
    // The kit changed meanwhile (an undo, another pattern): leave it.
    if (area == null
        ? !identical(patternTile, picture)
        : !identical(zones[area], before)) {
      return false;
    }
    edit(() {
      if (area == null) {
        patternTile = png;
        if (mode == 'kit') patternBody = 1;
      } else {
        zones = {...zones, area: 'data:image/png;base64,${base64Encode(png)}'};
      }
    });
    return true;
  }

  /// Deletes an own pattern from the account (kits using it keep it).
  Future<void> deleteOwnPattern(int id) async {
    await api.deleteAsset(id);
    ownPatterns = [...?ownPatterns?.where((p) => p.id != id)];
    changed();
  }
}
