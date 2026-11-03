import 'dart:convert';

import 'package:flutter/material.dart';

import 'order_review_garments.dart';
import 'ui.dart';
import '../order_sizes.dart';

/// REVIEW & APPROVE ORDER in the app, as on the website (components/OrderReviewApprove.tsx, client design 2026-10-22):
/// the 3-step bar (Upload files → Review & approve → Order sent), then
/// - one matching kit: FINAL MOCKUPS (front and back, View full size) with the Uploaded files row, SELECTED GARMENTS
///   with the SIZE × garment table, TOTAL and "N matching kits · M garments", and the players;
/// - several garment styles: the chip and one section per garment style (order_review_garments.dart) and ORDER TOTALS;
/// then DELIVERY & NOTES with the price, and the confirm box with BACK TO EDIT and APPROVE ORDER (only once ticked).
/// Both order screens (lib/screens/order_entry.dart) show it; they keep their own data, checks and submit.

const _kitTops = {
  'jersey',
  'singlet',
  'tee',
  'polo',
  'hoodie',
  'jacket',
  'warmup',
};
const _kitBottoms = {'shorts', 'pants'};

/// A youth size as order forms write them: 8, Y10, 12Y, Youth 14, Kids 6.
bool isYouthSize(String s) => RegExp(
  r'^(y|yth|youth|k|kid|kids|age|size)?\s*-?\s*\d{1,2}\s*(y|yr|yrs|years?|k)?$',
  caseSensitive: false,
).hasMatch(s.trim());

/// The Kids count split into the youth sizes the form wrote ({'10Y': 1, '16Y': 1}) when they add up to it; else as is.
/// Only for showing: the order keeps its sizes. Orders since 2026-10-22 have the youth sizes themselves (2Y … 16Y),
/// so this only changes older ones. "Y10" and "10 yrs" show as the site's 10Y.
Map<String, int> youthSplit(Map<String, int> sizes, Map? formSizes) {
  final kids = sizes['Kids'] ?? 0;
  if (kids <= 0 || formSizes == null) return sizes;
  final youth = <String, int>{};
  for (final e in formSizes.entries) {
    final n = (e.value as num?)?.toInt() ?? 0;
    if (!isYouthSize('${e.key}') || n <= 0) continue;
    final key = siteSize('${e.key}') ?? '${e.key}'.trim().toUpperCase();
    youth[key] = (youth[key] ?? 0) + n;
  }
  if (youth.isEmpty || youth.values.fold(0, (a, b) => a + b) != kids)
    return sizes;
  return {...(Map.of(sizes)..remove('Kids')), ...youth};
}

/// Every size with a quantity in any garment, in the site's order (youth sizes included).
List<String> reviewSizeColumns(
  List<MultiGarment> garments, [
  List<String> order = reviewSiteSizes,
]) {
  final all = <String, int>{};
  for (final g in garments) {
    for (final e in g.sizes.entries) {
      if (e.value > 0) all[e.key] = (all[e.key] ?? 0) + e.value;
    }
  }
  return [for (final e in orderedSizes(all, order)) e.key];
}

/// Kits: when the garments make a kit (a top and a bottom), the smallest of their totals (each kit needs one of each);
/// "matching" when they all have the same sizes. Socks and the like count as garments only. Else null.
({int kits, bool matching})? kitCount(List<MultiGarment> garments) {
  final parts = garments
      .where(
        (g) => _kitTops.contains(g.garment) || _kitBottoms.contains(g.garment),
      )
      .toList();
  if (!parts.any((g) => _kitTops.contains(g.garment)) ||
      !parts.any((g) => _kitBottoms.contains(g.garment)))
    return null;
  final kits = parts.map((g) => g.total).reduce((a, b) => a < b ? a : b);
  String key(Map<String, int> s) =>
      (s.entries
              .where((e) => e.value > 0)
              .map((e) => '${e.key}=${e.value}')
              .toList()
            ..sort())
          .join(',');
  return (
    kits: kits,
    matching: parts.every((g) => key(g.sizes) == key(parts.first.sizes)),
  );
}

