import 'dart:io';
import 'dart:typed_data';
import 'dart:ui';

import 'package:share_plus/share_plus.dart';

/// Phones: write the file to temp storage and open the system share sheet
/// (Save to Files/Photos, AirDrop, WhatsApp, Drive…).
Future<String> saveDownload(
  Uint8List bytes,
  String name, {
  Rect? origin,
}) async {
  final file = File(
    '${Directory.systemTemp.path}${Platform.pathSeparator}$name',
  );
  await file.writeAsBytes(bytes, flush: true);
  final result = await SharePlus.instance.share(
    ShareParams(
      files: [XFile(file.path)],
      title: name,
      sharePositionOrigin: origin,
    ),
  );
  return switch (result.status) {
    ShareResultStatus.dismissed => 'Share cancelled',
    _ => 'Shared $name',
  };
}
