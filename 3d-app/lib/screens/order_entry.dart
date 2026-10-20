import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';

import '../api_client.dart';
import '../app_controller.dart';
import '../widgets/site_page_stub.dart'
    if (dart.library.js_interop) '../widgets/site_page_web.dart'
    if (dart.library.io) '../widgets/site_page_io.dart';
import '../widgets/ui.dart';
import 'orders_board.dart';

// 3DEEZI Orders in the app: Create Order Form and Upload Your Order, native, on
// the same API as the website (drafts, file uploads with progress, one
// idempotent submit). See orders-api.md.

/// Opens the pay page (replaced in tests).
Future<void> Function(BuildContext context, String url, String title) openPayPage = openSitePage;

String _money(Object? amount, Object? currency) => amount == null ? '' : '${currency ?? 'AUD'} ${double.tryParse('$amount')?.toStringAsFixed(2) ?? amount}';

/// The price for the review step, from the server's quote (or "Quote required" with the reasons).
class PriceBox extends StatefulWidget {
  const PriceBox(this.c, this.body, {super.key});
  final AppController c;
  final Map<String, dynamic> body;
  @override
  State<PriceBox> createState() => _PriceBoxState();
}

class _PriceBoxState extends State<PriceBox> {
  late final Future<Map<String, dynamic>> _quote = widget.c.api.pricingQuote(widget.body);
  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: _quote,
    builder: (context, snap) {
      final q = snap.data;
      if (snap.connectionState != ConnectionState.done) return const LinearProgressIndicator();
      if (q == null) return const Text('Price confirmed by 3DEEZI after review.', style: TextStyle(color: Palette.muted));
      if (q['status'] != 'priced') {
        final reasons = ((q['reasons'] as List?) ?? const []).map((r) => '${(r as Map)['message']}').join(' ');
        return Text('Quote required. ${reasons.isEmpty ? '3DEEZI confirms the price after review.' : reasons}', key: const Key('quote-required'), style: const TextStyle(color: Color(0xffffbc75)));
      }
      final lines = [...((q['lines'] as List?) ?? const []), ...((q['extras'] as List?) ?? const [])].cast<Map<String, dynamic>>();
      final shipping = (q['shipping'] as Map?)?['amount'];
      final tax = q['tax'] as Map?;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final l in lines)
            Row(children: [Expanded(child: Text('${l['name']} x ${l['quantity']}', style: const TextStyle(fontSize: 13))), Text(_money(l['total'], q['currency']), style: const TextStyle(fontSize: 13))]),
          if (shipping != null)
            Row(children: [Expanded(child: Text('Shipping${(q['shipping'] as Map?)?['name'] != null ? ' · ${(q['shipping'] as Map)['name']}' : ''}', style: const TextStyle(fontSize: 13))), Text(_money(shipping, q['currency']), style: const TextStyle(fontSize: 13))]),
          for (final d in ((q['discounts'] as List?) ?? const []).cast<Map<String, dynamic>>())
            Row(children: [Expanded(child: Text('${d['name']}', style: const TextStyle(fontSize: 13, color: Color(0xff3ddc84)))), Text('-${_money(d['amount'], q['currency'])}', style: const TextStyle(fontSize: 13, color: Color(0xff3ddc84)))]),
          if (tax?['amount'] != null)
            Row(children: [Expanded(child: Text('${tax?['name'] ?? 'Tax'}', style: const TextStyle(fontSize: 13))), Text(_money(tax?['amount'], q['currency']), style: const TextStyle(fontSize: 13))]),
          const Divider(),
          Row(children: [const Expanded(child: Text('TOTAL', style: TextStyle(fontWeight: FontWeight.w800))), Text(_money(q['total'], q['currency']), key: const Key('quote-total'), style: const TextStyle(fontWeight: FontWeight.w800, color: Palette.cyan))]),
          if ((q['discount_code'] as Map?)?['valid'] == false)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('${(q['discount_code'] as Map)['message'] ?? 'This code isn’t valid.'}', key: const Key('code-error'), style: const TextStyle(color: Color(0xffff8a8a), fontSize: 12)),
            ),
        ],
      );
    },
  );
}

/// The review's price choices (payments-api.md R3): delivery destination, extras and a discount code with Apply.
/// Each change goes to [onChanged], which asks for the price again.
class PriceChoices extends StatefulWidget {
  const PriceChoices(this.c, this.value, this.onChanged, {super.key});
  final AppController c;
  final Map<String, dynamic> value;
  final ValueChanged<Map<String, dynamic>> onChanged;
  @override
  State<PriceChoices> createState() => _PriceChoicesState();
}

