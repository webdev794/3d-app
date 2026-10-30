/// The sports and apparel categories the app designs for, in stage order: the
/// DYO sport chooser, the AI Designer's sports row, project sync and the AI
/// prompts all read this one list. It mirrors the website's
/// config/catalog.php (same ids, groups, garments and style hints;
/// test/sports_catalog_test.dart checks them against each other). The new 3D
/// garments of tasks 9.18-9.49 replace the default [SportCategory.garments]
/// as they are built.
class SportCategory {
  const SportCategory(
    this.id,
    this.name,
    this.group,
    this.kit, {
    this.hint,
    this.aiLabel,
    this.heading,
    this.more = true,
    this.subtitle,
    this.selectHint,
    this.descriptions = true,
    this.backdrop,
    this.names = true,
    this.numbers = true,
    this.positions = const [],
  });

  /// The website's catalogue id (also the picture names: showroom/kit-<id>,
  /// ai_designer/sport-<id>, and the CategoryIcon).
  final String id;

  /// The app's name for it (projects keep it; ProjectSync maps it to [id]).
  final String name;

  /// 'sports' or 'apparel': the ALL / SPORTS / APPAREL filters.
  final String group;

  /// The kit line under the stage ("Jersey + Shorts").
  final String kit;

  /// Its own garment tiles (task 9.99, config/catalog.php 'tiles'): the DYO
  /// garment step and the AI Designer's garment chips, in the sport's words.
  List<GarmentTile> get tiles => _sportTiles[id] ?? const [];

  /// The 3D garments its tiles use, in tile order (app garment names).
  List<String> get garments => [
    for (final t in tiles)
      if (t.garment != null) t.garment!,
  ].toSet().toList();

  /// The name in the garment step's heading when it differs ("Rugby").
  final String? heading;

  /// False: the garment step shows no "More teamwear" (the client's Rugby
  /// lists show all their garments).
  final bool more;

  /// The garment step's subtitle when it differs from "Choose what you want
  /// to design for <name>." (config/catalog.php 'subtitle').
  final String? subtitle;

  /// A line by the garment step's buttons ('select_hint'; none by default).
  final String? selectHint;

  /// False: the garment tiles show names only ('descriptions' => false, the
  /// client's American Football list).
  final bool descriptions;

  /// The garment step's background, assets/images/showroom/<backdrop>.webp
  /// ('backdrop'; the shared stadium stage when null).
  final String? backdrop;

  /// The image model's style hint, sent with the sport's name.
  final String? hint;

  /// The AI Designer tile's label when it differs from [name].
  final String? aiLabel;

  /// The AI designer's marking rules (config/catalog.php 'names', 'numbers'
  /// and 'positions'; client 2026-10-26, images/175.jpg): false when the
  /// sport's kits carry no player names / no numbers anywhere, and the
  /// playing position letters shown large on the front and back instead
  /// (netball bibs: GS, GA, WA, C, WD, GD, GK).
  final bool names, numbers;
  final List<String> positions;

  /// The sport as the AI prompts name it: "Golf (golf: a premium ...)".
  String get forAi => hint == null ? name : '$name ($hint)';
}

/// App garment name -> the website's 3D garment id (config/catalog.php).
const garmentIds = {
  'Jersey': 'jersey',
  // The American football jersey: shoulder-pad cut, cap sleeves (task 9.113).
  'Football jersey': 'nfljersey',
  // The compression top (NFL base layer): skin-tight long sleeves.
  'Compression top': 'compression',
  // The basketball shooting shirt: loose raglan V-neck warm-up tee (FN5).
  'Shooting shirt': 'shooting-shirt',
  // Knee-high team socks (garment 3).
  'Socks': 'socks',
  // The team cap (garment 4).
  'Cap': 'cap',
  // The netball / tennis skirt and hockey skort (COMING SOON 10).
  'Skirt': 'skirt',
  // The bucket hat (garment 5).
  'Bucket hat': 'bucket-hat',
  'Shorts': 'shorts',
  'Training Tee': 'tee',
  'Singlet': 'singlet',
  // A women's fitted dress on the female figure (task 9.126).
  'Netball dress': 'netball-dress',
  'Polo': 'polo',
  'Polo with pocket': 'pocketpolo',
  'Hoodie': 'hoodie',
  'Zip hoodie': 'ziphoodie',
  'Varsity jacket': 'varsity',
  'Track jacket': 'trackjacket',
  'Full Kit': 'fullkit',
};

/// A sport's garment tile (task 9.99): its own name and description on one
/// of our 3D garments. [fit] 'exact': that garment; 'nearest': no 3D model of
/// its own yet, the 3D preview uses [garment]; 'soon': no 3D model yet
/// ([garment] null, COMING SOON, not selectable). [future]: the 3D garment
/// still to build. Mirrors config/catalog.php (test/sports_catalog_test.dart).
class GarmentTile {
  const GarmentTile(
    this.name,
    this.description,
    String this.garment, {
    String? image,
    this.trackStyle,
    this.fabric,
    String? look,
  }) : fit = 'exact',
       future = null,
       _look = look,
       _image = image;
  const GarmentTile.nearest(
    this.name,
    this.description,
    String this.garment, {
    required String this.future,
    String? image,
    this.trackStyle,
    this.fabric,
    String? look,
  }) : fit = 'nearest',
       _look = look,
       _image = image;
  const GarmentTile.soon(
    this.name,
    this.description,
    String this.future,
    String image,
  ) : garment = null,
      fit = 'soon',
      trackStyle = null,
      fabric = null,
      _look = null,
      _image = image;

  final String name, description, fit;

  /// The app's garment name (null: coming soon).
  final String? garment;

  /// The 3D garment still to build (nearest and coming-soon tiles).
  final String? future;

  /// The track jacket's style the tile starts with ('hood'), if any.
  final String? trackStyle;

  /// The fabric type the tile starts with ('Mesh': the practice jersey), if any.
  final String? fabric;

  /// The tile picture's look the kit starts with (task 9.154): see [tileLook];
  /// unset, the look of its picture ([pictureLooks]).
  final String? _look;
  String? get look => soon
      ? null
      : _look ??
            pictureLooks[art] ??
            (const {
                  'shorts',
                  'trackjacket',
                  'compression',
                }.contains(garmentIds[garment])
                ? 'sides'
                : 'plain');
  final String? _image;

  bool get soon => garment == null;

  /// The picture: assets/images/showroom/garment-<art>.webp.
  String get art => _image ?? garmentIds[garment] ?? 'jersey';
}

/// A tile's starting look (task 9.154), as config/catalog.php `$look`: the
/// tile pictures share the 3DEEZI look (black body, bright cyan areas).
/// plain: black, no pattern; sides: cyan side panels; sleeves: cyan sleeves
/// and side panels; sleevesOnly: cyan sleeves; swoosh: cyan sweeps (Velocity)
/// with cyan sleeves; blades: royal blue and cyan blades up the sides and
/// over the shoulders (Blades); shoulders: cyan shoulders and sleeves; nflgame / nflpractice: the American football jerseys.
/// Each tile picture's look, as config/catalog.php `$pictureLooks`.
const pictureLooks = {
  'jersey': 'tribal',
  'fullkit': 'tribalKit',
  'rugby-jersey': 'rugbyTile',
  'rugby-kit': 'rugbyTile',
  'nfl-kit': 'nflgame',
  'rash-guard': 'blades',
  'polo': 'poloZip',
  'pocketpolo': 'poloZipPocket',
  'rugby-polo': 'sleeves',
  'tee': 'teeTile',
  'nfl-tee': 'teeCyan',
  'rugby-tee': 'teeSides',
  'netball-tee': 'teeSides',
  'shooting-shirt': 'shooting',
  'singlet': 'singletTile',
  'netball-training-singlet': 'bladesSides',
  'afl-guernsey': 'bladesSides',
  'netball-singlet-bib': 'bladesSides',
  'bibs': 'bibs',
  'netball-bibs': 'netballBibs',
  'netball-dress': 'bladesSides',
  'team-hoodie': 'hoodie',
  'nfl-hoodie': 'hoodie',
  'netball-hoodie': 'hoodie',
  'trackjacket': 'track',
  'netball-tracksuit': 'track',
  'tracksuit': 'trackSides',
  'rugby-hooded-tracksuit': 'trackSides',
  'nfl-hooded-tracksuit': 'trackSides',
  'rugby-waterproof-jacket': 'waterproof',
  'nfl-waterproof-jacket': 'waterproof',
  'nfl-compression-top': 'sides',
  'varsity': 'varsity',
  'nfl-varsity': 'varsity',
  'shorts': 'shortsTile',
  'rugby-shorts': 'shortsTile',
  'rugby-training-shorts': 'shortsTile',
  'nfl-training-shorts': 'shortsTile',
  'socks': 'socksHeel',
  'rugby-socks': 'rugbySocks',
  'nfl-socks': 'gameSocks',
  'cap': 'capSweep',
  'nfl-cap': 'capSweep',
  'netball-skirt': 'skirt',
  'basketball-shorts': 'bballShorts',
  'bucket-hat': 'hatShards',
  'nfl-bucket-hat': 'hat',
  'rugby-bucket-hat': 'hat',
};

