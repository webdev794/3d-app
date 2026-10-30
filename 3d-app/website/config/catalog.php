<?php

/*
 * Garment tiles (task 9.99, client visual images/157.jpg): each sport's own garments in Design Your Own step 2, the AI
 * designer's garment chips and the app's garment step, in the sport's own words, most likely first.
 *   $tile: a garment we have in 3D (the 3D garment id).
 *   $near: no 3D model of its own yet; the 3D preview uses the nearest one ('fit' => 'nearest', "3D preview uses ...").
 *   $soon: no 3D model yet and none close enough: shown with a COMING SOON badge, not selectable ('garment' => null).
 * 'future' names the 3D garment still to build (tasks.md 9.80 build order): when it is built, its tiles become $tile.
 * 'image': the tile's picture, media/showroom/garment-<image>.webp (the 3D garment's own picture when left out).
 * A sport's garment step can also set (each optional, the defaults are what every other sport shows):
 *   'heading' (the name in "<NAME> UNIFORMS & TEAMWEAR"), 'subtitle' (default "Choose what you want to design for <name>."),
 *   'select_hint' (a line between "Change sport" and "Continue to studio"; none by default), 'descriptions' => false (tiles show
 *   names only), 'backdrop' (media/showroom/<backdrop>.webp behind the step; default stadium-stage), 'more' => false (no
 *   "More teamwear").
 * The AI designer's marking rules for a sport (client 2026-10-26, images/175.jpg), each optional: 'names' => false (no
 *   player names anywhere), 'numbers' => false (no numbers anywhere), 'positions' (the playing position letters shown
 *   large on the front and back instead, as on netball bibs). Every sport gets the club's symbol on the chest and a small
 *   3DEEZI word mark under the back collar (OpenAiDesigner::BRAND_RULES).
 */
$tile = fn (string $name, string $description, string $garment, ?string $image = null) => ['name' => $name, 'description' => $description, 'garment' => $garment, 'fit' => 'exact', 'image' => $image ?? $garment];
$near = fn (string $name, string $description, string $garment, string $future, ?string $image = null) => ['name' => $name, 'description' => $description, 'garment' => $garment, 'fit' => 'nearest', 'future' => $future, 'image' => $image ?? $garment];
$soon = fn (string $name, string $description, string $future, string $image) => ['name' => $name, 'description' => $description, 'garment' => null, 'fit' => 'soon', 'future' => $future, 'image' => $image];
/*
 * A tile's starting look (task 9.154): "Continue to Studio" opens the garment looking like its tile picture. The
 * pictures share the 3DEEZI look (black body, bright cyan areas), so each tile names one of these looks; Colours,
 * Patterns and Parts change it as usual. The apps keep the same looks (lib/sports_catalog.dart tileLook).
 *   plain: black, no pattern; sides: cyan side panels; sleeves: cyan sleeves and side panels; sleevesOnly: cyan
 *   sleeves; blades: royal blue and cyan blades up the sides and over the shoulders (the Blades pattern); shoulders: cyan
 *   shoulders and sleeves; swoosh: cyan sweeps (the Velocity pattern) with cyan sleeves; nflgame / nflpractice: the American
 *   football jerseys (big 86 front and back).
 */