class _PriceChoicesState extends State<PriceChoices> {
  late final Future<Map<String, dynamic>> _options = widget.c.api.pricingOptions();
  late final _code = TextEditingController(text: '${widget.value['discount_code'] ?? ''}');

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  void _set(String key, Object? value) {
    final next = {...widget.value};
    if (value == null || (value is List && value.isEmpty) || value == '') {
      next.remove(key);
    } else {
      next[key] = value;
    }
    widget.onChanged(next);
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: _options,
    builder: (context, snap) {
      final o = snap.data;
      if (o == null) return const SizedBox.shrink();
      final destinations = ((o['destinations'] as List?) ?? const []).cast<Map<String, dynamic>>();
      final extras = ((o['extras'] as List?) ?? const []).cast<Map<String, dynamic>>().where((e) => e['auto'] != true).toList();
      final chosen = {...((widget.value['extras'] as List?) ?? const []).map((e) => '$e')};
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (destinations.isNotEmpty)
            DropdownButtonFormField<String>(
              key: const Key('price-destination'),
              isExpanded: true,
              initialValue: '${widget.value['destination'] ?? o['default_destination'] ?? destinations.first['code']}',
              decoration: const InputDecoration(labelText: 'Delivery to', isDense: true),
              items: [for (final d in destinations) DropdownMenuItem(value: '${d['code']}', child: Text('${d['name']}'))],
              onChanged: (v) => _set('destination', v),
            ),
          for (final e in extras)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              value: chosen.contains('${e['code']}'),
              title: Text('${e['name']}'),
              subtitle: Text('${_money(e['unit_price'], o['currency'])} ${e['unit'] == 'order' ? 'per order' : e['unit'] == 'player' ? 'per name / number' : 'per garment'}', style: const TextStyle(fontSize: 11)),
              onChanged: (on) => _set('extras', [...chosen.where((x) => x != '${e['code']}'), if (on == true) '${e['code']}']),
            ),
          if (o['discount_codes'] == true)
            Row(
              children: [
                Expanded(child: TextField(key: const Key('price-code'), controller: _code, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Discount code', isDense: true))),
                const SizedBox(width: 8),
                OutlinedButton(onPressed: () => _set('discount_code', _code.text.trim().toUpperCase()), child: const Text('Apply')),
              ],
            ),
          const SizedBox(height: 10),
        ],
      );
    },
  );
}

/// The payment pill and, for an unpaid invoice, Pay now (a 2-hour pay link); [onBack] refreshes afterwards.
class PaymentStrip extends StatelessWidget {
  const PaymentStrip(this.c, this.payment, {super.key, this.onBack});
  final AppController c;
  final Map<String, dynamic>? payment;
  final VoidCallback? onBack;
  @override
  Widget build(BuildContext context) {
    final p = payment;
    if (p == null) return const SizedBox.shrink();
    final tone = {'amber': const Color(0xffffb648), 'green': const Color(0xff3ddc84), 'blue': const Color(0xff3b8cff)}['${p['tone']}'] ?? Palette.muted;
    final canPay = p['can_pay'] == true && p['invoice_number'] != null;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        children: [
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), color: tone.withValues(alpha: .14), border: Border.all(color: tone.withValues(alpha: .6))),
              child: Text('${p['label'] ?? p['status']}', overflow: TextOverflow.ellipsis, style: TextStyle(color: tone, fontSize: 11, fontWeight: FontWeight.w700)),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(child: Text(canPay && p['amount_due'] != null ? '${_money(p['amount_due'], p['currency'])} due' : '', style: const TextStyle(fontSize: 12))),
          if (canPay)
            FilledButton(
              onPressed: () async {
                try {
                  final url = await c.api.invoicePayLink('${p['invoice_number']}');
                  if (!context.mounted) return;
                  await openPayPage(context, url, 'Pay now');
                  onBack?.call();
                } on ApiException catch (e) {
                  if (context.mounted) showToast(context, e.message);
                }
              },
              child: const Text('PAY NOW'),
            ),
        ],
      ),
    );
  }
}

/// Picks a file for an order (replaced in tests).
Future<({String name, Uint8List bytes})?> Function(String kind) pickOrderFile = _pick;

