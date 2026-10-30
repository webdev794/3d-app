import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'ai_service.dart';
import 'api_client.dart';
import 'design_document.dart';
import 'own_patterns.dart';
import 'project_store.dart';
import 'project_sync.dart';
import 'session_store.dart';
import 'sports_catalog.dart';

/// The screens of the client's "Complete App Flow", in order.
enum AppScreen {
  splash,
  onboarding,
  auth,
  home,
  aiDesigner,
  generating,
  concepts,
  sport,
  garment,
  studio,
  saveProject,
  export,
  projects,
  assets,
  profile,
  showcase,
  // The Studio's Mockup: studio product photos (screens/product_mockup.dart).
  mockup,
  artboard,
  pricing,
  orders,
  // The bottom bar's Orders tab (client picture 168.jpg): Create Order Form,
  // Upload Your Order and My orders ([orders]).
  orderHub,
}

/// Everything about the kit that Undo/Redo restores.
@immutable
class KitState {
  const KitState({
    required this.garment,
    required this.mainColor,
    required this.secondaryColor,
    required this.accentColor,
    required this.pattern,
    required this.fabric,
    required this.logoText,
    required this.backName,
    required this.number,
    required this.patternTile,
    required this.logoImage,
    required this.spec,
    this.sponsorImage,
    this.layers = const [],
    this.zones = const {},
    this.zoneColors = const {},
    this.trackStyle = 'collar',
    this.patternColor,
    this.patternColorOwn,
    this.parts = const {},
    this.productName = '',
    this.gradient,
    this.gradients,
    this.marks = const {},
    this.layout,
    this.patternScale,
    this.patternBody,
  });
  final String garment, pattern, fabric, logoText, backName, number;

  /// The pattern picture's repeat in metres (Patterns › Pattern size; null:
  /// the viewer's 0.3) and how far a stencil pattern covers the body (0-1).
  final double? patternScale, patternBody;
  final Color mainColor, secondaryColor, accentColor;
  final Uint8List? patternTile, logoImage, sponsorImage;
  final DesignSpec? spec;
  final List<Map<String, dynamic>> layers;
  final Map<String, String> zones;

  /// Hoodies: each area's own colour (hood, lining, rib, pocket, zip: hex).
  final Map<String, String> zoneColors;

  /// The track jacket's style: 'collar' (its stand-up collar) or 'hood'.
  final String trackStyle;

  /// The pattern's own colour ('#rrggbb', the website's PATTERN); null = a
  /// blend of the primary and secondary.
  final String? patternColor;

  /// True once the pattern colour is picked (PATTERN tab or a tap on the
  /// pattern): the viewer then paints every pattern in it (the website's
  /// design.patternColorOwn). Null: palettes and presets.
  final bool? patternColorOwn;

  /// Parts edited on their own (task 9.134, design.parts: a sleeve's own
  /// colour, fade and pattern; see part_editing.dart). Empty: as before.
  final Map<String, dynamic> parts;

  /// The sport's garment tile it was chosen as ("Netball dress", task 9.99);
  /// empty for a plain 3D garment. [garment] stays the 3D garment.
  final String productName;
  final Map<String, dynamic>? gradient;

  /// The other colour zones' gradient fills (secondary, patternColor); [gradient] is the primary zone's.
  final Map<String, dynamic>? gradients;
  final Map<String, dynamic> marks;

  /// The factory print layout on the kit (see [copyLayout]), or null.
  final Map<String, dynamic>? layout;
}

/// One design on the AI designer's results (concepts[0] is the PRIMARY,
/// [1..3] the options): its 3D kit spec, its direction for the picture and
/// the picture itself, which fills in when it arrives.
class Concept {
  Concept(this.spec, {this.direction});
  DesignSpec spec;
  Uint8List? image;
  String? error;

  /// The creative direction its picture is rendered from (null: none).
  Map<String, dynamic>? direction;

  /// Rendering now; [pending] the quality asked, [quality] the picture's.
  bool busy = false;
  String? pending, quality;

  /// 'presentation' (front and back) or 'front' (one garment, the options).
  String? view;

  /// Bundled sample image (demo mode, no API key).
  String? asset;
}

class Project {
  Project({
    String? id,
    required this.title,
    required this.sport,
    required this.garment,
    required this.mode,
    required this.kit,
    required this.updated,
    this.version = 1,
    this.asset,
    this.thumbnail,
    this.renderFront,
    this.renderBack,
    this.brief = '',
    this.persisted = false,
    this.remoteId,
    this.remoteVersion,
    this.pendingUpload = false,
    this.approved = false,
  }) : id = id ?? 'p${DateTime.now().microsecondsSinceEpoch}';

  /// Stable id; samples use "sample-N", user projects a timestamp.
  final String id;

  /// True once written to the device.
  bool persisted;

  /// The project's id and version in the server database, once uploaded.
  int? remoteId, remoteVersion;

  /// Saved on this device but not yet uploaded to the account.
  bool pendingUpload;

  /// Approved for production by 3DEEZI (status set on the website).
  bool approved;

  /// The last upload failed (shown on the project card).
  String? syncError;
  String? localSaveError;
  String title;
  final String sport, garment, mode, brief;
  final KitState kit;
  final DateTime updated;
  final int version;
  final String? asset;
  final Uint8List? thumbnail, renderFront, renderBack;

  String get age {
    final d = DateTime.now().difference(updated);
    if (d.inMinutes < 1) return 'just now';
    if (d.inHours < 1) return '${d.inMinutes}m ago';
    if (d.inDays < 1) return '${d.inHours}h ago';
    return '${d.inDays}d ago';
  }
}

class AppController extends ChangeNotifier {
  AppScreen screen = AppScreen.splash;
  final List<AppScreen> _history = [];
  final ai = AiService();
  String name = 'Alex Morgan';

  // ---------- creation path
  /// 'AI' (AI Designer) or 'DYO' (Design Your Own).
  String mode = 'AI';
  String brief = '';
  final List<Uint8List> references = [];

  /// The sport and garment chosen on the AI Designer (a sports tile, the
  /// brief's own words or a garment chip), or null to let the AI pick.
  String? aiSport, aiGarment;
  BriefMode? briefMode;
  List<Concept> concepts = [];
  int selectedConcept = 0;

  /// The one-prompt HD presentation mockup (front and back), with the art
  /// direction's one-line summary, and "Make it 3D" drawing its print sheet.
  /// "HD primary" (off by default: fast and low cost first, client
  /// 2026-10-21); any design can be made HD later from its menu.
  bool wantMockup = false, mockupBusy = false, sheetBusy = false;

  /// Open in 3D Designer is reading the AI picture (task 9.116).
  bool readingBusy = false;

  /// The AI designer's current Generate: a new brief or Back to create ends
  /// it, so late pictures from an older brief are dropped.
  int resultsRun = 0;
  String? planError;

  // ---------- Recent designs (client 2026-10-30, like ChatGPT keeps your
  // chats; the website's /ai/sessions): each brief's designs are saved to the
  // account once they are in (only changed pictures are sent) and the last
  // brief is kept on this device; the AI Designer start screen reopens them.
  int? aiSessionId;
  List<Uint8List> _aiSessionSent = const [];
  int _aiSessionToken = 0;
  Future<void> _aiSaving = Future.value();

  /// A new brief: its designs become a new session.
  void newAiSession() {
    _aiSessionToken++;
    aiSessionId = null;
    _aiSessionSent = const [];
  }

  /// After a design arrives or changes (render, Make HD, refine, edit):
  /// saved once none is still rendering (an unchanged list is not sent).
  void saveAiSessionSoon() => unawaited(_saveAiSession());

  static String _dataUrl(Uint8List b) {
    final mime = b.length > 3 && b[0] == 0x89 && b[1] == 0x50
        ? 'image/png'
        : b.length > 11 && b[8] == 0x57 && b[9] == 0x45
        ? 'image/webp'
        : 'image/jpeg';
    return 'data:$mime;base64,${base64Encode(b)}';
  }

