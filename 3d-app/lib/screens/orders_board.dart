import 'package:flutter/material.dart';

import '../api_client.dart';
import '../app_controller.dart';
import '../export_service.dart' show shareImage;
import '../order_sizes.dart';
import '../widgets/notification_bell.dart';
import '../widgets/site_page_stub.dart'
    if (dart.library.js_interop) '../widgets/site_page_web.dart'
    if (dart.library.io) '../widgets/site_page_io.dart';
import '../widgets/bubble_page.dart';
import '../widgets/glass_bubble.dart';
import '../widgets/ui.dart';
import 'order_entry.dart';
import 'suppliers.dart' show madeByOf;

// 3DEEZI Orders in the app (the website's /orders and its API, orders-api.md):
// my orders by stage on phones (stage tabs), each order's garments, files,
// design proofs to approve, updates and tracking, and the notifications.
// New orders are made on the website's order pages, opened signed in.

const _tones = {
  'blue': Color(0xff3b8cff),
  'amber': Color(0xffffb648),
  'violet': Color(0xff9a6bff),
  'green': Color(0xff3ddc84),
  'red': Color(0xfff16482),
  'grey': Palette.muted,
};
Color _tone(Object? name) => _tones['$name'] ?? Palette.muted;

String _day(Object? iso) {
  final d = DateTime.tryParse('${iso ?? ''}')?.toLocal();
  return d == null ? '' : '${d.day}/${d.month}/${d.year}';
}

/// A picture sent as a data URL (garment thumbnails, file previews), else null.
Widget? _dataImage(Object? url, double size) {
  final text = '${url ?? ''}';
  // A stored picture's address (a kit picture saved as a file) loads from the site.
  if (text.startsWith('https://') || text.startsWith('http://')) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Image.network(
        text,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => SizedBox(width: size, height: size),
      ),
    );
  }
  if (!text.startsWith('data:image/')) return null;
  try {
    final bytes = UriData.parse(text).contentAsBytes();
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Image.memory(
        bytes,
        width: size,
        height: size,
        fit: BoxFit.cover,
        gaplessPlayback: true,
      ),
    );
  } on Object {
    return null;
  }
}

/// A JSON object, or empty: PHP sends an empty array as `[]`, not `{}` (sizes of an uploaded order form, a new order's
/// stages).
Map<String, dynamic> _mapOf(Object? value) =>
    value is Map ? value.cast<String, dynamic>() : const {};

Widget _pill(String text, Color colour) => Container(
  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
  decoration: BoxDecoration(
    borderRadius: BorderRadius.circular(20),
    color: colour.withValues(alpha: .14),
    border: Border.all(color: colour.withValues(alpha: .6)),
  ),
  child: Text(
    text,
    style: TextStyle(color: colour, fontSize: 11, fontWeight: FontWeight.w700),
  ),
);

Future<void> _openSite(
  BuildContext context,
  AppController c,
  String path,
  String title,
) => openSitePage(context, c.api.sitePage(path), title);

/// My orders by stage: tabs for the five stages (current or completed orders).
class OrdersBoardScreen extends StatefulWidget {
  const OrdersBoardScreen(this.c, {super.key});
  final AppController c;
  @override
  State<OrdersBoardScreen> createState() => _OrdersBoardScreenState();
}

