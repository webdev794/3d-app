import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../order_sizes.dart' show allOrderSizes, oldKids;
import '../widgets/ui.dart';

/// THE ORDER FORM MAKER'S FORM, corrected in place (client 2026-11-13, the
/// MANTIS example; the same as the website's /orders/assistant): the team's
/// brand, the garment, and per design its name, colourway and sizes. A design
/// can come off the form. Pops with the body for
/// POST /order-assistant/{token}/form, or null when nothing is saved.
class OrderFormEditor extends StatefulWidget {
  const OrderFormEditor({
    super.key,
    required this.form,
    this.pictures = const {},
  });

  /// The order's analysis.form (OrderDesignForm on the server).
  final Map form;

  /// A design picture's name and its URL (the order's `designs`).
  final Map<String, String> pictures;

  @override
  State<OrderFormEditor> createState() => _OrderFormEditorState();
}

class _Design {
  _Design(Map d)
    : key = '${d['key']}',
      colour = _hex(d['colour']),
      pictures = [
        for (final p in ((d['pictures'] as List?) ?? const []).whereType<Map>())
          '${p['name']}',
      ],
      name = TextEditingController(text: '${d['name'] ?? ''}'),
      colourway = TextEditingController(text: '${d['colourway'] ?? ''}'),
      sizes = {
        for (final e in ((d['sizes'] as Map?) ?? const {}).entries)
          '${e.key}': (e.value as num?)?.toInt() ?? 0,
      };
  final String key;
  final Color? colour;
  final List<String> pictures;
  final TextEditingController name, colourway;
  final Map<String, int> sizes;
  int get total => sizes.values.fold(0, (a, b) => a + b);
}

Color? _hex(Object? v) {
  final s = '${v ?? ''}'.replaceFirst('#', '');
  final n = s.length == 6 ? int.tryParse(s, radix: 16) : null;
  return n == null ? null : Color(0xff000000 | n);
}

class _OrderFormEditorState extends State<OrderFormEditor> {
  late final brand = TextEditingController(text: '${widget.form['brand'] ?? ''}');
  late final garment = TextEditingController(
    text: '${widget.form['garment'] ?? ''}',
  );
  late final designs = [
    for (final d in ((widget.form['designs'] as List?) ?? const [])
        .whereType<Map>())
      _Design(d),
  ];
  final extra = <String>[];

  /// The size columns: every size a design has, then the ones added.
  List<String> get columns {
    final used = {
      for (final d in designs) ...d.sizes.keys,
      ...extra,
    };
    return [for (final s in allOrderSizes) if (used.contains(s)) s];
  }

  int get grand => designs.fold(0, (a, d) => a + d.total);

  @override
  void dispose() {
    brand.dispose();
    garment.dispose();
    for (final d in designs) {
      d.name.dispose();
      d.colourway.dispose();
    }
    super.dispose();
  }

  void _save() => Navigator.of(context).pop(<String, dynamic>{
    'brand': brand.text.trim(),
    'garment': garment.text.trim(),
    'designs': [
      for (final d in designs)
        {
          'key': d.key,
          'name': d.name.text.trim(),
          'colourway': d.colourway.text.trim(),
          'sizes': {
            for (final e in d.sizes.entries)
              if (e.value > 0) e.key: e.value,
          },
        },
    ],
  });