  Future<void> _saveAiSession() async {
    if (concepts.any((o) => o.busy)) return;
    final list = [
      for (final o in concepts)
        if (o.image != null) o,
    ];
    if (list.isEmpty || brief.trim().isEmpty) return;
    final token = _aiSessionToken;
    final images = [for (final o in list) o.image!];
    Map<String, dynamic> keep(Concept o) => {
      'name': o.spec.designName,
      'description': o.spec.summary,
      if (o.quality == 'high' || o.quality == 'medium') 'quality': o.quality,
      if (o.view == 'presentation' || o.view == 'front') 'view': o.view,
      'direction': o.direction,
      'spec': o.spec.toJson(),
    };
    final local = {
      'prompt': brief,
      'sport': aiSport ?? sport,
      'garment': aiGarment ?? garment,
      'at': DateTime.now().toUtc().toIso8601String(),
      'options': [
        for (final o in list) {...keep(o), 'image': _dataUrl(o.image!)},
      ],
    };
    unawaited(const RecentDesignsStore().save(local));
    if (!signedIn || !api.configured) return;
    _aiSaving = _aiSaving.then((_) async {
      if (token != _aiSessionToken) return;
      final id = aiSessionId, sent = _aiSessionSent;
      bool same(int i) => i < sent.length && identical(sent[i], images[i]);
      if (id != null &&
          sent.length == images.length &&
          [for (var i = 0; i < images.length; i++) same(i)].every((x) => x)) {
        return;
      }
      final body = {
        'prompt': brief,
        'sport': aiSport ?? sport,
        'garment': aiGarment ?? garment,
        'source': 'app',
        'options': [
          for (final (i, o) in list.indexed)
            {
              ...keep(o),
              if (id == null || !same(i)) 'image': _dataUrl(o.image!),
            },
        ],
      };
      try {
        final saved = id == null
            ? await api.saveAiSession(body)
            : await api.updateAiSession(id, body);
        if (token != _aiSessionToken) return;
        aiSessionId = (saved['id'] as num).toInt();
        _aiSessionSent = images;
      } on Object {
        // Recent designs are a convenience: the designs on screen stay.
      }
    });
  }

  /// A Recent designs card: YOUR DESIGNS again with that brief's designs
  /// (from the account, or the last brief on this device), with no AI call.
  void showAiSession(Map<String, dynamic> s, {int? id}) {
    String? pick(List<String> names, Object? v) {
      String key(Object? x) =>
          '$x'.toLowerCase().replaceAll(RegExp('[^a-z0-9]'), '');
      return names.where((n) => key(n) == key(v)).firstOrNull;
    }

    final sportName = pick(designSports, s['sport']);
    final garmentName = pick(aiDesignGarments, s['garment']);
    final list = <Concept>[];
    for (final o in (s['options'] as List? ?? const [])) {
      final m = (o as Map).cast<String, dynamic>();
      final url = m['image'] as String?;
      final comma = url?.indexOf(',') ?? -1;
      if (url == null || comma < 0) continue;
      try {
        final bytes = base64Decode(url.substring(comma + 1));
        final design = (m['design'] as Map?)?.cast<String, dynamic>() ?? {};
        final from = (m['spec'] as Map?)?.cast<String, dynamic>();
        final spec = DesignSpec.fromJson(
          from ??
              {
                'designName': m['name'] ?? 'Design ${list.length + 1}',
                'detected': garmentName ?? garment,
                'summary': m['description'] ?? '',
                'findings': const <String>[],
                'mainColor': design['main'] ?? '#101d2a',
                'secondaryColor': design['secondary'] ?? '#00c2cc',
                'accentColor': design['accent'] ?? '#ffffff',
                'pattern': design['pattern'],
                'fabric': design['fabric'],
                'logoText': design['logoText'] ?? '',
                'renderPrompt': '',
                'patternMotif': m['motif'] ?? '',
                'sport': sportName,
                'garment': garmentName,
              },
        );
        list.add(
          Concept(
              spec,
              direction: (m['direction'] as Map?)?.cast<String, dynamic>(),
            )
            ..image = bytes
            ..quality = m['quality'] as String?
            ..view = m['view'] as String?,
        );
      } on Object {
        continue;
      }
    }
    if (list.isEmpty) return;
    resultsRun++;
    newAiSession();
    brief = '${s['prompt'] ?? ''}';
    aiSport = sportName;
    aiGarment = garmentName;
    references.clear();
    concepts = list;
    selectedConcept = 0;
    planError = null;
    aiSessionId = id;
    _aiSessionSent = id == null ? const [] : [for (final o in list) o.image!];
    go(AppScreen.concepts);
  }

  Uint8List? mockupImage;
  String? mockupError, mockupDirection;

  /// A custom AI print is being generated for the kit.
  bool printBusy = false;
  String sport = 'Rugby League';

  // ---------- the kit (see [KitState])
  String _garment = 'Jersey';

  /// The 3D garment. Another garment is no longer the sport's tile it was
  /// chosen as, so it drops [productName] (set it after the garment).
  String get garment => _garment;
  set garment(String value) {
    if (value != _garment) productName = '';
    _garment = value;
  }

  /// The sport's garment tile the kit was chosen as ("Netball dress", task
  /// 9.99), or empty: the Studio, projects and orders name the kit by it.
  String productName = '';

  /// The kit's garment as the user chose it: its tile name, else the garment.
  String get garmentLabel => productName.isNotEmpty ? productName : garment;
  Color mainColor = const Color(0xff0b1016);
  Color secondaryColor = const Color(0xff00c2cc);
  Color accentColor = const Color(0xff36e3ee);
  String pattern = 'Chevron', fabric = 'Standard';
  String logoText = 'MANTIS', backName = 'MANTIS', number = '23';
  Uint8List? patternTile, logoImage, sponsorImage;

  /// See [KitState.patternScale] and [KitState.patternBody].
  double? patternScale, patternBody;

  /// Patterns › My patterns: the account's own pattern pictures (saved
  /// assets of type "pattern", shared with the website), loaded on demand.
  List<({int id, String name, Uint8List bytes})>? ownPatterns;

  /// How an own pattern goes on where the kit has no pattern picture yet:
  /// 'full' (its own colours) or 'kit' (a stencil in the kit's colours). Where
  /// it has one, the new pattern takes that picture's mode (own_patterns.dart).
  String ownPatternMode = 'full';

  /// Redraws the screens after a change outside [edit] (own_patterns.dart).
  void changed() => notifyListeners();
  DesignSpec? spec;
  List<Map<String, dynamic>> layers = [];
  Map<String, String> zones = {};

  /// Hoodies: each area's own colour (hood, lining, rib, pocket, zip: hex); unset areas follow the kit colours.
  Map<String, String> zoneColors = {};

  /// The track jacket's style: 'collar' (its stand-up collar) or 'hood'.
  String trackStyle = 'collar';

  /// The pattern's own colour ('#rrggbb'); null = the primary/secondary blend.
  String? patternColor;

  /// See [KitState.patternColorOwn].
  bool? patternColorOwn;

  /// See [KitState.parts].
  Map<String, dynamic> parts = {};

  /// Set by the Studio while a tap on one part of the 3D kit opens its Part
  /// panel (task 9.134): the viewer's 'partPick' message (partKey, part,
  /// side, x, y). Null = part tapping is off.
  void Function(Map<String, dynamic> pick)? partPick;

  /// Part tapping turned on or off: the viewer is told.
  void setPartPick(void Function(Map<String, dynamic> pick)? handler) {
    partPick = handler;
    notifyListeners();
  }

  /// Lights up a whole part on the 3D kit ({part: 'top' | 'shorts', key}),
  /// a short flash; null clears it. Set by the 3D viewer.
  void Function(Map<String, dynamic>? part)? glowPart;

  /// The pattern colour while [patternColor] is unset.
  Color get defaultPatternColor =>
      Color.lerp(mainColor, secondaryColor, 0.55) ?? secondaryColor;
  Map<String, dynamic>? gradient;

  /// Gradient fills of the secondary and pattern zones (see gradient_presets.dart); [gradient] is the primary's.
  Map<String, dynamic>? gradients;

  /// The wordmark, crest, sponsor, name and number as moved on the 2D panels.
  Map<String, dynamic> marks = {};

  /// The factory print layout on the kit (see [copyLayout]), or null.
  Map<String, dynamic>? layout;

  /// Shows a new print layout's panels for checking in the 3D view (set by
  /// the viewer): the data URL of the file, its name and its saved asset id;
  /// a design picture ([drawing]: front and back drawn flat) with the
  /// garment it most likely is. Answers {roles, hemFold, parts, panels}
  /// ({kind: 'drawing', roles, parts} for a picture), {cancelled: true} or
  /// null.
  Future<Map<String, dynamic>?> Function(
    String src,
    String name,
    int asset, {
    bool drawing,
    String? garment,
    bool known,
  })?
  checkLayout;

  /// The Studio's 3D view has started and answers requests (Artwork to 3D
  /// waits for it before the print layout check).
  bool viewerReady = false;

