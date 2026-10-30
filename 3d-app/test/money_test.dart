import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/money.dart';

/// One price style (task 9.85): the app writes prices as the website's money.ts and the server's texts do,
/// "A$1,870.00" (SP/W1/price-format.md).
void main() {
  test('Australian dollars: A\$ with en-AU grouping and two decimals, the minus before the prefix', () {
    expect(formatMoney('1870.00'), r'A$1,870.00');
    expect(formatMoney(1870.5, 'AUD'), r'A$1,870.50');
    expect(formatMoney('0'), r'A$0.00');
    expect(formatMoney('9.09'), r'A$9.09');
    expect(formatMoney(49.95), r'A$49.95');
    expect(formatMoney('12345.6'), r'A$12,345.60');
    expect(formatMoney('1234567.891'), r'A$1,234,567.89');
    expect(formatMoney('-12.5'), r'-A$12.50');
    // A negative that rounds to nothing is nothing, never "-A$0.00".
    expect(formatMoney(-0.001), r'A$0.00');
    // No currency, or a lower-case code: Australian dollars as the code says.
    expect(formatMoney('100', null), r'A$100.00');
    expect(formatMoney('100', ' aud '), r'A$100.00');
  });

  test('other billing currencies: NZ\$, US\$, CA\$, £, €; any other code before the amount', () {
    expect(formatMoney('1870', 'NZD'), r'NZ$1,870.00');
    expect(formatMoney('1870', 'usd'), r'US$1,870.00');
    expect(formatMoney('1870', 'CAD'), r'CA$1,870.00');
    expect(formatMoney('1870', 'GBP'), '£1,870.00');
    expect(formatMoney('1870', 'EUR'), '€1,870.00');
    expect(formatMoney('1870', 'JPY'), 'JPY 1,870.00');
  });

  test('whole dollars drop ".00" only when asked (plan prices); never "AUD", a space after A\$ or NaN', () {
    expect(formatMoney(19, 'AUD', true), r'A$19');
    expect(formatMoney(49.95, 'AUD', true), r'A$49.95');
    expect(formatMoney(5990, 'AUD', true), r'A$5,990');
    for (final v in ['1870', '0.5', '-3', '99999.99']) {
      final s = formatMoney(v);
      expect(s, isNot(contains('AUD')), reason: v);
      expect(s, isNot(contains(r'A$ ')), reason: v);
      expect(s, matches(RegExp(r'^-?A\$\d{1,3}(,\d{3})*\.\d\d$')), reason: v);
    }
    // Not a number: the value as it came, never "A$NaN".
    expect(formatMoney('to follow'), 'to follow');
    expect(formatMoney(double.nan), isNot(contains('A\$')));
  });

  test('moneyOr: the screen\'s own words when there is no amount', () {
    expect(moneyOr(null), 'To be confirmed');
    expect(moneyOr('', 'AUD'), 'To be confirmed');
    expect(moneyOr(null, 'AUD', 'Quote pending'), 'Quote pending');
    expect(moneyOr('770', 'AUD', 'Quote pending'), r'A$770.00');
  });
}
