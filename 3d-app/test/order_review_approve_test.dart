import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/widgets/order_review_approve.dart';
import 'package:three_deezi/widgets/order_review_garments.dart';

MultiGarment g(String garment, Map<String, int> sizes) => MultiGarment(garment: garment, name: garment, sizes: sizes);

void main() {
  const kit = {'S': 4, 'M': 8, 'L': 10, 'XL': 6, '2XL': 2};
  test('kit line: matching kits, kits with different sizes, or just garments', () {
    expect(kitLine([g('singlet', kit), g('shorts', kit)]), '30 matching kits · 60 garments');
    expect(kitLine([g('jersey', {'M': 12}), g('shorts', {'L': 12})]), '12 kits · 24 garments');
    expect(kitLine([g('jersey', {'M': 12}), g('shorts', {'L': 10}), g('socks', {'M': 12})]), '10 kits · 34 garments');
    expect(kitLine([g('polo', {'M': 1})]), '1 garment');
    expect(kitLine([g('jersey', kit), g('polo', kit)]), '60 garments');
  });

  test('size columns in the site order, youth sizes from the form in place of Kids', () {
    final youth = youthSplit({'S': 5, 'Kids': 5}, {'S': 5, '10Y': 3, '12Y': 2});
    expect(youth, {'S': 5, '10Y': 3, '12Y': 2});
    // Not adding up to Kids: the sizes stay as they are.
    expect(youthSplit({'Kids': 4}, {'10Y': 3}), {'Kids': 4});
    expect(reviewSizeColumns([g('jersey', {'XL': 1, 'S': 2}), g('shorts', {'2XL': 1, 'M': 1})]), ['S', 'M', 'XL', '2XL']);
    expect(reviewSizeColumns([g('polo', youth)]).first, 'S');
    expect(isYouthSize('10Y'), isTrue);
    expect(isYouthSize('Youth 12'), isTrue);
    expect(isYouthSize('XXL'), isFalse);
  });

  test('layout: one matching kit (one design, or an upload with the same sizes), else one section per garment', () {
    Map<String, dynamic> row(String garment, Map<String, int> sizes, [int? project]) => {'garment': garment, 'sizes': sizes, 'project_id': project};
    expect(reviewLayout([row('jersey', kit, 5), row('shorts', kit, 5)]), 'kit');
    expect(reviewLayout([row('singlet', kit), row('shorts', kit)]), 'kit');
    expect(reviewLayout([row('singlet', kit), row('shorts', {'M': 30})]), 'multi');
    expect(reviewLayout([row('jersey', kit, 5), row('shorts', kit, 6)]), 'multi');
    expect(reviewLayout([row('singlet', kit), row('shorts', kit), row('polo', kit)]), 'multi');
    expect(reviewLayout([]), 'kit');
  });
}