  /// The 3D view shows a screen of its own (the print layout check): what
  /// the app puts over the 3D view (view buttons, the chat button) hides.
  bool viewerModal = false;

  /// "High quality jersey (preview)": the 3D jersey is the client's
  /// professional CLO model (the viewer's ?hq=1). Off by default until the
  /// client approves; remembered on this device. Only the jersey changes.
  bool hqJersey = false;
  static const hqJerseyKey = '3deezi.hqJersey';

  /// Reads the device's own choices (the HQ jersey switch).
  Future<void> restoreDevicePrefs() async {
    try {
      final on = (await SharedPreferences.getInstance()).getBool(hqJerseyKey);
      if (on != null && on != hqJersey) update(() => hqJersey = on);
    } catch (_) {}
  }

  void setHqJersey(bool on) {
    update(() => hqJersey = on);
    SharedPreferences.getInstance()
        .then((p) => p.setBool(hqJerseyKey, on))
        .catchError((Object _) => false);
  }

  /// How tall the Studio's controls under the 3D are (its tool bar, or the
  /// tool panel while one is open): the round Assist button keeps above them.
  final studioClearance = ValueNotifier<double>(0);

  /// Closes the Studio's tool panel under the 3D; set while one is open, so
  /// Android Back closes it before leaving the Studio.
  VoidCallback? closeStudioPanel;

  /// Set by the Studio's open Colours panel: a tap on the 3D kit hands it the
  /// viewer's 'colourPick' message (slot, area). Null = tap-to-pick is off.
  void Function(Map<String, dynamic> pick)? colourPick;

  /// Drag to kit: the 3D viewer glows the part under the finger ([at] is
  /// 0..1 over the 3D, as [pickGarment]); null clears the glow. Set by the
  /// 3D viewer.
  void Function(Offset? at)? hoverGarment;

  /// While something is dragged from Drag to kit: the 3D view lets the
  /// pointer through to the app (web, mouse). Set by the 3D viewer.
  void Function(bool dragging)? viewerPassThrough;

  /// The panel opened or closed: the viewer turns tap-to-pick on or off.
  void setColourPick(void Function(Map<String, dynamic> pick)? handler) {
    colourPick = handler;
    notifyListeners();
  }

  bool boardMode = false;
  String? selectedLayerId;

  Future<Uint8List?> Function()? captureBoard;

  /// Zooms the 2D panels: 'in', 'out' or 'fit'.
  void Function(String how)? zoomBoard;
  Future<String> Function(
    String src, {
    bool removeBg,
    String? tint,
    int maxSize,
  })?
  processArtwork;
  Future<Map<String, dynamic>?> Function(double x, double y)? pickGarment;

  Map<String, dynamic>? get selectedLayer =>
      layers.where((layer) => layer['id'] == selectedLayerId).firstOrNull;

  void selectLayer(String? id) => update(() => selectedLayerId = id);

  /// The Artboard design to open when the Artboard next starts (the
  /// Studio's "Edit in Artboard" on artwork sent from it): its account id.
  int? openArtboardDoc;

  /// Opens the Artboard with the design an artwork layer came from.
  void editInArtboard(int doc) {
    openArtboardDoc = doc;
    go(AppScreen.artboard);
  }

  /// Artwork from the Artboard ([src], a PNG data URL) on the kit, as one
  /// undo step. Layers made from the same Artboard design ([doc]) get the new
  /// picture in place (same position and size); otherwise a new layer at
  /// [at] ({part, side, x, y, w, rot}). Answers 'updated', 'added' or 'full'.
  String placeArtboardArtwork({
    required String src,
    required String name,
    int? doc,
    Map<String, dynamic>? at,
  }) {
    final linked = doc == null
        ? const <Map<String, dynamic>>[]
        : layers.where((l) => l['artboard'] == doc).toList();
    if (linked.isNotEmpty) {
      edit(() {
        layers = [
          for (final l in layers)
            if (l['artboard'] == doc) {...l, 'src': src, 'name': name} else l,
        ];
        selectedLayerId = linked.first['id'] as String?;
      });
      return 'updated';
    }
    if (layers.length >= 40) return 'full';
    addLayer({
      'type': 'image',
      'name': name,
      'src': src,
      ...?at,
      'artboard': ?doc,
    });
    return 'added';
  }

  /// Artwork to 3D (task 9.153): a new kit of [sportName] on [garmentName]
  /// for the user's own artwork, opened in the Studio.
  void startArtworkKit(String sportName, String garmentName, String name) {
    _resetDesign();
    mode = 'DYO';
    sport = sportName;
    garment = garmentName;
    projectName = name.isEmpty ? '$sportName $garmentName' : name;
    _undo.clear();
    go(AppScreen.studio);
  }

  /// One design or logo (a PNG data URL) on the front of the kit, to move and
  /// resize there, or as an all-over print ([allOver]), as one undo step.
  Future<void> placeArtwork(
    String src,
    String name, {
    bool allOver = false,
  }) async {
    if (allOver) {
      final picture = ProjectSync.bytes(src);
      if (picture == null) return;
      // In its own colours, repeated over the garment.
      final png = await preparePattern(picture, 'full');
      edit(() {
        patternTile = png;
        pattern = 'Solid';
        patternScale = 0.16;
        zones = {};
      });
      return;
    }
    addLayer({
      'type': 'image',
      'name': name,
      'src': src,
      'side': 'front',
      'x': 0.0,
      'y': garment == 'Shorts' ? 0.23 : 0.42,
      'w': 0.24,
    });
  }

  /// A new kit on [garment] (Send to 3D Studio from the Artboard).
  void newKit(String garment) {
    _resetDesign();
    mode = 'DYO';
    this.garment = garment;
    projectName = '$sport $garment';
  }

  void addLayer(Map<String, dynamic> layer) {
    final id = 'layer-${DateTime.now().microsecondsSinceEpoch}';
    edit(() {
      layers = [
        ...layers,
        {
          'id': id,
          'part': garment == 'Shorts' ? 'shorts' : 'top',
          'side': view == 'Back' ? 'back' : 'front',
          'x': 0.0,
          'y': garment == 'Shorts' ? 0.23 : 0.43,
          'w': 0.16,
          'rot': 0,
          'opacity': 1,
          ...layer,
        },
      ];
      selectedLayerId = id;
    });
  }

  void changeLayer(
    String id,
    Map<String, dynamic> patch, {
    bool record = true,
  }) {
    void change() {
      layers = [
        for (final layer in layers)
          if (layer['id'] == id) {...layer, ...patch} else layer,
      ];
    }

    if (record) {
      edit(change);
    } else {
      update(change);
    }
  }

  void removeLayer(String id) => edit(() {
    layers = layers.where((layer) => layer['id'] != id).toList();
    if (selectedLayerId == id) selectedLayerId = null;
  });

  /// A factory print layout (PDF, SVG, PNG or JPG): kept with the saved
  /// assets (so the project opens with it, here and on the website), checked
  /// in the 3D view, then put on the kit as one undo step. Answers what to
  /// tell the user, or null when the check was cancelled.
  Future<String?> importPrintLayout(String name, Uint8List bytes) async {
    final lower = name.toLowerCase();
    final type = lower.endsWith('.pdf') || lower.endsWith('.ai')
        ? 'application/pdf'
        : lower.endsWith('.svg')
        ? 'image/svg+xml'
        : lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.webp')
        ? 'image/webp'
        : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
        ? 'image/jpeg'
        : null;
    if (type == null) {
      throw ApiException('Choose a PDF, SVG, PNG or JPG print layout.');
    }
    if (bytes.length > 30 * 1024 * 1024) {
      throw ApiException('Choose a print layout smaller than 30 MB.');
    }
    final check = checkLayout;
    if (check == null) {
      throw ApiException('The 3D kit is still starting. Please try again.');
    }
    final asset = await api.uploadAsset(
      bytes,
      filename: name,
      type: 'layout',
      contentType: type,
    );
    // A layout not put on the kit is not kept.
    void forget() =>
        unawaited(api.deleteAsset(asset).catchError((Object _) {}));
    final Map<String, dynamic>? result;
    try {
      result = await check(
        'data:$type;base64,${base64Encode(bytes)}',
        name,
        asset,
      );
    } on Object {
      forget();
      rethrow;
    }
    final roles = result?['roles'];
    if (result == null || result['cancelled'] == true || roles is! List) {
      forget();
      return null;
    }
    // The garment shows what the layout makes: a top and shorts are the full kit.
    final parts = result['parts'] is List ? result['parts'] as List : const [];
    final top = parts.contains('raglan'), legs = parts.contains('shorts');
    edit(() {
      garment = top && legs
          ? 'Full Kit'
          : legs
          ? 'Shorts'
          : garment == 'Shorts' || garment == 'Full Kit'
          ? 'Training Tee'
          : garment;
      layout = copyLayout({
        'asset': asset,
        'name': name.length > 160 ? name.substring(0, 160) : name,
        'roles': roles,
        'hemFold': result!['hemFold'] != false,
        'joinLines': result['joinLines'] == true,
        'parts': result['parts'],
      });
    });
    final panels = (result['panels'] as List?)?.length ?? 0;
    return 'Print layout on the 3D kit: $panels panel${panels == 1 ? '' : 's'} from $name. '
        'Save the project to keep it.';
  }

