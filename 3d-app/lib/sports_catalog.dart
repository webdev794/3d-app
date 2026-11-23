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
  // The 5-panel cap and the beanie (CP1, client mockup images/296.jpg).
  '5 panel cap': 'five-panel-cap',
  'Beanie': 'beanie',
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
  'rugby-polo': 'poloSleeves',
  'tee': 'teeTile',
  'nfl-tee': 'teeCyan',
  'rugby-tee': 'teeSides',
  'netball-tee': 'teeSidesNetball',
  'shooting-shirt': 'shooting',
  'singlet': 'singletTile',
  'netball-training-singlet': 'bladesSides',
  'afl-guernsey': 'bladesSides',
  'netball-singlet-bib': 'bladesSides',
  'bibs': 'bibs',
  'netball-bibs': 'netballBibs',
  'netball-dress': 'bladesSides',
  'team-hoodie': 'hoodie',
  'nfl-hoodie': 'nflHoodie',
  'netball-hoodie': 'netballHoodie',
  'trackjacket': 'tjModel',
  'netball-tracksuit': 'trackSuit',
  'tracksuit': 'bballTracksuit',
  'rugby-hooded-tracksuit': 'rugbyTracksuit',
  'nfl-hooded-tracksuit': 'nflTracksuit',
  'rugby-waterproof-jacket': 'waterproof',
  'nfl-waterproof-jacket': 'waterproof',
  'nfl-compression-top': 'sides',
  'varsity': 'varsity',
  'nfl-varsity': 'nflVarsity',
  'shorts': 'shortsPlainTile',
  'rugby-shorts': 'rugbyShortsTile',
  'rugby-training-shorts': 'trainingShorts',
  'nfl-training-shorts': 'trainingShorts',
  'socks': 'socksHeel',
  'rugby-socks': 'rugbySocks',
  'nfl-socks': 'gameSocks',
  'cap': 'capSweep',
  'nfl-cap': 'capSweep',
  'netball-skirt': 'skirt',
  'basketball-shorts': 'bballShorts',
  // (BBTILES 2026-11-18: the Basketball tiles' own pictures on the light
  // backdrop keep their pictures' looks.)
  'bb-shorts': 'bballShorts',
  'bb-shooting-shirt': 'shooting',
  'bb-tee': 'teeTile',
  'bb-hoodie': 'hoodie',
  'bb-tracksuit': 'bballTracksuit',
  'bb-varsity': 'varsity',
  'bucket-hat': 'hatShards',
  'nfl-bucket-hat': 'hat',
  'rugby-bucket-hat': 'hat',
  // (CP1: the beanie and 5-panel cap pictures: black with cyan trims.)
  'beanie': 'hat',
  'nfl-beanie': 'nflBeanie',
  'five-panel-cap': 'hat',
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
    // (The rugby polo picture, as config/catalog.php: MODELQ5 2026-11-19.)
    'poloSleeves': {
      'zones': solid(['sleeves', 'sides']),
      'marks': {
        'top_wordmark': {'scale': 0.55},
      },
    },
    'sleevesOnly': {
      'zones': solid(['sleeves']),
    },
    // The training tee pictures (FN5 2026-10-30, as config/catalog.php): black
    // neck, hem and side seams, the wordmark higher; garment-tee's muted azure
    // sleeves; nfl-tee's cyan sleeves with the "3" centred; rugby-tee and
    // netball-tee's cyan sleeves and side panels.
    // (MODELQ5 2026-11-18: on the training tee's 3D model the wordmark is smaller,
    // scale 0.55, all on the front clear of the side seams; as config/catalog.php.)
    'teeTile': {
      'secondary': '#27282a',
      'patternColor': '#00688a',
      'zones': solid(['sleeves']),
      'zoneColors': {'labelDark': '#2e3034', 'teeLong': '#27282a'},
      'marks': {
        'top_wordmark': {'y': 0.515, 'scale': 0.55},
        'top_crest': {'y': 0.578, 'scale': 0.75},
      },
    },

    'teeCyan': {
      'secondary': '#27282a',
      'patternColor': '#008fdc',
      'zones': solid(['sleeves']),
      'zoneColors': {'labelDark': '#2e3034', 'teeFlare': '#27282a'},
      'marks': {
        'top_wordmark': {'y': 0.5, 'scale': 0.55},
        'top_crest': {'x': 0, 'y': 0.565, 'scale': 0.8},
      },
    },

    'teeSides': {
      'secondary': '#27282a',
      'patternColor': '#008fdc',
      'zones': solid(['sleeves', 'sides']),
      'zoneColors': {'labelDark': '#2e3034', 'teeFlare': '#27282a'},
      'marks': {
        'top_wordmark': {'y': 0.5, 'scale': 0.55},
        'top_crest': {'y': 0.565},
      },
    },
    'teeSidesNetball': {
      'secondary': '#27282a',
      'patternColor': '#008fdc',
      'zones': solid(['sleeves', 'sides']),
      'zoneColors': {
        'labelDark': '#2e3034',
        'teeFlare': '#27282a',
        'teeNetball': '#27282a',
      },
      'marks': {
        'top_wordmark': {'y': 0.5, 'scale': 0.55},
        'top_crest': {'y': 0.565},
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
    // (FX-V 2026-11-02, DT11: the NFL Varsity Jacket picture: a wide, boxy cut
    // with deep striped cuffs and waistband (zoneColors.varsityBoxy) and cyan
    // snaps.)
    'nflVarsity': {
      'accent': '#ffffff',
      'zoneColors': {
        'body': '#1a1e23',
        'sleeves': '#4fb2d0',
        'rib': '#1a1e23',
        'ribStripe': cyan,
        'snaps': cyan,
        'varsityBoxy': '#1a1e23',
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
    // (The Football Full kit: its jersey on the Football jersey's model,
    // football-shirt (flag scJersey): RUGBYV 2026-11-19.)
    'fbKitModel': {
      'secondary': '#27282a',
      'accent': '#76c6ec',
      'patternColor': '#5b98bb',
      'zones': {'yoke': 'Swirl'},
      'zoneColors': {
        'scJersey': '#27282a',
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
    // (MODELQ5 2026-11-19: on the polo's 3D model the wordmark smaller, as
    // config/catalog.php.)
    'poloZip': {
      'main': '#313234',
      'secondary': '#27282a',
      'zoneColors': {'quarterZip': '#c9ccd1', 'collarPiping': cyan},
      // (CLIENT598 2026-11-23, client 617: the approved lockup, the "3"
      // centred over the wordmark, on the right chest; config/catalog.php.)
      'marks': {
        'top_wordmark': {'x': -0.09, 'y': 0.581, 'scale': 0.258},
        'top_crest': {'x': -0.09, 'y': 0.617, 'scale': 0.9},
      },
    },
    'poloZipPocket': {
      'main': '#313234',
      'secondary': '#27282a',
      'zoneColors': {'quarterZip': '#c9ccd1', 'collarPiping': cyan},
      // (CLIENT598 2026-11-23, client 617: the approved lockup, the "3"
      // centred over the wordmark, on the right chest; config/catalog.php.)
      'marks': {
        'top_wordmark': {'x': -0.09, 'y': 0.581, 'scale': 0.258},
        'top_crest': {'x': -0.09, 'y': 0.617, 'scale': 0.9},
      },
    },
    // (CLIENT598 2026-11-23, client: "Polo shirt with zip": the Zip-up collar
    // from the start, the same lockup; config/catalog.php.)
    'poloZipUp': {
      'main': '#313234',
      'secondary': '#27282a',
      'zoneColors': {
        'quarterZip': '#c9ccd1',
        'collarPiping': cyan,
        'poloZip': '#27282a',
      },
      'marks': {
        'top_wordmark': {'x': -0.09, 'y': 0.581, 'scale': 0.258},
        'top_crest': {'x': -0.09, 'y': 0.617, 'scale': 0.9},
      },
    },
    'bladesSides': {
      'pattern': 'Blades',
      'zones': solid(['sides']),
    },
    // The shooting shirt picture (FN5 2026-10-30, colours measured on it): its
    // own 3D shirt, cyan raglan sleeves, royal blue side shards (Shards).
    'shooting': {
      'main': '#232427',
      'secondary': '#00c0f5',
      'accent': '#ffffff',
      'pattern': 'Shards',
      'patternColor': '#0048d8',
      'parts': {
        'leftSleeve': {'colour': '#00b0f0'},
        'rightSleeve': {'colour': '#00b0f0'},
      },
      // FN10 2026-11-02: its own "3" and word places (the word right under
      // the "3"), so the last tile's never carry over.
      'marks': {
        'top_wordmark': {'x': 0.08, 'y': 0.548, 'scale': 0.85},
        'top_crest': {'x': 0.08, 'y': 0.579, 'scale': 1.0},
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
        // (FX-R, DT11: the kit's socks, as the Rugby socks look.)
        'sockToeLine': '#2b91c1',
        'sockMark': '#0a93ee',
      },
      'parts': {
        'shortsSides': {'colour': '#00a2e8'},
        'shortsHem': {'colour': '#27282a'},
        'sockBand': {'colour': '#0b95dd'},
        'sockHoops': {'colour': '#0b95dd'},
        'sockFoot': {'colour': cyan},
      },
      'marks': {
        // (The wordmark a little higher, as the picture's: DT7.)
        'top_wordmark': {'y': 0.505},
        'shorts_number': {'hidden': true},
        'shorts_crest': {'hidden': true},
      },
    },
    // (The Rugby League Kit: rugbyTile + the rugby jersey's model flag, as catalog.php rlKitModel; RUGBYJ 2026-11-18.)
    'rlKitModel': {
      // (A deeper cyan: it renders as saturated as the picture's.)
      'secondary': '#00a2e8',
      'zoneColors': {
        'rugbyJersey': '#00a2e8',
        // (Its socks on the RL socks' own model: MODELQ6 2026-11-19.)
        'rlSocks': '#0a93ee',
        'raglan': '#00a2e8',
        'sweep': '#00a2e8',
        'sweepDeep': '#0262f6',
        // (FX-R, DT11: the kit's socks, as the Rugby socks look.)
        'sockToeLine': '#2b91c1',
        'sockMark': '#0a93ee',
      },
      'parts': {
        'shortsSides': {'colour': '#00a2e8'},
        'shortsHem': {'colour': '#27282a'},
        'sockBand': {'colour': '#0b95dd'},
        'sockHoops': {'colour': '#0b95dd'},
        'sockFoot': {'colour': cyan},
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
    // (FX-R, DT10: the Football and Rugby playing shorts: a rounder, narrower hem, no drawcord.)
    'shortsPlainTile': {
      'secondary': '#00a2e8',
      'zones': solid(['sides']),
      'parts': {
        'waistband': {'colour': '#27282a'},
        'shortsHem': {'colour': '#27282a'},
      },
      'zoneColors': {'cordTips': '#27282a', 'shortsPlain': '#27282a'},
      'marks': {
        'shorts_number': {'hidden': true},
        'shorts_crest': {'x': 0.13, 'y': 0.115, 'scale': 0.85},
      },
    },
    'rugbyShortsTile': {
      'secondary': '#00a2e8',
      'zones': solid(['sides']),
      'parts': {
        'waistband': {'colour': '#27282a'},
        'shortsHem': {'colour': '#27282a'},
      },
      'zoneColors': {
        'cordTips': '#27282a',
        'shortsPlain': '#27282a',
        'shortsNarrow': '#27282a',
      },
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
      'main': '#161616',
      'zoneColors': {'stripe': '#00f6fe'},
      'marks': {
        'top_crest': {'x': 0, 'y': 0.565, 'scale': 0.85},
        'top_wordmark': {'x': 0, 'y': 0.5, 'scale': 0.6},
      },
    },
    // HOODIE 2026-11-19: the Basketball Warm-up hoodie and the Fishing hoodie keep the made hoodie until their own models.
    'bbHoodie': {
      'main': '#161616',
      'zoneColors': {'bballHoodie': '#ffffff', 'stripe': '#00f6fe'},
      'marks': {
        'top_crest': {'x': 0, 'y': 0.565, 'scale': 0.85},
        'top_wordmark': {'x': 0, 'y': 0.5, 'scale': 0.6},
      },
    },
    'fishingHoodie': {
      'main': '#161616',
      'zoneColors': {'hoodedTee': '#ffffff', 'fishingHoodie': '#ffffff', 'stripe': '#00f6fe'},
      'marks': {
        'top_crest': {'x': 0, 'y': 0.565, 'scale': 0.85},
        'top_wordmark': {'x': 0, 'y': 0.5, 'scale': 0.6},
      },
    },
    'nflHoodie': {
      'main': '#161616',
      'zoneColors': {
        'stripe': '#00f6fe',
        'stripeDeep': '#00f6fe',
        'cord': '#00f6fe',
      },
      'marks': {
        'top_crest': {'x': 0, 'y': 0.57, 'scale': 1.05},
        'top_wordmark': {'x': 0, 'y': 0.495, 'scale': 0.78},
      },
    },
    'netballHoodie': {
      'main': '#161616',
      'zoneColors': {
        'stripe': '#00f6fe',
        'stripeDeep': '#00f6fe',
        'lining': '#1b1c1e',
      },
      'marks': {
        'top_crest': {'x': 0.1, 'y': 0.565, 'scale': 0.7},
        'top_wordmark': {'x': 0, 'y': 0.51, 'scale': 0.85},
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
      // FN10 2026-11-02: the word and the "3" level either side of the zip.
      'marks': {
        'top_wordmark': {'x': -0.105, 'y': 0.575, 'scale': 1.0},
        'top_crest': {'x': 0.105, 'y': 0.575, 'scale': 1.0},
      },
    },
    // The Tracksuit tiles (FN10 2026-11-02): the jacket over track pants with
    // a cyan stripe down each outer leg (zoneColors.pantsStripe).
    'trackSuit': {
      'zoneColors': {
        'tsJacket': '#ffffff',
        'body': '#1d2123',
        'shoulder': '#1d2123',
        'side': '#1d2123',
        'cuffs': '#1c2229',
        'stripe': cyan,
        'zip': cyan,
        'pantsStripe': cyan,
        'tsPants': '#27282a',
      },
      'marks': {
        'top_wordmark': {'x': -0.105, 'y': 0.575, 'scale': 1.0},
        'top_crest': {'x': 0.105, 'y': 0.575, 'scale': 1.0},
        'shorts_crest': {'x': 0.17, 'y': 0.84},
        'shorts_wordmark': {'x': 0.17, 'y': 0.802},
      },
    },
    'bballTracksuit': {
      'zoneColors': {
        'tsJacket': '#ffffff',
        'shoulder': '#27282a',
        'side': cyan,
        'sideBlade': '#0a5ae6',
        'stripe': cyan,
        'zip': '#27282a',
        'pantsStripe': cyan,
        'tsPants': '#27282a',
      },
      'marks': {
        'top_crest': {'x': 0.105, 'y': 0.605, 'scale': 0.6},
        'top_wordmark': {'x': 0.105, 'y': 0.572, 'scale': 0.75},
        'shorts_crest': {'x': 0.17, 'y': 0.84},
        'shorts_wordmark': {'x': 0.17, 'y': 0.802},
      },
    },
    'rugbyTracksuit': {
      'zoneColors': {
        'shoulder': '#27282a',
        'side': cyan,
        'stripe': cyan,
        'zip': cyan,
        'pantsStripe': cyan,
      },
      'marks': {
        'top_wordmark': {'x': -0.105, 'y': 0.6, 'scale': 1.0},
        'top_crest': {'x': 0.105, 'y': 0.59, 'scale': 1.0},
        'shorts_crest': {'x': 0.17, 'y': 0.84},
        'shorts_wordmark': {'x': 0.17, 'y': 0.802},
      },
    },
    'nflTracksuit': {
      'zoneColors': {
        'shoulder': '#27282a',
        'side': cyan,
        'stripe': cyan,
        'zip': cyan,
        'pantsStripe': cyan,
        'lining': cyan,
      },
      'marks': {
        'top_crest': {'x': 0.105, 'y': 0.605, 'scale': 0.6},
        'top_wordmark': {'x': 0.105, 'y': 0.572, 'scale': 0.75},
        'shorts_crest': {'x': 0.17, 'y': 0.84},
        'shorts_wordmark': {'x': 0.17, 'y': 0.802},
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
        'waterproofJacket': '#ffffff',
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
      'zoneColors': {'afJersey': '#ffffff', 'collarStripe': '#0096f0', 'badge': '#27282a'},
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
      'zoneColors': {'afJersey': '#ffffff', 'stripe': '#0090f0', 'vInsert': '#00c0f8'},
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
        // FN10 2026-11-02: brighter hoops, as the picture renders them.
        'sockHoops': {'colour': '#10ccff'},
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
    // RGSOCKS 2026-11-13 (the user): the Rugby League > Socks tile's own 3D
    // model (Tripo; viewer zoneColors.rlSocks shows it, every other socks tile
    // keeps the made pair) starts as the client's booklet picture "Full rugby
    // kit": navy knee-high socks, our "3" mark small and yellow high on each
    // shin (website catalog.php). No text or logo from the picture.
    'rlSocks': {
      'main': '#303656',
      'secondary': '#303656',
      'accent': '#f0be1e',
      'zoneColors': {'rlSocks': '#f0be1e', 'sockMark': '#f0be1e'},
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
    // TRS 2026-11-12 (the user): the 3D shorts start as their mockup picture
    // 523: purple body, waistband and side panels, the two hem stripes yellow
    // with purple between, as rendered on the stage; the "3" mark low on the
    // right leg and the 3DEEZI wordmark up the outer left leg (reading upward),
    // placed and sized as the client's demo 524's text; no number (website
    // catalog.php).
    // RGSHORTS 2026-11-13: the Rugby League Playing Shorts on their own 3D
    // model (viewer zoneColors.rlShorts), in the colours and places of the
    // client's reference "Rugby shorts": a golden yellow body, the navy
    // waistband with our 3DEEZI wordmark repeated on it in white, navy hem
    // bindings, our number in navy on the wearer's right leg, our small 3DEEZI
    // wordmark low on the wearer's left leg with the "3" mark (or the team's
    // logo) above it, the number in the Accent colour; no picture text or
    // logos (website catalog.php).
    'rlShorts': {
      'main': '#fcd12a',
      'secondary': '#fcd12a',
      'accent': '#343a64',
      'patternColor': '#343a64',
      'parts': {
        'waistband': {'colour': '#343a64'},
        'shortsHem': {'colour': '#343a64'},
      },
      'zoneColors': {
        'rlShorts': '#343a64',
        'cordTips': '#343a64',
        'bandWord': '#ffffff',
      },
      'marks': {
        'shorts_number': {
          'x': -0.165,
          'y': 0.085,
          'scale': 1.25,
          'look': {'style': 'outline', 'width': 0},
        },
        'shorts_crest': {'x': 0.19, 'y': 0.11, 'scale': 0.9},
        'shorts_wordmark': {
          'side': 'front',
          'x': 0.19,
          'y': 0.055,
          'scale': 0.5,
        },
      },
      'layers': <Map<String, dynamic>>[],
    },
    'bballShorts': {
      'main': '#6a5bb2',
      'secondary': '#6a5bb2',
      'accent': '#00e8ff',
      'patternColor': '#00e8ff',
      'zoneColors': {
        'bballBand': '#6a5bb2',
        'bballTrim1': '#ffff4a',
        'bballTrim2': '#ffff4a',
      },
      'marks': {
        'shorts_number': {'hidden': true},
        'shorts_crest': {'x': -0.185, 'y': 0.115, 'scale': 2.8},
        'shorts_wordmark': {'x': 0.195, 'y': 0.205, 'scale': 2.8, 'rot': -90},
      },
    },
    // The bucket hat pictures: a cyan bound edge; the general one's flat cyan
    // and royal blue shards (viewer hatprint.js).
    'hat': {'main': '#1b1c1e', 'secondary': '#05c3f2'},
    'nflBeanie': {
      'main': '#1b1c1e',
      'secondary': '#05c3f2',
      'zoneColors': {'beanieOne': '#05c3f2'},
    },
    'hatShards': {
      'main': '#1b1c1e',
      'secondary': '#05c3f2',
      'zoneColors': {'shards': '#03c8f7', 'shardsDeep': '#0065f5'},
    },
    // The netball dress (NDF 2026-11-04, the client's preferred model, images
    // 425-427; as config/catalog.php 'netballDress' and $dressBib): a deep blue
    // shift with azure full-length side panels, yoke and neck and armhole
    // binding, each its own colour area (zoneColors body / panels / yoke /
    // binding); the 3DEEZI mark and wordmark on the chest under the yoke, a
    // position bib a shade lighter than the body below them with the white
    // position letters, the same on the back 3 cm lower (as 425's); no name or
    // number. (NDT: the body a little lighter, 43,88,145 on the stage.)
    // BBSINGLET 2026-11-13 (the user): the Basketball singlet tile's own 3D
    // model (Tripo; viewer zoneColors.bballSinglet shows it, every other
    // singlet keeps the made one) starts as its mockup picture 538: a golden
    // yellow mesh body, a dark charcoal V-neck and armhole binding, the "3"
    // mark small on the wearer's right chest and the 3DEEZI wordmark big
    // across the chest (website catalog.php). No text or logo from the picture.
    // Looks of the models added by the shared recipe (viewer/tripo-add.mjs).
    'runningShorts': {'main': '#1a2a52', 'secondary': '#e9b80c', 'accent': '#e9b80c', 'patternColor': '#e9b80c', 'zones': {'sides': 'Solid'}, 'parts': {'waistband': {'colour': '#1a2a52'}, 'shortsHem': {'colour': '#1a2a52'}, 'shortsSides': {'colour': '#e9b80c'}}, 'zoneColors': {'runningShorts': '#1a2a52', 'cordTips': '#1a2a52'}, 'marks': {'shorts_number': {'hidden': true}, 'shorts_crest': {'x': -0.12, 'y': 0.13, 'scale': 0.8}, 'shorts_wordmark': {'side': 'front', 'x': 0.17, 'y': 0.12, 'scale': 0.5}}, 'layers': []},
    'menTights': {'main': '#3b3b3d', 'secondary': '#646466', 'accent': '#646466', 'patternColor': '#646466', 'pattern': 'None', 'number': '', 'parts': {'waistband': {'colour': '#646466'}}, 'zoneColors': {'menTights': '#3b3b3d', 'pantsStripe': '#646466'}, 'marks': {'shorts_number': {'hidden': true}, 'shorts_crest': {'x': 0.17, 'y': 0.84, 'scale': 0.8}, 'shorts_wordmark': {'x': 0.17, 'y': 0.802, 'scale': 0.8}}, 'layers': []},
    'swimShorts': {'main': '#e48a62', 'secondary': '#b0542c', 'accent': '#b0542c', 'patternColor': '#b0542c', 'parts': {'waistband': {'colour': '#e48a62'}}, 'zoneColors': {'swimShorts': '#e48a62', 'cord': '#f4f4f2'}, 'marks': {'shorts_number': {'hidden': true}, 'shorts_crest': {'x': -0.13, 'y': 0.075, 'scale': 0.8}, 'shorts_wordmark': {'side': 'front', 'x': 0.15, 'y': 0.06, 'scale': 0.5}}, 'layers': []},
    'womenShorts': {'main': '#1c4a8e', 'secondary': '#27282a', 'accent': '#27282a', 'patternColor': '#27282a', 'parts': {'waistband': {'colour': '#27282a'}}, 'zoneColors': {'womenShorts': '#1c4a8e'}, 'marks': {'shorts_number': {'hidden': true}, 'shorts_crest': {'side': 'front', 'x': -0.14, 'y': 0.1, 'scale': 0.7}, 'shorts_wordmark': {'side': 'front', 'x': -0.14, 'y': 0.065, 'scale': 0.5}}, 'layers': []},
    'sportsBra': {'main': '#2a5aa6', 'secondary': '#142c6e', 'accent': '#ffffff', 'patternColor': '#142c6e', 'number': '', 'zones': [], 'zoneColors': {'sportsBra': '#142c6e'}, 'parts': {'collar': {'colour': '#2a5aa6'}}, 'marks': {'top_wordmark': {'x': 0.08, 'y': 0.5, 'scale': 0.9}, 'top_crest': {'hidden': true}, 'top_number': {'hidden': true}, 'top_name': {'hidden': true}}, 'layers': []},
    'pufferVest': {'zoneColors': {'pufferVest': '#ffffff', 'body': '#24272b', 'shoulder': '#24272b', 'side': '#24272b', 'stripe': '#24272b', 'zip': '#00c4f0'}},
    'compressionPants': {'main': '#27282a', 'secondary': '#16b4f0', 'accent': '#1c58c8', 'patternColor': '#16b4f0', 'pattern': 'None', 'number': '', 'parts': {'waistband': {'colour': '#27282a'}}, 'zoneColors': {'compressionPants': '#27282a', 'pantsStripe': '#16b4f0'}, 'marks': {'shorts_number': {'hidden': true}, 'shorts_crest': {'x': 0.17, 'y': 0.84, 'scale': 0.8}, 'shorts_wordmark': {'x': 0.17, 'y': 0.802, 'scale': 0.8}}, 'layers': []},
    'mtbJersey': {'main': '#27282a', 'secondary': '#16b4f0', 'accent': '#16b4f0', 'patternColor': '#16b4f0', 'zones': [], 'zoneColors': {'mtbJersey': '#ffffff'}, 'marks': {'top_crest': {'x': 0.09, 'y': 0.6, 'scale': 0.55}, 'top_wordmark': {'x': -0.09, 'y': 0.6, 'scale': 0.5}}},
    'bmxRaceJersey': {'zoneColors': {'mtbJersey': '#ffffff'}},
    'cyclingJersey': {'main': '#27282a', 'secondary': '#16b4f0', 'accent': '#16b4f0', 'patternColor': '#16b4f0', 'zones': [], 'zoneColors': {'cyclingJersey': '#ffffff'}, 'marks': {'top_crest': {'x': 0.09, 'y': 0.6, 'scale': 0.55}, 'top_wordmark': {'x': -0.09, 'y': 0.6, 'scale': 0.5}}},
    'womenSinglet': {'main': '#f4f5f7', 'secondary': '#1e2a44', 'accent': '#1e2a44', 'patternColor': '#1e2a44', 'number': '', 'zoneColors': {'womenSinglet': '#1e2a44'}, 'parts': {'collar': {'colour': '#1e2a44'}}, 'marks': {'top_wordmark': {'x': 0, 'y': 0.6, 'scale': 0.45}, 'top_crest': {'hidden': true}, 'top_number': {'hidden': true}, 'top_name': {'hidden': true}}, 'layers': []},
    'raglanLs': {'secondary': '#27282a', 'accent': '#c8102e', 'patternColor': '#00688a', 'parts': {'leftSleeve': {'colour': '#c8102e'}, 'rightSleeve': {'colour': '#c8102e'}}, 'zoneColors': {'raglanLs': '#27282a', 'labelDark': '#2e3034'}, 'marks': {'top_wordmark': {'y': 0.515, 'scale': 0.55}, 'top_crest': {'y': 0.578, 'scale': 0.75}}},
    'womenTee': {'secondary': '#27282a', 'patternColor': '#00688a', 'zoneColors': {'womenTee': '#27282a', 'labelDark': '#2e3034'}, 'marks': {'top_wordmark': {'y': 0.515, 'scale': 0.55}, 'top_crest': {'y': 0.578, 'scale': 0.75}}},
    'lsTee': {'secondary': '#27282a', 'patternColor': '#00688a', 'zoneColors': {'lsTee': '#27282a', 'labelDark': '#2e3034'}, 'marks': {'top_wordmark': {'y': 0.515, 'scale': 0.55}, 'top_crest': {'y': 0.578, 'scale': 0.75}}},
    'longsleevePolo': {'main': '#14213d', 'secondary': '#ffffff', 'accent': '#00a0d8', 'patternColor': '#00a0d8', 'pattern': 'None', 'number': '', 'zoneColors': {'longsleevePolo': '#ffffff', 'collar': '#ffffff', 'rib': '#14213d'}, 'marks': {'top_wordmark': {'x': 0.09, 'y': 0.6, 'scale': 0.4}, 'top_crest': {'x': -0.09, 'y': 0.6, 'scale': 0.6}, 'top_number': {'hidden': true}, 'top_name': {'hidden': true}}, 'layers': []},
    'sleevelessHoodie': {'main': '#161616', 'zoneColors': {'sleevelessHoodie': '#ffffff', 'stripe': '#00f6fe'}, 'marks': {'top_crest': {'x': 0, 'y': 0.565, 'scale': 0.85}, 'top_wordmark': {'x': 0, 'y': 0.5, 'scale': 0.6}}},
    'sweatshirt': {'main': '#161616', 'zoneColors': {'sweatshirt': '#ffffff', 'stripe': '#00f6fe'}, 'marks': {'top_crest': {'x': 0, 'y': 0.565, 'scale': 0.85}, 'top_wordmark': {'x': 0, 'y': 0.5, 'scale': 0.6}}},
    'zipHoodie': {'main': '#27282a', 'secondary': '#16b4f0', 'accent': '#16b4f0', 'patternColor': '#16b4f0', 'number': '', 'zoneColors': {}, 'marks': {}, 'layers': []},
    'womenFootballJersey': {'main': '#1f4fa8', 'secondary': '#ffffff', 'accent': '#ffffff', 'patternColor': '#ffffff', 'pattern': 'None', 'number': '9', 'zoneColors': {'womenFootballJersey': '#ffffff', 'rib': '#ffffff'}, 'marks': {'top_wordmark': {'x': 0.09, 'y': 0.6, 'scale': 0.45}, 'top_crest': {'x': -0.09, 'y': 0.6, 'scale': 0.7}, 'top_number': {'color': '#ffffff'}, 'top_name': {'hidden': true}}, 'layers': []},
    'windbreakerJacket': {'zoneColors': {'windbreakerJacket': '#ffffff', 'body': '#24272b', 'shoulder': '#24272b', 'side': '#00c4f0', 'stripe': '#24272b', 'zip': '#00c4f0'}},
    'waterproofJacket': {'zoneColors': {'waterproofJacket': '#ffffff', 'body': '#24272b', 'shoulder': '#24272b', 'side': '#00c4f0', 'stripe': '#24272b', 'zip': '#00c4f0'}},
    'hoodedTee': {'main': '#f2f4f6', 'secondary': '#1e2a44', 'accent': '#00a0d8', 'patternColor': '#00a0d8', 'number': '', 'zoneColors': {'hoodedTee': '#ffffff', 'hood': '#f2f4f6', 'lining': '#1e2a44', 'rib': '#1e2a44'}, 'marks': {'top_crest': {'x': -0.1, 'y': 0.6, 'scale': 0.3}, 'top_wordmark': {'x': 0, 'y': 0.45, 'scale': 0.6}, 'top_number': {'hidden': true}, 'top_name': {'hidden': true}}, 'layers': []},
    'afJersey': {'zoneColors': {'afJersey': '#ffffff'}},
    'bballHoodie': {'main': '#161616', 'zoneColors': {'stripe': '#00f6fe', 'bballHoodie': '#ffffff'}, 'marks': {'top_crest': {'x': 0.09, 'y': 0.6, 'scale': 0.45}, 'top_wordmark': {'x': -0.09, 'y': 0.6, 'scale': 0.4}}},
    'baseballJersey': {'main': '#1f6fa6', 'secondary': '#262e48', 'accent': '#262e48', 'patternColor': '#262e48', 'number': '23', 'zones': [], 'parts': {'leftSleeve': {'colour': '#262e48'}, 'rightSleeve': {'colour': '#262e48'}, 'collar': {'colour': '#262e48'}}, 'zoneColors': {'baseballJersey': '#262e48'}, 'marks': {'top_wordmark': {'x': 0, 'y': 0.5, 'scale': 0.75}, 'top_crest': {'x': 0.09, 'y': 0.6, 'scale': 0.3}, 'top_number': {'color': '#ffffff'}}, 'layers': []},
    'tpModel': {'main': '#27282a', 'zoneColors': {'tpModel': '#27282a', 'pantsStripe': '#16b4f0'}, 'marks': {'shorts_crest': {'x': 0.17, 'y': 0.84}, 'shorts_wordmark': {'x': 0.17, 'y': 0.802}}},
    // FN10 2026-11-02: the word and the "3" level either side of the zip.
    'tjModel': {'zoneColors': {'tjModel': '#ffffff',  'body': '#1d2123', 'shoulder': '#1d2123', 'side': '#1d2123', 'cuffs': '#1c2229', 'stripe': cyan, 'zip': cyan}, 'marks': {'top_wordmark': {'x': -0.105, 'y': 0.575, 'scale': 1.0}, 'top_crest': {'x': 0.105, 'y': 0.575, 'scale': 1.0}}},
    'tsJacket': {'zoneColors': {'tsJacket': '#ffffff'}},
    'womenRugbyJersey': {'main': '#272e48', 'secondary': '#e2bf3a', 'accent': '#e2bf3a', 'patternColor': '#e2bf3a', 'pattern': 'None', 'number': '7', 'parts': {'collar': {'colour': '#e2bf3a'}}, 'zoneColors': {'womenRugbyJersey': '#e2bf3a'}, 'marks': {'top_wordmark': {'x': 0.09, 'y': 0.6, 'scale': 0.45}, 'top_crest': {'x': -0.09, 'y': 0.6, 'scale': 0.7}, 'top_number': {'color': '#e2bf3a'}, 'top_name': {'hidden': true}}, 'layers': []},
    'fitnessBottoms': {'main': '#27282a', 'secondary': '#16b4f0', 'accent': '#1c58c8', 'patternColor': '#16b4f0', 'pattern': 'None', 'number': '', 'parts': {'waistband': {'colour': '#27282a'}}, 'zoneColors': {'fitnessBottoms': '#27282a', 'pantsStripe': '#16b4f0'}, 'marks': {'shorts_number': {'hidden': true}, 'shorts_crest': {'side': 'back', 'x': 0.1, 'y': 0.83, 'scale': 0.7}, 'shorts_wordmark': {'side': 'back', 'x': 0.1, 'y': 0.79, 'scale': 0.5}}, 'layers': []},
    'womenLeggings': {'main': '#27282a', 'secondary': '#16b4f0', 'accent': '#1c58c8', 'patternColor': '#16b4f0', 'pattern': 'None', 'number': '', 'parts': {'waistband': {'colour': '#27282a'}}, 'zoneColors': {'womenLeggings': '#27282a', 'pantsStripe': '#16b4f0'}, 'marks': {'shorts_number': {'hidden': true}, 'shorts_crest': {'x': 0.17, 'y': 0.84, 'scale': 0.8}, 'shorts_wordmark': {'x': 0.17, 'y': 0.802, 'scale': 0.8}}, 'layers': []},
    'rugbyVJersey': {'main': '#ffca00', 'secondary': '#ffca00', 'accent': '#11183f', 'patternColor': '#11183f', 'parts': {'leftSleeve': {'colour': '#11183f'}, 'rightSleeve': {'colour': '#11183f'}}, 'zoneColors': {'rugbyVJersey': '#11183f'}, 'marks': {'top_number': {'color': '#ffffff'}, 'top_frontNumber': {'hidden': true}, 'top_wordmark': {'x': -0.07, 'y': 0.575, 'scale': 0.34}, 'top_crest': {'x': 0.075, 'y': 0.575, 'scale': 0.85}, 'top_name': {'color': '#ffffff'}}, 'layers': []},
    'rugbyJersey': {'main': '#e2bf3a', 'secondary': '#e2bf3a', 'accent': '#32324c', 'patternColor': '#32324c', 'parts': {'leftSleeve': {'colour': '#32324c'}, 'rightSleeve': {'colour': '#32324c'}}, 'zoneColors': {'rugbyJersey': '#32324c'}, 'marks': {'top_number': {'color': '#32324c'}, 'top_frontNumber': {'x': 0, 'y': 0.45}, 'top_wordmark': {'x': -0.07, 'y': 0.575, 'scale': 0.34}, 'top_crest': {'x': 0.075, 'y': 0.575, 'scale': 0.85}}, 'layers': []},
    'tsPants': {'zoneColors': {'shoulder': '#27282a', 'side': '#16b4f0', 'sideBlade': '#0a5ae6', 'stripe': '#16b4f0', 'zip': '#27282a', 'pantsStripe': '#16b4f0', 'tsPants': '#27282a'}, 'marks': {'top_crest': {'x': 0.105, 'y': 0.605, 'scale': 0.6}, 'top_wordmark': {'x': 0.105, 'y': 0.572, 'scale': 0.75}, 'shorts_crest': {'x': 0.17, 'y': 0.84}, 'shorts_wordmark': {'x': 0.17, 'y': 0.802}}},
    'womenRugbyShorts': {'main': '#272e48', 'secondary': '#272e48', 'accent': '#e2bf3a', 'patternColor': '#e2bf3a', 'parts': {'waistband': {'colour': '#272e48'}, 'shortsHem': {'colour': '#272e48'}}, 'zoneColors': {'womenRugbyShorts': '#272e48'}, 'marks': {'shorts_number': {'hidden': true}, 'shorts_crest': {'x': 0.13, 'y': 0.075, 'scale': 0.8}, 'shorts_wordmark': {'side': 'front', 'x': -0.14, 'y': 0.065, 'scale': 0.5}}, 'layers': []},
    'trainingShorts': {'main': '#e3ca3b', 'secondary': '#2a52a8', 'accent': '#2a52a8', 'patternColor': '#2a52a8', 'parts': {'waistband': {'colour': '#2a52a8'}}, 'zoneColors': {'trainingShorts': '#2a52a8'}, 'marks': {'shorts_number': {'hidden': true}, 'shorts_crest': {'x': -0.13, 'y': 0.075, 'scale': 0.85}, 'shorts_wordmark': {'side': 'front', 'x': 0.15, 'y': 0.06, 'scale': 0.5}}, 'layers': []},
    'rashGuard': {'zoneColors': {'rashGuard': '#ffffff'},  'pattern': 'Blades', 'patternColor': '#1672f5', 'parts': {'sides': {'colour': '#27282a', 'pattern': 'Blades'}}},
    'trainingTee': {'main': '#a9cbe8', 'secondary': '#f2e52a', 'accent': '#1e2a44', 'patternColor': '#1e2a44', 'number': '', 'zoneColors': {'trainingTee': '#f2e52a'}, 'parts': {'collar': {'colour': '#f2e52a'}}, 'marks': {'top_wordmark': {'x': 0.09, 'y': 0.6, 'scale': 0.45}, 'top_crest': {'x': -0.09, 'y': 0.6, 'scale': 0.3}, 'top_number': {'hidden': true}, 'top_name': {'side': 'back', 'x': 0, 'y': 0.66, 'scale': 0.5}}, 'layers': []},
    'poloShirt': {'main': '#dbe3ed', 'secondary': '#2b2c30', 'accent': '#2b2c30', 'patternColor': '#2b2c30', 'number': '', 'zoneColors': {'poloShirt': '#2b2c30'}, 'parts': {'collar': {'colour': '#2b2c30'}}, 'marks': {'top_wordmark': {'x': 0.09, 'y': 0.6, 'scale': 0.45}, 'top_crest': {'hidden': true}, 'top_number': {'hidden': true}, 'top_name': {'hidden': true}}, 'layers': []},
    'fitnessTop': {'zoneColors': {'fitnessTop': '#ffffff'},  'zones': solid(['sides']), 'layers': <Map<String, dynamic>>[]},
    'aflGuernsey': {'main': '#d6b13a', 'secondary': '#1f3f8a', 'accent': '#1e2758', 'patternColor': '#1e2758', 'number': '1', 'zoneColors': {'aflGuernsey': '#3e71aa'}, 'marks': {'top_wordmark': {'x': -0.085, 'y': 0.6, 'scale': 0.4}, 'top_crest': {'x': 0.085, 'y': 0.6, 'scale': 0.28}, 'top_frontNumber': {'x': 0, 'y': 0.15, 'scale': 1.1}, 'top_number': {'x': 0, 'y': 0.2, 'scale': 1}}, 'layers': <Map<String, dynamic>>[{'type': 'shape', 'id': 'tile-band', 'name': 'Chest band', 'part': 'top', 'side': 'front', 'x': 0, 'y': 0.48, 'shape': 'rectangle', 'w': 0.6, 'h': 0.155, 'colorFrom': 'secondary'}, {'type': 'shape', 'id': 'tile-band-back', 'name': 'Chest band (back)', 'part': 'top', 'side': 'back', 'x': 0, 'y': 0.48, 'shape': 'rectangle', 'w': 0.6, 'h': 0.155, 'colorFrom': 'secondary'}], 'parts': {'collar': {'colour': '#3e71aa'}}},
    'bballSinglet': {
      'main': '#e4bf00',
      'secondary': '#42444c',
      'accent': '#42444c',
      'patternColor': '#42444c',
      'zoneColors': {'bballSinglet': '#42444c'},
      'marks': {
        'top_crest': {'x': -0.1, 'y': 0.6, 'scale': 0.3},
        'top_wordmark': {'x': 0, 'y': 0.45, 'scale': 0.75},
      },
    },
    // BBTILES 2026-11-18: the Reversible training singlet on the basketball
    // singlet's model in the Singlet picture's black and blue look
    // (singletTile), its black binding the model's flag colour.
    // BBTILES 2026-11-18: the Basketball kit: the singlet's golden yellow with
    // its charcoal binding, the shorts in the same yellow with charcoal side
    // panels, band, waistband and hem stripes; the singlet's marks, the
    // shorts' "3" and upright wordmark as on the Basketball shorts.
    'bballKit': {
      'main': '#e4bf00',
      'secondary': '#42444c',
      'accent': '#42444c',
      'patternColor': '#42444c',
      'zoneColors': {
        'bballSinglet': '#42444c',
        'bballBand': '#42444c',
        'bballTrim1': '#42444c',
        'bballTrim2': '#42444c',
      },
      'marks': {
        'top_crest': {'x': -0.1, 'y': 0.6, 'scale': 0.3},
        'top_wordmark': {'x': 0, 'y': 0.45, 'scale': 0.75},
        'shorts_number': {'hidden': true},
        'shorts_crest': {'x': -0.185, 'y': 0.115, 'scale': 2.8},
        'shorts_wordmark': {'x': 0.195, 'y': 0.205, 'scale': 2.8, 'rot': -90},
      },
    },
    'bballTrainingSinglet': {
      'secondary': '#27282a',
      'zoneColors': {
        'flow': '#2a78c8',
        'flowLight': '#5ab4e4',
        'flowDeep': '#1c58c8',
        'bballSinglet': '#27282a',
      },
      'marks': {
        'top_wordmark': {'y': 0.505},
        'top_crest': {'scale': 0.7},
      },
    },
    // NBBIB 2026-11-13 (the user): the Netball bibs tile's own 3D model
    // (Tripo; viewer zoneColors.netballBib shows it, every other singlet keeps
    // the made one) starts as the booklet's "Netball bib" (Yellow Images
    // 37504): a royal blue bib, the yellow neck binding (Neck trim), our big
    // white position letters front and back (the Number), our 3DEEZI wordmark
    // high on the wearer's right chest and our yellow "3" mark high on the
    // left (website catalog.php). Nothing from the picture.
    'netballBib': {
      'number': 'GS',
      'main': '#2c48bc',
      'secondary': '#2c48bc',
      'accent': '#ffffff',
      'patternColor': cyan,
      'parts': {
        'collar': {'colour': '#ffd200'},
      },
      'zoneColors': {'netballBib': '#2c48bc', 'crestInk': '#ffd200'},
      'marks': {
        'top_name': {'hidden': true},
        'top_number': {'x': 0, 'y': 0.26, 'scale': 0.6},
        'top_frontNumber': {'x': 0, 'y': 0.42, 'scale': 1.4},
        'top_crest': {'x': 0.095, 'y': 0.56, 'scale': 0.45},
        'top_wordmark': {'x': -0.095, 'y': 0.56, 'scale': 0.4},
      },
      'layers': <Map<String, dynamic>>[],
    },
    // SCJERSEY 2026-11-16 (the user): the Football jersey tile's own 3D model
    // (Tripo soccer-jersey; viewer zoneColors.scJersey shows it, every other
    // jersey and the Football Full kit keep theirs) starts as the booklet's
    // "Soccer jersey" (Yellow Images 138303): a dark slate-navy body, yellow
    // V neck band, cuff bands and side panels, a small yellow tag low on the
    // front; our white number, 3DEEZI wordmark and "3" on the back (website
    // catalog.php). Nothing from the picture.
    'scJersey': {
      'main': '#33496a',
      'secondary': '#fff21a',
      'accent': '#ffffff',
      'patternColor': '#fff21a',
      'parts': {
        'sides': {'colour': '#fff21a'},
      },
      'zoneColors': {'scJersey': '#fff21a'},
      'layers': <Map<String, dynamic>>[
        {
          'type': 'shape',
          'id': 'tile-tag',
          'name': 'Hem tag',
          'part': 'top',
          'side': 'front',
          'x': 0.1,
          'y': 0.11,
          'shape': 'rectangle',
          'w': 0.018,
          'h': 0.028,
          'colorFrom': 'secondary',
        },
      ],
    },
    'netballDress': {
      // (Netball has no player numbers: client 2026-10-26.)
      // (TRD 2026-11-12, the user: the Tripo dress's starting look in the
      // colours of its own picture, images/525, as config/catalog.php: deep
      // blue body and yoke, light azure side panels and binding; no bib, the
      // position letters are the Numbers panel's.)
      'number': '',
      'main': '#30508a',
      'secondary': '#2295dc',
      'accent': '#00d0ff',
      'pattern': 'None',
      'patternColor': '#2295dc',
      'zoneColors': {
        'body': '#30508a',
        'panels': '#2295dc',
        'yoke': '#30508a',
        'binding': '#2295dc',
      },
      'marks': {
        'top_name': {'hidden': true},
      },
      'layers': <Map<String, dynamic>>[],
    },
  };
  // The Rugby League Jersey tile (FBJERSEY 2026-11-13, as config/catalog.php
  // 'rlJersey'): on its own 3D model in its reference's colours (the booklet's
  // "Rugby jersey", images/539): a golden yellow body and neck band, navy
  // raglan sleeves and cuffs, the number big and navy on the chest and back,
  // our "3" on the left chest and the small 3DEEZI wordmark on the right chest.
  looks['rlJersey'] = {
    'main': '#e2bf3a',
    'secondary': '#e2bf3a',
    'accent': '#32324c',
    'patternColor': '#32324c',
    'parts': {
      'leftSleeve': {'colour': '#32324c'},
      'rightSleeve': {'colour': '#32324c'},
    },
    'zoneColors': {'fbJersey': '#32324c', 'cuffStripe': '#e2bf3a'},
    'marks': {
      'top_number': {'color': '#32324c'},
      'top_frontNumber': {'x': 0, 'y': 0.45},
      'top_wordmark': {'x': -0.1, 'y': 0.6, 'scale': 0.42},
      'top_crest': {'x': 0.1, 'y': 0.6, 'scale': 1.0},
    },
  };
  // (MODELQ5 2026-11-19, as config/catalog.php: the 11 plain singlet tiles on
  // the training singlet's 3D model, each in its own picture's look with only
  // the model's flag added.)
  looks['singletModel'] = {
    ...looks['singletTile']!,
    'zoneColors': {
      ...(looks['singletTile']!['zoneColors'] as Map<String, String>),
      'trainingSinglet': '#ffffff',
    },
  };
  looks['bladesSidesModel'] = {
    ...looks['bladesSides']!,
    'zoneColors': <String, String>{'trainingSinglet': '#ffffff'},
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
    // A bib's position letters with no name or number (as config/catalog.php
    // $letters), unless the look sets its own marks (the netball dress keeps
    // its logo). (BR1 2026-11-02, the user: every item carries the 3DEEZI "3"
    // and wordmark: the "3" over a small 3DEEZI centred high on the chest,
    // above the letters, as on the training bibs.)
    if (looks[name]?['marks'] == null &&
        _tileObjects(picture).any((l) => l['id'] == 'tile-position'))
      'marks': {
        'top_name': {'hidden': true},
        'top_number': {'hidden': true},
        'top_crest': {'x': 0, 'y': 0.6, 'scale': 0.75},
        'top_wordmark': {'x': 0, 'y': 0.55, 'scale': 0.45},
      },
    // The Compression Top picture: the crest at its own place, stacked over
    // the wordmark (as config/catalog.php $sleeveThree), so the Game Jersey
    // tile's small high crest does not stay on.
    if (picture == 'nfl-compression-top' && name != 'fitnessTop') ...{
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
      look: 'rlKitModel',
    ),
    // (On its own 3D model in its reference's colours, FBJERSEY 2026-11-13;
    // the kit keeps the made jersey.)
    GarmentTile(
      'Jersey',
      'Performance rugby league jersey.',
      'Jersey',
      image: 'rugby-jersey',
      // (Its own 3D model, rugby-jersey-textured.glb: RUGBYJ 2026-11-18.)
      look: 'rugbyJersey',
    ),
    GarmentTile(
      'Playing Shorts',
      'Durable rugby league shorts.',
      'Shorts',
      image: 'rugby-shorts',
      look: 'rlShorts',
    ),
    GarmentTile(
      'Socks',
      'Knee-high match socks.',
      'Socks',
      image: 'rugby-socks',
      look: 'rlSocks',
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
      "Women's tee",
      'Fitted tee for training and warm-ups.',
      'Training Tee',
      image: 'women-tee',
      look: 'womenTee',
    ),
    GarmentTile(
      'Training Shorts',
      'Lightweight shorts with zip pockets.',
      'Shorts',
      image: 'rugby-training-shorts',
    ),
    GarmentTile(
      'Hooded Tracksuit',
      'Full-zip jacket with hood and pants.',
      'Track jacket',
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
    GarmentTile(
      'Waterproof Jacket',
      'Weatherproof jacket with hood.',
      'Track jacket',
      image: 'rugby-waterproof-jacket',
      trackStyle: 'hood',
    ),
    GarmentTile(
      'Windbreaker',
      'Light stand-collar jacket that keeps the wind out.',
      'Track jacket',
      image: 'waterproof-jacket',
      look: 'windbreakerJacket',
    ),
    GarmentTile(
      'Puffer vest',
      'Quilted puffer vest for the sideline.',
      'Track jacket',
      image: 'waterproof-jacket',
      look: 'pufferVest',
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
      // (Its own 3D model, rugby-vneck-jersey-textured.glb: RUGBYV 2026-11-19.)
      look: 'rugbyVJersey',
    ),
    GarmentTile(
      "Women's rugby jersey",
      "Fitted women's rugby jersey with a V-neck.",
      'Jersey',
      image: 'rugby-jersey',
      look: 'womenRugbyJersey',
    ),
    GarmentTile(
      'Playing Shorts',
      'Durable rugby shorts.',
      'Shorts',
      image: 'rugby-shorts',
    ),
    GarmentTile(
      "Women's rugby shorts",
      "Fitted women's rugby shorts.",
      'Shorts',
      image: 'rugby-shorts',
      look: 'womenRugbyShorts',
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
      "Women's tee",
      'Fitted tee for training and warm-ups.',
      'Training Tee',
      image: 'women-tee',
      look: 'womenTee',
    ),
    GarmentTile(
      'Training Shorts',
      'Lightweight shorts with zip pockets.',
      'Shorts',
      image: 'rugby-training-shorts',
    ),
    GarmentTile(
      'Hooded Tracksuit',
      'Full-zip jacket with hood and pants.',
      'Track jacket',
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
    GarmentTile(
      'Waterproof Jacket',
      'Weatherproof jacket with hood.',
      'Track jacket',
      image: 'rugby-waterproof-jacket',
      trackStyle: 'hood',
    ),
    GarmentTile(
      'Windbreaker',
      'Light stand-collar jacket that keeps the wind out.',
      'Track jacket',
      image: 'waterproof-jacket',
      look: 'windbreakerJacket',
    ),
    GarmentTile(
      'Puffer vest',
      'Quilted puffer vest for cold match days.',
      'Track jacket',
      image: 'waterproof-jacket',
      look: 'pufferVest',
    ),
  ],
  'football': [
    GarmentTile(
      'Football jersey',
      'Lightweight match shirt for the pitch.',
      'Jersey',
      look: 'scJersey',
    ),
    GarmentTile(
      "Women's football jersey",
      "Fitted women's football jersey with a V-neck.",
      'Jersey',
      image: 'jersey',
      look: 'womenFootballJersey',
    ),
    GarmentTile(
      'Football shorts',
      'Light shorts that move with you.',
      'Shorts',
    ),
    GarmentTile(
      'Full kit',
      'Shirt and shorts, designed together.',
      'Full Kit',
      look: 'fbKitModel',
    ),
    GarmentTile(
      'Training tee',
      'Breathable tee for training and warm-ups.',
      'Training Tee',
    ),
    GarmentTile(
      "Women's tee",
      'Fitted tee for training and warm-ups.',
      'Training Tee',
      image: 'women-tee',
      look: 'womenTee',
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
  // BBTILES 2026-11-18 (the client): every Basketball tile has its own
  // picture, garment-bb-*.webp, on a light grey-blue studio backdrop; the
  // singlet pictures are rendered from our basketball singlet model, and the
  // Reversible training singlet opens on that model in its black and blue look.
  'basketball': [
    GarmentTile(
      'Basketball singlet',
      'Game singlet with a big number.',
      'Singlet',
      image: 'bb-singlet',
      look: 'bballSinglet',
    ),
    // The Basketball kit: the Full kit as the basketball singlet over the
    // basketball shorts, each on its own model (viewer main.js bballKitOn).
    GarmentTile(
      'Basketball kit',
      'Singlet and shorts, designed together.',
      'Full Kit',
      image: 'bb-kit',
      look: 'bballKit',
    ),
    GarmentTile(
      'Basketball shorts',
      'Long, loose game shorts.',
      'Shorts',
      image: 'bb-shorts',
    ),
    GarmentTile(
      'Shooting shirt',
      'Warm-up shirt for the shoot-around.',
      'Shooting shirt',
      image: 'bb-shooting-shirt',
    ),
    GarmentTile(
      'Reversible training singlet',
      'Light singlet for practice games.',
      'Singlet',
      image: 'bb-training-singlet',
      look: 'bballTrainingSinglet',
    ),
    GarmentTile(
      'Training tee',
      'Breathable tee for training and warm-ups.',
      'Training Tee',
      image: 'bb-tee',
    ),
    GarmentTile(
      "Women's tee",
      'Fitted tee for training and warm-ups.',
      'Training Tee',
      image: 'women-tee',
      look: 'womenTee',
    ),
    GarmentTile(
      'Warm-up hoodie',
      'Warm hoodie for the bench and travel.',
      'Hoodie',
      image: 'bb-hoodie',
      look: 'bbHoodie',
    ),
    GarmentTile(
      'Tracksuit',
      'Full-zip jacket and matching pants.',
      'Track jacket',
      image: 'bb-tracksuit',
    ),
    GarmentTile(
      'Varsity jacket',
      'Letterman jacket for the team.',
      'Varsity jacket',
      image: 'bb-varsity',
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
      "Women's shorts",
      'Fitted sport shorts for the court.',
      'Shorts',
      image: 'shorts',
      look: 'womenShorts',
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
      look: 'bladesSidesModel',
    ),
    GarmentTile(
      "Women's singlet",
      'Fitted racerback singlet for training.',
      'Singlet',
      image: 'netball-training-singlet',
      look: 'womenSinglet',
    ),
    GarmentTile(
      'Training T-shirt',
      'Breathable tee for training and warm-ups.',
      'Training Tee',
      image: 'netball-tee',
    ),
    // (On its own 3D model, NBBIB 2026-11-13.)
    GarmentTile(
      'Netball bibs',
      'Pullover bibs with position patches.',
      'Singlet',
      image: 'netball-bibs',
      look: 'netballBib',
    ),
    GarmentTile(
      'Tracksuit',
      'Full-zip jacket and matching pants.',
      'Track jacket',
      image: 'netball-tracksuit',
    ),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for on and off court.',
      'Hoodie',
      image: 'netball-hoodie',
    ),
  ],
  // HEADWEAR (CP1, client mockup images/296.jpg): caps, bucket hats, beanies
  // and 5-panel caps; the beanie and the 5-panel cap COMING SOON until their
  // 3D models are ready.
  'headwear': [
    GarmentTile(
      'Cap',
      'Six-panel cap with a curved brim.',
      'Cap',
      image: 'rugby-cap',
    ),
    GarmentTile(
      'Bucket Hat',
      'Wide brim bucket hat.',
      'Bucket hat',
      image: 'rugby-bucket-hat',
    ),
    GarmentTile(
      'Beanie',
      'Rib-knit beanie with a pom-pom and a folded cuff.',
      'Beanie',
    ),
    GarmentTile(
      '5 Panel Cap',
      'One wide front panel and a flat brim.',
      '5 panel cap',
    ),
  ],
  'afl': [
    GarmentTile(
      'AFL guernsey',
      'Sleeveless match guernsey with your number.',
      'Singlet',
      image: 'afl-guernsey',
      look: 'aflGuernsey',
    ),
    GarmentTile('AFL shorts', 'Footy shorts for the contest.', 'Shorts'),
    GarmentTile(
      'Training singlet',
      'Lightweight singlet for the track.',
      'Singlet',
      look: 'singletModel',
    ),
    GarmentTile(
      "Women's singlet",
      'Fitted racerback singlet for the track.',
      'Singlet',
      image: 'singlet',
      look: 'womenSinglet',
    ),
    GarmentTile(
      'Training tee',
      'Breathable tee for training and warm-ups.',
      'Training Tee',
    ),
    GarmentTile(
      "Women's tee",
      'Fitted tee for training and warm-ups.',
      'Training Tee',
      image: 'women-tee',
      look: 'womenTee',
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
    GarmentTile(
      "Women's tee",
      'Fitted tee for training and warm-ups.',
      'Training Tee',
      image: 'women-tee',
      look: 'womenTee',
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
      "Women's tee",
      'Fitted tee for training and warm-ups.',
      'Training Tee',
      image: 'women-tee',
      look: 'womenTee',
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
    GarmentTile(
      'Hooded Tracksuit',
      'Full-zip jacket with hood and pants.',
      'Track jacket',
      image: 'nfl-hooded-tracksuit',
      trackStyle: 'hood',
    ),
    GarmentTile(
      'Waterproof Jacket',
      'Weatherproof jacket with hood.',
      'Track jacket',
      image: 'nfl-waterproof-jacket',
      trackStyle: 'hood',
    ),
    GarmentTile(
      'Windbreaker',
      'Light stand-collar jacket that keeps the wind out.',
      'Track jacket',
      image: 'waterproof-jacket',
      look: 'windbreakerJacket',
    ),
    GarmentTile(
      'Puffer vest',
      'Quilted puffer vest for cold game days.',
      'Track jacket',
      image: 'waterproof-jacket',
      look: 'pufferVest',
    ),
    GarmentTile('Cap', 'Curved brim sports cap.', 'Cap', image: 'nfl-cap'),
    GarmentTile(
      'Bucket Hat',
      'Wide brim bucket hat.',
      'Bucket hat',
      image: 'nfl-bucket-hat',
    ),
    GarmentTile(
      'Beanie',
      'Knitted beanie with a cuff.',
      'Beanie',
      image: 'nfl-beanie',
    ),
  ],
  'golf': [
    GarmentTile('Golf polo', 'Premium fitted polo for every round.', 'Polo'),
    GarmentTile(
      'Long-sleeve polo',
      'Long-sleeve raglan polo for cooler rounds.',
      'Polo',
      image: 'polo',
      look: 'longsleevePolo',
    ),
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
    GarmentTile(
      'Tennis singlet',
      'Sleeveless top for hot days.',
      'Singlet',
      look: 'singletModel',
    ),
    GarmentTile(
      "Women's singlet",
      'Fitted racerback singlet for the court.',
      'Singlet',
      image: 'singlet',
      look: 'womenSinglet',
    ),
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
      look: 'singletModel',
    ),
    GarmentTile(
      "Women's singlet",
      'Fitted racerback singlet for race day.',
      'Singlet',
      image: 'singlet',
      look: 'womenSinglet',
    ),
    GarmentTile(
      'Running shorts',
      'Split shorts built for speed.',
      'Shorts',
      image: 'shorts',
      look: 'runningShorts',
    ),
    GarmentTile(
      "Women's shorts",
      'Fitted sport shorts for the track.',
      'Shorts',
      image: 'shorts',
      look: 'womenShorts',
    ),
    GarmentTile(
      'Training tee',
      'Breathable tee for training and warm-ups.',
      'Training Tee',
    ),
    GarmentTile(
      "Women's tee",
      'Fitted tee for training and warm-ups.',
      'Training Tee',
      image: 'women-tee',
      look: 'womenTee',
    ),
    GarmentTile(
      'Long-sleeve tee',
      'Long-sleeve tee for training and travel.',
      'Compression top',
      image: 'longsleeve-tee',
      look: 'lsTee',
    ),
    GarmentTile(
      'Raglan long-sleeve',
      'Raglan long-sleeve tee with contrast sleeves.',
      'Compression top',
      image: 'raglan-longsleeve',
      look: 'raglanLs',
    ),
    GarmentTile(
      'Running tights',
      'Long, 3/4 or short compression tights.',
      'Shorts',
      image: 'leggings',
      look: 'womenLeggings',
    ),
    GarmentTile(
      'Compression pants',
      'Full-length compression pants for the track.',
      'Shorts',
      image: 'leggings',
      look: 'compressionPants',
    ),
    GarmentTile(
      "Men's tights",
      "Full-length men's running tights.",
      'Shorts',
      image: 'leggings',
      look: 'menTights',
    ),
    GarmentTile(
      'Track jacket',
      'Full-zip jacket for warm-ups.',
      'Track jacket',
    ),
    GarmentTile(
      'Track pants',
      'Tapered pants to match the jacket.',
      'Shorts',
      image: 'track-pants',
      look: 'tpModel',
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
    GarmentTile(
      'Rash guard',
      'Sun-smart stretch top for the water.',
      'Training Tee',
      image: 'rash-guard',
      look: 'rashGuard',
    ),
    GarmentTile(
      'Club singlet',
      'Light singlet for squad training.',
      'Singlet',
      look: 'singletModel',
    ),
    GarmentTile(
      "Women's singlet",
      'Fitted racerback singlet for squad training.',
      'Singlet',
      image: 'singlet',
      look: 'womenSinglet',
    ),
    GarmentTile('Deck shorts', 'Quick-dry shorts for the pool deck.', 'Shorts'),
    GarmentTile(
      'Swim shorts',
      'Drawstring swim shorts in quick-dry fabric.',
      'Shorts',
      image: 'shorts',
      look: 'swimShorts',
    ),
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
    // (Client 2026-11-17, 582: on the ready-made polo model, its picture kept.)
    // (CLIENT598 2026-11-23, client 617 + "Polo shirt with buttons, Polo
    // shirt with zip": renamed (designs keep garment Polo), the zip one with
    // the Zip-up collar, each on its own picture from our 3D polo.)
    GarmentTile(
      'Polo shirt with buttons',
      'Classic polo with a button placket.',
      'Polo',
      image: 'polo-buttons',
      look: 'poloZip',
    ),
    GarmentTile(
      'Polo shirt with zip',
      'Polo with a full-length zip.',
      'Polo',
      image: 'polo-zip',
      look: 'poloZipUp',
    ),
    GarmentTile(
      'Long-sleeve polo',
      'Long-sleeve raglan polo for league nights.',
      'Polo',
      image: 'polo',
      look: 'longsleevePolo',
    ),
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
    GarmentTile(
      'Touch singlet',
      'Sleeveless top for hot days.',
      'Singlet',
      look: 'singletModel',
    ),
    GarmentTile(
      "Women's singlet",
      'Fitted racerback singlet for touch.',
      'Singlet',
      image: 'singlet',
      look: 'womenSinglet',
    ),
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
    GarmentTile(
      'Long-sleeve polo',
      'Long-sleeve raglan polo for the field.',
      'Polo',
      image: 'polo',
      look: 'longsleevePolo',
    ),
    GarmentTile.soon(
      'Cricket pants',
      'Matching long trousers.',
      'cricket-pants',
      'track-pants',
    ),
    GarmentTile('Training tee', 'Breathable tee for the nets.', 'Training Tee'),
    GarmentTile(
      "Women's tee",
      'Fitted tee for training and warm-ups.',
      'Training Tee',
      image: 'women-tee',
      look: 'womenTee',
    ),
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
    GarmentTile(
      'Softball jersey',
      'Button-front jersey with script lettering.',
      'Jersey',
      image: 'jersey',
      look: 'baseballJersey',
    ),
    GarmentTile('Training tee', 'Breathable tee for practice.', 'Training Tee'),
    GarmentTile(
      "Women's tee",
      'Fitted tee for training and warm-ups.',
      'Training Tee',
      image: 'women-tee',
      look: 'womenTee',
    ),
    GarmentTile('Club polo', 'Smart polo for coaches.', 'Polo'),
    GarmentTile(
      'Training shorts',
      'Light shorts for practice.',
      'Shorts',
      image: 'shorts',
      look: 'trainingShorts',
    ),
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
      look: 'singletModel',
    ),
    GarmentTile(
      "Women's singlet",
      'Fitted racerback singlet for beach and indoor.',
      'Singlet',
      image: 'singlet',
      look: 'womenSinglet',
    ),
    GarmentTile('Volleyball shorts', 'Short shorts for the court.', 'Shorts'),
    GarmentTile(
      'Full kit',
      'Jersey and shorts, designed together.',
      'Full Kit',
    ),
    GarmentTile('Training tee', 'Breathable tee for training.', 'Training Tee'),
    GarmentTile(
      "Women's tee",
      'Fitted tee for training and warm-ups.',
      'Training Tee',
      image: 'women-tee',
      look: 'womenTee',
    ),
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
      "Women's tee",
      'Fitted tee for training and warm-ups.',
      'Training Tee',
      image: 'women-tee',
      look: 'womenTee',
    ),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for the sideline.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Track jacket', 'Full-zip jacket for travel.', 'Track jacket'),
  ],
  'cycling': [
    GarmentTile(
      'Cycling jersey',
      'Close-fitting jersey with rear pockets.',
      'Jersey',
      image: 'jersey',
      look: 'cyclingJersey',
    ),
    GarmentTile(
      'MTB jersey',
      'Loose long-sleeve jersey for the trails.',
      'Jersey',
      image: 'jersey',
      look: 'mtbJersey',
    ),
    GarmentTile.soon(
      'Bib shorts',
      'Padded bib shorts for the long ride.',
      'bib-shorts',
      'bib-shorts',
    ),
    GarmentTile(
      'Race singlet',
      'Sleeveless top for hot rides.',
      'Singlet',
      look: 'singletModel',
    ),
    GarmentTile(
      "Women's singlet",
      'Fitted racerback singlet for hot rides.',
      'Singlet',
      image: 'singlet',
      look: 'womenSinglet',
    ),
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
    GarmentTile(
      'Race jersey',
      'Loose long-sleeve jersey with bold graphics.',
      'Jersey',
      image: 'jersey',
      look: 'bmxRaceJersey',
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
      'Long-sleeve polo',
      'Long-sleeve raglan polo for the green.',
      'Polo',
      image: 'polo',
      look: 'longsleevePolo',
    ),
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
      "Women's tee",
      'Fitted tee for training and warm-ups.',
      'Training Tee',
      image: 'women-tee',
      look: 'womenTee',
    ),
    GarmentTile(
      'Long-sleeve tee',
      'Long-sleeve tee for training and travel.',
      'Compression top',
      image: 'longsleeve-tee',
      look: 'lsTee',
    ),
    GarmentTile(
      'Raglan long-sleeve',
      'Raglan long-sleeve tee with contrast sleeves.',
      'Compression top',
      image: 'raglan-longsleeve',
      look: 'raglanLs',
    ),
    GarmentTile(
      'Training singlet',
      'Lightweight singlet for hot sessions.',
      'Singlet',
      look: 'singletModel',
    ),
    GarmentTile(
      "Women's singlet",
      'Fitted racerback singlet for hot sessions.',
      'Singlet',
      image: 'singlet',
      look: 'womenSinglet',
    ),
    GarmentTile(
      'Training shorts',
      'Light shorts that move with you.',
      'Shorts',
      image: 'shorts',
      look: 'trainingShorts',
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
      'Sleeveless hoodie',
      'Sleeveless hoodie for warm-ups.',
      'Hoodie',
      image: 'team-hoodie',
      look: 'sleevelessHoodie',
    ),
    GarmentTile(
      'Sweatshirt',
      'Crew-neck sweatshirt for warm-ups.',
      'Hoodie',
      image: 'team-hoodie',
      look: 'sweatshirt',
    ),
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
    GarmentTile(
      'Rash guard',
      'Compression top for the mat.',
      'Training Tee',
      image: 'rash-guard',
      look: 'rashGuard',
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
      "Women's tee",
      'Fitted tee for training and warm-ups.',
      'Training Tee',
      image: 'women-tee',
      look: 'womenTee',
    ),
    GarmentTile(
      'Training singlet',
      'Lightweight singlet for conditioning.',
      'Singlet',
      look: 'singletModel',
    ),
    GarmentTile(
      "Women's singlet",
      'Fitted racerback singlet for conditioning.',
      'Singlet',
      image: 'singlet',
      look: 'womenSinglet',
    ),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for the walk-out.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Zip hoodie', 'Full-zip layer for weigh-ins.', 'Zip hoodie'),
    GarmentTile(
      'Sleeveless hoodie',
      'Sleeveless hoodie for the walk-out.',
      'Hoodie',
      image: 'team-hoodie',
      look: 'sleevelessHoodie',
    ),
    GarmentTile(
      'Corner jacket',
      'Full-zip jacket for the team.',
      'Track jacket',
    ),
    GarmentTile(
      'Compression spats',
      'Compression tights for grappling.',
      'Shorts',
      image: 'leggings',
      look: 'womenLeggings',
    ),
    GarmentTile(
      'Compression pants',
      'Full-length compression pants for the mat.',
      'Shorts',
      image: 'leggings',
      look: 'compressionPants',
    ),
    GarmentTile(
      "Men's tights",
      "Full-length men's tights for the mat.",
      'Shorts',
      image: 'leggings',
      look: 'menTights',
    ),
  ],
  'fishing': [
    GarmentTile(
      'Fishing shirt',
      'Light sun-smart shirt with ocean graphics.',
      'Hoodie',
      image: 'team-hoodie',
      look: 'hoodedTee',
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
      look: 'fishingHoodie',
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
    GarmentTile(
      'Muscle singlet',
      'Muscle-fit singlet for lifting.',
      'Singlet',
      look: 'singletModel',
    ),
    GarmentTile(
      "Women's singlet",
      'Fitted racerback singlet for lifting.',
      'Singlet',
      image: 'singlet',
      look: 'womenSinglet',
    ),
    GarmentTile('Gym tee', 'Fitted tee for every session.', 'Training Tee'),
    GarmentTile(
      'Long-sleeve tee',
      'Long-sleeve tee for training and travel.',
      'Compression top',
      image: 'longsleeve-tee',
      look: 'lsTee',
    ),
    GarmentTile(
      'Raglan long-sleeve',
      'Raglan long-sleeve tee with contrast sleeves.',
      'Compression top',
      image: 'raglan-longsleeve',
      look: 'raglanLs',
    ),
    // (In the website's order: config/catalog.php gymwear.)
    GarmentTile(
      "Women's fitness top",
      'Cropped long-sleeve fitness top in stretch fabric.',
      'Compression top',
      image: 'nfl-compression-top',
      look: 'fitnessTop',
    ),
    GarmentTile(
      'Sports bra',
      'Racerback sports bra with a wide underband.',
      'Singlet',
      image: 'netball-training-singlet',
      look: 'sportsBra',
    ),
    GarmentTile(
      "Women's fitness bottoms",
      'High-waisted fitness bottoms in stretch fabric.',
      'Shorts',
      image: 'leggings',
      look: 'fitnessBottoms',
    ),
    GarmentTile(
      "Women's shorts",
      'Fitted sport shorts for training.',
      'Shorts',
      image: 'shorts',
      look: 'womenShorts',
    ),
    GarmentTile('Gym shorts', 'Light shorts for training.', 'Shorts'),
    GarmentTile(
      'Leggings',
      'Squat-proof leggings and tights.',
      'Shorts',
      image: 'leggings',
      look: 'womenLeggings',
    ),
    GarmentTile(
      'Compression pants',
      'Full-length compression pants for lifting.',
      'Shorts',
      image: 'leggings',
      look: 'compressionPants',
    ),
    GarmentTile(
      "Men's tights",
      "Full-length men's tights for training.",
      'Shorts',
      image: 'leggings',
      look: 'menTights',
    ),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for warm-ups.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Zip hoodie', 'Full-zip layer for the gym.', 'Zip hoodie'),
    GarmentTile(
      'Sleeveless hoodie',
      'Sleeveless hoodie for training.',
      'Hoodie',
      image: 'team-hoodie',
      look: 'sleevelessHoodie',
    ),
    GarmentTile(
      'Track jacket',
      'Full-zip jacket for warm-ups.',
      'Track jacket',
    ),
    GarmentTile(
      'Track pants',
      'Tapered pants to match the jacket.',
      'Shorts',
      image: 'track-pants',
      look: 'tpModel',
    ),
  ],
  'teamwear': [
    GarmentTile('Club polo', 'Smart polo with your crest.', 'Polo'),
    GarmentTile(
      'Long-sleeve polo',
      'Long-sleeve raglan polo with your crest.',
      'Polo',
      image: 'polo',
      look: 'longsleevePolo',
    ),
    GarmentTile('Club tee', 'Soft tee for the clubhouse.', 'Training Tee'),
    GarmentTile(
      'Long-sleeve tee',
      'Long-sleeve tee for training and travel.',
      'Compression top',
      image: 'longsleeve-tee',
      look: 'lsTee',
    ),
    GarmentTile(
      'Raglan long-sleeve',
      'Raglan long-sleeve tee with contrast sleeves.',
      'Compression top',
      image: 'raglan-longsleeve',
      look: 'raglanLs',
    ),
    GarmentTile('Club shorts', 'Casual shorts for travel.', 'Shorts'),
    GarmentTile(
      'Club hoodie',
      'Warm hoodie for the sideline.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile('Zip hoodie', 'Full-zip layer for travel.', 'Zip hoodie'),
    GarmentTile(
      'Sweatshirt',
      'Crew-neck sweatshirt for the sideline.',
      'Hoodie',
      image: 'team-hoodie',
      look: 'sweatshirt',
    ),
    GarmentTile(
      'Varsity jacket',
      'Letterman jacket for the club.',
      'Varsity jacket',
    ),
    GarmentTile('Track jacket', 'Full-zip jacket for travel.', 'Track jacket'),
    GarmentTile(
      'Puffer vest',
      'Quilted puffer vest for travel.',
      'Track jacket',
      image: 'waterproof-jacket',
      look: 'pufferVest',
    ),
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
      'Sweatshirt',
      'Crew-neck sweatshirt with your year.',
      'Hoodie',
      image: 'team-hoodie',
      look: 'sweatshirt',
    ),
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
  SportCategory(
    'headwear',
    'Headwear',
    'apparel',
    'Cap + Bucket hat + Beanie',
    more: false,
    names: false,
    numbers: false,
    hint:
        'headwear: team caps, bucket hats and knitted beanies with the club '
        'logo, black with bright accent piping and stripes',
  ),
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