/// "30 matching kits · 60 garments", "12 kits · 26 garments" or "18 garments".
String kitLine(List<MultiGarment> garments) {
  final total = garments.fold(0, (a, g) => a + g.total);
  final all = '$total ${total == 1 ? 'garment' : 'garments'}';
  final kit = kitCount(garments);
  if (kit == null || kit.kits <= 0) return all;
  final word = kit.matching ? 'matching kit' : 'kit';
  return '${kit.kits} ${kit.kits == 1 ? word : '${word}s'} · $all';
}

/// Which layout: U4's rule (reviewLayoutFor: a top and shorts from one saved design with the same sizes), plus, as on
/// the website, a top and shorts with the same sizes and no saved design (an upload) is one kit too, and no rows at
/// all shows the kit layout's empty state. Everything else: one section per garment style.
String reviewLayout(List<Map<String, dynamic>> rows) {
  int qty(Map? s) =>
      (s ?? const {}).values.fold(0, (a, v) => a + ((v as num?)?.toInt() ?? 0));
  final sent = rows.where((r) => qty(r['sizes'] as Map?) > 0).toList();
  if (sent.isEmpty) return 'kit';
  if (reviewLayoutFor(sent) == 'kit') return 'kit';
  if (sent.length != 2 || sent.any((r) => r['project_id'] != null))
    return 'multi';
  final top = sent.any(
        (r) =>
            const {'jersey', 'tee', 'singlet', 'polo'}.contains(r['garment']),
      ),
      shorts = sent.any((r) => r['garment'] == 'shorts');
  return top && shorts && (kitCount(multiGarmentsFrom(sent))?.matching ?? false)
      ? 'kit'
      : 'multi';
}

/// A picture from a data: URI or an http(s) URL.
Widget reviewPicture(String src, {BoxFit fit = BoxFit.contain}) {
  if (src.startsWith('data:')) {
    try {
      return Image.memory(
        base64Decode(src.substring(src.indexOf(',') + 1)),
        fit: fit,
        gaplessPlayback: true,
      );
    } catch (_) {
      return const Icon(Icons.broken_image_outlined, color: Palette.muted);
    }
  }
  return Image.network(
    src,
    fit: fit,
    errorBuilder: (context, error, stack) =>
        const Icon(Icons.broken_image_outlined, color: Palette.muted),
  );
}

/// The 3-step bar. [current]: 1 on the review, 3 once the order is sent (every step done).
class ReviewStepBar extends StatelessWidget {
  const ReviewStepBar({
    super.key,
    required this.current,
    this.first = 'Upload files',
  });
  final int current;
  final String first;
  @override
  Widget build(BuildContext context) {
    final labels = [
      first,
      'Review & Approve',
      current >= 3 ? 'Order sent' : 'Payment',
    ];
    Widget dot(int i) {
      final done = i < current, now = i == current;
      return Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: now
              ? const Color(0xff119ad6)
              : done
              ? const Color(0xff062a3a)
              : const Color(0xff06121f),
          border: Border.all(
            color: done || now ? Palette.cyan : const Color(0xff3e6582),
            width: now ? 3 : 2,
          ),
        ),
        child: done
            ? const Icon(Icons.check, size: 17, color: Palette.cyan)
            : Text(
                '${i + 1}',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  color: now ? Colors.white : Palette.muted,
                ),
              ),
      );
    }

    return Row(
      key: const Key('review-steps'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < 3; i++) ...[
          if (i > 0)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(top: 15),
                child: Container(
                  height: 2,
                  color: i <= current ? Palette.cyan : const Color(0xff1a5f80),
                ),
              ),
            ),
          SizedBox(
            width: 90,
            child: Column(
              children: [
                dot(i),
                const SizedBox(height: 6),
                Text(
                  labels[i],
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: i == current
                        ? Palette.cyan
                        : i < current
                        ? Palette.text
                        : Palette.muted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// The title, its line and the step bar.
Widget reviewHeader({
  required bool sent,
  required String first,
  bool multi = false,
}) => Padding(
  padding: const EdgeInsets.only(bottom: 14),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        sent ? 'ORDER SENT' : 'REVIEW & APPROVE ORDER',
        style: const TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.w900,
          letterSpacing: 1.2,
        ),
      ),
      const SizedBox(height: 4),
      Text(
        sent
            ? 'Your order is with 3DEEZI.'
            : 'Check your design, garments, sizes, quantities and order details before confirming and proceeding to payment.',
        style: const TextStyle(color: Color(0xffcfe6ff)),
      ),
      const SizedBox(height: 14),
      ReviewStepBar(current: sent ? 3 : 1, first: first),
    ],
  ),
);

