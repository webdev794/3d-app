import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import 'ai_service.dart';
import 'app_controller.dart';
import 'design_document.dart';

/// Converts projects between the app and the website's database, which
/// stores a kit as `design` (hex colours, pattern, text and image data
/// URLs). App-only details (fabric, brief, AI spec, renders) travel in
/// `design.app`, so a project made on the website opens in the app and the
/// other way round.
class ProjectSync {
  static const sports = {
    'Rugby League': 'rugby-league',
    'Rugby Union': 'rugby-union',
    'Soccer': 'football',
    'Basketball': 'basketball',
    'Netball': 'netball',
    'AFL': 'afl',
    'Ice Hockey': 'hockey',
    'Training / Gym': 'training',
  };
  static const garments = {
    'Jersey': 'jersey',
    'Shorts': 'shorts',
    'Training Tee': 'tee',
    'Singlet': 'singlet',
    'Polo': 'polo',
    'Full Kit': 'fullkit',
  };

  /// The body for `POST /projects` and `PATCH /projects/{id}`.
  static Map<String, dynamic> toServer(Project p) {
    final k = p.kit;
    final garment = garments[k.garment] ?? garments[p.garment] ?? 'jersey';
    return {
      'name': _clip(p.title, 120),
      'sport': sports[p.sport] ?? 'rugby-league',
      'garment': garment,
      'mode': p.mode == 'AI' ? 'ai' : 'dyo',
      'thumbnail': dataUrl(p.thumbnail),
      'design': {
        'garment': garment,
        'main': hex(k.mainColor),
        'secondary': hex(k.secondaryColor),
        'accent': hex(k.accentColor),
        'pattern': studioPatterns.contains(k.pattern) ? k.pattern : 'Solid',
        'logoText': _clip(k.logoText, 40),
        'backName': _clip(k.backName, 40),
        'number': _clip(k.number, 3),
        'patternImage': dataUrl(k.patternTile),
        'logoImage': dataUrl(k.logoImage),
        'sponsorImage': dataUrl(k.sponsorImage),
        'layers': copyLayers(k.layers),
        'zones': copyZones(k.zones),
        'gradient': copyGradient(k.gradient),
        if (p.brief.isNotEmpty) 'prompt': _clip(p.brief, 1500),
        'renderFront': dataUrl(p.renderFront),
        'renderBack': dataUrl(p.renderBack),
        'app': {
          'schema': 1,
          'id': p.id,
          'sport': p.sport,
          'garment': p.garment,
          'fabric': k.fabric,
          'version': p.version,
          'updated': p.updated.toIso8601String(),
          'spec': k.spec?.toJson(),
        },
      },
    };
  }

  /// A project from `GET /projects`, made in the app or on the website.
  static Project fromServer(Map<String, dynamic> j) {
    final d = (j['design'] as Map?)?.cast<String, dynamic>() ?? const {};
    final app = (d['app'] as Map?)?.cast<String, dynamic>() ?? const {};
    final spec = app['spec'] as Map<String, dynamic>?;
    final garment =
        app['garment'] as String? ??
        _label(garments, j['garment'] as String?, 'Jersey');
    final remoteVersion = j['version'] as int? ?? 1;
    return Project(
      id: app['id'] as String? ?? 'r${j['id']}',
      remoteId: j['id'] as int,
      remoteVersion: remoteVersion,
      persisted: false,
      title: j['name'] as String? ?? 'Untitled',
      sport:
          app['sport'] as String? ??
          _label(sports, j['sport'] as String?, 'Rugby League'),
      garment: garment,
      mode: j['mode'] == 'ai' ? 'AI' : 'DYO',
      version: app['version'] as int? ?? remoteVersion,
      updated:
          DateTime.tryParse('${j['updated_at']}')?.toLocal() ?? DateTime.now(),
      brief: d['prompt'] as String? ?? '',
      thumbnail: bytes(j['thumbnail']),
      renderFront: bytes(d['renderFront']),
      renderBack: bytes(d['renderBack']),
      kit: KitState(
        garment: garment,
        mainColor: color(d['main']),
        secondaryColor: color(d['secondary']),
        accentColor: color(d['accent']),
        pattern: studioPatterns.contains(d['pattern'])
            ? d['pattern'] as String
            : 'Solid',
        fabric: app['fabric'] as String? ?? 'Standard',
        logoText: d['logoText'] as String? ?? '',
        backName: d['backName'] as String? ?? '',
        number: d['number'] as String? ?? '',
        patternTile: bytes(d['patternImage']),
        logoImage: bytes(d['logoImage']),
        sponsorImage: bytes(d['sponsorImage']),
        spec: spec == null ? null : DesignSpec.fromJson(spec),
        layers: copyLayers(d['layers']),
        zones: copyZones(d['zones']),
        gradient: copyGradient(d['gradient']),
      ),
    );
  }

  static String hex(Color c) =>
      '#${c.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}';

  static Color color(Object? value) {
    final v = int.tryParse('$value'.replaceAll('#', ''), radix: 16);
    return Color(0xff000000 | (v ?? 0x0b1016));
  }

  /// PNG, JPEG and WebP become data URLs; anything else is left out because
  /// the server only accepts those.
  static String? dataUrl(Uint8List? b) {
    if (b == null || b.length < 12) return null;
    final String mime;
    if (b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4e && b[3] == 0x47) {
      mime = 'png';
    } else if (b[0] == 0xff && b[1] == 0xd8) {
      mime = 'jpeg';
    } else if (ascii.decode(b.sublist(8, 12), allowInvalid: true) == 'WEBP') {
      mime = 'webp';
    } else {
      return null;
    }
    return 'data:image/$mime;base64,${base64Encode(b)}';
  }

  /// Decodes a data URL; website file paths (e.g. "/media/...") are skipped.
  static Uint8List? bytes(Object? value) {
    if (value is! String || !value.startsWith('data:')) return null;
    final comma = value.indexOf(',');
    if (comma < 0) return null;
    try {
      return base64Decode(value.substring(comma + 1).replaceAll('\n', ''));
    } on FormatException {
      return null;
    }
  }

  static String _clip(String s, int max) =>
      s.length <= max ? s : s.substring(0, max);

  static String _label(Map<String, String> map, String? id, String fallback) =>
      map.entries.where((e) => e.value == id).firstOrNull?.key ?? fallback;
}
