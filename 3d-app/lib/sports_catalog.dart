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
    this.kit,
    this.garments, {
    this.hint,
    this.aiLabel,
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

  /// The garments offered, most likely first (app garment names): the DYO
  /// garment step and the AI Designer's garment chips.
  final List<String> garments;

  /// The image model's style hint, sent with the sport's name.
  final String? hint;

  /// The AI Designer tile's label when it differs from [name].
  final String? aiLabel;

  /// The sport as the AI prompts name it: "Golf (golf: a premium ...)".
  String get forAi => hint == null ? name : '$name ($hint)';
}

const _all = [
  'Jersey',
  'Full Kit',
  'Shorts',
  'Training Tee',
  'Singlet',
  'Polo',
  'Track jacket',
];

const sportCategories = <SportCategory>[
  SportCategory(
    'rugby-league',
    'Rugby League',
    'sports',
    'Jersey + Shorts',
    _all,
  ),
  SportCategory('basketball', 'Basketball', 'sports', 'Singlet + Shorts', [
    'Singlet',
    'Full Kit',
    'Shorts',
    'Training Tee',
    'Polo',
    'Varsity jacket',
    'Track jacket',
  ]),
  SportCategory('football', 'Soccer', 'sports', 'Jersey + Shorts', _all),
  SportCategory('afl', 'AFL', 'sports', 'Guernsey + Shorts', _all),
  SportCategory('netball', 'Netball', 'sports', 'Dress + Bodysuit', [
    'Singlet',
    'Shorts',
    'Training Tee',
    'Polo',
    'Track jacket',
  ]),
  SportCategory(
    'rugby-union',
    'Rugby Union',
    'sports',
    'Jersey + Shorts',
    _all,
  ),
  SportCategory(
    'hockey',
    'Ice Hockey',
    'sports',
    'Jersey + Socks',
    _all,
    aiLabel: 'Hockey',
  ),
  // Added 2026-10-21 (task 9.79). The client's first six come first.
  SportCategory(
    'american-football',
    'American Football',
    'sports',
    'Jersey + Pants',
    ['Jersey', 'Full Kit', 'Shorts', 'Training Tee', 'Varsity jacket'],
    hint:
        'American football: a short-sleeve jersey cut wide over the shoulder '
        'pads, big block numbers on the front, back and sleeves, sleeve stripes',
  ),
  SportCategory(
    'golf',
    'Golf',
    'sports',
    'Polo',
    ['Polo', 'Training Tee'],
    hint:
        'golf: a premium fitted performance polo, clean and understated; a '
        'quarter-zip pullover suits too',
  ),
  SportCategory(
    'tennis',
    'Tennis',
    'sports',
    'Polo + Shorts',
    ['Polo', 'Training Tee', 'Shorts', 'Singlet'],
    hint:
        "tennis: a crisp performance polo or crew tee with shorts; a skirt or "
        "dress for women's kits",
  ),
  SportCategory(
    'athletics',
    'Athletics',
    'sports',
    'Singlet + Shorts',
    ['Singlet', 'Shorts', 'Training Tee', 'Track jacket'],
    hint:
        'athletics and running: a racing singlet with split shorts; a crop top '
        'for women',
  ),
  SportCategory(
    'swimming',
    'Swimming',
    'sports',
    'Deck coat + Tee',
    ['Training Tee', 'Polo', 'Singlet', 'Shorts', 'Hoodie'],
    hint:
        'swimming: club deck apparel (tees, hoodies, parka-style deck coats) '
        'with swim caps in the club colours',
  ),
  SportCategory(
    'darts',
    'Darts & Pool',
    'sports',
    'Polo with pocket',
    ['Polo with pocket', 'Polo', 'Training Tee'],
    hint:
        "darts and pool: a sublimated polo with a chest pocket, the player's "
        'name across the back shoulders and sponsors on the back and sleeves',
  ),
  SportCategory(
    'touch',
    'Touch',
    'sports',
    'Tee + Shorts',
    ['Training Tee', 'Full Kit', 'Shorts', 'Singlet', 'Track jacket'],
    hint:
        'Touch football and Oztag: a lightweight raglan tee or singlet with '
        'shorts',
  ),
  SportCategory(
    'cricket',
    'Cricket',
    'sports',
    'Shirt + Trousers',
    ['Polo', 'Training Tee', 'Jersey', 'Track jacket'],
    hint:
        'cricket: a one-day cricket shirt with a polo collar (short or long '
        'sleeves) and matching long trousers; whites for the long format',
  ),
  SportCategory(
    'softball',
    'Softball',
    'sports',
    'Jersey + Pants',
    ['Jersey', 'Training Tee', 'Polo', 'Shorts', 'Varsity jacket'],
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
    ['Jersey', 'Singlet', 'Shorts', 'Full Kit'],
    hint:
        'volleyball: a fitted short-sleeve or sleeveless jersey with a big '
        'number, short shorts',
  ),
  SportCategory(
    'lacrosse',
    'Lacrosse',
    'sports',
    'Pinnie + Shorts',
    ['Singlet', 'Shorts', 'Jersey', 'Full Kit'],
    hint:
        'lacrosse: a loose sleeveless pinnie with a big number, long lacrosse '
        'shorts',
  ),
  SportCategory(
    'cycling',
    'Cycling',
    'sports',
    'Jersey + Bibs',
    ['Jersey', 'Singlet', 'Shorts'],
    hint:
        'cycling: a close-fitting full-zip cycling jersey with rear pockets, '
        'bib shorts',
  ),
  SportCategory(
    'bmx',
    'BMX',
    'sports',
    'Jersey + Pants',
    ['Jersey', 'Full Kit', 'Training Tee'],
    hint:
        'BMX and motocross: a loose long-sleeve V-neck race jersey with bold '
        'graphics, vented race pants',
  ),
  SportCategory(
    'lawn-bowls',
    'Lawn Bowls',
    'sports',
    'Club polo',
    ['Polo', 'Training Tee'],
    hint:
        'lawn bowls: a smart club polo with a collar, light sublimated '
        'patterns',
  ),
  SportCategory(
    'esports',
    'Esports',
    'sports',
    'Gaming jersey',
    ['Jersey', 'Training Tee', 'Polo'],
    hint:
        'esports: a pro gaming jersey with sharp sublimated graphics, sponsor '
        'patches and the gamer tag across the back',
  ),
  SportCategory('training', 'Training / Gym', 'apparel', 'Tee + Hoodie', [
    'Training Tee',
    'Singlet',
    'Shorts',
    'Polo',
    'Jersey',
    'Hoodie',
    'Zip hoodie',
    'Varsity jacket',
    'Track jacket',
  ], aiLabel: 'Training'),
  SportCategory(
    'fight-wear',
    'Fight Wear',
    'apparel',
    'Rash guard + Fight shorts',
    ['Training Tee', 'Shorts', 'Singlet'],
    hint:
        'fight wear (MMA, boxing, BJJ, Muay Thai): a compression rash guard '
        'and fight shorts with side splits',
  ),
  SportCategory(
    'fishing',
    'Fishing',
    'apparel',
    'Fishing shirt',
    ['Jersey', 'Polo', 'Training Tee', 'Hoodie'],
    hint:
        'fishing: a lightweight long-sleeve fishing shirt with a zip or button '
        'collar or a hood, ocean graphics',
  ),
  SportCategory(
    'workwear',
    'Workwear',
    'apparel',
    'Hi-vis shirt + Pants',
    ['Polo', 'Training Tee', 'Jersey'],
    hint:
        'workwear and hi-vis: a fluoro work shirt or polo with reflective tape '
        'bands and the business logo',
  ),
  SportCategory(
    'gymwear',
    'Gymwear',
    'apparel',
    'Singlet + Shorts',
    ['Singlet', 'Training Tee', 'Shorts', 'Hoodie', 'Zip hoodie', 'Track jacket'],
    hint:
        'gym and fitness wear: a muscle-fit singlet or tee with training '
        'shorts',
  ),
  SportCategory(
    'teamwear',
    'Club Casual',
    'apparel',
    'Club polo + Shorts',
    [
      'Polo',
      'Training Tee',
      'Shorts',
      'Hoodie',
      'Zip hoodie',
      'Varsity jacket',
      'Track jacket',
    ],
    hint:
        'club casual teamwear: a smart club polo or tee with an embroidered '
        'crest',
  ),
  SportCategory(
    'school-leavers',
    'School Leavers',
    'apparel',
    'Leavers jersey',
    [
      'Jersey',
      'Polo',
      'Training Tee',
      'Hoodie',
      'Zip hoodie',
      'Varsity jacket',
      'Track jacket',
    ],
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