  /// My design picture: the finished design's front and back drawn flat (a
  /// PNG, JPG, WebP, PDF or SVG), kept with the saved assets, checked in the
  /// 3D view, then on the kit exactly as drawn (a singlet) as one undo step.
  /// Answers what to tell the user, or null when the check was cancelled.
  ///
  /// [known]: the kit's garment is the one the picture was read as (an AI
  /// design, task 9.116), so the check opens on it rather than on a guess.
  Future<String?> importDesignPicture(
    String name,
    Uint8List bytes, {
    bool known = false,
  }) async {
    final lower = name.toLowerCase();
    final type = lower.endsWith('.pdf')
        ? 'application/pdf'
        : lower.endsWith('.svg')
        ? 'image/svg+xml'
        : lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.webp')
        ? 'image/webp'
        : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
        ? 'image/jpeg'
        : null;
    if (type == null) {
      throw ApiException('Choose a PNG, JPG, WebP, PDF or SVG picture.');
    }
    if (bytes.length > 30 * 1024 * 1024) {
      throw ApiException('Choose a picture smaller than 30 MB.');
    }
    final check = checkLayout;
    if (check == null) {
      throw ApiException('The 3D kit is still starting. Please try again.');
    }
    final asset = await api.uploadAsset(
      bytes,
      filename: name,
      type: 'layout',
      contentType: type,
    );
    void forget() =>
        unawaited(api.deleteAsset(asset).catchError((Object _) {}));
    final Map<String, dynamic>? result;
    try {
      result = await check(
        'data:$type;base64,${base64Encode(bytes)}',
        name,
        asset,
        drawing: true,
        // The garment it most likely is (the check screen also reads it
        // from the drawing's shape, and the user can change it there).
        garment: switch (garment) {
          'Training Tee' => 'tee',
          'Polo' => 'polo',
          'Polo with pocket' => 'pocketpolo',
          'Netball dress' => 'netball-dress',
          'Football jersey' => 'nfljersey',
          'Shooting shirt' => 'shooting-shirt',
          // Socks keep their own shape, with the design's colours.
          'Socks' => 'socks',
          // The cap keeps its own shape, with the design's colours.
          'Cap' => 'cap',
          // The skirt keeps its own shape, with the design's colours.
          'Skirt' => 'skirt',
          // The bucket hat keeps its own shape, with the design's colours.
          'Bucket hat' => 'bucket-hat',
          // Hoodies are long-sleeved: a drawing of one is read as a sleeved top.
          'Hoodie' ||
          'Compression top' ||
          'Zip hoodie' ||
          'Varsity jacket' ||
          'Track jacket' => 'jersey',
          'Jersey' => 'jersey',
          _ => 'singlet',
        },
        known: known,
      );
    } on Object {
      forget();
      rethrow;
    }
    final roles = result?['roles'];
    if (result == null || result['cancelled'] == true || roles is! List) {
      forget();
      return null;
    }
    final parts = result['parts'];
    final top = parts is List && parts.isNotEmpty
        ? '${parts.first}'
        : 'singlet';
    edit(() {
      garment = switch (top) {
        'jersey' => 'Jersey',
        'tee' => 'Training Tee',
        'polo' => 'Polo',
        'pocketpolo' => 'Polo with pocket',
        'netball-dress' => 'Netball dress',
        'nfljersey' => 'Football jersey',
        _ => 'Singlet',
      };
      layout = copyLayout({
        'asset': asset,
        'name': name.length > 160 ? name.substring(0, 160) : name,
        'roles': roles,
        'kind': 'drawing',
        'parts': [top],
      });
      // The picture carries its own lettering: the position letters read
      // from it are not added again.
      layers = layers.where((l) => l['id'] != positionLayer).toList();
    });
    return 'Your design is on the 3D kit as drawn ($name). '
        'Save the project to keep it.';
  }

  /// Replaces the look (colours, pattern, gradients, area patterns) as one
  /// undo step. It also takes off an AI print and a design picture or print
  /// layout, which would hide it ([shelvedLayouts] keeps them to put back);
  /// the artwork layers, logos and player details stay, as on the website.
  void applyPreset(Map<String, dynamic> design) {
    _keepOwn();
    _applyPreset(design);
  }

  // ---------- YOUR DESIGN (Preset designs)
  /// The user's own kit before the first preset (and as changed after it is
  /// chosen again), with a 3D still; null for a fresh kit that started from a
  /// preset. Kept per project for this app session.
  KitState? ownKit;
  Uint8List? ownThumb;
  bool _onPreset = false;
  String? _freshLook;
  final Map<String, (KitState?, Uint8List?, bool)> _ownByProject = {};

  String _signature(KitState k) => jsonEncode([
    k.garment,
    ProjectSync.hex(k.mainColor),
    ProjectSync.hex(k.secondaryColor),
    ProjectSync.hex(k.accentColor),
    k.pattern,
    identityHashCode(k.patternTile),
    identityHashCode(k.logoImage),
    identityHashCode(k.sponsorImage),
    k.logoText,
    k.backName,
    k.number,
    k.layers,
    k.zones,
    k.zoneColors,
    k.trackStyle,
    k.patternColor,
    k.patternColorOwn,
    k.parts,
    k.productName,
    k.gradient,
    k.gradients,
    k.marks,
    k.layout,
    k.patternScale,
    k.patternBody,
  ]);

  /// YOUR DESIGN is on the kit now.
  bool get ownOn => ownKit != null && _signature(ownKit!) == _signature(kit);

  /// While the kit is the user's own (not a preset), YOUR DESIGN follows it.
  void _followOwn() {
    final now = _signature(kit);
    if (ownKit != null && _signature(ownKit!) == now) {
      _onPreset = false;
      return;
    }
    if (_onPreset || (ownKit == null && now == _freshLook)) return;
    ownKit = kit;
  }

  void _keepOwn() {
    if (_onPreset) return;
    if (ownKit != null || _signature(kit) != _freshLook) ownKit = kit;
    _onPreset = true;
  }

  /// A 3D still of the user's own kit for the YOUR DESIGN card, taken just
  /// before a preset replaces it.
  Future<void> captureOwnThumb() async {
    if (_onPreset) return;
    final capture = captureMockup;
    if (capture == null) return;
    try {
      ownThumb = await capture('Front') ?? ownThumb;
    } on Object {
      // The swatch shows.
    }
  }

  /// YOUR DESIGN back on the kit (its picture or layout, colours, patterns,
  /// gradients, artwork and garment) as one undo step.
  void restoreOwn() {
    final own = ownKit;
    if (own == null) return;
    edit(() => _restore(own));
    _onPreset = false;
  }

  /// A garment tile's starting look (task 9.154, sports_catalog.dart
  /// tileLook): its colours, pattern, colour areas, number and its look.
  void startLook(Map<String, dynamic> look) {
    mainColor = ProjectSync.color(look['main']);
    secondaryColor = ProjectSync.color(look['secondary']);
    accentColor = ProjectSync.color(look['accent']);
    pattern = look['pattern'] as String;
    patternColor = look['patternColor'] as String?;
    patternColorOwn = look['patternColorOwn'] == true ? true : null;
    zones = copyZones(look['zones']);
    zoneColors = copyZones(look['zoneColors']);
    // The picture's own objects ('tile-…') replace the last tile's.
    layers = [
      ...layers.where((l) => !'${l['id']}'.startsWith('tile-')),
      ...(look['layers'] as List).cast<Map<String, dynamic>>(),
    ];
    // Parts with a look of their own (the rugby blades' black sides, the
    // socks' cyan heel and toe), as the website applies them.
    parts = copyParts(look['parts']);
    gradient = null;
    gradients = null;
    number = look['number'] as String;
    marks = {
      for (final e in marks.entries)
        if (e.key != 'top_number' &&
            e.key != 'top_frontNumber' &&
            // Marks a bib tile hid (team name, crest, name) show again.
            !(const {'top_wordmark', 'top_crest', 'top_name'}.contains(e.key) &&
                e.value is Map &&
                (e.value as Map)['hidden'] == true))
          e.key: e.value,
      ...(look['marks'] as Map<String, dynamic>),
    };
    notifyListeners();
  }

