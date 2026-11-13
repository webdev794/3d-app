import 'dart:async';
import 'package:flutter/services.dart';
import 'dart:convert';
import 'dart:math';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/foundation.dart' show defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';

import '../api_client.dart';
import '../app_controller.dart';
import '../custom_choice.dart';
import '../money.dart';
import '../order_sizes.dart';
import '../project_sync.dart';
import '../widgets/site_page_stub.dart'
    if (dart.library.js_interop) '../widgets/site_page_web.dart'
    if (dart.library.io) '../widgets/site_page_io.dart';
import '../widgets/order_form_read.dart';
import '../widgets/order_review_approve.dart';
import '../widgets/order_review_garments.dart';
import '../widgets/street_address_field.dart';
import '../widgets/flow_ui.dart' show pickArtwork;
import '../widgets/bubble_page.dart' show BubbleRoute;
import '../widgets/glass_bubble.dart';
import '../widgets/notification_bell.dart' show ownOrderName;
import '../widgets/ui.dart';
import 'orders_board.dart';
import 'suppliers.dart' show MadeByField, Supplier;

// 3DEEZI Orders in the app: Create Order Form and Upload Your Order, native, on
// the same API as the website (drafts, file uploads with progress, one
// idempotent submit). See orders-api.md.

/// Opens the pay page: in the phone's own browser (Apple Pay, Google Pay), back
/// here when the app resumes; inside the app only if no browser opens. (Replaced in tests.)
Future<void> Function(BuildContext context, String url, String title)
openPayPage = openPayLink;

/// "A$1,870.00", the website's price style (money.dart); "To be confirmed" without an amount.
String _money(Object? amount, Object? currency) => moneyOr(amount, currency);

/// A quote's shipping that is a pick up at no cost (the price list's Pick up,
/// or the server's own): shown as "Pick up · Free", as the website's
/// freePickup. Servers without `priced` count as priced.
bool freePickup(Map? shipping) {
  if (shipping == null || shipping['priced'] == false) return false;
  final amount = double.tryParse('${shipping['amount'] ?? ''}');
  if (amount == null || amount != 0) return false;
  return '${shipping['destination'] ?? ''}'.toUpperCase() == 'PICKUP' ||
      RegExp(
        r'^pick ?up$',
        caseSensitive: false,
      ).hasMatch('${shipping['name'] ?? ''}'.trim());
}

/// The price for the review step, from the server's quote (or "Quote required" with the reasons).
class PriceBox extends StatefulWidget {
  const PriceBox(this.c, this.body, {super.key});
  final AppController c;
  final Map<String, dynamic> body;
  @override
  State<PriceBox> createState() => _PriceBoxState();
}

class _PriceBoxState extends State<PriceBox> {
  late final Future<Map<String, dynamic>> _quote = widget.c.api.pricingQuote(
    widget.body,
  );
  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: _quote,
    builder: (context, snap) {
      final q = snap.data;
      if (snap.connectionState != ConnectionState.done)
        return const LinearProgressIndicator();
      if (q == null)
        return const Text(
          'Price confirmed by 3DEEZI after review.',
          style: TextStyle(color: Palette.muted),
        );
      if (q['status'] != 'priced') {
        final reasons = ((q['reasons'] as List?) ?? const [])
            .map((r) => '${(r as Map)['message']}')
            .join(' ');
        return Text(
          'Quote required. ${reasons.isEmpty ? '3DEEZI confirms the price after review.' : reasons}',
          key: const Key('quote-required'),
          style: const TextStyle(color: Color(0xffffbc75)),
        );
      }
      final lines = [
        ...((q['lines'] as List?) ?? const []),
        ...((q['extras'] as List?) ?? const []),
      ].cast<Map<String, dynamic>>();
      final shipping = (q['shipping'] as Map?)?['amount'];
      final tax = q['tax'] as Map?;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final l in lines)
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${l['name']} x ${l['quantity']}',
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
                Text(
                  _money(l['total'], q['currency']),
                  style: const TextStyle(fontSize: 13),
                ),
              ],
            ),
          // Picked up at no cost: "Pick up · Free", not "Shipping A$0.00"
          // (QA10 2026-11-11, as the website's freePickup).
          if (shipping != null && freePickup(q['shipping'] as Map?))
            const Row(
              key: Key('price-pickup-free'),
              children: [
                Expanded(
                  child: Text('Pick up', style: TextStyle(fontSize: 13)),
                ),
                Text('Free', style: TextStyle(fontSize: 13)),
              ],
            )
          else if (shipping != null)
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Shipping${(q['shipping'] as Map?)?['name'] != null ? ' · ${(q['shipping'] as Map)['name']}' : ''}',
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
                Text(
                  _money(shipping, q['currency']),
                  style: const TextStyle(fontSize: 13),
                ),
              ],
            ),
          for (final d
              in ((q['discounts'] as List?) ?? const [])
                  .cast<Map<String, dynamic>>())
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${d['name']}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xff3ddc84),
                    ),
                  ),
                ),
                Text(
                  '-${_money(d['amount'], q['currency'])}',
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xff3ddc84),
                  ),
                ),
              ],
            ),
          if (tax?['amount'] != null)
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${tax?['name'] ?? 'Tax'}',
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
                Text(
                  _money(tax?['amount'], q['currency']),
                  style: const TextStyle(fontSize: 13),
                ),
              ],
            ),
          const Divider(),
          Row(
            children: [
              const Expanded(
                child: Text(
                  'TOTAL',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              Text(
                _money(q['total'], q['currency']),
                key: const Key('quote-total'),
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  color: Palette.cyan,
                ),
              ),
            ],
          ),
          if ((q['discount_code'] as Map?)?['valid'] == false)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                '${(q['discount_code'] as Map)['message'] ?? 'This code isn’t valid.'}',
                key: const Key('code-error'),
                style: const TextStyle(color: Color(0xffff8a8a), fontSize: 12),
              ),
            ),
        ],
      );
    },
  );
}

/// Destination names the price list may not have (the server's PricingService::DESTINATIONS).
const _destinationNames = {
  'AU': 'Australia',
  'NZ': 'New Zealand',
  'INTL': 'International',
  'PICKUP': 'Pick up',
};

/// The review's price choices (payments-api.md R3): delivery destination, extras and a discount code with Apply.
/// Each change goes to [onChanged], which asks for the price again.
class PriceChoices extends StatefulWidget {
  const PriceChoices(
    this.c,
    this.value,
    this.onChanged, {
    super.key,
    this.choice,
  });
  final AppController c;
  final Map<String, dynamic> value;
  final ValueChanged<Map<String, dynamic>> onChanged;

  /// Section 1's Deliver / Pick up and country as a destination ("PICKUP", "AU", "NZ", "INTL"; null before they are
  /// chosen), which prices the order when nothing is chosen here. As the website's PricingChoices (task 9.97): "Delivery
  /// to" shows the destination the price is for (the one chosen here, else this, else the price list's default; one the
  /// list has no price for shows as itself), and a picked-up order has nothing to deliver, so no list.
  final String? choice;
  @override
  State<PriceChoices> createState() => _PriceChoicesState();
}

class _PriceChoicesState extends State<PriceChoices> {
  late final Future<Map<String, dynamic>> _options = widget.c.api
      .pricingOptions();
  late final _code = TextEditingController(
    text: '${widget.value['discount_code'] ?? ''}',
  );

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
      final destinations = ((o['destinations'] as List?) ?? const [])
          .cast<Map<String, dynamic>>();
      final extras = ((o['extras'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .where((e) => e['auto'] != true)
          .toList();
      final chosen = {
        ...((widget.value['extras'] as List?) ?? const []).map((e) => '$e'),
      };
      // The price list's own code for a destination: its code, or a known place under another code (as the server).
      String? listed(Object? code) {
        final up = '${code ?? ''}'.trim().toUpperCase();
        if (up.isEmpty) return null;
        final named = _destinationNames[up]?.toLowerCase();
        return destinations
                .where((d) => '${d['code']}'.toUpperCase() == up)
                .map((d) => '${d['code']}')
                .firstOrNull ??
            (named == null
                ? null
                : destinations
                      .where(
                        (d) => '${d['name']}'.trim().toLowerCase() == named,
                      )
                      .map((d) => '${d['code']}')
                      .firstOrNull);
      }

      final picked = '${widget.value['destination'] ?? ''}'.trim();
      final pickup =
          widget.choice?.toUpperCase() == 'PICKUP' &&
          (picked.isEmpty ||
              picked.toUpperCase() == 'PICKUP' ||
              picked == listed('PICKUP'));
      final shown = picked.isNotEmpty
          ? picked
          : '${widget.choice ?? o['default_destination'] ?? (destinations.isEmpty ? '' : destinations.first['code'])}';
      final selected =
          listed(shown) ?? (shown.isEmpty ? null : shown.toUpperCase());
      final options = [
        if (selected != null &&
            !destinations.any((d) => '${d['code']}' == selected))
          {'code': selected, 'name': _destinationNames[selected] ?? selected},
        ...destinations,
      ];
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (pickup)
            Padding(
              key: const Key('price-pickup'),
              padding: const EdgeInsets.only(bottom: 6),
              child: const InputDecorator(
                decoration: InputDecoration(
                  labelText: 'Delivery to',
                  isDense: true,
                ),
                child: Text('Pick up from 3DEEZI (no delivery)'),
              ),
            )
          else if (options.isNotEmpty)
            // Shown again when the destination changes from outside (section 1's Deliver / Pick up and country).
            KeyedSubtree(
              key: ValueKey('destination-$selected'),
              child: DropdownButtonFormField<String>(
                key: const Key('price-destination'),
                isExpanded: true,
                initialValue: selected,
                decoration: const InputDecoration(
                  labelText: 'Delivery to',
                  isDense: true,
                ),
                items: [
                  for (final d in options)
                    DropdownMenuItem(
                      value: '${d['code']}',
                      child: Text('${d['name']}'),
                    ),
                ],
                onChanged: (v) => _set('destination', v),
              ),
            ),
          for (final e in extras)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              value: chosen.contains('${e['code']}'),
              title: Text('${e['name']}'),
              subtitle: Text(
                '${_money(e['unit_price'], o['currency'])} ${e['unit'] == 'order'
                    ? 'per order'
                    : e['unit'] == 'player'
                    ? 'per name / number'
                    : 'per garment'}',
                style: const TextStyle(fontSize: 11),
              ),
              onChanged: (on) => _set('extras', [
                ...chosen.where((x) => x != '${e['code']}'),
                if (on == true) '${e['code']}',
              ]),
            ),
          if (o['discount_codes'] == true)
            Row(
              children: [
                Expanded(
                  child: TextField(
                    key: const Key('price-code'),
                    controller: _code,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      labelText: 'Discount code',
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () =>
                      _set('discount_code', _code.text.trim().toUpperCase()),
                  child: const Text('Apply'),
                ),
              ],
            ),
          const SizedBox(height: 10),
        ],
      );
    },
  );
}

