import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';

/// Projects live in `<app documents>/3deezi_projects/<id>/`: a project.json
/// plus one PNG/JPEG file per image.
Future<Directory> _root() async {
  final docs = await getApplicationDocumentsDirectory();
  return Directory('${docs.path}${Platform.pathSeparator}3deezi_projects')
    ..createSync(recursive: true);
}

String _safe(String id) => id.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');

Future<void> writeProject(
  String id,
  Map<String, dynamic> json,
  Map<String, Uint8List> images,
) async {
  final dir = Directory(
    '${(await _root()).path}${Platform.pathSeparator}${_safe(id)}',
  );
  // Write into a fresh folder, then swap, so a crash never leaves half a project.
  final temp = Directory('${dir.path}.tmp');
  if (temp.existsSync()) temp.deleteSync(recursive: true);
  temp.createSync(recursive: true);
  for (final entry in images.entries) {
    await File(
      '${temp.path}${Platform.pathSeparator}${entry.key}.img',
    ).writeAsBytes(entry.value, flush: true);
  }
  await File(
    '${temp.path}${Platform.pathSeparator}project.json',
  ).writeAsString(jsonEncode(json), flush: true);
  if (dir.existsSync()) dir.deleteSync(recursive: true);
  temp.renameSync(dir.path);
}

Future<List<(Map<String, dynamic>, Map<String, Uint8List>)>>
readProjects() async {
  final root = await _root();
  final result = <(Map<String, dynamic>, Map<String, Uint8List>)>[];
  for (final dir in root.listSync().whereType<Directory>()) {
    if (dir.path.endsWith('.tmp')) continue;
    final file = File('${dir.path}${Platform.pathSeparator}project.json');
    if (!file.existsSync()) continue;
    try {
      final json =
          jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      final images = <String, Uint8List>{};
      for (final image in dir.listSync().whereType<File>()) {
        final name = image.uri.pathSegments.last;
        if (name.endsWith('.img')) {
          images[name.substring(0, name.length - 4)] = await image
              .readAsBytes();
        }
      }
      result.add((json, images));
    } on Object {
      // Skip unreadable folders.
    }
  }
  return result;
}

Future<void> deleteProject(String id) async {
  final dir = Directory(
    '${(await _root()).path}${Platform.pathSeparator}${_safe(id)}',
  );
  if (dir.existsSync()) dir.deleteSync(recursive: true);
}