  void _applyPreset(Map<String, dynamic> design) => edit(() {
    if (design['main'] != null) mainColor = ProjectSync.color(design['main']);
    if (design['secondary'] != null) {
      secondaryColor = ProjectSync.color(design['secondary']);
    }
    if (design['accent'] != null) {
      accentColor = ProjectSync.color(design['accent']);
    }
    if (design['pattern'] is String) pattern = design['pattern'] as String;
    gradient = copyGradient(design['gradient']);
    gradients = copyGradient(design['gradients']);
    zones = copyZones(design['zones']);
    zoneColors = copyZones(design['zoneColors']);
    patternColor = design['patternColor'] is String
        ? design['patternColor'] as String
        : null;
    // The whole look, as the website applies it (task 9.148: a My preset
    // carries its fabric, My pattern picture, pattern size and track style).
    patternColorOwn = design['patternColorOwn'] == true ? true : null;
    parts = copyParts(design['parts']);
    patternTile = ProjectSync.bytes(design['patternImage']);
    if (design.containsKey('patternScale')) {
      patternScale = (design['patternScale'] as num?)?.toDouble();
    }
    if (design.containsKey('patternBody')) {
      patternBody = (design['patternBody'] as num?)?.toDouble();
    }
    if (design['trackStyle'] is String) {
      trackStyle = design['trackStyle'] == 'hood' ? 'hood' : 'collar';
    }
    if (designFabrics.contains(design['fabric'])) {
      fabric = design['fabric'] as String;
    }
    layout = copyLayout(design['layout']);
  });

  /// The last design picture ('drawing') and print layout ('print') on the
  /// kit in this visit, with the garment they were on: a preset or Remove
  /// takes them off, and the Artwork tool puts them back.
  final Map<String, ({Map<String, dynamic> layout, String garment})>
  shelvedLayouts = {};
  void _shelveLayout() {
    final on = copyLayout(layout);
    if (on == null) return;
    shelvedLayouts[on['kind'] == 'drawing' ? 'drawing' : 'print'] = (
      layout: on,
      garment: garment,
    );
  }

  /// Puts the shelved design picture or print layout ([kind] 'drawing' or
  /// 'print') back on the kit as one undo step.
  void putLayoutBack(String kind) {
    final back = shelvedLayouts[kind];
    if (back == null) return;
    edit(() {
      garment = back.garment;
      layout = copyLayout(back.layout);
    });
  }

  // ---------- renders and the studio
  Uint8List? renderFront, renderBack;
  String view = 'Front';

  /// Counts Front / Back / Side presses: the 3D turns to the view on every
  /// press, also when it is the view already chosen (the kit may have been
  /// turned by hand since).
  int viewPresses = 0;

  /// The studio shows the live 3D kit; false shows the AI render.
  bool show3d = true;
  bool renderingBack = false;
  Uint8List? mockupFront, mockupBack, mockupSide;

  /// The flat front / back print panels, captured for the PDF design sheet.
  Uint8List? mockupPanels;

  /// Set by the live 3D viewer while it is on screen.
  Future<Uint8List?> Function(String view)? captureMockup;

  /// The AI render for the current view (2D fallback preview).
  Uint8List? get currentRender => view == 'Back' ? renderBack : renderFront;
  bool get showRender => !show3d;

  // ---------- projects and assets
  int selectedProject = -1;
  bool saved = false;
  String? saveError;
  String projectName = '';
  final List<Uint8List> uploads = [], logos = [], aiPatterns = [], artwork = [];

  /// Photoreal Showcase images made in this session.
  final List<Uint8List> showcases = [];
  final ProjectStore store;

  // ---------- account (the website's database)
  final ApiClient api;
  final SessionStore session;
  ApiUser? user;
  bool get signedIn => user != null;
  bool syncing = false;

  /// Why the last sync failed, for the profile screen.
  String? syncMessage;

  AppController({
    this.store = const ProjectStore(),
    ApiClient? api,
    this.session = const SessionStore(),
  }) : api = api ?? ApiClient();

  /// Reopens the account saved on this device and syncs its projects.
  Future<void> restoreSession() async {
    try {
      final saved = await session.load();
      final server = saved.baseUrl;
      if (server != null && server.isNotEmpty) {
        api.baseUrl = ApiClient.normalize(server);
      }
      if (saved.token != null && saved.user != null && api.configured) {
        api.token = saved.token;
        user = saved.user;
        name = saved.user!.name;
        notifyListeners();
        unawaited(syncProjects());
      }
    } on Object {
      // Preferences unavailable: start signed out.
    }
  }

  /// Changes the server; an account on the old server is signed out.
  Future<void> setServer(String url) async {
    final next = ApiClient.normalize(url);
    if (next == api.baseUrl) return;
    if (signedIn) await signOut();
    api.baseUrl = next;
    notifyListeners();
    await session.saveServer(next).catchError((Object _) {});
  }

  /// Returns null on success, otherwise a message for the user.
  Future<String?> signIn({required String email, required String password}) =>
      _account(() => api.login(email: email.trim(), password: password));

  Future<String?> register({
    required String name,
    required String email,
    required String password,
    required String passwordConfirmation,
  }) => _account(
    () => api.register(
      name: name.trim(),
      email: email.trim(),
      password: password,
      passwordConfirmation: passwordConfirmation,
    ),
  );

  /// "Forgot password?": emails a 6-digit code. Returns (message, error).
  Future<(String?, String?)> sendLoginCode(String email) async {
    try {
      return (await api.sendLoginCode(email.trim()), null);
    } on ApiException catch (e) {
      return (null, e.message);
    }
  }

  /// Signs in with the emailed code; null on success, otherwise a message.
  Future<String?> signInWithCode({
    required String email,
    required String code,
  }) =>
      _account(() => api.loginWithCode(email: email.trim(), code: code.trim()));

  /// Sets a new password with the emailed code and signs in.
  Future<String?> resetPassword({
    required String email,
    required String code,
    required String password,
    required String passwordConfirmation,
  }) => _account(
    () => api.resetPassword(
      email: email.trim(),
      code: code.trim(),
      password: password,
      passwordConfirmation: passwordConfirmation,
    ),
  );