/// The payment pill and, for an unpaid invoice, Pay now (a 2-hour pay link, in the phone's browser); [onBack] refreshes afterwards.
class PaymentStrip extends StatelessWidget {
  const PaymentStrip(this.c, this.payment, {super.key, this.onBack});
  final AppController c;
  final Map<String, dynamic>? payment;
  final VoidCallback? onBack;
  @override
  Widget build(BuildContext context) {
    final p = payment;
    if (p == null) return const SizedBox.shrink();
    final tone =
        {
          'amber': const Color(0xffffb648),
          'green': const Color(0xff3ddc84),
          'blue': const Color(0xff3b8cff),
        }['${p['tone']}'] ??
        Palette.muted;
    final canPay = p['can_pay'] == true && p['invoice_number'] != null;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        children: [
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                color: tone.withValues(alpha: .14),
                border: Border.all(color: tone.withValues(alpha: .6)),
              ),
              child: Text(
                '${p['label'] ?? p['status']}',
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: tone,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              canPay && p['amount_due'] != null
                  ? '${_money(p['amount_due'], p['currency'])} due'
                  : '',
              style: const TextStyle(fontSize: 12),
            ),
          ),
          if (canPay)
            FilledButton(
              onPressed: () async {
                try {
                  final url = await c.api.invoicePayLink(
                    '${p['invoice_number']}',
                  );
                  if (!context.mounted) return;
                  await openPayPage(context, url, 'Pay now');
                  // Back in the app: read the invoice again (the pay page has checked the payment by then).
                  if (context.mounted) onBack?.call();
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
Future<({String name, Uint8List bytes})?> Function(String kind) pickOrderFile =
    _pick;

/// Whether [pickOrderFile] is the real picker (tests replace it).
bool get pickOrderFileIsDefault => identical(pickOrderFile, _pick);

Future<({String name, Uint8List bytes})?> _pick(String kind) async {
  // (iOS needs the type identifiers, else openFile throws and nothing opens.)
  final file = await openFile(
    acceptedTypeGroups: [
      XTypeGroup(
        label: kind == 'order_form' ? 'Order forms' : 'Artwork',
        extensions: kind == 'order_form'
            ? [
                'pdf',
                'xlsx',
                'xls',
                'csv',
                'ods',
                'doc',
                'docx',
                'txt',
                'png',
                'jpg',
                'jpeg',
                'webp',
                'heic',
              ]
            : [
                'png',
                'jpg',
                'jpeg',
                'webp',
                'gif',
                'svg',
                'pdf',
                'ai',
                'eps',
                'cdr',
                'psd',
                'tif',
                'tiff',
                'heic',
              ],
        uniformTypeIdentifiers: kind == 'order_form'
            ? const [
                'com.adobe.pdf',
                'org.openxmlformats.spreadsheetml.sheet',
                'com.microsoft.excel.xls',
                'public.comma-separated-values-text',
                'org.oasis-open.opendocument.spreadsheet',
                'com.microsoft.word.doc',
                'org.openxmlformats.wordprocessingml.document',
                'public.plain-text',
                'public.image',
              ]
            : const ['public.image', 'com.adobe.pdf', 'public.data'],
      ),
    ],
  );
  if (file == null) return null;
  return (name: file.name, bytes: await file.readAsBytes());
}

const _garments = {
  'jersey': 'Jersey',
  'shorts': 'Shorts',
  'tee': 'Training tee',
  'singlet': 'Singlet',
  'polo': 'Polo',
  'hoodie': 'Hoodie',
  'jacket': 'Jacket',
  'warmup': 'Warm-up top',
  'pants': 'Track pants',
  'socks': 'Socks',
  'cap': 'Cap',
  'other': 'Other',
};

/// The order row for a saved design's garment (the Studio's name or id): a
/// full kit starts as its jersey, a zip hoodie is a hoodie, the pocket polo a
/// polo, as on the website's order form.
String orderGarmentFor(String garment) {
  final id = ProjectSync.garments[garment] ?? garment.toLowerCase();
  // (The netball dress is ordered on a singlet row, named "Netball dress".)
  final row =
      const {
        'fullkit': 'jersey',
        'ziphoodie': 'hoodie',
        'pocketpolo': 'polo',
        'varsity': 'jacket',
        'trackjacket': 'jacket',
        'netball-dress': 'singlet',
      }[id] ??
      id;
  return _garments.containsKey(row) ? row : 'jersey';
}

/// Whether an order row is a saved design's own garment, so the design's product name ("Netball bibs", task 9.99) may
/// name it, as the server's Order::isDesignRow and the website's isDesignRow (SP/W1/price-format.md): the same
/// garment, or the row the order form lists it under (a zip hoodie is a hoodie row, the pocket polo a polo row, the
/// varsity and track jackets a jacket row). A full kit names no single row (its jersey and shorts keep their own
/// names); a design on any other garment's row keeps that garment's name ("Netball bibs" on a jersey row is a Jersey).
/// [designGarment]: the Studio's garment name ("Singlet") or id ("singlet").
bool isDesignRow(String designGarment, String rowGarment) {
  final id =
      ProjectSync.garments[designGarment] ?? designGarment.trim().toLowerCase();
  return id.isNotEmpty &&
      (const {
                'ziphoodie': 'hoodie',
                'pocketpolo': 'polo',
                'varsity': 'jacket',
                'trackjacket': 'jacket',
                'netball-dress': 'singlet',
              }[id] ??
              id) ==
          rowGarment;
}

/// The name a saved design gives an order row ("Netball bibs"), or '' when it has none or the row is another garment.
String designRowName(
  String designGarment,
  String productName,
  String rowGarment,
) {
  final product = productName.trim();
  return product.isNotEmpty && isDesignRow(designGarment, rowGarment)
      ? product
      : '';
}

/// Whether a saved design is the netball dress (ordered on a singlet row, in
/// womens sizes W8 to W24).
bool isDressDesign(Project p) =>
    (ProjectSync.garments[p.kit.garment] ??
        p.kit.garment.trim().toLowerCase()) ==
    'netball-dress';

/// A saved design's product name: its own ("Netball bibs"), else the product
/// its garment is: "Netball dress" (a dress made in the app's Studio has no
/// name of its own; LINKTEST r3: the row, review and summary said "Singlet").
String designProduct(Project p) {
  final own = p.kit.productName.trim();
  if (own.isNotEmpty) return own;
  return isDressDesign(p) ? 'Netball dress' : '';
}

/// The fits (Order::FITS): the fit chooses the row's sizes (order_sizes.dart).
const _fits = fitNames;
const _maxBytes = 25 * 1024 * 1024;

/// The small links under a garment's sizes ("+ 5XL–8XL", "+ Womens sizes").
final _smallLink = TextButton.styleFrom(
  padding: const EdgeInsets.symmetric(horizontal: 6),
  minimumSize: const Size(0, 32),
  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
  visualDensity: VisualDensity.compact,
  textStyle: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
);

String _newKey() =>
    'app-${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 30)}';

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

  /// "Custom…" (client 2026-11-02, as on the website): a sport typed, and
  /// the name of an Other garment ("Bowling shirt").
  bool custom = false;
  String sport = '', label = '';

  /// "More sizes": the fit's rare sizes (5XL–8XL, W22–W24, 2Y–4Y).
  bool more = false;
  final Map<String, int> sizes = {};

  /// Artwork uploaded for this garment (step 3 "Artwork & files").
  final fileIds = <int>[];
  String players = '';

  /// A quantity read from the notes with no sizes ("5 hoodies"; QA10
  /// 2026-11-11, as the website's form): the row shows "5 · sizes needed"
  /// until its sizes are added. Never sent.
  int wanted = 0;
  int get total => sizes.values.fold(0, (a, b) => a + b);

  /// Built from the notes, its sizes still to fill.
  bool get sizesNeeded => wanted > 0 && total == 0;

  /// "Hoodie", or the name it was given ("Netball dress").
  String get name =>
      label.trim().isNotEmpty ? label.trim() : _garments[garment] ?? 'Garment';
  Map<String, dynamic> toJson() => {
    'garment': garment,
    if (customName(sport).isNotEmpty) 'sport': customName(sport),
    'fit': fit,
    // The garment's name: typed for an Other garment, or the Order
    // Assistant's design ("Line Uniform Polo – Annie More – Turquoise").
    if (label.trim().isNotEmpty)
      'label': label.trim().length > 60
          ? label.trim().substring(0, 60)
          : label.trim(),
    if (project != null) 'project_id': project,
    if (fileIds.isNotEmpty) 'file_ids': fileIds,
    'sizes': {
      for (final e in sizes.entries)
        if (e.value > 0) e.key: e.value,
    },
    if (players.trim().isNotEmpty)
      'players': [
        for (final line in const LineSplitter().convert(players))
          if (line.trim().isNotEmpty)
            () {
              final cells = line
                  .split(RegExp(r'[,\t;]'))
                  .map((s) => s.trim())
                  .toList();
              final number = cells.firstWhere(
                (s) => RegExp(r'^\d{1,3}$').hasMatch(s),
                orElse: () => '',
              );
              // "M", "xxl", "10y", "W12" (order_sizes.dart siteSize).
              final sizeCell = cells.firstWhere(
                (s) => s != number && siteSize(s) != null,
                orElse: () => '',
              );
              final size = sizeCell.isEmpty ? '' : siteSize(sizeCell)!;
              final name = cells
                  .where((s) => s != number && s != sizeCell)
                  .join(' ');
              return {
                'name': name,
                'number': number,
                if (size.isNotEmpty) 'size': size,
              };
            }(),
      ],
  };
}

/// What both screens share: the contact fields, the draft, uploads, review and confirmation.
mixin _OrderEntry<T extends StatefulWidget> on State<T> {
  AppController get c;
  String get kind;
  final name = TextEditingController(),
      email = TextEditingController(),
      phone = TextEditingController(),
      team = TextEditingController(),
      notes = TextEditingController();
  final uploads = <_Upload>[];
  int? draftId;
  final key = _newKey();
  String step = 'edit';

  /// The form's sections (1, 2, 3), for the step bar (client pictures
  /// images/337, 339): it lights the one on screen and scrolls to a tapped one.
  final sectionKeys = [GlobalKey(), GlobalKey(), GlobalKey()];
  int sectionOnScreen = 0;

  /// One step per screen (client 2026-11-03, images/337, 339): the page of
  /// the form shown (Create: 0 Details, 1 Garments, 2 Artwork; Upload:
  /// 0 Upload, 1 Check details). Review is its own screen (step 'review').
  int page = 0;

  /// The Review step: checks everything, then opens the review.
  void startReview();

  /// Back / Continue under each page.
  Widget pageButtons({
    required bool last,
    required VoidCallback onNext,
    String? nextLabel,
  }) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: busy ? null : saveDraft,
              child: const Text('Save draft'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: GradientButton(
              key: Key(last ? 'order-review-button' : 'order-continue'),
              label: last ? 'REVIEW ORDER' : (nextLabel ?? 'CONTINUE'),
              compact: true,
              onPressed: last ? startReview : onNext,
            ),
          ),
        ],
      ),
      // (Once in the app bar: the bubble pages keep their header plain.)
      TextButton.icon(
        key: const Key('order-open-site'),
        onPressed: () =>
            openSitePage(context, c.api.sitePage(websitePath), websiteTitle),
        icon: const Icon(Icons.open_in_new, size: 16),
        label: const Text('Open on the website'),
      ),
      if (page > 0)
        TextButton.icon(
          key: const Key('order-back'),
          onPressed: () => setState(() {
            page--;
            error = null;
          }),
          icon: const Icon(Icons.arrow_back, size: 18),
          label: Text('Back to ${stepNames[page - 1].toLowerCase()}'),
        ),
    ],
  );

  /// This form on the website (Open on the website).
  String get websitePath;
  String get websiteTitle;

  /// The step names: Create order (Details > Garments > Artwork > Review) or
  /// Upload order (Upload > Check details > Review: its sections 1-2 are
  /// "Upload", section 3 "Check details").
  List<String> get stepNames;

  /// The section a step scrolls to.
  int sectionOfStep(int i) => i;
  int stepOfSection(int section) => section;

  bool _sectionCheck = false;

  /// After the frame (positions are only read once laid out): which section
  /// is at the top of the screen.
  bool watchSections(ScrollNotification n) {
    if (step != 'edit' || _sectionCheck) return false;
    _sectionCheck = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _sectionCheck = false;
      if (!mounted || step != 'edit') return;
      var on = 0;
      for (final (i, k) in sectionKeys.indexed) {
        final box = k.currentContext?.findRenderObject();
        if (box is RenderBox &&
            box.attached &&
            box.hasSize &&
            box.localToGlobal(Offset.zero).dy < 260)
          on = i;
      }
      if (on != sectionOnScreen) setState(() => sectionOnScreen = on);
    });
    return false;
  }

  void goToStep(int i) {
    if (i == stepNames.length - 1) return startReview();
    setState(() {
      step = 'edit';
      page = i;
      error = null;
    });
  }

  void scrollToSection(int i) {
    void scroll() {
      final target = sectionKeys[sectionOfStep(i)].currentContext;
      if (target != null) {
        Scrollable.ensureVisible(
          target,
          duration: const Duration(milliseconds: 300),
          alignment: 0.02,
        );
      }
    }

    if (step == 'review') {
      setState(() => step = 'edit');
      WidgetsBinding.instance.addPostFrameCallback((_) => scroll());
    } else {
      scroll();
    }
  }

  /// The bubble header over the form: title, its line and the step bar.
  Widget stepHeader(String title, String line) {
    final current = step == 'review' || step == 'done'
        ? stepNames.length - 1
        : page;
    // (Compact: the form keeps most of the screen; the title is in the app bar.)
    return Padding(
      // (In from the sides: clear of the bubble's top curve.)
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
      child: GlassCard(
        radius: 20,
        semanticsLabel: null,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(10, 6, 10, 8),
          child: Column(
            children: [
              Text(
                line,
                style: const TextStyle(
                  color: Color(0xffd3dee8),
                  fontSize: 12.5,
                ),
              ),
              const SizedBox(height: 6),
              OrderStepBar(
                names: stepNames,
                current: current,
                onTap: step == 'done' ? null : goToStep,
              ),
            ],
          ),
        ),
      ),
    );
  }

  String? error;
  bool busy = false;

  /// REVIEW & APPROVE ORDER's box ("I confirm the selected garments, sizes, quantities and final mockups are correct").
  bool approved = false;
  Map<String, dynamic>? placed;

  /// The review's price choices (each screen keeps its own).
  Map<String, dynamic> get pricing;
  set pricing(Map<String, dynamic> value);
  // Section 1's date required, Deliver or Pick up, and the address (client 2026-10-22; as on the website).
  DateTime? neededBy;
  String delivery = 'deliver', auState = '';
  final street = TextEditingController(),
      suburb = TextEditingController(),
      region = TextEditingController(),
      postcode = TextEditingController(),
      country = TextEditingController(text: 'Australia');
  String? autoDestination;

  Map<String, String> get address => {
    'street': street.text.trim(),
    'suburb': suburb.text.trim(),
    'state': isAustralia(country.text) ? auState : region.text.trim(),
    'postcode': postcode.text.trim(),
    'country': country.text.trim(),
  };

  /// Section 1's destination as the server takes it when none is chosen (App\Support\OrderDelivery::destination).
  String? get choiceDestination {
    final c0 = country.text.trim();
    if (delivery == 'pickup') return 'PICKUP';
    if (delivery != 'deliver' || c0.isEmpty) return null;
    if (isAustralia(c0)) return 'AU';
    return RegExp(
          r'^(new zealand|nz|aotearoa)$',
          caseSensitive: false,
        ).hasMatch(c0)
        ? 'NZ'
        : 'INTL';
  }

  /// The choice the review's "Delivery to" was last set from (the details are on the review page now: a changed
  /// Deliver / Pick up or country sets it again).
  String? _presetFor;

  /// The review's "Delivery to" from section 1 (only a destination the price list has, and not one chosen there).
  Future<void> _presetDestination() async {
    try {
      final o = await c.api.pricingOptions();
      final list = ((o['destinations'] as List?) ?? const [])
          .whereType<Map>()
          .toList();
      String? find(String code, RegExp name) =>
          list
              .where((d) => '${d['code']}'.toUpperCase() == code)
              .map((d) => '${d['code']}')
              .firstOrNull ??
          list
              .where((d) => name.hasMatch('${d['name']}'))
              .map((d) => '${d['code']}')
              .firstOrNull;
      final c0 = country.text.trim();
      final dest = delivery == 'pickup'
          ? find('PICKUP', RegExp(r'pick\s*-?\s*up', caseSensitive: false))
          : isAustralia(c0)
          ? find('AU', RegExp(r'^australia', caseSensitive: false))
          : RegExp(
              r'^(new zealand|nz|aotearoa)$',
              caseSensitive: false,
            ).hasMatch(c0)
          ? find('NZ', RegExp('new zealand', caseSensitive: false))
          : find('INTL', RegExp('international', caseSensitive: false));
      // A destination set here before follows a changed choice (or is cleared, so the server takes it from the choice).
      if (mounted &&
          (pricing['destination'] == null ||
              pricing['destination'] == autoDestination)) {
        setState(() {
          autoDestination = dest;
          pricing = {...pricing}..remove('destination');
          if (dest != null) pricing['destination'] = dest;
        });
      }
    } catch (_) {
      // Chosen on the review instead.
    }
  }

  /// The usual production and delivery time in weeks (Admin › Settings, GET /orders/options): a sooner date required
  /// gets a gentle warning; the order can still be sent.
  int leadWeeks = defaultLeadWeeks;

  /// The "Made by" choices (GET /orders/options' `suppliers`, preferred suppliers): 3DEEZI first, then Mantis and the
  /// approved suppliers. None on an older server: the order is then 3DEEZI's, with nothing to choose.
  List<Supplier> makers = const [];

  /// The makers have arrived (inside setState): the form can pick one.
  void makersLoaded() {}

  /// The order form's choices: the lead time and the makers.
  Future<void> loadOptions() async {
    try {
      final o = await c.api.orderOptions();
      final weeks = o['lead_time_weeks'];
      final found = Supplier.listOf(o['suppliers']);
      if (mounted) {
        setState(() {
          if (weeks is num) leadWeeks = weeks.toInt();
          makers = found;
          makersLoaded();
        });
      }
    } catch (_) {
      // The usual 4 weeks, made by 3DEEZI.
    }
  }

  /// What stops the order being sent from section 1 (mobile, date required, delivery or pick up), or null.
  String? deliveryProblem({bool dateOptional = false}) => uploadDetailsProblem(
    phone: phone.text,
    neededBy: neededBy,
    delivery: delivery,
    address: address,
    dateOptional: dateOptional,
  );

  /// Date required, Deliver or Pick up, and the delivery address.
  Widget _whenWhere() {
    final today = DateTime.now();
    final au = isAustralia(country.text);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OutlinedButton.icon(
          key: const Key('date-required'),
          style: OutlinedButton.styleFrom(
            alignment: Alignment.centerLeft,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          ),
          icon: const Icon(Icons.event, size: 18),
          label: Text(
            neededBy == null
                ? 'Date required: choose when you need the garments'
                : 'Date required: ${_dayText(neededBy!)}',
          ),
          onPressed: () async {
            final first = DateTime(today.year, today.month, today.day);
            final picked = await showDatePicker(
              context: context,
              firstDate: first,
              lastDate: first.add(const Duration(days: 730)),
              initialDate: neededBy != null && !neededBy!.isBefore(first)
                  ? neededBy!
                  : first.add(const Duration(days: 28)),
              helpText: 'Date required',
            );
            if (picked != null && mounted) setState(() => neededBy = picked);
          },
        ),
        if (leadWarningText(neededBy, leadWeeks) case final warning?)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              warning,
              key: const Key('lead-warning'),
              style: const TextStyle(color: Color(0xffffc27a), fontSize: 12),
            ),
          ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          children: [
            for (final (value, label, icon) in const [
              ('deliver', 'Deliver', Icons.local_shipping_outlined),
              ('pickup', 'Pick up', Icons.storefront_outlined),
            ])
              ChoiceChip(
                key: Key('delivery-$value'),
                avatar: Icon(icon, size: 18),
                label: Text(label),
                selected: delivery == value,
                onSelected: (_) => setState(() => delivery = value),
              ),
          ],
        ),
        const SizedBox(height: 10),
        if (delivery == 'pickup')
          const Text(
            'We’ll tell you when your order is ready to collect.',
            style: TextStyle(color: Palette.muted, fontSize: 12),
          )
        else ...[
          StreetAddressField(
            controller: street,
            suggest: c.api.addressSuggestions,
            onPick: (a) => setState(() {
              String get(String k) => '${a[k] ?? ''}'.trim();
              if (get('street').isNotEmpty) street.text = get('street');
              suburb.text = get('suburb');
              postcode.text = get('postcode');
              if (get('country').isNotEmpty) country.text = get('country');
              final state = get('state');
              if (isAustralia(country.text)) {
                auState = auStates.contains(state.toUpperCase())
                    ? state.toUpperCase()
                    : '';
              } else {
                region.text = state;
              }
            }),
          ),
          // (The review on the same page shows the address: it follows each change.)
          _field(suburb, 'Suburb / town', onChanged: (_) => setState(() {})),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: au
                    ? Padding(
                        key: const Key('address-state'),
                        padding: const EdgeInsets.only(bottom: 10),
                        child: DropdownButtonFormField<String>(
                          // Built again when the state is set from the order form (AI reader).
                          key: ValueKey('address-state-$auState'),
                          initialValue: auStates.contains(auState)
                              ? auState
                              : null,
                          isExpanded: true,
                          decoration: const InputDecoration(
                            labelText: 'State',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          items: [
                            for (final st in auStates)
                              DropdownMenuItem(value: st, child: Text(st)),
                          ],
                          onChanged: (v) => setState(() => auState = v ?? ''),
                        ),
                      )
                    : _field(region, 'State / region (optional)'),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _field(
                  postcode,
                  au ? 'Postcode' : 'Postcode (if any)',
                  keyboard: au ? TextInputType.number : null,
                  onChanged: (_) => setState(() {}),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: TextField(
              controller: country,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'Country',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
          ),
        ],
      ],
    );
  }

  void initContact() {
    name.text = c.user?.name ?? '';
    email.text = c.user?.email ?? '';
  }

  Map<String, dynamic> fields();

  Future<int> ensureDraft() async => draftId ??=
      ((await c.api.createOrderDraft(kind, fields()))['id'] as num).toInt();

  /// Download PDF / Download Excel on the review: the draft saved as it is
  /// now, then the order confirmation form's signed link opened (images/336).
  Future<void> downloadConfirmation(String which) async {
    try {
      if (draftId == null) {
        await ensureDraft();
      } else {
        await c.api.saveOrderDraft(draftId!, fields());
      }
      if (which == 'link') {
        // Copy form link (client 394): the editable form on the website, for
        // the signed-in owner and 3DEEZI admins.
        final site = c.api.baseUrl.replaceFirst(RegExp(r'/api(/v1)?/?$'), '');
        await Clipboard.setData(
          ClipboardData(text: '$site/orders/new?draft=$draftId'),
        );
        if (mounted) {
          showToast(
            context,
            'Form link copied. You and 3DEEZI admins can open it to edit this order form.',
          );
        }
        return;
      }
      final share = which == 'share';
      final links = await c.api.orderConfirmationLinks(draftId!, share: share);
      final url = '${links[share ? 'pdf' : which] ?? ''}';
      if (url.isEmpty || !mounted) return;
      if (share) {
        // Share order form: a read-only link (the form's page, with PDF / Excel), 30 days.
        await Clipboard.setData(ClipboardData(text: url));
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Link copied. Anyone with it can view this order form (read-only) for 30 days.',
            ),
          ),
        );
        return;
      }
      await openSitePage(context, url, 'Order confirmation');
    } on ApiException catch (e) {
      if (mounted) setState(() => error = e.message);
    }
  }

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

  Future<void> addFile(
    String fileKind, {
    _Upload? replacing,
    bool picture = false,
  }) async {
    // Phones: artwork comes from the photo library, the camera or Files (the
    // same sheet as Artwork to 3D); the Files-only picker did nothing on an
    // iPhone (user 2026-11-03).
    final phone =
        !kIsWeb &&
        (defaultTargetPlatform == TargetPlatform.iOS ||
            defaultTargetPlatform == TargetPlatform.android);
    final picked =
        // A screenshot or photo of the order (Paste your order here) too.
        phone &&
            (fileKind == 'artwork' || picture) &&
            identical(pickOrderFile, _pick)
        ? await pickArtwork(context)
        : await pickOrderFile(fileKind);
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
      if (replacing?.file != null)
        await c.api.removeOrderDraftFile(
          id,
          (replacing!.file!['id'] as num).toInt(),
        );
      final file = await c.api.uploadOrderFile(
        id,
        picked.bytes,
        filename: picked.name,
        kind: fileKind,
        onProgress: (p) {
          if (mounted) setState(() => upload.progress = p);
        },
      );
      if (mounted) setState(() => upload.file = file);
      if (mounted) onUploaded(upload);
    } on ApiException catch (e) {
      if (mounted) setState(() => upload.error = e.message);
    }
  }

  /// A file has arrived on the draft (the upload screen then has 3DEEZI AI read an order form).
  void onUploaded(_Upload upload) {}

  Future<void> removeFile(_Upload upload) async {
    setState(() => uploads.remove(upload));
    if (draftId != null && upload.file != null) {
      try {
        await c.api.removeOrderDraftFile(
          draftId!,
          (upload.file!['id'] as num).toInt(),
        );
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
      final order = await c.api.submitOrderDraft(id, key, {
        ...fields(),
        ...extra,
      });
      if (mounted)
        setState(() {
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
              Icon(
                u.error != null
                    ? Icons.error_outline
                    : u.file != null
                    ? Icons.check_circle
                    : Icons.upload_file,
                color: u.error != null ? const Color(0xffff6b78) : Palette.cyan,
                size: 20,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  u.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              IconButton(
                tooltip: 'Remove ${u.name}',
                onPressed: () => removeFile(u),
                icon: const Icon(Icons.close, size: 18),
              ),
            ],
          ),
          // The state and Replace on their own line, so the file name keeps
          // its room on a narrow phone (360 in the bubble).
          Row(
            children: [
              const SizedBox(width: 28),
              Expanded(
                child: Text(
                  u.error != null
                      ? 'Failed'
                      : u.file != null
                      ? 'Uploaded'
                      : '${(u.progress * 100).round()}%',
                  style: const TextStyle(color: Palette.muted, fontSize: 12),
                ),
              ),
              if (onReplace != null)
                TextButton(
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                  ),
                  onPressed: onReplace,
                  child: const Text('Replace'),
                ),
            ],
          ),
          if (u.file == null && u.error == null)
            LinearProgressIndicator(value: u.progress),
          if (u.error != null)
            Text(
              u.error!,
              style: const TextStyle(color: Color(0xffff8a8a), fontSize: 12),
            ),
        ],
      ),
    ),
  );

  Widget contactFields({bool withPhone = true}) => Column(
    children: [
      _field(name, 'Contact name'),
      _field(email, 'Email', keyboard: TextInputType.emailAddress),
      _field(team, 'Team / organisation'),
      if (withPhone) _field(phone, 'Phone', keyboard: TextInputType.phone),
    ],
  );

  /// The confirmation: the reference, View my order, and Pay now when an invoice is ready.
  Widget confirmation() {
    final o = placed!;
    final invoice = (o['invoice'] as Map?) ?? (o['payment'] as Map?);
    return ListView(
      key: const ValueKey('order-sent'),
      padding: const EdgeInsets.fromLTRB(4, 12, 4, 16),
      children: [
        orderSentHeader(kind == 'upload' ? 'Upload files' : 'Order details'),
        const Icon(Icons.check_circle, color: Palette.cyan, size: 56),
        const SizedBox(height: 12),
        const Text(
          'Order sent',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        const Text(
          'Your order reference',
          textAlign: TextAlign.center,
          style: TextStyle(color: Palette.muted),
        ),
        Text(
          '${o['number']}',
          key: const Key('order-reference'),
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w800,
            color: Palette.cyan,
          ),
        ),
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
          onPressed: () => Navigator.of(context).pushReplacement(
            MaterialPageRoute<void>(
              builder: (_) => OrderDetailScreen(c, (o['id'] as num).toInt()),
            ),
          ),
        ),
      ],
    );
  }

  Widget errorText() => error == null
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.only(top: 10),
          child: Text(
            error!,
            key: const Key('order-error'),
            style: const TextStyle(color: Color(0xffff8a8a)),
          ),
        );

  @override
  void dispose() {
    for (final t in [
      name,
      email,
      phone,
      team,
      notes,
      street,
      suburb,
      region,
      postcode,
      country,
    ]) {
      t.dispose();
    }
    super.dispose();
  }
}

