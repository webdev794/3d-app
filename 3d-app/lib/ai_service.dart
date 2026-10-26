import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import 'sports_catalog.dart';

/// Supplied at build time: `--dart-define=OPENAI_API_KEY=...`. When it is
/// absent the app falls back to its scripted demo flow.
const _apiKey = String.fromEnvironment('OPENAI_API_KEY');
const _textModel = String.fromEnvironment(
  'OPENAI_TEXT_MODEL',
  defaultValue: 'gpt-6-luna',
);
// The same models as the website's Admin › Settings (2026-10-21): Flare for
// the designs, Sunburst for HD; a model or parameter OpenAI turns down falls
// back once to the known-good gpt-image-2 / gpt-6-luna.
const _imageModel = String.fromEnvironment(
  'OPENAI_IMAGE_MODEL',
  defaultValue: 'gpt-image-2.5-flare',
);
const _hdImageModel = String.fromEnvironment(
  'OPENAI_HD_IMAGE_MODEL',
  defaultValue: 'gpt-image-2.5-sunburst',
);
const _base = 'https://api.openai.com/v1';

const designPatterns = ['Velocity', 'Chevron', 'Stripes', 'Solid'];
const designFabrics = ['Standard', 'Mesh', 'Pro', 'Eco'];

/// Every sport name, as lib/sports_catalog.dart (a const list for the JSON
/// schema; test/sports_catalog_test.dart checks the two match).
const designSports = [
  'Rugby League',
  'Basketball',
  'Soccer',
  'AFL',
  'Netball',
  'Rugby Union',
  'Ice Hockey',
  'American Football',
  'Golf',
  'Tennis',
  'Athletics',
  'Swimming',
  'Darts & Pool',
  'Touch',
  'Cricket',
  'Softball',
  'Volleyball',
  'Lacrosse',
  'Cycling',
  'BMX',
  'Lawn Bowls',
  'Esports',
  'Training / Gym',
  'Fight Wear',
  'Fishing',
  'Workwear',
  'Gymwear',
  'Club Casual',
  'School Leavers',
];
const designGarments = [
  'Jersey',
  'Shorts',
  'Training Tee',
  'Singlet',
  'Polo',
  'Full Kit',
];

