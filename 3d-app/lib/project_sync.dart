import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import 'ai_service.dart';
import 'app_controller.dart';
import 'design_document.dart';
import 'sports_catalog.dart';

/// Converts projects between the app and the website's database, which
/// stores a kit as `design` (hex colours, pattern, text and image data
/// URLs). App-only details (fabric, brief, AI spec, renders) travel in
/// `design.app`, so a project made on the website opens in the app and the
/// other way round.
class ProjectSync {
  /// App sport name → the website's catalogue id (lib/sports_catalog.dart).
  static final sports = {for (final s in sportCategories) s.name: s.id};
  static const garments = garmentIds;

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
        if (k.patternScale != null) 'patternScale': k.patternScale,
        if (k.patternBody != null) 'patternBody': k.patternBody,
        'logoImage': dataUrl(k.logoImage),
        'sponsorImage': dataUrl(k.sponsorImage),
        'layers': copyLayers(k.layers),
        'zones': copyZones(k.zones),
        // Only when set (hoodies): servers older than 2026-10-21 refuse the field.
        if (k.zoneColors.isNotEmpty) 'zoneColors': copyZones(k.zoneColors),
        // The track jacket's style (only on it: older servers refuse the field).
        if (k.garment == 'Track jacket') 'trackStyle': k.trackStyle,
        if (k.patternColor != null) 'patternColor': k.patternColor,
        // Every pattern in patternColor (only when set: older servers refuse
        // the field).
        if (k.patternColorOwn == true) 'patternColorOwn': true,
        // The parts edited on their own (task 9.134; only when set: older
        // servers refuse the field).
        if (k.parts.isNotEmpty) 'parts': copyParts(k.parts),
        // The sport's garment tile ("Netball dress"; only when set: older
        // servers refuse the field).
        if (k.productName.isNotEmpty) 'productName': _clip(k.productName, 60),
        // Colours › Fabric type, where the website reads it too (only when
        // not Standard: older servers refuse the field; app.fabric keeps it
        // for older apps).
        if (designFabrics.contains(k.fabric) && k.fabric != 'Standard')
          'fabric': k.fabric,
        'gradient': copyGradient(k.gradient),
        // Only when set: servers older than 2026-10-21 refuse the field.
        if (k.gradients != null) 'gradients': copyGradient(k.gradients),
        // Only when something was moved: servers older than 2026-10-19
        // refuse the field.
        if (k.marks.isNotEmpty) 'marks': copyMarks(k.marks),
        if (k.layout != null) 'layout': copyLayout(k.layout),
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
      approved: j['status'] == 'approved',
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
        // The website's design.fabric first, then the app's own (older saves).
        fabric: designFabrics.contains(d['fabric'])
            ? d['fabric'] as String
            : designFabrics.contains(app['fabric'])
            ? app['fabric'] as String
            : 'Standard',
        logoText: d['logoText'] as String? ?? '',
        backName: d['backName'] as String? ?? '',
        number: d['number'] as String? ?? '',
        patternTile: bytes(d['patternImage']),
        patternScale: (d['patternScale'] as num?)?.toDouble(),
        patternBody: (d['patternBody'] as num?)?.toDouble(),
        logoImage: bytes(d['logoImage']),
        sponsorImage: bytes(d['sponsorImage']),
        spec: spec == null ? null : DesignSpec.fromJson(spec),
        layers: copyLayers(d['layers']),
        zones: copyZones(d['zones']),
        zoneColors: copyZones(d['zoneColors']),
        trackStyle: d['trackStyle'] == 'hood' ? 'hood' : 'collar',
        patternColor: d['patternColor'] is String
            ? d['patternColor'] as String
            : null,
        patternColorOwn: d['patternColorOwn'] == true ? true : null,
        parts: copyParts(d['parts']),
        productName: d['productName'] is String
            ? d['productName'] as String
            : '',
        gradient: copyGradient(d['gradient']),
        gradients: copyGradient(d['gradients']),
        marks: copyMarks(d['marks']),
        layout: copyLayout(d['layout']),
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