/// Upload Your Order's mobile check, as the website and the server (App\Support\OrderDelivery) do it: Australian
/// (04xx xxx xxx, 0x xxxx xxxx, +61 4xx xxx xxx) or international (+ and 8 to 15 digits).
bool validMobile(String value) {
  final phone = value.trim();
  if (phone.isEmpty ||
      phone.length > 40 ||
      !RegExp(r'^\+?[\d\s().-]+$').hasMatch(phone))
    return false;
  final plain = phone.replaceAll(RegExp(r'[\s().-]'), '');
  if (plain.startsWith('+61')) return RegExp(r'^\+610?\d{9}$').hasMatch(plain);
  if (plain.startsWith('0')) return RegExp(r'^0\d{9}$').hasMatch(plain);
  return RegExp(r'^\+?\d{8,15}$').hasMatch(plain);
}

const auStates = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];
bool isAustralia(String country) =>
    const ['australia', 'au', 'aus'].contains(country.trim().toLowerCase());
String _ymd(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
String _dayText(DateTime d) =>
    '${const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d.weekday - 1]} ${d.day} ${const ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.month - 1]} ${d.year}';

/// The usual production and delivery time until the server answers (Admin › Settings).
const defaultLeadWeeks = 4;

/// The gentle warning for a date required sooner than the usual lead time (the order can still be sent), or null.
String? leadWarningText(DateTime? neededBy, int weeks, {DateTime? today}) {
  if (neededBy == null || weeks <= 0) return null;
  final now = today ?? DateTime.now();
  final day = DateTime(neededBy.year, neededBy.month, neededBy.day),
      start = DateTime(now.year, now.month, now.day);
  if (day.isBefore(start) ||
      !day.isBefore(start.add(Duration(days: weeks * 7))))
    return null;
  return 'Usually $weeks week${weeks == 1 ? '' : 's'} for production and delivery; we’ll confirm if we can meet your date.';
}

/// What stops an upload being sent (section 1: mobile, date required, delivery or pick up), or null. The server checks
/// the same on submit; a draft saves without them.
String? uploadDetailsProblem({
  required String phone,
  required DateTime? neededBy,
  required String delivery,
  required Map<String, String> address,
  DateTime? today,
  bool dateOptional = false,
}) {
  final now = today ?? DateTime.now();
  if (phone.trim().isEmpty) return 'Add a mobile number so we can reach you.';
  if (!validMobile(phone))
    return 'Enter a mobile number, e.g. 0412 345 678 or +61 412 345 678.';
  if (neededBy == null && !dateOptional) {
    return 'Choose the date you need the order by.';
  }
  if (neededBy != null &&
      DateTime(
        neededBy.year,
        neededBy.month,
        neededBy.day,
      ).isBefore(DateTime(now.year, now.month, now.day)))
    return 'The date required can’t be in the past.';
  if (delivery != 'deliver' && delivery != 'pickup')
    return 'Choose delivery or pick up.';
  if (delivery == 'pickup') return null;
  String get(String k) => (address[k] ?? '').trim();
  if (get('street').isEmpty) return 'Add the street address for delivery.';
  if (get('suburb').isEmpty) return 'Add the suburb or town.';
  if (get('country').isEmpty) return 'Add the country.';
  if (isAustralia(get('country'))) {
    if (!auStates.contains(get('state').toUpperCase()))
      return 'Choose the state.';
    if (!RegExp(r'^\d{4}$').hasMatch(get('postcode')))
      return 'Enter the 4-digit postcode.';
  } else if (get('postcode').isNotEmpty &&
      !RegExp(r'^[A-Za-z0-9 -]{2,10}$').hasMatch(get('postcode'))) {
    return 'Check the postcode.';
  }
  return null;
}

/// The delivery address on one line, or the pick-up note.
String deliveryLine(String delivery, Map<String, String> a) =>
    delivery == 'pickup'
    ? 'Pick up from 3DEEZI'
    : [
        a['street'] ?? '',
        [
          a['suburb'] ?? '',
          (a['state'] ?? '').toUpperCase(),
          a['postcode'] ?? '',
        ].map((v) => v.trim()).where((v) => v.isNotEmpty).join(' '),
        a['country'] ?? '',
      ].map((v) => v.trim()).where((v) => v.isNotEmpty).join(', ');

Widget _field(
  TextEditingController controller,
  String label, {
  int lines = 1,
  TextInputType? keyboard,
  ValueChanged<String>? onChanged,
}) => Padding(
  padding: const EdgeInsets.only(bottom: 10),
  child: TextField(
    controller: controller,
    maxLines: lines,
    keyboardType: keyboard,
    onChanged: onChanged,
    decoration: InputDecoration(
      labelText: label,
      border: const OutlineInputBorder(),
      isDense: true,
    ),
  ),
);

/// (Inset like the cards, so the bubble's curved fade never cuts its first letters.)
Widget _section(String text, {Key? key}) => Padding(
  key: key,
  padding: const EdgeInsets.fromLTRB(14, 18, 14, 10),
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

/// Create Order Form: contact and team, garments with sizes, names, artwork, instructions; review, then confirm.
class OrderFormScreen extends StatefulWidget {
  const OrderFormScreen(
    this.controller, {
    super.key,
    this.maker,
    this.assistant,
    this.review = false,
  });
  final AppController controller;

  /// The Order Assistant's order (Edit Order / Review & Approve): its title
  /// and the form rows it collated ({title, token, items}).
  final Map<String, dynamic>? assistant;

  /// Review & Approve: straight to the review (details still missing are
  /// asked for there).
  final bool review;

  /// The maker to start with (the Orders tab's "Make with Mantis"), by name;
  /// when it is not offered the order stays 3DEEZI's.
  final String? maker;
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

  /// The garment the next artwork upload is for (step 3 rows).
  _Row? artFor;
  String? sheetNote;

  @override
  void onUploaded(_Upload upload) {
    final id = (upload.file?['id'] as num?)?.toInt();
    if (upload.kind == 'artwork' && artFor != null && id != null) {
      setState(() => artFor!.fileIds.add(id));
      artFor = null;
    }
    if (upload.kind == 'order_form' && (notesPhoto || notesFile)) {
      notesPhoto = false;
      unawaited(readNotesPhoto());
      return;
    }
    if (upload.kind == 'order_form') {
      // "Have an order sheet?": the same reading as Upload order (OrderFormReader).
      final read = (upload.file?['suggested'] as Map?)?.cast<String, dynamic>();
      final items = ((read?['items'] as List?) ?? const [])
          .whereType<Map>()
          .map((m) => m.cast<String, dynamic>())
          .toList();
      setState(() {
        if (items.isNotEmpty) addItems(items);
        sheetNote = items.isEmpty
            ? 'No sizes found in the sheet: add them under Garments.'
            : 'Added ${read?['summary'] ?? '${items.length} garments'}.';
      });
    }
  }

  @override
  void startReview() => setState(() {
    // Two steps (client 2026-11-05): the garments, sizes and artwork are
    // checked here; the details are on step 2, with Review & approve.
    error = stepOneProblem();
    if (error == null) {
      step = 'review';
      approved = false;
      page = 0;
    } else {
      // Show why (user 2026-11-06): Review & Approve from the Order
      // Assistant chat opens this form at the top, and the message sat far
      // down under the artwork. Scroll to the section that needs it.
      final section = error == artworkProblem ? 1 : 0;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final target = sectionKeys[section].currentContext;
        if (mounted && target != null) {
          Scrollable.ensureVisible(
            target,
            duration: const Duration(milliseconds: 350),
            alignment: 0.02,
          );
        }
      });
    }
  });

  /// Where step 2's details start (Edit on the review, or a missing detail).
  final detailsKey = GlobalKey();

  static const artworkProblem =
      'Add your artwork: choose a saved design or upload your logo or artwork.';

  /// "Add your artwork" is shown, highlighted, in the artwork section (not
  /// under the form), and goes once artwork is added.
  bool get artworkMissing => error == artworkProblem && !hasArtwork;

  /// Step 1: garments with sizes, and artwork (both required).
  String? stepOneProblem() {
    if (total < 1) return 'Add at least one size and quantity.';
    // A garment from the notes with no sizes ("5 hoodies") is not dropped
    // quietly: its sizes are asked for, as on the website.
    if (rows.where((r) => r.sizesNeeded).firstOrNull case final r?) {
      return 'Add sizes and quantities for ${r.name} (${r.wanted} wanted), '
          'or remove it.';
    }
    if (!hasArtwork) return artworkProblem;
    return null;
  }

  /// Artwork: a saved design or artwork on a garment, artwork for the whole
  /// order, or the design pictures of the Order Assistant chat (Edit Order).
  bool get hasArtwork =>
      rows.any((r) => r.project != null || r.fileIds.isNotEmpty) ||
      uploads.any((u) => u.kind == 'artwork' && u.file != null) ||
      ((widget.assistant?['designs'] as num?) ?? 0) > 0;

  /// Continue: this page's checks (the review still checks everything).
  /// Contact and delivery may wait until Review (client 2026-11-05: "too
  /// much info to input"); only the garments and sizes are needed to go on.
  void nextPage() => setState(() {
    error = page == 0
        ? null
        : (total < 1 ? 'Add at least one size and quantity.' : null);
    if (error == null) page++;
  });

  /// "Paste your order here" (ORDERPASTE, client 2026-11-13, as the website;
  /// before: "Write or snap your notes", 2026-11-03): anything pasted or typed
  /// (notes like "XS x 3, S x 5", names with numbers and sizes, copied cells)
  /// and a screenshot or photo of the order, filled into the form.
  final notes = TextEditingController();
  bool notesPhoto = false, notesFile = false, building = false;

  /// The rows the last fill made: a second fill replaces them (392.jpg).
  final notesBuilt = <_Row>{};

  /// The garment already on the form that the last fill's sizes went on
  /// ("XS x 3, S x 5" names no garment), and its sizes before that fill.
  _Row? notesInto;
  Map<String, int> notesIntoWas = const {};
  String? notesNote;

  /// What the last fill did: a line per garment, the details it filled in,
  /// and what to check.
  List<String> filledLines = const [], filledDetails = const [];
  List<String> filledCheck = const [];

  /// The form before the last fill (Undo).
  ({
    List<_Row> rows,
    Map<TextEditingController, String> texts,
    DateTime? neededBy,
    String delivery,
    String auState,
  })?
  beforeFill;

  /// Fill my order: the text read on the server (3DEEZI AI when signed in,
  /// the built-in reading otherwise; a server from before 2026-11-13 only
  /// has the built-in notes reading).
  Future<void> buildFromNotes() async {
    final text = notes.text.trim();
    if (text.isEmpty) {
      setState(
        () => notesNote =
            'Paste or type your order first (e.g. "XS x 3, S x 5, M x 5"), or add a screenshot or photo of it.',
      );
      return;
    }
    setState(() {
      building = true;
      notesNote = c.api.token != null
          ? '3DEEZI AI is reading your order…'
          : 'Reading your order…';
    });
    try {
      Map<String, dynamic> read;
      try {
        read = await c.api.fillOrder(text);
      } on ApiException catch (e) {
        if (e.status != 404 && e.status != 405) rethrow;
        read = await c.api.readOrderNotes(text);
      }
      applyNotes(read);
    } on ApiException catch (e) {
      if (mounted) setState(() => notesNote = e.message);
    } finally {
      if (mounted) setState(() => building = false);
    }
  }

  /// A screenshot, photo or file of the order: uploaded as an order form,
  /// then read by 3DEEZI AI.
  Future<void> readNotesPhoto() async {
    if (draftId == null) return;
    setState(() {
      building = true;
      notesNote = '3DEEZI AI is reading your order…';
    });
    try {
      final d = await c.api.readOrderDraft(draftId!);
      final items = <Map<String, dynamic>>[];
      final unknown = <String>[];
      Map<String, dynamic>? form;
      var ai = false;
      for (final s
          in ((d['suggested'] as List?) ?? const []).whereType<Map>()) {
        // A photo is read by AI; an uploaded order form file by any reader.
        if (s['source'] != 'ai' && !notesFile) continue;
        ai = ai || s['source'] == 'ai';
        form ??= (s['form'] as Map?)?.cast<String, dynamic>();
        items.addAll(
          ((s['items'] as List?) ?? const []).whereType<Map>().map(
            (m) => m.cast<String, dynamic>(),
          ),
        );
        unknown.addAll(((s['unknown'] as List?) ?? const []).map((u) => '$u'));
      }
      notesFile = false;
      applyNotes({
        'items': items,
        'unknown': unknown,
        if (form != null) 'form': form,
        'source': ai ? 'ai' : 'reader',
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => notesNote = e.message);
    } finally {
      if (mounted) setState(() => building = false);
    }
  }

  _Row _copyRow(_Row r) => _Row()
    ..garment = r.garment
    ..fit = r.fit
    ..project = r.project
    ..custom = r.custom
    ..sport = r.sport
    ..label = r.label
    ..more = r.more
    ..sizes.addAll(r.sizes)
    ..fileIds.addAll(r.fileIds)
    ..players = r.players
    ..wanted = r.wanted;

  /// Undo the last fill: the garments, contact and delivery as they were.
  void undoLastFill() {
    final was = beforeFill;
    if (was == null) return;
    setState(() {
      rows
        ..clear()
        ..addAll(was.rows);
      was.texts.forEach((ctl, value) => ctl.text = value);
      neededBy = was.neededBy;
      delivery = was.delivery;
      auState = was.auState;
      notesBuilt.clear();
      notesInto = null;
      beforeFill = null;
      notesNote = null;
      filledLines = filledDetails = filledCheck = const [];
    });
  }

  /// The team, contact, date and delivery written in the order (3DEEZI AI):
  /// only the empty fields. Returns what was filled.
  List<String> _fillDetails(Map<String, dynamic>? form) {
    if (form == null) return const [];
    final done = <String>[];
    String said(String k) => '${form[k] ?? ''}'.trim();
    void take(TextEditingController ctl, String value, String what) {
      if (value.isNotEmpty && ctl.text.trim().isEmpty) {
        ctl.text = value;
        done.add(what);
      }
    }

    take(team, said('team_name'), 'team name');
    take(name, said('contact_name'), 'contact name');
    take(email, said('contact_email'), 'email');
    take(phone, said('phone'), 'mobile');
    final date = DateTime.tryParse(said('needed_by'));
    final today = DateUtils.dateOnly(DateTime.now());
    if (neededBy == null && date != null && !date.isBefore(today)) {
      neededBy = date;
      done.add('date required');
    }
    final empty =
        street.text.trim().isEmpty &&
        suburb.text.trim().isEmpty &&
        postcode.text.trim().isEmpty;
    final at = ((form['address'] as Map?) ?? const {}).map(
      (k, v) => MapEntry('$k', '${v ?? ''}'.trim()),
    );
    if (said('delivery') == 'pickup' && empty) {
      delivery = 'pickup';
      done.add('pick up');
    } else if (empty &&
        ['street', 'suburb', 'postcode'].any((k) => (at[k] ?? '').isNotEmpty)) {
      delivery = 'deliver';
      street.text = at['street'] ?? '';
      suburb.text = at['suburb'] ?? '';
      postcode.text = at['postcode'] ?? '';
      if ((at['country'] ?? '').isNotEmpty) country.text = at['country']!;
      final state = (at['state'] ?? '').toUpperCase();
      if (isAustralia(country.text)) {
        if (auStates.contains(state)) auState = state;
      } else {
        region.text = at['state'] ?? '';
      }
      done.add('delivery address');
    }
    return done;
  }

  void applyNotes(Map<String, dynamic> read) {
    final items = ((read['items'] as List?) ?? const [])
        .whereType<Map>()
        .map((m) => m.cast<String, dynamic>())
        .toList();
    // "5 hoodies" (a garment and how many, no sizes; QA10 2026-11-11, as the
    // website): a row of its own with the sizes to fill, not only a line
    // under Please check. (Servers before 2026-11-11 send no `unsized`.)
    final unsized = ((read['unsized'] as List?) ?? const [])
        .whereType<Map>()
        .map((m) => m.cast<String, dynamic>())
        .toList();
    final unsizedText = {for (final u in unsized) '${u['text'] ?? ''}'};
    final unknown = ((read['unknown'] as List?) ?? const [])
        .map((u) => '$u')
        .where((u) => !unsizedText.contains(u))
        .toList();
    if (!mounted) return;
    final built = items.isNotEmpty || unsized.isNotEmpty;
    final noSizes = <String>[];
    final ai = read['source'] == 'ai';
    setState(() {
      filledLines = filledDetails = const [];
      if (built) {
        beforeFill = (
          rows: [for (final r in rows) _copyRow(r)],
          texts: {
            for (final ctl in [
              team,
              name,
              email,
              phone,
              street,
              suburb,
              region,
              postcode,
              country,
            ])
              ctl: ctl.text,
          },
          neededBy: neededBy,
          delivery: delivery,
          auState: auState,
        );
        rows.removeWhere(notesBuilt.contains);
        // The garment the last fill put its sizes on, as it was before.
        final last = notesInto;
        if (last != null && rows.contains(last)) {
          last.sizes
            ..clear()
            ..addAll(notesIntoWas);
        }
        notesInto = null;
        final before = rows.toSet();
        // No garment named ("XS x 3, S x 5 …", order 537): the sizes go on the
        // garment already on the form (its design and sport stay).
        final into =
            read['garment_named'] == false &&
                items.length == 1 &&
                unsized.isEmpty
            ? (last != null && rows.contains(last) && last.total == 0
                  ? last
                  : rows
                        .where((r) => r.total == 0 && r.players.trim().isEmpty)
                        .firstOrNull)
            : null;
        final changed = <_Row>[];
        if (into != null) {
          final sizes = ((items.first['sizes'] as Map?) ?? const {}).map(
            (k, v) => MapEntry('$k', (v as num).toInt()),
          );
          notesInto = into;
          notesIntoWas = Map.of(into.sizes);
          into
            ..sizes.clear()
            ..sizes.addAll(sizes)
            ..wanted = 0;
          final players = [
            for (final p
                in ((items.first['players'] as List?) ?? const [])
                    .whereType<Map>())
              [
                '${p['name'] ?? ''}'.trim(),
                '${p['number'] ?? ''}'.trim(),
                '${p['size'] ?? ''}'.trim(),
              ].join(', '),
          ];
          if (players.isNotEmpty) into.players = players.join('\n');
          final fit = fitFromSizes(sizes);
          if (fit != null && fit != 'mens') into.fit = fit;
          changed.add(into);
        } else {
          addItems(items);
          if (items.isEmpty && rows.length == 1 && rows.first.total == 0) {
            rows.clear();
          }
        }
        for (final u in unsized) {
          final garment = _garments.containsKey(u['garment'])
              ? '${u['garment']}'
              : 'other';
          final said = '${u['label'] ?? ''}'.trim();
          final label = said.isNotEmpty
              ? said
              : garment == 'other'
              ? '${u['name'] ?? u['text'] ?? ''}'.trim()
              : '';
          final row = _Row()
            ..garment = garment
            ..label = label.length > 60 ? label.substring(0, 60) : label
            // A dress's sizes are womens sizes.
            ..fit = _fits.containsKey(u['fit'])
                ? '${u['fit']}'
                : RegExp('dress', caseSensitive: false).hasMatch(label)
                ? 'womens'
                : 'mens'
            ..wanted = ((u['qty'] as num?)?.toInt() ?? 1).clamp(1, 10000);
          rows.add(row);
          final size = '${u['size'] ?? ''}'.trim();
          noSizes.add(
            '${row.name} × ${row.wanted}: ${size.isNotEmpty ? 'size "$size" is not one of our sizes, please choose the sizes' : 'no sizes given, please add them'}',
          );
        }
        notesBuilt
          ..clear()
          ..addAll(rows.where((r) => !before.contains(r)));
        changed.addAll(notesBuilt);
        filledLines = [
          for (final r in changed)
            '${r.name}: ${r.total > 0 ? '${_sizesLine(r.sizes)} (${r.total})' : '${r.wanted}, sizes to add'}'
                '${r.players.trim().isEmpty ? '' : ' · ${r.players.trim().split('\n').length} players'}',
        ];
        filledDetails = _fillDetails(
          (read['form'] as Map?)?.cast<String, dynamic>(),
        );
      }
      final count = rows
          .where((r) => r == notesInto || notesBuilt.contains(r))
          .fold<int>(0, (a, r) => a + (r.total > 0 ? r.total : r.wanted));
      filledCheck = [
        ...noSizes,
        for (final u in unknown.take(10))
          RegExp(r'[():]|^please check', caseSensitive: false).hasMatch(u)
              ? u
              : 'Not read: "$u"',
        if (read['ai'] == 'sign_in' && unknown.isNotEmpty)
          'Sign in and 3DEEZI AI reads anything you paste: notes in any words, lists and screenshots.',
      ];
      notesNote = !built
          ? 'No garments or sizes found. Try "XS x 3, S x 5, M x 5" or a list like "Smith 7 M".'
          : 'Filled your order: $count ${count == 1 ? 'garment' : 'garments'}${ai ? ', read by 3DEEZI AI' : ''}. Check it below, then continue.';
    });
    // The result stays in view under the box, the garments under it (with two
    // steps, goToStep(1) was the review: it jumped to "Add your artwork").
  }

  /// "3 XS, 5 S, 5 M" in the site's size order.
  String _sizesLine(Map<String, int> sizes) => [
    for (final s in [
      ...allOrderSizes,
      ...sizes.keys.where((k) => !allOrderSizes.contains(k)),
    ])
      if ((sizes[s] ?? 0) > 0) '${sizes[s]} $s',
  ].join(', ');

  void addItems(List<Map<String, dynamic>> items) {
    if (rows.length == 1 && rows.first.total == 0) rows.clear();
    for (final item in items) {
      rows.add(
        _Row()
          ..garment = _garments.containsKey(item['garment'])
              ? '${item['garment']}'
              : 'other'
          ..label = '${item['label'] ?? ''}'.trim()
          ..sizes.addAll(
            ((item['sizes'] as Map?) ?? const {}).map(
              (k, v) => MapEntry('$k', (v as num).toInt()),
            ),
          )
          ..players = [
            for (final p
                in ((item['players'] as List?) ?? const []).whereType<Map>())
              [
                '${p['name'] ?? ''}'.trim(),
                '${p['number'] ?? ''}'.trim(),
                '${p['size'] ?? ''}'.trim(),
              ].join(', '),
          ].join('\n')
          ..fit = _fits.containsKey(item['fit'])
              ? '${item['fit']}'
              : fitFromSizes(
                      ((item['sizes'] as Map?) ?? const {}).map(
                        (k, v) => MapEntry('$k', (v as num).toInt()),
                      ),
                    ) ??
                    'mens',
      );
    }
    if (rows.isEmpty) rows.add(_Row());
  }

  Map<String, dynamic> pricing = {};
  String? helped;

  /// Made by: the maker chosen; null is 3DEEZI (the default).
  int? supplierId;

  @override
  void makersLoaded() {
    final want = widget.maker?.toLowerCase();
    if (want == null || supplierId != null) return;
    supplierId = makers
        .where((m) => m.name.toLowerCase() == want)
        .firstOrNull
        ?.id;
  }

  @override
  void initState() {
    super.initState();
    initContact();
    loadOptions();
    final from = widget.assistant;
    if (from != null) {
      final items = ((from['items'] as List?) ?? const [])
          .whereType<Map>()
          .map((m) => m.cast<String, dynamic>())
          .toList();
      addItems(items);
      final title = '${from['title'] ?? ''}'.trim();
      if (team.text.trim().isEmpty && title.isNotEmpty) team.text = title;
      page = 0;
      if (widget.review) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) startReview();
        });
      }
    }
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
    'items': [
      for (final r in rows)
        if (r.total > 0) r.toJson(),
    ],
    if (pricing.isNotEmpty) 'pricing': pricing,
    // The date required and Deliver / Pick up with the address (2026-10-22, as on Upload Your Order).
    if (neededBy != null) 'needed_by': _ymd(neededBy!),
    'delivery': delivery,
    'address': address,
    // Edit Order from the Order Assistant: its design pictures are the artwork.
    if (widget.assistant?['token'] case final String token
        when token.isNotEmpty)
      'assist_token': token,
    // Made by (preferred suppliers): only a maker other than 3DEEZI is sent, as the website does.
    if (MadeByField.idToSend(makers, supplierId) case final id?)
      'supplier_id': id,
  };

  int get total => rows.fold(0, (a, r) => a + r.total);

  /// The product a row is ordered as, when it has one: "Netball dress" for a
  /// dress on its singlet row (from the notes' label or the saved design, as
  /// My orders and the review say it; LINKTEST r2), "Netball bibs"; else ''.
  String _productName(_Row r) {
    final project = r.project == null
        ? null
        : c.projects
              .where((p) => p.remoteId != null && p.remoteId == r.project)
              .firstOrNull;
    final fromDesign = project == null
        ? ''
        : designRowName(project.kit.garment, designProduct(project), r.garment);
    if (fromDesign.isNotEmpty) return fromDesign;
    final label = r.label.trim();
    return r.garment != 'other' &&
            RegExp(r'\bdress(es)?$', caseSensitive: false).hasMatch(label)
        ? label
        : '';
  }

  Widget _garmentField(_Row r) {
    final product = _productName(r);
    return DropdownButtonFormField<String>(
      // A saved design sets the garment: show it.
      key: ValueKey(
        'garment-${identityHashCode(r)}-${r.garment}-${r.custom}-$product',
      ),
      isExpanded: true,
      initialValue: r.custom ? customValue : r.garment,
      decoration: const InputDecoration(labelText: 'Garment', isDense: true),
      // The chosen garment by its product's name ("Netball dress").
      selectedItemBuilder: (context) => [
        for (final e in _garments.entries)
          Text(
            e.key == r.garment && !r.custom && product.isNotEmpty
                ? product
                : e.value,
            overflow: TextOverflow.ellipsis,
          ),
        const Text(customLabel),
      ],
      items: [
        for (final e in _garments.entries)
          DropdownMenuItem(value: e.key, child: Text(e.value)),
        // "Custom…" (client 2026-11-02): a sport typed.
        const DropdownMenuItem(value: customValue, child: Text(customLabel)),
      ],
      onChanged: (v) => setState(() {
        r.custom = v == customValue;
        if (!r.custom) {
          // Another garment chosen: the product's name goes with it.
          if (v != r.garment && product.isNotEmpty) r.label = '';
          r.garment = v ?? r.garment;
          r.sport = '';
        }
      }),
    );
  }

  Widget _fitField(_Row r) => DropdownButtonFormField<String>(
    isExpanded: true,
    initialValue: r.fit,
    decoration: const InputDecoration(labelText: 'Fit', isDense: true),
    items: [
      for (final e in _fits.entries)
        DropdownMenuItem(value: e.key, child: Text(e.value)),
    ],
    onChanged: (v) => setState(() => r.fit = v ?? r.fit),
  );

  Future<void> helpMe() async {
    if (help.text.trim().isEmpty) return;
    setState(() => busy = true);
    try {
      // The order form's own reading first (no AI; LINKTEST 2026-11-13, as
      // the website): players ("John Smith 7 M" is one jersey for #7, never 7
      // jerseys), "3 XL x 5", "XS x 3 , S x 5 …" (order 537); what it can't
      // place comes back to check. Then the Order Assistant's reader.
      Map<String, dynamic>? fromNotes;
      try {
        final notes = await c.api.readOrderNotes(help.text.trim());
        if (((notes['items'] as List?) ?? const []).isNotEmpty)
          fromNotes = notes;
      } on ApiException {
        // The next reader.
      }
      final read = fromNotes ?? await c.api.orderAssist(help.text.trim());
      final items = ((read['items'] as List?) ?? const [])
          .whereType<Map>()
          .map((m) => m.cast<String, dynamic>())
          .toList();
      setState(() {
        if (rows.length == 1 && rows.first.total == 0) rows.clear();
        for (final item in items) {
          rows.add(
            _Row()
              ..garment = _garments.containsKey(item['garment'])
                  ? '${item['garment']}'
                  : 'other'
              ..sizes.addAll(
                ((item['sizes'] as Map?) ?? const {}).map(
                  (k, v) => MapEntry('$k', (v as num).toInt()),
                ),
              )
              // Players read with their sizes: their names and numbers too.
              ..players = [
                for (final pl
                    in ((item['players'] as List?) ?? const [])
                        .whereType<Map>())
                  [
                    '${pl['name'] ?? ''}'.trim(),
                    '${pl['number'] ?? ''}'.trim(),
                    '${pl['size'] ?? ''}'.trim(),
                  ].join(', '),
              ].join('\n')
              // Only womens or only kids sizes: that fit, so the row shows that size set.
              ..fit = _fits.containsKey(item['fit'])
                  ? '${item['fit']}'
                  : fitFromSizes(
                          ((item['sizes'] as Map?) ?? const {}).map(
                            (k, v) => MapEntry('$k', (v as num).toInt()),
                          ),
                        ) ??
                        'mens',
          );
        }
        if (rows.isEmpty) rows.add(_Row());
        final unknown = ((read['unknown'] as List?) ?? const []).join('; ');
        helped = items.isEmpty
            ? 'I could not read sizes from that. Try “12 jerseys M, 12 shorts L”.'
            : 'Added ${read['summary']}.${unknown.isEmpty ? '' : ' Check: $unknown'}';
      });
    } on ApiException catch (e) {
      setState(() => helped = e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  // Only the basics (client 2026-11-05): step 1 garments with sizes and
  // artwork; step 2 name, date required (optional), email, mobile and the
  // address (or pick up). Team / organisation and notes are not asked.
  String? problem() {
    if (stepOneProblem() case final first?) return first;
    if (name.text.trim().isEmpty) return 'Add your name.';
    if (deliveryProblem(dateOptional: true) case final details?) return details;
    return null;
  }

  @override
  Widget build(BuildContext context) => BubbleRoute(
    c: c,
    // The bubble look (user 2026-11-05): the form in one glass bubble with
    // the tab bar; Back from the review returns to step 1.
    title: step == 'review' ? 'REVIEW YOUR ORDER' : 'CREATE ORDER FORM',
    // As much room over the title as PROJECTS (user 2026-11-06).
    fullHeadingRoom: true,
    onBack: step == 'review' ? () => setState(() => step = 'edit') : null,
    child: Column(
      children: [
        stepHeader('CREATE ORDER FORM', 'Build your order step by step.'),
        Expanded(
          child: NotificationListener<ScrollNotification>(
            onNotification: watchSections,
            child: step == 'done'
                ? confirmation()
                : step == 'review'
                ? _review()
                : _edit(),
          ),
        ),
      ],
    ),
  );

  @override
  String get websitePath => '/orders/new';
  @override
  String get websiteTitle => 'Create order form';

  @override
  List<String> get stepNames => const [
    'Garments & artwork',
    'Details & review',
  ];

  Widget _edit() {
    final designs = [
      for (final p in c.projects)
        if (p.remoteId != null) p,
    ];
    // (One built column, not a lazy list: the step bar finds every section.)
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(2, 6, 2, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _notesBox(),
          ...[
            _section('1 · Garments & sizes', key: sectionKeys[0]),
            // (The notes' result shows once, under the notes box: same page.)
            SurfaceCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '3DEEZI ASSIST · Help me add sizes',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: help,
                    decoration: const InputDecoration(
                      hintText: '12 jerseys M, 12 shorts L, 6 hoodies XL',
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerRight,
                    child: OutlinedButton(
                      onPressed: busy ? null : helpMe,
                      child: const Text('Help me add sizes'),
                    ),
                  ),
                  if (helped != null)
                    Text(
                      helped!,
                      style: const TextStyle(
                        color: Palette.muted,
                        fontSize: 12,
                      ),
                    ),
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
                      // Garment, Fit and Remove: on one line when wide, on
                      // two at phone width so the Fit shows "Womens" in full
                      // (LINKTEST r2: it showed "Wo").
                      LayoutBuilder(
                        builder: (context, box) {
                          final garment = _garmentField(r);
                          final fit = _fitField(r);
                          final remove = IconButton(
                            tooltip: 'Remove garment ${i + 1}',
                            onPressed: rows.length < 2
                                ? null
                                : () => setState(() => rows.remove(r)),
                            icon: const Icon(Icons.delete_outline),
                          );
                          if (box.maxWidth < 440) {
                            return Column(
                              children: [
                                Row(
                                  children: [
                                    Expanded(child: garment),
                                    remove,
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Row(
                                  children: [
                                    SizedBox(width: 170, child: fit),
                                    const Spacer(),
                                  ],
                                ),
                              ],
                            );
                          }
                          return Row(
                            children: [
                              Expanded(flex: 3, child: garment),
                              const SizedBox(width: 8),
                              Expanded(flex: 2, child: fit),
                              remove,
                            ],
                          );
                        },
                      ),
                      if (r.custom) ...[
                        TextFormField(
                          key: Key('custom-sport-$i'),
                          initialValue: r.sport,
                          maxLength: customMax,
                          decoration: const InputDecoration(
                            labelText: 'Type your sport',
                            hintText: 'e.g. Lacrosse, Bowling',
                            isDense: true,
                            counterText: '',
                          ),
                          onChanged: (v) => r.sport = typedName(v),
                        ),
                        DropdownButtonFormField<String>(
                          key: ValueKey(
                            'custom-garment-${identityHashCode(r)}',
                          ),
                          isExpanded: true,
                          initialValue: r.garment,
                          decoration: const InputDecoration(
                            labelText: 'Garment',
                            isDense: true,
                          ),
                          items: [
                            for (final e in _garments.entries)
                              DropdownMenuItem(
                                value: e.key,
                                child: Text(
                                  e.key == 'other' ? customLabel : e.value,
                                ),
                              ),
                          ],
                          onChanged: (v) =>
                              setState(() => r.garment = v ?? r.garment),
                        ),
                      ],
                      if (r.garment == 'other' || r.label.isNotEmpty)
                        TextFormField(
                          key: Key('custom-garment-name-$i'),
                          initialValue: r.label,
                          maxLength: 60,
                          decoration: InputDecoration(
                            labelText: r.garment != 'other'
                                ? 'Name / design'
                                : r.custom
                                ? 'Type your garment'
                                : 'What is it?',
                            hintText: r.custom
                                ? customPlaceholder
                                : 'e.g. Long-sleeve compression top',
                            isDense: true,
                            counterText: '',
                          ),
                          onChanged: (v) => r.label = typedName(v),
                        ),
                      if (designs.isNotEmpty)
                        DropdownButtonFormField<int?>(
                          isExpanded: true,
                          initialValue: r.project,
                          decoration: const InputDecoration(
                            labelText: 'Design',
                            isDense: true,
                          ),
                          items: [
                            const DropdownMenuItem<int?>(
                              value: null,
                              child: Text('No saved design'),
                            ),
                            for (final p in designs)
                              DropdownMenuItem<int?>(
                                value: p.remoteId,
                                child: Text(p.title),
                              ),
                          ],
                          onChanged: (v) => setState(() {
                            r.project = v;
                            final p = designs
                                .where((p) => p.remoteId == v)
                                .firstOrNull;
                            if (p != null) {
                              r.garment = orderGarmentFor(p.kit.garment);
                              // The netball dress: womens sizes (LINKTEST r3:
                              // it kept Mens and the mens sizes).
                              if (isDressDesign(p)) r.fit = 'womens';
                            }
                          }),
                        ),
                      const SizedBox(height: 10),
                      // The fit's sizes: Mens XS–4XL (+ 5XL–8XL), Womens W8–W20 (+ W22, W24), Kids 6Y–16Y (+ 2Y, 4Y), and any size the row has.
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final s in rowSizes(
                            r.fit,
                            r.sizes,
                            more: r.more,
                          ))
                            SizedBox(
                              width: 60,
                              child: TextFormField(
                                key: Key('size-$i-$s'),
                                initialValue: r.sizes[s]?.toString() ?? '',
                                keyboardType: TextInputType.number,
                                textAlign: TextAlign.center,
                                // (Narrow in the bubble at 360: the size
                                // names keep room to show in full.)
                                decoration: InputDecoration(
                                  labelText: s,
                                  isDense: true,
                                  contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 12,
                                  ),
                                  labelStyle: const TextStyle(fontSize: 14),
                                  border: const OutlineInputBorder(),
                                ),
                                onChanged: (v) => setState(
                                  () => r.sizes[s] = int.tryParse(v) ?? 0,
                                ),
                              ),
                            ),
                        ],
                      ),
                      // The subtotal, "More sizes", and the same garment in another fit (a team's mens, womens and kids each
                      // get a row), on one line.
                      Wrap(
                        spacing: 2,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            // From the notes with no sizes ("5 hoodies"):
                            // how many, and that the sizes are needed.
                            child: r.sizesNeeded
                                ? Text(
                                    '${r.wanted} · sizes needed',
                                    key: Key('sizes-needed-$i'),
                                    style: const TextStyle(
                                      color: Color(0xffffbc75),
                                      fontWeight: FontWeight.w700,
                                    ),
                                  )
                                : Text(
                                    'Subtotal ${r.total}',
                                    style: const TextStyle(
                                      color: Palette.cyan,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                          ),
                          if (rareFor(r.fit).isNotEmpty)
                            TextButton(
                              key: Key('more-sizes-$i'),
                              style: _smallLink,
                              onPressed: () => setState(() => r.more = !r.more),
                              child: Text(
                                r.more
                                    ? 'Fewer sizes'
                                    : '+ ${rareText(rareFor(r.fit))}',
                              ),
                            ),
                          for (final f in const ['mens', 'womens', 'youth'])
                            if (f !=
                                (r.fit == 'womens' || r.fit == 'youth'
                                    ? r.fit
                                    : 'mens'))
                              TextButton(
                                key: Key('add-fit-$i-$f'),
                                style: _smallLink,
                                onPressed: rows.length >= 60
                                    ? null
                                    : () => setState(
                                        () => rows.insert(
                                          i + 1,
                                          _Row()
                                            ..garment = r.garment
                                            ..project = r.project
                                            ..custom = r.custom
                                            ..sport = r.sport
                                            ..label = r.label
                                            ..fit = f,
                                        ),
                                      ),
                                child: Text('+ ${fitNames[f]} sizes'),
                              ),
                        ],
                      ),
                      ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        title: const Text(
                          'Player names & numbers (optional)',
                          style: TextStyle(fontSize: 13),
                        ),
                        children: [
                          TextFormField(
                            initialValue: r.players,
                            maxLines: 4,
                            decoration: const InputDecoration(
                              hintText: 'One per line: SMITH, 7, M',
                              border: OutlineInputBorder(),
                            ),
                            onChanged: (v) => r.players = v,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            TextButton.icon(
              onPressed: () => setState(() => rows.add(_Row())),
              icon: const Icon(Icons.add),
              label: const Text('Add garment'),
            ),
          ],
          ...[
            _section('2 · Artwork', key: sectionKeys[1]),
            if (artworkMissing)
              Container(
                key: const Key('order-artwork-error'),
                margin: const EdgeInsets.fromLTRB(2, 0, 2, 10),
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                decoration: BoxDecoration(
                  color: const Color(0x26ff6b6b),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xffff8a8a)),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.error_outline,
                      size: 18,
                      color: Color(0xffff8a8a),
                    ),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        artworkProblem,
                        style: TextStyle(
                          color: Color(0xffffb4b4),
                          fontWeight: FontWeight.w600,
                          height: 1.3,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    key: const Key('choose-saved-design'),
                    onPressed: () => _artSheet(
                      rows.firstWhere(
                        (r) => r.project == null && r.fileIds.isEmpty,
                        orElse: () => rows.first,
                      ),
                      designs,
                      auto: true,
                    ),
                    icon: const Icon(Icons.palette_outlined, size: 18),
                    label: const FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text('Choose saved design', maxLines: 1),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    key: const Key('upload-artwork'),
                    onPressed: () {
                      artFor = rows
                          .where((r) => r.project == null && r.fileIds.isEmpty)
                          .firstOrNull;
                      addFile('artwork');
                    },
                    icon: const Icon(Icons.upload_file, size: 18),
                    label: const FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text('Upload artwork', maxLines: 1),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            for (final (i, r) in rows.indexed) _artRow(i, r, designs),
            const SizedBox(height: 6),
            _sheetBox(),
            for (final u in uploads.where((u) => u.kind == 'artwork'))
              fileRow(u),
            OutlinedButton.icon(
              onPressed: () {
                artFor = null;
                addFile('artwork');
              },
              icon: const Icon(Icons.attach_file),
              label: const Text('Artwork for the whole order'),
            ),
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text(
                'Confirmation download: PDF / Excel (available on the next step).',
                style: TextStyle(color: Palette.muted, fontSize: 12),
              ),
            ),
          ],
          if (error != artworkProblem) errorText(),
          const SizedBox(height: 14),
          pageButtons(last: true, onNext: startReview),
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              'Step 1 of 2. Reviewing does not submit your order.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Palette.muted, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }

  /// Step 3: one garment's artwork (picture, name, "Front & back artwork added", Change).
  Widget _artRow(int i, _Row r, List<Project> designs) {
    final project = r.project == null
        ? null
        : designs.where((p) => p.remoteId == r.project).firstOrNull;
    final added = r.project != null || r.fileIds.isNotEmpty;
    final busyHere =
        identical(artFor, r) &&
        uploads.any(
          (u) => u.kind == 'artwork' && u.file == null && u.error == null,
        );
    final name =
        project?.title ??
        (r.label.trim().isNotEmpty
            ? r.label.trim()
            : (_garments[r.garment] ?? r.garment));
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GlassCard(
        radius: 14,
        semanticsLabel: null,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: const Color(0xff0b2238),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.checkroom, color: Color(0xff5cc8ec)),
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
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        if (added)
                          const Icon(
                            Icons.check_circle,
                            size: 15,
                            color: Color(0xff4ade80),
                          ),
                        if (added) const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            busyHere
                                ? 'Uploading…'
                                : r.project != null
                                ? 'Front & back artwork added'
                                : added
                                ? 'Artwork added (${r.fileIds.length})'
                                : 'Add artwork',
                            key: Key('art-status-$i'),
                            style: TextStyle(
                              fontSize: 12.5,
                              color: added
                                  ? const Color(0xff4ade80)
                                  : Palette.muted,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              TextButton(
                key: Key('art-change-$i'),
                onPressed: () => _artSheet(r, designs),
                child: Text(added ? 'Change' : 'Add'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Change: a saved design (front & back) or artwork uploaded for this garment.
  Future<void> _artSheet(
    _Row r,
    List<Project> designs, {
    bool auto = false,
  }) async {
    final choice = await showModalBottomSheet<Object>(
      context: context,
      backgroundColor: Palette.bg,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 14, 16, 6),
              child: Text(
                'Artwork for this garment',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            for (final p in designs)
              ListTile(
                leading: const Icon(Icons.palette_outlined),
                title: Text(p.title),
                trailing: p.remoteId == r.project
                    ? const Icon(Icons.check)
                    : null,
                onTap: () => Navigator.of(ctx).pop(p.remoteId),
              ),
            if (designs.isEmpty)
              const ListTile(
                title: Text('No saved designs yet'),
                subtitle: Text('Designs you save in the app show here.'),
              ),
            ListTile(
              key: const Key('art-upload-row'),
              leading: const Icon(Icons.upload_file),
              title: const Text('Upload artwork for this garment'),
              onTap: () => Navigator.of(ctx).pop('upload'),
            ),
            if (r.project != null || r.fileIds.isNotEmpty)
              ListTile(
                leading: const Icon(Icons.close),
                title: const Text('Remove artwork from this garment'),
                onTap: () => Navigator.of(ctx).pop('clear'),
              ),
          ],
        ),
      ),
    );
    if (!mounted || choice == null) return;
    if (choice == 'upload') {
      artFor = r;
      await addFile('artwork');
    } else if (choice == 'clear') {
      setState(() {
        r.project = null;
        r.fileIds.clear();
      });
    } else if (choice is int) {
      setState(() => _useDesign(r, choice, designs, auto: auto));
    }
  }

  /// A saved design on [r]. From "Choose saved design" ([auto], as the
  /// website's "The garment it names (or a new one)"; LINKTEST 2026-11-13: a
  /// netball dress went on the empty jersey row and was ordered as jerseys):
  /// a row of another garment takes it only when empty, and becomes the
  /// design's garment; otherwise the design gets a new row of its own.
  void _useDesign(_Row r, int id, List<Project> designs, {bool auto = false}) {
    final p = designs.where((d) => d.remoteId == id).firstOrNull;
    final garment = p == null ? r.garment : orderGarmentFor(p.kit.garment);
    final dress =
        p != null &&
        orderGarmentFor(p.kit.garment) == 'singlet' &&
        (ProjectSync.garments[p.kit.garment] ?? p.kit.garment.toLowerCase()) ==
            'netball-dress';
    if (!auto || garment == r.garment) {
      r.project = id;
      return;
    }
    final empty =
        r.total == 0 &&
        r.players.trim().isEmpty &&
        r.wanted == 0 &&
        r.fileIds.isEmpty;
    final row = empty ? r : _Row();
    row
      ..garment = garment
      ..label = ''
      ..project = id;
    // A dress's sizes are womens sizes (W8 to W24).
    if (dress) row.fit = 'womens';
    if (!empty) rows.add(row);
  }

  /// "Paste your order here" (ORDERPASTE 2026-11-13, as the website): one
  /// box, Paste, Add a screenshot or photo, and one Fill my order button;
  /// then what was filled, what to check, and Undo.
  Widget _notesBox() => Container(
    key: const Key('notes-box'),
    margin: const EdgeInsets.only(bottom: 14),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0xff1d6a8a), width: 1.5),
      color: const Color(0xff04101c),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Row(
          children: [
            Icon(Icons.content_paste, size: 20, color: Color(0xff5cc8ec)),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                'PASTE YOUR ORDER HERE',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.2,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        const Text(
          'Paste or type it any way you like: "XS x 3, S x 5, M x 5…", names with numbers and sizes, or cells copied from a spreadsheet. Or add a screenshot or photo. 3DEEZI AI fills in your order; you just check it.',
          style: TextStyle(color: Palette.muted, fontSize: 12.5),
        ),
        const SizedBox(height: 8),
        TextField(
          key: const Key('notes-text'),
          controller: notes,
          minLines: 5,
          maxLines: 10,
          decoration: const InputDecoration(
            hintText:
                'e.g. XS x 3, S x 5, M x 5, L x 5, XL x 8\nor a list of players: Smith 7 M, Jones 10 L',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            TextButton.icon(
              key: const Key('notes-paste'),
              onPressed: building
                  ? null
                  : () async {
                      final data = await Clipboard.getData(
                        Clipboard.kTextPlain,
                      );
                      final text = data?.text ?? '';
                      if (!mounted) return;
                      setState(() {
                        if (text.trim().isEmpty) {
                          notesNote =
                              'Nothing to paste: copy your order first, or add a screenshot or photo of it.';
                          return;
                        }
                        notes.text = notes.text.trim().isEmpty
                            ? text
                            : '${notes.text}\n$text';
                      });
                    },
              icon: const Icon(Icons.content_paste_go, size: 18),
              label: const Text('Paste'),
            ),
            TextButton.icon(
              key: const Key('notes-upload-file'),
              onPressed: building
                  ? null
                  : () {
                      notesFile = true;
                      unawaited(addFile('order_form', picture: true));
                    },
              icon: const Icon(Icons.add_a_photo_outlined, size: 18),
              label: const Text('Add a screenshot or photo'),
            ),
          ],
        ),
        const SizedBox(height: 6),
        FilledButton.icon(
          key: const Key('build-form'),
          onPressed: building ? null : () => unawaited(buildFromNotes()),
          icon: building
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.auto_awesome, size: 18),
          label: const Text('Fill my order'),
        ),
        if (notesNote != null)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(
              notesNote!,
              key: const Key('notes-status'),
              style: const TextStyle(
                color: Color(0xffd7ffe6),
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        for (final line in filledLines)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(
              '• $line',
              key: const Key('filled-line'),
              style: const TextStyle(fontSize: 13),
            ),
          ),
        if (filledDetails.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              'Also filled in: ${filledDetails.join(', ')}.',
              style: const TextStyle(color: Palette.muted, fontSize: 12.5),
            ),
          ),
        if (filledCheck.isNotEmpty)
          Container(
            key: const Key('notes-check'),
            margin: const EdgeInsets.only(top: 8),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0xffb7862a)),
              color: const Color(0xff2a2009),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Please check',
                  style: TextStyle(
                    color: Color(0xffffe6b0),
                    fontWeight: FontWeight.w700,
                  ),
                ),
                for (final line in filledCheck)
                  Text(
                    '• $line',
                    style: const TextStyle(
                      color: Color(0xffffe6b0),
                      fontSize: 12.5,
                    ),
                  ),
              ],
            ),
          ),
        if (beforeFill != null && !building)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              key: const Key('undo-fill'),
              onPressed: undoLastFill,
              icon: const Icon(Icons.undo, size: 18),
              label: const Text('Undo'),
            ),
          ),
      ],
    ),
  );

  /// "Have an order sheet?" (.pdf .xlsx .xls): read like Upload order; sizes come into the garments.
  Widget _sheetBox() {
    final sheets = uploads.where((u) => u.kind == 'order_form').toList();
    return Container(
      key: const Key('order-sheet-box'),
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xff3b7594), width: 1.5),
        color: const Color(0xff04101c),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.table_chart_outlined, color: Color(0xff5cc8ec)),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Have an order sheet?',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      '.pdf .xlsx .xls',
                      style: TextStyle(color: Palette.muted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              TextButton(
                key: const Key('order-sheet-upload'),
                onPressed: () => addFile('order_form'),
                child: const Text('Upload'),
              ),
            ],
          ),
          for (final u in sheets) fileRow(u),
          if (sheets.any((u) => u.file != null)) ...[
            if (sheetNote != null)
              Text(sheetNote!, style: const TextStyle(fontSize: 12.5)),
            const Text(
              'Check imported sizes and quantities in Review.',
              style: TextStyle(color: Palette.muted, fontSize: 12.5),
            ),
          ],
        ],
      ),
    );
  }

  /// Rows using a design made as one of its sport's garments ("Netball bibs", task 9.99) are named by it on the review
  /// and priced under it, as the placed order names them (the server's OrderSubmission), but only a row of the
  /// design's own garment (designRowName): the design on another garment's row keeps that garment's name (task 9.97).
  /// A row's own label wins.
  List<Map<String, dynamic>> _named(Iterable<Object?> items) => [
    for (final m in items.whereType<Map>().map(
      (m) => m.cast<String, dynamic>(),
    ))
      () {
        final id = m['project_id'];
        final project = id == null
            ? null
            : c.projects
                  .where((p) => p.remoteId != null && p.remoteId == id)
                  .firstOrNull;
        final product = project == null
            ? ''
            : designRowName(
                project.kit.garment,
                designProduct(project),
                '${m['garment'] ?? ''}',
              );
        return product.isNotEmpty && '${m['label'] ?? ''}'.trim().isEmpty
            ? {
                ...m,
                'label': product.length > 60
                    ? product.substring(0, 60)
                    : product,
              }
            : m;
      }(),
  ];

  /// REVIEW & APPROVE ORDER (client design 2026-10-22, as on the website): one matching kit's combined review, or one
  /// section per garment style; delivery and notes with the price; the confirm box and APPROVE ORDER.
  Widget _review() {
    final items = _named([
      for (final r in rows)
        if (r.total > 0) r.toJson(),
    ]);
    final art = [
      for (final u in uploads)
        if (u.file != null && '${u.file!['thumb'] ?? ''}'.startsWith('data:'))
          '${u.file!['thumb']}',
    ];
    return ListView(
      // Its own list, so the review starts at its top (not where the form was scrolled to).
      key: const ValueKey('order-review'),
      padding: const EdgeInsets.fromLTRB(2, 6, 2, 16),
      children: [
        // Step 2 (client 2026-11-05): only the basics, then Review & approve.
        KeyedSubtree(key: detailsKey, child: _section('1 · Your details')),
        _field(name, 'Name', onChanged: (_) => setState(() {})),
        _field(
          email,
          'Email',
          keyboard: TextInputType.emailAddress,
          onChanged: (_) => setState(() {}),
        ),
        _field(
          phone,
          'Mobile',
          keyboard: TextInputType.phone,
          onChanged: (_) => setState(() {}),
        ),
        _whenWhere(),
        const SizedBox(height: 14),
        ...orderReviewApprove(
          context,
          onDownloadConfirmation: downloadConfirmation,
          first: 'Garments & artwork',
          layout: reviewLayout(items),
          garments: multiGarmentsFrom(
            items,
            names: _garments,
            artwork: art.firstOrNull,
          ),
          mockups: [
            for (var i = 0; i < art.length && i < 2; i++)
              (
                label: art.length > 1 ? 'ARTWORK ${i + 1}' : 'ARTWORK',
                src: art[i],
              ),
          ],
          artworkOnly: true,
          files: [
            for (final u in uploads)
              if (u.file != null) u.name,
          ],
          filesLabel: 'Artwork',
          contact: [
            name.text.trim(),
            team.text.trim(),
          ].where((v) => v.isNotEmpty).join(' · '),
          email: email.text.trim(),
          mobile: phone.text.trim(),
          // An empty date required is listed under Please check too (QA8 #8);
          // the form can still be approved without it.
          neededBy: neededBy == null ? null : _dayText(neededBy!),
          pickup: delivery == 'pickup',
          // No street yet: listed under Please check (QA8 #8), not just the country.
          deliveryText:
              delivery == 'pickup' || (address['street'] ?? '').trim().isEmpty
              ? null
              : deliveryLine(delivery, address),
          onEditDelivery: () {
            final details = detailsKey.currentContext;
            if (details != null) Scrollable.ensureVisible(details);
          },
          notes: notes.text.trim(),
          // Who makes it, when the form offered a choice (as the website's review).
          madeBy: makers.length > 1
              ? MadeByField.chosenOf(makers, supplierId)?.name
              : null,
          price: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              PriceChoices(
                c,
                pricing,
                (next) => setState(() => pricing = next),
                choice: choiceDestination,
              ),
              // Priced as the order will be: the review's choice, else Deliver / Pick up and the country.
              PriceBox(c, {
                'items': _named((fields()['items'] as List?) ?? const []),
                'pricing': {
                  ...pricing,
                  if (pricing['destination'] == null &&
                      choiceDestination != null)
                    'destination': choiceDestination,
                },
              }, key: ValueKey('${jsonEncode(pricing)}$choiceDestination')),
            ],
          ),
          onEditGarments: () => setState(() => step = 'edit'),
          agreed: approved,
          onAgree: (v) => setState(() {
            approved = v;
            error = null;
          }),
          busy: busy,
          error: errorText(),
          onBack: () => setState(() => step = 'edit'),
          onApprove: () {
            final missing = problem();
            if (missing == null) {
              confirm();
              return;
            }
            setState(() => error = missing);
            final details = detailsKey.currentContext;
            if (details != null) Scrollable.ensureVisible(details);
          },
        ),
      ],
    );
  }
}

