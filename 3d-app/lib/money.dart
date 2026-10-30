/// The one price style (task 9.85), as the website's `resources/js/money.ts` formatMoney and the server's texts
/// (`App\Services\Pricing\Money::format`) write it: "A$1,870.00".
/// - Two decimals with en-AU grouping: A$0.00, A$9.09, A$49.95, A$1,870.00; a negative amount: -A$12.50.
/// - Other billing currencies (Admin > Pricing): NZ$, US$, CA$, £ and €; any other code as "JPY 1,870.00".
/// - [whole]: whole dollars without ".00" (plan prices: A$19, A$49.95, A$5,990).
/// - Not a number: the value as it came.
String formatMoney(Object? amount, [Object? currency, bool whole = false]) {
  final value = amount is num
      ? amount.toDouble()
      : double.tryParse('${amount ?? ''}'.trim());
  if (value == null || !value.isFinite) return '${amount ?? ''}';
  final code = '${currency ?? ''}'.trim().isEmpty
      ? 'AUD'
      : '$currency'.trim().toUpperCase();
  final digits = whole && value == value.roundToDouble()
      ? _grouped(value.abs().toStringAsFixed(0))
      : _cents(value.abs());
  // "-A$0.00" never: a negative that rounds to nothing is nothing.
  final negative = value < 0 && RegExp('[1-9]').hasMatch(digits);
  return '${negative ? '-' : ''}${_prefix[code] ?? '$code '}$digits';
}

/// [formatMoney], or [missing] ("To be confirmed", "Quote pending", "—") when there is no amount.
String moneyOr(
  Object? amount, [
  Object? currency,
  String missing = 'To be confirmed',
]) => amount == null || '$amount'.trim().isEmpty
    ? missing
    : formatMoney(amount, currency);

const _prefix = {
  'AUD': r'A$',
  'NZD': r'NZ$',
  'USD': r'US$',
  'CAD': r'CA$',
  'GBP': '£',
  'EUR': '€',
};

String _cents(double v) {
  final [whole, cents] = v.toStringAsFixed(2).split('.');
  return '${_grouped(whole)}.$cents';
}

String _grouped(String whole) =>
    whole.replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
