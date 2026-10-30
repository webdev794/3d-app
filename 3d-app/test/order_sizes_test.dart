import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/order_names.dart';
import 'package:three_deezi/widgets/order_review_approve.dart';
import 'package:three_deezi/widgets/order_review_garments.dart';

void main() {
  test('the size sets match the price list and the website (Order::SIZES)', () {
    expect(mensSizes, ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL']);
    expect(womensSizes, ['W8', 'W10', 'W12', 'W14', 'W16', 'W18', 'W20', 'W22', 'W24']);
    expect(kidsSizes, ['2Y', '4Y', '6Y', '8Y', '10Y', '12Y', '14Y', '16Y']);
    expect(orderSizes, [...mensSizes, ...womensSizes, ...kidsSizes, 'Kids']);
    expect(fitNames['youth'], 'Kids');
  });

  test('the fit chooses the size boxes; More sizes adds the rare ones; sizes with a quantity always show', () {
    expect(rowSizes('mens', const {}), ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL']);
    expect(rowSizes('mens', const {}, more: true).last, '8XL');
    expect(rowSizes('womens', const {}), ['W8', 'W10', 'W12', 'W14', 'W16', 'W18', 'W20']);
    expect(rowSizes('youth', const {}), ['6Y', '8Y', '10Y', '12Y', '14Y', '16Y']);
    expect(rowSizes('youth', const {}, more: true).first, '2Y');
    expect(rareText(rareFor('mens')), '5XL–8XL');
    expect(rareText(rareFor('womens')), 'W22, W24');
    // An older draft's Kids, or womens sizes kept on a mens row, still show.
    expect(rowSizes('youth', const {'Kids': 4}), contains('Kids'));
    expect(rowSizes('mens', const {'W10': 2, 'M': 1}), ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'W10']);
    expect(fitFromSizes(const {'W10': 2}), 'womens');
    expect(fitFromSizes(const {'10Y': 2, 'Kids': 1}), 'youth');
    expect(fitFromSizes(const {'M': 2, '10Y': 1}), isNull);
  });

  test('sizes as people write them map to the site sizes', () {
    const cases = {
      'm': 'M', 'xxl': '2XL', 'XXXXXL': '5XL', '7xl': '7XL', '10y': '10Y', 'Y12': '12Y', 'Youth 14': '14Y', '16 yrs': '16Y',
      '11Y': 'Kids', 'kids': 'Kids', 'YM': 'Kids', 'W12': 'W12', 'womens 8': 'W8', 'Ladies 24': 'W24', '16W': 'W16', 'W26': null, '10': null, 'one size': null,
    };
    cases.forEach((written, site) => expect(siteSize(written), site, reason: written));
    expect(sizeFromCell('W10'), 'W10');
    final players = parsePlayers('SMITH\t7\tW12\nJONES, 10, 10y\nBROWN;3;xxxxxl');
    expect(players.map((p) => p.size), ['W12', '10Y', '5XL']);
  });

  test('the review shows the sizes in order, Mens, Womens, Kids, then the older Kids', () {
    expect(orderedSizes(const {'Kids': 1, '16Y': 1, 'W24': 1, '8XL': 1, 'M': 2, 'W8': 1, '2Y': 1}).map((e) => e.key).toList(),
        ['M', '8XL', 'W8', 'W24', '2Y', '16Y', 'Kids']);
    // An older order's Kids split into the youth sizes its form wrote, as the site's sizes.
    expect(youthSplit(const {'XS': 1, 'Kids': 3}, const {'Y10': 2, '12 yrs': 1}), {'XS': 1, '10Y': 2, '12Y': 1});
  });
}