$look = function (string $name, array $extra = []): array {
    $cyan = '#16b4f0';
    $base = ['main' => '#27282a', 'secondary' => $cyan, 'accent' => $cyan, 'pattern' => 'None', 'patternColor' => $cyan, 'patternColorOwn' => true, 'zones' => [], 'parts' => null, 'gradient' => null, 'gradients' => null, 'zoneColors' => null];
    $solid = fn (string ...$zones) => array_fill_keys($zones, 'Solid');
    $number = fn (string $ink, ?string $line) => ['number' => '86', 'marks' => ['top_number' => ['color' => $ink] + ($line ? ['look' => ['style' => 'outline', 'width' => 0.07, 'color' => $line]] : [])]];
    $looks = [
        'plain' => [],
        'sides' => ['zones' => $solid('sides')],
        'sleeves' => ['zones' => $solid('sleeves', 'sides')],
        'sleevesOnly' => ['zones' => $solid('sleeves')],
        'varsity' => ['zoneColors' => ['body' => '#27282a', 'sleeves' => $cyan, 'rib' => '#27282a', 'ribStripe' => $cyan]],
        // The football / hockey jersey picture (DT3): a royal blue maze (Swirl) over the raglan shoulders and sleeves with
        // cyan piping on the raglan seam, cyan side panels, a black collar, hem and cuffs.
        // (FX3: the maze on the shoulders up to the collar, fading out down the upper sleeves; the arms mostly plain: the
        // Shoulders area only, which reaches over a bare sleeve.)
        'tribal' => ['secondary' => '#27282a', 'patternColor' => '#2a86cc', 'zones' => ['yoke' => 'Swirl'], 'parts' => ['sides' => ['colour' => $cyan]]],
        // The Full kit picture (DT3): a pale blue maze over the shoulders and sleeves, no side panels, black trims, the
        // "3" mark centred above the wordmark.
        'tribalKit' => ['secondary' => '#27282a', 'patternColor' => '#7cc8e2', 'zones' => ['yoke' => 'Swirl', 'sleeves' => 'Swirl'], 'marks' => ['top_crest' => ['x' => 0, 'y' => 0.655, 'scale' => 1.3]]],
        'bladesSides' => ['pattern' => 'Blades', 'zones' => $solid('sides')],
        'shooting' => ['pattern' => 'Blades', 'zones' => $solid('sleeves')],
        'swoosh' => ['pattern' => 'Velocity', 'zones' => $solid('sleeves')],
        // The Rugby League jersey (RL1): royal blue blades with cyan edges over black, the side panels black under the blades.
        'blades' => ['pattern' => 'Blades', 'patternColor' => '#1672f5', 'parts' => ['sides' => ['colour' => '#27282a', 'pattern' => 'Blades']]],
        // The Rugby League jersey and kit (RF1 2026-10-30, the sport's picture kit-rugby-league.webp): the jersey's own
        // Blades (the picture's flames, shoulder stripes and claws), black hem and cuffs (the trims), the cyan collar and a
        // small 3DEEZI line under the "3" mark, the "3" all blue; the kit's shorts without the number and crest, with the picture's tribal side flames
        // (the Blades) and black drawstring tips.
        'rugbyLeague' => ['pattern' => 'Blades', 'patternColor' => '#1672f5', 'secondary' => '#27282a', 'parts' => ['sides' => ['colour' => '#27282a', 'pattern' => 'Blades'], 'collar' => ['colour' => $cyan]], 'zoneColors' => ['crestWord' => $cyan, 'crestMark' => '#1e8ff0', 'cordTips' => '#27282a'], 'marks' => ['shorts_number' => ['hidden' => true], 'shorts_crest' => ['hidden' => true]]],
        'shoulders' => ['zones' => $solid('yoke', 'sleeves')],
        // The hoodies: black, a wide cyan stripe along each sleeve (Hoodie areas › Sleeve stripe), cyan hood lining.
        'hoodie' => ['zoneColors' => ['stripe' => $cyan]],
        // The track jackets (Track jacket areas): black shoulder panels, the cyan sleeve stripe and zips; side panels
        // black ('track') or cyan ('trackSides'); the waterproof jacket's dark grey shell with cyan lower sides and zips.
        'track' => ['zoneColors' => ['shoulder' => '#27282a', 'side' => '#27282a', 'stripe' => $cyan, 'zip' => $cyan]],
        'trackSides' => ['zoneColors' => ['shoulder' => '#27282a', 'side' => $cyan, 'stripe' => $cyan, 'zip' => $cyan]],
        'waterproof' => ['zoneColors' => ['body' => '#24272b', 'shoulder' => '#24272b', 'side' => $cyan, 'stripe' => '#24272b', 'zip' => $cyan]],
        // The Game Kit picture (DT3): the "3" mark small at the V of the neck (the cyan "3" goes on the left chest).
        'nflgame' => ['zones' => $solid('sleeves', 'sides'), 'number' => '86', 'marks' => ['top_number' => ['color' => '#ffffff', 'look' => ['style' => 'outline', 'width' => 0.07, 'color' => $cyan]], 'top_crest' => ['x' => 0, 'y' => 0.655, 'scale' => 0.6]]],
        'nflpractice' => ['zones' => []] + $number($cyan, null),
        // The Game Jersey picture (DT1): a thin cyan line round the white 86, the front number a little bigger and higher.
        // (NF1: the cyan shoulder caps over the pads with piping, black sleeves, a black collar with a cyan inner stripe.)
        // (FX3: the "3" mark at the V on a small black badge, as big as in the picture.)
        'nflgameJersey' => ['zones' => $solid('yoke', 'sides'), 'parts' => ['collar' => ['colour' => '#0b0d10']], 'zoneColors' => ['collarStripe' => $cyan, 'badge' => '#27282a'], 'number' => '86', 'marks' => ['top_number' => ['color' => '#ffffff', 'look' => ['style' => 'outline', 'width' => 0.02, 'color' => $cyan]], 'top_frontNumber' => ['y' => 0.393, 'scale' => 1.17], 'top_crest' => ['x' => 0, 'y' => 0.628, 'scale' => 1.3]]],
        // The Practice Jersey picture (DT1): black collar, the cyan 86 just under the chest logo.
        // (NF1: a cyan stripe over each shoulder along the sleeve seam.)
        // (FX3: black side panels: the picture has none; the small cyan insert in the point of the V, the "3" mark a little
        // lower under it.)
        'nflpracticeJersey' => ['zones' => [], 'zoneColors' => ['stripe' => $cyan, 'vInsert' => $cyan], 'parts' => ['collar' => ['colour' => '#27282a'], 'sides' => ['colour' => '#27282a']], 'number' => '86', 'marks' => ['top_number' => ['color' => $cyan], 'top_frontNumber' => ['y' => 0.43], 'top_crest' => ['x' => 0, 'y' => 0.6, 'scale' => 2.2], 'top_wordmark' => ['y' => 0.548]]],
        // The socks (garment 3): cyan hoops under the top band (their trim colour); the pictures' cyan heel and toe, and the rugby socks' cyan top band, are parts.
        'socksHeel' => ['parts' => ['sockFoot' => ['colour' => $cyan]]],
        // (The rugby socks' top band a deeper blue, as measured on their picture: CF1 2026-10-29.)
        'rugbySocks' => ['parts' => ['sockBand' => ['colour' => '#0b95dd'], 'sockFoot' => ['colour' => $cyan]]],
        // The cap (garment 4): cyan piping (its trim colour); the pictures' cyan and royal blue side sweeps and cyan under the brim.
        'capSweep' => ['parts' => ['capSweep' => ['colour' => $cyan], 'capSweepLow' => ['colour' => '#1a6ef0'], 'capUnder' => ['colour' => $cyan]]],
        // The skirt picture (netball skirt, hockey skort, tennis skirt): its side panels a lighter, greener cyan, as
        // measured on the picture (FM 2026-10-30: 37,198,242).
        'skirt' => ['secondary' => '#25c6f2'],
        // The Netball dress picture (ND1, colours measured on it): its own Blades, royal blue, azure and cyan ribbons down
        // the sides (the side panels printed in one with them), bright cyan armhole binding, a black neck.
        'netballDress' => ['main' => '#1b1d20', 'secondary' => '#00ccff', 'accent' => '#00d0ff', 'pattern' => 'Blades', 'patternColor' => '#0458f0',
            'parts' => ['sides' => ['colour' => '#1b1d20', 'pattern' => 'Blades'], 'collar' => ['colour' => '#1b1d20']]],
    ];
    return $extra + ($looks[$name] ?? []) + $base + ['number' => '23', 'marks' => []];
};

