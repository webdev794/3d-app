import 'package:flutter/material.dart';

import '../order_sizes.dart';
import 'ui.dart';

/// The order's size columns (as on the website and the server's Order::SIZES): Mens XS–8XL, Womens W8–W24, Kids
/// 2Y–16Y, then the older Kids column.
const orderSizes = allOrderSizes;

/// The rows of an order form's reading (`suggested` from POST /order-drafts/{id}/read), copied so they can be
/// corrected: each with its sizes, players (name, number, size) and, for showing only, `_form` (the sizes as written,
/// e.g. {"10Y": 3}) and each player's `_written` size and `_k` key.
List<Map<String, dynamic>> readRows(Map<String, dynamic>? reading) {
  final items = ((reading?['items'] as List?) ?? const []).whereType<Map>().toList();
  final details = (reading?['details'] as List?) ?? const [];
  var key = 0;
  return [
    for (var i = 0; i < items.length; i++)
      () {
        final item = items[i].cast<String, dynamic>();
        final detail = i < details.length && details[i] is Map ? (details[i] as Map).cast<String, dynamic>() : const <String, dynamic>{};
        final written = (detail['player_sizes'] as List?) ?? const [];
        final players = ((item['players'] as List?) ?? const []).whereType<Map>().toList();
        return <String, dynamic>{
          ...item,
          'sizes': {for (final e in ((item['sizes'] as Map?) ?? const {}).entries) '${e.key}': (e.value as num?)?.toInt() ?? 0},
          if (item['players'] != null)
            'players': [
              for (var j = 0; j < players.length; j++)
                {...players[j].cast<String, dynamic>(), '_k': key++, '_written': j < written.length ? '${written[j] ?? ''}' : ''},
            ],
          '_form': detail['form_sizes'] is Map ? (detail['form_sizes'] as Map).cast<String, dynamic>() : null,
        };
      }(),
  ];
}

/// The rows as the order takes them: the order's fields only (no display fields), no empty rows.
List<Map<String, dynamic>> cleanRows(List<Map<String, dynamic>> rows) => [
  for (final r in rows)
    if (rowTotal(r) > 0)
      {
        'garment': r['garment'] ?? 'other',
        if (r['sport'] != null) 'sport': r['sport'],
        if (r['fit'] != null) 'fit': r['fit'],
        if (r['label'] != null) 'label': r['label'],
        'sizes': {for (final e in (r['sizes'] as Map).entries) if (((e.value as num?) ?? 0) > 0) e.key: e.value},
        if (r['players'] != null)
          'players': [
            for (final p in (r['players'] as List).cast<Map<String, dynamic>>()) {'name': p['name'] ?? '', 'number': p['number'] ?? '', 'size': p['size']},
          ],
      },
];

int rowTotal(Map<String, dynamic> row) => ((row['sizes'] as Map?) ?? const {}).values.fold(0, (a, n) => a + ((n as num?)?.toInt() ?? 0));

/// Review section "Details from your order form" (client 2026-10-22, as on the website): the finished form 3DEEZI AI
/// read from the upload, to check rather than fill in: garment rows with their sizes, the players, the date on the form
/// and the totals, every value editable; only lines it couldn't place are listed. With nothing read, nothing has to be
/// filled in: 3DEEZI reads the form and confirms the sizes.
class OrderFormReadView extends StatefulWidget {
  const OrderFormReadView({super.key, required this.rows, required this.reading, required this.fileName, required this.correct, required this.onCorrect, required this.onChanged});

  /// Edited in place; [onChanged] tells the screen (which unticks [correct]).
  final List<Map<String, dynamic>> rows;
  final Map<String, dynamic>? reading;
  final String fileName;
  final bool correct;
  final ValueChanged<bool> onCorrect;
  final VoidCallback onChanged;

  @override
  State<OrderFormReadView> createState() => _OrderFormReadViewState();
}

class _OrderFormReadViewState extends State<OrderFormReadView> {
  final _controllers = <String, TextEditingController>{};
  // Rows showing every size (all fits), not just their own fit's set.
  final _wide = <int>{};

  @override
  void didUpdateWidget(OrderFormReadView old) {
    super.didUpdateWidget(old);
    if (!identical(old.rows, widget.rows)) _clear();
  }

  @override
  void dispose() {
    _clear();
    super.dispose();
  }

