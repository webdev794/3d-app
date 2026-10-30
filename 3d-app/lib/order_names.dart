/// Names and numbers on the back of an order's shirts, as on the website's
/// order form: the three choices, the players list (typed or pasted from
/// Excel) and the part of the order body they make (POST /orders).
library;

import 'order_sizes.dart';

export 'order_sizes.dart';

/// The sizes an order can have (the website's list: Mens XS–8XL, Womens
/// W8–W24, Kids 2Y–16Y, then the older Kids column; order_sizes.dart).
const orderSizes = allOrderSizes;

/// The most players on one order's list.
const maxPlayers = 300;

/// What goes on the back of the shirts.
enum BackNames {
  same('The same on every shirt'),
  list('A different name and number for each player'),
  none('No name or number on the back');

  const BackNames(this.label);
  final String label;
}

/// One shirt's back. In a list, each player has a size.
class OrderPlayer {
  OrderPlayer({this.name = '', this.number = '', this.size});
  String name, number;
  String? size;

  Map<String, dynamic> toJson({bool withSize = true}) => {
    'name': name.trim(),
    'number': number,
    if (withSize) 'size': size,
  };
}

/// The sample name a new design starts with: the customer types the real
/// one when ordering.
bool isPlaceholderName(String name) => name.trim().toUpperCase() == 'YOUR NAME';

/// Digits only, at most 3.
String orderDigits(String value) {
  final d = value.replaceAll(RegExp(r'\D'), '');
  return d.length > 3 ? d.substring(0, 3) : d;
}

/// A size in a spreadsheet cell ("m", "XXL", "10y", "W12", "kids"), or null
/// (order_sizes.dart siteSize).
String? sizeFromCell(String cell) => siteSize(cell);

/// Players pasted from Excel: one per line, cells split by tabs (or commas
/// or semicolons). The size and the number (up to 3 digits) are found in any
/// column, the rest is the name. A heading line is skipped.
List<OrderPlayer> parsePlayers(String text) {
  final number = RegExp(r'^#?\d{1,3}$');
  final heading = RegExp(
    r'\b(names?|numbers?|no|sizes?|players?)\b',
    caseSensitive: false,
  );
  final players = <OrderPlayer>[];
  for (final line in text.split(RegExp(r'\r?\n'))) {
    final cells = line
        .split(line.contains('\t') ? RegExp('\t') : RegExp('[,;]'))
        .map((c) {
          final t = c.trim();
          return t.length > 1 && t.startsWith('"') && t.endsWith('"')
              ? t.substring(1, t.length - 1).trim()
              : t;
        })
        .where((c) => c.isNotEmpty)
        .toList();
    if (cells.isEmpty) continue;
    var sizeAt = -1, numberAt = -1;
    for (var i = 0; i < cells.length; i++) {
      if (sizeFromCell(cells[i]) != null) sizeAt = i;
    }
    for (var i = 0; i < cells.length; i++) {
      if (i != sizeAt && number.hasMatch(cells[i])) numberAt = i;
    }
    final name = [
      for (var i = 0; i < cells.length; i++)
        if (i != sizeAt && i != numberAt) cells[i],
    ].join(' ');
    if (sizeAt < 0 && numberAt < 0 && heading.hasMatch(name)) continue;
    players.add(
      OrderPlayer(
        name: name,
        number: numberAt < 0 ? '' : cells[numberAt].replaceAll('#', ''),
        size: sizeAt < 0 ? null : sizeFromCell(cells[sizeAt]),
      ),
    );
  }
  return players;
}

/// Garments per size for a players list, in size order.
Map<String, int> countSizes(Iterable<OrderPlayer> players) => {
  for (final s in orderSizes)
    if (players.where((p) => p.size == s).isNotEmpty)
      s: players.where((p) => p.size == s).length,
};

/// One row for each garment already counted by size (up to [maxPlayers]),
/// the first with the design's name and number; one row when none are.
List<OrderPlayer> rowsForSizes(
  Map<String, int> sizes, {
  String name = '',
  String number = '',
}) {
  final rows = [
    for (final s in orderSizes)
      for (var i = 0; i < (sizes[s] ?? 0); i++) OrderPlayer(size: s),
  ].take(maxPlayers).toList();
  if (rows.isEmpty) rows.add(OrderPlayer());
  rows.first
    ..name = name
    ..number = orderDigits(number);
  return rows;
}

/// What is wrong with one player's row, or null.
String? playerProblem(OrderPlayer p) {
  if (isPlaceholderName(p.name))
    return 'change YOUR NAME to the player’s name.';
  if (p.name.trim().isEmpty && p.number.isEmpty) {
    return 'add a name or a number.';
  }
  if (p.name.trim().length > 40) return 'a name can be up to 40 characters.';
  if (!RegExp(r'^\d{0,3}$').hasMatch(p.number)) {
    return 'the number is digits only, up to 3.';
  }
  if (p.size == null) return 'choose a size.';
  return null;
}

/// The first problem with what goes on the back, or null.
String? namesProblem(
  BackNames? names,
  OrderPlayer same,
  List<OrderPlayer> list,
) {
  switch (names) {
    case null:
      return 'Choose what goes on the back: the same name and number on every shirt, one for each player, or none.';
    case BackNames.same:
      if (isPlaceholderName(same.name)) {
        return 'Change YOUR NAME to the name to print on every shirt.';
      }
      if (same.name.trim().isEmpty && same.number.isEmpty) {
        return 'Add the name or the number to print, or choose “No name or number on the back”.';
      }
    case BackNames.list:
      if (list.isEmpty) return 'Add the players’ names and numbers.';
      if (list.length > maxPlayers) {
        return 'A list can have up to $maxPlayers players.';
      }
      for (var i = 0; i < list.length; i++) {
        final problem = playerProblem(list[i]);
        if (problem != null) return 'Player ${i + 1}: $problem';
      }
    case BackNames.none:
      break;
  }
  return null;
}

/// The names part of the order body.
Map<String, dynamic> namesBody(
  BackNames names,
  OrderPlayer same,
  List<OrderPlayer> list,
) => {
  'names': names.name,
  if (names == BackNames.same) 'players': [same.toJson(withSize: false)],
  if (names == BackNames.list) 'players': [for (final p in list) p.toJson()],
};