$sports = [
    // The client's own lists and words: Rugby League and Rugby (images/160.jpg, 11 tiles, no "More teamwear"); pictures:
    // the client's own tiles (images/161.jpg) remade in high resolution, garment-rugby-*.webp.
    ['id' => 'rugby-league', 'name' => 'Rugby League', 'description' => 'Made for every tackle. Built for your team.', 'group' => 'sports', 'more' => false, 'tiles' => [
        $tile('Rugby League Kit', 'Jersey, playing shorts and socks.', 'fullkit', 'rugby-kit'),
        $tile('Jersey', 'Performance rugby league jersey.', 'jersey', 'rugby-jersey'),
        $tile('Playing Shorts', 'Durable rugby league shorts.', 'shorts', 'rugby-shorts'),
        $tile('Socks', 'Knee-high match socks.', 'socks', 'rugby-socks'),
        $tile('Polo', 'Smart team polo with collar.', 'polo', 'rugby-polo'),
        $tile('Training Tee', 'Breathable tee for training.', 'tee', 'rugby-tee'),
        $tile('Training Shorts', 'Lightweight shorts with zip pockets.', 'shorts', 'rugby-training-shorts'),
        $near('Hooded Tracksuit', 'Full-zip jacket with hood and pants.', 'trackjacket', 'tracksuit', 'rugby-hooded-tracksuit') + ['design' => ['trackStyle' => 'hood']],
        $tile('Cap', 'Curved brim sports cap.', 'cap', 'rugby-cap'),
        $soon('Bucket Hat', 'Wide brim bucket hat.', 'bucket-hat', 'rugby-bucket-hat'),
        $near('Waterproof Jacket', 'Weatherproof jacket with hood.', 'trackjacket', 'waterproof-jacket', 'rugby-waterproof-jacket') + ['design' => ['trackStyle' => 'hood']],
    ]],
    ['id' => 'rugby-union', 'name' => 'Rugby Union', 'description' => 'A proud tradition. A kit of your own.', 'group' => 'sports',
        // The client's heading for it: RUGBY UNIFORMS & TEAMWEAR.
        'heading' => 'Rugby', 'more' => false, 'tiles' => [
        $tile('Rugby Kit', 'Jersey, playing shorts and socks.', 'fullkit', 'rugby-kit'),
        $tile('Jersey', 'Performance rugby jersey.', 'jersey', 'rugby-jersey'),
        $tile('Playing Shorts', 'Durable rugby shorts.', 'shorts', 'rugby-shorts'),
        $tile('Socks', 'Knee-high match socks.', 'socks', 'rugby-socks'),
        $tile('Polo', 'Smart team polo with collar.', 'polo', 'rugby-polo'),
        $tile('Training Tee', 'Breathable tee for training.', 'tee', 'rugby-tee'),
        $tile('Training Shorts', 'Lightweight shorts with zip pockets.', 'shorts', 'rugby-training-shorts'),
        $near('Hooded Tracksuit', 'Full-zip jacket with hood and pants.', 'trackjacket', 'tracksuit', 'rugby-hooded-tracksuit') + ['design' => ['trackStyle' => 'hood']],
        $tile('Cap', 'Curved brim sports cap.', 'cap', 'rugby-cap'),
        $soon('Bucket Hat', 'Wide brim bucket hat.', 'bucket-hat', 'rugby-bucket-hat'),
        $near('Waterproof Jacket', 'Weatherproof jacket with hood.', 'trackjacket', 'waterproof-jacket', 'rugby-waterproof-jacket') + ['design' => ['trackStyle' => 'hood']],
    ]],
    ['id' => 'football', 'name' => 'Football', 'description' => 'Own the pitch, from first whistle to last.', 'group' => 'sports', 'tiles' => [
        $tile('Football jersey', 'Lightweight match shirt for the pitch.', 'jersey'),
        $tile('Football shorts', 'Light shorts that move with you.', 'shorts'),
        $tile('Full kit', 'Shirt and shorts, designed together.', 'fullkit'),
        $tile('Training tee', 'Breathable tee for training and warm-ups.', 'tee'),
        $near('Training bibs', 'Pull-over bibs for drills and small-sided games.', 'singlet', 'bibs', 'bibs'),
        $tile('Club polo', 'Smart polo for coaches and travel.', 'polo'),
        $tile('Track jacket', 'Full-zip jacket for the bench and travel.', 'trackjacket'),
        $tile('Football socks', 'Match socks with team bands.', 'socks'),
    ]],
    ['id' => 'basketball', 'name' => 'Basketball', 'description' => 'Court-ready looks for a different kind of game.', 'group' => 'sports', 'tiles' => [
        $tile('Basketball singlet', 'Game singlet with a big number.', 'singlet'),
        $near('Basketball shorts', 'Long, loose game shorts.', 'shorts', 'basketball-shorts', 'basketball-shorts'),
        $near('Shooting shirt', 'Warm-up shirt for the shoot-around.', 'tee', 'shooting-shirt', 'shooting-shirt'),
        $tile('Reversible training singlet', 'Light singlet for practice games.', 'singlet'),
        $tile('Training tee', 'Breathable tee for training and warm-ups.', 'tee'),
        $tile('Warm-up hoodie', 'Warm hoodie for the bench and travel.', 'hoodie', 'team-hoodie'),
        $near('Tracksuit', 'Full-zip jacket and matching pants.', 'trackjacket', 'tracksuit', 'tracksuit'),
        $tile('Varsity jacket', 'Letterman jacket for the team.', 'varsity'),
    ]],
    // The client's own list, words and pictures (images/157.jpg; garment-netball-*.webp). Netball has no player names or
    // numbers: bibs carry the playing position letters (client 2026-10-26, images/175.jpg).
    ['id' => 'netball', 'name' => 'Netball', 'description' => 'Move together. Stand out together.', 'group' => 'sports',
        'names' => false, 'numbers' => false, 'positions' => ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'], 'tiles' => [
        // Its own 3D garment since 2026-10-26 (tasks.md 9.126): a women's fitted dress on the female figure.
        $tile('Netball dress', 'Fitted netball dress with skirt hem.', 'netball-dress', 'netball-dress') + ['design' => $look('netballDress')],
        // Its own 3D garment since 2026-10-29 (COMING SOON 10): the A-line skirt with a gathered waistband.
        $tile('Netball skirt', 'Athletic skirt with team styling.', 'skirt', 'netball-skirt'),
        $tile('Singlet with bib', 'Netball singlet with removable bib.', 'singlet', 'netball-singlet-bib'),
        $tile('Training singlet', 'Lightweight top for training.', 'singlet', 'netball-training-singlet'),
        $tile('Training T-shirt', 'Breathable tee for training and warm-ups.', 'tee', 'netball-tee'),
        $near('Netball bibs', 'Pullover bibs with position patches.', 'singlet', 'bibs', 'netball-bibs'),
        $near('Tracksuit', 'Full-zip jacket and matching pants.', 'trackjacket', 'tracksuit', 'netball-tracksuit'),
        $tile('Hoodie', 'Warm hoodie for on and off court.', 'hoodie', 'netball-hoodie'),
    ]],
    ['id' => 'afl', 'name' => 'AFL', 'description' => 'A new look for your next big mark.', 'group' => 'sports', 'tiles' => [
        $near('AFL guernsey', 'Sleeveless match guernsey with your number.', 'singlet', 'guernsey', 'afl-guernsey'),
        $tile('AFL shorts', 'Footy shorts for the contest.', 'shorts'),
        $tile('Training singlet', 'Lightweight singlet for the track.', 'singlet'),
        $tile('Training tee', 'Breathable tee for training and warm-ups.', 'tee'),
        $tile('Club polo', 'Smart polo for match day and travel.', 'polo'),
        $tile('Hoodie', 'Warm hoodie for the bench and the stands.', 'hoodie', 'team-hoodie'),
        $tile('Track jacket', 'Full-zip jacket for the sideline.', 'trackjacket'),
        $tile('Footy socks', 'Match socks with team bands.', 'socks'),
    ]],
    ['id' => 'hockey', 'name' => 'Hockey', 'description' => 'Fast play. Unmistakable team identity.', 'group' => 'sports', 'tiles' => [
        $tile('Hockey jersey', 'Match shirt in your team colours.', 'jersey'),
        $tile('Hockey shorts', 'Light shorts for fast play.', 'shorts'),
        $tile('Hockey skort', 'A-line skirt with side panels.', 'skirt', 'netball-skirt'),
        $tile('Training tee', 'Breathable tee for training and warm-ups.', 'tee'),
        $tile('Club polo', 'Smart polo for coaches and travel.', 'polo'),
        $tile('Hoodie', 'Warm hoodie for the dugout and travel.', 'hoodie', 'team-hoodie'),
        $tile('Track jacket', 'Full-zip jacket for the sideline.', 'trackjacket'),
        $tile('Hockey socks', 'Long socks with team bands.', 'socks'),
    ]],
    // Added 2026-10-21 (task 9.79). The client's first six: American football, golf, tennis, athletics, swimming, darts.
    // American Football: the client's own list, words and pictures (images/165.jpg, 16 tiles in a 4 x 4 grid, names only, no
    // "More teamwear"; garment-nfl-*.webp) on a night football field (media/showroom/stage-american-football.webp).
    ['id' => 'american-football', 'name' => 'American Football', 'description' => 'Big numbers. Bigger game days.', 'group' => 'sports',
        'prompt' => 'American football: a short-sleeve jersey cut wide over the shoulder pads, big block numbers on the front, back and sleeves, sleeve stripes',
        'subtitle' => 'Choose your game uniform, practice wear or sideline apparel.', 'select_hint' => 'Select a garment to customise.',
        'descriptions' => false, 'backdrop' => 'stage-american-football', 'more' => false, 'tiles' => [
            $near('Game Kit', 'Game jersey, pants and socks.', 'fullkit', 'nfl-kit', 'nfl-kit'),
            $tile('Game Jersey', 'Shoulder-pad cut with big numbers.', 'nfljersey', 'nfl-jersey') + ['design' => $look('nflgameJersey', ['fabric' => 'Standard'])],
            $soon('Game Pants', 'Game pants with belt and knee pads.', 'nfl-pants', 'nfl-pants'),
            $tile('Practice Jersey', 'Mesh jersey for practice days.', 'nfljersey', 'nfl-practice-jersey') + ['design' => $look('nflpracticeJersey', ['fabric' => 'Mesh'])],
            $tile('Training Tee', 'Breathable tee for training.', 'tee', 'nfl-tee'),
            $tile('Training Shorts', 'Lightweight shorts for practice.', 'shorts', 'nfl-training-shorts'),
            $tile('Compression Top', 'Long-sleeve base layer under the pads.', 'compression', 'nfl-compression-top') + ['design' => $look('sides')],
            $soon('Compression Shorts', 'Supportive base layer shorts.', 'compression-shorts', 'nfl-compression-shorts'),
            $tile('Game Socks', 'Knee-high socks with team hoops.', 'socks', 'nfl-socks'),
            $tile('Hoodie', 'Warm hoodie for the sideline.', 'hoodie', 'nfl-hoodie'),
            $tile('Varsity Jacket', 'Letterman jacket for the team.', 'varsity', 'nfl-varsity'),
            $near('Hooded Tracksuit', 'Full-zip jacket with hood and pants.', 'trackjacket', 'tracksuit', 'nfl-hooded-tracksuit') + ['design' => ['trackStyle' => 'hood']],
            $near('Waterproof Jacket', 'Weatherproof jacket with hood.', 'trackjacket', 'waterproof-jacket', 'nfl-waterproof-jacket') + ['design' => ['trackStyle' => 'hood']],
            $tile('Cap', 'Curved brim sports cap.', 'cap', 'nfl-cap'),
            $soon('Bucket Hat', 'Wide brim bucket hat.', 'bucket-hat', 'nfl-bucket-hat'),
            $soon('Beanie', 'Knitted beanie with a cuff.', 'beanie', 'nfl-beanie'),
        ]],
    ['id' => 'golf', 'name' => 'Golf', 'description' => 'Clean lines for every round.', 'group' => 'sports',
        'prompt' => 'golf: a premium fitted performance polo, clean and understated; a quarter-zip pullover suits too', 'tiles' => [
            $tile('Golf polo', 'Premium fitted polo for every round.', 'polo'),
            $tile('Golf tee', 'Soft tee for the range.', 'tee'),
            $tile('Clubhouse hoodie', 'Warm hoodie for after the round.', 'hoodie', 'team-hoodie'),
            $tile('Zip hoodie', 'Full-zip layer for cool mornings.', 'ziphoodie'),
            $tile('Golf cap', 'Cap with an embroidered club logo.', 'cap'),
            $soon('Bucket hat', 'Sun-smart hat for the course.', 'bucket-hat', 'bucket-hat'),
        ]],
    ['id' => 'tennis', 'name' => 'Tennis', 'description' => 'Crisp kit for every rally.', 'group' => 'sports',
        'prompt' => 'tennis: a crisp performance polo or crew tee with shorts; a skirt or dress for women\'s kits', 'tiles' => [
            $tile('Tennis polo', 'Crisp performance polo for match play.', 'polo'),
            $tile('Tennis tee', 'Light crew tee for every rally.', 'tee'),
            $tile('Tennis singlet', 'Sleeveless top for hot days.', 'singlet'),
            $tile('Tennis shorts', 'Light shorts with room to move.', 'shorts'),
            $near('Tennis dress', 'Fitted dress with a flared hem.', 'singlet', 'dress', 'netball-dress'),
            $tile('Tennis skirt', 'A-line skirt with side panels.', 'skirt', 'netball-skirt'),
            $tile('Track jacket', 'Full-zip jacket for warm-ups.', 'trackjacket'),
            $tile('Cap', 'Sun cap with your club logo.', 'cap'),
        ]],
    ['id' => 'athletics', 'name' => 'Athletics', 'description' => 'Track, road and cross-country, built for speed.', 'group' => 'sports',
        'prompt' => 'athletics and running: a racing singlet with split shorts; a crop top for women', 'tiles' => [
            $tile('Racing singlet', 'Featherweight singlet for race day.', 'singlet'),
            $tile('Running shorts', 'Split shorts built for speed.', 'shorts'),
            $tile('Training tee', 'Breathable tee for training and warm-ups.', 'tee'),
            $soon('Running tights', 'Long, 3/4 or short compression tights.', 'tights', 'leggings'),
            $tile('Track jacket', 'Full-zip jacket for warm-ups.', 'trackjacket'),
            $soon('Track pants', 'Tapered pants to match the jacket.', 'track-pants', 'track-pants'),
            $tile('Hoodie', 'Warm hoodie between events.', 'hoodie', 'team-hoodie'),
        ]],
    ['id' => 'swimming', 'name' => 'Swimming', 'description' => 'Club colours on the pool deck.', 'group' => 'sports',
        'prompt' => 'swimming: club deck apparel (tees, hoodies, parka-style deck coats) with swim caps in the club colours', 'tiles' => [
            $tile('Club tee', 'Soft tee for the pool deck.', 'tee'),
            $near('Rash guard', 'Sun-smart stretch top for the water.', 'tee', 'rashguard', 'rash-guard'),
            $tile('Club singlet', 'Light singlet for squad training.', 'singlet'),
            $tile('Deck shorts', 'Quick-dry shorts for the pool deck.', 'shorts'),
            $tile('Club hoodie', 'Warm hoodie between races.', 'hoodie', 'team-hoodie'),
            $tile('Zip hoodie', 'Full-zip layer for early starts.', 'ziphoodie'),
            $tile('Deck polo', 'Smart polo for coaches and officials.', 'polo'),
        ]],
    ['id' => 'darts', 'name' => 'Darts & Pool', 'description' => 'Your name on your back, every leg and frame.', 'group' => 'sports',
        'prompt' => 'darts and pool: a sublimated polo with a chest pocket, the player\'s name across the back shoulders and sponsors on the back and sleeves', 'tiles' => [
            $tile('Darts shirt', 'Polo with a chest pocket and your name on the back.', 'pocketpolo'),
            $tile('Pool polo', 'Sublimated polo for league nights.', 'polo'),
            $tile('Team tee', 'Soft tee for the team.', 'tee'),
            $tile('Team hoodie', 'Warm hoodie for the walk-on.', 'hoodie', 'team-hoodie'),
            $tile('Zip hoodie', 'Full-zip layer for travel.', 'ziphoodie'),
            $tile('Cap', 'Team cap with an embroidered logo.', 'cap'),
        ]],
    ['id' => 'touch', 'name' => 'Touch', 'description' => 'Touch football and Oztag, fast and light.', 'group' => 'sports',
        'prompt' => 'Touch football and Oztag: a lightweight raglan tee or singlet with shorts', 'tiles' => [
            $tile('Touch tee', 'Light raglan tee for fast games.', 'tee'),
            $tile('Touch singlet', 'Sleeveless top for hot days.', 'singlet'),
            $tile('Touch shorts', 'Light shorts that move with you.', 'shorts'),
            $tile('Full kit', 'Jersey and shorts, designed together.', 'fullkit'),
            $tile('Club polo', 'Smart polo for the team.', 'polo'),
            $tile('Hoodie', 'Warm hoodie between games.', 'hoodie', 'team-hoodie'),
            $tile('Track jacket', 'Full-zip jacket for the sideline.', 'trackjacket'),
        ]],
    ['id' => 'cricket', 'name' => 'Cricket', 'description' => 'Coloured kit for the short game.', 'group' => 'sports',
        'prompt' => 'cricket: a one-day cricket shirt with a polo collar (short or long sleeves) and matching long trousers; whites for the long format', 'tiles' => [
            $near('Cricket shirt', 'One-day shirt with a polo collar.', 'polo', 'cricket-shirt'),
            $soon('Cricket pants', 'Matching long trousers.', 'cricket-pants', 'track-pants'),
            $tile('Training tee', 'Breathable tee for the nets.', 'tee'),
            $tile('Hoodie', 'Warm hoodie for the rooms.', 'hoodie', 'team-hoodie'),
            $tile('Track jacket', 'Full-zip jacket for travel.', 'trackjacket'),
            $tile('Cricket cap', 'Cap in your club colours.', 'cap'),
            $soon('Bucket hat', 'Wide-brim hat for the field.', 'bucket-hat', 'bucket-hat'),
        ]],
    ['id' => 'softball', 'name' => 'Softball', 'description' => 'Softball and baseball, straight from the diamond.', 'group' => 'sports',
        'prompt' => 'softball and baseball: a full button-front jersey (or a two-button henley with raglan sleeves), pinstripes allowed, script team name across the chest', 'tiles' => [
            $near('Softball jersey', 'Button-front jersey with script lettering.', 'jersey', 'softball-jersey'),
            $tile('Training tee', 'Breathable tee for practice.', 'tee'),
            $tile('Club polo', 'Smart polo for coaches.', 'polo'),
            $tile('Training shorts', 'Light shorts for practice.', 'shorts'),
            $tile('Hoodie', 'Warm hoodie for the dugout.', 'hoodie', 'team-hoodie'),
            $tile('Varsity jacket', 'Letterman jacket for the team.', 'varsity'),
            $tile('Cap', 'Ball cap with your team logo.', 'cap'),
        ]],
    ['id' => 'volleyball', 'name' => 'Volleyball', 'description' => 'Indoor and beach, ready to rise.', 'group' => 'sports',
        'prompt' => 'volleyball: a fitted short-sleeve or sleeveless jersey with a big number, short shorts', 'tiles' => [
            $tile('Volleyball jersey', 'Fitted jersey with a big number.', 'jersey'),
            $tile('Volleyball singlet', 'Sleeveless top for beach and indoor.', 'singlet'),
            $tile('Volleyball shorts', 'Short shorts for the court.', 'shorts'),
            $tile('Full kit', 'Jersey and shorts, designed together.', 'fullkit'),
            $tile('Training tee', 'Breathable tee for training.', 'tee'),
            $tile('Hoodie', 'Warm hoodie between sets.', 'hoodie', 'team-hoodie'),
            $tile('Track jacket', 'Full-zip jacket for travel.', 'trackjacket'),
        ]],
    ['id' => 'lacrosse', 'name' => 'Lacrosse', 'description' => 'Pinnies and shorts for the fastest game on feet.', 'group' => 'sports',
        'prompt' => 'lacrosse: a loose sleeveless pinnie with a big number, long lacrosse shorts', 'tiles' => [
            $near('Lacrosse pinnie', 'Loose sleeveless pinnie with a big number.', 'singlet', 'pinnie'),
            $tile('Lacrosse shorts', 'Long shorts for the fastest game on feet.', 'shorts'),
            $tile('Game jersey', 'Match jersey in your colours.', 'jersey'),
            $tile('Full kit', 'Jersey and shorts, designed together.', 'fullkit'),
            $tile('Training tee', 'Breathable tee for training.', 'tee'),
            $tile('Hoodie', 'Warm hoodie for the sideline.', 'hoodie', 'team-hoodie'),
            $tile('Track jacket', 'Full-zip jacket for travel.', 'trackjacket'),
        ]],
    ['id' => 'cycling', 'name' => 'Cycling', 'description' => 'Club jerseys made for the long ride.', 'group' => 'sports',
        'prompt' => 'cycling: a close-fitting full-zip cycling jersey with rear pockets, bib shorts', 'tiles' => [
            $near('Cycling jersey', 'Close-fitting jersey with rear pockets.', 'jersey', 'cycling-jersey'),
            $soon('Bib shorts', 'Padded bib shorts for the long ride.', 'bib-shorts', 'bib-shorts'),
            $tile('Race singlet', 'Sleeveless top for hot rides.', 'singlet'),
            $tile('Club tee', 'Soft tee for the café stop.', 'tee'),
            $tile('Club polo', 'Smart polo for the club.', 'polo'),
            $tile('Club jacket', 'Full-zip jacket for cool starts.', 'trackjacket'),
            $tile('Cycling cap', 'Cotton cap with a short peak.', 'cap'),
        ]],
    ['id' => 'bmx', 'name' => 'BMX', 'description' => 'Loud race jerseys for the gate.', 'group' => 'sports',
        'prompt' => 'BMX and motocross: a loose long-sleeve V-neck race jersey with bold graphics, vented race pants', 'tiles' => [
            $near('Race jersey', 'Loose long-sleeve jersey with bold graphics.', 'jersey', 'bmx-jersey'),
            $soon('Race pants', 'Vented pants for the track.', 'race-pants', 'track-pants'),
            $tile('Full kit', 'Jersey and shorts, designed together.', 'fullkit'),
            $tile('Team tee', 'Soft tee for the pits.', 'tee'),
            $tile('Hoodie', 'Warm hoodie between motos.', 'hoodie', 'team-hoodie'),
            $tile('Zip hoodie', 'Full-zip layer for travel.', 'ziphoodie'),
            $tile('Cap', 'Team cap with an embroidered logo.', 'cap'),
        ]],
    ['id' => 'lawn-bowls', 'name' => 'Lawn Bowls', 'description' => 'Smart club colours for the green.', 'group' => 'sports',
        'prompt' => 'lawn bowls: a smart club polo with a collar, light sublimated patterns', 'tiles' => [
            $tile('Bowls polo', 'Smart club polo for the green.', 'polo'),
            $tile('Polo with pocket', 'Club polo with a chest pocket.', 'pocketpolo'),
            $tile('Club tee', 'Soft tee for social bowls.', 'tee'),
            $tile('Club hoodie', 'Warm hoodie for cool evenings.', 'hoodie', 'team-hoodie'),
            $tile('Club jacket', 'Full-zip jacket for the green.', 'trackjacket'),
            $soon('Bucket hat', 'Sun-smart hat for the green.', 'bucket-hat', 'bucket-hat'),
        ]],
    ['id' => 'esports', 'name' => 'Esports', 'description' => 'Pro gaming jerseys with your tag on the back.', 'group' => 'sports',
        'prompt' => 'esports: a pro gaming jersey with sharp sublimated graphics, sponsor patches and the gamer tag across the back', 'tiles' => [
            $tile('Esports jersey', 'Pro jersey with your tag on the back.', 'jersey'),
            $tile('Team tee', 'Soft tee for the team.', 'tee'),
            $tile('Team polo', 'Smart polo for events.', 'polo'),
            $tile('Team hoodie', 'Warm hoodie for long sessions.', 'hoodie', 'team-hoodie'),
            $tile('Zip hoodie', 'Full-zip layer for the stage.', 'ziphoodie'),
            $tile('Varsity jacket', 'Letterman jacket for the roster.', 'varsity'),
            $tile('Cap', 'Team cap with an embroidered logo.', 'cap'),
        ]],
    ['id' => 'training', 'name' => 'Training', 'description' => 'Everyday performance, your way.', 'group' => 'apparel', 'tiles' => [
        $tile('Training tee', 'Breathable tee for every session.', 'tee'),
        $tile('Training singlet', 'Lightweight singlet for hot sessions.', 'singlet'),
        $tile('Training shorts', 'Light shorts that move with you.', 'shorts'),
        $tile('Training polo', 'Smart polo for coaches and staff.', 'polo'),
        $tile('Hoodie', 'Warm hoodie for warm-ups and travel.', 'hoodie', 'team-hoodie'),
        $tile('Zip hoodie', 'Full-zip layer for warm-ups.', 'ziphoodie'),
        $tile('Track jacket', 'Full-zip jacket for warm-ups and travel.', 'trackjacket'),
        $tile('Varsity jacket', 'Letterman jacket for the team.', 'varsity'),
    ]],
    ['id' => 'fight-wear', 'name' => 'Fight Wear', 'description' => 'Rash guards and fight shorts for the cage and the mat.', 'group' => 'apparel',
        'prompt' => 'fight wear (MMA, boxing, BJJ, Muay Thai): a compression rash guard and fight shorts with side splits', 'tiles' => [
            $near('Rash guard', 'Compression top for the mat.', 'tee', 'rashguard', 'rash-guard'),
            $near('Fight shorts', 'Fight cut with side splits.', 'shorts', 'fight-shorts', 'fight-shorts'),
            $tile('Training tee', 'Breathable tee for the gym.', 'tee'),
            $tile('Training singlet', 'Lightweight singlet for conditioning.', 'singlet'),
            $tile('Hoodie', 'Warm hoodie for the walk-out.', 'hoodie', 'team-hoodie'),
            $tile('Zip hoodie', 'Full-zip layer for weigh-ins.', 'ziphoodie'),
            $tile('Corner jacket', 'Full-zip jacket for the team.', 'trackjacket'),
            $soon('Compression spats', 'Compression tights for grappling.', 'tights', 'leggings'),
        ]],
    ['id' => 'fishing', 'name' => 'Fishing', 'description' => 'Sun-smart shirts for the boat and the beach.', 'group' => 'apparel',
        'prompt' => 'fishing: a lightweight long-sleeve fishing shirt with a zip or button collar or a hood, ocean graphics', 'tiles' => [
            $near('Fishing shirt', 'Light sun-smart shirt with ocean graphics.', 'jersey', 'fishing-shirt'),
            $tile('Fishing polo', 'Smart polo for the club and the boat.', 'polo'),
            $tile('Fishing tee', 'Soft tee for the beach.', 'tee'),
            $tile('Fishing hoodie', 'Warm hoodie for early starts.', 'hoodie', 'team-hoodie'),
            $tile('Boat shorts', 'Quick-dry shorts for the boat.', 'shorts'),
            $soon('Bucket hat', 'Sun-smart hat with a wide brim.', 'bucket-hat', 'bucket-hat'),
            $tile('Cap', 'Cap with your club logo.', 'cap'),
        ]],
    ['id' => 'workwear', 'name' => 'Workwear', 'description' => 'Hi-vis and work shirts with your business on them.', 'group' => 'apparel',
        'prompt' => 'workwear and hi-vis: a fluoro work shirt or polo with reflective tape bands and the business logo', 'tiles' => [
            $tile('Hi-vis polo', 'Fluoro polo with your business logo.', 'polo'),
            $tile('Work polo with pocket', 'Hard-wearing polo with a chest pocket.', 'pocketpolo'),
            $tile('Work tee', 'Tough tee for every job.', 'tee'),
            $near('Work shirt', 'Long-sleeve work shirt with your logo.', 'jersey', 'work-shirt'),
            $tile('Work hoodie', 'Warm hoodie for cold sites.', 'hoodie', 'team-hoodie'),
            $tile('Zip hoodie', 'Full-zip layer for the yard.', 'ziphoodie'),
            $tile('Work shorts', 'Hard-wearing shorts for the job.', 'shorts'),
            $tile('Cap', 'Work cap with your business logo.', 'cap'),
        ]],
    ['id' => 'gymwear', 'name' => 'Gymwear', 'description' => 'Fitness gear for every session.', 'group' => 'apparel',
        'prompt' => 'gym and fitness wear: a muscle-fit singlet or tee with training shorts', 'tiles' => [
            $tile('Muscle singlet', 'Muscle-fit singlet for lifting.', 'singlet'),
            $tile('Gym tee', 'Fitted tee for every session.', 'tee'),
            $tile('Gym shorts', 'Light shorts for training.', 'shorts'),
            $soon('Leggings', 'Squat-proof leggings and tights.', 'tights', 'leggings'),
            $tile('Hoodie', 'Warm hoodie for warm-ups.', 'hoodie', 'team-hoodie'),
            $tile('Zip hoodie', 'Full-zip layer for the gym.', 'ziphoodie'),
            $tile('Track jacket', 'Full-zip jacket for warm-ups.', 'trackjacket'),
            $soon('Track pants', 'Tapered pants to match the jacket.', 'track-pants', 'track-pants'),
        ]],
    ['id' => 'teamwear', 'name' => 'Club Casual', 'description' => 'Teamwear for travel, the sideline and the clubhouse.', 'group' => 'apparel',
        'prompt' => 'club casual teamwear: a smart club polo or tee with an embroidered crest', 'tiles' => [
            $tile('Club polo', 'Smart polo with your crest.', 'polo'),
            $tile('Club tee', 'Soft tee for the clubhouse.', 'tee'),
            $tile('Club shorts', 'Casual shorts for travel.', 'shorts'),
            $tile('Club hoodie', 'Warm hoodie for the sideline.', 'hoodie', 'team-hoodie'),
            $tile('Zip hoodie', 'Full-zip layer for travel.', 'ziphoodie'),
            $tile('Varsity jacket', 'Letterman jacket for the club.', 'varsity'),
            $tile('Track jacket', 'Full-zip jacket for travel.', 'trackjacket'),
            $tile('Club cap', 'Cap with your club crest.', 'cap'),
        ]],
    ['id' => 'school-leavers', 'name' => 'School Leavers', 'description' => 'Your year, your names, one jersey.', 'group' => 'apparel',
        'prompt' => 'school leavers: a long-sleeve rugby-collar jersey with the class year big on the front or back and every student\'s name', 'tiles' => [
            $near('Leavers jersey', 'Rugby-collar jersey with every name on it.', 'jersey', 'leavers-jersey'),
            $tile('Leavers hoodie', 'Your year, big on the back.', 'hoodie', 'team-hoodie'),
            $tile('Zip hoodie', 'Full-zip hoodie with your year.', 'ziphoodie'),
            $tile('Varsity jacket', 'Letterman jacket for your year.', 'varsity'),
            $tile('Leavers polo', 'Smart polo with your year.', 'polo'),
            $tile('Leavers tee', 'Soft tee with every name.', 'tee'),
            $tile('Track jacket', 'Full-zip jacket with your year.', 'trackjacket'),
        ]],
];

