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

  /// The image model's style hint, sent with the sport's name.
  final String? hint;

  /// The AI Designer tile's label when it differs from [name].
  final String? aiLabel;

  /// The sport as the AI prompts name it: "Golf (golf: a premium ...)".
  String get forAi => hint == null ? name : '$name ($hint)';
}

/// App garment name -> the website's 3D garment id (config/catalog.php).
const garmentIds = {
  'Jersey': 'jersey',
  'Shorts': 'shorts',
  'Training Tee': 'tee',
  'Singlet': 'singlet',
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
  }) : fit = 'exact',
       future = null,
       _image = image;
  const GarmentTile.nearest(
    this.name,
    this.description,
    String this.garment, {
    required String this.future,
    String? image,
    this.trackStyle,
  }) : fit = 'nearest',
       _image = image;
  const GarmentTile.soon(
    this.name,
    this.description,
    String this.future,
    String image,
  ) : garment = null,
      fit = 'soon',
      trackStyle = null,
      _image = image;

  final String name, description, fit;

  /// The app's garment name (null: coming soon).
  final String? garment;

  /// The 3D garment still to build (nearest and coming-soon tiles).
  final String? future;

  /// The track jacket's style the tile starts with ('hood'), if any.
  final String? trackStyle;
  final String? _image;

  bool get soon => garment == null;

  /// The picture: assets/images/showroom/garment-<art>.webp.
  String get art => _image ?? garmentIds[garment] ?? 'jersey';
}