Widget _card({
  Key? key,
  required String title,
  Widget? action,
  required List<Widget> children,
}) => Padding(
  key: key,
  padding: const EdgeInsets.only(bottom: 14),
  child: Material(
    color: const Color(0xff061322),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(8),
      side: const BorderSide(color: Color(0xff2f87ad)),
    ),
    child: Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title.toUpperCase(),
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.4,
                    fontSize: 15,
                  ),
                ),
              ),
              if (action != null) action,
            ],
          ),
          const Divider(height: 18, color: Color(0xff24384b)),
          ...children,
        ],
      ),
    ),
  ),
);

/// A FRONT or BACK tile: the picture (tap or the zoom button: View full size), its tab label and "View full size ↗".
class _ShotTile extends StatelessWidget {
  const _ShotTile({
    required this.label,
    required this.src,
    required this.onOpen,
  });
  final String label;
  final String src;
  final VoidCallback onOpen;
  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: const Color(0xff040b14),
      borderRadius: BorderRadius.circular(8),
      border: Border.all(color: const Color(0xff24445f)),
    ),
    clipBehavior: Clip.antiAlias,
    child: Column(
      children: [
        AspectRatio(
          aspectRatio: 4 / 5,
          child: Stack(
            fit: StackFit.expand,
            children: [
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    colors: [
                      Color(0xff12304a),
                      Color(0xff081a2c),
                      Color(0xff040b14),
                    ],
                    stops: [0, .48, 1],
                  ),
                ),
              ),
              GestureDetector(onTap: onOpen, child: reviewPicture(src)),
              Positioned(
                top: 6,
                right: 6,
                child: IconButton.filledTonal(
                  tooltip: 'Zoom into the ${label.toLowerCase()}',
                  visualDensity: VisualDensity.compact,
                  iconSize: 18,
                  onPressed: onOpen,
                  icon: const Icon(Icons.zoom_in),
                ),
              ),
            ],
          ),
        ),
        Container(
          color: const Color(0xff061424),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          child: Row(
            children: [
              Flexible(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 7,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xff0b2238),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: const Color(0xff2f6d92)),
                  ),
                  child: Text(
                    label,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.2,
                    ),
                  ),
                ),
              ),
              const Spacer(),
              TextButton(
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  minimumSize: const Size(0, 34),
                  visualDensity: VisualDensity.compact,
                ),
                onPressed: onOpen,
                child: const Text(
                  'Full size ↗',
                  style: TextStyle(fontSize: 12),
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

Widget _fact(String label, Widget value, {Key? key}) => Padding(
  key: key,
  padding: const EdgeInsets.symmetric(vertical: 7),
  child: Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SizedBox(
        width: 112,
        child: Text(
          label,
          style: const TextStyle(color: Palette.muted, fontSize: 13),
        ),
      ),
      Expanded(child: value),
    ],
  ),
);