/*
 * Each tile picture's look (task 9.154), by its picture (several sports share one picture). A tile that sets its own
 * look (the American football jerseys) keeps it; its other settings (fabric, track style) stay.
 */
$pictureLooks = [
    'jersey' => 'tribal', 'fullkit' => 'tribalKit', 'rugby-jersey' => 'rugbyLeague', 'rugby-kit' => 'rugbyLeague', 'nfl-kit' => 'nflgame', 'rash-guard' => 'blades',
    'rugby-polo' => 'sleeves', 'tee' => 'sleevesOnly', 'nfl-tee' => 'sleevesOnly', 'rugby-tee' => 'sleevesOnly', 'netball-tee' => 'sleevesOnly', 'shooting-shirt' => 'shooting',
    'singlet' => 'bladesSides', 'netball-training-singlet' => 'bladesSides', 'afl-guernsey' => 'bladesSides', 'netball-singlet-bib' => 'bladesSides', 'netball-dress' => 'bladesSides',
    'team-hoodie' => 'hoodie', 'nfl-hoodie' => 'hoodie', 'netball-hoodie' => 'hoodie', 'nfl-compression-top' => 'sides',
    'trackjacket' => 'track', 'netball-tracksuit' => 'track', 'tracksuit' => 'trackSides', 'rugby-hooded-tracksuit' => 'trackSides', 'nfl-hooded-tracksuit' => 'trackSides',
    'rugby-waterproof-jacket' => 'waterproof', 'nfl-waterproof-jacket' => 'waterproof',
    'socks' => 'socksHeel', 'rugby-socks' => 'rugbySocks', 'cap' => 'capSweep', 'nfl-cap' => 'capSweep', 'netball-skirt' => 'skirt',
];
$sideLooks = ['shorts', 'trackjacket', 'compression'];
// What a picture shows on top of its look (objects with ids 'tile-…', which a new tile takes off again): netball
// position letters front and back (no team name, crest, name or number, as on the bibs), the small "3" high on the sleeve.
$letters = fn (string $text) => ['marks' => array_fill_keys(['top_wordmark', 'top_crest', 'top_name', 'top_number'], ['hidden' => true]), 'layers' => [
    ['type' => 'text', 'id' => 'tile-position', 'name' => 'Position', 'part' => 'top', 'side' => 'front', 'x' => 0, 'y' => 0.36, 'text' => $text, 'size' => 0.16, 'color' => '#ffffff'],
    ['type' => 'text', 'id' => 'tile-position-back', 'name' => 'Position', 'part' => 'top', 'side' => 'back', 'x' => 0, 'y' => 0.36, 'text' => $text, 'size' => 0.16, 'color' => '#ffffff'],
]];
// The Game Kit picture's cyan "3" sits on the left chest, level with the crest at the V.
$chestThree = ['layers' => [['type' => 'text', 'id' => 'tile-sleeve', 'name' => 'Chest number', 'part' => 'top', 'side' => 'front', 'x' => 0.15, 'y' => 0.631, 'text' => '3', 'size' => 0.072, 'color' => '#16b4f0']]];
// The Game Jersey picture (FX3): its chest "3" bold and slanted in the block jersey font with a light cyan edge, clear
// of the shoulder piping; small white "3"s with a cyan line (as the 86) on the tops of the shoulders.
$shoulderThree = fn (int $dir) => ['type' => 'text', 'id' => $dir > 0 ? 'tile-shoulder' : 'tile-shoulder-right', 'name' => 'Shoulder number', 'part' => 'top', 'side' => 'front', 'x' => 0.168 * $dir, 'y' => 0.692, 'rot' => 14 * $dir, 'text' => '3', 'size' => 0.056, 'color' => '#ffffff', 'font' => 'JerseyBlock', 'look' => ['style' => 'outline', 'width' => 0.08, 'color' => '#16b4f0']];
$gameThree = ['layers' => [
    ['type' => 'text', 'id' => 'tile-sleeve', 'name' => 'Chest number', 'part' => 'top', 'side' => 'front', 'x' => 0.132, 'y' => 0.632, 'text' => '3', 'size' => 0.072, 'color' => '#16b4f0', 'font' => 'JerseyBlock', 'look' => ['style' => 'outline', 'width' => 0.03, 'color' => '#8fe0ff', 'shape' => 'slant']],
    $shoulderThree(1), $shoulderThree(-1),
]];
// The Compression Top picture (CF1 2026-10-29): the cyan "3" upright on the upper arm, seen from the front. (DT4: the
// small "3" is on the black neck label inside the back neck, the viewer's own; nothing printed under the crew neck.)
// (FX3: a squared block numeral, taller, as the picture's: the jersey font.) (FM print fixer 2026-10-30: upright from
// the front, tall and condensed (`narrow`), just inside the arm's outer edge, no longer cut off by it.)
// (Detail tester 2026-10-30: the crest at its own place, stacked over the wordmark as in the picture; without it the
// Game Jersey tile's small high crest stayed on when this tile was picked after it.)
$sleeveThree = ['marks' => ['top_crest' => ['scale' => 1]], 'layers' => [
    ['type' => 'text', 'id' => 'tile-sleeve', 'name' => 'Sleeve number', 'part' => 'top', 'side' => 'front', 'x' => 0.34, 'y' => 0.565, 'rot' => -25, 'text' => '3', 'size' => 0.12, 'narrow' => 0.5, 'color' => '#16b4f0', 'font' => 'JerseyBlock'],
]];
// The Netball dress picture on its own 3D dress (ND1): the 3DEEZI mark and wordmark on the chest, a black bib sewn on
// below them with the white position letters (tall condensed letters on the dress), the same on the back; no name or
// number. (Keyed picture@garment: the Tennis dress tile shows the same picture on the singlet, with the bibs' letters.)
$dressBib = ['marks' => ['top_name' => ['hidden' => true], 'top_number' => ['hidden' => true]], 'layers' => [
    ['type' => 'shape', 'id' => 'tile-bib', 'name' => 'Position bib', 'part' => 'top', 'side' => 'front', 'x' => 0, 'y' => 0.491, 'shape' => 'rectangle', 'w' => 0.218, 'h' => 0.213, 'color' => '#212326'],
    ['type' => 'shape', 'id' => 'tile-bib-back', 'name' => 'Position bib', 'part' => 'top', 'side' => 'back', 'x' => 0, 'y' => 0.501, 'shape' => 'rectangle', 'w' => 0.218, 'h' => 0.213, 'color' => '#212326'],
    ['type' => 'text', 'id' => 'tile-position', 'name' => 'Position', 'part' => 'top', 'side' => 'front', 'x' => 0, 'y' => 0.464, 'text' => 'WA', 'size' => 0.185, 'color' => '#ffffff'],
    ['type' => 'text', 'id' => 'tile-position-back', 'name' => 'Position', 'part' => 'top', 'side' => 'back', 'x' => 0, 'y' => 0.474, 'text' => 'WA', 'size' => 0.185, 'color' => '#ffffff'],
]];
$pictureExtras = [
    'bibs' => $letters('GS'), 'netball-bibs' => $letters('GS'), 'netball-singlet-bib' => $letters('GA'), 'netball-dress' => $letters('WA'),
    'netball-dress@netball-dress' => $dressBib,
    'nfl-kit' => $chestThree, 'nfl-compression-top' => $sleeveThree,
];
$pictureLooks += ['varsity' => 'varsity', 'nfl-varsity' => 'varsity'];
foreach ($sports as &$sport) {
    foreach ($sport['tiles'] as &$t) {
        if ($t['fit'] === 'soon') continue;
        if (! isset($t['design']['main'])) {
            $name = $pictureLooks[$t['image']] ?? (in_array($t['garment'], $sideLooks, true) ? 'sides' : 'plain');
            $t['design'] = $look($name, $t['design'] ?? []);
        }
        $extra = $pictureExtras[$t['image'].'@'.$t['garment']] ?? $pictureExtras[$t['image']] ?? ($t['image'] === 'nfl-jersey' ? $gameThree : []);
        $t['design'] = array_merge($t['design'], $extra);
    }
    unset($t);
}
unset($sport);