class _OrdersBoardScreenState extends State<OrdersBoardScreen> {
  Map<String, dynamic>? _board;
  String _view = 'current';
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.c.signedIn) _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final board = await widget.c.api.ordersBoard(view: _view);
      // The bell's shared list (also polled once a minute by the app).
      await NotificationFeed.of(widget.c).refresh();
      if (!mounted) return;
      setState(() => _board = board);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _stages =>
      ((_board?['stages'] as List?) ?? const []).cast<Map<String, dynamic>>();

  Future<void> _openOrder(int id) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(widget.c, id)),
    );
    if (mounted) _load();
  }

  /// The native Create Order Form / Upload Your Order (each can still open the website's page).
  Future<void> _openEntry(Widget screen) async {
    await Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => screen));
    if (mounted) _load();
  }

  /// The search box's text (reference, name or garment) and the filter
  /// (client picture images/339): All / Action needed / In progress / Completed.
  final _search = TextEditingController();
  String _filter = 'all';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  /// The customer has something to do: approve a design or pay an invoice.
  static bool _needsYou(Map<String, dynamic> o) =>
      o['action'] == 'review_design' ||
      ((o['payment'] as Map?)?['payable'] == true);

  Future<void> _newOrder() async {
    final c = widget.c;
    final which = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Palette.surface,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.edit_note, color: Palette.cyan),
              title: const Text('Create order'),
              subtitle: const Text('Build your order step by step'),
              onTap: () => Navigator.pop(sheet, 'form'),
            ),
            ListTile(
              leading: const Icon(Icons.upload_file, color: Palette.cyan),
              title: const Text('Upload order'),
              subtitle: const Text('Already have your order sheet'),
              onTap: () => Navigator.pop(sheet, 'upload'),
            ),
          ],
        ),
      ),
    );
    if (which == 'form') await _openEntry(OrderFormScreen(c));
    if (which == 'upload') await _openEntry(OrderUploadScreen(c));
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    final q = _search.text.trim().toLowerCase();
    // Every order of the board, newest stages first, then the cancelled ones (Completed only).
    final all = <Map<String, dynamic>>[
      for (final s in _stages.reversed)
        ...((s['orders'] as List?) ?? const []).cast<Map<String, dynamic>>(),
      if (_view == 'completed')
        ...((_board?['cancelled'] as List?) ?? const [])
            .cast<Map<String, dynamic>>(),
    ];
    final orders = all.where((o) {
      final matches =
          q.isEmpty ||
          '${o['number']} ${o['name']} ${((o['garments'] as List?) ?? const []).map((g) => (g as Map)['name']).join(' ')}'
              .toLowerCase()
              .contains(q);
      final kept = switch (_filter) {
        'action' => _needsYou(o),
        'progress' => o['stage'] == 'design' || o['stage'] == 'production',
        _ => true,
      };
      return matches && kept;
    }).toList();
    final drafts = ((_board?['drafts'] as List?) ?? const [])
        .cast<Map<String, dynamic>>();
    return BubblePage(
      c: c,
      title: 'MY ORDERS',
      subtitle: 'Your orders, all in one place.',
      bubbleKey: const ValueKey('my-orders-bubble'),
      // (Closing the bell's sheet reloads the board: an order may have changed.)
      onBellClosed: _load,
      leading: BubbleCornerPill(
        key: const ValueKey('my-orders-back'),
        icon: Icons.arrow_back,
        label: 'Back',
        onTap: c.back,
      ),
      child: !c.signedIn
          ? _Message(
              'Sign in to order kits and follow them here.',
              action: 'SIGN IN',
              onAction: () => c.go(AppScreen.auth),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  height: 42,
                  child: TextField(
                    key: const ValueKey('my-orders-search'),
                    controller: _search,
                    onChanged: (_) => setState(() {}),
                    style: const TextStyle(fontSize: 14),
                    decoration: InputDecoration(
                      hintText: 'Search orders',
                      prefixIcon: const Icon(Icons.search, size: 20),
                      isDense: true,
                      filled: true,
                      fillColor: const Color(0x99061528),
                      contentPadding: const EdgeInsets.symmetric(vertical: 10),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(22),
                        borderSide: BorderSide(
                          color: Palette.cyan.withValues(alpha: .35),
                        ),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(22),
                        borderSide: BorderSide(
                          color: Palette.cyan.withValues(alpha: .35),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final (key, label) in const [
                        ('all', 'All'),
                        ('action', 'Action needed'),
                        ('progress', 'In progress'),
                        ('completed', 'Completed'),
                      ])
                        Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: _FilterChip(
                            key: ValueKey('my-orders-filter-$key'),
                            label: label,
                            selected: key == 'completed'
                                ? _view == 'completed'
                                : _view == 'current' && _filter == key,
                            onTap: () {
                              final view = key == 'completed'
                                  ? 'completed'
                                  : 'current';
                              final changed = view != _view;
                              setState(() {
                                _filter = key == 'completed' ? 'all' : key;
                                _view = view;
                              });
                              if (changed) _load();
                            },
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                Expanded(
                  child: _loading && _board == null
                      ? const Center(child: CircularProgressIndicator())
                      : _error != null && _board == null
                      ? _Message(_error!, action: 'TRY AGAIN', onAction: _load)
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView(
                            padding: const EdgeInsets.fromLTRB(2, 2, 2, 10),
                            children: [
                              if (_view == 'current' && q.isEmpty)
                                for (final d in drafts)
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 10),
                                    child: GlassCard(
                                      radius: 18,
                                      onTap: () => _openSite(
                                        context,
                                        c,
                                        '${d['link']}',
                                        'Continue your draft',
                                      ),
                                      child: Padding(
                                        padding: const EdgeInsets.all(12),
                                        child: Row(
                                          children: [
                                            const Icon(
                                              Icons.drafts_outlined,
                                              color: Palette.muted,
                                            ),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: Text(
                                                'Draft, not submitted: ${d['title'] ?? (d['kind'] == 'upload' ? 'uploaded order' : 'order form')}',
                                                style: const TextStyle(
                                                  fontSize: 13,
                                                ),
                                              ),
                                            ),
                                            const Text(
                                              'Continue',
                                              style: TextStyle(
                                                color: Palette.cyan,
                                                fontSize: 12,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                              if (orders.isEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 40),
                                  child: Text(
                                    q.isNotEmpty
                                        ? 'No orders match "${_search.text.trim()}".'
                                        : _view == 'completed'
                                        ? 'No completed orders yet.'
                                        : 'No orders here yet.',
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      color: Palette.muted,
                                    ),
                                  ),
                                ),
                              for (final o in orders)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 12),
                                  child: OrderBoardCard(
                                    o,
                                    onTap: () =>
                                        _openOrder((o['id'] as num).toInt()),
                                  ),
                                ),
                            ],
                          ),
                        ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 48,
                  child: FilledButton.icon(
                    key: const ValueKey('my-orders-new'),
                    onPressed: _newOrder,
                    style: FilledButton.styleFrom(
                      backgroundColor: Palette.cyan,
                      foregroundColor: const Color(0xff04121f),
                      shape: const StadiumBorder(),
                      textStyle: const TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    icon: const Icon(Icons.add, size: 22),
                    label: const Text('New order'),
                  ),
                ),
              ],
            ),
    );
  }
}

/// A filter pill (All / Action needed / In progress / Completed).
class _FilterChip extends StatelessWidget {
  const _FilterChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    selected: selected,
    button: true,
    child: Material(
      color: selected ? const Color(0xff0f5d8a) : const Color(0x99061528),
      shape: StadiumBorder(
        side: BorderSide(
          color: selected ? Palette.cyan : Palette.cyan.withValues(alpha: .3),
          width: selected ? 1.5 : 1,
        ),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: selected ? Colors.white : const Color(0xffb9c5cf),
            ),
          ),
        ),
      ),
    ),
  );
}