Future<({String name, Uint8List bytes})?> _pick(String kind) async {
  final file = await openFile(
    acceptedTypeGroups: [
      XTypeGroup(
        label: kind == 'order_form' ? 'Order forms' : 'Artwork',
        extensions: kind == 'order_form'
            ? ['pdf', 'xlsx', 'xls', 'csv', 'ods', 'doc', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'webp', 'heic']
            : ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'pdf', 'ai', 'eps', 'cdr', 'psd', 'tif', 'tiff', 'heic'],
      ),
    ],
  );
  if (file == null) return null;
  return (name: file.name, bytes: await file.readAsBytes());
}

const _sizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Kids'];
const _garments = {
  'jersey': 'Jersey', 'shorts': 'Shorts', 'tee': 'Training tee', 'singlet': 'Singlet', 'polo': 'Polo', 'hoodie': 'Hoodie',
  'jacket': 'Jacket', 'warmup': 'Warm-up top', 'pants': 'Track pants', 'socks': 'Socks', 'cap': 'Cap', 'other': 'Other',
};
const _fits = {'mens': 'Mens', 'womens': 'Womens', 'youth': 'Youth', 'unisex': 'Unisex'};
const _maxBytes = 25 * 1024 * 1024;

String _newKey() => 'app-${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 30)}';

/// One file on the draft: uploading (with progress), uploaded, or failed.
class _Upload {
  _Upload(this.name, this.kind);
  final String name, kind;
  double progress = 0;
  Map<String, dynamic>? file;
  String? error;
}

/// A garment row of the order form.
class _Row {
  String garment = 'jersey', fit = 'mens';
  int? project;
  final Map<String, int> sizes = {};
  String players = '';
  int get total => sizes.values.fold(0, (a, b) => a + b);
  Map<String, dynamic> toJson() => {
    'garment': garment,
    'fit': fit,
    if (project != null) 'project_id': project,
    'sizes': {for (final e in sizes.entries) if (e.value > 0) e.key: e.value},
    if (players.trim().isNotEmpty)
      'players': [
        for (final line in const LineSplitter().convert(players))
          if (line.trim().isNotEmpty)
            () {
              final cells = line.split(RegExp(r'[,\t;]')).map((s) => s.trim()).toList();
              final number = cells.firstWhere((s) => RegExp(r'^\d{1,3}$').hasMatch(s), orElse: () => '');
              final size = cells.firstWhere((s) => _sizes.contains(s.toUpperCase()), orElse: () => '').toUpperCase();
              final name = cells.where((s) => s != number && s.toUpperCase() != size).join(' ');
              return {'name': name, 'number': number, if (size.isNotEmpty) 'size': size};
            }(),
      ],
  };
}

