import 'dart:typed_data';

/// Unsupported platforms retain projects only for the current session.
Future<void> writeProject(
  String id,
  Map<String, dynamic> json,
  Map<String, Uint8List> images,
) async => throw UnsupportedError('Project storage is unavailable.');

Future<List<(Map<String, dynamic>, Map<String, Uint8List>)>>
readProjects() async => [];

Future<void> deleteProject(String id) async {}
