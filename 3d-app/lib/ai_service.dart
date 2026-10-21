import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

/// Supplied at build time: `--dart-define=OPENAI_API_KEY=...`. When it is
/// absent the app falls back to its scripted demo flow.
const _apiKey = String.fromEnvironment('OPENAI_API_KEY');
const _textModel = String.fromEnvironment(
  'OPENAI_TEXT_MODEL',
  defaultValue: 'gpt-6-luna',
);
const _imageModel = String.fromEnvironment(
  'OPENAI_IMAGE_MODEL',
  defaultValue: 'gpt-image-2',
);
const _base = 'https://api.openai.com/v1';

const designPatterns = ['Velocity', 'Chevron', 'Stripes', 'Solid'];
const designFabrics = ['Standard', 'Mesh', 'Pro', 'Eco'];
const designSports = [
  'Rugby League',
  'Basketball',
  'Soccer',
  'AFL',
  'Netball',
  'Rugby Union',
  'Ice Hockey',
  'Training / Gym',
];
const designGarments = [
  'Jersey',
  'Shorts',
  'Training Tee',
  'Singlet',
  'Polo',
  'Full Kit',
];

/// How the AI Designer's quick chips steer a brief.
enum BriefMode { inspire, modify, match, improve }

/// What a plain-language edit ("make it maroon, SMITH 7 on the back") changed.
class KitEdit {
  const KitEdit({
    required this.mainColor,
    required this.secondaryColor,
    required this.accentColor,
    required this.pattern,
    required this.logoText,
    required this.backName,
    required this.number,
    required this.reply,
    this.motif,
  });
  final Color mainColor, secondaryColor, accentColor;
  final String pattern, logoText, backName, number, reply;

  /// A custom print to generate, when the request asked for one.
  final String? motif;
}

class AiException implements Exception {
  AiException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// The structured design the language model returns. It drives both the
/// editable vector preview and the prompt for the photoreal render.
class DesignSpec {
  const DesignSpec({
    required this.designName,
    required this.detected,
    required this.summary,
    required this.findings,
    required this.mainColor,
    required this.secondaryColor,
    required this.accentColor,
    required this.pattern,
    required this.fabric,
    required this.logoText,
    required this.renderPrompt,
    required this.patternMotif,
    this.sport = 'Rugby League',
    this.garment = 'Jersey',
  });

  final String designName, detected, summary, pattern, fabric, logoText;
  final String renderPrompt, patternMotif, sport, garment;
  final List<String> findings;
  final Color mainColor, secondaryColor, accentColor;

  factory DesignSpec.fromJson(Map<String, dynamic> j) => DesignSpec(
    designName: j['designName'] as String,
    detected: j['detected'] as String,
    summary: j['summary'] as String,
    findings: (j['findings'] as List).cast<String>(),
    mainColor: _color(j['mainColor']),
    secondaryColor: _color(j['secondaryColor']),
    accentColor: _color(j['accentColor']),
    pattern: designPatterns.contains(j['pattern']) ? j['pattern'] : 'Velocity',
    fabric: designFabrics.contains(j['fabric']) ? j['fabric'] : 'Standard',
    logoText: (j['logoText'] as String).trim().toUpperCase(),
    renderPrompt: j['renderPrompt'] as String,
    patternMotif: j['patternMotif'] as String? ?? '',
    sport: designSports.contains(j['sport']) ? j['sport'] : 'Rugby League',
    garment: designGarments.contains(j['garment']) ? j['garment'] : 'Jersey',
  );

  /// For saving projects on the device.
  Map<String, dynamic> toJson() => {
    'designName': designName,
    'detected': detected,
    'summary': summary,
    'findings': findings,
    'mainColor': _hex(mainColor),
    'secondaryColor': _hex(secondaryColor),
    'accentColor': _hex(accentColor),
    'pattern': pattern,
    'fabric': fabric,
    'logoText': logoText,
    'renderPrompt': renderPrompt,
    'patternMotif': patternMotif,
    'sport': sport,
    'garment': garment,
  };

  static String _hex(Color c) =>
      '#${c.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}';

  static Color _color(Object? hex) {
    final value = int.tryParse(
      '$hex'.replaceAll('#', '').padLeft(6, '0'),
      radix: 16,
    );
    return Color(0xff000000 | (value ?? 0x101d2a));
  }
}

class AiService {
  AiService({http.Client? client}) : _client = client ?? http.Client();
  final http.Client _client;

  static bool get enabled => _apiKey.isNotEmpty;