/// Upload Your Order: the completed order form and artwork, then review (with the rows read from the form), then confirm.
class OrderUploadScreen extends StatefulWidget {
  const OrderUploadScreen(this.controller, {super.key});
  final AppController controller;
  @override
  State<OrderUploadScreen> createState() => _OrderUploadScreenState();
}

class _OrderUploadScreenState extends State<OrderUploadScreen>
    with _OrderEntry {
  @override
  AppController get c => widget.controller;
  @override
  String get kind => 'upload';
  bool editContact = false, correct = false;

  /// The rows read from the order form, open to correct ("Edit sizes & garments" on the review).
  bool editingRows = false;
  Map<String, dynamic> pricing = {};
  // The order form as 3DEEZI AI read it (POST /order-drafts/{id}/read), and its rows as corrected on the review.
  Map<String, dynamic>? reading;
  List<Map<String, dynamic>> rows = [];
  int? rowsFor;
  bool readingNow = false;
  Future<Map<String, dynamic>?>? _reading;
  final _prefilled = <String>{};

  /// Made by (preferred suppliers, as on Create Order Form): the maker chosen; null is 3DEEZI (the default).
  int? supplierId;
  @override
  void initState() {
    super.initState();
    initContact();
    loadOptions();
    editContact = name.text.isEmpty;
  }

  @override
  Map<String, dynamic> fields() => {
    'contact_name': name.text.trim(),
    'contact_email': email.text.trim(),
    'phone': phone.text.trim(),
    'team_name': team.text.trim(),
    'notes': notes.text.trim(),
    if (neededBy != null) 'needed_by': _ymd(neededBy!),
    'delivery': delivery,
    'address': address,
    if (pricing.isNotEmpty) 'pricing': pricing,
    // Made by: sent whenever there is a choice (null is 3DEEZI, which also clears a choice saved on the draft).
    if (makers.length > 1)
      'supplier_id': MadeByField.idToSend(makers, supplierId),
  };

  _Upload? get form => uploads.where((u) => u.kind == 'order_form').firstOrNull;
  Map<String, dynamic>? get suggested =>
      (form?.file?['suggested'] as Map?)?.cast<String, dynamic>();

  @override
  void onUploaded(_Upload upload) {
    if (upload.kind == 'order_form') _read();
  }

  /// 3DEEZI AI reads the order form (once per file on the server): started when it has uploaded, awaited by Review.
  /// The reading made at upload stays when the AI can't be asked.
  Future<Map<String, dynamic>?> _read() {
    final id = draftId, fileId = (form?.file?['id'] as num?)?.toInt();
    if (id == null || fileId == null) return Future.value(suggested);
    return _reading ??= () async {
      if (mounted) setState(() => readingNow = true);
      try {
        final d = await c.api.readOrderDraft(id);
        final found = ((d['suggested'] as List?) ?? const [])
            .whereType<Map>()
            .map((s) => s.cast<String, dynamic>())
            .where((s) => (s['file_id'] as num?)?.toInt() == fileId)
            .firstOrNull;
        if (found != null) _prefill(found);
        return found ?? suggested;
      } on ApiException {
        return suggested;
      } finally {
        _reading = null;
        if (mounted) setState(() => readingNow = false);
      }
    }();
  }

  /// Section 1's empty details from what the form says (never over what was typed; once per reading).
  void _prefill(Map<String, dynamic> s) {
    final key = '${s['file_id']}:${s['read_at']}';
    final f = (s['form'] as Map?)?.cast<String, dynamic>();
    if (s['source'] != 'ai' || f == null || !mounted || !_prefilled.add(key))
      return;
    setState(() {
      final date = DateTime.tryParse('${f['needed_by'] ?? ''}');
      final now = DateTime.now();
      if (neededBy == null &&
          date != null &&
          !date.isBefore(DateTime(now.year, now.month, now.day)))
        neededBy = date;
      if (phone.text.trim().isEmpty && '${f['phone'] ?? ''}'.isNotEmpty)
        phone.text = '${f['phone']}';
      if (team.text.trim().isEmpty && '${f['team_name'] ?? ''}'.isNotEmpty)
        team.text = '${f['team_name']}';
      final a = (f['address'] as Map?)?.cast<String, dynamic>() ?? const {};
      if (delivery != 'pickup' &&
          street.text.trim().isEmpty &&
          suburb.text.trim().isEmpty &&
          '${a['street'] ?? ''}'.isNotEmpty) {
        street.text = '${a['street']}';
        suburb.text = '${a['suburb'] ?? ''}';
        postcode.text = '${a['postcode'] ?? ''}';
        if ('${a['country'] ?? ''}'.isNotEmpty)
          country.text = '${a['country']}';
        final st = '${a['state'] ?? ''}'.toUpperCase();
        if (isAustralia(country.text)) {
          if (auStates.contains(st)) auState = st;
        } else {
          region.text = '${a['state'] ?? ''}';
        }
      }
    });
  }

  /// The review: the reading (waiting for 3DEEZI AI if it is still reading) as rows to check.
  Future<void> _loadReview() async {
    final fileId = (form?.file?['id'] as num?)?.toInt();
    final found = await _read();
    if (!mounted) return;
    setState(() {
      reading = found;
      if (fileId != rowsFor) {
        rows = readRows(found);
        rowsFor = fileId;
        correct = false;
      }
    });
  }

  @override
  Widget build(BuildContext context) => BubbleRoute(
    c: c,
    // The bubble look (user 2026-11-05): the form in one glass bubble with
    // the tab bar; Back from the review returns to step 1.
    title: step == 'review' ? 'REVIEW YOUR UPLOAD' : 'UPLOAD YOUR ORDER',
    onBack: step == 'review' ? () => setState(() => step = 'edit') : null,
    child: Column(
      children: [
        stepHeader('UPLOAD ORDER & ARTWORK', 'Already have your order ready?'),
        Expanded(
          child: NotificationListener<ScrollNotification>(
            onNotification: watchSections,
            child: step == 'done'
                ? confirmation()
                : step == 'review'
                ? _review()
                : _edit(),
          ),
        ),
      ],
    ),
  );

  // Two steps (client 2026-11-05): the order form and artwork, then the
  // details with Review & approve.
  @override
  String get websitePath => '/orders/upload';
  @override
  String get websiteTitle => 'Upload your order';

  @override
  List<String> get stepNames => const [
    'Upload order & artwork',
    'Details & review',
  ];
  @override
  int sectionOfStep(int i) => 0;
  @override
  int stepOfSection(int section) => 0;

  /// Where step 2's details start (Edit on the review, or a missing detail).
  final detailsKey = GlobalKey();

  /// Step 1: the order form, and artwork (required; a picture uploaded as
  /// the order form counts, it is often the mockup).
  String? stepOneProblem() {
    if (form?.file == null) return 'Upload your completed order form.';
    final picture = RegExp(
      r'\.(png|jpe?g|webp|gif|heic)$',
      caseSensitive: false,
    ).hasMatch(form!.name);
    if (!picture &&
        !uploads.any((u) => u.kind == 'artwork' && u.file != null)) {
      return 'Add your artwork: upload your logo, artwork or mockup.';
    }
    return null;
  }

  /// Step 2: name, email, mobile, date required and the address (or pick up).
  String? detailsProblem() {
    if (name.text.trim().isEmpty) return 'Add your name.';
    return uploadDetailsProblem(
      phone: phone.text,
      neededBy: neededBy,
      delivery: delivery,
      address: address,
    );
  }

  void nextPage() => startReview();

  @override
  void startReview() => setState(() {
    error = stepOneProblem();
    if (error == null) {
      step = 'review';
      page = 0;
      approved = false;
      editingRows = false;
      _presetFor = choiceDestination;
      _presetDestination();
      _loadReview();
    }
  });

  Widget _edit() => SingleChildScrollView(
    padding: const EdgeInsets.fromLTRB(2, 6, 2, 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ...[
          _section('1 · Upload order form', key: sectionKeys[0]),
          if (form != null)
            fileRow(
              form!,
              onReplace: () => addFile('order_form', replacing: form),
            )
          else
            OutlinedButton.icon(
              onPressed: () => addFile('order_form'),
              icon: const Icon(Icons.upload_file),
              label: const Text('Choose your order form'),
            ),
          if (form?.file != null &&
              (readingNow || reading != null || _prefilled.isNotEmpty))
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                readingNow
                    ? '3DEEZI AI is reading your order form…'
                    : 'Read by 3DEEZI AI. You’ll check the garments, sizes and players on Review: nothing to type in.',
                key: const Key('ai-status'),
                style: const TextStyle(color: Color(0xFF9FDCFF), fontSize: 12),
              ),
            ),
          const Text(
            'PDF, Excel, CSV, Word or a photo, up to 25 MB.',
            style: TextStyle(color: Palette.muted, fontSize: 11),
          ),
          _section('2 · Artwork'),
          for (final u in uploads.where((u) => u.kind == 'artwork')) fileRow(u),
          OutlinedButton.icon(
            onPressed: () => addFile('artwork'),
            icon: const Icon(Icons.attach_file),
            label: const Text('Add your logos, artwork or mockup'),
          ),
        ],
        errorText(),
        const SizedBox(height: 14),
        pageButtons(last: true, onNext: startReview),
        const Padding(
          padding: EdgeInsets.only(top: 6),
          child: Text(
            'Step 1 of 2. Your order is only submitted after review.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Palette.muted, fontSize: 11),
          ),
        ),
      ],
    ),
  );

  /// REVIEW & APPROVE ORDER (client design 2026-10-22, as on the website): the rows read from the order form as the
  /// size table (corrected in "Edit sizes & garments"), section 1's delivery details, the price, the confirm box (it is
  /// "These details are correct" too, when rows are sent) and APPROVE ORDER.
  Widget _review() {
    // Deliver / Pick up or the country changed on this page: "Delivery to" follows.
    if (choiceDestination != _presetFor) {
      _presetFor = choiceDestination;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _presetDestination();
      });
    }
    final items = cleanRows(rows);
    // The rows for the layout and the table, with the youth sizes as the form wrote them (10Y, 12Y) in place of Kids.
    final shown = [
      for (final r in rows)
        {
          ...r,
          'sizes': youthSplit({
            for (final e in ((r['sizes'] as Map?) ?? const {}).entries)
              '${e.key}': (e.value as num?)?.toInt() ?? 0,
          }, r['_form'] as Map?),
        },
    ];
    // The mockups: the artwork, then any picture uploaded with the order form (customers often put their mockup there).
    final art = [
      for (final kind in const ['order_form', 'artwork'])
        for (final u in uploads)
          if (u.kind == kind &&
              u.file != null &&
              '${u.file!['thumb'] ?? ''}'.startsWith('data:'))
            '${u.file!['thumb']}',
    ];
    final unread = ((reading?['unknown'] as List?) ?? const []).length;
    final file = form?.name ?? 'your order form';
    final note = [
      if (reading?['source'] == 'ai')
        'Read by 3DEEZI AI from $file.'
      else if (rows.isNotEmpty)
        'Read from $file.',
      if (unread > 0)
        '${unread == 1 ? 'One line' : '$unread lines'} of your form to check: 3DEEZI checks ${unread == 1 ? 'it' : 'them'} with you.',
    ].join(' ');
    return ListView(
      // Its own list, so the review starts at its top (not where the form was scrolled to).
      key: const ValueKey('order-review'),
      padding: const EdgeInsets.fromLTRB(2, 6, 2, 16),
      children: [
        // Step 2 (client 2026-11-05): only the basics, then Review & approve.
        KeyedSubtree(key: detailsKey, child: _section('1 · Your details')),
        _field(name, 'Name', onChanged: (_) => setState(() {})),
        _field(
          email,
          'Email',
          keyboard: TextInputType.emailAddress,
          onChanged: (_) => setState(() {}),
        ),
        _field(
          phone,
          'Mobile',
          keyboard: TextInputType.phone,
          onChanged: (_) => setState(() {}),
        ),
        _whenWhere(),
        const SizedBox(height: 14),
        if (readingNow && rows.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Text(
              '3DEEZI AI is reading your order form…',
              key: Key('ai-reading'),
              style: TextStyle(color: Color(0xFF9FDCFF)),
            ),
          ),
        ...orderReviewApprove(
          context,
          onDownloadConfirmation: downloadConfirmation,
          first: 'Upload order & artwork',
          layout: reviewLayout(shown),
          garments: multiGarmentsFrom(
            shown,
            names: _garments,
            artwork: art.firstOrNull,
            artworkBack: art.length > 1 ? art[1] : null,
          ),
          mockups: [
            for (var i = 0; i < art.length && i < 2; i++)
              (
                label: art.length > 1 ? (i == 0 ? 'FRONT' : 'BACK') : 'MOCKUP',
                src: art[i],
              ),
          ],
          artworkOnly: true,
          files: [
            for (final u in uploads)
              if (u.file != null) u.name,
          ],
          filesLabel:
              art.isNotEmpty ||
                  uploads.any((u) => u.kind == 'artwork' && u.file != null)
              ? 'Order form & artwork'
              : 'Order form',
          contact: [
            name.text.trim(),
            team.text.trim(),
          ].where((v) => v.isNotEmpty).join(' · '),
          email: email.text.trim(),
          mobile: phone.text.trim(),
          neededBy: neededBy == null ? null : _dayText(neededBy!),
          pickup: delivery == 'pickup',
          // No street yet: listed under Please check (QA8 #8), not just the country.
          deliveryText:
              delivery == 'pickup' || (address['street'] ?? '').trim().isEmpty
              ? null
              : deliveryLine(delivery, address),
          onEditDelivery: () {
            final details = detailsKey.currentContext;
            if (details != null) Scrollable.ensureVisible(details);
          },
          notes: notes.text.trim(),
          // Who makes it, when the upload offered a choice (as the website's review).
          madeBy: makers.length > 1
              ? MadeByField.chosenOf(makers, supplierId)?.name
              : null,
          price: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              PriceChoices(
                c,
                pricing,
                (next) => setState(() => pricing = next),
                choice: choiceDestination,
              ),
              // Priced as the order will be: the review's choice, else section 1's (pick up, the country).
              PriceBox(
                c,
                {
                  'items': correct ? items : const [],
                  'pricing': {
                    ...pricing,
                    if (pricing['destination'] == null &&
                        choiceDestination != null)
                      'destination': choiceDestination,
                  },
                },
                key: ValueKey(
                  '$correct${jsonEncode(pricing)}$choiceDestination',
                ),
              ),
            ],
          ),
          garmentsNote: note.isEmpty
              ? null
              : Padding(
                  padding: const EdgeInsets.only(top: 10, bottom: 4),
                  child: Text(
                    note,
                    key: const Key('read-summary'),
                    style: const TextStyle(
                      color: Palette.muted,
                      fontSize: 12.5,
                    ),
                  ),
                ),
          editor: OrderFormReadView(
            rows: rows,
            reading: reading,
            fileName: file,
            correct: correct,
            onCorrect: (v) => setState(() => correct = v),
            onChanged: () => setState(() => correct = false),
          ),
          editing: editingRows,
          onEditGarments: () => setState(() => editingRows = !editingRows),
          agreed: items.isNotEmpty ? correct : approved,
          onAgree: (v) => setState(() {
            approved = v;
            if (items.isNotEmpty) correct = v;
            error = null;
          }),
          busy: busy,
          error: errorText(),
          onBack: () => setState(() => step = 'edit'),
          onApprove: () {
            final missing = detailsProblem();
            if (missing != null) {
              setState(() => error = missing);
              final details = detailsKey.currentContext;
              if (details != null) Scrollable.ensureVisible(details);
              return;
            }
            confirm(items.isNotEmpty ? {'items': items} : const {});
          },
        ),
      ],
    );
  }
}

