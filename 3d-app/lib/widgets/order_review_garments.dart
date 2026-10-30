import 'dart:convert';

import 'package:flutter/material.dart';

import 'ui.dart';
import '../order_sizes.dart';

/// REVIEW & APPROVE ORDER with several garment styles, as on the website (components/OrderReviewGarments.tsx):
/// the "3 garment styles · 90 garments" chip, one section per garment ("01 — BASKETBALL SINGLET", Edit garment,
/// FRONT and BACK tiles with View full size, the name and "colours · fit", SIZE | QTY with TOTAL, the players) and
/// ORDER TOTALS. One matching kit (a top and shorts from one design, same sizes) keeps the combined review.

/// The site's sizes in order (Order::SIZES: Mens XS–8XL, Womens W8–W24, Kids 2Y–16Y, the older Kids); other youth
/// sizes (Y8, Kids 12, YXL) go with Kids.
const reviewSiteSizes = allOrderSizes;
const _letters = [
  'XXS',
  '2XS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  '2XL',
  'XXXL',
  '3XL',
  '4XL',
  '5XL',
  '6XL',
  '7XL',
  '8XL',
];
final _youth = RegExp(
  r'^(?:y(?:outh)?\s*-?\s*|k(?:ids?)?\s*-?\s*|jr\s*-?\s*)(\d{1,2}|xxs|xs|s|m|l|xl)$|^(\d{1,2})\s*y?$',
  caseSensitive: false,
);

double _rank(String size, List<String> order) {
  final i = order.indexWhere((s) => s.toLowerCase() == size.toLowerCase());
  if (i >= 0) return i.toDouble();
  final kids = order.indexWhere((s) => s.toLowerCase() == 'kids');
  final m = _youth.firstMatch(size.trim());
  if (m != null) {
    final part = (m.group(1) ?? m.group(2)!).toUpperCase();
    final n = int.tryParse(part);
    final sub = n != null ? n / 100 : 0.2 + _letters.indexOf(part) / 100;
    return (kids >= 0 ? kids : order.length) - 0.5 + sub * 0.9;
  }
  final letter = _letters.indexOf(size.toUpperCase());
  return letter >= 0 ? order.length + letter / 100 : order.length + 1.0;
}

/// The sizes with a quantity, in the site's order (youth sizes included).
List<MapEntry<String, int>> orderedSizes(
  Map<String, int> sizes, [
  List<String> order = reviewSiteSizes,
]) {
  final list = [
    for (final e in sizes.entries)
      if (e.value > 0) e,
  ];
  final at = {for (var i = 0; i < list.length; i++) list[i].key: i};
  list.sort((a, b) {
    final r = _rank(a.key, order).compareTo(_rank(b.key, order));
    return r != 0 ? r : at[a.key]!.compareTo(at[b.key]!);
  });
  return list;
}

int _qty(Map? sizes) => (sizes ?? const {}).values.fold(
  0,
  (a, v) => a + ((v as num?)?.toInt() ?? 0).clamp(0, 1 << 30),
);
Map<String, int> _sizesOf(Map? sizes) => {
  for (final e in (sizes ?? const {}).entries)
    '${e.key}': (e.value as num?)?.toInt() ?? 0,
};

const _tops = {'jersey', 'tee', 'singlet', 'polo'};

/// 'kit' for one matching kit (a top and shorts from the same saved design, the same sizes), else 'multi'.
String reviewLayoutFor(List<Map<String, dynamic>> rows) {
  final items = rows.where((r) => _qty(r['sizes'] as Map?) > 0).toList();
  if (items.length != 2) return 'multi';
  final shorts = items.where((r) => r['garment'] == 'shorts').firstOrNull,
      top = items.where((r) => _tops.contains(r['garment'])).firstOrNull;
  if (shorts == null ||
      top == null ||
      top['project_id'] == null ||
      top['project_id'] != shorts['project_id'])
    return 'multi';
  final a = orderedSizes(_sizesOf(top['sizes'] as Map?)),
      b = orderedSizes(_sizesOf(shorts['sizes'] as Map?));
  if (a.length != b.length) return 'multi';
  for (var i = 0; i < a.length; i++) {
    if (a[i].key.toLowerCase() != b[i].key.toLowerCase() ||
        a[i].value != b[i].value)
      return 'multi';
  }
  return 'kit';
}