/// What a picture shows on top of its look, as config/catalog.php
/// `$pictureExtras`: objects with ids 'tile-…' (a new tile takes them off).
List<Map<String, dynamic>> _tileObjects(String? picture) {
  List<Map<String, dynamic>> letters(
    String text, {
    double y = 0.36,
    double size = 0.16,
  }) => [
    for (final side in const ['front', 'back'])
      {
        'id': side == 'front' ? 'tile-position' : 'tile-position-back',
        'name': 'Position',
        'type': 'text',
        'part': 'top',
        'side': side,
        'x': 0,
        'y': y,
        'text': text,
        'size': size,
        'color': '#ffffff',
      },
  ];
  return switch (picture) {
    // The bibs pictures (FN5 2026-10-30, as config/catalog.php $trainingBibs and
    // $netballBibs): the training bibs' GS under the logo; the netball bibs' big
    // GS and the cyan binding down each side edge, front and back.
    'bibs' => letters('GS', y: 0.42),
    'netball-bibs' => [
      ...letters('GS', y: 0.38, size: 0.26),
      for (final side in const ['front', 'back'])
        for (final dir in const [1, -1])
          {
            'type': 'shape',
            'id': 'tile-edge-$side${dir > 0 ? '-l' : '-r'}',
            'name': 'Side binding',
            'part': 'top',
            'side': side,
            'x': 0.205 * dir,
            'y': 0.25,
            'shape': 'rectangle',
            'w': 0.024,
            'h': 0.52,
            'color': '#16b4f0',
          },
    ],
    'netball-singlet-bib' => letters('GA'),
    'netball-dress' => letters('WA'),
    // The Game Jersey picture (FX3): its chest "3" bold and slanted in the
    // block jersey font with a light cyan edge, clear of the shoulder piping;
    // small white numbers with a cyan line (as the 86) on the shoulder tops: the
    // 86, its "8" on the one shoulder and its "6" on the other, lying along the
    // shoulder (FN3 2026-10-30, from the picture).
    'nfl-jersey' => [
      {
        'id': 'tile-sleeve',
        'name': 'Chest number',
        'type': 'text',
        'part': 'top',
        'side': 'front',
        'x': 0.132,
        'y': 0.632,
        'text': '3',
        'size': 0.072,
        'color': '#00a0f8',
        'font': 'JerseyBlock',
        'look': {
          'style': 'outline',
          'width': 0.03,
          'color': '#8fe0ff',
          'shape': 'slant',
        },
      },
      for (final dir in const [1, -1])
        {
          'id': dir > 0 ? 'tile-shoulder' : 'tile-shoulder-right',
          'name': 'Shoulder number',
          'type': 'text',
          'part': 'top',
          'side': 'front',
          'x': 0.168 * dir,
          'y': 0.692,
          'rot': 80 * dir,
          'text': dir > 0 ? '8' : '6',
          'size': 0.056,
          'color': '#ffffff',
          'font': 'JerseyBlock',
          'look': {'style': 'outline', 'width': 0.08, 'color': '#00a8ff'},
        },
    ],
    // The Game Kit picture's cyan "3" sits on the left chest, level with the crest at the V.
    'nfl-kit' => [
      {
        'id': 'tile-sleeve',
        'name': 'Chest number',
        'type': 'text',
        'part': 'top',
        'side': 'front',
        'x': 0.15,
        'y': 0.631,
        'text': '3',
        'size': 0.072,
        'color': '#00a0f8',
      },
    ],
    // The Compression Top picture: the "3" upright on the upper arm (seen from the front). (The small "3" is on the
    // viewer's black neck label inside the back neck; nothing under the crew neck.)
    'nfl-compression-top' => [
      {
        'id': 'tile-sleeve',
        'name': 'Sleeve number',
        'type': 'text',
        'part': 'top',
        'side': 'front',
        'x': 0.3565,
        'y': 0.5467,
        'rot': -45,
        'text': '3',
        // FX3: a squared block numeral, taller, as the picture's. (Upright from the front, tall and condensed, just
        // inside the arm's outer edge.) (FM print round 2: upright along the arm, 34 x 70 px as the picture's, in its
        // brighter cyan.)
        'size': 0.112,
        'narrow': 0.39,
        'color': '#00c4f0',
        'font': 'JerseyBlock',
      },
    ],
    // The shorts pictures (FN4): a white 3DEEZI under the "3" mark, low on the
    // left leg.
    'shorts' ||
    'rugby-shorts' ||
    'rugby-training-shorts' ||
    'nfl-training-shorts' => [
      {
        'id': 'tile-shorts-word',
        'name': 'Shorts wordmark',
        'type': 'text',
        'part': 'shorts',
        'side': 'front',
        'x': 0.11,
        'y': 0.06,
        'text': '3D',
        'size': 0.036,
        'color': '#ffffff',
      },
      {
        'id': 'tile-shorts-word2',
        'name': 'Shorts wordmark',
        'type': 'text',
        'part': 'shorts',
        'side': 'front',
        'x': 0.15,
        'y': 0.06,
        'text': 'EEZI',
        'size': 0.036,
        'color': '#1e8ff0',
      },
    ],
    // The Rugby kit picture (FN4): the cyan "3" over a small white 3DEEZI, low
    // on the shorts' left leg.
    'rugby-kit' => [
      {
        'id': 'tile-shorts-mark',
        'name': 'Shorts mark',
        'type': 'text',
        'part': 'shorts',
        'side': 'front',
        'x': 0.15,
        'y': 0.11,
        'text': '3',
        'size': 0.06,
        'color': '#00a2e8',
        'font': 'JerseyBlock',
      },
      {
        'id': 'tile-shorts-word',
        'name': 'Shorts wordmark',
        'type': 'text',
        'part': 'shorts',
        'side': 'front',
        'x': 0.15,
        'y': 0.06,
        'text': '3DEEZI',
        'size': 0.032,
        'color': '#ffffff',
      },
    ],
    _ => [],
  };
}

