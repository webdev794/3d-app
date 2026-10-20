import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/widgets/rewards_card.dart';

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show mountPhone;

void main() {
  testWidgets('home ends with 3DEEZI Rewards, coming soon', (tester) async {
    final semantics = tester.ensureSemantics();
    final c = AppController(store: FakeStore())..screen = AppScreen.home;
    await mountPhone(tester, c);
    final card = find.byType(RewardsComingSoonCard);
    await tester.ensureVisible(card);
    await tester.pump();
    expect(
      find.bySemanticsLabel('3DEEZI Rewards: coming soon'),
      findsOneWidget,
    );
    expect(find.text('REWARDS'), findsOneWidget);
    expect(find.text('Something rewarding is on the way.'), findsOneWidget);
    // Last on the home screen, under Plans & pricing.
    expect(
      tester.getTopLeft(card).dy,
      greaterThan(tester.getBottomLeft(find.text('Plans & pricing')).dy),
    );
    // COMING SOON is read out as a disabled button and goes nowhere yet.
    expect(
      tester.getSemantics(find.text('COMING SOON')),
      isSemantics(label: 'Coming soon', isButton: true, isEnabled: false),
    );
    await tester.tap(find.text('COMING SOON'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.screen, AppScreen.home);
    semantics.dispose();
  });
}
