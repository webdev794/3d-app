import 'dart:typed_data';

import 'package:flutter/material.dart';

import 'ai_service.dart';
import 'app_controller.dart';
import 'project_store_stub.dart'
    if (dart.library.io) 'project_store_io.dart'
    as platform;

/// Saves the user's projects on the device so they survive app restarts.
/// On platforms without a file system (web) it does nothing.
class ProjectStore {
  const ProjectStore();

  Future<void> save(Project project) =>
      platform.writeProject(project.id, encode(project), images(project));

  Future<List<Project>> loadAll() async {
    final raw = await platform.readProjects();
    final projects = <Project>[];
    for (final (json, images) in raw) {
      try {
        projects.add(decode(json, images));
      } on Object {
        // A damaged project is skipped rather than blocking the rest.
      }
    }
    projects.sort((a, b) => b.updated.compareTo(a.updated));
    return projects;
  }

  Future<void> delete(String id) => platform.deleteProject(id);

  /// The project's images, keyed by file name.
  static Map<String, Uint8List> images(Project p) => {
    if (p.thumbnail != null) 'thumbnail': p.thumbnail!,
    if (p.renderFront != null) 'renderFront': p.renderFront!,
    if (p.renderBack != null) 'renderBack': p.renderBack!,
    if (p.kit.patternTile != null) 'patternTile': p.kit.patternTile!,
    if (p.kit.logoImage != null) 'logoImage': p.kit.logoImage!,
    if (p.kit.sponsorImage != null) 'sponsorImage': p.kit.sponsorImage!,
  };

  /// JSON for everything except images (see [images]).
  static Map<String, dynamic> encode(Project p) => {
    'schema': 1,
    'id': p.id,
    'title': p.title,
    'sport': p.sport,
    'garment': p.garment,
    'mode': p.mode,
    'version': p.version,
    'updated': p.updated.toIso8601String(),
    'brief': p.brief,
    'asset': p.asset,
    'remoteId': p.remoteId,
    'remoteVersion': p.remoteVersion,
    'pendingUpload': p.pendingUpload,
    'kit': {
      'garment': p.kit.garment,
      'mainColor': p.kit.mainColor.toARGB32(),
      'secondaryColor': p.kit.secondaryColor.toARGB32(),
      'accentColor': p.kit.accentColor.toARGB32(),
      'pattern': p.kit.pattern,
      'fabric': p.kit.fabric,
      'logoText': p.kit.logoText,
      'backName': p.kit.backName,
      'number': p.kit.number,
      'spec': p.kit.spec?.toJson(),
    },
  };

  static Project decode(Map<String, dynamic> j, Map<String, Uint8List> images) {
    final k = j['kit'] as Map<String, dynamic>;
    final spec = k['spec'] as Map<String, dynamic>?;
    return Project(
      id: j['id'] as String,
      title: j['title'] as String,
      sport: j['sport'] as String,
      garment: j['garment'] as String,
      mode: j['mode'] as String,
      version: j['version'] as int,
      updated: DateTime.parse(j['updated'] as String),
      brief: j['brief'] as String? ?? '',
      asset: j['asset'] as String?,
      thumbnail: images['thumbnail'],
      renderFront: images['renderFront'],
      renderBack: images['renderBack'],
      persisted: true,
      remoteId: j['remoteId'] as int?,
      remoteVersion: j['remoteVersion'] as int?,
      // Projects saved before accounts existed upload on the next sync.
      pendingUpload: j['pendingUpload'] as bool? ?? true,
      kit: KitState(
        garment: k['garment'] as String,
        mainColor: Color(k['mainColor'] as int),
        secondaryColor: Color(k['secondaryColor'] as int),
        accentColor: Color(k['accentColor'] as int),
        pattern: k['pattern'] as String,
        fabric: k['fabric'] as String,
        logoText: k['logoText'] as String,
        backName: k['backName'] as String,
        number: k['number'] as String,
        patternTile: images['patternTile'],
        logoImage: images['logoImage'],
        sponsorImage: images['sponsorImage'],
        spec: spec == null ? null : DesignSpec.fromJson(spec),
      ),
    );
  }
}