Map<String, dynamic> tileLook(String name, {String? picture}) {
  const cyan = '#16b4f0';
  Map<String, String> solid(List<String> zones) => {
    for (final z in zones) z: 'Solid',
  };
  Map<String, dynamic> number(String ink, String? line) => {
    'number': '86',
    'marks': {
      'top_number': {
        'color': ink,
        if (line != null)
          'look': {'style': 'outline', 'width': 0.07, 'color': line},
      },
    },
  };
  final looks = <String, Map<String, dynamic>>{
    'plain': {},
    'sides': {
      'zones': solid(['sides']),
    },
    'sleeves': {
      'zones': solid(['sleeves', 'sides']),
    },
    'sleevesOnly': {
      'zones': solid(['sleeves']),
    },
    // The training tee pictures (FN5 2026-10-30, as config/catalog.php): black
    // neck, hem and side seams, the wordmark higher; garment-tee's muted azure
    // sleeves; nfl-tee's cyan sleeves with the "3" centred; rugby-tee and
    // netball-tee's cyan sleeves and side panels.
    'teeTile': {
      'secondary': '#27282a',
      'patternColor': '#00688a',
      'zones': solid(['sleeves']),
      'marks': {
        'top_wordmark': {'y': 0.53},
      },
    },
    'teeCyan': {
      'secondary': '#27282a',
      'patternColor': '#00a8f5',
      'zones': solid(['sleeves']),
      'marks': {
        'top_wordmark': {'y': 0.53},
        'top_crest': {'x': 0, 'y': 0.6},
      },
    },
    'teeSides': {
      'secondary': '#27282a',
      'patternColor': '#00a8f5',
      'zones': solid(['sleeves', 'sides']),
      'marks': {
        'top_wordmark': {'y': 0.53},
      },
    },
    // (FN5 2026-10-30, the varsity picture's colours: a cool blue-black body
    // and rib, pale sky blue sleeves, the white felt border round the chest
    // "3" (the accent).)
    'varsity': {
      'accent': '#ffffff',
      'zoneColors': {
        'body': '#1a1e23',
        'sleeves': '#4fb2d0',
        'rib': '#1a1e23',
        'ribStripe': cyan,
      },
    },
    // The football / hockey jersey picture (DT3): a royal blue maze (Swirl)
    // over the raglan shoulders and sleeves with cyan piping on the raglan
    // seam, cyan side panels, a black collar, hem and cuffs.
    // FX3: the maze on the shoulders up to the collar, fading out down the
    // upper sleeves; the arms mostly plain (the Shoulders area only, which
    // reaches over a bare sleeve).
    'tribal': {
      'secondary': '#27282a',
      'patternColor': '#1972ab',
      'zones': {'yoke': 'Swirl'},
      'parts': {
        'sides': {'colour': cyan},
      },
      // FN2 2026-10-30: the tile's wing collar (viewer wingcollar.js).
      'zoneColors': {'wingCollar': '#1b1d20', 'wingCollarInside': '#5f6266'},
    },
    // The Full kit picture (DT3): a pale blue maze over the shoulders and
    // sleeves, no side panels, black trims, the "3" mark centred above the
    // wordmark.
    // FN6 2026-10-30 (colours measured on the picture): the print on the
    // raglan shoulders and upper sleeves only; a crew neck; the flat pale blue
    // "3" over a flat pale blue wordmark high on the chest; the shorts plain
    // black with pointed pale blue blades low on the outer legs, no drawstring,
    // number, crest or word.
    'tribalKit': {
      'secondary': '#27282a',
      'accent': '#76c6ec',
      'patternColor': '#5b98bb',
      'zones': {'yoke': 'Swirl'},
      'zoneColors': {
        'crewNeck': '#27282a',
        'kitBlade': '#76c6ec',
        'brandInk': '#7ccdf2',
      },
      'marks': {
        'top_crest': {'x': 0.035, 'y': 0.655, 'scale': 0.6},
        'top_wordmark': {'y': 0.587, 'scale': 0.85},
        'shorts_number': {'hidden': true},
        'shorts_crest': {'hidden': true},
        'shorts_wordmark': {'hidden': true},
      },
    },
    // The bibs pictures (FN5 2026-10-30, as config/catalog.php): black hems; the
    // training bibs' blades up the sides and the "3" over a small 3DEEZI high
    // on the chest; the netball bibs plain black (their binding is objects).
    'bibs': {
      'pattern': 'Blades',
      'zones': solid(['sides']),
      'parts': {
        'hem': {'colour': '#27282a'},
      },
      'marks': {
        'top_name': {'hidden': true},
        'top_number': {'hidden': true},
        'top_crest': {'x': 0, 'y': 0.6, 'scale': 0.75},
        'top_wordmark': {'x': 0, 'y': 0.55, 'scale': 0.45},
      },
    },
    'netballBibs': {
      'parts': {
        'hem': {'colour': '#27282a'},
      },
    },
    // FN6 2026-10-30: the polo and Darts shirt pictures: a black stand-up mock
    // collar with cyan piping, a black quarter zip (viewer), black trims, a
    // smooth matt knit; the polo's logo higher; the Darts shirt's pocket with
    // no crest in it and the big wordmark under it.
    'poloZip': {
      'main': '#313234',
      'secondary': '#27282a',
      'zoneColors': {'quarterZip': '#c9ccd1', 'collarPiping': cyan},
      'marks': {
        'top_wordmark': {'y': 0.503},
        'top_crest': {'x': 0.09, 'y': 0.607, 'scale': 1.0},
      },
    },
    'poloZipPocket': {
      'main': '#313234',
      'secondary': '#27282a',
      'zoneColors': {'quarterZip': '#c9ccd1', 'collarPiping': cyan},
      'marks': {
        'top_wordmark': {'x': 0, 'y': 0.503, 'scale': 2.5},
        'top_crest': {'hidden': true},
      },
    },
    'bladesSides': {
      'pattern': 'Blades',
      'zones': solid(['sides']),
    },
    // The shooting shirt picture (FN5 2026-10-30, colours measured on it): its
    // own 3D shirt, cyan raglan sleeves, royal blue side shards (Shards).
    'shooting': {
      'main': '#131416',
      'secondary': '#00c0f5',
      'accent': '#ffffff',
      'pattern': 'Shards',
      'patternColor': '#0050e6',
      'parts': {
        'leftSleeve': {'colour': '#00b0f0'},
        'rightSleeve': {'colour': '#00b0f0'},
      },
    },
    'swoosh': {
      'pattern': 'Velocity',
      'zones': solid(['sleeves']),
    },
    // The Rugby League jersey (RL1): royal blue blades with cyan edges over black,
    // the side panels black under the blades.
    'blades': {
      'pattern': 'Blades',
      'patternColor': '#1672f5',
      'parts': {
        'sides': {'colour': '#27282a', 'pattern': 'Blades'},
      },
    },
    // The Rugby League jersey and kit (RF1, the sport's picture): the jersey's own
    // Blades, black hem and cuffs, the cyan collar, a small 3DEEZI under the "3".
    'rugbyLeague': {
      'pattern': 'Blades',
      'patternColor': '#1672f5',
      'secondary': '#27282a',
      'parts': {
        'sides': {'colour': '#27282a', 'pattern': 'Blades'},
        'collar': {'colour': cyan},
      },
      'zoneColors': {
        'crestWord': cyan,
        'crestMark': '#1e8ff0',
        'cordTips': '#27282a',
      },
      // (The "3" all blue; the kit's shorts without the number and crest.)
      'marks': {
        'shorts_number': {'hidden': true},
        'shorts_crest': {'hidden': true},
      },
    },
    // The Rugby jersey and kit TILE pictures (website catalog.php, FN4): cyan
    // raglan shoulders, wide cyan cuffs, a black hem, cyan and royal blue side
    // sweeps; the kit's shorts with cyan side panels and the "3" + 3DEEZI.
    'rugbyTile': {
      // (A deeper cyan: it renders as saturated as the picture's.)
      'secondary': '#00a2e8',
      'zoneColors': {
        'raglan': '#00a2e8',
        'sweep': '#00a2e8',
        'sweepDeep': '#0262f6',
      },
      'parts': {
        'shortsSides': {'colour': '#00a2e8'},
        'shortsHem': {'colour': '#27282a'},
      },
      'marks': {
        // (The wordmark a little higher, as the picture's: DT7.)
        'top_wordmark': {'y': 0.505},
        'shorts_number': {'hidden': true},
        'shorts_crest': {'hidden': true},
      },
    },
    // The shorts pictures (website catalog.php, FN4): cyan side stripes, a
    // black waistband and hems, no number, black cord tips.
    'shortsTile': {
      'secondary': '#00a2e8',
      'zones': solid(['sides']),
      'parts': {
        'waistband': {'colour': '#27282a'},
        'shortsHem': {'colour': '#27282a'},
      },
      'zoneColors': {'cordTips': '#27282a'},
      'marks': {
        'shorts_number': {'hidden': true},
        'shorts_crest': {'x': 0.13, 'y': 0.115, 'scale': 0.85},
      },
    },
    // The Singlet picture (website catalog.php, FN4): black binding, big flat
    // blue side shapes (azure, light sky, royal), the wordmark higher, a
    // smaller "3".
    'singletTile': {
      'secondary': '#27282a',
      'zoneColors': {
        'flow': '#2a78c8',
        'flowLight': '#5ab4e4',
        'flowDeep': '#1c58c8',
      },
      'marks': {
        'top_wordmark': {'y': 0.505},
        'top_crest': {'scale': 0.7},
      },
    },
    'shoulders': {
      'zones': solid(['yoke', 'sleeves']),
    },
    // The hoodies: black, a wide cyan stripe along each sleeve (Hoodie areas ›
    // Sleeve stripe), cyan hood lining.
    // (FN5 2026-10-30, the hoodie picture: the stripe's bright cyan at the
    // shoulder, one small stacked logo centred on the chest.)
    'hoodie': {
      'zoneColors': {'stripe': '#06d8f2'},
      'marks': {
        'top_crest': {'x': 0, 'y': 0.565, 'scale': 0.85},
        'top_wordmark': {'x': 0, 'y': 0.5, 'scale': 0.6},
      },
    },
    // The track jackets (Track jacket areas): black shoulder panels, the cyan
    // sleeve stripe and zips; side panels black ('track') or cyan
    // ('trackSides'); the waterproof jacket's dark grey shell.
    // (FN8 2026-10-30: the Track jacket picture's cool blue-black body, collar
    // and panels, a neutral rib; sampled on the stage.)
    'track': {
      'zoneColors': {
        'body': '#1d2123',
        'shoulder': '#1d2123',
        'side': '#1d2123',
        'cuffs': '#1c2229',
        'stripe': cyan,
        'zip': cyan,
      },
    },
    'trackSides': {
      'zoneColors': {
        'shoulder': '#27282a',
        'side': cyan,
        'stripe': cyan,
        'zip': cyan,
      },
    },
    'waterproof': {
      'zoneColors': {
        'body': '#24272b',
        'shoulder': '#24272b',
        'side': cyan,
        'stripe': '#24272b',
        'zip': cyan,
      },
    },
    // The Game Kit picture (DT3): the "3" mark small at the V of the neck (the
    // cyan "3" goes on the left chest).
    // FN3 2026-10-30: the American football pictures' deeper, saturated azure
    // blues, set so the stage renders them (as config/catalog.php).
    'nflgame': {
      'secondary': '#0096f0',
      'accent': '#0096f0',
      'patternColor': '#0096f0',
      'zones': solid(['sleeves', 'sides']),
      'number': '86',
      'marks': {
        ...(number('#ffffff', '#00a8ff')['marks'] as Map<String, dynamic>),
        'top_crest': {'x': 0, 'y': 0.655, 'scale': 0.6},
      },
    },
    'nflpractice': number(cyan, null),
    // The Game Jersey picture (DT1): a thin cyan line round the white 86, the
    // front number a little bigger and higher.
    // NF1: cyan shoulder caps over the pads (with piping), black sleeves, a
    // black collar with a cyan stripe along its inner edge.
    // FX3: the "3" mark at the V on a small black badge, as big as in the
    // picture.
    'nflgameJersey': {
      'secondary': '#0096f0',
      'accent': '#0096f0',
      'patternColor': '#0096f0',
      'zones': solid(['yoke', 'sides']),
      'parts': {
        'collar': {'colour': '#0b0d10'},
        'sides': {'colour': '#006fc4'},
      },
      'zoneColors': {'collarStripe': '#0096f0', 'badge': '#27282a'},
      'number': '86',
      'marks': {
        'top_number': {
          'color': '#ffffff',
          'look': {'style': 'outline', 'width': 0.02, 'color': '#00a8ff'},
        },
        'top_frontNumber': {'y': 0.393, 'scale': 1.17},
        'top_crest': {'x': 0, 'y': 0.628, 'scale': 1.3},
      },
    },
    // The Practice Jersey picture (DT1): black collar, the cyan 86 just under
    // the chest logo.
    'nflpracticeJersey': {
      // NF1: a cyan stripe over each shoulder, along the sleeve seam. FX3: the
      // small cyan insert in the point of the V (the "3" mark a little lower).
      'secondary': '#0096f0',
      'accent': '#0096f0',
      'patternColor': '#0096f0',
      'zoneColors': {'stripe': '#0090f0', 'vInsert': '#00c0f8'},
      // FX3: black side panels (the picture has none).
      'parts': {
        'collar': {'colour': '#27282a'},
        'sides': {'colour': '#27282a'},
      },
      'number': '86',
      'marks': {
        'top_number': {'color': '#00c8ff'},
        'top_frontNumber': {'y': 0.43},
        'top_crest': {'x': 0, 'y': 0.6, 'scale': 2.2},
        'top_wordmark': {'y': 0.548},
      },
    },
    // The socks: cyan hoops (the trim colour); the pictures' cyan heel and toe, the rugby socks' cyan top band.
    'socksHeel': {
      'parts': {
        'sockFoot': {'colour': cyan},
      },
    },
    'rugbySocks': {
      'parts': {
        // The top band a deeper blue, as measured on the picture (website catalog.php).
        'sockBand': {'colour': '#0b95dd'},
        'sockHoops': {'colour': '#0b95dd'},
        'sockFoot': {'colour': cyan},
      },
      // Each socks picture's own layout (website catalog.php, FN4 2026-10-30):
      // the band's black line, the forefoot line and a flat blue "3".
      'zoneColors': {'sockToeLine': '#2b91c1', 'sockMark': '#0a93ee'},
    },
    // Game Socks: two wide hoops under a deep black top, a bigger "3".
    'gameSocks': {
      'zoneColors': {'sockHoopsWide': cyan},
    },
    // The cap: cyan piping (the trim colour); cyan and royal blue side sweeps, cyan under the brim.
    'capSweep': {
      'parts': {
        'capSweep': {'colour': cyan},
        'capSweepLow': {'colour': '#1a6ef0'},
        'capUnder': {'colour': cyan},
      },
    },
    // The skirt picture (netball skirt, hockey skort, tennis skirt): its side
    // panels a lighter, greener cyan, as measured on the picture
    // (website catalog.php).
    'skirt': {'secondary': '#25c6f2'},
    // The Basketball shorts picture: bright cyan side panels with a royal blue
    // band across them (the viewer's basketball shorts), no number (website
    // catalog.php).
    // FN6 2026-10-30 (DT8): a vivid aqua and a neutral black as rendered.
    'bballShorts': {
      'main': '#1d1d1e',
      'secondary': '#00e8ff',
      'accent': '#00e8ff',
      'patternColor': '#00e8ff',
      'zoneColors': {'bballBand': '#0036cc'},
      'marks': {
        'shorts_number': {'hidden': true},
      },
    },
    // The bucket hat pictures: a cyan bound edge; the general one's flat cyan
    // and royal blue shards (viewer hatprint.js).
    'hat': {'main': '#1b1c1e', 'secondary': '#05c3f2'},
    'hatShards': {
      'main': '#1b1c1e',
      'secondary': '#05c3f2',
      'zoneColors': {'shards': '#03c8f7', 'shardsDeep': '#0065f5'},
    },
    // The Netball dress picture (ND1, as config/catalog.php 'netballDress' and
    // $dressBib): its own Blades (royal blue, azure and cyan ribbons down the
    // sides), bright cyan armhole binding, a black neck; the 3DEEZI mark and
    // wordmark on the chest, a black bib sewn on below with the white position
    // letters, the same on the back; no name or number.
    'netballDress': {
      'main': '#1b1d20',
      'secondary': '#00ccff',
      'accent': '#00d0ff',
      'pattern': 'Blades',
      'patternColor': '#0458f0',
      'parts': {
        'sides': {'colour': '#1b1d20', 'pattern': 'Blades'},
        'collar': {'colour': '#1b1d20'},
      },
      'marks': {
        'top_name': {'hidden': true},
        'top_number': {'hidden': true},
      },
      'layers': [
        for (final side in const ['front', 'back'])
          {
            'id': side == 'front' ? 'tile-bib' : 'tile-bib-back',
            'name': 'Position bib',
            'type': 'shape',
            'part': 'top',
            'side': side,
            'x': 0,
            'y': side == 'front' ? 0.491 : 0.501,
            'shape': 'rectangle',
            'w': 0.218,
            'h': 0.213,
            'color': '#212326',
          },
        for (final side in const ['front', 'back'])
          {
            'id': side == 'front' ? 'tile-position' : 'tile-position-back',
            'name': 'Position',
            'type': 'text',
            'part': 'top',
            'side': side,
            'x': 0,
            'y': side == 'front' ? 0.464 : 0.474,
            'text': 'WA',
            'size': 0.185,
            'color': '#ffffff',
          },
      ],
    },
  };
  return {
    'main': '#27282a',
    'secondary': cyan,
    'accent': cyan,
    'pattern': 'None',
    'patternColor': cyan,
    'patternColorOwn': true,
    'zones': <String, String>{},
    'number': '23',
    'marks': <String, dynamic>{},
    'zoneColors': <String, String>{},
    'layers': _tileObjects(picture),
    ...?looks[name],
    // A bib's position letters stand alone (as config/catalog.php $letters),
    // unless the look sets its own marks (the netball dress keeps its logo).
    if (looks[name]?['marks'] == null &&
        _tileObjects(picture).any((l) => l['id'] == 'tile-position'))
      'marks': {
        for (final k in const [
          'top_wordmark',
          'top_crest',
          'top_name',
          'top_number',
        ])
          k: {'hidden': true},
      },
    // The Compression Top picture: the crest at its own place, stacked over
    // the wordmark (as config/catalog.php $sleeveThree), so the Game Jersey
    // tile's small high crest does not stay on.
    if (picture == 'nfl-compression-top') ...{
      'marks': <String, dynamic>{
        'top_crest': {'scale': 1},
      },
      // Its colours sampled from the picture (as config/catalog.php
      // $sleeveThree): deep azure panels, the brighter cyan piping.
      'secondary': '#008ad8',
      'accent': '#008ad8',
      'patternColor': '#008ad8',
      'zoneColors': <String, String>{'piping': '#00c4f0'},
    },
  };
}