/// What both screens share: the contact fields, the draft, uploads, review and confirmation.
mixin _OrderEntry<T extends StatefulWidget> on State<T> {
  AppController get c;
  String get kind;
  final name = TextEditingController(), email = TextEditingController(), phone = TextEditingController(), team = TextEditingController(), notes = TextEditingController();
  final uploads = <_Upload>[];
  int? draftId;
  final key = _newKey();
  String step = 'edit';
  String? error;
  bool busy = false;
  Map<String, dynamic>? placed;

  void initContact() {
    name.text = c.user?.name ?? '';
    email.text = c.user?.email ?? '';
  }

  Map<String, dynamic> fields();

  Future<int> ensureDraft() async => draftId ??= ((await c.api.createOrderDraft(kind, fields()))['id'] as num).toInt();

  Future<void> saveDraft() async {
    setState(() => busy = true);
    try {
      if (draftId == null) {
        await ensureDraft();
      } else {
        await c.api.saveOrderDraft(draftId!, fields());
      }
      if (mounted) showToast(context, 'Draft saved. It is not submitted yet.');
    } on ApiException catch (e) {
      if (mounted) setState(() => error = e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> addFile(String fileKind, {_Upload? replacing}) async {
    final picked = await pickOrderFile(fileKind);
    if (picked == null) return;
    if (picked.bytes.length > _maxBytes) {
      setState(() => error = '${picked.name} is larger than 25 MB.');
      return;
    }
    final upload = _Upload(picked.name, fileKind);
    setState(() {
      error = null;
      if (replacing != null) uploads.remove(replacing);
      uploads.add(upload);
    });
    try {
      final id = await ensureDraft();
      if (replacing?.file != null) await c.api.removeOrderDraftFile(id, (replacing!.file!['id'] as num).toInt());
      final file = await c.api.uploadOrderFile(id, picked.bytes, filename: picked.name, kind: fileKind, onProgress: (p) {
        if (mounted) setState(() => upload.progress = p);
      });
      if (mounted) setState(() => upload.file = file);
    } on ApiException catch (e) {
      if (mounted) setState(() => upload.error = e.message);
    }
  }

  Future<void> removeFile(_Upload upload) async {
    setState(() => uploads.remove(upload));
    if (draftId != null && upload.file != null) {
      try {
        await c.api.removeOrderDraftFile(draftId!, (upload.file!['id'] as num).toInt());
      } on ApiException catch (e) {
        if (mounted) setState(() => error = e.message);
      }
    }
  }

  /// Submits once: the same key on every retry, so a lost reply never makes a second order.
  Future<void> confirm([Map<String, dynamic> extra = const {}]) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final id = await ensureDraft();
      final order = await c.api.submitOrderDraft(id, key, {...fields(), ...extra});
      if (mounted) setState(() {
        placed = order;
        step = 'done';
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => error = e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget fileRow(_Upload u, {VoidCallback? onReplace}) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: SurfaceCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(u.error != null ? Icons.error_outline : u.file != null ? Icons.check_circle : Icons.upload_file,
                  color: u.error != null ? const Color(0xffff6b78) : Palette.cyan, size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text(u.name, maxLines: 1, overflow: TextOverflow.ellipsis)),
              Text(u.error != null ? 'Failed' : u.file != null ? 'Uploaded' : '${(u.progress * 100).round()}%', style: const TextStyle(color: Palette.muted, fontSize: 12)),
              if (onReplace != null) TextButton(onPressed: onReplace, child: const Text('Replace')),
              IconButton(tooltip: 'Remove ${u.name}', onPressed: () => removeFile(u), icon: const Icon(Icons.close, size: 18)),
            ],
          ),
          if (u.file == null && u.error == null) LinearProgressIndicator(value: u.progress),
          if (u.error != null) Text(u.error!, style: const TextStyle(color: Color(0xffff8a8a), fontSize: 12)),
        ],
      ),
    ),
  );

  Widget contactFields() => Column(
    children: [
      _field(name, 'Contact name'),
      _field(email, 'Email', keyboard: TextInputType.emailAddress),
      _field(team, 'Team / organisation'),
      _field(phone, 'Phone', keyboard: TextInputType.phone),
    ],
  );

  /// The confirmation: the reference, View my order, and Pay now when an invoice is ready.
  Widget confirmation() {
    final o = placed!;
    final invoice = (o['invoice'] as Map?) ?? (o['payment'] as Map?);
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Icon(Icons.check_circle, color: Palette.cyan, size: 56),
        const SizedBox(height: 12),
        const Text('Order sent', textAlign: TextAlign.center, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        const Text('Your order reference', textAlign: TextAlign.center, style: TextStyle(color: Palette.muted)),
        Text('${o['number']}', key: const Key('order-reference'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Palette.cyan)),
        const SizedBox(height: 10),
        Text(
          invoice == null
              ? 'Price confirmed by 3DEEZI after review.'
              : invoice['status'] == 'quote_required'
              ? 'Quote required: 3DEEZI confirms the price, then sends your invoice.'
              : 'Invoice ${invoice['invoice_number'] ?? ''}: ${_money(invoice['total'], invoice['currency'])}',
          textAlign: TextAlign.center,
        ),
        PaymentStrip(c, invoice?.cast<String, dynamic>()),
        const SizedBox(height: 20),
        GradientButton(
          label: 'VIEW MY ORDER',
          onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(c, (o['id'] as num).toInt()))),
        ),
      ],
    );
  }

  Widget errorText() => error == null ? const SizedBox.shrink() : Padding(
    padding: const EdgeInsets.only(top: 10),
    child: Text(error!, key: const Key('order-error'), style: const TextStyle(color: Color(0xffff8a8a))),
  );

  @override
  void dispose() {
    for (final t in [name, email, phone, team, notes]) {
      t.dispose();
    }
    super.dispose();
  }
}

Widget _field(TextEditingController controller, String label, {int lines = 1, TextInputType? keyboard}) => Padding(
  padding: const EdgeInsets.only(bottom: 10),
  child: TextField(
    controller: controller,
    maxLines: lines,
    keyboardType: keyboard,
    decoration: InputDecoration(labelText: label, border: const OutlineInputBorder(), isDense: true),
  ),
);

Widget _section(String text) => Padding(
  padding: const EdgeInsets.fromLTRB(0, 18, 0, 10),
  child: Text(text.toUpperCase(), style: const TextStyle(color: Palette.cyan, fontWeight: FontWeight.w800, fontSize: 12, letterSpacing: 1.2)),
);

