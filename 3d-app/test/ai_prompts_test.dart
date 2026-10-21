import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/ai_service.dart';

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
    expect(prompt, contains('large centrepiece on the front'));
    expect(prompt, contains('large player number'));
    expect(prompt, contains('dramatic dark setting'));
    // Colours: dark body for a bold brief with a logo, readable white
    // numbers, never skin tones.
    expect(prompt, contains('prefer a dark body (black or deep navy)'));
    expect(prompt, contains('white with an outline in the accent colour'));
    expect(prompt, contains('never from skin tones or tiny logo details'));
    expect(AiService.colourRules, contains('never from skin tones'));
    // The kept rules: the client's own design exactly, the 3DEEZI neck label.
    expect(
      prompt,
      contains(
        'If one of them shows a complete garment design, make the garment '
        'exactly that design',
      ),
    );
    expect(prompt, contains('only for the small neck label'));
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
    expect(prompt, contains('do NOT put 3DEEZI on the chest'));
  });

  test('concept previews put the client logo on the chest', () {
    final withLogo = AiService.conceptPreviewPrompt(
      'Rugby League',
      'Singlet',
      'Black with lightning.',
      'BLITZ',
      1,
    );
    expect(withLogo, contains('large chest centrepiece'));
    expect(withLogo, contains('only on the small neck label'));
    final noLogo = AiService.conceptPreviewPrompt(
      'Rugby League',
      'Singlet',
      'Black with lightning.',
      'BLITZ',
      0,
    );
    expect(noLogo, contains('use its emblem as the chest crest'));
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
}