/// The whole review, as a list's children (the screens put it in their ListView). [mockups]: the kit's FRONT / BACK
/// (or the uploaded artwork) pictures; [editor] and [editing]: the editable garments shown by Edit sizes & garments.
List<Widget> orderReviewApprove(
  BuildContext context, {
  required String first,
  required String layout,
  required List<MultiGarment> garments,
  List<({String label, String src})> mockups = const [],
  bool artworkOnly = false,
  List<String> files = const [],
  String filesLabel = 'Order form & artwork',
  required String contact,
  String email = '',
  String mobile = '',
  String? neededBy,
  String? deliveryText,
  bool pickup = false,
  VoidCallback? onEditDelivery,
  String notes = '',
  // Who makes the order (preferred suppliers): shown when the form offered a choice, as on the website.
  String? madeBy,
  required Widget price,
  Widget? garmentsNote,
  Widget? editor,
  bool editing = false,
  required VoidCallback onEditGarments,
  void Function(int index)? onEditGarment,
  required bool agreed,
  required ValueChanged<bool> onAgree,
  bool busy = false,
  Widget? error,
  required VoidCallback onBack,
  required VoidCallback onApprove,
  // Download PDF / Download Excel: the order confirmation form (images/336, 338), when the draft is saved.
  void Function(String which)? onDownloadConfirmation,
}) {
  final multi = layout == 'multi' && garments.isNotEmpty;
  final sizes = reviewSizeColumns(garments);
  final players = [
    for (final g in garments)
      for (final p in g.players)
        (
          garment: g.name,
          name: '${p['name'] ?? ''}'.trim(),
          number: '${p['number'] ?? ''}'.trim(),
          size: '${p['size'] ?? ''}'.trim(),
        ),
  ];
  void openFiles() => showModalBottomSheet<void>(
    context: context,
    backgroundColor: const Color(0xff061322),
    builder: (context) => SafeArea(
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'UPLOADED FILES',
            style: TextStyle(fontWeight: FontWeight.w800, letterSpacing: 1.4),
          ),
          const SizedBox(height: 8),
          for (final f in files)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(
                Icons.description_outlined,
                color: Palette.cyan,
              ),
              title: Text(f),
            ),
        ],
      ),
    ),
  );
  final filesRow = Container(
    margin: const EdgeInsets.only(top: 12),
    padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
    decoration: BoxDecoration(
      color: const Color(0xff061424),
      borderRadius: BorderRadius.circular(8),
      border: Border.all(color: const Color(0xff24445f)),
    ),
    child: Row(
      children: [
        const Icon(Icons.description_outlined, color: Palette.cyan),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Uploaded files',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              Text(
                files.isEmpty
                    ? 'No files uploaded'
                    : '$filesLabel · ${files.length} ${files.length == 1 ? 'file' : 'files'}',
                style: const TextStyle(color: Palette.muted, fontSize: 12.5),
              ),
            ],
          ),
        ),
        if (files.isNotEmpty)
          TextButton(onPressed: openFiles, child: const Text('View files →')),
      ],
    ),
  );
  final editButton = TextButton.icon(
    key: const Key('edit-garments'),
    onPressed: onEditGarments,
    icon: Icon(editing ? Icons.check : Icons.edit_outlined, size: 16),
    label: Text(editing ? 'Done' : 'Edit sizes & garments'),
  );
  final editorCard = editing && editor != null
      ? _card(
          key: const Key('garment-editor'),
          title: 'Edit sizes & garments',
          action: TextButton(
            onPressed: onEditGarments,
            child: const Text('Done'),
          ),
          children: [editor],
        )
      : null;

  final delivery = _card(
    key: const Key('review-delivery-notes'),
    title: 'Contact & delivery details',
    action: onEditDelivery == null
        ? null
        : TextButton.icon(
            onPressed: onEditDelivery,
            icon: const Icon(Icons.edit_outlined, size: 16),
            label: const Text('Edit'),
          ),
    children: [
      _fact(
        'Contact',
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [Text(contact.isEmpty ? 'Not added' : contact)],
        ),
      ),
      _fact(
        'Email',
        Text(
          email.isEmpty ? 'Not added' : email,
          style: TextStyle(color: email.isEmpty ? Palette.muted : null),
        ),
      ),
      _fact(
        'Mobile',
        Text(
          mobile.isEmpty ? 'Not added' : mobile,
          style: TextStyle(color: mobile.isEmpty ? Palette.muted : null),
        ),
      ),
      _fact(
        'Required date',
        Text(
          neededBy ?? 'Not given',
          key: const Key('review-date-required'),
          style: TextStyle(color: neededBy == null ? Palette.muted : null),
        ),
      ),
      _fact(
        pickup ? 'Delivery' : 'Delivery address',
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              pickup
                  ? 'Pick up from 3DEEZI'
                  : deliveryText ??
                        'Confirmed with you by 3DEEZI before dispatch.',
              key: const Key('review-delivery'),
              style: TextStyle(
                color: !pickup && deliveryText == null ? Palette.muted : null,
              ),
            ),
            if (onEditDelivery != null)
              TextButton(
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(0, 32),
                  visualDensity: VisualDensity.compact,
                ),
                onPressed: onEditDelivery,
                child: const Text('Review delivery details →'),
              ),
          ],
        ),
      ),
    ],
  );

  final supplier = _card(
    key: const Key('review-supplier-notes'),
    title: 'Supplier & notes',
    action: TextButton.icon(
      onPressed: busy ? null : onBack,
      icon: const Icon(Icons.edit_outlined, size: 16),
      label: const Text('Edit'),
    ),
    children: [
      _fact(
        'Supplier',
        madeBy != null
            ? Text(madeBy, key: const Key('review-made-by'))
            : const Text('3DEEZI'),
      ),
      _fact(
        'Instructions',
        Text(
          notes.isEmpty ? 'None' : notes,
          style: TextStyle(color: notes.isEmpty ? Palette.muted : null),
        ),
      ),
      filesRow,
    ],
  );

  // ORDER DETAILS: a row per garment, its sizes across with the total (client design images/369).
  Widget sizesAcross(MultiGarment g) {
    final used = [
      for (final z in sizes)
        if ((g.sizes[z] ?? 0) > 0) z,
    ];
    Widget cell(String t, {bool head = false, bool total = false}) => Container(
      width: total ? 54 : 40,
      padding: const EdgeInsets.symmetric(vertical: 7),
      color: total ? const Color(0xff0b2f44) : null,
      alignment: Alignment.center,
      child: Text(
        t,
        style: TextStyle(
          fontSize: total && !head ? 16 : 13,
          fontWeight: head || total ? FontWeight.w700 : FontWeight.w400,
          color: total && !head
              ? Palette.cyan
              : head
              ? const Color(0xffcfe6ff)
              : null,
        ),
      ),
    );
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Container(
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xff1d4a66)),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                cell('Size', head: true),
                for (final z in used) cell(z, head: true),
                cell('Total', head: true, total: true),
              ],
            ),
            const SizedBox(width: 0, height: 1),
            Row(
              children: [
                cell('Qty', head: true),
                for (final z in used) cell('${g.sizes[z]}'),
                cell('${g.total}', total: true),
              ],
            ),
          ],
        ),
      ),
    );
  }

  final details = _card(
    key: const Key('review-garments'),
    title: 'Order details',
    action: editButton,
    children: [
      if (garments.isEmpty)
        const Text(
          'No garments read yet. Use Edit order to add them, or 3DEEZI reads them from your order form and checks them with you.',
          style: TextStyle(color: Palette.muted),
        )
      else ...[
        for (final g in garments)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0xff163a52)),
              color: const Color(0x99061421),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.checkroom,
                      color: Color(0xff9fc6e6),
                      size: 30,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            g.name,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                            ),
                          ),
                          if (g.detail.isNotEmpty)
                            Text(
                              g.detail,
                              style: const TextStyle(
                                color: Palette.muted,
                                fontSize: 12.5,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                sizesAcross(g),
              ],
            ),
          ),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            kitLine(garments),
            key: const Key('kit-line'),
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
          ),
        ),
      ],
      if (garmentsNote != null) garmentsNote,
    ],
  );

  Widget playerLine(
    ({String garment, String name, String number, String size}) p,
  ) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      children: [
        SizedBox(
          width: 34,
          child: Text(
            p.number.isEmpty ? '–' : p.number,
            style: const TextStyle(color: Color(0xffcfe6ff)),
          ),
        ),
        Expanded(child: Text(p.name.isEmpty ? '—' : p.name)),
        Text(
          [
            p.size,
            if (garments.length > 1) p.garment,
          ].where((v) => v.isNotEmpty).join(' · '),
          style: const TextStyle(color: Palette.muted, fontSize: 12),
        ),
      ],
    ),
  );
  final playersCard = _card(
    key: const Key('review-players-card'),
    title: 'Player names & numbers',
    action: TextButton(
      onPressed: onEditGarments,
      child: Text(
        '${players.length} ${players.length == 1 ? 'player' : 'players'} · Edit',
      ),
    ),
    children: [
      if (players.isEmpty)
        const Text(
          'No names or numbers on this order.',
          style: TextStyle(color: Palette.muted),
        )
      else ...[
        for (final p in players.take(6)) playerLine(p),
        if (players.length > 6)
          Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              key: const Key('review-players'),
              tilePadding: EdgeInsets.zero,
              title: Text(
                'View all ${players.length} players',
                style: const TextStyle(
                  color: Palette.cyan,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              children: [for (final p in players.skip(6)) playerLine(p)],
            ),
          ),
      ],
    ],
  );

  final total = garments.fold(0, (a, g) => a + g.total);
  final summary = _card(
    key: const Key('review-totals'),
    title: 'Order summary',
    children: [
      for (final g in garments)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            children: [
              Expanded(child: Text(g.name)),
              Text('${g.total}'),
            ],
          ),
        ),
      _fact(
        'Garment styles',
        Text(
          '${garments.length}',
          key: const Key('total-styles'),
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      Container(
        margin: const EdgeInsets.only(top: 6),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: const Color(0xff1f7d99)),
          color: const Color(0xff0a2b3c),
        ),
        child: Row(
          children: [
            const Expanded(
              child: Text(
                'Total quantity',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            Text(
              '$total',
              key: const Key('total-garments'),
              style: const TextStyle(
                color: Palette.cyan,
                fontWeight: FontWeight.w800,
                fontSize: 18,
              ),
            ),
          ],
        ),
      ),
      const Padding(
        padding: EdgeInsets.only(top: 10, bottom: 4),
        child: Text(
          'Pricing',
          style: TextStyle(color: Palette.muted, fontSize: 13),
        ),
      ),
      price,
    ],
  );

  final missing = [
    if (garments.isEmpty) 'Garments and sizes',
    if (mobile.isEmpty) 'Mobile',
    if (neededBy == null) 'Required date',
    if (!pickup && deliveryText == null && onEditDelivery != null)
      'Delivery address',
  ];
  final ready = missing.isEmpty;
  final status = Container(
    key: Key(ready ? 'review-ready' : 'review-check'),
    margin: const EdgeInsets.only(bottom: 14),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(10),
      border: Border.all(
        color: ready ? const Color(0xff2f9e5c) : const Color(0xffb7862a),
      ),
      color: ready ? const Color(0xff0c2a1f) : const Color(0xff2a2009),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          ready ? Icons.check_circle : Icons.error_outline,
          color: ready ? const Color(0xff2fc46b) : const Color(0xffffb547),
          size: 28,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                ready ? 'Order ready to approve' : 'Please check',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 4),
              if (ready)
                const Text(
                  'All required information is complete, and your mockups, garments, sizes and quantities are ready for final approval.',
                  style: TextStyle(color: Color(0xffcfe6ff), fontSize: 13),
                )
              else ...[
                for (final m in missing)
                  Text(
                    '• $m missing',
                    style: const TextStyle(color: Color(0xffffe6b0)),
                  ),
              ],
            ],
          ),
        ),
      ],
    ),
  );

  final confirm = Material(
    key: const Key('review-confirm'),
    color: const Color(0xff061322),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(8),
      side: const BorderSide(color: Color(0xff2f87ad)),
    ),
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: () => onAgree(!agreed),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Checkbox(
                  key: const Key('approve-check'),
                  value: agreed,
                  onChanged: (v) => onAgree(v ?? false),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'I confirm that the mockups, garment details, sizes, quantities, player names/numbers and delivery information are correct and approved for production.',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                        const Text(
                          'Approval saves this version of your order.',
                          style: TextStyle(
                            color: Palette.muted,
                            fontSize: 12.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (error != null) error,
          if (onDownloadConfirmation != null) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    key: const Key('confirmation-pdf'),
                    onPressed: () => onDownloadConfirmation('pdf'),
                    icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
                    label: const Text('Download PDF'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    key: const Key('confirmation-excel'),
                    onPressed: () => onDownloadConfirmation('excel'),
                    icon: const Icon(Icons.table_chart_outlined, size: 18),
                    label: const Text('Download Excel'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              key: const Key('share-form'),
              onPressed: () => onDownloadConfirmation('share'),
              icon: const Icon(Icons.share_outlined, size: 18),
              label: const Text('Share order form'),
            ),
          ],
          const SizedBox(height: 12),
          GradientButton(
            key: const Key('approve-order'),
            label: busy ? 'SENDING…' : 'APPROVE & CONTINUE TO PAYMENT',
            icon: Icons.arrow_forward,
            onPressed: agreed && !busy ? onApprove : null,
          ),
          if (!agreed)
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text(
                'Tick the box to approve.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Palette.muted, fontSize: 12),
              ),
            ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: busy ? null : onBack,
            icon: const Icon(Icons.arrow_back, size: 18),
            label: const Text(
              'BACK TO EDIT',
              style: TextStyle(fontWeight: FontWeight.w800, letterSpacing: 1.1),
            ),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              side: const BorderSide(color: Color(0xff4f86b0)),
            ),
          ),
        ],
      ),
    ),
  );

  if (multi) {
    return [
      reviewHeader(sent: false, first: first, multi: true),
      Align(
        alignment: Alignment.centerLeft,
        child: ReviewSummaryChip(garments),
      ),
      const SizedBox(height: 12),
      if (garmentsNote != null) garmentsNote,
      for (var i = 0; i < garments.length; i++)
        GarmentReviewSection(
          garment: garments[i],
          index: i,
          onEdit: () => (onEditGarment ?? (_) => onEditGarments())(i),
        ),
      if (editorCard != null) editorCard,
      playersCard,
      summary,
      delivery,
      supplier,
      status,
      confirm,
    ];
  }

  final shots = mockups.take(2).toList();
  final List<({String label, String? src})> views = [
    for (final s in shots) (label: s.label, src: s.src),
  ];
  return [
    reviewHeader(sent: false, first: first),
    _card(
      key: const Key('review-mockups'),
      title: 'Final mockups',
      children: [
        if (shots.isEmpty)
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0xff2f5f80)),
            ),
            child: const Row(
              children: [
                Icon(Icons.collections_outlined, color: Palette.cyan, size: 32),
                SizedBox(width: 14),
                Expanded(
                  child: Text(
                    'Mockups are prepared by 3DEEZI after you approve.',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          )
        else
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var i = 0; i < shots.length; i++) ...[
                if (i > 0) const SizedBox(width: 10),
                Expanded(
                  child: _ShotTile(
                    label: shots[i].label,
                    src: shots[i].src,
                    onOpen: () =>
                        showMockupViewer(context, 'Final mockups', views, i),
                  ),
                ),
              ],
              if (shots.length == 1) const Expanded(child: SizedBox.shrink()),
            ],
          ),
        if (artworkOnly && shots.isNotEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text(
              'Your uploaded pictures are shown. 3DEEZI prepares the final mockups from them after you approve.',
              style: TextStyle(color: Palette.muted, fontSize: 12.5),
            ),
          ),
      ],
    ),
    details,
    if (editorCard != null) editorCard,
    playersCard,
    summary,
    delivery,
    supplier,
    status,
    confirm,
  ];
}

/// Step 3 (Order sent) above the screens' confirmation.
Widget orderSentHeader(String first) => reviewHeader(sent: true, first: first);
