import 'dart:math' as math;

import 'package:flutter/foundation.dart'
    show ValueListenable, defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api_client.dart';
import '../assist.dart' show AssistController;
import '../app_controller.dart';
import '../widgets/flow_ui.dart' show pickArtwork;
import '../widgets/bubble_page.dart' show BubbleFillScroll;
import '../widgets/glass_bubble.dart';
import '../widgets/site_page_stub.dart'
    if (dart.library.js_interop) '../widgets/site_page_web.dart'
    if (dart.library.io) '../widgets/site_page_io.dart'
    show openPayLink;
import '../widgets/ui.dart';
import 'order_entry.dart'
    show OrderFormScreen, pickOrderFile, pickOrderFileIsDefault;
import 'suppliers.dart' show Supplier, SuppliersScreen;
import 'team.dart' show TeamScreen;

/// Opens a page or a file link (the summary page, the PDF, the Excel) in the
/// phone's browser. (Replaced in tests.)
Future<void> Function(BuildContext context, String url, String title)
openAssistantLink = openPayLink;

/// THE ORDER ASSISTANT (client images 4 / 5, 2026-11-05; task TL-3): the
/// default way to order. Screen 1 "CREATE YOUR ORDER" (Start from scratch,
/// Excel / order sheet, Handwritten notes, Upload artwork, 3DEEZI Team, one
/// prompt bar, "Switch to Manual Form"); screen 2 the chat, where the customer
/// types naturally and adds files; screen 3 the analysis: the things to check,
/// the order summary with the summary page, PDF and Excel, then Edit Order and
/// Review & Approve. The server reads and collates (POST /order-assistant).
class OrderAssistantScreen extends StatefulWidget {
  const OrderAssistantScreen(
    this.c, {
    super.key,
    this.maker,
    this.token,
    this.root = false,
  });
  final AppController c;

  /// The Orders tab's own page (client 454, 2026-11-05): no back arrow on
  /// screen 1, and My orders, the makers and Rewards in the "…" menu.
  final bool root;

  /// "Make with Mantis": the maker whose branding the PDF carries.
  final String? maker;

  /// An order collated earlier (its share token): opens on the chat.
  final String? token;

  @override
  State<OrderAssistantScreen> createState() => _OrderAssistantScreenState();
}

typedef _File = ({String name, Uint8List bytes});

