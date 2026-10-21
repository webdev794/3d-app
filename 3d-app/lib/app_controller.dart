import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import 'ai_service.dart';
import 'api_client.dart';
import 'design_document.dart';
import 'project_store.dart';
import 'project_sync.dart';
import 'session_store.dart';

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
  artboard,
  pricing,
  orders,
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
    this.gradient,
    this.gradients,
    this.marks = const {},
    this.layout,
  });
  final String garment, pattern, fabric, logoText, backName, number;
  final Color mainColor, secondaryColor, accentColor;
  final Uint8List? patternTile, logoImage, sponsorImage;
  final DesignSpec? spec;
  final List<Map<String, dynamic>> layers;
  final Map<String, String> zones;
  final Map<String, dynamic>? gradient;

  /// The other colour zones' gradient fills (secondary, patternColor); [gradient] is the primary zone's.
  final Map<String, dynamic>? gradients;
  final Map<String, dynamic> marks;

  /// The factory print layout on the kit (see [copyLayout]), or null.
  final Map<String, dynamic>? layout;
}

/// One AI concept on the "Choose a design" screen.
class Concept {
  Concept(this.spec);
  final DesignSpec spec;
  Uint8List? image;
  String? error;

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
  bool wantMockup = true, mockupBusy = false, sheetBusy = false;
  Uint8List? mockupImage;
  String? mockupError, mockupDirection;

  /// A custom AI print is being generated for the kit.
  bool printBusy = false;
  String sport = 'Rugby League';

  // ---------- the kit (see [KitState])
  String garment = 'Jersey';
  Color mainColor = const Color(0xff0b1016);
  Color secondaryColor = const Color(0xff00c2cc);
  Color accentColor = const Color(0xff36e3ee);
  String pattern = 'Chevron', fabric = 'Standard';
  String logoText = 'MANTIS', backName = 'MANTIS', number = '23';
  Uint8List? patternTile, logoImage, sponsorImage;
  DesignSpec? spec;
  List<Map<String, dynamic>> layers = [];
  Map<String, String> zones = {};
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
  })?
  checkLayout;

  /// The 3D view shows a screen of its own (the print layout check): what
  /// the app puts over the 3D view (view buttons, the chat button) hides.
  bool viewerModal = false;
  bool boardMode = false;
  String? selectedLayerId;

  Future<Uint8List?> Function()? captureBoard;

  /// Zooms the 2D panels: 'in', 'out' or 'fit'.
  void Function(String how)? zoomBoard;
  Future<String> Function(String src, {bool removeBg, String? tint})?
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
    final type = lower.endsWith('.pdf')
        ? 'application/pdf'
        : lower.endsWith('.svg')
        ? 'image/svg+xml'
        : lower.endsWith('.png')
        ? 'image/png'
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
    return 'Print layout on the 3D kit: $panels panels from $name. '
        'Save the project to keep it.';
  }

  /// My design picture: the finished design's front and back drawn flat (a
  /// PNG, JPG, WebP, PDF or SVG), kept with the saved assets, checked in the
  /// 3D view, then on the kit exactly as drawn (a singlet) as one undo step.
  /// Answers what to tell the user, or null when the check was cancelled.
  Future<String?> importDesignPicture(String name, Uint8List bytes) async {
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
          'Jersey' => 'jersey',
          _ => 'singlet',
        },
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
    final top = parts is List && parts.isNotEmpty ? '${parts.first}' : 'singlet';
    edit(() {
      garment = switch (top) {
        'jersey' => 'Jersey',
        'tee' => 'Training Tee',
        'polo' => 'Polo',
        _ => 'Singlet',
      };
      layout = copyLayout({
        'asset': asset,
        'name': name.length > 160 ? name.substring(0, 160) : name,
        'roles': roles,
        'kind': 'drawing',
        'parts': [top],
      });
    });
    return 'Your design is on the 3D kit as drawn ($name). '
        'Save the project to keep it.';
  }

  /// Replaces styling as one undo step; artwork is preserved when absent.
  void applyPreset(Map<String, dynamic> design) => edit(() {
    if (design['main'] != null) mainColor = ProjectSync.color(design['main']);
    if (design['secondary'] != null) {
      secondaryColor = ProjectSync.color(design['secondary']);
    }
    if (design['accent'] != null)
      accentColor = ProjectSync.color(design['accent']);
    if (design['pattern'] is String) pattern = design['pattern'] as String;
    gradient = copyGradient(design['gradient']);
    gradients = copyGradient(design['gradients']);
    zones = copyZones(design['zones']);
    if (design.containsKey('layers')) layers = copyLayers(design['layers']);
  });

  // ---------- renders and the studio
  Uint8List? renderFront, renderBack;
  String view = 'Front';

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
    change();
    notifyListeners();
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
    gradient: copyGradient(gradient),
    gradients: copyGradient(gradients),
    marks: copyMarks(marks),
    layout: copyLayout(layout),
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
    gradient = copyGradient(k.gradient);
    gradients = copyGradient(k.gradients);
    marks = copyMarks(k.marks);
    layout = copyLayout(k.layout);
    if (!layers.any((layer) => layer['id'] == selectedLayerId)) {
      selectedLayerId = null;
    }
  }

  /// Changes the kit and records the previous state for Undo.
  void edit(VoidCallback change) {
    _undo.add(kit);
    if (_undo.length > 50) _undo.removeAt(0);
    _redo.clear();
    change();
    saved = false;
    mockupFront = mockupBack = mockupSide = mockupPanels = null;
    notifyListeners();
  }

  void undo() {
    if (_undo.isEmpty) return;
    _redo.add(kit);
    _restore(_undo.removeLast());
    saved = false;
    mockupFront = mockupBack = mockupSide = mockupPanels = null;
    notifyListeners();
  }

  void redo() {
    if (_redo.isEmpty) return;
    _undo.add(kit);
    _restore(_redo.removeLast());
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
    backName = value.logoText;
  });

  // ---------- starting points
  void _resetDesign() {
    _restore(_sampleKit(1, 'Jersey'));
    logoText = backName = 'MANTIS';
    number = '23';
    mainColor = const Color(0xff0b1016);
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

  /// "Explore the 3D studio": straight into the studio with a fresh kit.
  void exploreStudio() {
    _resetDesign();
    mode = 'DYO';
    projectName = '$sport $garment';
    go(AppScreen.studio);
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
  Future<Uint8List> mockupPrintSheet() async {
    final image = mockupImage;
    if (image == null) throw AiException('Create the HD mockup first.');
    sheetBusy = true;
    notifyListeners();
    try {
      final sheet = await ai.printSheet(
        image,
        sport: sport,
        garment: garment,
        logos: references,
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

  Future<bool> saveProject(String title, {Uint8List? thumbnail}) async {
    final updating = selectedProject >= 0 && selectedProject < projects.length;
    final project = Project(
      id: updating ? projects[selectedProject].id : null,
      title: title.trim().isEmpty ? '$sport $garment' : title.trim(),
      sport: sport,
      garment: garment,
      mode: mode,
      kit: kit,
      version: nextVersion,
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