/// One garment style of the review.
class MultiGarment {
  const MultiGarment({
    required this.garment,
    required this.name,
    this.detail = '',
    required this.sizes,
    this.players = const [],
    this.front,
    this.back,
    this.artwork = false,
  });
  final String garment, name, detail;
  final Map<String, int> sizes;

  /// Each with name, number and size.
  final List<Map<String, dynamic>> players;

  /// Pictures: an http(s) URL or a data: URI; null shows "Mockup prepared by 3DEEZI after you approve".
  final String? front, back;

  /// [front] is the uploaded artwork (not a mockup).
  final bool artwork;
  int get total => sizes.values.fold(0, (a, b) => a + (b > 0 ? b : 0));
}

const _fits = {
  'mens': 'Mens fit',
  'womens': 'Womens fit',
  'youth': 'Kids fit',
  'unisex': 'Unisex fit',
};

/// The review's garments from the order rows (the form's rows, or the rows read from an upload). [names]: garment
/// id → name; [pictures]: a row's FRONT / BACK pictures when known (e.g. its design's saved picture); [artwork]: an
/// uploaded artwork picture for rows without one.
List<MultiGarment> multiGarmentsFrom(
  List<Map<String, dynamic>> rows, {
  Map<String, String> names = const {},
  ({String? front, String? back}) Function(Map<String, dynamic> row)? pictures,
  String? artwork,
}) => [
  for (final r in rows)
    if (_qty(r['sizes'] as Map?) > 0)
      () {
        final garment = '${r['garment'] ?? 'other'}';
        final own = pictures?.call(r);
        final label = '${r['label'] ?? r['name'] ?? ''}'.trim();
        final name = label.isNotEmpty
            ? label
            : names[garment] ??
                  (garment.isEmpty
                      ? 'Garment'
                      : '${garment[0].toUpperCase()}${garment.substring(1)}');
        final hasOwn = own?.front != null || own?.back != null;
        return MultiGarment(
          garment: garment,
          name: name,
          detail: _fits['${r['fit']}'] ?? '',
          sizes: _sizesOf(r['sizes'] as Map?),
          players: [
            for (final p
                in ((r['players'] as List?) ?? const []).whereType<Map>())
              if ('${p['name'] ?? ''}${p['number'] ?? ''}'.trim().isNotEmpty)
                p.cast<String, dynamic>(),
          ],
          front: hasOwn ? own!.front : artwork,
          back: hasOwn ? own!.back : null,
          artwork: !hasOwn && artwork != null,
        );
      }(),
];

String summaryText(List<MultiGarment> garments) {
  final total = garments.fold(0, (a, g) => a + g.total);
  return '${garments.length} garment ${garments.length == 1 ? 'style' : 'styles'} · $total ${total == 1 ? 'garment' : 'garments'}';
}

/// The chip under the title: a shirt icon and "3 garment styles · 90 garments".
class ReviewSummaryChip extends StatelessWidget {
  const ReviewSummaryChip(this.garments, {super.key});
  final List<MultiGarment> garments;
  @override
  Widget build(BuildContext context) => Container(
    key: const Key('review-summary'),
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
    decoration: BoxDecoration(
      color: const Color(0xff0b2742),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: const Color(0xff2f87ad)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.checkroom, size: 17, color: Palette.cyan),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            summaryText(garments),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    ),
  );
}

Widget _picture(String? src, {BoxFit fit = BoxFit.contain}) {
  if (src == null) return const SizedBox.shrink();
  if (src.startsWith('data:')) {
    final comma = src.indexOf(',');
    try {
      return Image.memory(
        base64Decode(src.substring(comma + 1)),
        fit: fit,
        gaplessPlayback: true,
      );
    } catch (_) {
      return const SizedBox.shrink();
    }
  }
  return Image.network(
    src,
    fit: fit,
    errorBuilder: (context, error, stack) =>
        const Icon(Icons.broken_image_outlined, color: Palette.muted),
  );
}

class _Placeholder extends StatelessWidget {
  const _Placeholder();
  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.all(10),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.checkroom, size: 30, color: Color(0xff3f7aa0)),
        SizedBox(height: 6),
        Text(
          'Mockup prepared by 3DEEZI after you approve',
          textAlign: TextAlign.center,
          style: TextStyle(color: Palette.muted, fontSize: 11.5, height: 1.35),
        ),
      ],
    ),
  );
}

