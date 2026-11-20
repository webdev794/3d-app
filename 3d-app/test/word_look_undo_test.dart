import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/widgets/word_look.dart';

void main() {
  testWidgets('each word-look slider drag is one Undo step', (tester) async {
    final c = AppController();
    addTearDown(c.dispose);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: ListenableBuilder(
            listenable: c,
            builder: (_, _) => WordLookEditor(c: c, markKey: 'top_wordmark', word: 'TEAM', title: 'Team name'),
          ),
        ),
      ),
    ));
    final size = find.byType(Slider).first;
    await tester.drag(size, const Offset(120, 0));
    await tester.pumpAndSettle();
    final after1 = (c.marks['top_wordmark'] as Map?)?['scale'];
    expect(after1, isNotNull);
    await tester.drag(size, const Offset(60, 0));
    await tester.pumpAndSettle();
    final after2 = (c.marks['top_wordmark'] as Map?)?['scale'];
    expect(after2, isNot(after1));
    c.undo();
    await tester.pump();
    expect((c.marks['top_wordmark'] as Map?)?['scale'], after1);
    c.undo();
    await tester.pump();
    expect((c.marks['top_wordmark'] as Map?)?['scale'], isNull);
  });
}
