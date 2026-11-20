import 'dart:async';

import 'package:flutter/material.dart';

import 'ui.dart' show Palette;

/// One address suggestion: label, street, suburb, state, postcode, country.
typedef AddressSuggestion = Map<String, dynamic>;

/// Street address with suggestions (task TL-2, 2026-11-05; as on the
/// website): about 400 ms after typing stops, [suggest] asks our server
/// (Photon / OpenStreetMap, Australia / New Zealand first) and the matches show
/// under the field; tapping one calls [onPick] to fill Street, Suburb / town,
/// State, Postcode and Country. Nothing found or no connection: no list, and
/// the typed address stays as it is.
class StreetAddressField extends StatefulWidget {
  const StreetAddressField({
    super.key,
    required this.controller,
    required this.suggest,
    required this.onPick,
    this.delay = const Duration(milliseconds: 400),
  });

  final TextEditingController controller;
  final Future<List<AddressSuggestion>> Function(String q) suggest;
  final ValueChanged<AddressSuggestion> onPick;
  final Duration delay;

  @override
  State<StreetAddressField> createState() => _StreetAddressFieldState();
}

class _StreetAddressFieldState extends State<StreetAddressField> {
  static final _cache = <String, List<AddressSuggestion>>{};
  Timer? _timer;
  List<AddressSuggestion> _items = const [];
  int _ask = 0;

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _typed(String text) {
    _timer?.cancel();
    final key = text.trim().toLowerCase();
    final ask = ++_ask;
    if (key.length < 4) {
      setState(() => _items = const []);
      return;
    }
    if (_cache[key] case final known?) {
      setState(() => _items = known);
      return;
    }
    _timer = Timer(widget.delay, () async {
      List<AddressSuggestion> found;
      try {
        found = await widget.suggest(text.trim());
        _cache[key] = found;
      } catch (_) {
        found = const [];
      }
      if (mounted && ask == _ask) setState(() => _items = found);
    });
  }

  void _pick(AddressSuggestion a) {
    _timer?.cancel();
    _ask++;
    setState(() => _items = const []);
    FocusScope.of(context).unfocus();
    widget.onPick(a);
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          key: const Key('address-street'),
          controller: widget.controller,
          onChanged: _typed,
          keyboardType: TextInputType.streetAddress,
          decoration: const InputDecoration(
            labelText: 'Street address',
            hintText: 'Start typing, e.g. 12 Smith Street',
            border: OutlineInputBorder(),
            isDense: true,
          ),
        ),
        if (_items.isNotEmpty)
          Container(
            key: const Key('address-suggestions'),
            margin: const EdgeInsets.only(top: 4),
            decoration: BoxDecoration(
              color: const Color(0xff0b1a28),
              border: Border.all(color: Palette.cyan),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final a in _items)
                  InkWell(
                    onTap: () => _pick(a),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 44),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 9,
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.place_outlined,
                              size: 16,
                              color: Palette.cyan,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                '${a['label'] ?? ''}',
                                style: const TextStyle(fontSize: 13.5),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                const Padding(
                  padding: EdgeInsets.fromLTRB(10, 2, 10, 6),
                  child: Text(
                    'Addresses © OpenStreetMap',
                    style: TextStyle(fontSize: 11, color: Palette.muted),
                  ),
                ),
              ],
            ),
          ),
      ],
    ),
  );
}