  Future<String?> _account(Future<ApiUser> Function() call) async {
    try {
      final account = await call();
      user = account;
      name = account.name;
      syncMessage = null;
      notifyListeners();
      await session.saveAccount(api.token!, account).catchError((Object _) {});
      unawaited(syncProjects());
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  /// Signs out and removes this device's copies of the account's projects
  /// (they stay in the cloud). Projects not yet uploaded are kept.
  Future<void> signOut() async {
    await api.logout();
    user = null;
    orders = [];
    syncMessage = null;
    await session.clearAccount().catchError((Object _) {});
    for (final p
        in projects
            .where((p) => p.remoteId != null && !p.pendingUpload)
            .toList()) {
      projects.remove(p);
      if (p.persisted) store.delete(p.id).catchError((Object _) {});
    }
    selectedProject = -1;
    notifyListeners();
  }

  /// The token was rejected: sign out but keep every project.
  Future<void> _expire(String message) async {
    api.token = null;
    user = null;
    syncMessage = message;
    await session.clearAccount().catchError((Object _) {});
  }

  /// Merges the account's projects with this device's: new and changed
  /// server projects come down, projects deleted on the website are
  /// removed, and local saves not yet uploaded go up.
  Future<void> syncProjects() {
    if (!signedIn) return Future.value();
    // A sync already running (e.g. started by sign-in) is shared.
    return _sync ??= _syncProjects().whenComplete(() => _sync = null);
  }

  Future<void>? _sync;

  Future<void> _syncProjects() async {
    syncing = true;
    syncMessage = null;
    notifyListeners();
    final selectedId = selectedProject >= 0 && selectedProject < projects.length
        ? projects[selectedProject].id
        : null;
    try {
      final seen = <int>{};
      for (final json in await api.projects()) {
        final server = ProjectSync.fromServer(json);
        seen.add(server.remoteId!);
        final i = projects.indexWhere(
          (p) =>
              p.remoteId == server.remoteId ||
              (p.remoteId == null && p.id == server.id),
        );
        if (i < 0) {
          projects.add(server);
          _persist(server);
        } else if (!projects[i].pendingUpload &&
            projects[i].remoteVersion != server.remoteVersion) {
          projects[i] = server;
          _persist(server);
        } else if (projects[i].approved != server.approved) {
          // Approval doesn't change the version, so copy it across.
          projects[i].approved = server.approved;
          _persist(projects[i]);
        }
      }
      projects.removeWhere((p) {
        final gone =
            p.remoteId != null &&
            !p.pendingUpload &&
            !seen.contains(p.remoteId);
        if (gone && p.persisted) store.delete(p.id).catchError((Object _) {});
        return gone;
      });
      for (final p in projects.where((p) => p.pendingUpload).toList()) {
        await _upload(p);
      }
      // Newest first, with the bundled samples last.
      bool sample(Project p) => p.asset != null && !p.persisted;
      projects.sort((a, b) {
        if (sample(a) != sample(b)) return sample(a) ? 1 : -1;
        return b.updated.compareTo(a.updated);
      });
    } on ApiException catch (e) {
      if (e.unauthorized) {
        await _expire(e.message);
      } else {
        syncMessage = e.message;
      }
    } finally {
      selectedProject = selectedId == null
          ? -1
          : projects.indexWhere((p) => p.id == selectedId);
      syncing = false;
      notifyListeners();
    }
  }

  /// Uploads one project. An expired session is rethrown; other failures
  /// are recorded on the project.
  Future<void> _upload(Project p) async {
    try {
      final body = ProjectSync.toServer(p);
      final saved = p.remoteId == null
          ? await api.createProject(body)
          : await api.updateProject(p.remoteId!, body);
      p
        ..remoteId = saved['id'] as int
        ..remoteVersion = saved['version'] as int?
        ..pendingUpload = false
        ..syncError = null;
      _persist(p);
    } on ApiException catch (e) {
      if (e.unauthorized) rethrow;
      if (e.status == 404 && p.remoteId != null) {
        // Deleted on the website meanwhile: upload it as a new project.
        p.remoteId = null;
        return _upload(p);
      }
      p.syncError = e.message;
    } finally {
      notifyListeners();
    }
  }

  void _persist(Project p) {
    store
        .save(p)
        .then((_) {
          p.persisted = true;
          p.localSaveError = null;
        })
        .catchError((Object _) {
          p.localSaveError = 'Could not save a copy on this device.';
          notifyListeners();
        });
  }

  /// Loads projects saved on the device (newest first) above the samples.
  /// A saved project replaces the sample it was created from.
  Future<void> restoreProjects() async {
    try {
      final saved = await store.loadAll();
      if (saved.isEmpty) return;
      final ids = saved.map((p) => p.id).toSet();
      projects
        ..removeWhere((p) => ids.contains(p.id))
        ..insertAll(0, saved);
      notifyListeners();
    } on Object {
      // Storage unavailable: keep the in-memory list.
    }
  }

  /// Deletes a project from the list and from the device.
  void deleteProject(Project project) {
    projects.remove(project);
    if (project.persisted) store.delete(project.id).catchError((Object _) {});
    final remote = project.remoteId;
    if (remote != null && signedIn) {
      api.deleteProject(remote).catchError((Object _) {});
    }
    if (selectedProject >= projects.length) selectedProject = -1;
    notifyListeners();
  }

  final List<Project> projects = [
    for (final (i, title, sport, garment, mode, version, hours) in const [
      (1, 'Warriors Concept', 'Rugby League', 'Jersey', 'AI', 1, 2),
      (2, 'Mantis Elite', 'Training / Gym', 'Training Tee', 'AI', 2, 26),
      (3, 'Club Jersey', 'Soccer', 'Jersey', 'DYO', 1, 30),
      (4, 'Morahu', 'Basketball', 'Singlet', 'DYO', 3, 72),
      (5, 'Coastal Blues', 'Rugby Union', 'Jersey', 'AI', 1, 96),
      (6, 'Away Edition', 'Soccer', 'Training Tee', 'DYO', 2, 120),
    ])
      Project(
        id: 'sample-$i',
        title: title,
        sport: sport,
        garment: garment,
        mode: mode,
        version: version,
        updated: DateTime.now().subtract(Duration(hours: hours)),
        asset: 'assets/images/project_$i.png',
        kit: _sampleKit(i, garment),
      ),
  ];

  static KitState _sampleKit(int i, String garment) {
    const palettes = [
      (0xff0b1016, 0xff00c2cc, 0xff36e3ee, 'WARRIORS'),
      (0xff10233f, 0xffffc52f, 0xffffd75e, 'MANTIS'),
      (0xff2a0d2c, 0xffe796e4, 0xfff6c7f4, 'CLUB'),
      (0xff1a0507, 0xfff44d56, 0xffffffff, 'MORAHU'),
      (0xff07203a, 0xff2b92dd, 0xffeaf7ff, 'COASTAL'),
      (0xffeaf7ff, 0xff8edaf2, 0xff0b2a40, 'AWAY'),
    ];
    final p = palettes[(i - 1) % palettes.length];
    return KitState(
      garment: garment,
      mainColor: Color(p.$1),
      secondaryColor: Color(p.$2),
      accentColor: Color(p.$3),
      pattern: const ['Chevron', 'Velocity', 'Stripes'][i % 3],
      fabric: 'Standard',
      logoText: p.$4,
      backName: p.$4,
      number: '${7 + i}',
      patternTile: null,
      logoImage: null,
      spec: null,
    );
  }

  // ---------- orders and partners
  /// Orders a saved kit. It is uploaded to the account first if needed.
  Future<Map<String, dynamic>> orderKit(
    Project p,
    Map<String, dynamic> details,
  ) async {
    if (!signedIn) throw ApiException('Sign in to order kits.');
    if (p.asset != null && !p.persisted) {
      throw ApiException(
        'This is a sample design. Open it, then save it as your own project to order it.',
      );
    }
    if (p.remoteId == null || p.pendingUpload) await syncProjects();
    if (p.remoteId == null) {
      throw ApiException(
        p.syncError ??
            'This project is not on your account yet. Check the connection and try again.',
      );
    }
    final Map<String, dynamic> order;
    try {
      order = await api.createOrder({
        ...details,
        'project_id': p.remoteId,
        // The version shown is the one ordered: the server refuses a newer one.
        if (p.remoteVersion != null) 'project_version': p.remoteVersion,
      });
    } on ApiException catch (e) {
      // Changed on another device: bring the new version down to check it.
      if (e.status == 409) unawaited(syncProjects());
      rethrow;
    }
    // Ordering approves the design (the customer confirmed it is final).
    if (!p.approved) {
      p.approved = true;
      _persist(p);
    }
    orders = [order, ...orders];
    notifyListeners();
    return order;
  }

  /// The signed-in customer's orders (newest first).
  List<Map<String, dynamic>> orders = [];
  Future<void> loadOrders() async {
    orders = await api.orders();
    notifyListeners();
  }

  // ---------- navigation
  void go(AppScreen next) {
    if (screen == next) return;
    _history.add(screen);
    screen = next;
    notifyListeners();
  }

  void back() {
    const transient = {AppScreen.splash, AppScreen.generating};
    var previous = AppScreen.home;
    while (_history.isNotEmpty) {
      final candidate = _history.removeLast();
      if (candidate != screen && !transient.contains(candidate)) {
        previous = candidate;
        break;
      }
    }
    screen = previous;
    notifyListeners();
  }

  void update(VoidCallback change) {
    final uncover = _coverCheck();
    change();
    uncover?.call();
    notifyListeners();
  }

  /// The colours, pattern, AI print and gradients: what a design picture or
  /// print layout hides.
  String get _look => jsonEncode([
    ProjectSync.hex(mainColor),
    ProjectSync.hex(secondaryColor),
    ProjectSync.hex(accentColor),
    pattern,
    identityHashCode(patternTile),
    zones,
    zoneColors,
    gradient,
    gradients,
    parts,
  ]);

  /// A design picture or print layout is painted instead of the colours,
  /// pattern and gradients: a change to them takes it off so the change
  /// shows ([shelvedLayouts] and Undo put it back). Taken before a change;
  /// the answer, called after it, does that (null without a layout).
  VoidCallback? _coverCheck() {
    if (layout == null) return null;
    final look = _look, was = jsonEncode(layout);
    return () {
      if (layout != null && jsonEncode(layout) == was && _look != look) {
        layout = null;
      }
    };
  }

  // ---------- kit edits with Undo/Redo
  final List<KitState> _undo = [], _redo = [];
  bool get canUndo => _undo.isNotEmpty;
  bool get canRedo => _redo.isNotEmpty;

  KitState get kit => KitState(
    garment: garment,
    mainColor: mainColor,
    secondaryColor: secondaryColor,
    accentColor: accentColor,
    pattern: pattern,
    fabric: fabric,
    logoText: logoText,
    backName: backName,
    number: number,
    patternTile: patternTile,
    logoImage: logoImage,
    sponsorImage: sponsorImage,
    spec: spec,
    layers: copyLayers(layers),
    zones: copyZones(zones),
    zoneColors: copyZones(zoneColors),
    trackStyle: trackStyle,
    patternColor: patternColor,
    patternColorOwn: patternColorOwn,
    parts: copyParts(parts),
    productName: productName,
    gradient: copyGradient(gradient),
    gradients: copyGradient(gradients),
    marks: copyMarks(marks),
    layout: copyLayout(layout),
    patternScale: patternScale,
    patternBody: patternBody,
  );

  void _restore(KitState k) {
    garment = k.garment;
    mainColor = k.mainColor;
    secondaryColor = k.secondaryColor;
    accentColor = k.accentColor;
    pattern = k.pattern;
    fabric = k.fabric;
    logoText = k.logoText;
    backName = k.backName;
    number = k.number;
    patternTile = k.patternTile;
    logoImage = k.logoImage;
    sponsorImage = k.sponsorImage;
    spec = k.spec;
    layers = copyLayers(k.layers);
    zones = copyZones(k.zones);
    zoneColors = copyZones(k.zoneColors);
    trackStyle = k.trackStyle;
    patternColor = k.patternColor;
    patternColorOwn = k.patternColorOwn;
    parts = copyParts(k.parts);
    productName = k.productName;
    gradient = copyGradient(k.gradient);
    gradients = copyGradient(k.gradients);
    marks = copyMarks(k.marks);
    patternScale = k.patternScale;
    patternBody = k.patternBody;
    layout = copyLayout(k.layout);
    _shelveLayout();
    if (!layers.any((layer) => layer['id'] == selectedLayerId)) {
      selectedLayerId = null;
    }
  }

  /// Changes the kit and records the previous state for Undo.
  void edit(VoidCallback change) {
    _shelveLayout();
    _undo.add(kit);
    if (_undo.length > 50) _undo.removeAt(0);
    _redo.clear();
    final uncover = _coverCheck();
    change();
    uncover?.call();
    _shelveLayout();
    _followOwn();
    saved = false;
    mockupFront = mockupBack = mockupSide = mockupPanels = null;
    notifyListeners();
  }

  void undo() {
    if (_undo.isEmpty) return;
    _redo.add(kit);
    _restore(_undo.removeLast());
    _followOwn();
    saved = false;
    mockupFront = mockupBack = mockupSide = mockupPanels = null;
    notifyListeners();
  }

  void redo() {
    if (_redo.isEmpty) return;
    _undo.add(kit);
    _restore(_redo.removeLast());
    _followOwn();
    saved = false;
    mockupFront = mockupBack = mockupSide = mockupPanels = null;
    notifyListeners();
  }

  void applySpec(DesignSpec value) => edit(() {
    spec = value;
    mainColor = value.mainColor;
    secondaryColor = value.secondaryColor;
    accentColor = value.accentColor;
    pattern = value.pattern;
    fabric = value.fabric;
    logoText = value.logoText;
    // Netball has no player names or numbers (client 2026-10-26): its AI
    // designs start with an empty back name and number.
    final back = AiService.kitBack(value.sport, value.logoText);
    backName = back.backName;
    number = back.number ?? number;
  });

  // ---------- starting points
  void _resetDesign() {
    _restore(_sampleKit(1, 'Jersey'));
    shelvedLayouts.clear();
    ownKit = ownThumb = null;
    _onPreset = false;
    logoText = backName = 'MANTIS';
    number = '23';
    mainColor = const Color(0xff0b1016);
    _freshLook = _signature(kit);
    _undo.clear();
    _redo.clear();
    spec = null;
    renderFront = renderBack = null;
    mockupFront = mockupBack = mockupSide = mockupPanels = null;
    concepts = [];
    selectedConcept = 0;
    mockupImage = mockupError = mockupDirection = null;
    mockupBusy = false;
    view = 'Front';
    show3d = true;
    boardMode = false;
    selectedLayerId = null;
    selectedProject = -1;
    projectName = '';
    saved = false;
    saveError = null;
  }

  void startAi() {
    _resetDesign();
    mode = 'AI';
    brief = '';
    references.clear();
    briefMode = null;
    aiSport = aiGarment = null;
    go(AppScreen.aiDesigner);
  }

  void startDyo() {
    _resetDesign();
    mode = 'DYO';
    go(AppScreen.sport);
  }

  /// Renders the HD presentation mockup for the brief in the background
  /// (about a minute and a half); the concepts screen shows it when ready.
  Future<void> startMockup() async {
    if (!AiService.enabled || !wantMockup || brief.trim().isEmpty) return;
    mockupBusy = true;
    mockupImage = mockupError = mockupDirection = null;
    notifyListeners();
    final forBrief = brief;
    try {
      final image = await ai.mockup(
        brief: brief,
        sport: sport,
        garment: garment,
        logos: references,
        onDirection: (summary) {
          if (forBrief != brief) return;
          mockupDirection = summary;
          notifyListeners();
        },
      );
      if (forBrief != brief) return;
      mockupImage = image;
      artwork.add(image);
    } on AiException catch (e) {
      if (forBrief == brief) mockupError = e.message;
    } finally {
      if (forBrief == brief) mockupBusy = false;
      notifyListeners();
    }
  }

  /// "Make it 3D": the same AI redraws the mockup as a flat front and back
  /// print sheet (kept in Artwork); the caller puts it on the 3D kit with
  /// [importDesignPicture].
  Future<Uint8List> mockupPrintSheet({
    bool frontOnly = false,
    String? garment,
  }) async {
    final image = mockupImage;
    if (image == null) throw AiException('Create the HD mockup first.');
    sheetBusy = true;
    notifyListeners();
    try {
      final sheet = await ai.printSheet(
        image,
        sport: sport,
        garment: garment ?? this.garment,
        logos: references,
        frontOnly: frontOnly,
      );
      artwork.add(sheet);
      return sheet;
    } finally {
      sheetBusy = false;
      notifyListeners();
    }
  }

  /// "Ask 3DEEZI to change anything": applies a plain-language change to the
  /// kit as one undo step and returns the AI's reply. A requested custom
  /// print is generated afterwards.
  Future<String> askAi(String instruction, {Uint8List? image}) async {
    final change = await ai.editKit(
      main: mainColor,
      secondary: secondaryColor,
      accent: accentColor,
      pattern: pattern,
      logoText: logoText,
      backName: backName,
      number: number,
      instruction: instruction,
      image: image,
    );
    edit(() {
      mainColor = change.mainColor;
      secondaryColor = change.secondaryColor;
      accentColor = change.accentColor;
      pattern = change.pattern;
      if (change.logoText.isNotEmpty) logoText = change.logoText;
      backName = change.backName;
      number = change.number;
      if (change.motif != null) patternTile = null;
    });
    final motif = change.motif;
    if (motif != null) unawaited(applyPrint(motif));
    return motif == null
        ? change.reply
        : '${change.reply} Creating the print now…';
  }

  /// Generates a custom print from words and puts it on the kit.
  Future<String?> applyPrint(String motif) async {
    printBusy = true;
    notifyListeners();
    try {
      final tile = await ai.generatePattern(motif);
      aiPatterns.add(tile);
      edit(() => patternTile = tile);
      return null;
    } on AiException catch (e) {
      return e.message;
    } finally {
      printBusy = false;
      notifyListeners();
    }
  }

  /// CONVERT: a photo, sketch or mockup (even one from ChatGPT) becomes an
  /// editable 3D design, opened in the studio with its print.
  Future<void> convertImage(Uint8List image) async {
    final design = await ai.planDesign(
      sport: sport,
      garment: garment,
      brief:
          'Recreate the main garment in the attached image as an editable '
          'design: the same colours, the closest pattern, the exact wordmark '
          'text and its print motif. Detect the sport and garment from it.',
      reference: image,
    );
    _resetDesign();
    mode = 'AI';
    sport = design.sport;
    applySpec(design);
    garment = design.garment;
    _undo.clear();
    projectName = design.designName;
    references
      ..clear()
      ..add(image);
    go(AppScreen.studio);
    if (design.patternMotif.trim().isNotEmpty) {
      unawaited(applyPrint(design.patternMotif));
    }
  }

  /// "Open in 3D Designer" (task 9.116): the chosen AI design on the 3D
  /// garment its picture was read as ([reading]), in the picture's own
  /// colours and pattern, with its club symbol ([logo]) and lettering
  /// (netball: the position letters, front and back, and no name). Opens the
  /// studio; the picture itself (the print sheet) may go on after.
  void openReading(
    int index,
    DesignReading reading, {
    Uint8List? logo,
    Uint8List? print,
  }) {
    final concept = concepts[index];
    selectedConcept = index;
    sport = concept.spec.sport;
    applySpec(concept.spec);
    garment = reading.garment;
    final s = sportNamed(sport);
    final team = reading.teamName;
    edit(() {
      mainColor = reading.mainColor;
      secondaryColor = reading.secondaryColor;
      accentColor = reading.accentColor;
      pattern = reading.pattern;
      if (team.isNotEmpty) logoText = team;
      final hidden = <String, dynamic>{};
      if (reading.letters.isNotEmpty) {
        // Netball: the position letters in the number's place, no name above
        // them, and large on the front below the crest.
        backName = '';
        number = reading.letters;
        hidden['top_name'] = {'hidden': true};
        layers = [
          ...layers.where((l) => l['id'] != positionLayer),
          {
            'id': positionLayer,
            'name': 'Position letters',
            'type': 'text',
            'part': 'top',
            'side': 'front',
            'x': 0.0,
            // (Lower on the taller netball dress: as far under its shoulders.)
            'y': reading.garment == 'Netball dress' ? 0.5 : 0.36,
            'rot': 0,
            'text': reading.letters,
            'size': 0.17,
            'color':
                '#${reading.accentColor.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}',
          },
        ];
      } else {
        backName = (s?.names ?? true)
            ? (reading.backName.isNotEmpty ? reading.backName : logoText)
            : '';
        number = (s?.numbers ?? true)
            ? (reading.number.isNotEmpty ? reading.number : '23')
            : '';
      }
      // No team name in the picture: no chest wordmark (3DEEZI is never on
      // the front, client 2026-10-26).
      if (team.isEmpty || !reading.nameOnFront) {
        hidden['top_wordmark'] = {'hidden': true};
      }
      marks = hidden;
      if (reading.garment == 'Track jacket') {
        trackStyle = reading.hood ? 'hood' : 'collar';
      }
      if (logo != null) logoImage = logo;
      // The picture's own print all over the body (task 9.126).
      if (print != null) patternTile = print;
    });
    _undo.clear();
    renderFront = concept.image;
    renderBack = null;
    projectName = concept.spec.designName;
    show3d = true;
    view = 'Front';
    go(AppScreen.studio);
  }

  /// The netball position letters' text layer from a read AI picture: taken
  /// off again when the picture itself goes on (it has its own lettering).
  static const positionLayer = 'position-front';

  /// Opens the chosen AI concept in the Design Studio.
  void openConcept(int index) {
    final concept = concepts[index];
    selectedConcept = index;
    sport = concept.spec.sport;
    applySpec(concept.spec);
    garment = concept.spec.garment;
    _undo.clear();
    renderFront = concept.image;
    renderBack = null;
    projectName = concept.spec.designName;
    show3d = true;
    view = 'Front';
    go(AppScreen.studio);
  }

  /// Switches view, rendering the AI back view the first time it is needed.
  Future<String?> showView(String value) async {
    view = value;
    viewPresses++;
    notifyListeners();
    final front = renderFront, design = spec;
    if (show3d ||
        value != 'Back' ||
        renderBack != null ||
        front == null ||
        design == null ||
        renderingBack) {
      return null;
    }
    renderingBack = true;
    notifyListeners();
    try {
      renderBack = await ai.renderBack(front, design);
      return null;
    } on AiException catch (e) {
      return e.message;
    } finally {
      renderingBack = false;
      notifyListeners();
    }
  }

  // ---------- projects
  int get nextVersion =>
      selectedProject >= 0 && selectedProject < projects.length
      ? projects[selectedProject].version + 1
      : 1;

  /// The version a save under [title] gets: a new name (or a copy) starts a
  /// new project at Version 1.
  int versionFor(String title) {
    final had = selectedProject >= 0 && selectedProject < projects.length;
    if (!had) return 1;
    final t = title.trim();
    return t.isEmpty || t == projects[selectedProject].title.trim()
        ? nextVersion
        : 1;
  }

  /// Saves the design. A saved project under a different name, or with
  /// [asCopy], becomes a new project and the old one stays as it was (9.147).
  Future<bool> saveProject(
    String title, {
    Uint8List? thumbnail,
    bool asCopy = false,
  }) async {
    final had = selectedProject >= 0 && selectedProject < projects.length;
    final updating =
        had &&
        !asCopy &&
        (title.trim().isEmpty ||
            title.trim() == projects[selectedProject].title.trim());
    final project = Project(
      id: updating ? projects[selectedProject].id : null,
      title: title.trim().isEmpty ? '$sport $garment' : title.trim(),
      sport: sport,
      garment: garment,
      mode: mode,
      kit: kit,
      version: updating || !had ? nextVersion : 1,
      updated: DateTime.now(),
      asset: updating ? projects[selectedProject].asset : null,
      thumbnail: thumbnail ?? mockupFront ?? renderFront,
      renderFront: renderFront,
      renderBack: renderBack,
      brief: brief,
      remoteId: updating ? projects[selectedProject].remoteId : null,
      remoteVersion: updating ? projects[selectedProject].remoteVersion : null,
      pendingUpload: true,
    );
    if (updating) {
      projects.removeAt(selectedProject);
    }
    projects.insert(0, project);
    selectedProject = 0;
    _ownByProject[project.id] = (ownKit, ownThumb, _onPreset);
    projectName = project.title;
    saved = false;
    saveError = null;
    notifyListeners();
    try {
      await store.save(project);
      project.persisted = true;
    } on Object {
      project.localSaveError =
          'Could not save on this device. Storage may be '
          'full or unavailable. Keep this tab open, free some space and retry, '
          'or sign in to save your design to your account.';
    }
    if (signedIn) {
      try {
        await _upload(project);
      } on ApiException catch (e) {
        await _expire(e.message);
      }
    }
    saved =
        project.persisted ||
        (project.remoteId != null && !project.pendingUpload);
    saveError = saved ? null : project.localSaveError;
    notifyListeners();
    return saved;
  }

  void loadProject(Project project) {
    _resetDesign();
    _restore(project.kit);
    sport = project.sport;
    mode = project.mode;
    brief = project.brief;
    renderFront = project.renderFront;
    renderBack = project.renderBack;
    selectedProject = projects.indexOf(project);
    // An opened project is the user's own; YOUR DESIGN as it was when saved.
    _freshLook = null;
    if (_ownByProject[project.id] case (final own, final thumb, final preset)) {
      ownKit = own;
      ownThumb = thumb;
      _onPreset = preset;
    }
    projectName = project.title;
    saved = true;
    go(AppScreen.studio);
  }

  /// Captures the live 3D kit (front, back, side) for Save and Export, and
  /// with [panels] the flat print panels for the PDF design sheet.
  Future<void> captureViews({bool panels = false}) async {
    final capture = captureMockup;
    if (capture == null) return;
    mockupFront = await capture('Front') ?? mockupFront;
    mockupBack = await capture('Back') ?? mockupBack;
    mockupSide = await capture('Side') ?? mockupSide;
    final board = captureBoard;
    if (panels && board != null) {
      mockupPanels = await board().catchError((_) => null) ?? mockupPanels;
    }
  }
}

/// The last AI Designer brief on this device (guests, and anyone signed
/// out): the prompt and its designs with their pictures (Recent designs).
class RecentDesignsStore {
  const RecentDesignsStore();
  static const _key = '3deezi.ai.last';

  Future<Map<String, dynamic>?> load() async {
    try {
      final raw = (await SharedPreferences.getInstance()).getString(_key);
      final s = raw == null ? null : jsonDecode(raw) as Map<String, dynamic>;
      return (s?['options'] as List?)?.isNotEmpty == true ? s : null;
    } on Object {
      return null;
    }
  }

  /// Keeps it; when the device's storage is too small, the first design only.
  Future<void> save(Map<String, dynamic> session) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      try {
        await prefs.setString(_key, jsonEncode(session));
      } on Object {
        final options = session['options'] as List;
        await prefs.setString(
          _key,
          jsonEncode({...session, 'options': options.take(1).toList()}),
        );
      }
    } on Object {
      // Storage blocked: Recent designs are a convenience.
    }
  }
}
