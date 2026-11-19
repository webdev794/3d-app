import 'package:flutter/material.dart';

import 'sports_catalog.dart';
import 'widgets/ui.dart' show Palette;

/// "Custom…" in the Sport and Garment pickers (client 2026-11-02,
/// images/293.jpg: artwork for caps could only go on the listed garments).
/// The typed name is kept as the sport's or the product's name; the 3D kit
/// uses our nearest garment. The website does the same
/// (resources/js/customChoice.ts).
const customValue = '__custom';
const customMax = 40;
const customPlaceholder = 'e.g. Cap, Lacrosse, Bowling shirt';
const customLabel = 'Custom…';

/// What may be typed: plain text, no tags or control characters, up to 40
/// characters (the website's server checks the same).
String typedName(String text) {
  final s = text
      .replaceAll(RegExp(r'[\x00-\x1f\x7f<>]'), '')
      .replaceAll(RegExp(r'\s{2,}'), ' ')
      .replaceFirst(RegExp(r'^\s+'), '');
  return s.length > customMax ? s.substring(0, customMax) : s;
}

/// The typed name as it is kept (trimmed).
String customName(String? text) => typedName(text ?? '').trim();

/// A typed garment's nearest 3D garment (website id), by its words (first
/// match wins); null when no word matches.
const _nearest = <(String, String)>[
  (r'\bbucket', 'bucket-hat'),
  (r'\b(caps?|hats?|beanies?|snapbacks?|visors?|truckers?)\b', 'cap'),
  (r'\bsocks?\b', 'socks'),
  (r'\b(skirts?|skorts?)\b', 'skirt'),
  (r'\bdress(es)?\b', 'netball-dress'),
  (r'\bpolos?\b', 'polo'),
  (r'\bhood', 'hoodie'),
  (r'\bjackets?\b', 'trackjacket'),
  (r'\b(singlets?|vests?|tanks?)\b', 'singlet'),
  (r'\b(tees?|t-?shirts?)\b', 'tee'),
  (r'\bshorts?\b', 'shorts'),
];

String? garmentIdInText(String text) {
  final t = text.toLowerCase();
  for (final (re, id) in _nearest) {
    if (RegExp(re).hasMatch(t)) return id;
  }
  return null;
}

/// The app's 3D garment name ("Cap") for a typed garment: the nearest one
/// (of [allowed] app names, when given), else the jersey.
String nearestGarment(String text, [Iterable<String>? allowed]) {
  final id = garmentIdInText(text);
  final name = id == null
      ? null
      : garmentIds.entries.where((e) => e.value == id).firstOrNull?.key;
  return name != null && (allowed == null || allowed.contains(name))
      ? name
      : 'Jersey';
}

/// The order form's row (Order::GARMENTS) for a typed garment: its nearest
/// garment there, else "Other".
String nearestOrderGarment(String text) =>
    const {
      'trackjacket': 'jacket',
      'cap': 'cap',
      'socks': 'socks',
      'polo': 'polo',
      'hoodie': 'hoodie',
      'singlet': 'singlet',
      'tee': 'tee',
      'shorts': 'shorts',
    }[garmentIdInText(text)] ??
    'other';

/// The website sport a typed sport is saved under (projects keep a catalogue
/// id; its name goes in design.sportName): Training.
const customSportId = 'training';

/// "Custom…": asks for a name ([title], e.g. "Type your garment"); null when
/// closed. [uses] gives the line under it ("3D preview uses cap").
Future<String?> askCustomName(
  BuildContext context, {
  required String title,
  String hint = customPlaceholder,
  String initial = '',
  String Function(String name)? uses,
}) {
  final text = TextEditingController(text: initial);
  return showDialog<String>(
    context: context,
    builder: (dialog) => StatefulBuilder(
      builder: (dialog, setState) {
        final name = customName(text.text);
        void done() {
          if (name.isNotEmpty) Navigator.pop(dialog, name);
        }

        return AlertDialog(
          backgroundColor: Palette.surface,
          title: Text(title),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                key: const Key('custom-name'),
                controller: text,
                autofocus: true,
                maxLength: customMax,
                decoration: InputDecoration(hintText: hint, counterText: ''),
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => done(),
              ),
              if (uses != null && name.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    uses(name),
                    key: const Key('custom-uses'),
                    style: const TextStyle(color: Palette.cyan, fontSize: 12),
                  ),
                ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: name.isEmpty ? null : done,
              child: const Text('OK'),
            ),
          ],
        );
      },
    ),
  );
}
