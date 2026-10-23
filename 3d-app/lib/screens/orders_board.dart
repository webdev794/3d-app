import 'package:flutter/material.dart';

import '../api_client.dart';
import '../app_controller.dart';
import '../export_service.dart' show shareImage;
import '../order_sizes.dart';
import '../widgets/flow_ui.dart';
import '../widgets/notification_bell.dart';
import '../widgets/site_page_stub.dart'
    if (dart.library.js_interop) '../widgets/site_page_web.dart'
    if (dart.library.io) '../widgets/site_page_io.dart';
import '../widgets/ui.dart';
import 'order_entry.dart';

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
  if (!text.startsWith('data:image/')) return null;
  try {
    final bytes = UriData.parse(text).contentAsBytes();
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Image.memory(bytes, width: size, height: size, fit: BoxFit.cover, gaplessPlayback: true),
    );
  } on Object {
    return null;
  }
}

/// A JSON object, or empty: PHP sends an empty array as `[]`, not `{}` (sizes of an uploaded order form, a new order's
/// stages).
Map<String, dynamic> _mapOf(Object? value) => value is Map ? value.cast<String, dynamic>() : const {};

Widget _pill(String text, Color colour) => Container(
  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
  decoration: BoxDecoration(
    borderRadius: BorderRadius.circular(20),
    color: colour.withValues(alpha: .14),
    border: Border.all(color: colour.withValues(alpha: .6)),
  ),
  child: Text(text, style: TextStyle(color: colour, fontSize: 11, fontWeight: FontWeight.w700)),
);

Future<void> _openSite(BuildContext context, AppController c, String path, String title) =>
    openSitePage(context, c.api.sitePage(path), title);

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
  int _stage = 0;
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
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(widget.c, id)));
    if (mounted) _load();
  }

  /// The native Create Order Form / Upload Your Order (each can still open the website's page).
  Future<void> _openEntry(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    final stages = _stages;
    final stage = stages.isEmpty ? null : stages[_stage.clamp(0, stages.length - 1)];
    final orders = ((stage?['orders'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final drafts = ((_board?['drafts'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final cancelled = ((_board?['cancelled'] as List?) ?? const []).cast<Map<String, dynamic>>();
    return Column(
      children: [
        TopBar(
          onBack: c.back,
          title: 'My orders',
          trailing: [
            if (c.signedIn)
              // The shared bell: all notifications; an order, TEAM request or invoice opens from it.
              NotificationBell(c, onClosed: _load),
            if (c.signedIn)
              IconButton(
                tooltip: 'Refresh',
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh),
              ),
          ],
        ),
        if (!c.signedIn)
          Expanded(
            child: _Message(
              'Sign in to order kits and follow them here.',
              action: 'SIGN IN',
              onAction: () => c.go(AppScreen.auth),
            ),
          )
        else ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 4, 18, 8),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _openEntry(OrderFormScreen(c)),
                    icon: const Icon(Icons.edit_note, size: 18),
                    label: const Text('Order form'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _openEntry(OrderUploadScreen(c)),
                    icon: const Icon(Icons.upload_file, size: 18),
                    label: const Text('Upload order'),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: SegmentedButton<String>(
              segments: [
                ButtonSegment(value: 'current', label: Text('Current ${(_board?['counts'] as Map?)?['current'] ?? ''}'.trim())),
                ButtonSegment(value: 'completed', label: Text('Completed ${(_board?['counts'] as Map?)?['completed'] ?? ''}'.trim())),
              ],
              selected: {_view},
              showSelectedIcon: false,
              onSelectionChanged: (v) {
                setState(() => _view = v.first);
                _load();
              },
            ),
          ),
          // The stage tabs.
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 4),
              children: [
                for (final (i, s) in stages.indexed)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text('${s['label']} ${s['count']}'),
                      selected: i == _stage,
                      avatar: CircleAvatar(radius: 5, backgroundColor: _tone(s['tone'])),
                      onSelected: (_) => setState(() => _stage = i),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: _loading && _board == null
                ? const Center(child: CircularProgressIndicator())
                : _error != null && _board == null
                ? _Message(_error!, action: 'TRY AGAIN', onAction: _load)
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
                      children: [
                        if (_view == 'current' && _stage == 0)
                          for (final d in drafts)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: SurfaceCard(
                                onTap: () => _openSite(context, c, '${d['link']}', 'Continue your draft'),
                                child: Row(
                                  children: [
                                    const Icon(Icons.drafts_outlined, color: Palette.muted),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        'Draft, not submitted: ${d['title'] ?? (d['kind'] == 'upload' ? 'uploaded order' : 'order form')}',
                                        style: const TextStyle(fontSize: 13),
                                      ),
                                    ),
                                    const Text('Continue', style: TextStyle(color: Palette.cyan, fontSize: 12)),
                                  ],
                                ),
                              ),
                            ),
                        if (orders.isEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 40),
                            child: Text(
                              'No orders in ${stage?['label'] ?? 'this stage'}.',
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: Palette.muted),
                            ),
                          ),
                        for (final o in orders)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: OrderBoardCard(o, onTap: () => _openOrder((o['id'] as num).toInt())),
                          ),
                        if (_view == 'completed' && cancelled.isNotEmpty) ...[
                          const Padding(
                            padding: EdgeInsets.fromLTRB(2, 12, 0, 8),
                            child: Text('Cancelled', style: TextStyle(color: Palette.muted, fontWeight: FontWeight.w700)),
                          ),
                          for (final o in cancelled)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: OrderBoardCard(o, onTap: () => _openOrder((o['id'] as num).toInt())),
                            ),
                        ],
                      ],
                    ),
                  ),
          ),
        ],
      ],
    );
  }
}

