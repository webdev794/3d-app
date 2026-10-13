import 'dart:convert';
import 'dart:typed_data';

import 'package:shared_preferences/shared_preferences.dart';

const _prefix = '3deezi.project.';

/// Each project occupies one browser entry, so a quota failure preserves its
/// previous saved version. Callers surface the failure without reporting success.
Future<void> writeProject(
  String id,
  Map<String, dynamic> json,
  Map<String, Uint8List> images,
) async {
  final prefs = await SharedPreferences.getInstance();
  final written = await prefs.setString(
    '$_prefix$id',
    jsonEncode({
      'project': json,
      'images': {
        for (final entry in images.entries)
          entry.key: base64Encode(entry.value),
      },
    }),
  );
  if (!written) throw StateError('Browser project storage is unavailable.');
}

Future<List<(Map<String, dynamic>, Map<String, Uint8List>)>>
readProjects() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.reload();
  final result = <(Map<String, dynamic>, Map<String, Uint8List>)>[];
  for (final key in prefs.getKeys().where((key) => key.startsWith(_prefix))) {
    try {
      final value = jsonDecode(prefs.getString(key)!) as Map;
      final json = (value['project'] as Map).cast<String, dynamic>();
      final images = <String, Uint8List>{
        for (final entry in (value['images'] as Map).entries)
          '${entry.key}': base64Decode(entry.value as String),
      };
      result.add((json, images));
    } on Object {
      // One damaged project must not prevent other projects from opening.
    }
  }
  return result;
}

Future<void> deleteProject(String id) async {
  final prefs = await SharedPreferences.getInstance();
  if (!await prefs.remove('$_prefix$id')) {
    throw StateError('The browser could not remove this project.');
  }
}
