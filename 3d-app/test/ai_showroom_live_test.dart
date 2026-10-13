import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/ai_service.dart';

/// Calls the real OpenAI API, so it only runs when a key is supplied:
/// flutter test test/ai_showroom_live_test.dart --dart-define-from-file=...
/// Images are written to build/ai_live/ for inspection.
void main() {
  // The 3DEEZI logo loads from the asset bundle, which needs the binding;
  // then real HTTP is switched back on.
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = null;

  test(
    'ask-3DEEZI edits, branded concept previews and the one-prompt mockup',
    () async {
      final ai = AiService();
      final out = Directory('build/ai_live')..createSync(recursive: true);

      final edit = await ai.editKit(
        main: const Color(0xff0b1016),
        secondary: const Color(0xff00c2cc),
        accent: const Color(0xff36e3ee),
        pattern: 'Chevron',
        logoText: '3DEEZI',
        backName: 'YOUR NAME',
        number: '23',
        instruction:
            'Make it maroon and gold with stripes, SMITH 7 on the back',
      );
      expect(edit.pattern, 'Stripes');
      expect(edit.backName, 'SMITH');
      expect(edit.number, '7');
      expect(edit.motif, isNull);
      expect(edit.reply, isNotEmpty);

      const spec = DesignSpec(
        designName: 'Live',
        detected: 'Rugby League Jersey',
        summary: 'Check',
        findings: ['a'],
        mainColor: Color(0xff0b1016),
        secondaryColor: Color(0xff00c2cc),
        accentColor: Color(0xff36e3ee),
        pattern: 'Chevron',
        fabric: 'Standard',
        logoText: '3DEEZI',
        renderPrompt: 'Black jersey with cyan geometric shoulder panels.',
        patternMotif: 'chevrons',
      );
      final preview = await ai.renderConcept(spec);
      File('${out.path}/branded-preview.jpg').writeAsBytesSync(preview);
      expect(preview.length, greaterThan(20000));

      final mockup = await ai.mockup(
        brief:
            'A grey oversized club polo with a black half-zip collar with '
            'white tipping, white shoulder panels, black cuffs and the MANTIS '
            'wordmark in raised white silicone across the chest.',
        sport: 'Rugby League',
        garment: 'Polo',
      );
      File('${out.path}/mockup.jpg').writeAsBytesSync(mockup);
      expect(mockup.length, greaterThan(100000));
    },
    timeout: const Timeout(Duration(minutes: 6)),
    skip: AiService.enabled ? false : 'Pass OPENAI_API_KEY to run live.',
  );
}