/// Print > Cut > Sew (client picture images/339): where a production order is.
class _MakingLine extends StatelessWidget {
  const _MakingLine(this.step);
  final String step;

  static const _steps = [
    ('printing', 'Print'),
    ('cutting', 'Cut'),
    ('sewing', 'Sew'),
  ];

  @override
  Widget build(BuildContext context) {
    final at = _steps.indexWhere((s) => s.$1 == step);
    final done = const ['quality_check', 'packing'].contains(step)
        ? _steps.length
        : at;
    Widget dot(int i) => Container(
      width: 11,
      height: 11,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: i < done ? Palette.cyan : Colors.transparent,
        border: Border.all(
          color: i <= at || i < done ? Palette.cyan : const Color(0xff3d6585),
          width: 2,
        ),
        boxShadow: i == at
            ? [
                BoxShadow(
                  color: Palette.cyan.withValues(alpha: .7),
                  blurRadius: 8,
                ),
              ]
            : null,
      ),
    );
    return Semantics(
      label:
          'Production: ${at >= 0
              ? _steps[at].$2
              : done >= _steps.length
              ? 'sewn'
              : 'starting'}',
      excludeSemantics: true,
      child: Row(
        key: const ValueKey('order-making-line'),
        children: [
          for (var i = 0; i < _steps.length; i++) ...[
            if (i > 0)
              Expanded(
                child: Container(
                  height: 2,
                  margin: const EdgeInsets.symmetric(horizontal: 6),
                  color: i <= done || i <= at
                      ? Palette.cyan
                      : const Color(0xff24425c),
                ),
              ),
            dot(i),
            const SizedBox(width: 5),
            Text(
              _steps[i].$2,
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                color: i == at
                    ? Colors.white
                    : i < done
                    ? const Color(0xff9fe8ff)
                    : const Color(0xff7f93a6),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// One order as a glass card (client picture images/339): its picture, the
/// reference and name, the status badge, the pieces, its action (Review order /
/// Continue to payment / View progress) and, in production, Print > Cut > Sew.
class OrderBoardCard extends StatelessWidget {
  const OrderBoardCard(this.o, {super.key, this.onTap});
  final Map<String, dynamic> o;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final sub = (o['sub_status'] as Map?)?.cast<String, dynamic>() ?? const {};
    final garments = ((o['garments'] as List?) ?? const [])
        .cast<Map<String, dynamic>>();
    final latest = (o['latest_update'] as Map?)?.cast<String, dynamic>();
    final payment = (o['payment'] as Map?)?.cast<String, dynamic>();
    final action = o['action'];
    final pay = payment?['payable'] == true;
    final picture =
        garments
            .map((g) => _dataImage(g['thumbnail'], 64))
            .whereType<Widget>()
            .firstOrNull ??
        _dataImage(o['cover'], 64) ??
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: const Color(0xff0b1d33),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(
            garments.isEmpty ? Icons.description_outlined : Icons.checkroom,
            color: Palette.muted,
            size: 30,
          ),
        );
    final pieces = (o['quantity'] as num? ?? 0).toInt();
    return GlassCard(
      radius: 20,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: picture,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${o['number']}',
                        style: const TextStyle(
                          color: Palette.muted,
                          fontSize: 12,
                        ),
                      ),
                      Text(
                        '${o['name']}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          _pill(
                            '${sub['label'] ?? o['stage_label']}',
                            _tone(sub['tone']),
                          ),
                          if (payment != null)
                            _pill(
                              '${payment['label'] ?? payment['status']}',
                              _tone(payment['tone']),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${pieces > 0 ? '$pieces piece${pieces == 1 ? '' : 's'}' : 'Sizes in your order form'}${'${o['needed_by'] ?? ''}'.isNotEmpty && o['completed'] != true ? ' · required ${_day(o['needed_by'])}' : ''}',
              style: const TextStyle(fontSize: 12.5),
            ),
            // Who makes it, when that is one of the preferred suppliers (3DEEZI makes the others).
            if (madeByOf(o) case final maker?) ...[
              const SizedBox(height: 6),
              _MadeBy(maker),
            ],
            if (o['stage'] == 'production') ...[
              const SizedBox(height: 10),
              _MakingLine('${sub['key'] ?? ''}'),
            ],
            if (latest != null) ...[
              const SizedBox(height: 8),
              Text(
                '${latest['text']}${latest['message'] != null && latest['message'] != latest['text'] ? ': ${latest['message']}' : ''}',
                style: const TextStyle(color: Palette.muted, fontSize: 12),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Submitted ${_day(o['submitted_at'])}',
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Palette.muted, fontSize: 11),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    color: action == 'review_design' || pay
                        ? Palette.cyan
                        : Colors.transparent,
                    border: Border.all(color: Palette.cyan),
                  ),
                  child: Text(
                    action == 'review_design'
                        ? 'Review order →'
                        : pay
                        ? 'Continue to payment →'
                        : action == 'track_delivery'
                        ? 'Track delivery →'
                        : 'View progress →',
                    style: TextStyle(
                      color: action == 'review_design' || pay
                          ? const Color(0xff04121f)
                          : Palette.cyan,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// "Made by Mantis" (preferred suppliers), on an order's card and page.
class _MadeBy extends StatelessWidget {
  const _MadeBy(this.maker);
  final String maker;
  @override
  Widget build(BuildContext context) => Row(
    key: const Key('order-made-by'),
    children: [
      const Icon(Icons.factory_outlined, size: 15, color: Palette.cyan),
      const SizedBox(width: 6),
      Expanded(
        child: Text(
          'Made by $maker',
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12.5),
        ),
      ),
    ],
  );
}

class _GarmentChip extends StatelessWidget {
  const _GarmentChip(this.name);
  final String name;
  @override
  Widget build(BuildContext context) => Container(
    width: 52,
    height: 52,
    alignment: Alignment.center,
    padding: const EdgeInsets.all(4),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(8),
      color: Palette.surface2,
      border: Border.all(color: Palette.border),
    ),
    child: Text(
      name,
      textAlign: TextAlign.center,
      maxLines: 2,
      style: const TextStyle(fontSize: 9.5, color: Palette.text),
    ),
  );
}

class _Message extends StatelessWidget {
  const _Message(this.text, {required this.action, required this.onAction});
  final String text, action;
  final VoidCallback onAction;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.inventory_2_outlined, size: 42, color: Palette.cyan),
          const SizedBox(height: 12),
          Text(
            text,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Palette.muted),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: 220,
            child: GradientButton(
              label: action,
              compact: true,
              onPressed: onAction,
            ),
          ),
        ],
      ),
    ),
  );
}

