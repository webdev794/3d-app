import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/widgets/rewards_card.dart';

void main() {
  // The Rewards card left the Home on 2026-10-23 (client picture 166.jpg: four
  // tiles only); 3DEEZI Rewards is now the Orders tab's strip
  // (orders_tab_test.dart), which draws this gift.
  testWidgets('the Rewards gift paints at the strip size and larger', (
    tester,
  ) async {
    for (final size in const [Size(92, 64), Size(186, 130), Size(40, 120)]) {
      await tester.pumpWidget(
        MaterialApp(
          home: Center(
            child: SizedBox.fromSize(
              size: size,
              child: const CustomPaint(painter: GiftPainter()),
            ),
          ),
        ),
      );
      expect(tester.takeException(), isNull, reason: '$size');
    }
    expect(const GiftPainter().shouldRepaint(const GiftPainter()), isFalse);
  });
}