  static const _specSchema = {
    'type': 'object',
    'additionalProperties': false,
    'required': [
      'designName',
      'detected',
      'summary',
      'findings',
      'mainColor',
      'secondaryColor',
      'accentColor',
      'pattern',
      'fabric',
      'logoText',
      'renderPrompt',
      'patternMotif',
      'sport',
      'garment',
    ],
    'properties': {
      'sport': {
        'type': 'string',
        'enum': designSports,
        'description': 'The sport, from the brief or the stated sport.',
      },
      'garment': {
        'type': 'string',
        'enum': designGarments,
        'description': 'The garment, from the brief or the stated garment.',
      },
      'designName': {
        'type': 'string',
        'description': 'Short catchy concept name, max 3 words.',
      },
      'detected': {
        'type': 'string',
        'description': 'Garment identified, e.g. "Rugby League Jersey".',
      },
      'summary': {
        'type': 'string',
        'description': 'One sentence describing the design for the client.',
      },
      'findings': {
        'type': 'array',
        'items': {'type': 'string'},
        'description':
            'Exactly 3 very short observations about the brief/reference, '
            'max 6 words each.',
      },
      'mainColor': {'type': 'string', 'description': 'Hex like #101D2A.'},
      'secondaryColor': {'type': 'string', 'description': 'Hex.'},
      'accentColor': {
        'type': 'string',
        'description': 'Hex for the wordmark; must contrast mainColor.',
      },
      'pattern': {'type': 'string', 'enum': designPatterns},
      'fabric': {'type': 'string', 'enum': designFabrics},
      'logoText': {
        'type': 'string',
        'description':
            'Chest wordmark, max 12 characters. Use the team or brand name '
            'from the brief; if the brief names none, use 3DEEZI.',
      },
      'patternMotif': {
        'type': 'string',
        'description':
            'The concept signature print for the 3D kit, as a black-and-white '
            'pattern description, max 25 words, e.g. "jagged lightning bolts '
            'and speed streaks with halftone dot fades". No colours.',
      },
      'renderPrompt': {
        'type': 'string',
        'description':
            'Detailed visual description of the whole fully sublimated '
            'garment design for an image model: colours, graphics and how '
            'they flow across front, sides and back, textures, trims, collar, '
            'where the client logo and wordmark go, the back name and number. '
            'Free design, not limited to the pattern list. Garment only; no '
            'background or camera details.',
      },
    },
  };

  /// Reads the brief (and optional reference image) and returns a design.
  /// Pass [current] and [change] to revise an existing design instead.
  Future<DesignSpec> planDesign({
    required String sport,
    required String garment,
    required String brief,
    Uint8List? reference,
    List<Uint8List> references = const [],
    DesignSpec? current,
    String? change,
  }) async {
    final refs = [?reference, ...references];
    final text = StringBuffer()
      ..writeln('Sport: $sport')
      ..writeln('Garment: $garment')
      ..writeln('Client brief: ${brief.trim().isEmpty ? '(none)' : brief}');
    if (refs.isNotEmpty) {
      text.writeln(
        'Reference images are attached. Take colours, motifs and mood from '
        'them, adapted to the garment. If one shows the client\'s own finished '
        'garment design, make concept 1 follow it closely (its colours, '
        'pattern and lettering).',
      );
    }
    if (current != null && change != null) {
      text
        ..writeln('\nCurrent design: ${current.renderPrompt}')
        ..writeln('Current wordmark: ${current.logoText}')
        ..writeln('Requested change: $change')
        ..writeln('Keep everything the change does not mention.');
    }
    final json = await _post('/responses', {
      'model': _textModel,
      'input': [
        {'role': 'system', 'content': _system},
        {'role': 'user', 'content': _content(text.toString(), refs)},
      ],
      'text': {
        'format': {
          'type': 'json_schema',
          'name': 'kit_design',
          'strict': true,
          'schema': _specSchema,
        },
      },
    });
    return DesignSpec.fromJson(jsonDecode(_outputText(json)));
  }

  static const _system =
      'You are the lead designer at 3DEEZI, a custom sportswear studio. Turn '
      'client briefs into original, manufacturable kit designs. Never copy '
      'real club, league or brand logos. When a brief mentions a cultural '
      'style, create an original design inspired by it rather than '
      'reproducing sacred motifs.';