/// One order: stage, design proofs to answer, tracking, garments, files and updates.
class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen(this.c, this.id, {super.key});
  final AppController c;
  final int id;
  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  Map<String, dynamic>? _order;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final o = await widget.c.api.order(widget.id);
      if (mounted) setState(() => _order = o);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  /// Saves a file of the order (share sheet on phones, a download on the web).
  Future<void> _download(Map<String, dynamic> f) async {
    try {
      final bytes = await widget.c.api.downloadOrderFile(
        (f['id'] as num).toInt(),
      );
      final done = await shareImage(bytes, '${f['name']}');
      if (mounted) showToast(context, done);
    } on ApiException catch (e) {
      if (mounted) showToast(context, e.message);
    } on Object {
      if (mounted) showToast(context, 'That file could not be saved.');
    }
  }

  Future<void> _answer(bool approve, int? proofId) async {
    String? message;
    if (!approve) {
      final field = TextEditingController();
      message = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Request changes'),
          content: TextField(
            controller: field,
            maxLines: 3,
            maxLength: 2000,
            decoration: const InputDecoration(
              hintText: 'What should we change?',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, field.text.trim()),
              child: const Text('Send'),
            ),
          ],
        ),
      );
      if (message == null || message.isEmpty) return;
    }
    setState(() => _busy = true);
    try {
      final o = await widget.c.api.answerProof(
        widget.id,
        approve: approve,
        proofId: proofId,
        message: message,
      );
      if (!mounted) return;
      setState(() => _order = o);
      showToast(
        context,
        approve
            ? 'Design approved. Thank you!'
            : 'Your changes were sent to the 3DEEZI team.',
      );
    } on ApiException catch (e) {
      if (mounted) showToast(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = _order;
    return Scaffold(
      backgroundColor: Palette.bg,
      appBar: AppBar(
        backgroundColor: Palette.bg,
        title: Text(o == null ? 'Order' : '${o['number']}'),
      ),
      body: o == null
          ? Center(
              child: _error != null
                  ? Text(_error!, style: const TextStyle(color: Palette.muted))
                  : const CircularProgressIndicator(),
            )
          : RefreshIndicator(onRefresh: _load, child: _details(o)),
    );
  }

  Widget _details(Map<String, dynamic> o) {
    final sub = (o['sub_status'] as Map?)?.cast<String, dynamic>() ?? const {};
    final status = '${sub['label'] ?? o['stage_label'] ?? ''}';
    final proof = (o['proof'] as Map?)?.cast<String, dynamic>();
    final proofs = ((o['proofs'] as List?) ?? const [])
        .cast<Map<String, dynamic>>();
    final tracking = (o['tracking'] as Map?)?.cast<String, dynamic>();
    final items = ((o['items'] as List?) ?? const [])
        .cast<Map<String, dynamic>>();
    // The server sends an empty list for "no sizes" (an uploaded order form before 3DEEZI reads it).
    final sizes = _mapOf(o['sizes']);
    final files = ((o['files'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .where((f) => f['kind'] != 'proof')
        .toList();
    final updates = ((o['updates'] as List?) ?? const [])
        .cast<Map<String, dynamic>>();
    final reached = _mapOf(o['stages_reached']);
    const stages = [
      ('received', 'Received'),
      ('design', 'Design'),
      ('production', 'Production'),
      ('shipped', 'Shipped'),
      ('delivered', 'Delivered'),
    ];
    final at = stages.indexWhere((s) => s.$1 == o['stage']);
    final waiting = o['approval'] == 'review' && proof != null;
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 30),
      children: [
        Text(
          '${o['name']}',
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
        ),
        const SizedBox(height: 6),
        // The status once, as on the website's order page: the sub-status ("Order received", "Approval needed"), its
        // stage being in the steps below. The stage pill beside it repeated it ("Order Received", "Delivered").
        if (status.isNotEmpty)
          Wrap(
            key: const Key('order-status'),
            spacing: 6,
            children: [
              _pill(status, _tone(sub['label'] == null ? 'blue' : sub['tone'])),
            ],
          ),
        // The invoice: its status and, while unpaid, Pay now (the status is read again on the way back).
        PaymentStrip(
          widget.c,
          (o['payment'] as Map?)?.cast<String, dynamic>(),
          onBack: _load,
        ),
        // Who makes it, when that is one of the preferred suppliers.
        if (madeByOf(o) case final maker?)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: _MadeBy(maker),
          ),
        const SizedBox(height: 14),
        // The five stages, with the date each was reached.
        Row(
          children: [
            for (final (i, s) in stages.indexed)
              Expanded(
                child: Column(
                  children: [
                    Icon(
                      i <= at
                          ? Icons.check_circle
                          : Icons.radio_button_unchecked,
                      size: 18,
                      color: i <= at ? Palette.cyan : Palette.border,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      s.$2,
                      style: TextStyle(
                        fontSize: 10,
                        color: i <= at ? Palette.text : Palette.muted,
                      ),
                    ),
                    Text(
                      _day(reached[s.$1]),
                      style: const TextStyle(fontSize: 9, color: Palette.muted),
                    ),
                  ],
                ),
              ),
          ],
        ),
        if (proofs.isNotEmpty) ...[
          const _Heading('Design proofs'),
          for (final p in proofs)
            SurfaceCard(
              selected: waiting && p['id'] == proof['id'],
              child: Row(
                children: [
                  _dataImage(p['thumb'], 64) ??
                      const Icon(
                        Icons.picture_as_pdf_outlined,
                        size: 40,
                        color: Palette.muted,
                      ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Proof v${p['version'] ?? ''}',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          {
                                'pending': 'Waiting for your approval',
                                'approved':
                                    'Approved ${_day(p['reviewed_at'])}',
                                'changes': 'Changes requested',
                                'superseded': 'Replaced by a newer version',
                              }['${p['review_status']}'] ??
                              '',
                          style: const TextStyle(
                            color: Palette.muted,
                            fontSize: 12,
                          ),
                        ),
                        if (p['review_note'] != null)
                          Text(
                            '“${p['review_note']}”',
                            style: const TextStyle(fontSize: 12),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          if (waiting) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: GradientButton(
                    label: 'APPROVE DESIGN',
                    compact: true,
                    onPressed: _busy
                        ? null
                        : () => _answer(true, (proof['id'] as num?)?.toInt()),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: _busy
                        ? null
                        : () => _answer(false, (proof['id'] as num?)?.toInt()),
                    child: const Text('Request changes'),
                  ),
                ),
              ],
            ),
          ],
        ],
        if (tracking != null) ...[
          const _Heading('Delivery'),
          SurfaceCard(
            child: Row(
              children: [
                const Icon(Icons.local_shipping_outlined, color: Palette.cyan),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    '${tracking['carrier'] ?? 'Courier'}${tracking['number'] != null ? ' · ${tracking['number']}' : ''}',
                  ),
                ),
                if ('${tracking['url'] ?? ''}'.startsWith('http'))
                  TextButton(
                    onPressed: () => openSitePage(
                      context,
                      '${tracking['url']}',
                      'Track your parcel',
                    ),
                    child: const Text('Track'),
                  ),
              ],
            ),
          ),
        ],
        // The date required and the delivery address or pick up (Upload Your Order, 2026-10-22); older orders have neither.
        if ('${o['needed_by'] ?? ''}'.isNotEmpty ||
            '${o['shipping_address'] ?? ''}'.trim().isNotEmpty) ...[
          const _Heading('Date required & delivery'),
          SurfaceCard(
            key: const Key('order-delivery-details'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if ('${o['needed_by'] ?? ''}'.isNotEmpty)
                  Text('Date required: ${_day(o['needed_by'])}'),
                if ('${o['shipping_address'] ?? ''}'.trim().isNotEmpty) ...[
                  if ('${o['needed_by'] ?? ''}'.isNotEmpty)
                    const SizedBox(height: 8),
                  Text(
                    '${o['shipping_address']}'.startsWith('Pick up')
                        ? 'Pick up'
                        : 'Delivery address',
                    style: const TextStyle(color: Palette.muted, fontSize: 12),
                  ),
                  Text('${o['shipping_address']}'.trim()),
                ],
              ],
            ),
          ),
        ],
        const _Heading('Garments and sizes'),
        if (items.isNotEmpty)
          for (final item in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SurfaceCard(
                child: Row(
                  children: [
                    _dataImage(item['thumbnail'], 48) ??
                        _GarmentChip('${item['name']}'),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${item['name']}${item['fit'] != null ? ' · ${fitNames[item['fit']] ?? item['fit']}' : ''}',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          Text(
                            _mapOf(item['sizes']).entries
                                .map((e) => '${e.key} ${e.value}')
                                .join(' · '),
                            style: const TextStyle(
                              color: Palette.muted,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      '${item['quantity'] ?? ''}',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              ),
            )
        else
          Text(
            sizes.isEmpty
                ? 'Sizes are in your uploaded order form; we confirm them with you.'
                : sizes.entries.map((e) => '${e.key} ${e.value}').join(' · '),
            style: const TextStyle(color: Palette.muted),
          ),
        if (files.isNotEmpty) ...[
          const _Heading('Files'),
          for (final f in files)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading:
                  _dataImage(f['thumb'], 40) ??
                  const Icon(Icons.insert_drive_file_outlined),
              title: Text(
                '${f['name']}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(
                '${f['kind']}'.replaceAll('_', ' '),
                style: const TextStyle(color: Palette.muted, fontSize: 12),
              ),
              trailing: IconButton(
                tooltip: 'Download ${f['name']}',
                icon: const Icon(Icons.download),
                onPressed: () => _download(f),
              ),
            ),
        ],
        const _Heading('Updates'),
        for (final u in updates)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  u['author'] == 'customer'
                      ? Icons.person_outline
                      : Icons.campaign_outlined,
                  size: 18,
                  color: Palette.cyan,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${u['text']}',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      if (u['message'] != null && u['message'] != u['text'])
                        Text(
                          '“${u['message']}”',
                          style: const TextStyle(fontSize: 12.5),
                        ),
                      Text(
                        '${u['author'] == 'customer' ? 'You' : '3DEEZI team'} · ${_day(u['created_at'])}',
                        style: const TextStyle(
                          color: Palette.muted,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(0, 22, 0, 10),
    child: Text(
      text.toUpperCase(),
      style: const TextStyle(
        color: Palette.cyan,
        fontWeight: FontWeight.w800,
        fontSize: 12,
        letterSpacing: 1.2,
      ),
    ),
  );
}