const _sportTiles = <String, List<GarmentTile>>{
  'rugby-league': [
    GarmentTile(
      'Rugby League Kit',
      'Jersey, playing shorts and socks.',
      'Full Kit',
      image: 'rugby-kit',
    ),
    GarmentTile(
      'Jersey',
      'Performance rugby league jersey.',
      'Jersey',
      image: 'rugby-jersey',
    ),
    GarmentTile(
      'Playing Shorts',
      'Durable rugby league shorts.',
      'Shorts',
      image: 'rugby-shorts',
    ),
    GarmentTile(
      'Socks',
      'Knee-high match socks.',
      'Socks',
      image: 'rugby-socks',
    ),
    GarmentTile(
      'Polo',
      'Smart team polo with collar.',
      'Polo',
      image: 'rugby-polo',
    ),
    GarmentTile(
      'Training Tee',
      'Breathable tee for training.',
      'Training Tee',
      image: 'rugby-tee',
    ),
    GarmentTile(
      'Training Shorts',
      'Lightweight shorts with zip pockets.',
      'Shorts',
      image: 'rugby-training-shorts',
    ),
    GarmentTile.nearest(
      'Hooded Tracksuit',
      'Full-zip jacket with hood and pants.',
      'Track jacket',
      future: 'tracksuit',
      image: 'rugby-hooded-tracksuit',
      trackStyle: 'hood',
    ),
    GarmentTile('Cap', 'Curved brim sports cap.', 'Cap', image: 'rugby-cap'),
    GarmentTile(
      'Bucket Hat',
      'Wide brim bucket hat.',
      'Bucket hat',
      image: 'rugby-bucket-hat',
    ),
    GarmentTile.nearest(
      'Waterproof Jacket',
      'Weatherproof jacket with hood.',
      'Track jacket',
      future: 'waterproof-jacket',
      image: 'rugby-waterproof-jacket',
      trackStyle: 'hood',
    ),
  ],
  'rugby-union': [
    GarmentTile(
      'Rugby Kit',
      'Jersey, playing shorts and socks.',
      'Full Kit',
      image: 'rugby-kit',
    ),
    GarmentTile(
      'Jersey',
      'Performance rugby jersey.',
      'Jersey',
      image: 'rugby-jersey',
    ),
    GarmentTile(
      'Playing Shorts',
      'Durable rugby shorts.',
      'Shorts',
      image: 'rugby-shorts',
    ),
    GarmentTile(
      'Socks',
      'Knee-high match socks.',
      'Socks',
      image: 'rugby-socks',
    ),
    GarmentTile(
      'Polo',
      'Smart team polo with collar.',
      'Polo',
      image: 'rugby-polo',
    ),
    GarmentTile(
      'Training Tee',
      'Breathable tee for training.',
      'Training Tee',
      image: 'rugby-tee',
    ),
    GarmentTile(
      'Training Shorts',
      'Lightweight shorts with zip pockets.',
      'Shorts',
      image: 'rugby-training-shorts',
    ),
    GarmentTile.nearest(
      'Hooded Tracksuit',
      'Full-zip jacket with hood and pants.',
      'Track jacket',
      future: 'tracksuit',
      image: 'rugby-hooded-tracksuit',
      trackStyle: 'hood',
    ),
    GarmentTile('Cap', 'Curved brim sports cap.', 'Cap', image: 'rugby-cap'),
    GarmentTile(
      'Bucket Hat',
      'Wide brim bucket hat.',
      'Bucket hat',
      image: 'rugby-bucket-hat',
    ),
    GarmentTile.nearest(
      'Waterproof Jacket',
      'Weatherproof jacket with hood.',
      'Track jacket',
      future: 'waterproof-jacket',
      image: 'rugby-waterproof-jacket',
      trackStyle: 'hood',
    ),
  ],
  'football': [
    GarmentTile(
      'Football jersey',
      'Lightweight match shirt for the pitch.',
      'Jersey',
    ),
    GarmentTile(
      'Football shorts',
      'Light shorts that move with you.',
      'Shorts',
    ),
    GarmentTile('Full kit', 'Shirt and shorts, designed together.', 'Full Kit'),
    GarmentTile(
      'Training tee',
      'Breathable tee for training and warm-ups.',
      'Training Tee',
    ),
    GarmentTile.nearest(
      'Training bibs',
      'Pull-over bibs for drills and small-sided games.',
      'Singlet',
      future: 'bibs',
      image: 'bibs',
    ),
    GarmentTile('Club polo', 'Smart polo for coaches and travel.', 'Polo'),
    GarmentTile(
      'Track jacket',
      'Full-zip jacket for the bench and travel.',
      'Track jacket',
    ),
    GarmentTile('Football socks', 'Match socks with team bands.', 'Socks'),
  ],
  'basketball': [
    GarmentTile(
      'Basketball singlet',
      'Game singlet with a big number.',
      'Singlet',
    ),
    GarmentTile(
      'Basketball shorts',
      'Long, loose game shorts.',
      'Shorts',
      image: 'basketball-shorts',
    ),
    GarmentTile(
      'Shooting shirt',
      'Warm-up shirt for the shoot-around.',
      'Shooting shirt',
    ),
    GarmentTile(
      'Reversible training singlet',
      'Light singlet for practice games.',
      'Singlet',
    ),
    GarmentTile(
      'Training tee',
      'Breathable tee for training and warm-ups.',
      'Training Tee',
    ),
    GarmentTile(
      'Warm-up hoodie',
      'Warm hoodie for the bench and travel.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile.nearest(
      'Tracksuit',
      'Full-zip jacket and matching pants.',
      'Track jacket',
      future: 'tracksuit',
      image: 'tracksuit',
    ),
    GarmentTile(
      'Varsity jacket',
      'Letterman jacket for the team.',
      'Varsity jacket',
    ),
  ],
  'netball': [
    // Its own 3D garment since 2026-10-26 (task 9.126).
    GarmentTile(
      'Netball dress',
      'Fitted netball dress with skirt hem.',
      'Netball dress',
      image: 'netball-dress',
      look: 'netballDress',
    ),
    GarmentTile(
      'Netball skirt',
      'Athletic skirt with team styling.',
      'Skirt',
      image: 'netball-skirt',
    ),
    GarmentTile(
      'Singlet with bib',
      'Netball singlet with removable bib.',
      'Singlet',
      image: 'netball-singlet-bib',
    ),
    GarmentTile(
      'Training singlet',
      'Lightweight top for training.',
      'Singlet',
      image: 'netball-training-singlet',
    ),
    GarmentTile(
      'Training T-shirt',
      'Breathable tee for training and warm-ups.',
      'Training Tee',
      image: 'netball-tee',
    ),
    GarmentTile.nearest(
      'Netball bibs',
      'Pullover bibs with position patches.',
      'Singlet',
      future: 'bibs',
      image: 'netball-bibs',
    ),
    GarmentTile.nearest(
      'Tracksuit',
      'Full-zip jacket and matching pants.',
      'Track jacket',
      future: 'tracksuit',
      image: 'netball-tracksuit',
    ),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for on and off court.',
      'Hoodie',
      image: 'netball-hoodie',
    ),
  ],
  'afl': [
    GarmentTile.nearest(
      'AFL guernsey',
      'Sleeveless match guernsey with your number.',
      'Singlet',
      future: 'guernsey',
      image: 'afl-guernsey',
    ),
    GarmentTile('AFL shorts', 'Footy shorts for the contest.', 'Shorts'),
    GarmentTile(
      'Training singlet',
      'Lightweight singlet for the track.',
      'Singlet',
    ),
    GarmentTile(
      'Training tee',
      'Breathable tee for training and warm-ups.',
      'Training Tee',
    ),
    GarmentTile('Club polo', 'Smart polo for match day and travel.', 'Polo'),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for the bench and the stands.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile(
      'Track jacket',
      'Full-zip jacket for the sideline.',
      'Track jacket',
    ),
    GarmentTile('Footy socks', 'Match socks with team bands.', 'Socks'),
  ],
  'hockey': [
    GarmentTile('Hockey jersey', 'Match shirt in your team colours.', 'Jersey'),
    GarmentTile('Hockey shorts', 'Light shorts for fast play.', 'Shorts'),
    GarmentTile(
      'Hockey skort',
      'A-line skirt with side panels.',
      'Skirt',
      image: 'netball-skirt',
    ),
    GarmentTile(
      'Training tee',
      'Breathable tee for training and warm-ups.',
      'Training Tee',
    ),
    GarmentTile('Club polo', 'Smart polo for coaches and travel.', 'Polo'),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for the dugout and travel.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile(
      'Track jacket',
      'Full-zip jacket for the sideline.',
      'Track jacket',
    ),
    GarmentTile('Hockey socks', 'Long socks with team bands.', 'Socks'),
  ],
  // The client's own list, words and pictures (images/165.jpg, 16 tiles,
  // names only; garment-nfl-*.webp).
  'american-football': [
    GarmentTile.nearest(
      'Game Kit',
      'Game jersey, pants and socks.',
      'Full Kit',
      future: 'nfl-kit',
      image: 'nfl-kit',
    ),
    GarmentTile(
      'Game Jersey',
      'Shoulder-pad cut with big numbers.',
      'Football jersey',
      image: 'nfl-jersey',
      fabric: 'Standard',
      look: 'nflgameJersey',
    ),
    GarmentTile.soon(
      'Game Pants',
      'Game pants with belt and knee pads.',
      'nfl-pants',
      'nfl-pants',
    ),
    GarmentTile(
      'Practice Jersey',
      'Mesh jersey for practice days.',
      'Football jersey',
      image: 'nfl-practice-jersey',
      fabric: 'Mesh',
      look: 'nflpracticeJersey',
    ),
    GarmentTile(
      'Training Tee',
      'Breathable tee for training.',
      'Training Tee',
      image: 'nfl-tee',
    ),
    GarmentTile(
      'Training Shorts',
      'Lightweight shorts for practice.',
      'Shorts',
      image: 'nfl-training-shorts',
    ),
    GarmentTile(
      'Compression Top',
      'Long-sleeve base layer under the pads.',
      'Compression top',
      image: 'nfl-compression-top',
      look: 'sides',
    ),
    GarmentTile.soon(
      'Compression Shorts',
      'Supportive base layer shorts.',
      'compression-shorts',
      'nfl-compression-shorts',
    ),
    GarmentTile(
      'Game Socks',
      'Knee-high socks with team hoops.',
      'Socks',
      image: 'nfl-socks',
    ),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for the sideline.',
      'Hoodie',
      image: 'nfl-hoodie',
    ),
    GarmentTile(
      'Varsity Jacket',
      'Letterman jacket for the team.',
      'Varsity jacket',
      image: 'nfl-varsity',
    ),
    GarmentTile.nearest(
      'Hooded Tracksuit',
      'Full-zip jacket with hood and pants.',
      'Track jacket',
      future: 'tracksuit',
      image: 'nfl-hooded-tracksuit',
      trackStyle: 'hood',
    ),
    GarmentTile.nearest(
      'Waterproof Jacket',
      'Weatherproof jacket with hood.',
      'Track jacket',
      future: 'waterproof-jacket',
      image: 'nfl-waterproof-jacket',
      trackStyle: 'hood',
    ),
    GarmentTile('Cap', 'Curved brim sports cap.', 'Cap', image: 'nfl-cap'),
    GarmentTile(
      'Bucket Hat',
      'Wide brim bucket hat.',
      'Bucket hat',
      image: 'nfl-bucket-hat',
    ),
    GarmentTile.soon(
      'Beanie',
      'Knitted beanie with a cuff.',
      'beanie',
      'nfl-beanie',
    ),
  ],
  'golf': [
    GarmentTile('Golf polo', 'Premium fitted polo for every round.', 'Polo'),
    GarmentTile('Golf tee', 'Soft tee for the range.', 'Training Tee'),
    GarmentTile(
      'Clubhouse hoodie',
      'Warm hoodie for after the round.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile(
      'Zip hoodie',
      'Full-zip layer for cool mornings.',
      'Zip hoodie',
    ),
    GarmentTile('Golf cap', 'Cap with an embroidered club logo.', 'Cap'),
    GarmentTile('Bucket hat', 'Sun-smart hat for the course.', 'Bucket hat'),
  ],
  'tennis': [
    GarmentTile(
      'Tennis polo',
      'Crisp performance polo for match play.',
      'Polo',
    ),
    GarmentTile(
      'Tennis tee',
      'Light crew tee for every rally.',
      'Training Tee',
    ),
    GarmentTile('Tennis singlet', 'Sleeveless top for hot days.', 'Singlet'),
    GarmentTile('Tennis shorts', 'Light shorts with room to move.', 'Shorts'),
    GarmentTile.nearest(
      'Tennis dress',
      'Fitted dress with a flared hem.',
      'Singlet',
      future: 'dress',
      image: 'netball-dress',
    ),
    GarmentTile(
      'Tennis skirt',
      'A-line skirt with side panels.',
      'Skirt',
      image: 'netball-skirt',
    ),
    GarmentTile(
      'Track jacket',
      'Full-zip jacket for warm-ups.',
      'Track jacket',
    ),
    GarmentTile('Cap', 'Sun cap with your club logo.', 'Cap'),
  ],
  'athletics': [
    GarmentTile(
      'Racing singlet',
      'Featherweight singlet for race day.',
      'Singlet',
    ),
    GarmentTile('Running shorts', 'Split shorts built for speed.', 'Shorts'),
    GarmentTile(
      'Training tee',
      'Breathable tee for training and warm-ups.',
      'Training Tee',
    ),
    GarmentTile.soon(
      'Running tights',
      'Long, 3/4 or short compression tights.',
      'tights',
      'leggings',
    ),
    GarmentTile(
      'Track jacket',
      'Full-zip jacket for warm-ups.',
      'Track jacket',
    ),
    GarmentTile.soon(
      'Track pants',
      'Tapered pants to match the jacket.',
      'track-pants',
      'track-pants',
    ),
    GarmentTile(
      'Hoodie',
      'Warm hoodie between events.',
      'Hoodie',
      image: 'team-hoodie',
    ),
  ],
  'swimming': [
    GarmentTile('Club tee', 'Soft tee for the pool deck.', 'Training Tee'),
    GarmentTile.nearest(
      'Rash guard',
      'Sun-smart stretch top for the water.',
      'Training Tee',
      future: 'rashguard',
      image: 'rash-guard',
    ),
    GarmentTile('Club singlet', 'Light singlet for squad training.', 'Singlet'),
    GarmentTile('Deck shorts', 'Quick-dry shorts for the pool deck.', 'Shorts'),
    GarmentTile(
      'Club hoodie',
      'Warm hoodie between races.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Zip hoodie', 'Full-zip layer for early starts.', 'Zip hoodie'),
    GarmentTile('Deck polo', 'Smart polo for coaches and officials.', 'Polo'),
  ],
  'darts': [
    GarmentTile(
      'Darts shirt',
      'Polo with a chest pocket and your name on the back.',
      'Polo with pocket',
    ),
    GarmentTile('Pool polo', 'Sublimated polo for league nights.', 'Polo'),
    GarmentTile('Team tee', 'Soft tee for the team.', 'Training Tee'),
    GarmentTile(
      'Team hoodie',
      'Warm hoodie for the walk-on.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Zip hoodie', 'Full-zip layer for travel.', 'Zip hoodie'),
    GarmentTile('Cap', 'Team cap with an embroidered logo.', 'Cap'),
  ],
  'touch': [
    GarmentTile(
      'Touch tee',
      'Light raglan tee for fast games.',
      'Training Tee',
    ),
    GarmentTile('Touch singlet', 'Sleeveless top for hot days.', 'Singlet'),
    GarmentTile('Touch shorts', 'Light shorts that move with you.', 'Shorts'),
    GarmentTile(
      'Full kit',
      'Jersey and shorts, designed together.',
      'Full Kit',
    ),
    GarmentTile('Club polo', 'Smart polo for the team.', 'Polo'),
    GarmentTile(
      'Hoodie',
      'Warm hoodie between games.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile(
      'Track jacket',
      'Full-zip jacket for the sideline.',
      'Track jacket',
    ),
  ],
  'cricket': [
    GarmentTile.nearest(
      'Cricket shirt',
      'One-day shirt with a polo collar.',
      'Polo',
      future: 'cricket-shirt',
    ),
    GarmentTile.soon(
      'Cricket pants',
      'Matching long trousers.',
      'cricket-pants',
      'track-pants',
    ),
    GarmentTile('Training tee', 'Breathable tee for the nets.', 'Training Tee'),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for the rooms.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Track jacket', 'Full-zip jacket for travel.', 'Track jacket'),
    GarmentTile('Cricket cap', 'Cap in your club colours.', 'Cap'),
    GarmentTile('Bucket hat', 'Wide-brim hat for the field.', 'Bucket hat'),
  ],
  'softball': [
    GarmentTile.nearest(
      'Softball jersey',
      'Button-front jersey with script lettering.',
      'Jersey',
      future: 'softball-jersey',
    ),
    GarmentTile('Training tee', 'Breathable tee for practice.', 'Training Tee'),
    GarmentTile('Club polo', 'Smart polo for coaches.', 'Polo'),
    GarmentTile('Training shorts', 'Light shorts for practice.', 'Shorts'),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for the dugout.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile(
      'Varsity jacket',
      'Letterman jacket for the team.',
      'Varsity jacket',
    ),
    GarmentTile('Cap', 'Ball cap with your team logo.', 'Cap'),
  ],
  'volleyball': [
    GarmentTile(
      'Volleyball jersey',
      'Fitted jersey with a big number.',
      'Jersey',
    ),
    GarmentTile(
      'Volleyball singlet',
      'Sleeveless top for beach and indoor.',
      'Singlet',
    ),
    GarmentTile('Volleyball shorts', 'Short shorts for the court.', 'Shorts'),
    GarmentTile(
      'Full kit',
      'Jersey and shorts, designed together.',
      'Full Kit',
    ),
    GarmentTile('Training tee', 'Breathable tee for training.', 'Training Tee'),
    GarmentTile(
      'Hoodie',
      'Warm hoodie between sets.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Track jacket', 'Full-zip jacket for travel.', 'Track jacket'),
  ],
  'lacrosse': [
    GarmentTile.nearest(
      'Lacrosse pinnie',
      'Loose sleeveless pinnie with a big number.',
      'Singlet',
      future: 'pinnie',
    ),
    GarmentTile(
      'Lacrosse shorts',
      'Long shorts for the fastest game on feet.',
      'Shorts',
    ),
    GarmentTile('Game jersey', 'Match jersey in your colours.', 'Jersey'),
    GarmentTile(
      'Full kit',
      'Jersey and shorts, designed together.',
      'Full Kit',
    ),
    GarmentTile('Training tee', 'Breathable tee for training.', 'Training Tee'),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for the sideline.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Track jacket', 'Full-zip jacket for travel.', 'Track jacket'),
  ],
  'cycling': [
    GarmentTile.nearest(
      'Cycling jersey',
      'Close-fitting jersey with rear pockets.',
      'Jersey',
      future: 'cycling-jersey',
    ),
    GarmentTile.soon(
      'Bib shorts',
      'Padded bib shorts for the long ride.',
      'bib-shorts',
      'bib-shorts',
    ),
    GarmentTile('Race singlet', 'Sleeveless top for hot rides.', 'Singlet'),
    GarmentTile('Club tee', 'Soft tee for the café stop.', 'Training Tee'),
    GarmentTile('Club polo', 'Smart polo for the club.', 'Polo'),
    GarmentTile(
      'Club jacket',
      'Full-zip jacket for cool starts.',
      'Track jacket',
    ),
    GarmentTile('Cycling cap', 'Cotton cap with a short peak.', 'Cap'),
  ],
  'bmx': [
    GarmentTile.nearest(
      'Race jersey',
      'Loose long-sleeve jersey with bold graphics.',
      'Jersey',
      future: 'bmx-jersey',
    ),
    GarmentTile.soon(
      'Race pants',
      'Vented pants for the track.',
      'race-pants',
      'track-pants',
    ),
    GarmentTile(
      'Full kit',
      'Jersey and shorts, designed together.',
      'Full Kit',
    ),
    GarmentTile('Team tee', 'Soft tee for the pits.', 'Training Tee'),
    GarmentTile(
      'Hoodie',
      'Warm hoodie between motos.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Zip hoodie', 'Full-zip layer for travel.', 'Zip hoodie'),
    GarmentTile('Cap', 'Team cap with an embroidered logo.', 'Cap'),
  ],
  'lawn-bowls': [
    GarmentTile('Bowls polo', 'Smart club polo for the green.', 'Polo'),
    GarmentTile(
      'Polo with pocket',
      'Club polo with a chest pocket.',
      'Polo with pocket',
    ),
    GarmentTile('Club tee', 'Soft tee for social bowls.', 'Training Tee'),
    GarmentTile(
      'Club hoodie',
      'Warm hoodie for cool evenings.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile(
      'Club jacket',
      'Full-zip jacket for the green.',
      'Track jacket',
    ),
    GarmentTile('Bucket hat', 'Sun-smart hat for the green.', 'Bucket hat'),
  ],
  'esports': [
    GarmentTile(
      'Esports jersey',
      'Pro jersey with your tag on the back.',
      'Jersey',
    ),
    GarmentTile('Team tee', 'Soft tee for the team.', 'Training Tee'),
    GarmentTile('Team polo', 'Smart polo for events.', 'Polo'),
    GarmentTile(
      'Team hoodie',
      'Warm hoodie for long sessions.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Zip hoodie', 'Full-zip layer for the stage.', 'Zip hoodie'),
    GarmentTile(
      'Varsity jacket',
      'Letterman jacket for the roster.',
      'Varsity jacket',
    ),
    GarmentTile('Cap', 'Team cap with an embroidered logo.', 'Cap'),
  ],
  'training': [
    GarmentTile(
      'Training tee',
      'Breathable tee for every session.',
      'Training Tee',
    ),
    GarmentTile(
      'Training singlet',
      'Lightweight singlet for hot sessions.',
      'Singlet',
    ),
    GarmentTile(
      'Training shorts',
      'Light shorts that move with you.',
      'Shorts',
    ),
    GarmentTile('Training polo', 'Smart polo for coaches and staff.', 'Polo'),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for warm-ups and travel.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Zip hoodie', 'Full-zip layer for warm-ups.', 'Zip hoodie'),
    GarmentTile(
      'Track jacket',
      'Full-zip jacket for warm-ups and travel.',
      'Track jacket',
    ),
    GarmentTile(
      'Varsity jacket',
      'Letterman jacket for the team.',
      'Varsity jacket',
    ),
  ],
  'fight-wear': [
    GarmentTile.nearest(
      'Rash guard',
      'Compression top for the mat.',
      'Training Tee',
      future: 'rashguard',
      image: 'rash-guard',
    ),
    GarmentTile.nearest(
      'Fight shorts',
      'Fight cut with side splits.',
      'Shorts',
      future: 'fight-shorts',
      image: 'fight-shorts',
    ),
    GarmentTile('Training tee', 'Breathable tee for the gym.', 'Training Tee'),
    GarmentTile(
      'Training singlet',
      'Lightweight singlet for conditioning.',
      'Singlet',
    ),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for the walk-out.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Zip hoodie', 'Full-zip layer for weigh-ins.', 'Zip hoodie'),
    GarmentTile(
      'Corner jacket',
      'Full-zip jacket for the team.',
      'Track jacket',
    ),
    GarmentTile.soon(
      'Compression spats',
      'Compression tights for grappling.',
      'tights',
      'leggings',
    ),
  ],
  'fishing': [
    GarmentTile.nearest(
      'Fishing shirt',
      'Light sun-smart shirt with ocean graphics.',
      'Jersey',
      future: 'fishing-shirt',
    ),
    GarmentTile(
      'Fishing polo',
      'Smart polo for the club and the boat.',
      'Polo',
    ),
    GarmentTile('Fishing tee', 'Soft tee for the beach.', 'Training Tee'),
    GarmentTile(
      'Fishing hoodie',
      'Warm hoodie for early starts.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Boat shorts', 'Quick-dry shorts for the boat.', 'Shorts'),
    GarmentTile('Bucket hat', 'Sun-smart hat with a wide brim.', 'Bucket hat'),
    GarmentTile('Cap', 'Cap with your club logo.', 'Cap'),
  ],
  'workwear': [
    GarmentTile('Hi-vis polo', 'Fluoro polo with your business logo.', 'Polo'),
    GarmentTile(
      'Work polo with pocket',
      'Hard-wearing polo with a chest pocket.',
      'Polo with pocket',
    ),
    GarmentTile('Work tee', 'Tough tee for every job.', 'Training Tee'),
    GarmentTile.nearest(
      'Work shirt',
      'Long-sleeve work shirt with your logo.',
      'Jersey',
      future: 'work-shirt',
    ),
    GarmentTile(
      'Work hoodie',
      'Warm hoodie for cold sites.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Zip hoodie', 'Full-zip layer for the yard.', 'Zip hoodie'),
    GarmentTile('Work shorts', 'Hard-wearing shorts for the job.', 'Shorts'),
    GarmentTile('Cap', 'Work cap with your business logo.', 'Cap'),
  ],
  'gymwear': [
    GarmentTile('Muscle singlet', 'Muscle-fit singlet for lifting.', 'Singlet'),
    GarmentTile('Gym tee', 'Fitted tee for every session.', 'Training Tee'),
    GarmentTile('Gym shorts', 'Light shorts for training.', 'Shorts'),
    GarmentTile.soon(
      'Leggings',
      'Squat-proof leggings and tights.',
      'tights',
      'leggings',
    ),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for warm-ups.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Zip hoodie', 'Full-zip layer for the gym.', 'Zip hoodie'),
    GarmentTile(
      'Track jacket',
      'Full-zip jacket for warm-ups.',
      'Track jacket',
    ),
    GarmentTile.soon(
      'Track pants',
      'Tapered pants to match the jacket.',
      'track-pants',
      'track-pants',
    ),
  ],
  'teamwear': [
    GarmentTile('Club polo', 'Smart polo with your crest.', 'Polo'),
    GarmentTile('Club tee', 'Soft tee for the clubhouse.', 'Training Tee'),
    GarmentTile('Club shorts', 'Casual shorts for travel.', 'Shorts'),
    GarmentTile(
      'Club hoodie',
      'Warm hoodie for the sideline.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Zip hoodie', 'Full-zip layer for travel.', 'Zip hoodie'),
    GarmentTile(
      'Varsity jacket',
      'Letterman jacket for the club.',
      'Varsity jacket',
    ),
    GarmentTile('Track jacket', 'Full-zip jacket for travel.', 'Track jacket'),
    GarmentTile('Club cap', 'Cap with your club crest.', 'Cap'),
  ],
  'school-leavers': [
    GarmentTile.nearest(
      'Leavers jersey',
      'Rugby-collar jersey with every name on it.',
      'Jersey',
      future: 'leavers-jersey',
    ),
    GarmentTile(
      'Leavers hoodie',
      'Your year, big on the back.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Zip hoodie', 'Full-zip hoodie with your year.', 'Zip hoodie'),
    GarmentTile(
      'Varsity jacket',
      'Letterman jacket for your year.',
      'Varsity jacket',
    ),
    GarmentTile('Leavers polo', 'Smart polo with your year.', 'Polo'),
    GarmentTile('Leavers tee', 'Soft tee with every name.', 'Training Tee'),
    GarmentTile(
      'Track jacket',
      'Full-zip jacket with your year.',
      'Track jacket',
    ),
  ],
};