/// Create Order Form: contact and team, garments with sizes, names, artwork, instructions; review, then confirm.
class OrderFormScreen extends StatefulWidget {
  const OrderFormScreen(this.controller, {super.key});
  final AppController controller;
  @override
  State<OrderFormScreen> createState() => _OrderFormScreenState();
}

class _OrderFormScreenState extends State<OrderFormScreen> with _OrderEntry {
  @override
  AppController get c => widget.controller;
  @override
  String get kind => 'form';
  final rows = <_Row>[_Row()];
  final help = TextEditingController();
  Map<String, dynamic> pricing = {};
  String? helped;

  @override
  void initState() {
    super.initState();
    initContact();
  }

  @override
  void dispose() {
    help.dispose();
    super.dispose();
  }

  @override
  Map<String, dynamic> fields() => {
    'contact_name': name.text.trim(),
    'contact_email': email.text.trim(),
    'phone': phone.text.trim(),
    'team_name': team.text.trim(),
    'notes': notes.text.trim(),
    'items': [for (final r in rows) if (r.total > 0) r.toJson()],
    if (pricing.isNotEmpty) 'pricing': pricing,
  };

  int get total => rows.fold(0, (a, r) => a + r.total);

  Future<void> helpMe() async {
    if (help.text.trim().isEmpty) return;
    setState(() => busy = true);
    try {
      final read = await c.api.orderAssist(help.text.trim());
      final items = ((read['items'] as List?) ?? const []).cast<Map<String, dynamic>>();
      setState(() {
        if (rows.length == 1 && rows.first.total == 0) rows.clear();
        for (final item in items) {
          rows.add(_Row()
            ..garment = _garments.containsKey(item['garment']) ? '${item['garment']}' : 'other'
            ..fit = _fits.containsKey(item['fit']) ? '${item['fit']}' : 'mens'
            ..sizes.addAll(((item['sizes'] as Map?) ?? const {}).map((k, v) => MapEntry('$k', (v as num).toInt()))));
        }
        if (rows.isEmpty) rows.add(_Row());
        final unknown = ((read['unknown'] as List?) ?? const []).join('; ');
        helped = items.isEmpty ? 'I could not read sizes from that. Try “12 jerseys M, 12 shorts L”.' : 'Added ${read['summary']}.${unknown.isEmpty ? '' : ' Check: $unknown'}';
      });
    } on ApiException catch (e) {
      setState(() => helped = e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  String? problem() {
    if (name.text.trim().isEmpty) return 'Add a contact name.';
    if (team.text.trim().isEmpty) return 'Add your team or organisation name.';
    if (total < 1) return 'Add at least one size and quantity.';
    return null;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Palette.bg,
    appBar: AppBar(
      backgroundColor: Palette.bg,
      title: Text(step == 'review' ? 'Review your order' : step == 'done' ? 'Order sent' : 'Create order form'),
      actions: [
        if (step == 'edit')
          IconButton(tooltip: 'Open on the website', onPressed: () => openSitePage(context, c.api.sitePage('/orders/new'), 'Create order form'), icon: const Icon(Icons.open_in_new)),
      ],
    ),
    body: step == 'done' ? confirmation() : step == 'review' ? _review() : _edit(),
  );

  Widget _edit() {
    final designs = [for (final p in c.projects) if (p.remoteId != null) p];
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 30),
      children: [
        _section('1 · Contact & team'),
        contactFields(),
        _section('2 · Garments & sizes'),
        SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('3DEEZI ASSIST · Help me add sizes', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              TextField(controller: help, decoration: const InputDecoration(hintText: '12 jerseys M, 12 shorts L, 6 hoodies XL', isDense: true, border: OutlineInputBorder())),
              const SizedBox(height: 8),
              Align(alignment: Alignment.centerRight, child: OutlinedButton(onPressed: busy ? null : helpMe, child: const Text('Help me add sizes'))),
              if (helped != null) Text(helped!, style: const TextStyle(color: Palette.muted, fontSize: 12)),
            ],
          ),
        ),
        const SizedBox(height: 10),
        for (final (i, r) in rows.indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: SurfaceCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          isExpanded: true,
                          initialValue: r.garment,
                          decoration: const InputDecoration(labelText: 'Garment', isDense: true),
                          items: [for (final e in _garments.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                          onChanged: (v) => setState(() => r.garment = v ?? r.garment),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          isExpanded: true,
                          initialValue: r.fit,
                          decoration: const InputDecoration(labelText: 'Fit', isDense: true),
                          items: [for (final e in _fits.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                          onChanged: (v) => setState(() => r.fit = v ?? r.fit),
                        ),
                      ),
                      IconButton(tooltip: 'Remove garment ${i + 1}', onPressed: rows.length < 2 ? null : () => setState(() => rows.remove(r)), icon: const Icon(Icons.delete_outline)),
                    ],
                  ),
                  if (designs.isNotEmpty)
                    DropdownButtonFormField<int?>(
                      isExpanded: true,
                      initialValue: r.project,
                      decoration: const InputDecoration(labelText: 'Design', isDense: true),
                      items: [const DropdownMenuItem<int?>(value: null, child: Text('No saved design')), for (final p in designs) DropdownMenuItem<int?>(value: p.remoteId, child: Text(p.title))],
                      onChanged: (v) => setState(() => r.project = v),
                    ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final s in _sizes.take(7))
                        SizedBox(
                          width: 64,
                          child: TextFormField(
                            key: Key('size-$i-$s'),
                            initialValue: r.sizes[s]?.toString() ?? '',
                            keyboardType: TextInputType.number,
                            textAlign: TextAlign.center,
                            decoration: InputDecoration(labelText: s, isDense: true, border: const OutlineInputBorder()),
                            onChanged: (v) => setState(() => r.sizes[s] = int.tryParse(v) ?? 0),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text('Subtotal ${r.total}', style: const TextStyle(color: Palette.cyan, fontWeight: FontWeight.w700)),
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: const Text('Player names & numbers (optional)', style: TextStyle(fontSize: 13)),
                    children: [
                      TextFormField(
                        initialValue: r.players,
                        maxLines: 4,
                        decoration: const InputDecoration(hintText: 'One per line: SMITH, 7, M', border: OutlineInputBorder()),
                        onChanged: (v) => r.players = v,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        TextButton.icon(onPressed: () => setState(() => rows.add(_Row())), icon: const Icon(Icons.add), label: const Text('Add garment')),
        _section('3 · Artwork & instructions'),
        for (final u in uploads) fileRow(u),
        OutlinedButton.icon(onPressed: () => addFile('artwork'), icon: const Icon(Icons.attach_file), label: const Text('Add logos, artwork or a reference')),
        const SizedBox(height: 10),
        _field(notes, 'Design instructions', lines: 3),
        errorText(),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(child: OutlinedButton(onPressed: busy ? null : saveDraft, child: const Text('Save draft'))),
            const SizedBox(width: 10),
            Expanded(
              child: GradientButton(
                label: 'REVIEW ORDER',
                compact: true,
                onPressed: () => setState(() {
                  error = problem();
                  if (error == null) step = 'review';
                }),
              ),
            ),
          ],
        ),
        const Padding(padding: EdgeInsets.only(top: 6), child: Text('Reviewing does not submit your order.', textAlign: TextAlign.center, style: TextStyle(color: Palette.muted, fontSize: 11))),
      ],
    );
  }

  Widget _review() => ListView(
    padding: const EdgeInsets.fromLTRB(18, 8, 18, 30),
    children: [
      Text(team.text, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
      Text('${name.text}${email.text.isEmpty ? '' : ' · ${email.text}'}${phone.text.isEmpty ? '' : ' · ${phone.text}'}', style: const TextStyle(color: Palette.muted)),
      _section('Garments'),
      for (final r in rows.where((r) => r.total > 0))
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text('${_garments[r.garment]} · ${_fits[r.fit]}'),
          subtitle: Text(r.sizes.entries.where((e) => e.value > 0).map((e) => '${e.key} ${e.value}').join(' · ')),
          trailing: Text('${r.total}', style: const TextStyle(fontWeight: FontWeight.w800)),
        ),
      Text('$total garments in total', style: const TextStyle(fontWeight: FontWeight.w700)),
      if (uploads.isNotEmpty) Text('${uploads.where((u) => u.file != null).length} artwork file(s)', style: const TextStyle(color: Palette.muted)),
      if (notes.text.trim().isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text('“${notes.text.trim()}”')),
      _section('Price'),
      PriceChoices(c, pricing, (next) => setState(() => pricing = next)),
      PriceBox(c, {'items': fields()['items'], 'pricing': pricing}, key: ValueKey(jsonEncode(pricing))),
      errorText(),
      const SizedBox(height: 16),
      GradientButton(label: busy ? 'SENDING…' : 'CONFIRM ORDER', onPressed: busy ? null : () => confirm()),
      TextButton(onPressed: () => setState(() => step = 'edit'), child: const Text('Edit')),
    ],
  );
}

/// Upload Your Order: the completed order form and artwork, then review (with the rows read from the form), then confirm.
class OrderUploadScreen extends StatefulWidget {
  const OrderUploadScreen(this.controller, {super.key});
  final AppController controller;
  @override
  State<OrderUploadScreen> createState() => _OrderUploadScreenState();
}

class _OrderUploadScreenState extends State<OrderUploadScreen> with _OrderEntry {
  @override
  AppController get c => widget.controller;
  @override
  String get kind => 'upload';
  bool editContact = false, correct = false;
  Map<String, dynamic> pricing = {};

  @override
  void initState() {
    super.initState();
    initContact();
    editContact = name.text.isEmpty;
  }

  @override
  Map<String, dynamic> fields() => {
    'contact_name': name.text.trim(),
    'contact_email': email.text.trim(),
    'phone': phone.text.trim(),
    'team_name': team.text.trim(),
    'notes': notes.text.trim(),
    if (pricing.isNotEmpty) 'pricing': pricing,
  };

  _Upload? get form => uploads.where((u) => u.kind == 'order_form').firstOrNull;
  Map<String, dynamic>? get suggested => (form?.file?['suggested'] as Map?)?.cast<String, dynamic>();

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Palette.bg,
    appBar: AppBar(
      backgroundColor: Palette.bg,
      title: Text(step == 'review' ? 'Review your upload' : step == 'done' ? 'Order sent' : 'Upload your order'),
      actions: [
        if (step == 'edit')
          IconButton(tooltip: 'Open on the website', onPressed: () => openSitePage(context, c.api.sitePage('/orders/upload'), 'Upload your order'), icon: const Icon(Icons.open_in_new)),
      ],
    ),
    body: step == 'done' ? confirmation() : step == 'review' ? _review() : _edit(),
  );

  Widget _edit() => ListView(
    padding: const EdgeInsets.fromLTRB(18, 8, 18, 30),
    children: [
      _section('1 · Contact & team'),
      if (editContact)
        contactFields()
      else
        SurfaceCard(
          child: Row(
            children: [
              Expanded(child: Text('${name.text}${email.text.isEmpty ? '' : ' · ${email.text}'}\n${team.text.isEmpty ? 'Add your team name' : team.text}')),
              TextButton(onPressed: () => setState(() => editContact = true), child: const Text('Edit')),
            ],
          ),
        ),
      _section('2 · Upload order form'),
      if (form != null)
        fileRow(form!, onReplace: () => addFile('order_form', replacing: form))
      else
        OutlinedButton.icon(onPressed: () => addFile('order_form'), icon: const Icon(Icons.upload_file), label: const Text('Choose your order form')),
      const Text('PDF, Excel, CSV, Word or a photo, up to 25 MB.', style: TextStyle(color: Palette.muted, fontSize: 11)),
      _section('3 · Artwork & notes (optional)'),
      for (final u in uploads.where((u) => u.kind == 'artwork')) fileRow(u),
      OutlinedButton.icon(onPressed: () => addFile('artwork'), icon: const Icon(Icons.attach_file), label: const Text('Add logos, artwork or references')),
      const SizedBox(height: 10),
      _field(notes, 'Additional instructions', lines: 3),
      errorText(),
      const SizedBox(height: 14),
      Row(
        children: [
          Expanded(child: OutlinedButton(onPressed: busy ? null : saveDraft, child: const Text('Save draft'))),
          const SizedBox(width: 10),
          Expanded(
            child: GradientButton(
              label: 'REVIEW ORDER',
              compact: true,
              onPressed: () => setState(() {
                error = name.text.trim().isEmpty
                    ? 'Add a contact name.'
                    : team.text.trim().isEmpty
                    ? 'Add your team or organisation name.'
                    : form?.file == null
                    ? 'Upload your completed order form.'
                    : null;
                if (error != null && error != 'Upload your completed order form.') editContact = true;
                if (error == null) step = 'review';
              }),
            ),
          ),
        ],
      ),
      const Padding(padding: EdgeInsets.only(top: 6), child: Text('Your order is only submitted after review.', textAlign: TextAlign.center, style: TextStyle(color: Palette.muted, fontSize: 11))),
    ],
  );

  Widget _review() {
    final s = suggested;
    final items = ((s?['items'] as List?) ?? const []).cast<Map<String, dynamic>>();
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 30),
      children: [
        Text(team.text, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
        Text('${name.text}${email.text.isEmpty ? '' : ' · ${email.text}'}', style: const TextStyle(color: Palette.muted)),
        _section('Your files'),
        for (final u in uploads.where((u) => u.file != null)) Text('• ${u.name}${u.kind == 'order_form' ? ' (order form)' : ''}'),
        if (items.isNotEmpty) ...[
          _section('Read from your order form'),
          for (final item in items)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('${item['name'] ?? item['garment']}'),
              subtitle: Text(((item['sizes'] as Map?) ?? const {}).entries.map((e) => '${e.key} ${e.value}').join(' · ')),
            ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: correct,
            onChanged: (v) => setState(() => correct = v ?? false),
            title: const Text('These details are correct'),
            subtitle: const Text('Untick to let 3DEEZI confirm sizes and quantities from your file.', style: TextStyle(fontSize: 12)),
          ),
        ] else
          const Text('Sizes and quantities will be confirmed during review.', style: TextStyle(color: Palette.muted)),
        if (notes.text.trim().isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text('“${notes.text.trim()}”')),
        _section('Price'),
        PriceChoices(c, pricing, (next) => setState(() => pricing = next)),
        PriceBox(c, {'items': correct ? items : const [], 'pricing': pricing}, key: ValueKey('$correct${jsonEncode(pricing)}')),
        errorText(),
        const SizedBox(height: 16),
        GradientButton(
          label: busy ? 'SENDING…' : 'CONFIRM ORDER',
          onPressed: busy ? null : () => confirm(correct && items.isNotEmpty ? {'items': [for (final i in items) {'garment': i['garment'], 'sport': i['sport'], 'fit': i['fit'], 'sizes': i['sizes'], if (i['players'] != null) 'players': i['players']}]} : const {}),
        ),
        TextButton(onPressed: () => setState(() => step = 'edit'), child: const Text('Edit')),
      ],
    );
  }
}