  @override
  Widget build(BuildContext context) {
    final cols = columns;
    final left = [
      for (final s in allOrderSizes)
        if (s != oldKids && !cols.contains(s)) s,
    ];
    return Scaffold(
      backgroundColor: Palette.bg,
      appBar: AppBar(
        backgroundColor: Palette.bg,
        title: const Text('Names & sizes'),
        actions: [
          TextButton(
            key: const ValueKey('form-editor-save'),
            onPressed: _save,
            child: const Text(
              'Save',
              style: TextStyle(
                color: Palette.cyan,
                fontWeight: FontWeight.w800,
                fontSize: 16,
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: _Field(
                    key: const ValueKey('form-editor-brand'),
                    label: 'Team / brand',
                    controller: brand,
                    max: 40,
                  ),
                ),
                const SizedBox(width: 10),
                Container(
                  key: const ValueKey('form-editor-grand'),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xffecfdf5),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      const Text(
                        'GRAND TOTAL',
                        style: TextStyle(
                          color: Color(0xff0f766e),
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(
                        '$grand',
                        style: const TextStyle(
                          color: Color(0xff0f766e),
                          fontSize: 24,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            _Field(
              key: const ValueKey('form-editor-garment'),
              label: 'Garment',
              controller: garment,
              max: 60,
            ),
            const SizedBox(height: 14),
            for (final (i, d) in designs.indexed) _designCard(i, d, cols),
            if (left.isNotEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: PopupMenuButton<String>(
                  key: const ValueKey('form-editor-add-size'),
                  color: Palette.surface,
                  onSelected: (s) => setState(() => extra.add(s)),
                  itemBuilder: (_) => [
                    for (final s in left)
                      PopupMenuItem(value: s, child: Text(s)),
                  ],
                  child: const Padding(
                    padding: EdgeInsets.symmetric(vertical: 10),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.add, color: Palette.cyan, size: 18),
                        SizedBox(width: 6),
                        Text(
                          'Add a size',
                          style: TextStyle(color: Palette.cyan),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 10),
            FilledButton.icon(
              key: const ValueKey('form-editor-save-bottom'),
              onPressed: _save,
              style: FilledButton.styleFrom(
                backgroundColor: Palette.cyan,
                foregroundColor: const Color(0xff04202c),
                minimumSize: const Size.fromHeight(48),
                shape: const StadiumBorder(),
                textStyle: const TextStyle(fontWeight: FontWeight.w800),
              ),
              icon: const Icon(Icons.check_rounded),
              label: const Text('Save and update the PDF'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _designCard(int i, _Design d, List<String> cols) {
    final colour = d.colour ?? Palette.surface2;
    final url = d.pictures
        .map((p) => widget.pictures[p])
        .whereType<String>()
        .firstOrNull;
    final differs = designs.any(
      (x) => x != d && !_sameSizes(x.sizes, d.sizes),
    );
    return Container(
      key: ValueKey('form-editor-design-$i'),
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Palette.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border(left: BorderSide(color: colour, width: 6)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: colour,
                  borderRadius: BorderRadius.circular(9),
                  border: Border.all(color: Colors.white24),
                ),
                child: Text(
                  (i + 1).toString().padLeft(2, '0'),
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    shadows: [Shadow(blurRadius: 2)],
                  ),
                ),
              ),
              if (url != null) ...[
                const SizedBox(width: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    color: Colors.white,
                    width: 76,
                    height: 44,
                    child: Image.network(
                      url,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => const SizedBox(),
                    ),
                  ),
                ),
              ],
              const Spacer(),
              Text(
                '${d.total} PCS',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              IconButton(
                key: ValueKey('form-editor-remove-$i'),
                tooltip: 'Take this design off the form',
                icon: const Icon(Icons.delete_outline, color: Palette.muted),
                onPressed: () => setState(() => designs.removeAt(i)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                flex: 4,
                child: _Field(
                  key: ValueKey('form-editor-name-$i'),
                  label: 'Name',
                  controller: d.name,
                  max: 60,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 3,
                child: _Field(
                  key: ValueKey('form-editor-colourway-$i'),
                  label: 'Colourway',
                  controller: d.colourway,
                  max: 40,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final s in cols)
                SizedBox(
                  key: ValueKey('form-editor-size-$i-$s'),
                  width: 58,
                  // Keyed by the design (not its place) and by _rebuild:
                  // a box keeps its own text until the sizes change outside it.
                  child: TextFormField(
                    key: ValueKey('${d.key}|$s|$_rebuild'),
                    initialValue: (d.sizes[s] ?? 0) > 0 ? '${d.sizes[s]}' : '',
                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(5),
                    ],
                    textAlign: TextAlign.center,
                    decoration: InputDecoration(
                      labelText: s,
                      hintText: '0',
                      isDense: true,
                      border: const OutlineInputBorder(),
                    ),
                    onChanged: (v) => setState(
                      () => d.sizes[s] = (int.tryParse(v) ?? 0).clamp(0, 10000),
                    ),
                  ),
                ),
            ],
          ),
          if (differs)
            TextButton(
              key: ValueKey('form-editor-same-$i'),
              onPressed: () => setState(() {
                for (final x in designs) {
                  x.sizes
                    ..clear()
                    ..addAll(d.sizes);
                }
                // The size boxes show the new numbers (they keep their own text).
                _rebuild++;
              }),
              child: const Text('Use these sizes for every design'),
            ),
        ],
      ),
    );
  }

  /// Bumped when sizes change from outside a box, so the boxes are made anew.
  int _rebuild = 0;

  static bool _sameSizes(Map<String, int> a, Map<String, int> b) {
    final x = {for (final e in a.entries) if (e.value > 0) e.key: e.value};
    final y = {for (final e in b.entries) if (e.value > 0) e.key: e.value};
    return x.length == y.length && x.entries.every((e) => y[e.key] == e.value);
  }
}

class _Field extends StatelessWidget {
  const _Field({
    super.key,
    required this.label,
    required this.controller,
    required this.max,
  });
  final String label;
  final TextEditingController controller;
  final int max;

  @override
  Widget build(BuildContext context) => TextField(
    controller: controller,
    maxLength: max,
    decoration: InputDecoration(
      labelText: label,
      counterText: '',
      isDense: true,
      border: const OutlineInputBorder(),
    ),
  );
}