/// One column of the Orders screen's mini board: the stage, its count and up to two orders.
typedef MiniColumn = ({
  String name,
  int count,
  List<({String name, String ref, bool hot})> cards,
});

/// The first three stages of the customer's own board (`/orders/board`), as the Orders screen's My Orders card shows
/// them; null when there are no orders in them.
List<MiniColumn>? miniBoard(Map<String, dynamic>? board) {
  const names = {
    'received': 'Received',
    'design': 'Design',
    'production': 'Production',
  };
  final stages = ((board?['stages'] as List?) ?? const [])
      .whereType<Map>()
      .where((s) => names.containsKey(s['key']))
      .toList();
  final List<MiniColumn> columns = [
    for (final s in stages)
      (
        name: names[s['key']]!,
        count:
            (s['count'] as num?)?.toInt() ??
            ((s['orders'] as List?) ?? const []).length,
        cards: [
          for (final o
              in ((s['orders'] as List?) ?? const []).whereType<Map>().take(2))
            (
              name: ownOrderName(o['number'], o['name']).isEmpty
                  ? 'Order'
                  : '${o['name']}',
              ref: '#${o['number'] ?? o['id']}',
              hot: o['action'] == 'review_design' || o['approval'] == 'review',
            ),
        ],
      ),
  ];
  return columns.any((c) => c.count > 0) ? columns : null;
}