class _OrderAssistantScreenState extends State<OrderAssistantScreen>
    with TickerProviderStateMixin {
  AppController get c => widget.c;
  final text = TextEditingController();
  final focus = FocusNode();
  final scroll = ScrollController();
  final analysisKey = GlobalKey();
  Map<String, dynamic>? data;
  final orderFiles = <_File>[];
  final designFiles = <_File>[];
  bool sending = false;

  /// What the customer just sent, shown until the answer comes.
  Map<String, dynamic>? pending;
  String? error;

  static const _maxBytes = 25 * 1024 * 1024;

  /// The tiles' height as a share of their width (smaller on short phones).
  double tileHeight = .78;

  /// The tab the app was on: a tab bar tap elsewhere closes this screen.
  /// (Read in initState: a lazy read swallowed the first tab bar tap.)
  late AppScreen shownOver;

  /// "Make with Mantis" (from the Orders page or the "…" menu).
  late String? maker = widget.maker;

  @override
  void initState() {
    super.initState();
    shownOver = c.screen;
    if (widget.token != null) _load(widget.token!);
    c.addListener(_tabChanged);
    if (widget.root) {
      // 3DEEZI ASSIST's /orders/new and /orders/upload land on this page:
      // the Order Assistant takes new orders and order sheets alike.
      AssistController.orderEntry.addListener(_entry);
      WidgetsBinding.instance.addPostFrameCallback((_) => _entry());
    }
  }

  void _entry() {
    if (mounted && AssistController.orderEntry.value != null) {
      AssistController.orderEntry.value = null;
    }
  }

  void _tabChanged() {
    if (widget.root || !mounted || c.screen == shownOver) return;
    shownOver = c.screen;
    final nav = Navigator.of(context);
    if (ModalRoute.of(context)?.isCurrent ?? false) nav.maybePop();
  }

  // ---- the five ways in: tap (or drag) one into the chat box ----------

  /// The five ways in: key, icon, label and tag.
  static const _options = <(String, IconData, String, String?)>[
    (
      'assistant-scratch',
      Icons.auto_awesome_outlined,
      'START FROM\nSCRATCH',
      null,
    ),
    (
      'assistant-sheet',
      Icons.description_outlined,
      'EXCEL /\nORDER SHEET',
      null,
    ),
    (
      'assistant-notes',
      Icons.photo_camera_outlined,
      'HANDWRITTEN\nNOTES',
      null,
    ),
    ('assistant-artwork', Icons.cloud_upload_outlined, 'UPLOAD\nARTWORK', null),
    ('assistant-team', Icons.groups_outlined, '3DEEZI\nTEAM', 'REAL PEOPLE'),
  ];

  void _optionAction(int i) {
    switch (i) {
      case 0:
        _scratch();
      case 1:
        _addOrderFile();
      case 2:
        _addOrderFile(photo: true);
      case 3:
        _addDesign();
      default:
        _team();
    }
  }

  /// The option whose bubble is flying (hidden in its place meanwhile),
  /// and whether it then fades back in (after flying into the chat box)
  /// or shows at once (after floating back).
  int? _flying;
  bool _fadeBack = false;
  late final AnimationController _fly = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  )..addListener(_flyGlow);
  bool _flyInto = false;
  OverlayEntry? _flyer;
  final _tileKeys = List.generate(5, (_) => GlobalKey());
  final _panelKey = GlobalKey();

  /// How brightly the chat box glows (0-1): a bubble flying or dragged
  /// near it.
  final _panelGlow = ValueNotifier<double>(0);

  void _flyGlow() {
    if (!_flyInto) return;
    final t = _fly.value;
    _panelGlow.value = t < .35 ? t / .35 * .5 : .5 + (t - .35) / .65 * .5;
  }

  /// [k]'s box in [to]'s coordinates (null before it is laid out).
  Rect? _rectOf(GlobalKey k, RenderBox to) {
    final b = k.currentContext?.findRenderObject();
    if (b is! RenderBox || !b.hasSize || !b.attached) return null;
    return MatrixUtils.transformRect(
      b.getTransformTo(to),
      Offset.zero & b.size,
    );
  }

  /// A tap (or a drop at [dropAt], global): the bubble pops and floats into
  /// the chat box, which lights up, then the option runs as it always has.
  /// (Reduced motion: it just runs.)
  Future<void> _launch(int i, {Offset? dropAt}) async {
    if (_flying != null) return;
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final overlay = Overlay.maybeOf(context);
    final ro = overlay?.context.findRenderObject();
    final tile = ro is RenderBox ? _rectOf(_tileKeys[i], ro) : null;
    final panel = ro is RenderBox ? _rectOf(_panelKey, ro) : null;
    if (reduce || overlay == null || tile == null || panel == null) {
      _panelGlow.value = 0;
      _optionAction(i);
      return;
    }
    final from = dropAt == null
        ? tile
        : (ro as RenderBox).globalToLocal(dropAt) & tile.size;
    await _flight(
      overlay,
      i,
      from,
      Rect.fromCenter(
        center: panel.center,
        width: tile.width,
        height: tile.height,
      ),
      into: true,
      ms: dropAt == null ? 420 : 280,
    );
    if (!mounted) return;
    _panelGlow.value = 0;
    _optionAction(i);
  }

  /// A drag let go away from the chat box: the bubble floats back home.
  Future<void> _floatBack(int i, Offset at) async {
    _panelGlow.value = 0;
    final overlay = Overlay.maybeOf(context);
    final ro = overlay?.context.findRenderObject();
    final tile = ro is RenderBox ? _rectOf(_tileKeys[i], ro) : null;
    if ((MediaQuery.maybeDisableAnimationsOf(context) ?? false) ||
        overlay == null ||
        tile == null ||
        _flying != null) {
      return;
    }
    await _flight(
      overlay,
      i,
      (ro as RenderBox).globalToLocal(at) & tile.size,
      tile,
      into: false,
      ms: 320,
    );
  }

  /// While dragging: the chat box glows as the bubble comes near (fully
  /// over it).
  void _dragMove(Offset global) {
    final b = _panelKey.currentContext?.findRenderObject();
    if (b is! RenderBox || !b.attached) return;
    final r = b.localToGlobal(Offset.zero) & b.size;
    final dx = math.max(0.0, math.max(r.left - global.dx, global.dx - r.right));
    final dy = math.max(0.0, math.max(r.top - global.dy, global.dy - r.bottom));
    _panelGlow.value = (1 - math.sqrt(dx * dx + dy * dy) / 140).clamp(0.0, 1.0);
  }

  /// Flies a copy of option [i]'s bubble from [from] to [to] (overlay
  /// coordinates): into the chat box (a little pop, an arc, then smaller
  /// and fading in) or back to its place.
  Future<void> _flight(
    OverlayState overlay,
    int i,
    Rect from,
    Rect to, {
    required bool into,
    required int ms,
  }) async {
    setState(() {
      _flying = i;
      _fadeBack = into;
    });
    _flyInto = into;
    final (_, icon, label, badge) = _options[i];
    final face = _TileFace(
      icon: icon,
      label: label,
      badge: badge,
      radius: math.min(from.height * .44, from.width / 2),
    );
    _flyer?.remove();
    _flyer = OverlayEntry(
      builder: (_) => AnimatedBuilder(
        animation: _fly,
        builder: (context, child) {
          final t = _fly.value;
          final e = Curves.easeInOutCubic.transform(t);
          final at =
              Offset.lerp(from.center, to.center, e)! +
              Offset(0, -math.sin(math.pi * e) * (into ? 34 : 12));
          final scale = into
              ? (t < .2
                    ? 1 + .12 * Curves.easeOut.transform(t / .2)
                    : 1.12 - .74 * Curves.easeIn.transform((t - .2) / .8))
              : 1.06 - .06 * e;
          final fade = into && t > .7 ? 1 - (t - .7) / .3 : 1.0;
          return Positioned.fromRect(
            rect: Rect.fromCenter(
              center: at,
              width: from.width,
              height: from.height,
            ),
            child: IgnorePointer(
              child: Opacity(
                opacity: fade.clamp(0.0, 1.0),
                child: Transform.scale(scale: scale, child: child),
              ),
            ),
          );
        },
        child: Material(type: MaterialType.transparency, child: face),
      ),
    );
    overlay.insert(_flyer!);
    _fly.duration = Duration(milliseconds: ms);
    try {
      await _fly.forward(from: 0).orCancel;
    } on TickerCanceled {
      // (The screen closed mid-flight.)
    }
    _flyer?.remove();
    _flyer = null;
    _flyInto = false;
    if (mounted) setState(() => _flying = null);
  }

  @override
  void dispose() {
    _flyer?.remove();
    _fly.dispose();
    _panelGlow.dispose();
    c.removeListener(_tabChanged);
    AssistController.orderEntry.removeListener(_entry);
    text.dispose();
    focus.dispose();
    scroll.dispose();
    super.dispose();
  }

  Future<void> _load(String token) async {
    try {
      final d = await c.api.orderAssistantGet(token);
      if (mounted) setState(() => data = d);
    } on ApiException catch (e) {
      if (mounted) setState(() => error = e.message);
    }
  }

  Map<String, dynamic> get analysis =>
      ((data?['analysis'] as Map?) ?? const {}).cast<String, dynamic>();
  Map<String, dynamic> get totals =>
      ((analysis['totals'] as Map?) ?? const {}).cast<String, dynamic>();
  int get garments => (totals['garments'] as num?)?.toInt() ?? 0;
  String get title => '${data?['title'] ?? ''}'.trim();

  static const _productNames = {
    'polo': 'Polo',
    'singlet': 'Singlet',
    'hoodie': 'Hoodie',
    'jacket': 'Jacket',
    'warmup': 'Warm-up top',
    'pants': 'Track pants',
    'shorts': 'Shorts',
    'socks': 'Socks',
    'cap': 'Cap',
    'jersey': 'Jersey',
    'tee': 'Tee',
    'other': 'Garment',
  };

  /// The order's title as its PDF and share page show it (the server's
  /// OrderAssist::displayTitle): its own title, else the garments' names,
  /// e.g. "Football jersey order" (QA8 #5).
  String get displayTitle {
    if (title.isNotEmpty) return title;
    final counts =
        ((totals['by_column'] ?? totals['by_garment']) as Map?)?.map(
          (k, v) => MapEntry('$k', (v as num?) ?? 0),
        ) ??
        const <String, num>{};
    final columns = (totals['columns'] as Map?) ?? const {};
    final keys = counts.keys.toList()
      ..sort((x, y) => counts[y]!.compareTo(counts[x]!));
    final names = <String>[];
    for (final column in keys) {
      final garment = column.split('@').first;
      var name = '${columns[column] ?? _productNames[garment] ?? ''}';
      name = name.replaceFirst(RegExp(r'\s*\(.*\)$'), '').trim();
      if (name.isNotEmpty &&
          !names.any((n) => n.toLowerCase() == name.toLowerCase())) {
        names.add(name);
      }
    }
    if (names.isEmpty) return 'Your order';
    if (names.length > 2) {
      return '${names[0]} + ${names.length - 1} more garments';
    }
    final rest = names
        .skip(1)
        .map((n) => n.substring(0, 1).toLowerCase() + n.substring(1));
    return '${[names[0], ...rest].join(' & ')} order';
  }

  bool get _phone =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.android);

  /* ------------------------------------------------------------ actions */

  Future<void> _send({Map<String, String> assign = const {}}) async {
    final message = text.text.trim();
    if (sending) return;
    if (message.isEmpty &&
        orderFiles.isEmpty &&
        designFiles.isEmpty &&
        assign.isEmpty) {
      setState(
        () => error =
            'Type your order, or add your order sheet, notes or artwork first.',
      );
      return;
    }
    final files = [...orderFiles], designs = [...designFiles];
    setState(() {
      sending = true;
      error = null;
      pending = assign.isNotEmpty
          ? null
          : {
              'role': 'user',
              'text': message,
              'files': [
                for (final f in files) {'name': f.name, 'kind': 'order'},
                for (final f in designs) {'name': f.name, 'kind': 'design'},
              ],
            };
      text.clear();
      orderFiles.clear();
      designFiles.clear();
    });
    _toEnd();
    try {
      final d = await c.api.orderAssistant(
        token: data?['token'] as String?,
        message: message,
        files: files,
        designs: designs,
        assign: assign,
        supplierId: data == null ? await _makerId() : null,
        setSupplier: data == null && maker != null,
      );
      if (!mounted) return;
      setState(() {
        data = d;
        pending = null;
      });
      // The answer from its top (the things to check first), as image 4.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final answer = analysisKey.currentContext;
        if (answer != null && answer.mounted) {
          Scrollable.ensureVisible(
            answer,
            duration: const Duration(milliseconds: 300),
            alignment: 0,
          );
        } else {
          _toEnd();
        }
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        error = e.message;
        pending = null;
        // Nothing is lost: the message and files come back to the bar.
        if (assign.isEmpty) {
          text.text = message;
          orderFiles.addAll(files);
          designFiles.addAll(designs);
        }
      });
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  /// "Make with Mantis": the maker's id from the suppliers list.
  Future<int?> _makerId() async {
    final want = maker?.toLowerCase();
    if (want == null) return null;
    try {
      final page = await c.api.suppliers();
      for (final s in Supplier.listOf(page['suppliers'])) {
        if (s.name.toLowerCase() == want) return s.id;
      }
    } on ApiException {
      // 3DEEZI, the default maker.
    }
    return null;
  }

  void _toEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (scroll.hasClients) {
      scroll.animateTo(
        scroll.position.maxScrollExtent + 400,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  });

  Future<void> _addOrderFile({bool photo = false}) async {
    final picked = photo && _phone && pickOrderFileIsDefault
        ? await pickArtwork(context)
        : await pickOrderFile('order_form');
    if (picked == null || !mounted) return;
    if (picked.bytes.length > _maxBytes) {
      showToast(context, '${picked.name} is larger than 25 MB.');
      return;
    }
    setState(() => orderFiles.add((name: picked.name, bytes: picked.bytes)));
  }

  Future<void> _addDesign() async {
    final picked = _phone && pickOrderFileIsDefault
        ? await pickArtwork(context)
        : await pickOrderFile('artwork');
    if (picked == null || !mounted) return;
    final ext = picked.name.split('.').last.toLowerCase();
    if (!const ['png', 'jpg', 'jpeg', 'webp', 'pdf'].contains(ext)) {
      showToast(context, 'Design pictures can be PNG, JPG, WebP or PDF.');
      return;
    }
    if (picked.bytes.length > 15 * 1024 * 1024) {
      showToast(context, '${picked.name} is larger than 15 MB.');
      return;
    }
    setState(() => designFiles.add((name: picked.name, bytes: picked.bytes)));
  }

  void _scratch() {
    if (text.text.trim().isEmpty) {
      text.text = 'I need ';
      text.selection = TextSelection.collapsed(offset: text.text.length);
    }
    focus.requestFocus();
  }

  void _mic() {
    focus.requestFocus();
    showToast(
      context,
      'Tap the microphone on your keyboard and say your order.',
    );
  }

  void _manual() {
    final route = MaterialPageRoute<void>(
      builder: (_) => OrderFormScreen(c, maker: maker),
    );
    // (The Orders tab's page stays under the form; a pushed one gives way.)
    widget.root
        ? Navigator.of(context).push(route)
        : Navigator.of(context).pushReplacement(route);
  }

  /// The "…" menu's Make with 3DEEZI / Mantis: the maker for this order.
  void _makeWith(String? name) {
    setState(() => maker = name);
    showToast(context, 'Making with ${name ?? '3DEEZI'}.');
  }

  void _team() => Navigator.of(
    context,
  ).push(MaterialPageRoute<void>(builder: (_) => TeamScreen(c)));

  /// Edit Order / Review & Approve: the order form with the collated garments.
  void _toForm({required bool review}) {
    if (!c.signedIn) {
      showToast(context, 'Sign in to place your order.');
      c.go(AppScreen.auth);
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => OrderFormScreen(
          c,
          maker: maker ?? _madeBy,
          assistant: {
            'title': title,
            'token': data?['token'],
            'items': analysis['items'] ?? const [],
            // Its design pictures count as the order's artwork (client 2026-11-05).
            'designs': ((data?['designs'] as List?) ?? const []).length,
          },
          review: review,
        ),
      ),
    );
  }

  String? get _madeBy {
    final name = '${(data?['made_by'] as Map?)?['name'] ?? ''}';
    return name.isEmpty || name == '3DEEZI' ? null : name;
  }

  Future<void> _open(String key, String label) async {
    final url = '${(data?['links'] as Map?)?[key] ?? ''}';
    if (url.isEmpty) return;
    await openAssistantLink(context, url, label);
  }

  Future<void> _copyLink() async {
    final url = '${(data?['links'] as Map?)?['page'] ?? ''}';
    await Clipboard.setData(ClipboardData(text: url));
    if (mounted) showToast(context, 'Summary page link copied.');
  }

  /// A design picture's group: the customer's choice.
  Future<void> _assign(Map design) async {
    final groups = ((analysis['groups'] as List?) ?? const [])
        .whereType<Map>()
        .toList();
    final chosen = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Palette.surface,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text(
                'Which design is "${design['name']}"?',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            for (final g in groups)
              ListTile(
                key: ValueKey('assign-${g['key']}'),
                leading: _Swatch(_hex(g['colour'])),
                title: Text('${g['design']}'),
                trailing: design['group'] == g['key']
                    ? const Icon(Icons.check, color: Palette.cyan)
                    : null,
                onTap: () => Navigator.of(context).pop('${g['key']}'),
              ),
            ListTile(
              key: const ValueKey('assign-none'),
              leading: const Icon(Icons.block, color: Palette.muted),
              title: const Text('Not on this order'),
              onTap: () => Navigator.of(context).pop('none'),
            ),
          ],
        ),
      ),
    );
    if (chosen == null || !mounted) return;
    await _send(assign: {'${design['name']}': chosen});
  }

  /* ------------------------------------------------------------ layout */

  @override
  Widget build(BuildContext context) {
    final started = data != null || pending != null;
    return Scaffold(
      backgroundColor: Palette.bg,
      body: Stack(
        children: [
          const Positioned.fill(child: _Backdrop()),
          SafeArea(
            child: Column(
              children: [
                _Header(
                  chat: started,
                  // The Orders tab's page: back from the chat to screen 1,
                  // none on screen 1 (it is the tab's root).
                  onBack: !widget.root
                      ? () => Navigator.of(context).maybePop()
                      : started
                      ? () => setState(() {
                          data = null;
                          pending = null;
                          error = null;
                        })
                      : null,
                  root: widget.root,
                  maker: maker,
                  onMyOrders: () => c.go(AppScreen.orders),
                  onMakeWith: _makeWith,
                  onRewards: () =>
                      showToast(context, '3DEEZI Rewards: coming soon.'),
                  onSuppliers: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => SuppliersScreen(c)),
                  ),
                  onManual: _manual,
                  onNew: started
                      ? () => setState(() {
                          data = null;
                          pending = null;
                          error = null;
                        })
                      : null,
                ),
                Expanded(child: started ? _chat() : _welcome()),
                if (started)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
                    child: _bar(hint: 'Ask 3DEEZI ORDER ASSISTANT…'),
                  )
                else
                  // Screen 1 keeps the app's tab bar, Orders on (image 4).
                  BottomNav(controller: c),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _welcome() => LayoutBuilder(
    builder: (context, box) {
      final w = box.maxWidth.clamp(0.0, 520.0);
      // A short phone (360 × 740 and less): a smaller picture and tiles, so
      // Powered by / Switch to Manual Form stay above the tab bar.
      // (Client 456's inner panel is taller: the whole bubble fits above the
      // tab bar on a 390 × 844 phone.)
      final compact = box.maxHeight < 720;
      tileHeight = compact ? .62 : .8;
      // The picture's full size, and the least it shrinks to (it takes
      // what the rest of the bubble leaves) before the bubble scrolls.
      final hero = (w * .44).clamp(150.0, 220.0);
      final heroMin = compact ? 80.0 : 120.0;
      // The whole bubble always fits above the tab bar (360, 390, a
      // 590 × 700 window …): on a short screen its content scrolls inside
      // it instead of running under the bar. Everything keeps about 14 px
      // clear of the rim's glowing band (the rim line sits [lineIn] in from
      // the bubble's edge, its band about 10 px wide), user 2026-11-06.
      final lineIn = (w - 24) / 2 * .045;
      final side = (lineIn + 24).roundToDouble();
      final inner = w - 24 - side * 2;
      // Home's glass round it all (user 2026-11-06): Home's dome on top and
      // bottom, so it reads as one soft bubble; the picture sits up in the
      // top dome and the prompt panel ends above where the bottom curves in.
      // (A little lower than Home's own dome, .62 of the half-width instead
      // of .7, so the five ways in, the picture and the prompt panel all
      // fit above the tab bar on a 360 × 780 phone.)
      final dome = math.min(
        (w - 24) / 2 * .62,
        (box.maxHeight - 16) / 2 * kDomeH,
      );
      // The picture sits up in the top dome (it keeps its shape, so it is
      // narrower when smaller and clear of the curve)...
      final top = math.max(8.0, dome * .16);
      final gap = compact ? 10.0 : 12.0;
      // ...and the prompt panel (rounder corners) ends where the bottom
      // curve would come within 14 px of the rim's band.
      const panelRadius = 40.0;
      final bottom = bubbleBottomRoom(
        w - 24,
        dome,
        side: side,
        corner: panelRadius,
        clear: 22,
      );
      return Padding(
        key: const ValueKey('assistant-welcome'),
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 6),
        child: Align(
          alignment: Alignment.topCenter,
          child: SizedBox(
            width: w - 24,
            child: _LiveGlass(
              dome: dome,
              // Content scrolled up or down slips under the rim, never over
              // it: clipped to the inside of the rim's band, and faded at
              // the scrolling edges.
              child: ClipPath(
                clipper: _InsideRim(dome: dome, inset: lineIn + 14),
                child: Padding(
                  padding: EdgeInsets.fromLTRB(side, top, side, bottom),
                  // The bubble fills the room down to the tab bar, like
                  // Home's; the picture takes what the rest leaves (up to its
                  // full size). (Short or wide windows: the content scrolls
                  // inside the bubble at its normal size, user 2026-11-06, 468.)
                  child: SizedBox(
                    width: inner,
                    height: math.max(120, box.maxHeight - 10 - top - bottom),
                    child: _ScrollFade(
                      child: BubbleFillScroll(
                        minFlex: (_) => heroMin,
                        children: [
                          Expanded(
                            child: LayoutBuilder(
                              builder: (context, room) {
                                final h = math.min(hero, room.maxHeight);
                                // Never into the curved top: the picture
                                // (its sheet and jersey span about 80 % of
                                // its width) keeps 14 px clear of the rim's
                                // band where the dome narrows.
                                final y =
                                    top + (room.maxHeight - h) * .75 + h * .08;
                                final half = (w - 24) / 2 * .955;
                                final chord = y >= dome
                                    ? half
                                    : half *
                                          math.sqrt(
                                            1 - math.pow((dome - y) / dome, 2),
                                          );
                                return Align(
                                  alignment: const Alignment(0, .5),
                                  child: SizedBox(
                                    width: math.max(
                                      0.0,
                                      math.min(
                                        math.min(inner, h * 1.9),
                                        (chord - 24) / .4,
                                      ),
                                    ),
                                    height: h,
                                    child: const _Hero(),
                                  ),
                                );
                              },
                            ),
                          ),
                          SizedBox(
                            width: inner,
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const SizedBox(height: 4),
                                FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: Text.rich(
                                    key: const ValueKey('assistant-title'),
                                    TextSpan(
                                      children: [
                                        const TextSpan(text: 'CREATE YOUR '),
                                        TextSpan(
                                          text: 'ORDER',
                                          style: TextStyle(
                                            color: Palette.cyan,
                                            shadows: [
                                              Shadow(
                                                color: Palette.cyan.withValues(
                                                  alpha: .6,
                                                ),
                                                blurRadius: 14,
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                    style: const TextStyle(
                                      fontFamily: 'Rajdhani',
                                      fontWeight: FontWeight.w800,
                                      fontStyle: FontStyle.italic,
                                      fontSize: 34,
                                      height: 1.05,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                const Text(
                                  'Tell us what you need, upload your notes, images or existing files. I’ll build your complete order form for you.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 13.5,
                                    height: 1.3,
                                    color: Color(0xffd3dee8),
                                  ),
                                ),
                                SizedBox(height: gap),
                                _tiles(),
                                SizedBox(height: gap),
                                // Client 456: the prompt bar and Powered by / Switch to
                                // Manual Form together in ONE glowing inner glass panel.
                                // Drop an option bubble here; it glows as
                                // one comes near.
                                _DropBox(
                                  key: _panelKey,
                                  glow: _panelGlow,
                                  radius: panelRadius,
                                  canDrop: () => _flying == null,
                                  onDrop: (i, at) => _launch(i, dropAt: at),
                                  child: GlassCard(
                                    key: const ValueKey('assistant-panel'),
                                    radius: panelRadius,
                                    bubbleRim: true,
                                    child: Padding(
                                      // (Slim edges: the panel sits a little
                                      // in from the sides, the text keeps its
                                      // width.)
                                      padding: const EdgeInsets.fromLTRB(
                                        4,
                                        8,
                                        4,
                                        8,
                                      ),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.stretch,
                                        children: [
                                          _bar(
                                            hint:
                                                'e.g. I need 9 polos: 3 × 4XL, 2 × 2XL and 4 × 5XL. Black with our club logo on the chest.',
                                          ),
                                          const SizedBox(height: 10),
                                          Row(
                                            children: [
                                              const Expanded(child: _Powered()),
                                              Container(
                                                width: 14,
                                                height: 1,
                                                margin:
                                                    const EdgeInsets.symmetric(
                                                      horizontal: 6,
                                                    ),
                                                color: Palette.cyan.withValues(
                                                  alpha: .5,
                                                ),
                                              ),
                                              Expanded(
                                                child: _OutlinePill(
                                                  key: const ValueKey(
                                                    'assistant-manual',
                                                  ),
                                                  icon: Icons
                                                      .keyboard_alt_outlined,
                                                  label:
                                                      'Switch to Manual Form',
                                                  onTap: _manual,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                                if (error != null) _errorText(),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    },
  );

  Widget _tiles() => LayoutBuilder(
    builder: (context, box) {
      final gap = 8.0;
      final w = (box.maxWidth - gap * 2) / 3;
      // Each bubble bobs gently on its own phase (in its own layer, so the
      // page around it is not redrawn).
      Widget tile(int i, {double wide = 1}) {
        final (id, icon, label, badge) = _options[i];
        return _Bob(
          index: i,
          child: RepaintBoundary(
            child: SizedBox(
              key: _tileKeys[i],
              width: w * wide,
              height: w * tileHeight,
              child: _Tile(
                id,
                icon,
                label,
                () => _launch(i),
                badge: badge,
                index: i,
                hidden: _flying == i,
                fadeBack: _fadeBack,
                onDragMove: _dragMove,
                onDragCancel: (at) => _floatBack(i, at),
                onDragDone: () {
                  if (_flying == null) _panelGlow.value = 0;
                },
              ),
            ),
          ),
        );
      }

      return RepaintBoundary(
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [for (var i = 0; i < 3; i++) tile(i)],
            ),
            SizedBox(height: gap + 2),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                tile(3, wide: 1.12),
                SizedBox(width: gap * 2),
                tile(4, wide: 1.12),
              ],
            ),
          ],
        ),
      );
    },
  );

  /// The prompt bar: the files to send, the text, then attach, image, mic and send.
  Widget _bar({required String hint}) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      for (final (list, kind) in [
        (orderFiles, 'order'),
        (designFiles, 'design'),
      ])
        for (final f in list)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: _FileChip(
              name: f.name,
              size: f.bytes.length,
              design: kind == 'design',
              onRemove: () => setState(() => list.remove(f)),
            ),
          ),
      DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0xcc071522),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
            color: Palette.cyan.withValues(alpha: .35),
            width: 1.2,
          ),
          boxShadow: [
            BoxShadow(
              color: Palette.cyan.withValues(alpha: .18),
              blurRadius: 16,
            ),
          ],
        ),
        // Client 449: ONE row: sparkle, the text, a thin divider, then
        // paperclip, picture, mic and the round send button.
        child: Padding(
          padding: const EdgeInsets.fromLTRB(10, 6, 6, 6),
          child: Row(
            children: [
              const Padding(
                padding: EdgeInsets.only(right: 6),
                child: Icon(Icons.auto_awesome, color: Palette.cyan, size: 22),
              ),
              Expanded(
                child: TextField(
                  key: const ValueKey('assistant-text'),
                  controller: text,
                  focusNode: focus,
                  minLines: 1,
                  maxLines: 5,
                  textInputAction: TextInputAction.newline,
                  style: const TextStyle(fontSize: 14),
                  decoration: InputDecoration(
                    hintText: hint,
                    hintMaxLines: 5,
                    hintStyle: const TextStyle(
                      color: Color(0xffb7c6d3),
                      fontSize: 11.5,
                      height: 1.35,
                    ),
                    filled: false,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(vertical: 8),
                  ),
                ),
              ),
              Container(
                width: 1,
                height: 40,
                margin: const EdgeInsets.symmetric(horizontal: 4),
                color: Colors.white.withValues(alpha: .25),
              ),
              _BarIcon(
                key: const ValueKey('assistant-attach'),
                icon: Icons.attach_file_rounded,
                label: 'Add your order sheet, notes or a file',
                onTap: () => _addOrderFile(),
              ),
              _BarIcon(
                key: const ValueKey('assistant-image'),
                icon: Icons.image_outlined,
                label: 'Add design pictures',
                onTap: _addDesign,
              ),
              _BarIcon(
                key: const ValueKey('assistant-mic'),
                icon: Icons.mic_none_rounded,
                label: 'Speak your order',
                onTap: _mic,
              ),
              const SizedBox(width: 2),
              Semantics(
                button: true,
                label: 'Send',
                child: InkWell(
                  key: const ValueKey('assistant-send'),
                  customBorder: const CircleBorder(),
                  onTap: sending ? null : () => _send(),
                  child: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        colors: [Color(0xff00e5ff), Color(0xff00a6ff)],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Palette.cyan.withValues(alpha: .5),
                          blurRadius: 14,
                        ),
                      ],
                    ),
                    child: sending
                        ? const Padding(
                            padding: EdgeInsets.all(13),
                            child: CircularProgressIndicator(
                              strokeWidth: 2.4,
                              color: Color(0xff04202c),
                            ),
                          )
                        : const Icon(
                            Icons.send_rounded,
                            color: Color(0xff04202c),
                          ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ],
  );

  Widget _errorText() => Padding(
    padding: const EdgeInsets.only(top: 10),
    child: Text(
      error!,
      key: const ValueKey('assistant-error'),
      textAlign: TextAlign.center,
      style: const TextStyle(color: Color(0xffff8fa3), fontSize: 13),
    ),
  );

  Widget _chat() {
    final messages = [
      ...((data?['messages'] as List?) ?? const []).whereType<Map>(),
      ?pending,
    ];
    final lastAssistant = messages.lastIndexWhere(
      (m) => m['role'] == 'assistant',
    );
    return ListView(
      key: const ValueKey('assistant-chat'),
      controller: scroll,
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 12),
      children: [
        for (final (i, m) in messages.indexed)
          if (m['role'] == 'user')
            _UserBubble(m)
          else if (i == lastAssistant && garments > 0 && !sending)
            _analysisCard(m)
          else
            _AssistantBubble('${m['text'] ?? ''}'),
        if (sending) const _Typing(),
        if (error != null) _errorText(),
        if (garments > 0 && !sending) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _OutlinePill(
                  key: const ValueKey('assistant-edit'),
                  icon: Icons.edit_outlined,
                  label: 'Edit Order',
                  onTap: () => _toForm(review: false),
                  big: true,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  key: const ValueKey('assistant-review'),
                  onPressed: () => _toForm(review: true),
                  style: FilledButton.styleFrom(
                    backgroundColor: Palette.cyan,
                    foregroundColor: const Color(0xff04202c),
                    minimumSize: const Size.fromHeight(46),
                    shape: const StadiumBorder(),
                    textStyle: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  icon: const Icon(Icons.check_rounded),
                  label: const FittedBox(child: Text('Review & Approve')),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  /// Screen 3: the things to check, the summary, the summary page / PDF /
  /// Excel, and the design pictures with their groups.
  Widget _analysisCard(Map message) {
    final all = '${message['text'] ?? ''}';
    final intro = all.split('\n').first;
    final checks = ((analysis['checks'] as List?) ?? const [])
        .whereType<Map>()
        .where((c) => c['type'] != 'spelling')
        .toList();
    final designs = ((data?['designs'] as List?) ?? const [])
        .whereType<Map>()
        .toList();
    final groups = ((analysis['groups'] as List?) ?? const [])
        .whereType<Map>()
        .toList();
    return Padding(
      key: analysisKey,
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _AssistantAvatar(),
          const SizedBox(width: 8),
          Expanded(
            child: _GlowBox(
              key: const ValueKey('assistant-analysis'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '3DEEZI ORDER ASSISTANT',
                    style: TextStyle(
                      fontFamily: 'Rajdhani',
                      fontWeight: FontWeight.w800,
                      fontSize: 17,
                      letterSpacing: .6,
                      color: Palette.cyan,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    checks.isEmpty
                        ? intro
                        : 'I’ve analysed your order and highlighted a few things to check before production:',
                    style: const TextStyle(fontSize: 14, height: 1.35),
                  ),
                  for (final ch in checks.take(8))
                    Padding(
                      padding: const EdgeInsets.only(top: 6, left: 2),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Padding(
                            padding: EdgeInsets.only(top: 6),
                            child: Icon(
                              Icons.circle,
                              size: 7,
                              color: Palette.cyan,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '${ch['text']}',
                              style: const TextStyle(
                                fontSize: 13.5,
                                height: 1.35,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 12),
                  _GlowBox(
                    key: const ValueKey('assistant-summary'),
                    inner: true,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.bar_chart_rounded,
                              color: Palette.cyan,
                              size: 22,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                displayTitle,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 14.5,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '${data?['summary'] ?? ''}',
                          key: const ValueKey('assistant-summary-text'),
                          style: const TextStyle(
                            color: Palette.cyan,
                            fontSize: 13.5,
                            height: 1.35,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            for (final g in groups.take(6))
                              _GroupChip(
                                colour: _hex(g['colour']),
                                text: groupLine(g),
                              ),
                            if (groups.length > 6)
                              _GroupChip(
                                colour: Palette.muted,
                                text: '+${groups.length - 6} more on the page',
                              ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        _LinkRow(
                          key: const ValueKey('assistant-page'),
                          icon: Icons.insert_chart_outlined_rounded,
                          title: displayTitle,
                          sub: 'Page · share it with your team',
                          onTap: () => _open('page', 'Order summary'),
                          trailing: IconButton(
                            key: const ValueKey('assistant-copy-link'),
                            tooltip: 'Copy the link',
                            icon: const Icon(
                              Icons.link_rounded,
                              color: Palette.cyan,
                            ),
                            onPressed: _copyLink,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(
                              child: _SmallButton(
                                key: const ValueKey('assistant-pdf'),
                                icon: Icons.picture_as_pdf_outlined,
                                label: 'PDF order form',
                                onTap: () => _open('pdf', 'PDF order form'),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: _SmallButton(
                                key: const ValueKey('assistant-xlsx'),
                                icon: Icons.table_chart_outlined,
                                label: 'Excel (editable)',
                                onTap: () => _open('xlsx', 'Excel order form'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (designs.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    const Text(
                      'Your designs',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    SizedBox(
                      height: 118,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: designs.length,
                        separatorBuilder: (_, _) => const SizedBox(width: 8),
                        itemBuilder: (context, i) {
                          final d = designs[i];
                          final g = groups
                              .where((g) => g['key'] == d['group'])
                              .firstOrNull;
                          return _DesignThumb(
                            key: ValueKey('assistant-design-$i'),
                            url: '${d['url']}',
                            name: '${d['name']}',
                            group: g == null
                                ? 'Not matched · tap'
                                : '${g['design']}',
                            colour: _hex(g?['colour']),
                            onTap: () => _assign(d),
                          );
                        },
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A summary chip's line: "Football jersey · 5 (M 3, L 2)" (user
/// 2026-11-06: the sizes, not only the count). Men's sizes as written,
/// women's as "10W", kids' as "8Y"; at most 4 sizes, then "…". A group with
/// no sizes read keeps "Football jersey · 5".
String groupLine(Map g) {
  final sizes = <String, int>{};
  for (final row in ((g['garments'] as List?) ?? const []).whereType<Map>()) {
    final sets = (row['sizes'] as Map?) ?? const {};
    for (final fit in const ['mens', 'womens', 'youth']) {
      final set = sets[fit];
      if (set is! Map) continue;
      for (final e in set.entries) {
        final n = (e.value as num?)?.toInt() ?? 0;
        if (n <= 0) continue;
        final size = '${e.key}';
        final label = fit == 'womens' && size.startsWith('W')
            ? '${size.substring(1)}W'
            : size;
        sizes[label] = (sizes[label] ?? 0) + n;
      }
    }
  }
  final line = '${g['design']} · ${g['total']}';
  if (sizes.isEmpty) return line;
  final parts = [for (final e in sizes.entries) '${e.key} ${e.value}'];
  final shown = parts.length > 4
      ? '${parts.take(4).join(', ')}, …'
      : parts.join(', ');
  return '$line ($shown)';
}

Color? _hex(Object? v) {
  final s = '${v ?? ''}'.replaceFirst('#', '');
  if (s.length != 6) return null;
  final n = int.tryParse(s, radix: 16);
  return n == null ? null : Color(0xff000000 | n);
}

/* ---------------------------------------------------------------- parts */

class _Backdrop extends StatelessWidget {
  const _Backdrop();
  @override
  Widget build(BuildContext context) => Stack(
    children: [
      const Positioned.fill(
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(0, -.6),
              radius: 1.15,
              colors: [Color(0xff0b2235), Color(0xff06111b), Color(0xff040a10)],
              stops: [0, .55, 1],
            ),
          ),
        ),
      ),
      // Client 449: a faint large "3D" on the right, behind the bubble.
      Positioned(
        right: -40,
        top: MediaQuery.sizeOf(context).height * .17,
        child: ExcludeSemantics(
          child: Text(
            '3D',
            style: TextStyle(
              fontFamily: 'Rajdhani',
              fontWeight: FontWeight.w900,
              fontStyle: FontStyle.italic,
              fontSize: 220,
              height: 1,
              color: Colors.white.withValues(alpha: .08),
            ),
          ),
        ),
      ),
    ],
  );
}

class _Header extends StatelessWidget {
  const _Header({
    required this.chat,
    required this.onBack,
    this.root = false,
    this.maker,
    this.onMyOrders,
    this.onMakeWith,
    this.onRewards,
    this.onSuppliers,
    required this.onManual,
    this.onNew,
  });
  final bool chat;

  /// The website's Suppliers page (Preferred suppliers).
  final VoidCallback? onSuppliers;
  final VoidCallback? onBack;
  final VoidCallback onManual;
  final bool root;
  final String? maker;
  final VoidCallback? onMyOrders, onRewards;
  final void Function(String? maker)? onMakeWith;
  final VoidCallback? onNew;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(10, 6, 10, 6),
    child: Row(
      children: [
        if (onBack == null)
          const SizedBox(width: 44)
        else
          _CircleButton(
            key: const ValueKey('assistant-back'),
            icon: Icons.chevron_left_rounded,
            label: 'Back',
            onTap: onBack,
          ),
        Expanded(
          child: Column(
            children: [
              const BrandLogo(width: 150),
              const SizedBox(height: 4),
              if (!chat)
                // Client 449: CREATE ORDER FORM in thin, widely spaced capitals.
                const FittedBox(
                  key: ValueKey('assistant-subtitle'),
                  fit: BoxFit.scaleDown,
                  child: Text(
                    'CREATE ORDER FORM',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w300,
                      fontStyle: FontStyle.italic,
                      letterSpacing: 5,
                      color: Colors.white,
                    ),
                  ),
                )
              else
                Container(
                  key: const ValueKey('assistant-pill'),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: Palette.cyan.withValues(alpha: .7),
                    ),
                    color: const Color(0x66062033),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.auto_awesome,
                        size: 15,
                        color: Palette.cyan,
                      ),
                      const SizedBox(width: 6),
                      Flexible(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            'ORDER ASSISTANT',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.2,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        // Client 449: a round "?" opens 3DEEZI Assist.
        _CircleButton(
          key: const ValueKey('assistant-help'),
          icon: Icons.question_mark_rounded,
          label: 'Help: 3DEEZI Assist',
          onTap: () => AssistController.latest?.show(),
        ),
        const SizedBox(width: 8),
        PopupMenuButton<String>(
          key: const ValueKey('assistant-menu'),
          tooltip: 'More',
          color: Palette.surface,
          onSelected: (v) => switch (v) {
            'manual' => onManual(),
            'orders' => onMyOrders?.call(),
            'make-3deezi' => onMakeWith?.call(null),
            'make-mantis' => onMakeWith?.call('Mantis'),
            'rewards' => onRewards?.call(),
            'suppliers' => onSuppliers?.call(),
            _ => onNew?.call(),
          },
          itemBuilder: (_) => [
            // The Orders tab's page (client 454): My orders first, then the
            // preferred suppliers and Rewards (once on the Orders page).
            if (root) ...[
              const PopupMenuItem(
                key: ValueKey('assistant-my-orders'),
                value: 'orders',
                child: ListTile(
                  leading: Icon(Icons.view_kanban_outlined),
                  title: Text('My orders'),
                ),
              ),
              const PopupMenuDivider(),
              PopupMenuItem(
                key: const ValueKey('assistant-make-3deezi'),
                value: 'make-3deezi',
                child: ListTile(
                  leading: const Icon(Icons.checkroom_outlined),
                  title: const Text('Make with 3DEEZI'),
                  trailing: maker == null
                      ? const Icon(Icons.check, color: Palette.cyan)
                      : null,
                ),
              ),
              PopupMenuItem(
                key: const ValueKey('assistant-make-mantis'),
                value: 'make-mantis',
                child: ListTile(
                  leading: const Icon(Icons.checkroom_outlined),
                  title: const Text('Make with Mantis'),
                  trailing: maker == 'Mantis'
                      ? const Icon(Icons.check, color: Palette.cyan)
                      : null,
                ),
              ),
              const PopupMenuItem(
                key: ValueKey('assistant-suppliers'),
                value: 'suppliers',
                child: ListTile(
                  leading: Icon(Icons.storefront_outlined),
                  title: Text('Preferred suppliers'),
                ),
              ),
              const PopupMenuItem(
                key: ValueKey('assistant-rewards'),
                value: 'rewards',
                child: ListTile(
                  leading: Icon(Icons.auto_awesome_outlined),
                  title: Text('Rewards'),
                  subtitle: Text('Coming soon'),
                ),
              ),
              const PopupMenuDivider(),
            ],
            const PopupMenuItem(
              value: 'manual',
              child: Text('Switch to Manual Form'),
            ),
            if (onNew != null)
              const PopupMenuItem(
                value: 'new',
                child: Text('Start a new order'),
              ),
          ],
          child: const _CircleButton(
            icon: Icons.more_horiz_rounded,
            label: 'More',
          ),
        ),
      ],
    ),
  );
}

class _CircleButton extends StatelessWidget {
  const _CircleButton({
    super.key,
    required this.icon,
    required this.label,
    this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: label,
    child: InkWell(
      customBorder: const CircleBorder(),
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: const Color(0x55062033),
          border: Border.all(color: Palette.cyan.withValues(alpha: .45)),
        ),
        child: Icon(icon, color: Colors.white),
      ),
    ),
  );
}

/// The hero: an ORDER FORM sheet and a 3DEEZI jersey over a glowing ring.
class _Hero extends StatelessWidget {
  const _Hero();
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final h = box.maxHeight, w = box.maxWidth;
      return Stack(
        clipBehavior: Clip.none,
        children: [
          // (Clear of the bubble's curved top, user 2026-11-06.)
          Positioned(
            left: w * .1,
            right: w * .1,
            top: h * .62,
            height: h * .3,
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.all(Radius.elliptical(w, h * .3)),
                border: Border.all(
                  color: Palette.cyan.withValues(alpha: .8),
                  width: 2,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Palette.cyan.withValues(alpha: .45),
                    blurRadius: 26,
                    spreadRadius: 2,
                  ),
                ],
              ),
            ),
          ),
          Positioned(
            left: w * .14,
            top: h * .06,
            width: w * .36,
            height: h * .8,
            child: Transform.rotate(angle: -.16, child: const _OrderSheet()),
          ),
          Positioned(
            right: w * .1,
            top: 0,
            width: w * .5,
            height: h * .95,
            child: Image.asset(
              'assets/images/art/bubble_jersey_dyo.webp',
              fit: BoxFit.contain,
              errorBuilder: (_, _, _) => const SizedBox(),
            ),
          ),
        ],
      );
    },
  );
}

/// A white "ORDER FORM" sheet with ticked lines.
class _OrderSheet extends StatelessWidget {
  const _OrderSheet();
  @override
  // Drawn at 130 × 170 and scaled to its place (a short hero shrinks it whole).
  Widget build(BuildContext context) =>
      FittedBox(child: SizedBox(width: 130, height: 170, child: _sheet(1)));

  Widget _sheet(double s) => Builder(
    builder: (context) {
      return Container(
        padding: EdgeInsets.fromLTRB(10 * s, 10 * s, 10 * s, 8 * s),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xfff6fbff), Color(0xffd5e6f4)],
          ),
          borderRadius: BorderRadius.circular(10 * s),
          boxShadow: [
            BoxShadow(
              color: Palette.cyan.withValues(alpha: .35),
              blurRadius: 18,
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            FittedBox(
              child: Text(
                'ORDER\nFORM',
                style: TextStyle(
                  fontFamily: 'Rajdhani',
                  fontWeight: FontWeight.w800,
                  fontSize: 22 * s,
                  height: .95,
                  color: const Color(0xff1d2a3a),
                ),
              ),
            ),
            SizedBox(height: 6 * s),
            for (var i = 0; i < 5; i++)
              Padding(
                padding: EdgeInsets.only(top: 5 * s),
                child: Row(
                  children: [
                    Container(
                      width: 9 * s,
                      height: 9 * s,
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: const Color(0xff4a6a8a),
                          width: 1.2,
                        ),
                        borderRadius: BorderRadius.circular(2),
                      ),
                      child: i < 2
                          ? Icon(
                              Icons.check,
                              size: 8 * s,
                              color: const Color(0xff0a84c8),
                            )
                          : null,
                    ),
                    SizedBox(width: 6 * s),
                    Expanded(
                      child: Container(
                        height: 3.5 * s,
                        color: const Color(0xff8fb4d4),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      );
    },
  );
}

/// Home's glass round the Create your order screen (user 2026-11-06): the
/// same shape, rim, glow and lights as Home, gently alive: it breathes (its
/// edge swells and settles by about 1 %, every 6 s) and a soft light glides
/// round inside the rim (once every 12 s). Only the glass moves: it is
/// painted behind the content in its own layer, so text and buttons never
/// shift. Still with reduced motion, and paused when the screen is hidden.
class _LiveGlass extends StatefulWidget {
  const _LiveGlass({required this.dome, required this.child});
  final double dome;
  final Widget child;

  /// Widget tests keep the glass still, so pumpAndSettle can settle.
  static bool animateInTests = false;

  @override
  State<_LiveGlass> createState() => _LiveGlassState();
}

class _LiveGlassState extends State<_LiveGlass>
    with SingleTickerProviderStateMixin {
  late final AnimationController _t = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 12),
  )..addListener(_tick);

  /// The loop's value as painted: about 30 times a second is plenty for a
  /// motion this slow and small, and halves the work of repainting.
  final _paintAt = ValueNotifier<double>(0);
  Duration _last = Duration.zero;

  void _tick() {
    final now = _t.lastElapsedDuration ?? Duration.zero;
    if ((now - _last).abs() < const Duration(milliseconds: 33)) return;
    _last = now;
    _paintAt.value = _t.value;
  }

  static bool get _underTest =>
      !_LiveGlass.animateInTests &&
      WidgetsBinding.instance.runtimeType.toString().contains('Test');

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final still = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (still || _underTest) {
      _t
        ..stop()
        ..value = 0;
      _paintAt.value = 0;
    } else if (!_t.isAnimating) {
      _last = Duration.zero;
      _t.repeat();
    }
  }

  @override
  void dispose() {
    _t.dispose();
    _paintAt.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    child: CustomPaint(
      key: const ValueKey('assistant-glass'),
      painter: _LiveGlassPainter(_paintAt, widget.dome, _t.isAnimating),
      isComplex: true,
      willChange: _t.isAnimating,
      child: _GlassClock(
        tick: _paintAt,
        moving: _t.isAnimating,
        child: RepaintBoundary(child: widget.child),
      ),
    ),
  );
}

class _LiveGlassPainter extends CustomPainter {
  _LiveGlassPainter(this.t, this.dome, this.moving) : super(repaint: t);
  final ValueListenable<double> t;
  final double dome;

  /// Moving: the light gliding round the rim shows too.
  final bool moving;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final v = t.value;
    // Breathing: twice round per loop (6 s), wider as it gets a touch
    // shorter and back, about 1 % either way.
    final b = math.sin(v * 4 * math.pi);
    final sx = 1 + .009 * b, sy = 1 - .005 * b;
    canvas.save();
    canvas.translate(size.width / 2, size.height / 2);
    canvas.scale(sx, sy);
    canvas.translate(-size.width / 2, -size.height / 2);
    HomeGlassPainter(
      t: (v * 2) % 1,
      dome: dome,
      // The light gliding round the rim, starting at the top left.
      sweep: moving ? (v + .62) % 1 : null,
    ).paint(canvas, size);
    canvas.restore();
  }

  @override
  bool shouldRepaint(_LiveGlassPainter old) =>
      old.t != t || old.dome != dome || old.moving != moving;
}

/// The inside of the Create your order bubble's rim: Home's outline (dome
/// on top and bottom, straight sides) moved [inset] px in at the sides and
/// about 16 px in at the top and bottom, so content scrolled into the rim
/// slips under it instead of drawing over it.
class _InsideRim extends CustomClipper<Path> {
  const _InsideRim({required this.dome, required this.inset});
  final double dome, inset;

  @override
  Path getClip(Size size) {
    final w = size.width, h = size.height;
    final a = math.max(w / 2 - inset, 1.0);
    final ry = math.min(dome, h / 2);
    final dy = math.max(ry - 16, 1.0);
    final cx = w / 2;
    return Path()
      ..moveTo(cx - a, ry)
      ..arcTo(
        Rect.fromCenter(center: Offset(cx, ry), width: a * 2, height: dy * 2),
        math.pi,
        math.pi,
        false,
      )
      ..lineTo(cx + a, h - ry)
      ..arcTo(
        Rect.fromCenter(
          center: Offset(cx, h - ry),
          width: a * 2,
          height: dy * 2,
        ),
        0,
        math.pi,
        false,
      )
      ..close();
  }

  @override
  bool shouldReclip(_InsideRim old) => old.dome != dome || old.inset != inset;
}

/// Softly fades the scrolling content out at an edge with more above or
/// below it (nothing when it all fits).
class _ScrollFade extends StatefulWidget {
  const _ScrollFade({required this.child});
  final Widget child;

  @override
  State<_ScrollFade> createState() => _ScrollFadeState();
}

class _ScrollFadeState extends State<_ScrollFade> {
  bool _up = false, _down = false;

  bool _seen(ScrollMetrics m) {
    final up = m.extentBefore > .5, down = m.extentAfter > .5;
    if (up != _up || down != _down) {
      setState(() {
        _up = up;
        _down = down;
      });
    }
    return false;
  }

  @override
  Widget build(BuildContext context) =>
      NotificationListener<ScrollMetricsNotification>(
        onNotification: (n) => _seen(n.metrics),
        child: NotificationListener<ScrollNotification>(
          onNotification: (n) => _seen(n.metrics),
          // (Always the same tree, so the scroll keeps its place.)
          child: ShaderMask(
            blendMode: BlendMode.dstIn,
            shaderCallback: (r) => LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                if (_up) const Color(0x00ffffff) else Colors.white,
                Colors.white,
                Colors.white,
                if (_down) const Color(0x00ffffff) else Colors.white,
              ],
              stops: [
                0,
                math.min(20 / math.max(r.height, 1), .3),
                1 - math.min(20 / math.max(r.height, 1), .3),
                1,
              ],
            ).createShader(r),
            child: widget.child,
          ),
        ),
      );
}

/// The Create your order glass's slow clock (0-1 over its 12 s loop),
/// shared with the option bubbles so they bob without a clock of their own.
class _GlassClock extends InheritedWidget {
  const _GlassClock({
    required this.tick,
    required this.moving,
    required super.child,
  });
  final ValueListenable<double> tick;
  final bool moving;

  @override
  bool updateShouldNotify(_GlassClock old) =>
      old.tick != tick || old.moving != moving;
}

/// An option bubble's gentle bob: 2 px up and down every 4 s, each on its
/// own phase (still with reduced motion).
class _Bob extends StatelessWidget {
  const _Bob({required this.index, required this.child});
  final int index;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final clock = context.dependOnInheritedWidgetOfExactType<_GlassClock>();
    if (clock == null || !clock.moving) return child;
    return AnimatedBuilder(
      animation: clock.tick,
      child: child,
      builder: (context, child) => Transform.translate(
        // (In half-pixel steps: the bubble only redraws when it has moved.)
        offset: Offset(
          0,
          (math.sin((clock.tick.value * 3 + index * .23) * 2 * math.pi) * 4)
                  .roundToDouble() /
              2,
        ),
        child: child,
      ),
    );
  }
}

/// The chat box as the place to drop an option bubble: it lights up (a
/// brighter rim and glow) as [glow] rises.
class _DropBox extends StatelessWidget {
  const _DropBox({
    super.key,
    required this.glow,
    required this.radius,
    required this.canDrop,
    required this.onDrop,
    required this.child,
  });
  final ValueListenable<double> glow;
  final double radius;
  final bool Function() canDrop;
  final void Function(int option, Offset at) onDrop;
  final Widget child;

  @override
  Widget build(BuildContext context) => DragTarget<int>(
    onWillAcceptWithDetails: (_) => canDrop(),
    onAcceptWithDetails: (d) => onDrop(d.data, d.offset),
    builder: (context, _, _) => ValueListenableBuilder<double>(
      valueListenable: glow,
      child: child,
      builder: (context, g, child) => CustomPaint(
        foregroundPainter: _DropGlow(g, radius),
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(radius),
            boxShadow: [
              if (g > 0)
                BoxShadow(
                  color: Palette.cyan.withValues(alpha: .65 * g),
                  blurRadius: 26 * g,
                  spreadRadius: 1,
                ),
            ],
          ),
          child: child,
        ),
      ),
    ),
  );
}

class _DropGlow extends CustomPainter {
  const _DropGlow(this.g, this.radius);
  final double g, radius;

  @override
  void paint(Canvas canvas, Size size) {
    if (g <= 0 || size.isEmpty) return;
    final r = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(math.min(radius, size.shortestSide / 2)),
    );
    // A brighter glow inside the rim, and a bright rim line.
    canvas.save();
    canvas.clipRRect(r);
    canvas.drawRRect(
      r,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 16
        ..color = const Color(0xff5fe2ff).withValues(alpha: .75 * g)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );
    canvas.restore();
    canvas.drawRRect(
      r.deflate(1),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..color = const Color(0xffe6fbff).withValues(alpha: g),
    );
  }

  @override
  bool shouldRepaint(_DropGlow old) => old.g != g || old.radius != radius;
}

/// An option bubble's look: a glass bubble like the tab bar's (light blue
/// glass, glassy rim, soft inner glow, gloss along the top), nearly a
/// capsule, with its icon, label and tag (user 2026-11-06). [onTap] and
/// [capsuleKey] on the real one; none on the copy that flies or is dragged.
class _TileFace extends StatelessWidget {
  const _TileFace({
    required this.icon,
    required this.label,
    required this.radius,
    this.badge,
    this.onTap,
    this.capsuleKey,
  });
  final IconData icon;
  final String label;
  final String? badge;
  final double radius;
  final VoidCallback? onTap;
  final Key? capsuleKey;

  @override
  Widget build(BuildContext context) => Stack(
    clipBehavior: Clip.none,
    children: [
      Positioned.fill(
        child: GlassCapsule(
          key: capsuleKey,
          radius: radius,
          child: Material(
            type: MaterialType.transparency,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(radius),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onTap,
              child: Padding(
                // Clear of the round ends.
                padding: EdgeInsets.fromLTRB(radius * .3, 8, radius * .3, 7),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        icon,
                        color: const Color(0xff7fe6ff),
                        size: 28,
                        shadows: [
                          Shadow(
                            color: Palette.cyan.withValues(alpha: .8),
                            blurRadius: 10,
                          ),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                        label,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontFamily: 'Rajdhani',
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                          height: 1.05,
                          color: Colors.white,
                          shadows: [
                            Shadow(color: Color(0xcc000814), blurRadius: 4),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      if (badge != null)
        Positioned(
          top: -9,
          left: 0,
          right: 0,
          child: Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xff8b3dff),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                badge!,
                style: const TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: .6,
                ),
              ),
            ),
          ),
        ),
    ],
  );
}

/// One of the five ways in. A tap runs it (after it floats into the chat
/// box); a long press picks it up to drag onto the chat box instead (a
/// quick swipe still scrolls the page). Hidden in its place while its copy
/// flies.
class _Tile extends StatelessWidget {
  const _Tile(
    this.id,
    this.icon,
    this.label,
    this.onTap, {
    this.badge,
    this.index = 0,
    this.hidden = false,
    this.fadeBack = false,
    this.onDragMove,
    this.onDragCancel,
    this.onDragDone,
  });
  final String id;
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final String? badge;
  final int index;
  final bool hidden, fadeBack;
  final void Function(Offset global)? onDragMove;
  final void Function(Offset at)? onDragCancel;
  final VoidCallback? onDragDone;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final radius = math.min(box.maxHeight * .44, box.maxWidth / 2);
      final copy = _TileFace(
        icon: icon,
        label: label,
        badge: badge,
        radius: radius,
      );
      return AnimatedOpacity(
        opacity: hidden ? 0 : 1,
        // (Back at once after floating home; a soft return after flying
        // into the chat box.)
        duration: Duration(milliseconds: hidden || !fadeBack ? 0 : 220),
        child: LongPressDraggable<int>(
          data: index,
          delay: const Duration(milliseconds: 300),
          feedback: Material(
            type: MaterialType.transparency,
            child: Transform.scale(
              scale: 1.08,
              child: SizedBox(
                width: box.maxWidth,
                height: box.maxHeight,
                child: copy,
              ),
            ),
          ),
          childWhenDragging: Opacity(opacity: .25, child: copy),
          onDragUpdate: (d) => onDragMove?.call(d.globalPosition),
          onDraggableCanceled: (_, at) => onDragCancel?.call(at),
          onDragEnd: (_) => onDragDone?.call(),
          child: Semantics(
            button: true,
            label: label.replaceAll('\n', ' '),
            excludeSemantics: true,
            onTap: onTap,
            child: _TileFace(
              capsuleKey: ValueKey(id),
              icon: icon,
              label: label,
              badge: badge,
              radius: radius,
              onTap: onTap,
            ),
          ),
        ),
      );
    },
  );
}

class _Powered extends StatelessWidget {
  const _Powered();
  @override
  Widget build(BuildContext context) => Container(
    height: 40,
    padding: const EdgeInsets.symmetric(horizontal: 10),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: Palette.cyan.withValues(alpha: .45)),
    ),
    child: const FittedBox(
      fit: BoxFit.scaleDown,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.bolt_rounded, size: 18, color: Colors.white),
          SizedBox(width: 6),
          Text('Powered by ', style: TextStyle(fontSize: 13)),
          Text(
            '3DEEZI AI',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w900,
              fontStyle: FontStyle.italic,
              color: Palette.cyan,
            ),
          ),
        ],
      ),
    ),
  );
}

class _OutlinePill extends StatelessWidget {
  const _OutlinePill({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.big = false,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool big;
  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
    onPressed: onTap,
    style: OutlinedButton.styleFrom(
      foregroundColor: Colors.white,
      minimumSize: Size.fromHeight(big ? 46 : 40),
      padding: const EdgeInsets.symmetric(horizontal: 10),
      side: BorderSide(color: Colors.white.withValues(alpha: big ? .8 : .45)),
      shape: const StadiumBorder(),
    ),
    icon: Icon(icon, size: 18),
    label: FittedBox(
      fit: BoxFit.scaleDown,
      child: Text(label, style: TextStyle(fontSize: big ? 15 : 13)),
    ),
  );
}

class _FileChip extends StatelessWidget {
  const _FileChip({
    required this.name,
    required this.size,
    required this.design,
    required this.onRemove,
  });
  final String name;
  final int size;
  final bool design;
  final VoidCallback onRemove;
  @override
  Widget build(BuildContext context) {
    final mb = size >= 1024 * 1024
        ? '${(size / 1024 / 1024).toStringAsFixed(1)} MB'
        : '${(size / 1024).ceil()} KB';
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 6, 4, 6),
      decoration: BoxDecoration(
        color: const Color(0xcc0b1a28),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Palette.cyan.withValues(alpha: .35)),
      ),
      child: Row(
        children: [
          Icon(
            design ? Icons.image_outlined : Icons.description_outlined,
            color: Palette.cyan,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                Text(
                  '${design ? 'Design picture' : 'Order file'} · $mb',
                  style: const TextStyle(fontSize: 12, color: Palette.muted),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Remove $name',
            onPressed: onRemove,
            icon: const Icon(Icons.close_rounded),
          ),
        ],
      ),
    );
  }
}

class _UserBubble extends StatelessWidget {
  const _UserBubble(this.m);
  final Map m;
  @override
  Widget build(BuildContext context) {
    final files = ((m['files'] as List?) ?? const []).whereType<Map>().toList();
    final text = '${m['text'] ?? ''}'.trim();
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xff123a5c),
              border: Border.all(color: Palette.cyan.withValues(alpha: .4)),
            ),
            child: const Icon(Icons.person_rounded, color: Color(0xff9fd4ff)),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (text.isNotEmpty)
                  _GlowBox(
                    child: Text(
                      text,
                      style: const TextStyle(fontSize: 15, height: 1.35),
                    ),
                  ),
                for (final f in files)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: _GlowBox(
                      child: Row(
                        children: [
                          Icon(
                            f['kind'] == 'design'
                                ? Icons.image_outlined
                                : Icons.description_outlined,
                            color: Palette.cyan,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              '${f['name']}',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AssistantAvatar extends StatelessWidget {
  const _AssistantAvatar();
  @override
  Widget build(BuildContext context) => Container(
    width: 36,
    height: 36,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: const Color(0xff062033),
      border: Border.all(color: Palette.cyan.withValues(alpha: .7)),
    ),
    child: const Icon(Icons.auto_awesome, size: 19, color: Palette.cyan),
  );
}

class _AssistantBubble extends StatelessWidget {
  const _AssistantBubble(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 10),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _AssistantAvatar(),
        const SizedBox(width: 8),
        Expanded(
          child: _GlowBox(
            child: Text(
              text,
              style: const TextStyle(fontSize: 14.5, height: 1.4),
            ),
          ),
        ),
      ],
    ),
  );
}

class _Typing extends StatelessWidget {
  const _Typing();
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 10, left: 44),
    child: Row(
      children: [
        Container(
          key: const ValueKey('assistant-typing'),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: const Color(0xcc0b1a28),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Palette.cyan.withValues(alpha: .4)),
          ),
          child: Row(
            children: [
              for (var i = 0; i < 3; i++)
                Container(
                  width: 9,
                  height: 9,
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: Palette.cyan,
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        const Flexible(
          child: Text(
            'Reading your order…',
            style: TextStyle(color: Palette.muted, fontSize: 13),
          ),
        ),
      ],
    ),
  );
}

class _GlowBox extends StatelessWidget {
  const _GlowBox({super.key, required this.child, this.inner = false});
  final Widget child;
  final bool inner;
  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.all(inner ? 12 : 14),
    decoration: BoxDecoration(
      color: inner ? const Color(0xcc071827) : const Color(0xcc0b1a28),
      borderRadius: BorderRadius.circular(inner ? 14 : 18),
      border: Border.all(
        color: Palette.cyan.withValues(alpha: inner ? .55 : .35),
      ),
      boxShadow: [
        BoxShadow(color: Palette.cyan.withValues(alpha: .12), blurRadius: 14),
      ],
    ),
    child: child,
  );
}

class _GroupChip extends StatelessWidget {
  const _GroupChip({required this.colour, required this.text});
  final Color? colour;
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(6, 3, 8, 3),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(12),
      color: const Color(0x33000000),
      border: Border.all(color: Colors.white.withValues(alpha: .15)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _Swatch(colour, size: 10),
        const SizedBox(width: 5),
        Flexible(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12),
          ),
        ),
      ],
    ),
  );
}

class _Swatch extends StatelessWidget {
  const _Swatch(this.colour, {this.size = 18});
  final Color? colour;
  final double size;
  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: colour ?? const Color(0xff2f6fd6),
      border: Border.all(color: Colors.white.withValues(alpha: .5)),
    ),
  );
}

class _LinkRow extends StatelessWidget {
  const _LinkRow({
    super.key,
    required this.icon,
    required this.title,
    required this.sub,
    required this.onTap,
    this.trailing,
  });
  final IconData icon;
  final String title, sub;
  final VoidCallback onTap;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Material(
    color: const Color(0x33000000),
    borderRadius: BorderRadius.circular(12),
    child: InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 52),
        padding: const EdgeInsets.fromLTRB(10, 6, 2, 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white.withValues(alpha: .2)),
        ),
        child: Row(
          children: [
            Icon(icon, color: Palette.cyan, size: 26),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13.5,
                    ),
                  ),
                  Text(
                    sub,
                    style: const TextStyle(fontSize: 12, color: Palette.muted),
                  ),
                ],
              ),
            ),
            ?trailing,
          ],
        ),
      ),
    ),
  );
}

class _SmallButton extends StatelessWidget {
  const _SmallButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
    onPressed: onTap,
    style: OutlinedButton.styleFrom(
      foregroundColor: Colors.white,
      minimumSize: const Size.fromHeight(44),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      side: BorderSide(color: Palette.cyan.withValues(alpha: .5)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    icon: Icon(icon, size: 18, color: Palette.cyan),
    label: FittedBox(fit: BoxFit.scaleDown, child: Text(label)),
  );
}

class _DesignThumb extends StatelessWidget {
  const _DesignThumb({
    super.key,
    required this.url,
    required this.name,
    required this.group,
    required this.colour,
    required this.onTap,
  });
  final String url, name, group;
  final Color? colour;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: '$name: $group. Change its design.',
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: 104,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: (colour ?? Palette.cyan).withValues(alpha: .8),
            width: 1.4,
          ),
          color: const Color(0x33000000),
        ),
        child: Column(
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(11),
                ),
                child: name.toLowerCase().endsWith('.pdf')
                    ? const Center(
                        child: Icon(
                          Icons.picture_as_pdf_outlined,
                          color: Palette.cyan,
                          size: 32,
                        ),
                      )
                    : Image.network(
                        url,
                        fit: BoxFit.cover,
                        width: double.infinity,
                        errorBuilder: (_, _, _) => const Center(
                          child: Icon(
                            Icons.image_outlined,
                            color: Palette.muted,
                          ),
                        ),
                      ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(6, 4, 6, 5),
              child: Text(
                group,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 11, height: 1.15),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// A plain icon in the one-row prompt bar (client 449).
class _BarIcon extends StatelessWidget {
  const _BarIcon({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: label,
    child: InkResponse(
      onTap: onTap,
      radius: 20,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
        child: Icon(icon, size: 21, color: Colors.white),
      ),
    ),
  );
}