  void _clear() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    _controllers.clear();
  }

  TextEditingController _size(int i, String s) {
    final n = (widget.rows[i]['sizes'] as Map)[s] as int? ?? 0;
    return _controllers.putIfAbsent('$i:$s', () => TextEditingController(text: n > 0 ? '$n' : ''));
  }

  void _setSize(int i, String s, int n) {
    (widget.rows[i]['sizes'] as Map)[s] = n;
    final c = _controllers['$i:$s'];
    if (c != null && c.text != (n > 0 ? '$n' : '')) c.text = n > 0 ? '$n' : '';
  }

  /// A player's size changed or the player removed: the row's counts follow.
  void _player(int i, int j, {String? size, bool remove = false, bool sizeChanged = false}) {
    final players = (widget.rows[i]['players'] as List).cast<Map<String, dynamic>>();
    final p = players[j];
    final from = p['size'] as String?;
    final to = remove ? null : (sizeChanged ? size : from);
    if (from != to) {
      final sizes = widget.rows[i]['sizes'] as Map;
      if (from != null && ((sizes[from] as int?) ?? 0) > 0) _setSize(i, from, (sizes[from] as int) - 1);
      if (to != null) _setSize(i, to, ((sizes[to] as int?) ?? 0) + 1);
    }
    setState(() {
      if (remove) {
        players.removeAt(j);
      } else {
        p['size'] = to;
      }
    });
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final rows = widget.rows;
    final reading = widget.reading;
    final ai = reading?['source'] == 'ai';
    final form = (reading?['form'] as Map?)?.cast<String, dynamic>() ?? const {};
    final unknown = ((reading?['unknown'] as List?) ?? const []).map((e) => '$e').toList();
    final total = rows.fold<int>(0, (a, r) => a + rowTotal(r));
    final players = rows.fold<int>(0, (a, r) => a + ((r['players'] as List?)?.length ?? 0));
    final dateWords = '${form['needed_by_text'] ?? ''}'.trim();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          key: Key(rows.isEmpty ? 'read-nothing' : 'read-note'),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: ai ? const Color(0x665A6CFF) : const Color(0xFF2B4A63)), color: const Color(0xFF071A29)),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(rows.isEmpty ? Icons.info_outline : ai ? Icons.auto_awesome : Icons.info_outline, size: 18, color: ai ? const Color(0xFFB7A3FF) : Palette.cyan),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  rows.isEmpty
                      ? 'Nothing to fill in here. 3DEEZI AI couldn’t read the garments and sizes from ${widget.fileName}, so 3DEEZI reads your form and confirms the sizes with you before anything is made.'
                      : ai
                      ? 'Read by 3DEEZI AI from ${widget.fileName}. Please check: you can correct anything below.'
                      : 'Read from ${widget.fileName}. Please check: you can correct anything below.',
                  style: const TextStyle(fontSize: 13, height: 1.4),
                ),
              ),
            ],
          ),
        ),
        if (dateWords.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Date required on your form: $dateWords', key: const Key('read-date'), style: const TextStyle(fontSize: 13))),
        for (var i = 0; i < rows.length; i++) _row(i),
        if (rows.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text('Total: $total garment${total == 1 ? '' : 's'}${players > 0 ? ' · $players players' : ''}', key: const Key('read-totals'), style: const TextStyle(fontWeight: FontWeight.w800)),
          ),
        if (unknown.isNotEmpty)
          Container(
            key: const Key('read-unread'),
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0x55FFC27A)), color: const Color(0xFF1D160A)),
            child: Text(
              '${unknown.length == 1 ? 'One line' : '${unknown.length} lines'} to check: 3DEEZI couldn’t place ${unknown.length == 1 ? 'it' : 'them'}, so we check with you.\n${unknown.map((l) => '• $l').join('\n')}',
              style: const TextStyle(color: Color(0xFFFFC27A), fontSize: 12.5, height: 1.4),
            ),
          ),
        if (rows.isNotEmpty)
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: widget.correct,
            onChanged: (v) => widget.onCorrect(v ?? false),
            title: const Text('These details are correct'),
            subtitle: const Text('We make your order from them. Anything unclear in your order form is checked with you.', style: TextStyle(fontSize: 12)),
          ),
      ],
    );
  }

  Widget _row(int i) {
    final row = widget.rows[i];
    final players = ((row['players'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final written = (row['_form'] as Map?)?.entries.map((e) => '${e.key} ${e.value}').join(' · ') ?? '';
    // The row's fit's sizes (Mens XS–4XL, Womens W8–W20, Kids 6Y–16Y) and any it has; "All sizes" shows every one.
    final counts = {for (final e in (row['sizes'] as Map).entries) '${e.key}': (e.value as num?)?.toInt() ?? 0};
    final fit = row['fit'] is String ? row['fit'] as String : fitFromSizes(counts);
    final all = _wide.contains(i);
    final shown = all ? orderSizes : rowSizes(fit, counts);
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: SurfaceCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text('${row['name'] ?? row['label'] ?? row['garment']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
                Text('${rowTotal(row)}', key: Key('row-total-$i'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final s in shown)
                  SizedBox(
                    width: 52,
                    child: TextField(
                      key: Key('size-$i-$s'),
                      controller: _size(i, s),
                      keyboardType: TextInputType.number,
                      textAlign: TextAlign.center,
                      decoration: InputDecoration(labelText: s, isDense: true, border: const OutlineInputBorder(), hintText: '0'),
                      onChanged: (v) {
                        (row['sizes'] as Map)[s] = (int.tryParse(v.replaceAll(RegExp(r'\D'), '')) ?? 0).clamp(0, 10000);
                        setState(() {});
                        widget.onChanged();
                      },
                    ),
                  ),
              ],
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                key: Key('all-sizes-$i'),
                onPressed: () => setState(() => all ? _wide.remove(i) : _wide.add(i)),
                child: Text(all ? 'Fewer sizes' : '+ All sizes (Mens, Womens, Kids)', style: const TextStyle(fontSize: 12.5)),
              ),
            ),
            if (written.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('As on your form: $written', style: const TextStyle(color: Palette.muted, fontSize: 12))),
            if (players.isNotEmpty)
              ExpansionTile(
                key: Key('players-$i'),
                tilePadding: EdgeInsets.zero,
                initiallyExpanded: players.length <= 40,
                title: Text('Players: names and numbers (${players.length})', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                children: [
                  for (var j = 0; j < players.length; j++)
                    Padding(
                      key: ValueKey('player-${players[j]['_k']}'),
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              initialValue: '${players[j]['name'] ?? ''}',
                              maxLength: 40,
                              decoration: const InputDecoration(isDense: true, counterText: '', hintText: 'Name', border: OutlineInputBorder()),
                              onChanged: (v) {
                                players[j]['name'] = v;
                                widget.onChanged();
                              },
                            ),
                          ),
                          const SizedBox(width: 6),
                          SizedBox(
                            width: 52,
                            child: TextFormField(
                              initialValue: '${players[j]['number'] ?? ''}',
                              maxLength: 3,
                              keyboardType: TextInputType.number,
                              decoration: const InputDecoration(isDense: true, counterText: '', hintText: 'No.', border: OutlineInputBorder()),
                              onChanged: (v) {
                                players[j]['number'] = v.replaceAll(RegExp(r'\D'), '');
                                widget.onChanged();
                              },
                            ),
                          ),
                          const SizedBox(width: 6),
                          DropdownButton<String?>(
                            value: players[j]['size'] as String?,
                            hint: Text('${players[j]['_written'] ?? ''}'.isEmpty ? 'Size?' : '${players[j]['_written']}?', style: const TextStyle(color: Color(0xFFFFC27A))),
                            items: [for (final s in orderSizes) DropdownMenuItem<String?>(value: s, child: Text(s))],
                            onChanged: (v) => _player(i, j, size: v, sizeChanged: true),
                          ),
                          if ('${players[j]['_written'] ?? ''}'.isNotEmpty && '${players[j]['_written']}'.toUpperCase() != '${players[j]['size'] ?? ''}'.toUpperCase())
                            Padding(padding: const EdgeInsets.only(left: 4), child: Text('${players[j]['_written']}', style: const TextStyle(color: Color(0xFF9FDCFF), fontSize: 11))),
                          IconButton(tooltip: 'Remove this player', visualDensity: VisualDensity.compact, onPressed: () => _player(i, j, remove: true), icon: const Icon(Icons.close, size: 18)),
                        ],
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
