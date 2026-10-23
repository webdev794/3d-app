/// The order sizes, one set per fit (client price list 2026-10-22, tasks.md
/// 9.12), as the website has them (Order::SIZES, resources/js/orderSizes.ts):
///   Mens (and Unisex): XS S M L XL 2XL 3XL 4XL 5XL 6XL 7XL 8XL
///   Womens:            W8 W10 W12 W14 W16 W18 W20 W22 W24
///   Kids (fit youth):  2Y 4Y 6Y 8Y 10Y 12Y 14Y 16Y
/// plus "Kids", the one youth column of older orders and drafts (still shown
/// and kept, never offered for new rows). The rare sizes open with "More sizes".
library;

const mensSizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'];
const womensSizes = ['W8', 'W10', 'W12', 'W14', 'W16', 'W18', 'W20', 'W22', 'W24'];
const kidsSizes = ['2Y', '4Y', '6Y', '8Y', '10Y', '12Y', '14Y', '16Y'];

/// The youth column of orders before 2026-10-22.
const oldKids = 'Kids';

/// Every size, in order (orders/options `sizes`).
const allOrderSizes = [...mensSizes, ...womensSizes, ...kidsSizes, oldKids];

/// Sizes behind "More sizes" (rarely ordered).
const rareSizes = ['5XL', '6XL', '7XL', '8XL', 'W22', 'W24', '2Y', '4Y'];

/// The fits as the order shows them (Order::FITS): "youth" is the Kids fit.
const fitNames = {'mens': 'Mens', 'womens': 'Womens', 'youth': 'Kids', 'unisex': 'Unisex'};

/// The size set a fit orders in: womens, youth (Kids), else mens (also
/// unisex and no fit).
List<String> fitSizes(String? fit) => fit == 'womens'
    ? womensSizes
    : fit == 'youth'
    ? kidsSizes
    : mensSizes;

/// The fit a size belongs to: womens (W10), youth (10Y, Kids), else mens.
String sizeFit(String size) => womensSizes.contains(size)
    ? 'womens'
    : kidsSizes.contains(size) || size == oldKids
    ? 'youth'
    : 'mens';

/// The fit a row's sizes say when they are all of one set (only womens or
/// only kids sizes), else null.
String? fitFromSizes(Map<String, int> sizes) {
  final fits = {for (final e in sizes.entries) if (e.value > 0) sizeFit(e.key)};
  return fits.length == 1 && !fits.contains('mens') ? fits.first : null;
}

/// The size boxes for a garment row: its fit's sizes (the rare ones only with
/// [more]), plus any other size the row has a quantity in (an older "Kids",
/// or sizes kept from before the fit changed), in the site's order.
List<String> rowSizes(String? fit, Map<String, int> sizes, {bool more = false, List<String> order = allOrderSizes}) {
  final set = fitSizes(fit);
  bool has(String s) => (sizes[s] ?? 0) > 0;
  final shown = [
    for (final s in order)
      if ((set.contains(s) && (more || !rareSizes.contains(s))) || has(s)) s,
  ];
  for (final s in sizes.keys) {
    if (has(s) && !shown.contains(s)) shown.add(s);
  }
  return shown;
}

/// The fit's rare sizes, as "More sizes" adds them.
List<String> rareFor(String? fit) => [for (final s in fitSizes(fit)) if (rareSizes.contains(s)) s];

/// "5XL–8XL", "W22, W24", "2Y, 4Y".
String rareText(List<String> rare) => rare.length > 2 ? '${rare.first}–${rare.last}' : rare.join(', ');

const _words = {
  'XXS': 'XS', 'XSMALL': 'XS', 'EXTRASMALL': 'XS', 'SMALL': 'S', 'SML': 'S', 'SM': 'S', 'MEDIUM': 'M', 'MED': 'M', 'MD': 'M',
  'LARGE': 'L', 'LRG': 'L', 'LG': 'L', 'XLARGE': 'XL', 'EXTRALARGE': 'XL', 'XXLARGE': '2XL',
  'KID': oldKids, 'KIDS': oldKids, 'CHILD': oldKids, 'CHILDREN': oldKids, 'CHILDRENS': oldKids, 'YOUTH': oldKids, 'JUNIOR': oldKids, 'JUNIORS': oldKids,
};

/// The site's size for a size as people write it (Order::siteSize): "xxl"
/// 2XL, "XXXXXL" 5XL, "10y", "Y10", "Youth 10" 10Y, "w12", "Womens 12",
/// "12W" W12, "kids" / "youth" / "YM" Kids. Null when it isn't one.
String? siteSize(String written) {
  final s = written.toUpperCase().replaceAll(RegExp(r"[\s.\-_'’]+"), '');
  if (s.isEmpty) return null;
  for (final x in allOrderSizes) {
    if (x.toUpperCase() == s) return x;
  }
  final xs = RegExp(r'^(X{2,8})L$').firstMatch(s);
  if (xs != null) return '${xs.group(1)!.length}XL';
  final big = RegExp(r'^([2-8])X(?:L|LARGE)$').firstMatch(s);
  if (big != null) return '${big.group(1)}XL';
  final youth = RegExp(r'^(\d{1,2})(?:Y|YR|YRS|YEAR|YEARS|YO)$').firstMatch(s) ??
      RegExp(r'^(?:Y|YTH|YOUTH|K|KID|KIDS|C|CH|CHILD|JR|JNR|JUNIOR|AGE|BOYS|GIRLS)(\d{1,2})$').firstMatch(s);
  if (youth != null) {
    final y = '${int.parse(youth.group(1)!)}Y';
    return kidsSizes.contains(y) ? y : oldKids;
  }
  if (RegExp(r'^(?:Y|YOUTH|KIDS?)(?:XS|S|M|L|XL|SMALL|MEDIUM|LARGE)$').hasMatch(s)) return oldKids;
  final womens = RegExp(r'^(?:W|WMN|WOMENS|WOMEN|WOMANS|WOMAN|LADIES|LADY|LDS)(\d{1,2})$').firstMatch(s) ?? RegExp(r'^(\d{1,2})W$').firstMatch(s);
  if (womens != null) {
    final w = 'W${int.parse(womens.group(1)!)}';
    return womensSizes.contains(w) ? w : null;
  }
  if (_words[s] != null) return _words[s];
  for (final prefix in ['ADULT', 'MENS', 'MEN', 'UNISEX', 'WOMENS', 'WOMEN', 'LADIES']) {
    if (s.length > prefix.length && s.startsWith(prefix)) {
      final rest = siteSize(s.substring(prefix.length));
      if (rest != null && mensSizes.contains(rest)) return rest;
    }
  }
  return null;
}
