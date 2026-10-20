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
            'The repeating print motif for the kit, as a black-and-white '
            'pattern description, max 25 words, e.g. "sharp interlocking '
            'chevrons with small triangles". No colours.',
      },
      'renderPrompt': {
        'type': 'string',
        'description':
            'Detailed visual description of the garment design for an image '
            'model: colours, panels, pattern, trims, collar, wordmark text '
            'and placement. Garment only; no background or camera details.',
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
  }) async {
    final text = StringBuffer()
      ..writeln('Client brief: ${brief.trim().isEmpty ? '(none)' : brief}')
      ..writeln(
        'Create exactly 4 clearly different concept directions for this '
        'kit: 1) bold and aggressive, 2) classic and clean, 3) heritage or '
        'pattern-led, 4) modern minimal. Keep the team name, sport and '
        'garment consistent across all four.',
      );
    if (references.isNotEmpty) {
      text.writeln(switch (mode) {
        BriefMode.match =>
          'Reference images are attached. Match their style closely.',
        BriefMode.modify =>
          'Reference images are attached. Keep their layout but change the '
              'colours and details as the brief says.',
        _ =>
          'Reference images are attached. Take colours, motifs and mood from '
              'them.',
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

  /// A quick square concept render (about 12 s at low quality).
  Future<Uint8List> renderConcept(
    DesignSpec spec, {
    List<Uint8List> references = const [],
  }) {
    final prompt =
        'Premium photoreal product render of a ${spec.sport} ${spec.garment}, '
        'front view, centred and fully visible, on an invisible mannequin '
        'floating on a near-black background with a cyan rim light. Design: '
        '${spec.renderPrompt} The chest wordmark reads exactly '
        '"${spec.logoText}". The first attached image is the 3DEEZI logo: use '
        'its emblem as the chest crest. No other logos or text.';
    return _brandLogo().then(
      (logo) => _edit(
        references.isEmpty
            ? prompt
            : '$prompt The other attached images are style references only.',
        [logo, ...references.take(3)],
        size: '1024x1024',
        quality: 'low',
      ),
    );
  }

  static Future<Uint8List>? _logo;

  /// The 3DEEZI logo (emblem and wordmark) that branded mockups wear.
  static Future<Uint8List> _brandLogo() => _logo ??= rootBundle
      .load('assets/images/logo_full.png')
      .then((data) => data.buffer.asUint8List());

  /// One brief in, one finished HD presentation mockup out, like ChatGPT:
  /// front and back with close-up detail panels. [logos] are placed as the
  /// brief says; otherwise the garment wears the 3DEEZI emblem and wordmark.
  Future<Uint8List> mockup({
    required String brief,
    required String sport,
    required String garment,
    List<Uint8List> logos = const [],
  }) async {
    final count = logos.take(4).length;
    final prompt = StringBuffer(
      'You are a world-class sportswear designer making a client '
      'presentation mockup.\nSport: $sport. Garment: $garment.\n'
      'Client brief: $brief\n\n'
      'Unless the brief asks for a different layout, angle or background, '
      'make one landscape presentation sheet: the garment shown flat-front on '
      'the left and from '
      'the back in the centre, on invisible ghost mannequins against a soft '
      'light-grey seamless studio background with gentle shadows, plus a '
      'column of 4 square close-up detail panels on the right (for example '
      'collar, raised logo, crest and fabric) each with a short uppercase '
      'caption underneath. Photorealistic commercial product photography: '
      'real fabric with fine knit texture, natural folds, flatlock stitching, '
      'ribbed trims, crisp printed and raised logos. All text must be spelled '
      'exactly as written in the brief. ',
    );
    prompt.write(
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
                'them, or in sensible positions. The last attached image is the '
                '3DEEZI logo: use it only for the small neck label, unless the '
                'brief asks for 3DEEZI branding; leave it out when the '
                'client\'s design carries its own brand.'
          : 'The attached image is the 3DEEZI logo (emblem and wordmark). If '
                'the brief gives any wordmark, team, club or brand name, use '
                'exactly that text where the brief says and do NOT put 3DEEZI '
                'on the chest; then use the 3DEEZI emblem only on the small '
                'neck label. Only if the brief names no wordmark or brand at '
                'all, put the 3DEEZI wordmark across the chest and the 3DEEZI '
                'emblem as the crest, exactly as in the logo.',
    );
    prompt.write(' No watermarks, no extra brands.');
    return _edit(
      prompt.toString(),
      [...logos.take(4), await _brandLogo()],
      size: '1536x1024',
      quality: 'high',
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
  }) async {
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