  /// Four distinct concept directions for the AI Designer's "Choose a
  /// design" screen. The AI also picks the sport and garment from the brief.
  Future<List<DesignSpec>> planConcepts({
    required String brief,
    List<Uint8List> references = const [],
    BriefMode? mode,
    String? sport,
    String? garment,
  }) async {
    final text = StringBuffer()
      ..writeln('Client brief: ${brief.trim().isEmpty ? '(none)' : brief}');
    // Chosen on the AI Designer (a sports tile or a garment chip): keep to it.
    if (sport != null) text.writeln('Sport chosen by the client: $sport.');
    if (garment != null) text.writeln('Garment chosen by the client: $garment.');
    text
      ..writeln(
        'Create exactly 4 clearly different concept directions for this '
        'kit, each designed the way a top custom sublimation sportswear brand '
        'would: 1) bold and aggressive, with dynamic all-over sublimated '
        'graphics drawn from the theme of the client\'s logo or brief, 2) '
        'classic and clean, 3) heritage or pattern-led, 4) modern minimal. '
        'Keep the team name, sport and garment consistent across all four. '
        '$freeDesign $colourRules',
      );
    if (references.isNotEmpty) {
      text.writeln(switch (mode) {
        BriefMode.match =>
          'Reference images are attached. Match their style closely.',
        BriefMode.modify =>
          'Reference images are attached. Keep their layout but change the '
              'colours and details as the brief says.',
        _ =>
          'Reference images are attached. Take the palette, motifs and mood '
              'from them (a logo\'s colours, mascot and lettering style set '
              'the theme), and make the client\'s main logo the chest '
              'centrepiece.',
      });
    }
    final json = await _post('/responses', {
      'model': _textModel,
      'input': [
        {'role': 'system', 'content': _system},
        {'role': 'user', 'content': _content(text.toString(), references)},
      ],
      'text': {
        'format': {
          'type': 'json_schema',
          'name': 'kit_concepts',
          'strict': true,
          'schema': {
            'type': 'object',
            'additionalProperties': false,
            'required': ['concepts'],
            'properties': {
              'concepts': {
                'type': 'array',
                'description': 'Exactly 4 concepts.',
                'items': _specSchema,
              },
            },
          },
        },
      },
    });
    final list = (jsonDecode(_outputText(json))['concepts'] as List)
        .map((c) => DesignSpec.fromJson(c as Map<String, dynamic>))
        .take(4)
        .toList();
    if (list.isEmpty) throw AiException('No concepts came back. Try again.');
    return list;
  }

  /// Writes or rewrites a brief for the AI Designer's quick chips.
  Future<String> rewriteBrief(String brief, BriefMode mode) async {
    final ask = switch (mode) {
      BriefMode.inspire =>
        'Invent one exciting, original sportswear kit brief'
            '${brief.trim().isEmpty ? '' : ' inspired by: "$brief"'}.',
      BriefMode.improve =>
        'Improve this sportswear kit brief so a designer gets clear colours, '
            'pattern, collar and branding direction, keeping its intent: '
            '"$brief"',
      BriefMode.modify =>
        'Rewrite this brief as a modification of the attached reference kit: '
            '"$brief"',
      BriefMode.match =>
        'Rewrite this brief to closely match the reference kit style: '
            '"$brief"',
    };
    final json = await _post('/responses', {
      'model': _textModel,
      'input': [
        {'role': 'system', 'content': _system},
        {
          'role': 'user',
          'content':
              '$ask Reply with the brief only: one or two sentences, max 40 '
              'words, no quotes.',
        },
      ],
    });
    return _outputText(json).trim().replaceAll('"', '');
  }

  /// Concepts are designed freely; the 3D kit's pattern list is only the
  /// nearest editable match (the same words as the website).
  static const freeDesign =
      'Design each concept freely, like a premium sublimated teamwear brand: '
      'renderPrompt describes the whole design (graphics such as lightning, '
      'speed lines, sharp angular shards, halftone dot fades, gradients and '
      'textures where they suit the theme; where the client\'s logo goes; the '
      'back name and number; trims), never a plain template with flat colour '
      'blocks. pattern is only the nearest built-in pattern for the editable '
      '3D kit, and patternMotif is the custom print that carries the '
      'concept\'s graphics onto the 3D kit.';

  /// The quick concept preview prompt: the concept's free design, the
  /// client's logo as the chest centrepiece.
  static String conceptPreviewPrompt(
    String sport,
    String garment,
    String design,
    String logoText,
    int clientImages,
  ) =>
      'Premium photoreal product render of a $sport $garment, front view, '
      'centred and fully visible, on an invisible ghost mannequin against a '
      'dramatic dark background with soft floodlight haze and a rim light in '
      'the kit\'s colours. Design: $design A bold, fully sublimated print, '
      'never a plain template. '
      '${clientImages > 0 ? 'The first $clientImages attached image(s) come from the client: reproduce the client\'s main logo faithfully as the large chest centrepiece (if one shows the client\'s own complete garment design, follow it). Any chest wordmark reads exactly "$logoText". The last attached image is the 3DEEZI logo: use its emblem only on the small neck label. ' : 'The chest wordmark reads exactly "$logoText". The attached image is the 3DEEZI logo: use its emblem as the chest crest. '}'
      'No other logos or text.';

  /// A quick square concept render (about 12 s at low quality). The
  /// client's logos go in first as real image inputs, then the 3DEEZI logo.
  Future<Uint8List> renderConcept(
    DesignSpec spec, {
    List<Uint8List> references = const [],
  }) async {
    final client = references.take(3).toList();
    return _edit(
      conceptPreviewPrompt(
        spec.sport,
        spec.garment,
        spec.renderPrompt,
        spec.logoText,
        client.length,
      ),
      [...client, await _brandLogo()],
      size: '1024x1024',
      quality: 'low',
    );
  }

  static Future<Uint8List>? _logo;