const sportCategories = <SportCategory>[
  SportCategory(
    'rugby-league',
    'Rugby League',
    'sports',
    'Jersey + Shorts',
    more: false,
  ),
  SportCategory('basketball', 'Basketball', 'sports', 'Singlet + Shorts'),
  SportCategory('football', 'Soccer', 'sports', 'Jersey + Shorts'),
  SportCategory('afl', 'AFL', 'sports', 'Guernsey + Shorts'),
  // No player names or numbers: bibs carry the playing position letters.
  SportCategory(
    'netball',
    'Netball',
    'sports',
    'Dress + Bodysuit',
    names: false,
    numbers: false,
    positions: ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'],
  ),
  SportCategory(
    'rugby-union',
    'Rugby Union',
    'sports',
    'Jersey + Shorts',
    heading: 'Rugby',
    more: false,
  ),
  SportCategory(
    'hockey',
    'Ice Hockey',
    'sports',
    'Jersey + Socks',
    aiLabel: 'Hockey',
  ),
  // Added 2026-10-21 (task 9.79). The client's first six come first.
  SportCategory(
    'american-football',
    'American Football',
    'sports',
    'Jersey + Pants',
    hint:
        'American football: a short-sleeve jersey cut wide over the shoulder '
        'pads, big block numbers on the front, back and sleeves, sleeve stripes',
    subtitle: 'Choose your game uniform, practice wear or sideline apparel.',
    selectHint: 'Select a garment to customise.',
    descriptions: false,
    backdrop: 'stage-american-football',
    more: false,
  ),
  SportCategory(
    'golf',
    'Golf',
    'sports',
    'Polo',
    hint:
        'golf: a premium fitted performance polo, clean and understated; a '
        'quarter-zip pullover suits too',
  ),
  SportCategory(
    'tennis',
    'Tennis',
    'sports',
    'Polo + Shorts',
    hint:
        "tennis: a crisp performance polo or crew tee with shorts; a skirt or "
        "dress for women's kits",
  ),
  SportCategory(
    'athletics',
    'Athletics',
    'sports',
    'Singlet + Shorts',
    hint:
        'athletics and running: a racing singlet with split shorts; a crop top '
        'for women',
  ),
  SportCategory(
    'swimming',
    'Swimming',
    'sports',
    'Deck coat + Tee',
    hint:
        'swimming: club deck apparel (tees, hoodies, parka-style deck coats) '
        'with swim caps in the club colours',
  ),
  SportCategory(
    'darts',
    'Darts & Pool',
    'sports',
    'Polo with pocket',
    hint:
        "darts and pool: a sublimated polo with a chest pocket, the player's "
        'name across the back shoulders and sponsors on the back and sleeves',
  ),
  SportCategory(
    'touch',
    'Touch',
    'sports',
    'Tee + Shorts',
    hint:
        'Touch football and Oztag: a lightweight raglan tee or singlet with '
        'shorts',
  ),
  SportCategory(
    'cricket',
    'Cricket',
    'sports',
    'Shirt + Trousers',
    hint:
        'cricket: a one-day cricket shirt with a polo collar (short or long '
        'sleeves) and matching long trousers; whites for the long format',
  ),
  SportCategory(
    'softball',
    'Softball',
    'sports',
    'Jersey + Pants',
    hint:
        'softball and baseball: a full button-front jersey (or a two-button '
        'henley with raglan sleeves), pinstripes allowed, script team name '
        'across the chest',
  ),
  SportCategory(
    'volleyball',
    'Volleyball',
    'sports',
    'Jersey + Shorts',
    hint:
        'volleyball: a fitted short-sleeve or sleeveless jersey with a big '
        'number, short shorts',
  ),
  SportCategory(
    'lacrosse',
    'Lacrosse',
    'sports',
    'Pinnie + Shorts',
    hint:
        'lacrosse: a loose sleeveless pinnie with a big number, long lacrosse '
        'shorts',
  ),
  SportCategory(
    'cycling',
    'Cycling',
    'sports',
    'Jersey + Bibs',
    hint:
        'cycling: a close-fitting full-zip cycling jersey with rear pockets, '
        'bib shorts',
  ),
  SportCategory(
    'bmx',
    'BMX',
    'sports',
    'Jersey + Pants',
    hint:
        'BMX and motocross: a loose long-sleeve V-neck race jersey with bold '
        'graphics, vented race pants',
  ),
  SportCategory(
    'lawn-bowls',
    'Lawn Bowls',
    'sports',
    'Club polo',
    hint:
        'lawn bowls: a smart club polo with a collar, light sublimated '
        'patterns',
  ),
  SportCategory(
    'esports',
    'Esports',
    'sports',
    'Gaming jersey',
    hint:
        'esports: a pro gaming jersey with sharp sublimated graphics, sponsor '
        'patches and the gamer tag across the back',
  ),
  SportCategory(
    'training',
    'Training / Gym',
    'apparel',
    'Tee + Hoodie',
    aiLabel: 'Training',
  ),
  SportCategory(
    'fight-wear',
    'Fight Wear',
    'apparel',
    'Rash guard + Fight shorts',
    hint:
        'fight wear (MMA, boxing, BJJ, Muay Thai): a compression rash guard '
        'and fight shorts with side splits',
  ),
  SportCategory(
    'fishing',
    'Fishing',
    'apparel',
    'Fishing shirt',
    hint:
        'fishing: a lightweight long-sleeve fishing shirt with a zip or button '
        'collar or a hood, ocean graphics',
  ),
  SportCategory(
    'workwear',
    'Workwear',
    'apparel',
    'Hi-vis shirt + Pants',
    hint:
        'workwear and hi-vis: a fluoro work shirt or polo with reflective tape '
        'bands and the business logo',
  ),
  SportCategory(
    'gymwear',
    'Gymwear',
    'apparel',
    'Singlet + Shorts',
    hint:
        'gym and fitness wear: a muscle-fit singlet or tee with training '
        'shorts',
  ),
  SportCategory(
    'teamwear',
    'Club Casual',
    'apparel',
    'Club polo + Shorts',
    hint:
        'club casual teamwear: a smart club polo or tee with an embroidered '
        'crest',
  ),
  SportCategory(
    'school-leavers',
    'School Leavers',
    'apparel',
    'Leavers jersey',
    hint:
        'school leavers: a long-sleeve rugby-collar jersey with the class year '
        "big on the front or back and every student's name",
  ),
];

