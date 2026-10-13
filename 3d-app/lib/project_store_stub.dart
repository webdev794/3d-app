import 'dart:typed_data';

/// Web: projects stay in memory for the session (browser storage is too
/// small for kit images).
Future<void> writeProject(
  String id,
  Map<String, dynamic> json,
  Map<String, Uint8List> images,
) async {}

Future<List<(Map<String, dynamic>, Map<String, Uint8List>)>>
readProjects() async => [];

Future<void> deleteProject(String id) async {}