  /// The 3DEEZI logo (emblem and wordmark) that branded mockups wear.
  static Future<Uint8List> _brandLogo() => _logo ??= rootBundle
      .load('assets/images/logo_full.png')
      .then((data) => data.buffer.asUint8List());

  /// Kit colours like a top teamwear brand (the same words as the website):
  /// from the logo's brand colours, dark and bold when the brief is,
  /// readable names and numbers.
  static const colourRules =
      'Colours: take the kit colours only from the dominant brand colours of '
      'the client\'s logo or the brief, never from skin tones or tiny logo '
      'details. For a cool, bold or aggressive brief with a logo, prefer a '
      'dark body (black or deep navy) with the logo\'s main colour as the '
      'graphics and white highlights. Back names and numbers are white with '
      'an outline in the accent colour, so they stand out from the graphics.';

  /// The art director's brief for the HD mockup (strict JSON), the same as
  /// the website's.
  static const _directionFields = {
    'summary':
        'One friendly sentence to the client saying what you will create, '
        'e.g. "I\'ll create a BLITZ training singlet in electric blue, black '
        'and white, with your logo as the centrepiece and lightning details '
        'flowing around the sides."',
    'ownDesign':
        'true only if an attached image is the client\'s own complete garment '
        'design (front and/or back fully designed) that must be kept exactly.',
    'teamName':
        'The team, club or brand name from the brief or the logo\'s wordmark, '
        'exactly as written; empty if none.',
    'palette':
        'The 3-4 kit colours with names and hex: the dominant brand colours '
        'of the client\'s logo or the brief (ignore skin tones and small '
        'details), high contrast, e.g. "electric blue #1E5BFF, black #0A0C12, white '
        '#FFFFFF".',
    'theme':
        'The theme and motifs drawn from the logo and brief, e.g. "speed and '
        'lightning: the mascot sprinting, jagged lightning edges".',
    'front':
        'The front design: base colour (dark black or navy for a cool or '
        'bold brief with a logo), the main logo large as the centrepiece, '
        'and the sublimated graphics around it.',
    'back':
        'The back design: the team name in bold white athletic lettering '
        'over a large white player number (e.g. 01) with an outline in the '
        'accent colour, when it suits the garment, plus graphics.',
    'graphics':
        'The all-over sublimated graphics: shapes, flow across the sides, '
        'textures (halftone, gradients, grunge) and colours.',
    'trims':
        'Collar, armhole or cuff binding, side panels and hem, in the palette.',
    'presentation':
        'The photo setting: dramatic and dark (night stadium, floodlights, '
        'haze in the kit\'s main colour, reflective floor) unless the brief '
        'asks for something else.',
  };

  /// The creative direction for the HD mockup, written by the chat model
  /// from the brief and the client's logos before anything is drawn (as
  /// ChatGPT does). Null when it fails: the mockup still renders.
  Future<Map<String, dynamic>?> artDirection({
    required String brief,
    required String sport,
    required String garment,
    List<Uint8List> logos = const [],
  }) async {
    final count = logos.take(4).length;
    final text =
        'Sport: $sport\nGarment: $garment\nClient brief: $brief\n'
        '${count > 0 ? '$count image(s) from the client are attached: logos, references or their own finished design.\n' : 'No images are attached.\n'}'
        'You are the art director of a top custom sublimation sportswear '
        'brand. Before the designer renders one hero mockup, write its '
        'creative direction. Take the palette and theme from the client\'s '
        'logo (its colours, mascot, lettering style and motifs such as '
        'lightning, flames, claws or waves) or from the brief. Design bold, '
        'fully sublimated graphics derived from that theme, flowing across '
        'the front, sides and back, never a plain template with flat colour '
        'blocks. The client\'s main logo goes large as the front centrepiece; '
        'the back carries the team name over a big number when it suits the '
        'garment. Follow everything the brief specifies (colours, layout, '
        'background, text). If an attached image is the client\'s own '
        'complete garment design, set ownDesign to true and describe that '
        'design exactly instead of inventing one. $colourRules Never use real '
        'club, league or brand logos other than the client\'s own.';
    try {
      final json = await _post('/responses', {
        'model': _textModel,
        'input': [
          {'role': 'system', 'content': _system},
          {
            'role': 'user',
            'content': [
              {'type': 'input_text', 'text': text},
              for (final image in logos.take(4))
                {
                  'type': 'input_image',
                  'image_url':
                      'data:${_mime(image)};base64,${base64Encode(image)}',
                },
            ],
          },
        ],
        'text': {
          'format': {
            'type': 'json_schema',
            'name': 'art_direction',
            'strict': true,
            'schema': {
              'type': 'object',
              'additionalProperties': false,
              'required': _directionFields.keys.toList(),
              'properties': {
                for (final MapEntry(:key, :value) in _directionFields.entries)
                  key: {
                    'type': key == 'ownDesign' ? 'boolean' : 'string',
                    'description': value,
                  },
              },
            },
          },
        },
      });
      final direction = jsonDecode(_outputText(json));
      return direction is Map<String, dynamic> &&
              '${direction['front'] ?? ''}'.trim().isNotEmpty
          ? direction
          : null;
    } on Object {
      return null;
    }
  }