/// "Order now with 3DEEZI" (as on the website): Create Order Form, Upload Your Order, My Orders. Signing in comes first
/// where needed. On the app home (tapping its heading opens the Orders screen) and, larger, as the Orders screen
/// ([page]; the website's /order-now), where [board] is the customer's own orders for the My Orders card.
class OrderNowSection extends StatelessWidget {
  const OrderNowSection(this.c, {super.key, this.page = false, this.board});
  final AppController c;
  final bool page;
  final List<MiniColumn>? board;

  /// Back to the app's own screen first (the Orders screen is opened on top of it), then [screen].
  void _go(BuildContext context, AppScreen screen) {
    Navigator.of(context).popUntil((route) => route.isFirst);
    c.go(screen);
  }

  void _open(BuildContext context, Widget Function() screen) {
    if (!c.signedIn) {
      showToast(context, 'Sign in to place an order.');
      _go(context, AppScreen.auth);
      return;
    }
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => screen()));
  }

  @override
  Widget build(BuildContext context) {
    final big = page ? 1.18 : 1.0;
    Widget tile(
      IconData icon,
      String title,
      String label,
      String body,
      String action,
      VoidCallback onTap, {
      Widget? extra,
    }) => Padding(
      padding: EdgeInsets.only(bottom: page ? 16 : 12),
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
                      Text(
                        title,
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 17 * big,
                        ),
                      ),
                      Text(
                        label,
                        style: TextStyle(
                          color: Palette.cyan,
                          fontWeight: FontWeight.w800,
                          fontSize: 13 * big,
                          letterSpacing: .8,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(icon, color: Palette.cyan, size: 30 * big),
              ],
            ),
            SizedBox(height: page ? 8 : 6),
            Text(
              body,
              style: TextStyle(color: Palette.muted, fontSize: 13 * big),
            ),
            if (extra != null) ...[const SizedBox(height: 12), extra],
            SizedBox(height: page ? 14 : 10),
            GradientButton(label: action, compact: !page, onPressed: onTap),
          ],
        ),
      ),
    );
    final heading = Semantics(
      label: 'ORDER NOW WITH 3DEEZI',
      header: true,
      excludeSemantics: true,
      child: Wrap(
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 8,
        children: [
          Text(
            'ORDER NOW WITH',
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: page ? 26 : 20,
              letterSpacing: 1,
            ),
          ),
          Image.asset(
            'assets/images/brand-wordmark.png',
            height: page ? 21 : 16,
            semanticLabel: '3DEEZI',
          ),
          if (!page)
            const Icon(Icons.chevron_right, color: Palette.cyan, size: 22),
        ],
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // 3DEEZI as the logo (white 3D, cyan-blue EEZI), as on the website. On the home it opens the Orders screen.
        if (page)
          heading
        else
          Semantics(
            button: true,
            label: 'Open the Orders page',
            child: InkWell(
              key: const ValueKey('order-now-open'),
              borderRadius: BorderRadius.circular(10),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => OrderNowScreen(c)),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: heading,
              ),
            ),
          ),
        const SizedBox(height: 4),
        Text(
          'Start an order. Upload your details. Follow its progress.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: page ? Palette.text : Palette.muted,
            fontSize: page ? 14.5 : 12.5,
          ),
        ),
        SizedBox(height: page ? 20 : 14),
        tile(
          Icons.auto_awesome,
          'NEED HELP ORDERING?',
          'CREATE ORDER FORM',
          'Let 3DEEZI Assist help build your order form.',
          'CREATE ORDER FORM →',
          () => _open(context, () => OrderFormScreen(c)),
        ),
        tile(
          Icons.upload_file,
          'ORDER READY TO GO?',
          'UPLOAD YOUR ORDER',
          'Upload your completed order form and artwork.',
          'UPLOAD YOUR ORDER →',
          () => _open(context, () => OrderUploadScreen(c)),
        ),
        tile(
          Icons.view_kanban_outlined,
          'MY ORDERS',
          'YOUR ORDERS. ONE PLACE.',
          'View your current orders and follow their progress.',
          'VIEW MY ORDERS →',
          () => _go(context, AppScreen.orders),
          extra: page && board != null ? _MiniBoard(board!) : null,
        ),
      ],
    );
  }
}