const _sportTiles = <String, List<GarmentTile>>{
  'rugby-league': [
    GarmentTile(
      'Rugby League Kit',
      'Jersey, playing shorts and socks.',
      'Full Kit',
    ),
    GarmentTile('Jersey', 'Performance rugby league jersey.', 'Jersey'),
    GarmentTile('Playing Shorts', 'Durable rugby league shorts.', 'Shorts'),
    GarmentTile.soon('Socks', 'Knee-high match socks.', 'socks', 'socks'),
    GarmentTile('Polo', 'Smart team polo with collar.', 'Polo'),
    GarmentTile('Training Tee', 'Breathable tee for training.', 'Training Tee'),
    GarmentTile(
      'Training Shorts',
      'Lightweight shorts with zip pockets.',
      'Shorts',
    ),
    GarmentTile.nearest(
      'Hooded Tracksuit',
      'Full-zip jacket with hood and pants.',
      'Track jacket',
      future: 'tracksuit',
      image: 'hooded-tracksuit',
      trackStyle: 'hood',
    ),
    GarmentTile.soon('Cap', 'Curved brim sports cap.', 'cap', 'cap'),
    GarmentTile.soon(
      'Bucket Hat',
      'Wide brim bucket hat.',
      'bucket-hat',
      'bucket-hat',
    ),
    GarmentTile.nearest(
      'Waterproof Jacket',
      'Weatherproof jacket with hood.',
      'Track jacket',
      future: 'waterproof-jacket',
      image: 'waterproof-jacket',
      trackStyle: 'hood',
    ),
  ],
  'rugby-union': [
    GarmentTile('Rugby Kit', 'Jersey, playing shorts and socks.', 'Full Kit'),
    GarmentTile('Jersey', 'Performance rugby jersey.', 'Jersey'),
    GarmentTile('Playing Shorts', 'Durable rugby shorts.', 'Shorts'),
    GarmentTile.soon('Socks', 'Knee-high match socks.', 'socks', 'socks'),
    GarmentTile('Polo', 'Smart team polo with collar.', 'Polo'),
    GarmentTile('Training Tee', 'Breathable tee for training.', 'Training Tee'),
    GarmentTile(
      'Training Shorts',
      'Lightweight shorts with zip pockets.',
      'Shorts',
    ),
    GarmentTile.nearest(
      'Hooded Tracksuit',
      'Full-zip jacket with hood and pants.',
      'Track jacket',
      future: 'tracksuit',
      image: 'hooded-tracksuit',
      trackStyle: 'hood',
    ),
    GarmentTile.soon('Cap', 'Curved brim sports cap.', 'cap', 'cap'),
    GarmentTile.soon(
      'Bucket Hat',
      'Wide brim bucket hat.',
      'bucket-hat',
      'bucket-hat',
    ),
    GarmentTile.nearest(
      'Waterproof Jacket',
      'Weatherproof jacket with hood.',
      'Track jacket',
      future: 'waterproof-jacket',
      image: 'waterproof-jacket',
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
    GarmentTile.soon(
      'Football socks',
      'Match socks with team bands.',
      'socks',
      'socks',
    ),
  ],
  'basketball': [
    GarmentTile(
      'Basketball singlet',
      'Game singlet with a big number.',
      'Singlet',
    ),
    GarmentTile.nearest(
      'Basketball shorts',
      'Long, loose game shorts.',
      'Shorts',
      future: 'basketball-shorts',
      image: 'basketball-shorts',
    ),
    GarmentTile.nearest(
      'Shooting shirt',
      'Warm-up shirt for the shoot-around.',
      'Training Tee',
      future: 'shooting-shirt',
      image: 'shooting-shirt',
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
    GarmentTile.nearest(
      'Netball dress',
      'Fitted netball dress with skirt hem.',
      'Singlet',
      future: 'dress',
      image: 'netball-dress',
    ),
    GarmentTile.soon(
      'Netball skirt',
      'Athletic skirt with team styling.',
      'skirt',
      'netball-skirt',
    ),
    GarmentTile(
      'Singlet with bib',
      'Netball singlet with removable bib.',
      'Singlet',
      image: 'singlet-bib',
    ),
    GarmentTile('Training singlet', 'Lightweight top for training.', 'Singlet'),
    GarmentTile(
      'Training T-shirt',
      'Breathable tee for training and warm-ups.',
      'Training Tee',
    ),
    GarmentTile.nearest(
      'Netball bibs',
      'Pullover bibs with position patches.',
      'Singlet',
      future: 'bibs',
      image: 'bibs',
    ),
    GarmentTile.nearest(
      'Tracksuit',
      'Full-zip jacket and matching pants.',
      'Track jacket',
      future: 'tracksuit',
      image: 'tracksuit',
    ),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for on and off court.',
      'Hoodie',
      image: 'team-hoodie',
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
    GarmentTile.soon(
      'Footy socks',
      'Match socks with team bands.',
      'socks',
      'socks',
    ),
  ],
  'hockey': [
    GarmentTile('Hockey jersey', 'Match shirt in your team colours.', 'Jersey'),
    GarmentTile('Hockey shorts', 'Light shorts for fast play.', 'Shorts'),
    GarmentTile.soon(
      'Hockey skort',
      'Skirt with built-in shorts.',
      'skirt',
      'netball-skirt',
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
    GarmentTile.soon(
      'Hockey socks',
      'Long socks with team bands.',
      'socks',
      'socks',
    ),
  ],
  'american-football': [
    GarmentTile.nearest(
      'Game jersey',
      'Wide-cut jersey with big block numbers.',
      'Jersey',
      future: 'nfl-jersey',
    ),
    GarmentTile('Practice shorts', 'Light shorts for practice days.', 'Shorts'),
    GarmentTile(
      'Training tee',
      'Breathable tee for training and warm-ups.',
      'Training Tee',
    ),
    GarmentTile('Sideline polo', 'Smart polo for coaches and staff.', 'Polo'),
    GarmentTile(
      'Hoodie',
      'Warm hoodie for the sideline.',
      'Hoodie',
      image: 'team-hoodie',
    ),
    GarmentTile(
      'Varsity jacket',
      'Letterman jacket for the team.',
      'Varsity jacket',
    ),
    GarmentTile('Track jacket', 'Full-zip jacket for travel.', 'Track jacket'),
    GarmentTile.soon('Cap', 'Team cap with an embroidered logo.', 'cap', 'cap'),
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
    GarmentTile.soon(
      'Golf cap',
      'Cap with an embroidered club logo.',
      'cap',
      'cap',
    ),
    GarmentTile.soon(
      'Bucket hat',
      'Sun-smart hat for the course.',
      'bucket-hat',
      'bucket-hat',
    ),
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
    GarmentTile.soon(
      'Tennis skirt',
      'Pleated skirt with inner shorts.',
      'skirt',
      'netball-skirt',
    ),
    GarmentTile(
      'Track jacket',
      'Full-zip jacket for warm-ups.',
      'Track jacket',
    ),
    GarmentTile.soon('Cap', 'Sun cap with your club logo.', 'cap', 'cap'),
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
    GarmentTile.soon('Cap', 'Team cap with an embroidered logo.', 'cap', 'cap'),
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
    GarmentTile.soon('Cricket cap', 'Cap in your club colours.', 'cap', 'cap'),
    GarmentTile.soon(
      'Bucket hat',
      'Wide-brim hat for the field.',
      'bucket-hat',
      'bucket-hat',
    ),
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
    GarmentTile.soon('Cap', 'Ball cap with your team logo.', 'cap', 'cap'),
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
    GarmentTile.soon(
      'Cycling cap',
      'Cotton cap with a short peak.',
      'cap',
      'cap',
    ),
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
    GarmentTile.soon('Cap', 'Team cap with an embroidered logo.', 'cap', 'cap'),
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
    GarmentTile.soon(
      'Bucket hat',
      'Sun-smart hat for the green.',
      'bucket-hat',
      'bucket-hat',
    ),
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
    GarmentTile.soon('Cap', 'Team cap with an embroidered logo.', 'cap', 'cap'),
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
    GarmentTile.soon(
      'Bucket hat',
      'Sun-smart hat with a wide brim.',
      'bucket-hat',
      'bucket-hat',
    ),
    GarmentTile.soon('Cap', 'Cap with your club logo.', 'cap', 'cap'),
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
    GarmentTile.soon('Cap', 'Work cap with your business logo.', 'cap', 'cap'),
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
    GarmentTile.soon('Club cap', 'Cap with your club crest.', 'cap', 'cap'),
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
  SportCategory('netball', 'Netball', 'sports', 'Dress + Bodysuit'),
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