  /// The HD mockup prompt (the same words as the website): a bold
  /// sublimated design from the logo's theme, the logo as the front
  /// centrepiece, name and number on the back, front and back side by side
  /// in a dramatic dark setting unless the brief asks otherwise; a client's
  /// own complete design is kept exactly.
  static String mockupPrompt({
    required String brief,
    required String sport,
    required String garment,
    required int count,
    Map<String, dynamic>? direction,
  }) {
    final prompt = StringBuffer(
      'You are the lead designer of a top custom sublimation sportswear '
      'brand, making a client presentation mockup.\nSport: $sport. Garment: '
      '$garment.\nClient brief: $brief\n\n',
    );
    if (direction != null) {
      prompt.writeln(
        'Creative direction (follow it; the brief wins if they differ):',
      );
      const labels = {
        'theme': 'Theme',
        'palette': 'Palette',
        'front': 'Front',
        'back': 'Back',
        'graphics': 'Graphics',
        'trims': 'Trims',
        'presentation': 'Presentation',
      };
      for (final MapEntry(:key, :value) in labels.entries) {
        final text = '${direction[key] ?? ''}'.trim();
        if (text.isNotEmpty) prompt.writeln('- $value: $text');
      }
      prompt.writeln();
    }
    prompt
      ..write(
        'Design: unless the client attached their own complete garment '
        'design, design the garment freely like a premium sublimated '
        'teamwear brand: a bold, fully sublimated all-over design with '
        'dynamic graphics drawn from the theme and colours of the client\'s '
        'logo or brief (for example lightning, speed lines, sharp angular '
        'shards, halftone dot fades, gradients and textures) flowing across '
        'the front, sides and back. Never a plain template with flat colour '
        'blocks or simple side panels. $colourRules The client\'s main logo is the large '
        'centrepiece on the front, reproduced faithfully (the same artwork, '
        'colours and lettering). The back carries the team name in bold '
        'athletic lettering over a large player number (for example 01) when '
        'it suits the garment, with matching trims on the collar, armholes or '
        'cuffs and hem.\n',
      )
      ..write(
        'Presentation: unless the brief asks for a different layout, angle or '
        'background, make one landscape image of premium commercial product '
        'photography: the front view on the left and the back view on the '
        'right, side by side, both complete, fully visible and not '
        'overlapping, on invisible ghost mannequins, in a dramatic dark '
        'setting: a night stadium with floodlights, haze tinted in the kit\'s '
        'main colour, a glossy reflective floor and rim lighting. '
        'Photorealistic fabric: fine knit and mesh texture, natural folds, '
        'flatlock stitching, a crisp vivid sublimated print. All text must be '
        'spelled exactly as written in the brief or the logo. ',
      )
      ..write(
        count > 0
            ? 'The first $count attached image(s) come from the client: logos, '
                  'references, or the client\'s own finished garment design (flat '
                  'artwork, a sketch, a snapshot or a photo). If one of them shows '
                  'a complete garment design, make the garment exactly that '
                  'design: the same colours, pattern, panels, collar, trims, '
                  'logos, text and numbers, front and back as shown; do not '
                  'redesign or simplify it, just turn it into a real 3D garment '
                  'presented as the brief asks. Reproduce any logos faithfully '
                  'and place them where the brief says, where the design shows '
                  'them, or in sensible positions (the main logo large on the '
                  'front). The last attached image is the 3DEEZI logo: use it '
                  'only for the small neck label, unless the brief asks for '
                  '3DEEZI branding; leave it out when the client\'s design '
                  'carries its own brand.'
            : 'The attached image is the 3DEEZI logo (emblem and wordmark). If '
                  'the brief gives any wordmark, team, club or brand name, use '
                  'exactly that text where the brief says and do NOT put 3DEEZI '
                  'on the chest; then use the 3DEEZI emblem only on the small '
                  'neck label. Only if the brief names no wordmark or brand at '
                  'all, put the 3DEEZI wordmark across the chest and the 3DEEZI '
                  'emblem as the crest, exactly as in the logo.',
      )
      ..write(' No watermarks, no extra brands.');
    return prompt.toString();
  }

  /// One brief in, one finished HD presentation mockup out, like ChatGPT:
  /// an art direction from the brief and [logos] first, then the render
  /// with the logos as real image inputs. [onDirection] gets the one-line
  /// summary to show the client.
  Future<Uint8List> mockup({
    required String brief,
    required String sport,
    required String garment,
    List<Uint8List> logos = const [],
    void Function(String summary)? onDirection,
  }) async {
    final client = logos.take(4).toList();
    final direction = await artDirection(
      brief: brief,
      sport: sport,
      garment: garment,
      logos: client,
    );
    final summary = '${direction?['summary'] ?? ''}'.trim();
    if (summary.isNotEmpty) onDirection?.call(summary);
    return _edit(
      mockupPrompt(
        brief: brief,
        sport: sport,
        garment: garment,
        count: client.length,
        direction: direction,
      ),
      [...client, await _brandLogo()],
      size: '1536x1024',
      quality: 'high',
      highFidelity: true,
    );
  }