/// The My Orders card's small board: Received, Design and Production with their counts and first orders.
class _MiniBoard extends StatelessWidget {
  const _MiniBoard(this.columns);
  final List<MiniColumn> columns;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      for (final (i, col) in columns.indexed) ...[
        if (i > 0) const SizedBox(width: 6),
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: const Color(0xff06111d),
              borderRadius: BorderRadius.circular(9),
              border: Border.all(color: const Color(0x17ffffff)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        col.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0x14ffffff),
                        borderRadius: BorderRadius.circular(5),
                      ),
                      child: Text(
                        '${col.count}',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                for (final card in col.cards)
                  Container(
                    margin: const EdgeInsets.only(top: 6),
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: const Color(0xff0b1828),
                      borderRadius: BorderRadius.circular(7),
                      border: Border.all(
                        color: card.hot
                            ? Palette.cyan
                            : const Color(0x12ffffff),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          card.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          card.ref,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 9.5,
                            color: Palette.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    ],
  );
}

/// The Orders screen (the website's /order-now; ORDERS in the website's header): "ORDER NOW WITH 3DEEZI", larger, on
/// the dark stadium with a glowing "AI". Signed in, the My Orders card shows the customer's own orders. Opened from the
/// home's ORDER NOW heading and the profile menu's Orders.
class OrderNowScreen extends StatefulWidget {
  const OrderNowScreen(this.c, {super.key});
  final AppController c;
  @override
  State<OrderNowScreen> createState() => _OrderNowScreenState();
}

class _OrderNowScreenState extends State<OrderNowScreen> {
  List<MiniColumn>? board;

