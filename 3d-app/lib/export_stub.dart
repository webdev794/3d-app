import 'dart:typed_data';
import 'dart:ui';

Future<String> saveDownload(
  Uint8List bytes,
  String name, {
  Rect? origin,
}) async =>
    throw UnsupportedError('Downloads are unavailable on this platform.');