/// View full size: the garment's pictures large, pinch to zoom, FRONT / BACK.
Future<void> showMockupViewer(
  BuildContext context,
  String title,
  List<({String label, String? src})> views,
  int start,
) => showDialog<void>(
  context: context,
  barrierColor: const Color(0xdd02060c),
  builder: (context) => Dialog.fullscreen(
    backgroundColor: const Color(0xff040c16),
    child: DefaultTabController(
      length: views.length,
      initialIndex: start,
      child: Scaffold(
        backgroundColor: const Color(0xff040c16),
        appBar: AppBar(
          backgroundColor: const Color(0xff071a2c),
          title: Text(
            title.toUpperCase(),
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
              fontSize: 16,
            ),
          ),
          leading: IconButton(
            tooltip: 'Close',
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.of(context).pop(),
          ),
          bottom: TabBar(
            tabs: [for (final v in views) Tab(text: v.label)],
            indicatorColor: Palette.cyan,
          ),
        ),
        body: TabBarView(
          children: [
            for (final v in views)
              v.src == null
                  ? const Center(child: _Placeholder())
                  : InteractiveViewer(
                      maxScale: 5,
                      child: Center(child: _picture(v.src)),
                    ),
          ],
        ),
      ),
    ),
  ),
);

class _Tile extends StatelessWidget {
  const _Tile({required this.label, required this.src, required this.onOpen});
  final String label;
  final String? src;
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
              if (src != null)
                GestureDetector(onTap: onOpen, child: _picture(src))
              else
                const _Placeholder(),
              if (src != null)
                Positioned(
                  top: 6,
                  right: 6,
                  child: IconButton.filledTonal(
                    tooltip: 'Zoom',
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
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 4,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xff0b2238),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: const Color(0xff2f6d92)),
                ),
                child: Text(
                  label,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
              if (src != null)
                TextButton(
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    minimumSize: const Size(0, 34),
                    visualDensity: VisualDensity.compact,
                  ),
                  onPressed: onOpen,
                  child: const Text(
                    'View full size ↗',
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

/// One garment style: "01 — NAME" with Edit garment, FRONT and BACK, the name and line, SIZE | QTY and the players.
class GarmentReviewSection extends StatelessWidget {
  const GarmentReviewSection({
    super.key,
    required this.garment,
    required this.index,
    this.onEdit,
    this.sizeOrder = reviewSiteSizes,
  });
  final MultiGarment garment;
  final int index;
  final VoidCallback? onEdit;
  final List<String> sizeOrder;
  @override
  Widget build(BuildContext context) {
    final g = garment, number = '${index + 1}'.padLeft(2, '0');
    final rows = orderedSizes(g.sizes, sizeOrder);
    final views = [
      (label: g.artwork ? 'ARTWORK' : 'FRONT', src: g.front),
      (label: 'BACK', src: g.back),
    ];
    void open(int i) =>
        showMockupViewer(context, '$number — ${g.name}', views, i);
    return Padding(
      key: Key('garment-section-$index'),
      padding: const EdgeInsets.only(bottom: 14),
      child: Material(
        color: const Color(0xff061322),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: const BorderSide(color: Color(0xff2f87ad)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(12, 6, 4, 6),
              color: const Color(0xff0d2a47),
              child: Row(
                children: [
                  Expanded(
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: number,
                            style: const TextStyle(color: Palette.cyan),
                          ),
                          const TextSpan(
                            text: ' — ',
                            style: TextStyle(color: Color(0xff7fa6c4)),
                          ),
                          TextSpan(text: g.name.toUpperCase()),
                        ],
                      ),
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.3,
                        fontSize: 15,
                      ),
                    ),
                  ),
                  if (onEdit != null)
                    TextButton.icon(
                      onPressed: onEdit,
                      icon: const Icon(Icons.edit_outlined, size: 16),
                      label: const Text('Edit garment'),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (var i = 0; i < views.length; i++) ...[
                        if (i > 0) const SizedBox(width: 8),
                        Expanded(
                          child: _Tile(
                            label: views[i].label,
                            src: views[i].src,
                            onOpen: () => open(i),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    g.name,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (g.detail.isNotEmpty)
                    Text(
                      g.detail,
                      style: const TextStyle(
                        color: Palette.muted,
                        fontSize: 13,
                      ),
                    ),
                  const SizedBox(height: 10),
                  _SizeTable(rows: rows, total: g.total),
                  if (g.players.isNotEmpty)
                    Theme(
                      data: Theme.of(
                        context,
                      ).copyWith(dividerColor: Colors.transparent),
                      child: ExpansionTile(
                        key: Key('players-$index'),
                        tilePadding: EdgeInsets.zero,
                        title: Text(
                          '${g.players.length} ${g.players.length == 1 ? 'player' : 'players'} · names & numbers',
                          style: const TextStyle(
                            color: Palette.cyan,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        children: [
                          for (final p in g.players)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 3),
                              child: Row(
                                children: [
                                  Expanded(
                                    flex: 5,
                                    child: Text(
                                      '${p['name'] ?? ''}'.trim().isEmpty
                                          ? '—'
                                          : '${p['name']}',
                                    ),
                                  ),
                                  Expanded(
                                    flex: 2,
                                    child: Text(
                                      '${p['number'] ?? ''}'.trim().isEmpty
                                          ? '—'
                                          : '${p['number']}',
                                    ),
                                  ),
                                  Expanded(
                                    flex: 2,
                                    child: Text(
                                      '${p['size'] ?? ''}'.trim().isEmpty
                                          ? '—'
                                          : '${p['size']}',
                                      textAlign: TextAlign.end,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SizeTable extends StatelessWidget {
  const _SizeTable({required this.rows, required this.total});
  final List<MapEntry<String, int>> rows;
  final int total;
  Widget _row(String a, String b, {bool head = false, bool foot = false}) =>
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: head
              ? const Color(0xff0b2238)
              : foot
              ? const Color(0xff0b3550)
              : null,
          border: head
              ? null
              : Border(
                  top: BorderSide(
                    color: foot
                        ? const Color(0xff2f87ad)
                        : const Color(0xff16304a),
                  ),
                ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                a,
                style: TextStyle(
                  fontWeight: head || foot ? FontWeight.w800 : FontWeight.w400,
                  letterSpacing: head ? 1.2 : 0,
                  fontSize: head ? 12 : 14,
                ),
              ),
            ),
            Text(
              b,
              style: TextStyle(
                fontWeight: head || foot ? FontWeight.w800 : FontWeight.w400,
                color: foot ? Palette.cyan : null,
                fontSize: head
                    ? 12
                    : foot
                    ? 16
                    : 14,
              ),
            ),
          ],
        ),
      );
  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(7),
      border: Border.all(color: const Color(0xff24445f)),
    ),
    clipBehavior: Clip.antiAlias,
    child: Column(
      children: [
        _row('SIZE', 'QTY', head: true),
        for (final r in rows) _row(r.key, '${r.value}'),
        KeyedSubtree(
          key: const Key('garment-total'),
          child: _row('TOTAL', '$total', foot: true),
        ),
      ],
    ),
  );
}

/// ORDER TOTALS: garment styles, total garments and the price ([price], else "Pricing pending confirmation.").
class OrderTotalsCard extends StatelessWidget {
  const OrderTotalsCard(this.garments, {super.key, this.price});
  final List<MultiGarment> garments;
  final Widget? price;
  @override
  Widget build(BuildContext context) {
    Widget line(String a, Widget b) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(a, style: const TextStyle(color: Palette.muted)),
          ),
          Expanded(child: b),
        ],
      ),
    );
    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'ORDER TOTALS',
            style: TextStyle(
              fontWeight: FontWeight.w800,
              letterSpacing: 1.4,
              fontSize: 15,
            ),
          ),
          const Divider(),
          line(
            'Garment styles',
            Text(
              '${garments.length}',
              key: const Key('total-styles'),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          line(
            'Total garments',
            Text(
              '${garments.fold(0, (a, g) => a + g.total)}',
              key: const Key('total-garments'),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          line('Pricing', price ?? const Text('Pricing pending confirmation.')),
        ],
      ),
    );
  }
}

/// The chip, then one section per garment, then ORDER TOTALS: for a review screen's list.
List<Widget> multiGarmentReview(
  List<MultiGarment> garments, {
  void Function(int index)? onEdit,
  Widget? price,
}) => [
  Align(alignment: Alignment.centerLeft, child: ReviewSummaryChip(garments)),
  const SizedBox(height: 12),
  for (var i = 0; i < garments.length; i++)
    GarmentReviewSection(
      garment: garments[i],
      index: i,
      onEdit: onEdit == null ? null : () => onEdit(i),
    ),
  OrderTotalsCard(garments, price: price),
];