/// One order on the board: reference, name, garments, status pill and latest update.
class OrderBoardCard extends StatelessWidget {
  const OrderBoardCard(this.o, {super.key, this.onTap});
  final Map<String, dynamic> o;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final sub = (o['sub_status'] as Map?)?.cast<String, dynamic>() ?? const {};
    final garments = ((o['garments'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final latest = (o['latest_update'] as Map?)?.cast<String, dynamic>();
    final payment = (o['payment'] as Map?)?.cast<String, dynamic>();
    final action = o['action'];
    return SurfaceCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${o['number']}', style: const TextStyle(color: Palette.muted, fontSize: 12)),
          const SizedBox(height: 2),
          Text('${o['name']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 10),
          Row(
            children: [
              for (final g in garments.take(3))
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _dataImage(g['thumbnail'], 52) ?? _GarmentChip('${g['name']}'),
                ),
              if (garments.isEmpty) _dataImage(o['cover'], 52) ?? const Icon(Icons.description_outlined, color: Palette.muted, size: 34),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '${(o['quantity'] as num? ?? 0) > 0 ? '${o['quantity']} garment${o['quantity'] == 1 ? '' : 's'}' : 'Sizes in your order form'}${'${o['needed_by'] ?? ''}'.isNotEmpty && o['completed'] != true ? ' · required ${_day(o['needed_by'])}' : ''}',
            style: const TextStyle(fontSize: 12.5),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _pill('${sub['label'] ?? o['stage_label']}', _tone(sub['tone'])),
              if (payment != null) _pill('${payment['label'] ?? payment['status']}', _tone(payment['tone'])),
            ],
          ),
          if (latest != null) ...[
            const SizedBox(height: 8),
            Text(
              '${latest['text']}${latest['message'] != null && latest['message'] != latest['text'] ? ': ${latest['message']}' : ''}',
              style: const TextStyle(color: Palette.muted, fontSize: 12),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(child: Text('Submitted ${_day(o['submitted_at'])}', overflow: TextOverflow.ellipsis, style: const TextStyle(color: Palette.muted, fontSize: 11))),
              Text(
                action == 'review_design' ? 'REVIEW DESIGN →' : action == 'track_delivery' ? 'TRACK DELIVERY →' : 'View order →',
                style: const TextStyle(color: Palette.cyan, fontSize: 12, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ],
      ),
    );
  }
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
    child: Text(name, textAlign: TextAlign.center, maxLines: 2, style: const TextStyle(fontSize: 9.5, color: Palette.text)),
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
          Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Palette.muted)),
          const SizedBox(height: 16),
          SizedBox(width: 220, child: GradientButton(label: action, compact: true, onPressed: onAction)),
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
      final bytes = await widget.c.api.downloadOrderFile((f['id'] as num).toInt());
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
          content: TextField(controller: field, maxLines: 3, maxLength: 2000, decoration: const InputDecoration(hintText: 'What should we change?')),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, field.text.trim()), child: const Text('Send')),
          ],
        ),
      );
      if (message == null || message.isEmpty) return;
    }
    setState(() => _busy = true);
    try {
      final o = await widget.c.api.answerProof(widget.id, approve: approve, proofId: proofId, message: message);
      if (!mounted) return;
      setState(() => _order = o);
      showToast(context, approve ? 'Design approved. Thank you!' : 'Your changes were sent to the 3DEEZI team.');
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
      appBar: AppBar(backgroundColor: Palette.bg, title: Text(o == null ? 'Order' : '${o['number']}')),
      body: o == null
          ? Center(child: _error != null ? Text(_error!, style: const TextStyle(color: Palette.muted)) : const CircularProgressIndicator())
          : RefreshIndicator(onRefresh: _load, child: _details(o)),
    );
  }

  Widget _details(Map<String, dynamic> o) {
    final sub = (o['sub_status'] as Map?)?.cast<String, dynamic>() ?? const {};
    final status = '${sub['label'] ?? o['stage_label'] ?? ''}';
    final proof = (o['proof'] as Map?)?.cast<String, dynamic>();
    final proofs = ((o['proofs'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final tracking = (o['tracking'] as Map?)?.cast<String, dynamic>();
    final items = ((o['items'] as List?) ?? const []).cast<Map<String, dynamic>>();
    // The server sends an empty list for "no sizes" (an uploaded order form before 3DEEZI reads it).
    final sizes = _mapOf(o['sizes']);
    final files = ((o['files'] as List?) ?? const []).cast<Map<String, dynamic>>().where((f) => f['kind'] != 'proof').toList();
    final updates = ((o['updates'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final reached = _mapOf(o['stages_reached']);
    const stages = [('received', 'Received'), ('design', 'Design'), ('production', 'Production'), ('shipped', 'Shipped'), ('delivered', 'Delivered')];
    final at = stages.indexWhere((s) => s.$1 == o['stage']);
    final waiting = o['approval'] == 'review' && proof != null;
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 30),
      children: [
        Text('${o['name']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
        const SizedBox(height: 6),
        // The status once, as on the website's order page: the sub-status ("Order received", "Approval needed"), its
        // stage being in the steps below. The stage pill beside it repeated it ("Order Received", "Delivered").
        if (status.isNotEmpty) Wrap(key: const Key('order-status'), spacing: 6, children: [_pill(status, _tone(sub['label'] == null ? 'blue' : sub['tone']))]),
        // The invoice: its status and, while unpaid, Pay now (the status is read again on the way back).
        PaymentStrip(widget.c, (o['payment'] as Map?)?.cast<String, dynamic>(), onBack: _load),
        const SizedBox(height: 14),
        // The five stages, with the date each was reached.
        Row(
          children: [
            for (final (i, s) in stages.indexed)
              Expanded(
                child: Column(
                  children: [
                    Icon(i <= at ? Icons.check_circle : Icons.radio_button_unchecked, size: 18, color: i <= at ? Palette.cyan : Palette.border),
                    const SizedBox(height: 3),
                    Text(s.$2, style: TextStyle(fontSize: 10, color: i <= at ? Palette.text : Palette.muted)),
                    Text(_day(reached[s.$1]), style: const TextStyle(fontSize: 9, color: Palette.muted)),
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
                  _dataImage(p['thumb'], 64) ?? const Icon(Icons.picture_as_pdf_outlined, size: 40, color: Palette.muted),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Proof v${p['version'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
                        Text(
                          {'pending': 'Waiting for your approval', 'approved': 'Approved ${_day(p['reviewed_at'])}', 'changes': 'Changes requested', 'superseded': 'Replaced by a newer version'}['${p['review_status']}'] ?? '',
                          style: const TextStyle(color: Palette.muted, fontSize: 12),
                        ),
                        if (p['review_note'] != null) Text('“${p['review_note']}”', style: const TextStyle(fontSize: 12)),
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
                Expanded(child: GradientButton(label: 'APPROVE DESIGN', compact: true, onPressed: _busy ? null : () => _answer(true, (proof['id'] as num?)?.toInt()))),
                const SizedBox(width: 10),
                Expanded(child: OutlinedButton(onPressed: _busy ? null : () => _answer(false, (proof['id'] as num?)?.toInt()), child: const Text('Request changes'))),
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
                Expanded(child: Text('${tracking['carrier'] ?? 'Courier'}${tracking['number'] != null ? ' · ${tracking['number']}' : ''}')),
                if ('${tracking['url'] ?? ''}'.startsWith('http'))
                  TextButton(onPressed: () => openSitePage(context, '${tracking['url']}', 'Track your parcel'), child: const Text('Track')),
              ],
            ),
          ),
        ],
        // The date required and the delivery address or pick up (Upload Your Order, 2026-10-22); older orders have neither.
        if ('${o['needed_by'] ?? ''}'.isNotEmpty || '${o['shipping_address'] ?? ''}'.trim().isNotEmpty) ...[
          const _Heading('Date required & delivery'),
          SurfaceCard(
            key: const Key('order-delivery-details'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if ('${o['needed_by'] ?? ''}'.isNotEmpty) Text('Date required: ${_day(o['needed_by'])}'),
                if ('${o['shipping_address'] ?? ''}'.trim().isNotEmpty) ...[
                  if ('${o['needed_by'] ?? ''}'.isNotEmpty) const SizedBox(height: 8),
                  Text('${o['shipping_address']}'.startsWith('Pick up') ? 'Pick up' : 'Delivery address', style: const TextStyle(color: Palette.muted, fontSize: 12)),
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
                    _dataImage(item['thumbnail'], 48) ?? _GarmentChip('${item['name']}'),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${item['name']}${item['fit'] != null ? ' · ${fitNames[item['fit']] ?? item['fit']}' : ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text(
                            _mapOf(item['sizes']).entries.map((e) => '${e.key} ${e.value}').join(' · '),
                            style: const TextStyle(color: Palette.muted, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    Text('${item['quantity'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
            )
        else
          Text(
            sizes.isEmpty ? 'Sizes are in your uploaded order form; we confirm them with you.' : sizes.entries.map((e) => '${e.key} ${e.value}').join(' · '),
            style: const TextStyle(color: Palette.muted),
          ),
        if (files.isNotEmpty) ...[
          const _Heading('Files'),
          for (final f in files)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: _dataImage(f['thumb'], 40) ?? const Icon(Icons.insert_drive_file_outlined),
              title: Text('${f['name']}', maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text('${f['kind']}'.replaceAll('_', ' '), style: const TextStyle(color: Palette.muted, fontSize: 12)),
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
                Icon(u['author'] == 'customer' ? Icons.person_outline : Icons.campaign_outlined, size: 18, color: Palette.cyan),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${u['text']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                      if (u['message'] != null && u['message'] != u['text']) Text('“${u['message']}”', style: const TextStyle(fontSize: 12.5)),
                      Text('${u['author'] == 'customer' ? 'You' : '3DEEZI team'} · ${_day(u['created_at'])}', style: const TextStyle(color: Palette.muted, fontSize: 11)),
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
    child: Text(text.toUpperCase(), style: const TextStyle(color: Palette.cyan, fontWeight: FontWeight.w800, fontSize: 12, letterSpacing: 1.2)),
  );
}
