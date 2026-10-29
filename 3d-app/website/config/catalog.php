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

$sports = [
    // The client's own lists and words: Rugby League and Rugby (images/160.jpg, 11 tiles, no "More teamwear"); pictures:
    // the client's own tiles (images/161.jpg) remade in high resolution, garment-rugby-*.webp.
    ['id' => 'rugby-league', 'name' => 'Rugby League', 'description' => 'Made for every tackle. Built for your team.', 'group' => 'sports', 'more' => false, 'tiles' => [
        $tile('Rugby League Kit', 'Jersey, playing shorts and socks.', 'fullkit', 'rugby-kit'),
        $tile('Jersey', 'Performance rugby league jersey.', 'jersey', 'rugby-jersey'),
        $tile('Playing Shorts', 'Durable rugby league shorts.', 'shorts', 'rugby-shorts'),
        $soon('Socks', 'Knee-high match socks.', 'socks', 'rugby-socks'),
        $tile('Polo', 'Smart team polo with collar.', 'polo', 'rugby-polo'),
        $tile('Training Tee', 'Breathable tee for training.', 'tee', 'rugby-tee'),
        $tile('Training Shorts', 'Lightweight shorts with zip pockets.', 'shorts', 'rugby-training-shorts'),
        $near('Hooded Tracksuit', 'Full-zip jacket with hood and pants.', 'trackjacket', 'tracksuit', 'rugby-hooded-tracksuit') + ['design' => ['trackStyle' => 'hood']],
        $soon('Cap', 'Curved brim sports cap.', 'cap', 'rugby-cap'),
        $soon('Bucket Hat', 'Wide brim bucket hat.', 'bucket-hat', 'rugby-bucket-hat'),
        $near('Waterproof Jacket', 'Weatherproof jacket with hood.', 'trackjacket', 'waterproof-jacket', 'rugby-waterproof-jacket') + ['design' => ['trackStyle' => 'hood']],
    ]],
    ['id' => 'rugby-union', 'name' => 'Rugby Union', 'description' => 'A proud tradition. A kit of your own.', 'group' => 'sports',
        // The client's heading for it: RUGBY UNIFORMS & TEAMWEAR.
        'heading' => 'Rugby', 'more' => false, 'tiles' => [
        $tile('Rugby Kit', 'Jersey, playing shorts and socks.', 'fullkit', 'rugby-kit'),
        $tile('Jersey', 'Performance rugby jersey.', 'jersey', 'rugby-jersey'),
        $tile('Playing Shorts', 'Durable rugby shorts.', 'shorts', 'rugby-shorts'),
        $soon('Socks', 'Knee-high match socks.', 'socks', 'rugby-socks'),
        $tile('Polo', 'Smart team polo with collar.', 'polo', 'rugby-polo'),
        $tile('Training Tee', 'Breathable tee for training.', 'tee', 'rugby-tee'),
        $tile('Training Shorts', 'Lightweight shorts with zip pockets.', 'shorts', 'rugby-training-shorts'),
        $near('Hooded Tracksuit', 'Full-zip jacket with hood and pants.', 'trackjacket', 'tracksuit', 'rugby-hooded-tracksuit') + ['design' => ['trackStyle' => 'hood']],
        $soon('Cap', 'Curved brim sports cap.', 'cap', 'rugby-cap'),
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
        $soon('Football socks', 'Match socks with team bands.', 'socks', 'socks'),
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
        $tile('Netball dress', 'Fitted netball dress with skirt hem.', 'netball-dress', 'netball-dress'),
        $soon('Netball skirt', 'Athletic skirt with team styling.', 'skirt', 'netball-skirt'),
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
        $soon('Footy socks', 'Match socks with team bands.', 'socks', 'socks'),
    ]],
    ['id' => 'hockey', 'name' => 'Hockey', 'description' => 'Fast play. Unmistakable team identity.', 'group' => 'sports', 'tiles' => [
        $tile('Hockey jersey', 'Match shirt in your team colours.', 'jersey'),
        $tile('Hockey shorts', 'Light shorts for fast play.', 'shorts'),
        $soon('Hockey skort', 'Skirt with built-in shorts.', 'skirt', 'netball-skirt'),
        $tile('Training tee', 'Breathable tee for training and warm-ups.', 'tee'),
        $tile('Club polo', 'Smart polo for coaches and travel.', 'polo'),
        $tile('Hoodie', 'Warm hoodie for the dugout and travel.', 'hoodie', 'team-hoodie'),
        $tile('Track jacket', 'Full-zip jacket for the sideline.', 'trackjacket'),
        $soon('Hockey socks', 'Long socks with team bands.', 'socks', 'socks'),
    ]],
    // Added 2026-10-21 (task 9.79). The client's first six: American football, golf, tennis, athletics, swimming, darts.
    // American Football: the client's own list, words and pictures (images/165.jpg, 16 tiles in a 4 x 4 grid, names only, no
    // "More teamwear"; garment-nfl-*.webp) on a night football field (media/showroom/stage-american-football.webp).
    ['id' => 'american-football', 'name' => 'American Football', 'description' => 'Big numbers. Bigger game days.', 'group' => 'sports',
        'prompt' => 'American football: a short-sleeve jersey cut wide over the shoulder pads, big block numbers on the front, back and sleeves, sleeve stripes',
        'subtitle' => 'Choose your game uniform, practice wear or sideline apparel.', 'select_hint' => 'Select a garment to customise.',
        'descriptions' => false, 'backdrop' => 'stage-american-football', 'more' => false, 'tiles' => [
            $near('Game Kit', 'Game jersey, pants and socks.', 'fullkit', 'nfl-kit', 'nfl-kit'),
            $tile('Game Jersey', 'Shoulder-pad cut with big numbers.', 'nfljersey', 'nfl-jersey') + ['design' => ['fabric' => 'Standard']],
            $soon('Game Pants', 'Game pants with belt and knee pads.', 'nfl-pants', 'nfl-pants'),
            $tile('Practice Jersey', 'Mesh jersey for practice days.', 'nfljersey', 'nfl-practice-jersey') + ['design' => ['fabric' => 'Mesh']],
            $tile('Training Tee', 'Breathable tee for training.', 'tee', 'nfl-tee'),
            $tile('Training Shorts', 'Lightweight shorts for practice.', 'shorts', 'nfl-training-shorts'),
            $near('Compression Top', 'Long-sleeve base layer under the pads.', 'tee', 'compression-top', 'nfl-compression-top'),
            $soon('Compression Shorts', 'Supportive base layer shorts.', 'compression-shorts', 'nfl-compression-shorts'),
            $soon('Game Socks', 'Knee-high socks with team hoops.', 'socks', 'nfl-socks'),
            $tile('Hoodie', 'Warm hoodie for the sideline.', 'hoodie', 'nfl-hoodie'),
            $tile('Varsity Jacket', 'Letterman jacket for the team.', 'varsity', 'nfl-varsity'),
            $near('Hooded Tracksuit', 'Full-zip jacket with hood and pants.', 'trackjacket', 'tracksuit', 'nfl-hooded-tracksuit') + ['design' => ['trackStyle' => 'hood']],
            $near('Waterproof Jacket', 'Weatherproof jacket with hood.', 'trackjacket', 'waterproof-jacket', 'nfl-waterproof-jacket') + ['design' => ['trackStyle' => 'hood']],
            $soon('Cap', 'Curved brim sports cap.', 'cap', 'nfl-cap'),
            $soon('Bucket Hat', 'Wide brim bucket hat.', 'bucket-hat', 'nfl-bucket-hat'),
            $soon('Beanie', 'Knitted beanie with a cuff.', 'beanie', 'nfl-beanie'),
        ]],
    ['id' => 'golf', 'name' => 'Golf', 'description' => 'Clean lines for every round.', 'group' => 'sports',
        'prompt' => 'golf: a premium fitted performance polo, clean and understated; a quarter-zip pullover suits too', 'tiles' => [
            $tile('Golf polo', 'Premium fitted polo for every round.', 'polo'),
            $tile('Golf tee', 'Soft tee for the range.', 'tee'),
            $tile('Clubhouse hoodie', 'Warm hoodie for after the round.', 'hoodie', 'team-hoodie'),
            $tile('Zip hoodie', 'Full-zip layer for cool mornings.', 'ziphoodie'),
            $soon('Golf cap', 'Cap with an embroidered club logo.', 'cap', 'cap'),
            $soon('Bucket hat', 'Sun-smart hat for the course.', 'bucket-hat', 'bucket-hat'),
        ]],
    ['id' => 'tennis', 'name' => 'Tennis', 'description' => 'Crisp kit for every rally.', 'group' => 'sports',
        'prompt' => 'tennis: a crisp performance polo or crew tee with shorts; a skirt or dress for women\'s kits', 'tiles' => [
            $tile('Tennis polo', 'Crisp performance polo for match play.', 'polo'),
            $tile('Tennis tee', 'Light crew tee for every rally.', 'tee'),
            $tile('Tennis singlet', 'Sleeveless top for hot days.', 'singlet'),
            $tile('Tennis shorts', 'Light shorts with room to move.', 'shorts'),
            $near('Tennis dress', 'Fitted dress with a flared hem.', 'singlet', 'dress', 'netball-dress'),
            $soon('Tennis skirt', 'Pleated skirt with inner shorts.', 'skirt', 'netball-skirt'),
            $tile('Track jacket', 'Full-zip jacket for warm-ups.', 'trackjacket'),
            $soon('Cap', 'Sun cap with your club logo.', 'cap', 'cap'),
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
            $soon('Cap', 'Team cap with an embroidered logo.', 'cap', 'cap'),
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
            $soon('Cricket cap', 'Cap in your club colours.', 'cap', 'cap'),
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
            $soon('Cap', 'Ball cap with your team logo.', 'cap', 'cap'),
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
            $soon('Cycling cap', 'Cotton cap with a short peak.', 'cap', 'cap'),
        ]],
    ['id' => 'bmx', 'name' => 'BMX', 'description' => 'Loud race jerseys for the gate.', 'group' => 'sports',
        'prompt' => 'BMX and motocross: a loose long-sleeve V-neck race jersey with bold graphics, vented race pants', 'tiles' => [
            $near('Race jersey', 'Loose long-sleeve jersey with bold graphics.', 'jersey', 'bmx-jersey'),
            $soon('Race pants', 'Vented pants for the track.', 'race-pants', 'track-pants'),
            $tile('Full kit', 'Jersey and shorts, designed together.', 'fullkit'),
            $tile('Team tee', 'Soft tee for the pits.', 'tee'),
            $tile('Hoodie', 'Warm hoodie between motos.', 'hoodie', 'team-hoodie'),
            $tile('Zip hoodie', 'Full-zip layer for travel.', 'ziphoodie'),
            $soon('Cap', 'Team cap with an embroidered logo.', 'cap', 'cap'),
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
            $soon('Cap', 'Team cap with an embroidered logo.', 'cap', 'cap'),
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
            $soon('Cap', 'Cap with your club logo.', 'cap', 'cap'),
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
            $soon('Cap', 'Work cap with your business logo.', 'cap', 'cap'),
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
            $soon('Club cap', 'Cap with your club crest.', 'cap', 'cap'),
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