  @override
  void initState() {
    super.initState();
    if (widget.c.signedIn) _loadBoard();
  }

  Future<void> _loadBoard() async {
    try {
      final b = await widget.c.api.ordersBoard();
      if (mounted) setState(() => board = miniBoard(b));
    } catch (_) {
      // The cards work without the board.
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Palette.bg,
    appBar: AppBar(backgroundColor: Palette.bg, title: const Text('Orders')),
    body: Stack(
      children: [
        Positioned.fill(
          child: Opacity(
            opacity: .5,
            child: Image.asset(
              'assets/images/showroom/stadium-stage.webp',
              fit: BoxFit.cover,
              alignment: const Alignment(0, .3),
              errorBuilder: (_, _, _) => const SizedBox(),
            ),
          ),
        ),
        const Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0xf205090d),
                  Color(0x9905090d),
                  Color(0xe605090d),
                ],
              ),
            ),
          ),
        ),
        // The glowing "AI" of the design, faint behind the heading on the right.
        Positioned(
          top: -8,
          right: 6,
          child: IgnorePointer(
            child: ExcludeSemantics(
              child: Transform(
                transform: Matrix4.skewX(-.24),
                child: Text(
                  'AI',
                  style: TextStyle(
                    fontFamily: 'Rajdhani',
                    fontWeight: FontWeight.w700,
                    fontSize: 170,
                    height: 1,
                    foreground: Paint()
                      ..style = PaintingStyle.stroke
                      ..strokeWidth = 2.5
                      ..color = const Color(0x8c3fb4ff),
                    shadows: const [
                      Shadow(color: Color(0xaa1f7dff), blurRadius: 24),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        ListView(
          padding: const EdgeInsets.fromLTRB(18, 22, 18, 88),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 560),
                child: OrderNowSection(widget.c, page: true, board: board),
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

/// The order forms' step bar (client pictures images/337, 339): numbered
/// steps joined by a line, done ones ticked, the current one lit; a tap goes
/// to that step (Review only through its own button).
class OrderStepBar extends StatelessWidget {
  const OrderStepBar({
    super.key,
    required this.names,
    required this.current,
    this.onTap,
  });
  final List<String> names;
  final int current;
  final ValueChanged<int>? onTap;

  @override
  Widget build(BuildContext context) => Row(
    key: const Key('order-step-bar'),
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      for (var i = 0; i < names.length; i++) ...[
        if (i > 0)
          Expanded(
            child: Container(
              height: 2,
              margin: const EdgeInsets.only(top: 13),
              color: i <= current ? Palette.cyan : const Color(0xff24425c),
            ),
          ),
        Semantics(
          button: onTap != null && i < names.length - 1,
          selected: i == current,
          label: 'Step ${i + 1} of ${names.length}: ${names[i]}',
          excludeSemantics: true,
          child: InkWell(
            key: Key('order-step-$i'),
            borderRadius: BorderRadius.circular(16),
            onTap: onTap == null ? null : () => onTap!(i),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Column(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i < current
                          ? Palette.cyan
                          : i == current
                          ? const Color(0xff0f5d8a)
                          : const Color(0xff061528),
                      border: Border.all(
                        color: i <= current
                            ? Palette.cyan
                            : const Color(0xff3d6585),
                        width: 2,
                      ),
                      boxShadow: i == current
                          ? [
                              BoxShadow(
                                color: Palette.cyan.withValues(alpha: .6),
                                blurRadius: 10,
                              ),
                            ]
                          : null,
                    ),
                    child: i < current
                        ? const Icon(
                            Icons.check,
                            size: 16,
                            color: Color(0xff04121f),
                          )
                        : Text(
                            '${i + 1}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                            ),
                          ),
                  ),
                  const SizedBox(height: 4),
                  // (A fixed width, the name shrinking to fit: four steps fit a 360 px phone.)
                  SizedBox(
                    width: 62,
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        names[i],
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: i == current
                              ? FontWeight.w800
                              : FontWeight.w600,
                          color: i == current
                              ? Colors.white
                              : const Color(0xff9fb0bf),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    ],
  );
}
