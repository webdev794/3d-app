import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/ai_service.dart';

/// Calls the real OpenAI API, so it only runs when a key is supplied:
/// flutter test test/ai_live_test.dart --dart-define=OPENAI_API_KEY=...
/// Renders are written to build/ai_live/ for inspection.
void main() {
  test(
    'designs, renders, back-renders and revises a kit with OpenAI',
    () async {
      final ai = AiService();
      final out = Directory('build/ai_live')..createSync(recursive: true);
      final reference = File('assets/images/reference_3.png').readAsBytesSync();

      final spec = await ai.planDesign(
        sport: 'Soccer',
        garment: 'Jersey',
        brief: 'Home kit for the Harbour City Hawks, navy and gold, sharp.',
        reference: reference,
      );
      expect(designPatterns, contains(spec.pattern));
      expect(spec.logoText, isNotEmpty);
      expect(spec.findings, isNotEmpty);
      expect(spec.patternMotif, isNotEmpty);

      final tile = await ai.generatePattern(spec.patternMotif);
      File('${out.path}/pattern.png').writeAsBytesSync(tile);
      expect(tile.length, greaterThan(20000));

      final front = await ai.renderFront(
        spec,
        sport: 'Soccer',
        garment: 'Jersey',
        reference: reference,
      );
      File('${out.path}/front.jpg').writeAsBytesSync(front);
      expect(front.length, greaterThan(50000));

      final back = await ai.renderBack(front, spec);
      File('${out.path}/back.jpg').writeAsBytesSync(back);

      final revised = await ai.planDesign(
        sport: 'Soccer',
        garment: 'Jersey',
        brief: '',
        current: spec,
        change: 'Make the main colour white and add thin gold pinstripes.',
      );
      final edited = await ai.reviseRender(front, revised);
      File('${out.path}/revised.jpg').writeAsBytesSync(edited);
      // ignore: avoid_print
      print('${spec.designName}: ${spec.summary}\nRevised: ${revised.summary}');
    },
    skip: AiService.enabled ? false : 'No OPENAI_API_KEY in this build.',
    timeout: const Timeout(Duration(minutes: 8)),
  );
  test(
    'AI Designer: four concepts, a quick render and a brief rewrite',
    () async {
      final ai = AiService();
      final out = Directory('build/ai_live')..createSync(recursive: true);
      final improved = await ai.rewriteBrief(
        'black rugby jersey for the mantis club',
        BriefMode.improve,
      );
      expect(improved.length, greaterThan(20));

      final concepts = await ai.planConcepts(brief: improved);
      expect(concepts, hasLength(4));
      expect(concepts.map((c) => c.designName).toSet(), hasLength(4));
      expect(designSports, contains(concepts.first.sport));
      expect(designGarments, contains(concepts.first.garment));

      final image = await ai.renderConcept(concepts.first);
      File('${out.path}/concept.jpg').writeAsBytesSync(image);
      expect(image.length, greaterThan(20000));
      // ignore: avoid_print
      print('Brief: $improved');
      // ignore: avoid_print
      print(
        concepts
            .map((c) => '${c.designName} (${c.sport} ${c.garment})')
            .join(', '),
      );
    },
    skip: AiService.enabled ? false : 'No OPENAI_API_KEY in this build.',
    timeout: const Timeout(Duration(minutes: 5)),
  );

  test(
    'Showcase: 3D capture to a photoreal stadium image',
    () async {
      final capture = File('build/ai_live/capture.png').readAsBytesSync();
      final image = await AiService().showcase(
        capture,
        scene: 'Stadium tunnel',
        sport: 'Rugby League',
        garment: 'Jersey',
        logoText: 'MANTIS',
      );
      File('build/ai_live/showcase.jpg').writeAsBytesSync(image);
      expect(image.length, greaterThan(50000));
    },
    skip: AiService.enabled && File('build/ai_live/capture.png').existsSync()
        ? false
        : 'Needs OPENAI_API_KEY and build/ai_live/capture.png.',
    timeout: const Timeout(Duration(minutes: 4)),
  );
}