  /// "Make it 3D": the print sheet prompt (the same words as the website).
  static String printSheetPrompt(String sport, String garment, int logos) =>
      'The first attached image shows a $sport $garment design. Redraw '
      'exactly the same design as a flat print artwork sheet for the '
      'factory: the garment\'s front on the left and its back on the right, '
      'side by side, both complete and the same size, drawn flat and '
      'straight-on like a technical flat drawing, on a plain pure white '
      'background with clear white space around and between them. No '
      'mannequin, no person, no folds, no perspective, no lighting effects, '
      'no shadows, no scene. Keep the design exactly: the same colours, '
      'graphics, gradients, lettering, logos, numbers and trims, in the same '
      'places and proportions, and the same garment shape (neck, armholes or '
      'sleeves, hem). '
      '${logos > 0 ? 'The other $logos attached image(s) are the client\'s logos: reproduce them faithfully where the design shows them. ' : ''}'
      'No labels, captions, measurements, hangers, neck labels or extra text.';

  /// "Make it 3D": the mockup redrawn by the same model as a flat front and
  /// back print sheet, which the Studio's design-picture check puts on the
  /// 3D kit (AppController.importDesignPicture).
  Future<Uint8List> printSheet(
    Uint8List mockup, {
    required String sport,
    required String garment,
    List<Uint8List> logos = const [],
  }) {
    final client = logos.take(3).toList();
    return _edit(
      printSheetPrompt(sport, garment, client.length),
      [mockup, ...client],
      size: '1536x1024',
      quality: 'high',
      highFidelity: true,
    );
  }

  /// "Ask 3DEEZI to change anything": applies a plain-language request to
  /// the current kit. An attached [image] guides colours and style.
  Future<KitEdit> editKit({
    required Color main,
    required Color secondary,
    required Color accent,
    required String pattern,
    required String logoText,
    required String backName,
    required String number,
    required String instruction,
    Uint8List? image,
  }) async {
    final current = jsonEncode({
      'main': DesignSpec._hex(main),
      'secondary': DesignSpec._hex(secondary),
      'accent': DesignSpec._hex(accent),
      'pattern': pattern,
      'logoText': logoText,
      'backName': backName,
      'number': number,
    });
    const hex = {'type': 'string', 'description': 'Hex colour like #0B1016.'};
    final json = await _post('/responses', {
      'model': _textModel,
      'input': [
        {'role': 'system', 'content': _system},
        {
          'role': 'user',
          'content': _content(
            'Current kit design (JSON): $current\nClient request: '
            '$instruction\nReturn the complete updated design. Change only '
            'what the request asks for and keep everything else exactly the '
            'same. If the request names one of the built-in patterns '
            '(Chevron, Stripes, Velocity, Solid; "plain" means Solid), set '
            'pattern to it and newPatternMotif to null. Set newPatternMotif '
            'only when the client asks for a custom print, texture or graphic '
            'that is not a built-in pattern; otherwise null. reply is one '
            'short friendly sentence telling the client what you changed.'
            '${image == null ? '' : ' An image is attached: use it as the reference for colours and style.'}',
            [?image],
          ),
        },
      ],
      'text': {
        'format': {
          'type': 'json_schema',
          'name': 'kit_edit',
          'strict': true,
          'schema': {
            'type': 'object',
            'additionalProperties': false,
            'required': [
              'main',
              'secondary',
              'accent',
              'pattern',
              'logoText',
              'backName',
              'number',
              'newPatternMotif',
              'reply',
            ],
            'properties': {
              'main': hex,
              'secondary': hex,
              'accent': hex,
              'pattern': {'type': 'string', 'enum': designPatterns},
              'logoText': {
                'type': 'string',
                'description': 'Chest wordmark, max 20 characters.',
              },
              'backName': {
                'type': 'string',
                'description': 'Player name on the back, max 20 characters.',
              },
              'number': {
                'type': 'string',
                'description': 'Player number, 0-3 digits.',
              },
              'newPatternMotif': {
                'type': ['string', 'null'],
                'description':
                    'Black-and-white print motif, max 25 words, or null.',
              },
              'reply': {'type': 'string'},
            },
          },
        },
      },
    });
    final out = jsonDecode(_outputText(json)) as Map<String, dynamic>;
    String clip(Object? v, int max) {
      final text = '${v ?? ''}'.trim().toUpperCase();
      return text.length > max ? text.substring(0, max) : text;
    }

    final digits = '${out['number'] ?? ''}'.replaceAll(RegExp(r'\D'), '');
    final motif = out['newPatternMotif'] as String?;
    return KitEdit(
      mainColor: DesignSpec._color(out['main']),
      secondaryColor: DesignSpec._color(out['secondary']),
      accentColor: DesignSpec._color(out['accent']),
      pattern: designPatterns.contains(out['pattern'])
          ? out['pattern'] as String
          : pattern,
      logoText: clip(out['logoText'], 20),
      backName: clip(out['backName'], 20),
      number: digits.length > 3 ? digits.substring(0, 3) : digits,
      reply: out['reply'] as String? ?? 'Done.',
      motif: motif == null || motif.trim().isEmpty ? null : motif,
    );
  }

  List<Map<String, Object>> _content(String text, List<Uint8List> images) => [
    {'type': 'input_text', 'text': text},
    for (final image in images.take(3))
      {
        'type': 'input_image',
        'image_url': 'data:${_mime(image)};base64,${base64Encode(image)}',
      },
  ];

  String _outputText(Map<String, dynamic> json) {
    final output = (json['output'] as List).cast<Map<String, dynamic>>();
    for (final item in output.where((o) => o['type'] == 'message')) {
      for (final part in (item['content'] as List)) {
        if (part['type'] == 'refusal') {
          throw AiException('The AI declined this brief: ${part['refusal']}');
        }
        if (part['type'] == 'output_text') return part['text'] as String;
      }
    }
    throw AiException('The AI returned nothing. Please try again.');
  }

  /// Photoreal front render of [spec]. A [reference] image guides the style.
  Future<Uint8List> renderFront(
    DesignSpec spec, {
    required String sport,
    required String garment,
    Uint8List? reference,
  }) {
    final prompt =
        'Premium e-commerce product render of a $sport $garment, FRONT view, '
        'centred and fully visible, floating (no mannequin, no people) on a '
        'near-black studio background with a subtle cyan rim light. '
        'Design: ${spec.renderPrompt} '
        'The chest wordmark reads exactly "${spec.logoText}". '
        'Do not add any other logos, league badges, sponsor marks or text. '
        'Photorealistic fabric texture and stitching.';
    if (reference == null) return _generate(prompt);
    return _edit(
      '$prompt The attached image is a style reference only: borrow its '
      'colours and motifs, do not copy its layout or logos.',
      [reference],
    );
  }

  /// A seamless black-on-white pattern tile for the 3D kit. The viewer turns
  /// it into a stencil, so it always takes the kit's own colours.
  Future<Uint8List> generatePattern(String motif) async {
    final json = await _post('/images/generations', {
      'model': _imageModel,
      'prompt':
          'Seamless tileable textile print pattern swatch filling the whole '
          'square edge to edge, for a sublimated sports jersey. Motif: '
          '$motif. Original design, inspired by the brief '
          'rather than copying any existing artwork. Pure black (#000000) '
          'shapes on a pure white (#FFFFFF) background, flat 2D vector style, '
          'no grey, no shading, no gradients, no fabric texture, no garment, '
          'no text, no logos, no border. Left/right and top/bottom edges must '
          'tile perfectly.',
      'size': '1024x1024',
      'quality': 'medium',
      'output_format': 'png',
      'n': 1,
    });
    return _firstImage(json);
  }

  /// Scenes offered by the photoreal Showcase.
  static const showcaseScenes = {
    'Stadium tunnel':
        'floating on an invisible ghost mannequin above a glossy reflective floor in a cinematic '
        'futuristic stadium tunnel at night: deep navy-black, glowing cyan and blue light strips '
        'receding into the distance, volumetric haze, soft bokeh, strong depth of field',
    'Studio podium':
        'on an invisible ghost mannequin above a low brushed-black pedestal with a thin glowing '
        'rim, in a dark premium photo studio with a large softbox key light, cyan rim light and a '
        'soft contact shadow',
    'On athlete':
        'worn by an athletic player standing confidently in a floodlit stadium at night, shot '
        'from chest height, the player'
        's face in shadow or turned away, crowd and lights blurred '
        'behind, sweat-free crisp fabric',
    'Locker room':
        'hanging on a wooden hanger in a modern dark locker room with wood and steel lockers, warm '
        'spotlights and cyan accent lighting, shallow depth of field',
  };

  /// Turns a capture of the 3D kit into a photoreal marketing image while
  /// keeping the design itself unchanged.
  Future<Uint8List> showcase(
    Uint8List capture, {
    required String scene,
    required String sport,
    required String garment,
    required String logoText,
    String? number,
    bool back = false,
  }) => _edit(
    'Transform this 3D render of a $sport $garment into a premium photorealistic commercial '
    'sportswear photograph, '
    '${showcaseScenes[scene] ?? showcaseScenes.values.first}. '
    'Keep the garment design EXACTLY as in the image: the same colours, panel layout, pattern, '
    'collar and trims, and the same ${back ? 'back name and number' : 'chest wordmark and crest'} '
    '(the wordmark reads exactly "$logoText"${back && number != null ? ' and the number reads "$number"' : ''}). '
    'Do not add, remove or change any text, logos or graphics. Make the fabric photoreal: fine knit '
    'and mesh texture, natural folds and drape, flatlock stitching, slight sheen on the print. '
    'Professional lighting with realistic shadows, ultra-detailed, no watermark, no UI.',
    [capture],
    size: '1536x1024',
  );

  /// Back view that matches an existing front render.
  Future<Uint8List> renderBack(Uint8List front, DesignSpec spec) => _edit(
    'Show the BACK view of this exact same garment: identical colours, '
    'pattern, trims and materials, same studio background and lighting. '
    'Name "${spec.logoText}" and a large number 23 across the upper back '
    'where suitable for the garment. Nothing else added.',
    [front],
  );

  /// Applies a free-text change to an existing render.
  Future<Uint8List> reviseRender(Uint8List current, DesignSpec spec) => _edit(
    'Update this garment render to match this design, keeping the same '
    'camera angle, background and lighting, and changing only what differs: '
    '${spec.renderPrompt} The chest wordmark reads exactly '
    '"${spec.logoText}". No other logos or text.',
    [current],
  );

  Future<Uint8List> _generate(
    String prompt, {
    String size = '1024x1536',
    String quality = 'medium',
  }) async {
    final json = await _post('/images/generations', {
      'model': _imageModel,
      'prompt': prompt,
      'size': size,
      'quality': quality,
      'output_format': 'jpeg',
      'output_compression': 88,
      'n': 1,
    });
    return _firstImage(json);
  }

  Future<Uint8List> _edit(
    String prompt,
    List<Uint8List> images, {
    String size = '1024x1536',
    String quality = 'medium',
    bool highFidelity = false,
    bool fidelity = false,
  }) async {
    if (highFidelity) {
      // Keeps the first image (the client's logo or design) faithful; a
      // model that does not take input_fidelity gets the plain request.
      try {
        return await _edit(
          prompt,
          images,
          size: size,
          quality: quality,
          fidelity: true,
        );
      } on AiException catch (e) {
        if (!e.message.contains('input_fidelity')) rethrow;
      }
    }
    final request =
        http.MultipartRequest('POST', Uri.parse('$_base/images/edits'))
          ..headers['Authorization'] = 'Bearer $_apiKey'
          ..fields.addAll({
            'model': _imageModel,
            'prompt': prompt,
            'size': size,
            'quality': quality,
            'output_format': 'jpeg',
            'output_compression': '88',
            if (fidelity) 'input_fidelity': 'high',
          });
    for (final (i, bytes) in images.indexed) {
      final mime = _mime(bytes);
      request.files.add(
        http.MultipartFile.fromBytes(
          'image[]',
          bytes,
          filename: 'image$i.${mime.split('/').last}',
          contentType: MediaType.parse(mime),
        ),
      );
    }
    final response = await _send(
      () => _client.send(request).then(http.Response.fromStream),
    );
    return _firstImage(response);
  }

  Uint8List _firstImage(Map<String, dynamic> json) {
    final data = json['data'] as List?;
    if (data == null || data.isEmpty) {
      throw AiException('No image came back. Please try again.');
    }
    return base64Decode(data.first['b64_json'] as String);
  }

  Future<Map<String, dynamic>> _post(String path, Object body) => _send(
    () => _client.post(
      Uri.parse('$_base$path'),
      headers: {
        'Authorization': 'Bearer $_apiKey',
        'Content-Type': 'application/json',
      },
      body: jsonEncode(body),
    ),
  );

  Future<Map<String, dynamic>> _send(
    Future<http.Response> Function() call,
  ) async {
    if (!enabled) throw AiException('AI is not configured in this build.');
    final http.Response response;
    try {
      response = await call().timeout(const Duration(minutes: 3));
    } on Exception {
      throw AiException(
        'Could not reach the AI service. Check your internet connection.',
      );
    }
    Map<String, dynamic> json;
    try {
      json = jsonDecode(utf8.decode(response.bodyBytes));
    } on FormatException {
      throw AiException('Unexpected AI response (${response.statusCode}).');
    }
    if (response.statusCode >= 400 || json['error'] != null) {
      final error = json['error'] as Map<String, dynamic>? ?? {};
      throw AiException(switch (response.statusCode) {
        401 => 'The AI key was rejected. The build needs a valid key.',
        429 => 'AI usage limit reached. Try again shortly or check credits.',
        _ => 'AI error: ${error['message'] ?? response.statusCode}',
      });
    }
    return json;
  }

  static String _mime(Uint8List bytes) {
    if (bytes.length > 3 && bytes[0] == 0x89 && bytes[1] == 0x50) {
      return 'image/png';
    }
    if (bytes.length > 11 && bytes[8] == 0x57 && bytes[9] == 0x45) {
      return 'image/webp';
    }
    return 'image/jpeg';
  }
}