return [
    /*
     * The sports and apparel categories, in carousel order: the DYO sport chooser, the AI designer's tiles, orders, pricing and
     * ASSIST all read this list. 'group' sorts the quick-access tiles (ALL / SPORTS / APPAREL). 'tiles': the sport's own
     * garments (above); 'garments': the 3D garments its tiles use, in tile order (worked out from 'tiles', never written by
     * hand). 'prompt': a style hint the image model gets with the sport's name.
     * Pictures: media/showroom/kit-<id>.webp (DYO stage) and media/images/ai-designer/sport-<id>.webp (AI tile); the symbol is
     * CategoryIcon (GarmentIcon.tsx and lib/widgets/category_icon.dart). The app mirrors this list in lib/sports_catalog.dart.
     */
    'sports' => array_map(fn (array $sport) => $sport + [
        'garments' => array_values(array_unique(array_filter(array_column($sport['tiles'], 'garment')))),
    ], $sports),
    'garments' => [
        ['id' => 'jersey', 'name' => 'Jersey', 'description' => 'Your match-day essential.'],
        ['id' => 'shorts', 'name' => 'Shorts', 'description' => 'Complete your team look.'],
        ['id' => 'tee', 'name' => 'Training Tee', 'description' => 'From warm-up to wind-down.'],
        ['id' => 'singlet', 'name' => 'Singlet', 'description' => 'Lightweight and ready to move.'],
        // Task 9.126: a women's fitted netball dress (bust, waist, flared skirt to mid-thigh) on the female figure.
        ['id' => 'netball-dress', 'name' => 'Netball dress', 'description' => 'Fitted dress for women, with a flared skirt hem.'],
        // Task 9.113: the American football jersey, cut wide over shoulder pads with short cap sleeves (Game / Practice Jersey).
        ['id' => 'nfljersey', 'name' => 'Football jersey', 'description' => 'American football cut: wide over the shoulder pads, short cap sleeves.'],
        // The compression top (NFL base layer): skin-tight long sleeves, crew neck, smooth stretch fabric.
        // Knee-high team socks (garment 3): hoops under the top band, heel and toe, the crest on the shin.
        ['id' => 'socks', 'name' => 'Socks', 'description' => 'Knee-high team socks in rib knit, with hoops and your crest.'],
        // The team cap (garment 4): structured six panels with piping, a curved brim, your crest on the front.
        ['id' => 'cap', 'name' => 'Cap', 'description' => 'Six-panel team cap with piping, a curved brim and your crest.'],
        // The netball / tennis skirt and hockey skort (COMING SOON 10): A-line, gathered elastic waistband, side panels.
        ['id' => 'skirt', 'name' => 'Skirt', 'description' => 'A-line skirt with a gathered waistband and side panels.'],
        ['id' => 'compression', 'name' => 'Compression top', 'description' => 'Skin-tight long-sleeve base layer in smooth stretch fabric.'],
        ['id' => 'polo', 'name' => 'Polo', 'description' => 'Represent your team off the field.'],
        // Being built (agent ac04db942c799feb7): a polo with a real chest pocket, player name and sponsor on the back.
        ['id' => 'pocketpolo', 'name' => 'Polo with pocket', 'description' => 'A chest pocket, your name and sponsor on the back.'],
        // Being built (agent ae5fafdadf596d1bd).
        ['id' => 'hoodie', 'name' => 'Hoodie', 'description' => 'Fleece pull-over with a lined hood and kangaroo pocket.'],
        ['id' => 'ziphoodie', 'name' => 'Zip hoodie', 'description' => 'Full-zip fleece hoodie with a lined hood and split pockets.'],
        // Task 9.45: the varsity (letterman) jacket: wool body, leather sleeves, snap front, striped rib trims.
        ['id' => 'trackjacket', 'name' => 'Track jacket', 'description' => 'Full-zip track suit jacket: stand-up collar or hood, contrast panels and sleeve stripes.'],
        ['id' => 'varsity', 'name' => 'Varsity jacket', 'description' => 'Letterman jacket: wool body, leather sleeves, snaps and striped rib trims.'],
        ['id' => 'fullkit', 'name' => 'Full Kit', 'description' => 'A coordinated jersey and shorts.'],
    ],
    'provider' => [
        'id' => 'procedural',
        'name' => 'Procedural design preview',
        'available' => true,
        'is_ai' => false,
        'description' => 'Creates editable concepts from colour and pattern keywords. Generative AI and reference-image analysis are not connected.',
    ],
];