/// The app home's "Order now with 3DEEZI" (as on the website's homepage): Create Order Form, Upload Your Order,
/// My Orders. Signing in comes first where needed.
class OrderNowSection extends StatelessWidget {
  const OrderNowSection(this.c, {super.key});
  final AppController c;

  void _open(BuildContext context, Widget Function() screen) {
    if (!c.signedIn) {
      showToast(context, 'Sign in to place an order.');
      c.go(AppScreen.auth);
      return;
    }
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen()));
  }

  @override
  Widget build(BuildContext context) {
    Widget tile(IconData icon, String title, String label, String body, String action, VoidCallback onTap) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SurfaceCard(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                      Text(label, style: const TextStyle(color: Palette.cyan, fontWeight: FontWeight.w800, fontSize: 13, letterSpacing: .8)),
                    ],
                  ),
                ),
                Icon(icon, color: Palette.cyan, size: 30),
              ],
            ),
            const SizedBox(height: 6),
            Text(body, style: const TextStyle(color: Palette.muted, fontSize: 13)),
            const SizedBox(height: 10),
            GradientButton(label: action, compact: true, onPressed: onTap),
          ],
        ),
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // 3DEEZI as the logo (white 3D, cyan-blue EEZI), as on the website's homepage.
        Semantics(
          label: 'ORDER NOW WITH 3DEEZI',
          excludeSemantics: true,
          child: Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 8,
            children: [
              const Text('ORDER NOW WITH', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20, letterSpacing: 1)),
              Image.asset('assets/images/brand-wordmark.png', height: 16, semanticLabel: '3DEEZI'),
            ],
          ),
        ),
        const SizedBox(height: 4),
        const Text('Start an order. Upload your details. Follow its progress.', textAlign: TextAlign.center, style: TextStyle(color: Palette.muted, fontSize: 12.5)),
        const SizedBox(height: 14),
        tile(Icons.auto_awesome, 'NEED HELP ORDERING?', 'CREATE ORDER FORM', 'Let 3DEEZI Assist help build your order form.', 'CREATE ORDER FORM →', () => _open(context, () => OrderFormScreen(c))),
        tile(Icons.upload_file, 'ORDER READY TO GO?', 'UPLOAD YOUR ORDER', 'Upload your completed order form and artwork.', 'UPLOAD YOUR ORDER →', () => _open(context, () => OrderUploadScreen(c))),
        tile(Icons.view_kanban_outlined, 'MY ORDERS', 'YOUR ORDERS. ONE PLACE.', 'View your current orders and follow their progress.', 'VIEW MY ORDERS →', () => c.go(AppScreen.orders)),
      ],
    );
  }
}
