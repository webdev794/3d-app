import 'dart:convert';
import 'dart:js_interop';
import 'dart:typed_data';
import 'dart:ui';

@JS('threeDeeziDownload')
external void _download(JSString base64, JSString name);

Future<String> saveDownload(
  Uint8List bytes,
  String name, {
  Rect? origin,
}) async {
  _download(base64Encode(bytes).toJS, name.toJS);
  return 'Downloaded $name';
}