/// Every 3D garment an AI design can be (the Artboard keeps to
/// designGarments): the pocket polo and the hoodies too.
const aiDesignGarments = [
  ...designGarments,
  'Polo with pocket',
  'Netball dress',
  'Hoodie',
  'Zip hoodie',
  'Varsity jacket',
  'Track jacket',
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

/// An AI design picture read for the editable 3D kit (task 9.116; the
/// website's OpenAiDesigner::readDesign): the nearest 3D garment we have
/// (never a refusal: [exact] is false when it is only the closest), the
/// picture's own colours, the nearest pattern, its lettering and where its
/// club symbol is.
class DesignReading {
  const DesignReading({
    required this.garment,
    required this.seen,
    required this.exact,
    required this.hood,
    required this.mainColor,
    required this.secondaryColor,
    required this.accentColor,
    required this.pattern,
    required this.motif,
    required this.teamName,
    required this.backName,
    required this.number,
    required this.letters,
    this.nameOnFront = true,
    this.crest,
    this.print,
  });

  /// The app's garment name ('Singlet', 'Training Tee', …).
  final String garment, seen, pattern, motif, teamName, backName, number;

  /// Netball's position letters (GS…); empty for other sports.
  final String letters;
  final bool exact, hood;

  /// The team name is written across the front (else only the crest is).
  final bool nameOnFront;
  final Color mainColor, secondaryColor, accentColor;

  /// The club symbol's box in fractions of the picture, when it has one.
  final Rect? crest;

  /// A patch of the body's own print (fractions of the picture), when it
  /// has one: laid all over the 3D body (task 9.126).
  final Rect? print;

  /// Our 3D garments by the website's ids, with what each stands for.
  static const garments = {
    'jersey': (
      'Jersey',
      'short-sleeve sports jersey (rugby, soccer, league, cricket shirts)',
    ),
    'polo': ('Polo', 'polo shirt with a collar and buttons'),
    'pocketpolo': (
      'Polo with pocket',
      'polo shirt with a chest pocket (pool, darts)',
    ),
    'singlet': (
      'Singlet',
      'any other sleeveless top: singlets, tanks, bibs, basketball tops, '
          'AFL guernseys',
    ),
    'netball-dress': (
      'Netball dress',
      'a fitted dress for women, with a skirt: netball dresses and tennis dresses',
    ),
    'tee': (
      'Training Tee',
      'training t-shirt or other crew-neck top, also long-sleeve tops',
    ),
    'hoodie': ('Hoodie', 'pull-over hoodie'),
    'ziphoodie': ('Zip hoodie', 'full-zip hoodie'),
    'varsity': ('Varsity jacket', 'varsity or letterman jacket'),
    'trackjacket': (
      'Track jacket',
      'full-zip track jacket or tracksuit top (with a stand-up collar or a '
          'hood)',
    ),
    'shorts': ('Shorts', 'shorts alone'),
    'fullkit': ('Full Kit', 'a top and shorts shown together as one kit'),
  };

  /// The garments a design picture (print sheet) goes on as drawn.
  static const drawn = [
    'Singlet',
    'Netball dress',
    'Jersey',
    'Training Tee',
    'Polo',
    'Polo with pocket',
  ];

  /// The reading from the model's JSON, made safe: an unknown garment is the
  /// one asked for, a bad colour a safe one, netball always has letters.
  factory DesignReading.fromJson(
    Map<String, dynamic> j, {
    required String sport,
    required String asked,
  }) {
    String text(Object? v) => '${v ?? ''}'.trim();
    String clean(Object? v) {
      final t = text(v)
          .replaceAll(RegExp(r'\b3\s?DEEZI\b', caseSensitive: false), '')
          .trim()
          .toUpperCase();
      return t.length > 20 ? t.substring(0, 20) : t;
    }

    Color colour(Object? v, int fallback) {
      final hex = text(v).replaceAll('#', '');
      final value = RegExp(r'^[0-9a-fA-F]{6}$').hasMatch(hex)
          ? int.parse(hex, radix: 16)
          : fallback;
      return Color(0xff000000 | value);
    }

    final positions = sportNamed(sport)?.positions ?? const <String>[];
    var letters = text(
      j['positionLetters'],
    ).toUpperCase().replaceAll(RegExp('[^A-Z]'), '');
    if (positions.isNotEmpty && !positions.contains(letters)) {
      letters = positions.first;
    }
    if (positions.isEmpty) letters = '';
    final box = j['crest'];
    Rect? crest;
    if (box is Map && box['found'] == true) {
      double at(String k) =>
          ((box[k] as num?)?.toDouble() ?? 0).clamp(0.0, 1.0).toDouble();
      final r = Rect.fromLTRB(at('x0'), at('y0'), at('x1'), at('y1'));
      if (r.width > 0.015 &&
          r.height > 0.01 &&
          r.width < 0.4 &&
          r.height < 0.4) {
        crest = r;
      }
    }
    final pb = j['printBox'];
    Rect? print;
    if (pb is Map && pb['found'] == true) {
      double at(String k) =>
          ((pb[k] as num?)?.toDouble() ?? 0).clamp(0.0, 1.0).toDouble();
      final r = Rect.fromLTRB(at('x0'), at('y0'), at('x1'), at('y1'));
      if (r.width > 0.04 &&
          r.height > 0.03 &&
          r.width < 0.5 &&
          r.height < 0.5) {
        print = r;
      }
    }
    final number = text(j['number']).replaceAll(RegExp(r'\D'), '');
    return DesignReading(
      garment:
          garments[j['garment']]?.$1 ??
          (aiDesignGarments.contains(asked) ? asked : 'Jersey'),
      seen: text(j['seen']),
      exact: j['exact'] != false,
      hood: j['hood'] == true,
      mainColor: colour(j['mainColor'], 0x0b1016),
      secondaryColor: colour(j['secondaryColor'], 0x04d9e8),
      accentColor: colour(j['accentColor'], 0xffffff),
      // A picture with graphics is never a plain kit (the model often
      // answers Solid for an all-over print).
      pattern:
          designPatterns.contains(j['pattern']) &&
              !(j['pattern'] == 'Solid' && text(j['patternMotif']).isNotEmpty)
          ? j['pattern'] as String
          : 'Velocity',
      motif: text(j['patternMotif']),
      teamName: clean(j['teamName']),
      backName: clean(j['backName']),
      number: number.length > 3 ? number.substring(0, 3) : number,
      letters: letters,
      nameOnFront: j['nameOnFront'] != false,
      crest: crest,
      print: print,
    );
  }
}

class AiException implements Exception {
  AiException(this.message, {this.modelProblem = false});
  final String message;

  /// OpenAI turned down the model or a parameter (not the content).
  final bool modelProblem;
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
    garment: aiDesignGarments.contains(j['garment']) ? j['garment'] : 'Jersey',
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
  AiService({
    http.Client? client,
    String? apiKey,
    this.imageModel = _imageModel,
    this.hdImageModel = _hdImageModel,
    this.textModel = _textModel,
  }) : _client = client ?? http.Client(),
       _key = apiKey ?? _apiKey;
  final http.Client _client;
  final String _key;

  /// The models in use (the build's defaults; the same as the website's).
  String imageModel, hdImageModel, textModel;

  /// The known-good models a turned-down call falls back to, once.
  static const safeImageModel = 'gpt-image-2', safeTextModel = 'gpt-6-luna';

  /// gpt-image-1, 1.5 and 2 take input_fidelity; the 2.5 models reject it.
  static bool takesInputFidelity(String model) =>
      !model.startsWith('gpt-image-2.5');

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
        'enum': aiDesignGarments,
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
            'the club\'s crest on the chest, the small 3DEEZI word mark under '
            'the back collar and the lettering the sport uses. Free design, '
            'not limited to the pattern list. Garment only; no background or '
            'camera details.',
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
      ..writeln('Sport: ${sportForAi(sport)}')
      ..writeln('Garment: $garment')
      ..writeln('Client brief: ${brief.trim().isEmpty ? '(none)' : brief}')
      ..writeln('$brandRules ${markingRules(sport)}');
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
      'model': textModel,
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
    if (sport != null) {
      text.writeln('Sport chosen by the client: ${sportForAi(sport)}.');
    }
    if (garment != null)
      text.writeln('Garment chosen by the client: $garment.');
    text..writeln(
      'Create exactly 4 clearly different concept directions for this '
      'kit, each designed the way a top custom sublimation sportswear brand '
      'would: 1) bold and aggressive, with dynamic all-over sublimated '
      'graphics drawn from the theme of the client\'s logo or brief, 2) '
      'classic and clean, 3) heritage or pattern-led, 4) modern minimal. '
      'Keep the team name, sport and garment consistent across all four. '
      '$freeDesign $colourRules $brandRules ${markingRules(sport ?? '')}',
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
              'the theme), and make the client\'s main logo the crest on the '
              'chest.',
      });
    }
    final json = await _post('/responses', {
      'model': textModel,
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
        .map(
          (c) => DesignSpec.fromJson({
            ...c as Map<String, dynamic>,
            // The garment the client chose stays (as on the website).
            if (garment != null && aiDesignGarments.contains(garment))
              'garment': garment,
          }),
        )
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
      'model': textModel,
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
      'textures where they suit the theme; the club\'s crest on the chest; the '
      'lettering on the back; trims), never a plain template with flat colour '
      'blocks. pattern is only the nearest built-in pattern for the editable '
      '3D kit, and patternMotif is the custom print that carries the '
      'concept\'s graphics onto the 3D kit.';

  /// The quick concept preview prompt (a front view): the concept's free
  /// design, the club's symbol on the chest at crest size, the sport's own
  /// front lettering (netball: position letters) and no 3DEEZI on the front.
  static String conceptPreviewPrompt(
    String sport,
    String garment,
    String design,
    String logoText,
    int clientImages,
  ) {
    // A team name is a wordmark on the front; 3DEEZI never is.
    final wordmark =
        logoText.trim().isNotEmpty && logoText.trim().toUpperCase() != '3DEEZI'
        ? 'Any team wordmark on the front reads exactly "$logoText". '
        : '';
    return 'Premium photoreal product render of a $sport $garment, front view, '
        'centred and fully visible, on an invisible ghost mannequin against a '
        'dramatic dark background with soft floodlight haze and a rim light in '
        'the kit\'s colours. Design: $design A bold, fully sublimated print, '
        'never a plain template. '
        '${clientImages > 0 ? 'The first $clientImages attached image(s) come from the client: reproduce the client\'s main logo faithfully as the crest on the chest, at a normal crest size (if one shows the client\'s own complete garment design, follow it). ' : 'The chest carries a simple original crest at a normal crest size. '}'
        '$wordmark'
        'The last attached image is the 3DEEZI word mark: it goes only small '
        'under the back collar, which this front view does not show, so never '
        'put 3DEEZI on the front. ${markingRules(sport)} No other logos or '
        'text.';
  }

  /// A quick square concept render (about 12 s at low quality). The
  /// client's logos go in first as real image inputs, then the 3DEEZI word
  /// mark.
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

  /// The 3DEEZI word mark the designs wear small under the back collar, the
  /// only 3DEEZI branding (client 2026-10-26: the full logo had ended up
  /// huge on the chest; the website's OpenAiDesigner::WORD_MARK).
  static const wordMarkAsset = 'assets/images/brand-wordmark.png';
  static Future<Uint8List> _brandLogo() => _logo ??= rootBundle
      .load(wordMarkAsset)
      .then((data) => data.buffer.asUint8List());

  /// Every sport (client 2026-10-26, images/175.jpg; the same words as the
  /// website's OpenAiDesigner::BRAND_RULES): the club's symbol on the chest
  /// at a normal crest size, 3DEEZI only as a small word mark at the top of
  /// the back.
  static const brandRules =
      'Logos: the club\'s symbol goes on the chest at a normal crest size '
      '(about a hand\'s width, on the left chest or centred high on the '
      'chest), unless the brief or the client\'s own design places it '
      'differently: the client\'s own logo when one is attached, otherwise a '
      'simple original crest (a shield or roundel in the kit colours, with '
      'the team\'s initials when there is a team name). Never put a large '
      '3DEEZI logo, the 3DEEZI emblem or the words "AI SPORTSWEAR DESIGNER" '
      'on the chest or anywhere on the front. 3DEEZI appears only as a small '
      '3DEEZI word mark at the top of the back, just under the collar, and '
      'nowhere else on the garment.';

  static SportCategory? _sport(String sport) =>
      sportNamed(sport) ?? sportWithId(sport);

  /// What the sport's kits carry on the back (and, with playing positions,
  /// on the front), from lib/sports_catalog.dart (the same words as the
  /// website's OpenAiDesigner::markingRules): netball has no player names or
  /// numbers but the position letters.
  static String markingRules(String sport) {
    final s = _sport(sport);
    final names = s?.names ?? true, numbers = s?.numbers ?? true;
    final positions = s?.positions ?? const <String>[];
    if (names && numbers) {
      return 'Below the word mark, the back carries the team name in bold '
          'athletic lettering over a large player number (for example 01) '
          'when it suits the garment.';
    }
    final rule = StringBuffer(
      !names && !numbers
          ? 'This sport has no player names and no numbers: never put a '
                'player name or any number anywhere on the garment (front, '
                'back, sides or hem). '
          : !names
          ? 'This sport has no player names: never put a player name '
                'anywhere on the garment; below the word mark the back '
                'carries a large player number (for example 01). '
          : 'This sport has no numbers: never put a number anywhere on the '
                'garment; below the word mark the back carries the team name '
                'in bold athletic lettering. ',
    );
    if (positions.isNotEmpty) {
      rule.write(
        'Instead, match wear shows the playing position letters, as on real '
        'bibs (${positions.join(', ')}): one position only (for example '
        '${positions.first}), in large bold athletic lettering centred on the '
        'front below the club\'s crest, and again large on the back below '
        'the word mark (on the bib when the garment has one). The back shows '
        'only the small word mark and the position letters: no team name, '
        'player name or number. Training and warm-up wear (tees, hoodies, '
        'jackets) shows no position letters.',
      );
    }
    return rule.toString().trim();
  }

  /// The editable 3D kit's back name and number for an AI design of
  /// [sport] (the website's OpenAiDesigner::kitBack): none where the sport
  /// has none (netball), so the Studio and the order form add none. A null
  /// number keeps the kit's own.
  static ({String backName, String? number}) kitBack(
    String sport,
    String logoText,
  ) {
    final s = _sport(sport);
    return (
      backName: (s?.names ?? true) ? logoText : '',
      number: (s?.numbers ?? true) ? null : '',
    );
  }

  /// The art direction's fields for the sport: its own back (and front)
  /// lettering, as the website's OpenAiDesigner::directionFields.
  static Map<String, String> directionFields(String sport) {
    final s = _sport(sport);
    final names = s?.names ?? true, numbers = s?.numbers ?? true;
    final positions = s?.positions ?? const <String>[];
    const outline =
        'in bold white athletic lettering with an outline in the accent '
        'colour';
    return {
      ..._directionFields,
      if (positions.isNotEmpty) ...{
        'front':
            'The front design: base colour (dark black or navy for a cool or '
            'bold brief with a logo), the club\'s symbol on the chest at a '
            'normal crest size (the client\'s logo, or a simple crest when '
            'there is none; never a 3DEEZI logo), one playing position\'s '
            'letters (e.g. ${positions.first}) large $outline centred below '
            'it, and the sublimated graphics around them.',
        'back':
            'The back design: the small 3DEEZI word mark just under the '
            'collar, then the same position letters large $outline; no team '
            'name, no player name and no number anywhere; plus graphics.',
      } else if (!names || !numbers)
        'back':
            'The back design: the small 3DEEZI word mark just under the '
            'collar, then ${names
                ? 'the team name $outline; no numbers anywhere'
                : numbers
                ? 'a large player number (e.g. 01) $outline; no player names anywhere'
                : 'no player names and no numbers anywhere'}; '
            'plus graphics.',
    };
  }

  /// Kit colours like a top teamwear brand (the same words as the website):
  /// from the logo's brand colours, dark and bold when the brief is,
  /// readable lettering.
  /// Colours for an option with its own palette (no dark body preference).
  static const directionColourRules =
      'Colours: from the client\'s logo or the brief, never from skin tones '
      'or tiny logo details, with the body colour and palette the creative '
      'direction sets. The lettering on the back contrasts clearly with the '
      'body, with an outline in the accent colour.';

  static const colourRules =
      'Colours: take the kit colours only from the dominant brand colours of '
      'the client\'s logo or the brief, never from skin tones or tiny logo '
      'details. For a cool, bold or aggressive brief with a logo, prefer a '
      'dark body (black or deep navy) with the logo\'s main colour as the '
      'graphics and white highlights. The lettering on the back is white '
      'with an outline in the accent colour, so it stands out from the '
      'graphics.';

  /// The art director's brief for the HD mockup (strict JSON), the same as
  /// the website's.
  static const _directionFields = {
    'summary':
        'One friendly sentence to the client saying what you will create, '
        'e.g. "I\'ll create a BLITZ training singlet in electric blue, black '
        'and white, with your logo on the chest and lightning details '
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
        'bold brief with a logo), the club\'s symbol on the chest at a normal '
        'crest size (the client\'s logo, or a simple crest when there is '
        'none; never a 3DEEZI logo), and the sublimated graphics around it.',
    'back':
        'The back design: the small 3DEEZI word mark just under the collar, '
        'then the team name in bold white athletic lettering over a large '
        'white player number (e.g. 01) with an outline in the accent colour, '
        'when it suits the garment, plus graphics.',
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
        'Sport: ${sportForAi(sport)}\nGarment: $garment\nClient brief: $brief\n'
        '${count > 0 ? '$count image(s) from the client are attached: logos, references or their own finished design.\n' : 'No images are attached.\n'}'
        'You are the art director of a top custom sublimation sportswear '
        'brand. Before the designer renders one hero mockup, write its '
        'creative direction. Take the palette and theme from the client\'s '
        'logo (its colours, mascot, lettering style and motifs such as '
        'lightning, flames, claws or waves) or from the brief. Design bold, '
        'fully sublimated graphics derived from that theme, flowing across '
        'the front, sides and back, never a plain template with flat colour '
        'blocks. $brandRules ${markingRules(sport)} '
        'Follow everything the brief specifies (colours, layout, '
        'background, text). If an attached image is the client\'s own '
        'complete garment design, set ownDesign to true and describe that '
        'design exactly instead of inventing one. $colourRules Never use real '
        'club, league or brand logos other than the client\'s own.';
    try {
      final json = await _post('/responses', {
        'model': textModel,
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
                for (final MapEntry(:key, :value) in directionFields(
                  sport,
                ).entries)
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
  /// sublimated design from the logo's theme, the club's symbol on the chest
  /// at crest size, the sport's own back lettering (netball: position
  /// letters, no names or numbers), the small 3DEEZI word mark under the back
  /// collar, front and back side by side in a dramatic dark setting unless
  /// the brief asks otherwise; a client's own complete design is kept
  /// exactly.
  static String mockupPrompt({
    required String brief,
    required String sport,
    required String garment,
    required int count,
    Map<String, dynamic>? direction,
    String view = 'presentation',
    bool portrait = true,
  }) {
    // A full kit (a top with shorts) stands as worn: each top with its
    // shorts below it (client picture 146.jpg).
    final fullKit = garment.toLowerCase().contains('kit');
    // An option with its own palette (the website's alternatives): no dark
    // body preference, so the options do not all look the same.
    final ownColours = '${direction?['body'] ?? ''}'.trim().isNotEmpty;
    final prompt = StringBuffer(
      'You are the lead designer of a top custom sublimation sportswear '
      'brand, making a client presentation mockup.\nSport: ${sportForAi(sport)}. Garment: '
      '$garment.\nClient brief: $brief\n\n',
    );
    // A direction with no creative fields (the brief as written) adds nothing.
    const creative = [
      'theme',
      'palette',
      'front',
      'back',
      'graphics',
      'trims',
      'presentation', //
    ];
    if (direction != null &&
        creative.any((k) => '${direction[k] ?? ''}'.trim().isNotEmpty)) {
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
        'blocks or simple side panels. $brandRules '
        '${ownColours ? directionColourRules : colourRules} '
        '${markingRules(sport)} Matching trims on the collar, armholes or '
        'cuffs and hem.\n',
      )
      ..write(
        view == 'front'
            // The option cards (client picture 138.jpg): one garment.
            ? 'Presentation: one square image of premium commercial product '
                  'photography: a single garment, the front view only '
                  '(straight on or a slight three-quarter turn), centred, '
                  'complete and fully visible with a little space around it, '
                  'on an invisible ghost mannequin, no back view, '
            : portrait
            // YOUR DESIGNS (client picture 146.jpg, 2026-10-22): one tall
            // picture that fills a phone screen.
            ? 'Presentation: unless the brief asks for a different layout, '
                  'angle or background, make one tall portrait image (2:3) of '
                  'premium commercial product photography that fills a phone '
                  'screen: ${fullKit ? 'each set stands as worn, the top with its shorts directly below it: the front set on the left and the back set on the right, side by side, ' : 'the front view on the left and the back view on the right, side by side, '}'
                  'both complete, fully visible and not overlapping, large so '
                  'they fill most of the width and height of the frame with a '
                  'little space around them, on invisible ghost mannequins, '
            : 'Presentation: unless the brief asks for a different layout, '
                  'angle or background, make one landscape image of premium '
                  'commercial product photography: ${fullKit ? 'the front set (the top with its shorts below it) on the left and the back set on the right, side by side, ' : 'the front view on the left and the back view on the right, side by side, '}'
                  'both complete, fully visible and not overlapping, on '
                  'invisible ghost mannequins, ',
      )
      ..write(
        'in a dramatic dark '
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
                  '(the same artwork, colours and lettering) and place them '
                  'where the brief says, where the design shows them, or in '
                  'sensible positions (the main logo on the chest at a normal '
                  'crest size). The last attached image is the 3DEEZI word '
                  'mark: use it only small at the top of the back, just under '
                  'the collar, and nowhere else; leave it out when the '
                  'client\'s design carries its own brand.'
            : 'The attached image is the 3DEEZI word mark: use it only small '
                  'at the top of the back, just under the collar, and nowhere '
                  'else; do NOT put 3DEEZI on the chest or anywhere on the '
                  'front. If the brief gives any wordmark, team, club or brand '
                  'name, use exactly that text where the brief says. With no '
                  'client logo, the chest carries a simple original crest at a '
                  'normal crest size.',
      )
      ..write(' No watermarks, no extra brands.');
    return prompt.toString();
  }

  /// One design on the AI designer's results (the same prompt and inputs as
  /// the website's /ai/designs/render): the brief under the full design rules,
  /// plus a [direction] for an option. Medium quality by default (about 40 s);
  /// `high` for "HD primary" and "Make HD".
  Future<Uint8List> designMockup({
    required String brief,
    required String sport,
    required String garment,
    List<Uint8List> logos = const [],
    Map<String, dynamic>? direction,
    String quality = 'medium',
    String view = 'presentation',
  }) async {
    final client = logos.take(4).toList();
    final images = [...client, await _brandLogo()];
    Future<Uint8List> render(bool portrait) => _edit(
      mockupPrompt(
        brief: brief,
        sport: sport,
        garment: garment,
        count: client.length,
        direction: direction,
        view: view,
        portrait: portrait,
      ),
      images,
      size: view == 'front'
          ? '1024x1024'
          : portrait
          ? portraitSize
          : '1536x1024',
      quality: quality == 'high' ? 'high' : 'medium',
      highFidelity: true,
      model: quality == 'high' ? hdImageModel : imageModel,
    );
    if (view == 'front') return render(false);
    // Portrait (YOUR DESIGNS, 146.jpg); a model that turns the size down
    // gets the landscape picture once instead (the results fit any shape).
    try {
      return await render(true);
    } on AiException catch (e) {
      if (!sizeProblem(e.message)) rethrow;
      debugPrint('The image model turned down $portraitSize; landscape: $e');
      return render(false);
    }
  }

  /// The AI designs' picture size: tall, so a design fills a phone.
  static const portraitSize = '1024x1536';

  /// Whether an image error is about the picture size.
  static bool sizeProblem(String message) => RegExp(
    r'\bsize\b|1024x1536|dimension|aspect ratio',
    caseSensitive: false,
  ).hasMatch(message);

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
      model: hdImageModel,
    );
  }

  /// "Make it 3D": the print sheet prompt (the same words as the website).
  static String printSheetPrompt(
    String sport,
    String garment,
    int logos, {
    bool frontOnly = false,
  }) {
    final s = _sport(sport);
    final names = s?.names ?? true, numbers = s?.numbers ?? true;
    final back = s?.positions.isNotEmpty ?? false
        ? 'the same position letters large, no team name, no player name and '
              'no number'
        : names && numbers
        ? 'the team name in bold lettering over a large number'
        : names
        ? 'the team name in bold lettering, no numbers'
        : numbers
        ? 'a large number, no player names'
        : 'no player names and no numbers';
    return 'The first attached image shows a $sport $garment design. Redraw '
        'exactly the same design as a flat print artwork sheet for the '
        'factory: '
        '${frontOnly ? 'The picture shows the front only: draw the front exactly and design the back to match it (the same colours, graphics and trims, the small 3DEEZI word mark just under the collar, $back). ' : ''}'
        'the garment\'s front on the left and its back on the right, '
        'side by side, both complete and the same size, drawn flat and '
        'straight-on like a technical flat drawing, on a plain pure white '
        'background with clear white space around and between them: a wide '
        'white gap between the front and the back, so their sleeves and '
        'edges never touch or overlap. Draw each neck opening as an empty '
        'white cut-out, as on a technical flat drawing: never show the inside '
        'of the garment, the inner collar or the neckline of the other side '
        'through it, and keep all lettering clear of the collar. No '
        'mannequin, no person, no folds, no perspective, no lighting effects, '
        'no shadows, no scene. Keep the design exactly: the same colours, '
        'graphics, gradients, lettering, logos, numbers and trims, in the same '
        'places and proportions, and the same garment shape (neck, armholes or '
        'sleeves, hem). '
        '${logos > 0 ? 'The other $logos attached image(s) are the client\'s logos: reproduce them faithfully where the design shows them. ' : ''}'
        'No labels, captions, measurements, hangers, sewn-in neck labels or '
        'extra text.';
  }

  /// "Make it 3D": the mockup redrawn by the same model as a flat front and
  /// back print sheet, which the Studio's design-picture check puts on the
  /// 3D kit (AppController.importDesignPicture).
  Future<Uint8List> printSheet(
    Uint8List mockup, {
    required String sport,
    required String garment,
    List<Uint8List> logos = const [],
    bool frontOnly = false,
  }) {
    final client = logos.take(3).toList();
    return _edit(
      printSheetPrompt(sport, garment, client.length, frontOnly: frontOnly),
      [mockup, ...client],
      size: '1536x1024',
      quality: 'high',
      highFidelity: true,
    ).then(separateHalves);
  }

  /// A print sheet whose front and back touch (task 9.116: the image model
  /// sometimes draws the sleeves overlapping, and the 3D check then reads
  /// both as one garment): cut at the middle and moved apart with white
  /// between (a PNG). A sheet with a clear gap is kept as it is.
  static Future<Uint8List> separateHalves(Uint8List sheet) async {
    try {
      final codec = await ui.instantiateImageCodec(sheet);
      final image = (await codec.getNextFrame()).image;
      final w = image.width, h = image.height;
      if (w < 64 || h < 64) return sheet;
      final data = (await image.toByteData(
        format: ui.ImageByteFormat.rawRgba,
      ))!;
      bool white(int x) {
        for (var y = 0; y < h; y += 3) {
          final i = (y * w + x) * 4;
          if (data.getUint8(i) < 225 ||
              data.getUint8(i + 1) < 225 ||
              data.getUint8(i + 2) < 225) {
            return false;
          }
        }
        return true;
      }

      for (var x = (w * 0.38).toInt(); x <= (w * 0.62).toInt(); x += 2) {
        if (white(x)) return sheet;
      }
      final gap = (w * 0.08).round(), half = w ~/ 2;
      final recorder = ui.PictureRecorder();
      final paint = Paint();
      Canvas(recorder)
        ..drawRect(
          Rect.fromLTWH(0, 0, (w + gap).toDouble(), h.toDouble()),
          Paint()..color = const Color(0xffffffff),
        )
        ..drawImageRect(
          image,
          Rect.fromLTWH(0, 0, half.toDouble(), h.toDouble()),
          Rect.fromLTWH(0, 0, half.toDouble(), h.toDouble()),
          paint,
        )
        ..drawImageRect(
          image,
          Rect.fromLTWH(
            half.toDouble(),
            0,
            (w - half).toDouble(),
            h.toDouble(),
          ),
          Rect.fromLTWH(
            (half + gap).toDouble(),
            0,
            (w - half).toDouble(),
            h.toDouble(),
          ),
          paint,
        );
      final out = await recorder.endRecording().toImage(w + gap, h);
      final png = await out.toByteData(format: ui.ImageByteFormat.png);
      return png == null ? sheet : png.buffer.asUint8List();
    } on Object {
      return sheet;
    }
  }

  /// "Open in 3D Designer" (task 9.116): the AI design [picture] read for
  /// the editable 3D kit, as the website's /ai/designs/read (one cheap call).
  Future<DesignReading> readDesign(
    Uint8List picture, {
    required String sport,
    required String garment,
  }) async {
    final positions = sportNamed(sport)?.positions ?? const <String>[];
    final list = [
      for (final e in DesignReading.garments.entries) '${e.key}: ${e.value.$2}',
    ].join('; ');
    final lettersRule = positions.isEmpty
        ? ''
        : ' This sport shows playing position letters '
              '(${positions.join(', ')}) instead of names and numbers.';
    final text =
        'This picture is an AI design of a ${sportForAi(sport)} garment (the '
        'client asked for: $garment). Read it so the same design can be put '
        'on our editable 3D garment.\nOur 3D garments: $list.\n'
        'Choose the nearest of them to the main garment in the picture; when '
        'the picture shows something we have no model of, choose the closest '
        'and set exact to false. Take the colours exactly as they look in the '
        "picture (not from the brief): the body's main colour, the second "
        'colour of its panels and graphics, and the accent colour of its '
        'lettering and trims. Read every text exactly as written. 3DEEZI is '
        'our brand and never the team name.$lettersRule';
    Map<String, Object> str(String d) => {'type': 'string', 'description': d};
    Map<String, Object> number(String d) => {
      'type': 'number',
      'description': d,
    };
    final json = await _post('/responses', {
      'model': textModel,
      'input': [
        {'role': 'system', 'content': _system},
        {
          'role': 'user',
          'content': _content(text, [picture]),
        },
      ],
      'text': {
        'format': {
          'type': 'json_schema',
          'name': 'design_for_3d',
          'strict': true,
          'schema': {
            'type': 'object',
            'additionalProperties': false,
            'required': [
              'seen',
              'garment',
              'exact',
              'hood',
              'mainColor',
              'secondaryColor',
              'accentColor',
              'pattern',
              'patternMotif',
              'teamName',
              'nameOnFront',
              'backName',
              'number',
              'positionLetters',
              'crest',
              'printBox',
            ],
            'properties': {
              'seen': str(
                'The garment in the picture in 1-3 words, e.g. "netball '
                'dress", "soccer jersey".',
              ),
              'garment': {
                'type': 'string',
                'enum': DesignReading.garments.keys.toList(),
                'description': 'The nearest of our 3D garments.',
              },
              'exact': {
                'type': 'boolean',
                'description':
                    "True when the picture's garment is that kind of "
                    'garment, false when it is only the closest.',
              },
              'hood': {
                'type': 'boolean',
                'description': 'True when the garment has a hood.',
              },
              'mainColor': str(
                "Hex of the body's main colour as seen, e.g. #0B6E3A.",
              ),
              'secondaryColor': str(
                'Hex of the second colour (panels, graphics, stripes) as '
                'seen.',
              ),
              'accentColor': str(
                'Hex of the lettering and trims as seen; contrasts the main '
                'colour.',
              ),
              'pattern': {
                'type': 'string',
                'enum': designPatterns,
                'description':
                    'The nearest of these patterns: Velocity (sweeping or '
                    'flowing graphics, swirls, streaks), Chevron, Stripes '
                    '(stripes or hoops), Solid (only a plain body with no '
                    'graphics).',
              },
              'patternMotif': str(
                "The body's signature print as a black-and-white pattern "
                'description, max 20 words, no colours; empty when plain.',
              ),
              'teamName': str(
                'The team or club name written on the garment (chest '
                'wordmark or back), exactly; empty if none. Never 3DEEZI.',
              ),
              'nameOnFront': {
                'type': 'boolean',
                'description':
                    'True when the team name is written across the front of '
                    'the garment (not only on the back).',
              },
              'backName': str(
                'The name on the back, exactly; empty if none. Never 3DEEZI.',
              ),
              'number': str(
                'The player number on the back, digits only; empty if none.',
              ),
              'positionLetters': str(
                'Playing position letters shown large (e.g. GS); empty if '
                'none.',
              ),
              'printBox': {
                'type': 'object',
                'additionalProperties': false,
                'required': ['found', 'x0', 'y0', 'x1', 'y1'],
                'description':
                    'A patch of the front garment body that shows only its '
                    'all-over print (graphics, stripes, texture): no crest, '
                    'lettering, pocket, collar, seam, edge or background. A '
                    'typical patch with the same mix of colours as the whole '
                    'body (not its brightest part), as large as possible, as '
                    'a box in fractions of the '
                    'whole picture width and height. found is false when the '
                    'body is plain.',
                'properties': {
                  'found': {
                    'type': 'boolean',
                    'description':
                        'True when the body has a print and such a patch '
                        'exists.',
                  },
                  'x0': number('Left edge.'),
                  'y0': number('Top edge.'),
                  'x1': number('Right edge.'),
                  'y1': number('Bottom edge.'),
                },
              },
              'crest': {
                'type': 'object',
                'additionalProperties': false,
                'required': ['found', 'x0', 'y0', 'x1', 'y1'],
                'description':
                    'The club symbol (crest or logo) on the chest of the '
                    'front view (the garment on the left when front and back '
                    "are shown), as a box in fractions of the whole picture's "
                    'width and height (0 = left/top, 1 = right/bottom). '
                    'Measure carefully: the box tightly encloses the whole '
                    'symbol and nothing else.',
                'properties': {
                  'found': {
                    'type': 'boolean',
                    'description':
                        'True when the front shows a club symbol on the '
                        'chest.',
                  },
                  'x0': number('Left edge.'),
                  'y0': number('Top edge.'),
                  'x1': number('Right edge.'),
                  'y1': number('Bottom edge.'),
                },
              },
            },
          },
        },
      },
    });
    final out = jsonDecode(_outputText(json));
    if (out is! Map<String, dynamic>) {
      throw AiException('The AI could not read this design. Please try again.');
    }
    return DesignReading.fromJson(out, sport: sport, asked: garment);
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
      'model': textModel,
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
        '${spec.logoText.trim().toUpperCase() == '3DEEZI' ? 'The club\'s crest on the chest at a normal crest size; no 3DEEZI on the front.' : 'The chest wordmark reads exactly "${spec.logoText}".'} '
        '${markingRules(sport)} '
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
      'model': imageModel,
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
    // A kit without a number (netball) gets none added.
    'collar and trims, and the same ${back ? ((number ?? '').isNotEmpty ? 'back name and number' : 'back lettering') : 'chest wordmark and crest'} '
    '(the wordmark reads exactly "$logoText"${back && (number ?? '').isNotEmpty
        ? ' and the number reads "$number"'
        : back
        ? ', with no number'
        : ''}). '
    'Do not add, remove or change any text, logos or graphics. Make the fabric photoreal: fine knit '
    'and mesh texture, natural folds and drape, flatlock stitching, slight sheen on the print. '
    'Professional lighting with realistic shadows, ultra-detailed, no watermark, no UI.',
    [capture],
    size: '1536x1024',
  );

  /// Back view that matches an existing front render.
  /// The back follows the sport's rules: netball shows its position letters
  /// and no name or number; 3DEEZI is the small word mark under the collar.
  Future<Uint8List> renderBack(Uint8List front, DesignSpec spec) {
    final s = _sport(spec.sport);
    final positions = s?.positions ?? const <String>[];
    final lettering = positions.isNotEmpty
        ? 'The position letters ${positions.first} large across the back; no '
              'team name, player name or number'
        : (s?.names ?? true) && (s?.numbers ?? true)
        ? 'Name "${spec.logoText}" and a large number 23 across the upper '
              'back where suitable for the garment'
        : (s?.names ?? true)
        ? 'Name "${spec.logoText}" across the upper back; no number'
        : (s?.numbers ?? true)
        ? 'A large number 23 across the upper back; no player name'
        : 'No player name and no number';
    return _edit(
      'Show the BACK view of this exact same garment: identical colours, '
      'pattern, trims and materials, same studio background and lighting. '
      'A small 3DEEZI word mark just under the collar. $lettering. Nothing '
      'else added.',
      [front],
    );
  }

  /// Applies a free-text change to an existing render.
  Future<Uint8List> reviseRender(Uint8List current, DesignSpec spec) => _edit(
    'Update this garment render to match this design, keeping the same '
    'camera angle, background and lighting, and changing only what differs: '
    '${spec.renderPrompt} '
    '${spec.logoText.trim().toUpperCase() == '3DEEZI' ? 'No 3DEEZI on the front.' : 'The chest wordmark reads exactly "${spec.logoText}".'} '
    'No other logos or text.',
    [current],
  );

  Future<Uint8List> _generate(
    String prompt, {
    String size = '1024x1536',
    String quality = 'medium',
  }) async {
    final json = await _post('/images/generations', {
      'model': imageModel,
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
    String? model,
  }) async {
    final m = model ?? imageModel;
    try {
      return await _editWith(m, prompt, images, size, quality, highFidelity);
    } on AiException catch (e) {
      // A newly set model that OpenAI turns down: once more with gpt-image-2.
      if (!e.modelProblem || m == safeImageModel) rethrow;
      debugPrint(
        'OpenAI turned down $m (${e.message}); retried with $safeImageModel.',
      );
      return _editWith(
        safeImageModel,
        prompt,
        images,
        size,
        quality,
        highFidelity,
      );
    }
  }

  Future<Uint8List> _editWith(
    String model,
    String prompt,
    List<Uint8List> images,
    String size,
    String quality,
    bool highFidelity,
  ) async {
    // Keeps the first image (the client's logo or design) faithful. The
    // gpt-image-2.5 models reject input_fidelity, so they never get it;
    // another model that turns it down gets the plain request.
    if (highFidelity && takesInputFidelity(model)) {
      try {
        return await _editOnce(model, prompt, images, size, quality, true);
      } on AiException catch (e) {
        if (!e.message.contains('input_fidelity')) rethrow;
      }
    }
    return _editOnce(model, prompt, images, size, quality, false);
  }

  Future<Uint8List> _editOnce(
    String m,
    String prompt,
    List<Uint8List> images,
    String size,
    String quality,
    bool fidelity,
  ) async {
    final request =
        http.MultipartRequest('POST', Uri.parse('$_base/images/edits'))
          ..headers['Authorization'] = 'Bearer $_key'
          ..fields.addAll({
            'model': m,
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

  Future<Map<String, dynamic>> _post(String path, Object body) async {
    Future<Map<String, dynamic>> send(Object b) => _send(
      () => _client.post(
        Uri.parse('$_base$path'),
        headers: {
          'Authorization': 'Bearer $_key',
          'Content-Type': 'application/json',
        },
        body: jsonEncode(b),
      ),
    );
    final model = body is Map<String, dynamic> ? body['model'] : null;
    final safe = path == '/responses' ? safeTextModel : safeImageModel;
    try {
      return await send(body);
    } on AiException catch (e) {
      if (!e.modelProblem || model == null || model == safe) rethrow;
      debugPrint(
        'OpenAI turned down $model (${e.message}); retried with $safe.',
      );
      return send({...body as Map<String, dynamic>, 'model': safe});
    }
  }

  Future<Map<String, dynamic>> _send(
    Future<http.Response> Function() call,
  ) async {
    if (_key.isEmpty) {
      throw AiException('AI is not configured in this build.');
    }
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
      }, modelProblem: modelProblem(response.statusCode, error));
    }
    return json;
  }

  /// True when OpenAI turned down the model or a parameter, not the content.
  static bool modelProblem(int status, Map<String, dynamic> error) {
    final code = '${error['code'] ?? ''}';
    final message = '${error['message'] ?? ''}'.toLowerCase();
    if (const {
          'moderation_blocked',
          'content_policy_violation',
          'content_filter',
        }.contains(code) ||
        message.contains('safety') ||
        message.contains('policy')) {
      return false;
    }
    return const {400, 403, 404}.contains(status) &&
        (const {
              'model_not_found',
              'invalid_model',
              'unsupported_parameter',
              'unknown_parameter',
              'unsupported_value',
              'invalid_parameter',
            }.contains(code) ||
            error['param'] == 'model' ||
            message.contains('model') ||
            message.contains('parameter'));
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
