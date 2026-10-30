import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/ai_service.dart';
import 'package:three_deezi/sports_catalog.dart';

/// The AI designer's prompts (the same words as the website's
/// OpenAiDesigner), checked without any network calls.
void main() {
  const blitz =
      'Create a cool training singlets using this for the theme and main logo';

  test('the HD mockup follows the art direction: bold, logo-led, dark', () {
    final prompt = AiService.mockupPrompt(
      brief: blitz,
      sport: 'Rugby League',
      garment: 'Singlet',
      count: 1,
      direction: {
        'summary': 'I\'ll create a BLITZ training singlet.',
        'front': 'Black body, the mascot logo large on the chest.',
        'back': 'BLITZ over a big 01.',
        'palette': 'electric blue #1E5BFF, black, white',
        'theme': '',
      },
    );
    expect(prompt, contains('Creative direction'));
    expect(prompt, contains('- Front: Black body, the mascot logo large'));
    expect(prompt, contains('- Back: BLITZ over a big 01.'));
    expect(prompt, isNot(contains('- Theme:')));
    expect(prompt, contains('fully sublimated all-over design'));
    expect(prompt, contains('Never a plain template with flat colour blocks'));
    expect(
      prompt,
      contains('the club\'s symbol goes on the chest at a normal crest size'),
    );
    expect(prompt, contains('large player number'));
    expect(prompt, contains('dramatic dark setting'));
    // Colours: dark body for a bold brief with a logo, readable white
    // numbers, never skin tones.
    expect(prompt, contains('prefer a dark body (black or deep navy)'));
    expect(prompt, contains('white with an outline in the accent colour'));
    expect(prompt, contains('never from skin tones or tiny logo details'));
    expect(AiService.colourRules, contains('never from skin tones'));
    // The kept rules: the client's own design exactly; 3DEEZI only as the
    // small word mark under the back collar.
    expect(
      prompt,
      contains(
        'If one of them shows a complete garment design, make the garment '
        'exactly that design',
      ),
    );
    expect(
      prompt,
      contains(
        'The last attached image is the 3DEEZI word mark: use it only small '
        'at the top of the back, just under the collar, and nowhere else',
      ),
    );
    expect(prompt, contains('different layout, angle or background'));
  });

  test('without logos or a direction the brand-name rules still apply', () {
    final prompt = AiService.mockupPrompt(
      brief: 'A navy MANTIS rugby jersey',
      sport: 'Rugby League',
      garment: 'Jersey',
      count: 0,
    );
    expect(prompt, isNot(contains('Creative direction')));
    expect(
      prompt,
      contains('do NOT put 3DEEZI on the chest or anywhere on the front'),
    );
    expect(prompt, isNot(contains('3DEEZI wordmark across the chest')));
  });

  test('concept previews put the client logo on the chest', () {
    final withLogo = AiService.conceptPreviewPrompt(
      'Rugby League',
      'Singlet',
      'Black with lightning.',
      'BLITZ',
      1,
    );
    expect(withLogo, contains('the crest on the chest, at a normal crest size'));
    expect(withLogo, contains('never put 3DEEZI on the front'));
    expect(withLogo, contains('reads exactly "BLITZ"'));
    final noLogo = AiService.conceptPreviewPrompt(
      'Rugby League',
      'Singlet',
      'Black with lightning.',
      'BLITZ',
      0,
    );
    expect(noLogo, contains('simple original crest at a normal crest size'));
    expect(noLogo, isNot(contains('emblem as the chest crest')));
    expect(AiService.freeDesign, contains('nearest built-in pattern'));
  });

  test('make it 3D asks for a flat front and back print sheet', () {
    final prompt = AiService.printSheetPrompt('Rugby League', 'Singlet', 1);
    expect(prompt, contains('flat print artwork sheet'));
    expect(prompt, contains('front on the left and its back on the right'));
    expect(prompt, contains('plain pure white background'));
    expect(prompt, contains('reproduce them faithfully'));
    expect(
      AiService.printSheetPrompt('Rugby League', 'Singlet', 0),
      isNot(contains('client\'s logos')),
    );
  });

  // Client 2026-10-26 (images/175.jpg): a huge 3DEEZI logo across the chest
  // and "TEAM 01" on the back of netball dresses. The same rules as the
  // website's OpenAiDesigner (tests/Feature/AiSportRulesTest.php).
  group('fixed rules per sport', () {
    const positions = 'GS, GA, WA, C, WD, GD, GK';

    void brandRules(String prompt, String why) {
      expect(
        prompt,
        contains('the club\'s symbol goes on the chest at a normal crest size'),
        reason: why,
      );
      expect(
        prompt,
        contains(
          'Never put a large 3DEEZI logo, the 3DEEZI emblem or the words '
          '"AI SPORTSWEAR DESIGNER" on the chest',
        ),
        reason: why,
      );
      expect(
        prompt,
        contains(
          'only as a small 3DEEZI word mark at the top of the back, just '
          'under the collar, and nowhere else',
        ),
        reason: why,
      );
      for (final old in [
        'large centrepiece',
        'neck label',
        '3DEEZI wordmark across the chest',
        'emblem as the crest',
      ]) {
        expect(prompt, isNot(contains(old)), reason: '$why: $old');
      }
    }

    test('every sport gets the chest symbol and back word mark rules', () {
      for (final s in sportCategories) {
        for (final count in [0, 1]) {
          for (final view in ['presentation', 'front']) {
            brandRules(
              AiService.mockupPrompt(
                brief: 'A black and gold kit for the Panthers',
                sport: s.name,
                garment: 'Singlet',
                count: count,
                view: view,
              ),
              '${s.id} $count $view',
            );
          }
        }
        final preview = AiService.conceptPreviewPrompt(
          s.name,
          'Jersey',
          'Black body.',
          '3DEEZI',
          0,
        );
        expect(preview, contains('never put 3DEEZI on the front'));
        expect(preview, isNot(contains('reads exactly "3DEEZI"')));
      }
    });

    test('netball has position letters and no names or numbers', () {
      final netball = sportNamed('Netball')!;
      expect(netball.names, isFalse);
      expect(netball.numbers, isFalse);
      expect(netball.positions.join(', '), positions);
      for (final prompt in [
        AiService.mockupPrompt(
          brief: 'Black and gold netball dresses',
          sport: 'Netball',
          garment: 'Singlet',
          count: 0,
        ),
        AiService.mockupPrompt(
          brief: 'Black and gold netball dresses',
          sport: 'Netball',
          garment: 'Singlet',
          count: 1,
          direction: {'front': 'Black body, crest, GS below', 'body': 'black'},
        ),
        AiService.conceptPreviewPrompt(
          'Netball',
          'Singlet',
          'Black with gold swirls.',
          'PANTHERS',
          1,
        ),
      ]) {
        expect(
          prompt,
          contains(
            'no player names and no numbers: never put a player name or any '
            'number anywhere on the garment',
          ),
        );
        expect(
          prompt,
          contains('playing position letters, as on real bibs ($positions)'),
        );
        expect(
          prompt,
          contains('large bold athletic lettering centred on the front'),
        );
        expect(prompt, contains('again large on the back below the word mark'));
        expect(
          prompt,
          contains(
            'The back shows only the small word mark and the position '
            'letters: no team name, player name or number',
          ),
        );
        expect(prompt, isNot(contains('(for example 01)')));
        expect(prompt, isNot(contains('over a large player number')));
      }
      // The art direction's guides and the print sheet's back follow too.
      final fields = AiService.directionFields('Netball');
      expect(fields['back'], contains('the same position letters large'));
      expect(fields['back'], contains('no player name and no number'));
      expect(fields['front'], contains('at a normal crest size'));
      expect(
        AiService.printSheetPrompt('Netball', 'Singlet', 0, frontOnly: true),
        contains(
          'the same position letters large, no team name, no player name and '
          'no number',
        ),
      );
      // Its AI designs open with no back name and no number.
      final back = AiService.kitBack('Netball', 'PANTHERS');
      expect(back.backName, '');
      expect(back.number, '');
    });

    test('rugby keeps names and numbers with the new brand rules', () {
      final prompt = AiService.mockupPrompt(
        brief: 'A navy BLITZ rugby league jersey',
        sport: 'Rugby League',
        garment: 'Jersey',
        count: 1,
      );
      brandRules(prompt, 'rugby');
      expect(
        prompt,
        contains(
          'Below the word mark, the back carries the team name in bold '
          'athletic lettering over a large player number (for example 01)',
        ),
      );
      expect(prompt, isNot(contains('position letters')));
      expect(
        AiService.directionFields('Rugby League')['back'],
        contains('large white player number'),
      );
      final back = AiService.kitBack('Rugby League', 'BLITZ');
      expect(back.backName, 'BLITZ');
      expect(back.number, isNull, reason: 'keeps the kit\'s own number');
    });
  });
}
