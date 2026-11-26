import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/widgets/drag_tray.dart';

// Client 653 (24 Nov): on a dark kit with a dark Secondary every pattern
// thumbnail was a blank dark square. The thumbnail ink now always shows.
void main() {
  test('a pattern colour too close to the kit colour is swapped', () {
    const dark = Color(0xff2b2c30), darker = Color(0xff27282a);
    expect(PatternSwatch.visibleInk(darker, dark), const Color(0xff16b4f0));
    expect(
      PatternSwatch.visibleInk(const Color(0xfff2f2f2), Colors.white),
      const Color(0xff0b1016),
    );
  });
  test('a pattern colour that shows is kept', () {
    const cyan = Color(0xff00c2cc), base = Color(0xff0b1016);
    expect(PatternSwatch.visibleInk(cyan, base), cyan);
  });
}