/// The category with the app name [name], if any.
SportCategory? sportNamed(String? name) {
  for (final s in sportCategories) {
    if (s.name == name) return s;
  }
  return null;
}

/// The category with the website id [id], if any.
SportCategory? sportWithId(String? id) {
  for (final s in sportCategories) {
    if (s.id == id) return s;
  }
  return null;
}

/// The sport as the AI prompts name it (with its style hint when it has one).
String sportForAi(String name) => sportNamed(name)?.forAi ?? name;

/// The back name and number when a kit's sport changes from [from] to [to]
/// (client 2026-10-26: "netball you don't have numbers or names"; the
/// website's backForSport): a sport without player names / numbers drops
/// the sample ones ([sampleName], the kit's wordmark, and [sampleNumber]),
/// anything typed stays; leaving such a sport gives an empty back the
/// samples again. Other sports keep theirs.
({String backName, String number}) backForSport(
  String from,
  String to, {
  required String backName,
  required String number,
  required String sampleName,
  String sampleNumber = '23',
}) {
  final was = sportNamed(from), now = sportNamed(to);
  var name = backName, no = number;
  if (now?.names == false && name == sampleName) name = '';
  if (now?.numbers == false && no == sampleNumber) no = '';
  if (now != null && now.names && was?.names == false && name.isEmpty) {
    name = sampleName;
  }
  if (now != null && now.numbers && was?.numbers == false && no.isEmpty) {
    no = sampleNumber;
  }
  return (backName: name, number: no);
}
