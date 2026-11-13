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
    $trackLevel = ['top_wordmark' => ['x' => -0.105, 'y' => 0.575, 'scale' => 1.0], 'top_crest' => ['x' => 0.105, 'y' => 0.575, 'scale' => 1.0]];
    $trackStack = ['top_crest' => ['x' => 0.105, 'y' => 0.605, 'scale' => 0.6], 'top_wordmark' => ['x' => 0.105, 'y' => 0.572, 'scale' => 0.75]];
    $pantsMarks = ['shorts_crest' => ['x' => 0.17, 'y' => 0.84], 'shorts_wordmark' => ['x' => 0.17, 'y' => 0.802]];
    $looks = [
        'plain' => [],
        'sides' => ['zones' => $solid('sides')],
        'sleeves' => ['zones' => $solid('sleeves', 'sides')],
        'sleevesOnly' => ['zones' => $solid('sleeves')],
        // The training tee pictures (FN5 2026-10-30, colours measured on them; the input a little deeper, as the stage
        // light lifts it): a black crew neck, hem and side seams, the wordmark higher on the chest. garment-tee: muted
        // deep azure sleeves; nfl-tee: bright cyan sleeves, the "3" centred above the wordmark; rugby-tee and
        // netball-tee: bright cyan sleeves and side panels.
        // (FN11 2026-11-02, DT10: the stacks 3-5% lower and the "3" smaller as the pictures; the sleeves' cyan deeper (the
        // stage lifted it); the small dark neck label, zoneColors.labelDark.)
        'teeTile' => ['secondary' => '#27282a', 'patternColor' => '#00688a', 'zones' => $solid('sleeves'), 'zoneColors' => ['labelDark' => '#2e3034', 'teeLong' => '#27282a'], 'marks' => ['top_wordmark' => ['y' => 0.515, 'scale' => 0.9], 'top_crest' => ['y' => 0.578, 'scale' => 0.75]]],
        'teeCyan' => ['secondary' => '#27282a', 'patternColor' => '#008fdc', 'zones' => $solid('sleeves'), 'zoneColors' => ['labelDark' => '#2e3034', 'teeFlare' => '#27282a'], 'marks' => ['top_wordmark' => ['y' => 0.5], 'top_crest' => ['x' => 0, 'y' => 0.565, 'scale' => 0.8]]],
        'teeSides' => ['secondary' => '#27282a', 'patternColor' => '#008fdc', 'zones' => $solid('sleeves', 'sides'), 'zoneColors' => ['labelDark' => '#2e3034', 'teeFlare' => '#27282a'], 'marks' => ['top_wordmark' => ['y' => 0.5], 'top_crest' => ['y' => 0.565]]],
        // (FN13: the netball tee's own cut, narrower than the rugby tee's: viewer zoneColors.teeNetball.)
        'teeSidesNetball' => ['secondary' => '#27282a', 'patternColor' => '#008fdc', 'zones' => $solid('sleeves', 'sides'), 'zoneColors' => ['labelDark' => '#2e3034', 'teeFlare' => '#27282a', 'teeNetball' => '#27282a'], 'marks' => ['top_wordmark' => ['y' => 0.5], 'top_crest' => ['y' => 0.565]]],
        // (FN5 2026-10-30, the varsity picture's colours: a cool blue-black body and rib, pale sky blue sleeves, the white
        // felt border round the chest "3" (the accent).)
        'varsity' => ['accent' => '#ffffff', 'zoneColors' => ['body' => '#1a1e23', 'sleeves' => '#4fb2d0', 'rib' => '#1a1e23', 'ribStripe' => $cyan]],
        // (FX-V 2026-11-02, DT11: the NFL Varsity Jacket picture: a wide, boxy cut with deep striped cuffs and waistband
        // (zoneColors.varsityBoxy) and cyan snaps.)
        'nflVarsity' => ['accent' => '#ffffff', 'zoneColors' => ['body' => '#1a1e23', 'sleeves' => '#4fb2d0', 'rib' => '#1a1e23', 'ribStripe' => $cyan, 'snaps' => $cyan, 'varsityBoxy' => '#1a1e23']],
        // The football / hockey jersey picture (DT3): a royal blue maze (Swirl) over the raglan shoulders and sleeves with
        // cyan piping on the raglan seam, cyan side panels, a black collar, hem and cuffs.
        // (FX3: the maze on the shoulders up to the collar, fading out down the upper sleeves; the arms mostly plain: the
        // Shoulders area only, which reaches over a bare sleeve.)
        // (FN2 2026-10-30: the tile's wing collar, black outside and light grey inside: viewer wingcollar.js.)
        'tribal' => ['secondary' => '#27282a', 'patternColor' => '#1972ab', 'zones' => ['yoke' => 'Swirl'], 'parts' => ['sides' => ['colour' => $cyan]], 'zoneColors' => ['wingCollar' => '#1b1d20', 'wingCollarInside' => '#5f6266']],
        // The Full kit picture (DT3): a pale blue maze over the shoulders and sleeves, no side panels, black trims, the
        // "3" mark centred above the wordmark.
        // (FN6 2026-10-30, colours measured on the picture and set so the stage renders them: the print on the raglan shoulders
        // and upper sleeves only, the lower sleeves black; a round crew neck (zoneColors.crewNeck, viewer); the flat pale blue
        // "3" over a flat pale blue wordmark high on the chest (zoneColors.brandInk); the shorts plain black with the
        // picture's pointed pale blue blades low on the outer legs (zoneColors.kitBlade: no drawstring, smooth matt
        // fabric) and no number, crest or word.)
        'tribalKit' => ['secondary' => '#27282a', 'accent' => '#76c6ec', 'patternColor' => '#5b98bb', 'zones' => ['yoke' => 'Swirl'], 'zoneColors' => ['crewNeck' => '#27282a', 'kitBlade' => '#76c6ec', 'brandInk' => '#7ccdf2'], 'marks' => ['top_crest' => ['x' => 0.035, 'y' => 0.655, 'scale' => 0.6], 'top_wordmark' => ['y' => 0.587, 'scale' => 0.85], 'shorts_number' => ['hidden' => true], 'shorts_crest' => ['hidden' => true], 'shorts_wordmark' => ['hidden' => true]]],
        'bladesSides' => ['pattern' => 'Blades', 'zones' => $solid('sides')],
        // The polo and Darts shirt pictures (FN6 2026-10-30, measured on them): a black stand-up mock collar with cyan piping
        // on its top edge and inside, and a black quarter-zip placket with a silver pull (zoneColors.quarterZip, viewer); black
        // cuffs and hem, no side strips, a smooth matt knit, a neutral black body. The polo: the wordmark higher and the "3"
        // above its right end; the Darts shirt: the pocket with its cyan band higher, no crest in it, the big wordmark under it.
        // (BR1 2026-11-02, the user: every item carries the 3DEEZI "3" and wordmark: the Darts shirt's "3" on the right chest,
        // across from the pocket, level with it.)
        'poloZip' => ['main' => '#313234', 'secondary' => '#27282a', 'zoneColors' => ['quarterZip' => '#c9ccd1', 'collarPiping' => $cyan], 'marks' => ['top_wordmark' => ['y' => 0.503], 'top_crest' => ['x' => 0.09, 'y' => 0.607, 'scale' => 1.0]]],
        'poloZipPocket' => ['main' => '#313234', 'secondary' => '#27282a', 'zoneColors' => ['quarterZip' => '#c9ccd1', 'collarPiping' => $cyan], 'marks' => ['top_wordmark' => ['x' => 0, 'y' => 0.503, 'scale' => 2.5], 'top_crest' => ['x' => -0.1, 'y' => 0.6, 'scale' => 0.8]]],
        // The bibs pictures (FN5 2026-10-30): black hems; the training bibs' blades up the sides; the netball bibs plain
        // black with bound cyan edges (their objects below).
        'bibs' => ['pattern' => 'Blades', 'zones' => $solid('sides'), 'parts' => ['hem' => ['colour' => '#27282a']]],
        'netballBibs' => ['parts' => ['hem' => ['colour' => '#27282a']]],
        // The shooting shirt picture (FN5 2026-10-30, colours measured on it): its own 3D shirt (viewer shootingshirt.js),
        // cyan raglan sleeves, royal blue cuffs with a cyan stripe, royal blue side shards with cyan blades (pattern Shards),
        // a white 23. (FN10 2026-11-02: its own "3" and word places, so the last tile's (the singlet's lower word, smaller
        // "3") never carry over: the word right under the "3", as the picture.)
        // (FN10 round 2, DT10 measured straight on: the stack 2 cm lower, the word 0.85; the body black a touch lighter
        // and the royal deeper, as they render on the stage.)
        'shooting' => ['main' => '#232427', 'secondary' => '#00c0f5', 'accent' => '#ffffff', 'pattern' => 'Shards', 'patternColor' => '#0048d8', 'parts' => ['leftSleeve' => ['colour' => '#00b0f0'], 'rightSleeve' => ['colour' => '#00b0f0']], 'marks' => ['top_wordmark' => ['x' => 0.08, 'y' => 0.548, 'scale' => 0.85], 'top_crest' => ['x' => 0.08, 'y' => 0.579, 'scale' => 1.0]]],
        'swoosh' => ['pattern' => 'Velocity', 'zones' => $solid('sleeves')],
        // The Rugby League jersey (RL1): royal blue blades with cyan edges over black, the side panels black under the blades.
        'blades' => ['pattern' => 'Blades', 'patternColor' => '#1672f5', 'parts' => ['sides' => ['colour' => '#27282a', 'pattern' => 'Blades']]],
        // The Rugby League jersey and kit (RF1 2026-10-30, the sport's picture kit-rugby-league.webp): the jersey's own
        // Blades (the picture's flames, shoulder stripes and claws), black hem and cuffs (the trims), the cyan collar and a
        // small 3DEEZI line under the "3" mark, the "3" all blue; the kit's shorts without the number and crest, with the picture's tribal side flames
        // (the Blades) and black drawstring tips.
        'rugbyLeague' => ['pattern' => 'Blades', 'patternColor' => '#1672f5', 'secondary' => '#27282a', 'parts' => ['sides' => ['colour' => '#27282a', 'pattern' => 'Blades'], 'collar' => ['colour' => $cyan]], 'zoneColors' => ['crestWord' => $cyan, 'crestMark' => '#1e8ff0', 'cordTips' => '#27282a'], 'marks' => ['shorts_number' => ['hidden' => true], 'shorts_crest' => ['hidden' => true]]],
        // The Rugby jersey and kit TILE pictures (FN4 2026-10-30, user's choice q6: garment-rugby-jersey / garment-rugby-kit,
        // colours measured on them): cyan raglan shoulders over the sleeve tops, wide cyan cuffs, a plain black hem, curved
        // cyan and royal blue side sweeps with thin spikes (viewer jerseysweeps.js); the kit's shorts with cyan side panels
        // and the "3" over a small 3DEEZI low on the left leg (its tile objects below). (FN4: the cyan deeper, #00a2e8, so it renders as
        // saturated as the picture's under the stage lights; a matt fabric with hardly any sheen.) (RF1's claw and flame design, the
        // sport picture's, stays as the look 'rugbyLeague'.)
        'rugbyTile' => ['secondary' => '#00a2e8', 'zoneColors' => ['raglan' => '#00a2e8', 'sweep' => '#00a2e8', 'sweepDeep' => '#0262f6', 'sockToeLine' => '#2b91c1', 'sockMark' => '#0a93ee'], 'parts' => ['shortsSides' => ['colour' => '#00a2e8'], 'shortsHem' => ['colour' => '#27282a'], 'sockBand' => ['colour' => '#0b95dd'], 'sockHoops' => ['colour' => '#0b95dd'], 'sockFoot' => ['colour' => $cyan]], 'marks' => ['top_wordmark' => ['y' => 0.505], 'shorts_number' => ['hidden' => true], 'shorts_crest' => ['hidden' => true]]],
        // The shorts pictures (FN4 2026-10-30: shorts, rugby-shorts, rugby-training-shorts, nfl-training-shorts): cyan side
        // stripes, a black waistband and black hems, no number, black cord tips, the "3" over a 3DEEZI low on the left leg
        // (the word is a tile object below).
        'shortsTile' => ['secondary' => '#00a2e8', 'zones' => $solid('sides'), 'parts' => ['waistband' => ['colour' => '#27282a'], 'shortsHem' => ['colour' => '#27282a']], 'zoneColors' => ['cordTips' => '#27282a'], 'marks' => ['shorts_number' => ['hidden' => true], 'shorts_crest' => ['x' => 0.13, 'y' => 0.115, 'scale' => 0.85]]],
        'shortsPlainTile' => ['secondary' => '#00a2e8', 'zones' => $solid('sides'), 'parts' => ['waistband' => ['colour' => '#27282a'], 'shortsHem' => ['colour' => '#27282a']], 'zoneColors' => ['cordTips' => '#27282a', 'shortsPlain' => '#27282a'], 'marks' => ['shorts_number' => ['hidden' => true], 'shorts_crest' => ['x' => 0.13, 'y' => 0.115, 'scale' => 0.85]]],
        'rugbyShortsTile' => ['secondary' => '#00a2e8', 'zones' => $solid('sides'), 'parts' => ['waistband' => ['colour' => '#27282a'], 'shortsHem' => ['colour' => '#27282a']], 'zoneColors' => ['cordTips' => '#27282a', 'shortsPlain' => '#27282a', 'shortsNarrow' => '#27282a'], 'marks' => ['shorts_number' => ['hidden' => true], 'shorts_crest' => ['x' => 0.13, 'y' => 0.115, 'scale' => 0.85]]],
        // The Singlet picture (FN4 2026-10-30, colours measured on it): black neck and armhole binding (Secondary black),
        // big flat blue shapes up each side reaching in to a point (viewer jerseysweeps.js paintSingletFlows: azure, a light
        // sky lobe, royal blue low), the wordmark a little higher, a smaller "3".
        'singletTile' => ['secondary' => '#27282a', 'zoneColors' => ['flow' => '#2a78c8', 'flowLight' => '#5ab4e4', 'flowDeep' => '#1c58c8'], 'marks' => ['top_wordmark' => ['y' => 0.505], 'top_crest' => ['scale' => 0.7]]],
        'shoulders' => ['zones' => $solid('yoke', 'sleeves')],
        // The hoodies: black, a wide cyan stripe along each sleeve (Hoodie areas › Sleeve stripe), cyan hood lining.
        // (FN5 2026-10-30, the hoodie picture: the stripe's bright cyan at the shoulder (it shades to royal blue down the
        // sleeve, viewer texture.js), one small stacked logo centred on the chest.)
        // (FN11 2026-11-02, DT10: the picture's bright stripe (0,246,254) and deep black body; the netball and nfl hoodie
        // pictures' own looks: a solid stripe (stripeDeep the same), netball's black lining and bigger wordmark with the
        // "3" to its right, nfl's bigger stacked logo.)
        'hoodie' => ['main' => '#161616', 'zoneColors' => ['stripe' => '#00f6fe'], 'marks' => ['top_crest' => ['x' => 0, 'y' => 0.565, 'scale' => 0.85], 'top_wordmark' => ['x' => 0, 'y' => 0.5, 'scale' => 0.6]]],
        'nflHoodie' => ['main' => '#161616', 'zoneColors' => ['stripe' => '#00f6fe', 'stripeDeep' => '#00f6fe', 'cord' => '#00f6fe'], 'marks' => ['top_crest' => ['x' => 0, 'y' => 0.57, 'scale' => 1.05], 'top_wordmark' => ['x' => 0, 'y' => 0.495, 'scale' => 0.78]]],
        'netballHoodie' => ['main' => '#161616', 'zoneColors' => ['stripe' => '#00f6fe', 'stripeDeep' => '#00f6fe', 'lining' => '#1b1c1e'], 'marks' => ['top_crest' => ['x' => 0.1, 'y' => 0.565, 'scale' => 0.7], 'top_wordmark' => ['x' => 0, 'y' => 0.51, 'scale' => 0.85]]],
        // The track jackets (Track jacket areas): black shoulder panels, the cyan sleeve stripe and zips; side panels
        // black ('track') or cyan ('trackSides'); the waterproof jacket's dark grey shell with cyan lower sides and zips.
        // (FN8 2026-10-30: the Track jacket picture's cool blue-black body, collar and panels, a neutral rib; sampled on the stage.)
        // (FN10 2026-11-02, the user: the 3DEEZI word on the right chest and the "3" on the left level, side by side either
        // side of the zip; set here, so another tile's marks never carry over.)
        'track' => ['zoneColors' => ['body' => '#1d2123', 'shoulder' => '#1d2123', 'side' => '#1d2123', 'cuffs' => '#1c2229', 'stripe' => $cyan, 'zip' => $cyan], 'marks' => $trackLevel],
        // The Tracksuit tiles (FN10 2026-11-02, the user: their pictures show the jacket and matching track pants): the
        // jacket over black track pants with a cyan stripe down each outer leg and a small "3" over 3DEEZI on the left thigh
        // (viewer trackpants.js, shown by zoneColors.pantsStripe). Netball: the track jacket's own look, level chest logos.
        // Basketball: cyan side panels, a black zip, a small stacked logo on the left chest. Rugby: the wordmark high on
        // the right chest, the "3" on the left. American football: the stacked logo on the left chest.
        'trackSuit' => ['zoneColors' => ['body' => '#1d2123', 'shoulder' => '#1d2123', 'side' => '#1d2123', 'cuffs' => '#1c2229', 'stripe' => $cyan, 'zip' => $cyan, 'pantsStripe' => $cyan], 'marks' => $trackLevel + $pantsMarks],
        'bballTracksuit' => ['zoneColors' => ['shoulder' => '#27282a', 'side' => $cyan, 'sideBlade' => '#0a5ae6', 'stripe' => $cyan, 'zip' => '#27282a', 'pantsStripe' => $cyan], 'marks' => $trackStack + $pantsMarks],
        'rugbyTracksuit' => ['zoneColors' => ['shoulder' => '#27282a', 'side' => $cyan, 'stripe' => $cyan, 'zip' => $cyan, 'pantsStripe' => $cyan], 'marks' => ['top_wordmark' => ['x' => -0.105, 'y' => 0.6, 'scale' => 1.0], 'top_crest' => ['x' => 0.105, 'y' => 0.59, 'scale' => 1.0]] + $pantsMarks],
        'nflTracksuit' => ['zoneColors' => ['shoulder' => '#27282a', 'side' => $cyan, 'stripe' => $cyan, 'zip' => $cyan, 'pantsStripe' => $cyan, 'lining' => $cyan], 'marks' => $trackStack + $pantsMarks],
        'trackSides' => ['zoneColors' => ['shoulder' => '#27282a', 'side' => $cyan, 'stripe' => $cyan, 'zip' => $cyan]],
        'waterproof' => ['zoneColors' => ['body' => '#24272b', 'shoulder' => '#24272b', 'side' => $cyan, 'stripe' => '#24272b', 'zip' => $cyan]],
        // The Game Kit picture (DT3): the "3" mark small at the V of the neck (the cyan "3" goes on the left chest).
        // (FN3 2026-10-30, the user: the American football pictures use deeper, saturated azure blues, sampled on them and
        // set so the stage renders them: shoulders, cuffs and collar stripe #0096f0, the Game Jersey's side panels deeper
        // #006fc4, the 86's line #00a8ff; the Practice Jersey's 86 a brighter cyan #00c8ff.)
        'nflgame' => ['secondary' => '#0096f0', 'accent' => '#0096f0', 'patternColor' => '#0096f0', 'zones' => $solid('sleeves', 'sides'), 'number' => '86', 'marks' => ['top_number' => ['color' => '#ffffff', 'look' => ['style' => 'outline', 'width' => 0.07, 'color' => '#00a8ff']], 'top_crest' => ['x' => 0, 'y' => 0.655, 'scale' => 0.6]]],
        'nflpractice' => ['zones' => []] + $number($cyan, null),
        // The Game Jersey picture (DT1): a thin cyan line round the white 86, the front number a little bigger and higher.
        // (NF1: the cyan shoulder caps over the pads with piping, black sleeves, a black collar with a cyan inner stripe.)
        // (FX3: the "3" mark at the V on a small black badge, as big as in the picture.)
        'nflgameJersey' => ['secondary' => '#0096f0', 'accent' => '#0096f0', 'patternColor' => '#0096f0', 'zones' => $solid('yoke', 'sides'), 'parts' => ['collar' => ['colour' => '#0b0d10'], 'sides' => ['colour' => '#006fc4']], 'zoneColors' => ['collarStripe' => '#0096f0', 'badge' => '#27282a'], 'number' => '86', 'marks' => ['top_number' => ['color' => '#ffffff', 'look' => ['style' => 'outline', 'width' => 0.02, 'color' => '#00a8ff']], 'top_frontNumber' => ['y' => 0.393, 'scale' => 1.17], 'top_crest' => ['x' => 0, 'y' => 0.628, 'scale' => 1.3]]],
        // The Practice Jersey picture (DT1): black collar, the cyan 86 just under the chest logo.
        // (NF1: a cyan stripe over each shoulder along the sleeve seam.)
        // (FX3: black side panels: the picture has none; the small cyan insert in the point of the V, the "3" mark a little
        // lower under it.)
        'nflpracticeJersey' => ['secondary' => '#0096f0', 'accent' => '#0096f0', 'patternColor' => '#0096f0', 'zones' => [], 'zoneColors' => ['stripe' => '#0090f0', 'vInsert' => '#00c0f8'], 'parts' => ['collar' => ['colour' => '#27282a'], 'sides' => ['colour' => '#27282a']], 'number' => '86', 'marks' => ['top_number' => ['color' => '#00c8ff'], 'top_frontNumber' => ['y' => 0.43], 'top_crest' => ['x' => 0, 'y' => 0.6, 'scale' => 2.2], 'top_wordmark' => ['y' => 0.548]]],
        // The socks (garment 3): cyan hoops under the top band (their trim colour); the pictures' cyan heel and toe, and the rugby socks' cyan top band, are parts.
        // (FN10 2026-11-02, DT10: the hoops brighter, so they render as the picture's (32,196,223) on the stage.)
        'socksHeel' => ['parts' => ['sockFoot' => ['colour' => $cyan], 'sockHoops' => ['colour' => '#10ccff']]],
        // (The rugby socks' top band a deeper blue, as measured on their picture: CF1 2026-10-29.)
        // (FN4 2026-10-30: each socks picture's own layout, viewer sockprint.js: the Rugby picture's band with one black line
        // through it (the hoop under it in the band's blue), the thin line across the forefoot and a flat blue "3"; the
        // Game Socks picture's two wide hoops under a deep black top and a bigger "3".)
        'rugbySocks' => ['parts' => ['sockBand' => ['colour' => '#0b95dd'], 'sockHoops' => ['colour' => '#0b95dd'], 'sockFoot' => ['colour' => $cyan]], 'zoneColors' => ['sockToeLine' => '#2b91c1', 'sockMark' => '#0a93ee']],
        'gameSocks' => ['zoneColors' => ['sockHoopsWide' => $cyan]],
        // (RGSOCKS 2026-11-13, the user: the Rugby League > Socks tile's own 3D model (Tripo; viewer zoneColors.rlSocks shows
        // it, every other socks tile keeps the made pair) starts as the client's booklet picture "Full rugby kit": knee-high
        // navy socks with a small yellow logo high on the front of each shin: our "3" mark there in yellow (zoneColors.sockMark,
        // flat), the hoops under the welt in the navy too (Secondary, the trim colour); colours set so the stage renders them
        // as the picture's (30,40,85 and 240,190,30). No text or logo from the picture.)
        'rlSocks' => ['main' => '#303656', 'secondary' => '#303656', 'accent' => '#f0be1e', 'zoneColors' => ['rlSocks' => '#f0be1e', 'sockMark' => '#f0be1e']],
        // The cap (garment 4): cyan piping (its trim colour); the pictures' cyan and royal blue side sweeps and cyan under the brim.
        'capSweep' => ['parts' => ['capSweep' => ['colour' => $cyan], 'capSweepLow' => ['colour' => '#1a6ef0'], 'capUnder' => ['colour' => $cyan]]],
        // The skirt picture (netball skirt, hockey skort, tennis skirt): its side panels a lighter, greener cyan, as
        // measured on the picture (FM 2026-10-30: 37,198,242).
        'skirt' => ['secondary' => '#25c6f2'],
        // The Basketball shorts picture (FN3 2026-10-30, colours measured on it): long loose black shorts, bright cyan side
        // panels with a royal blue band slanting across them (zoneColors.bballBand: the viewer cuts them as basketball
        // shorts, bballshorts.js), the 3DEEZI mark low on the right leg, no number.
        // (FN6 2026-10-30, DT8: a vivid aqua #00e8ff, the smooth matt fabric (viewer) and a neutral black, as rendered on the stage.)
        // (TRS 2026-11-12, the user: the 3D shorts start as their mockup picture 523: purple body, waistband and side
        // panels, the two hem stripes yellow with purple between, as rendered on the stage; the "3" mark low on the right
        // leg and the 3DEEZI wordmark up the outer left leg, reading upward, placed and sized as the client's demo 524's text; no number.)
        // (RGSHORTS 2026-11-13: the Rugby League Playing Shorts on their own 3D model (viewer zoneColors.rlShorts), in the
        // colours and places of the client's reference "Rugby shorts" (Yellow Images 14565): a golden yellow body, the navy
        // waistband with our 3DEEZI wordmark repeated on it in white (zoneColors.bandWord), navy hem bindings, our number in
        // navy on the wearer's right leg, our small 3DEEZI wordmark low on the wearer's left leg with the "3" mark (or the team's logo) above it; the number in
        // the Accent colour. Set so the
        // stage renders them as the picture's (about 240,190,30 and 30,40,85). None of the picture's own text or logos.)
        'rlShorts' => ['main' => '#fcd12a', 'secondary' => '#fcd12a', 'accent' => '#343a64', 'patternColor' => '#343a64', 'parts' => ['waistband' => ['colour' => '#343a64'], 'shortsHem' => ['colour' => '#343a64']], 'zoneColors' => ['rlShorts' => '#343a64', 'cordTips' => '#343a64', 'bandWord' => '#ffffff'], 'marks' => ['shorts_number' => ['x' => -0.165, 'y' => 0.085, 'scale' => 1.25, 'look' => ['style' => 'outline', 'width' => 0]], 'shorts_crest' => ['x' => 0.19, 'y' => 0.11, 'scale' => 0.9], 'shorts_wordmark' => ['side' => 'front', 'x' => 0.19, 'y' => 0.055, 'scale' => 0.5]], 'layers' => []],
        'bballShorts' => ['main' => '#6a5bb2', 'secondary' => '#6a5bb2', 'accent' => '#00e8ff', 'patternColor' => '#00e8ff', 'zoneColors' => ['bballBand' => '#6a5bb2', 'bballTrim1' => '#ffff4a', 'bballTrim2' => '#ffff4a'], 'marks' => ['shorts_number' => ['hidden' => true], 'shorts_crest' => ['x' => -0.185, 'y' => 0.115, 'scale' => 2.8], 'shorts_wordmark' => ['x' => 0.195, 'y' => 0.205, 'scale' => 2.8, 'rot' => -90]]],
        // The bucket hat pictures (FN1 2026-10-30, colours measured on them): a black hat with a cyan bound edge; the
        // general picture with flat cyan and royal blue shards up the crown and round the brim (viewer hatprint.js).
        'hat' => ['main' => '#1b1c1e', 'secondary' => '#05c3f2'],
        // (FN11 2026-11-02, DT10: the NFL beanie picture: no pom-pom, one cyan stripe at the cuff's top, a big logo.)
        'nflBeanie' => ['main' => '#1b1c1e', 'secondary' => '#05c3f2', 'zoneColors' => ['beanieOne' => '#05c3f2']],
        'hatShards' => ['main' => '#1b1c1e', 'secondary' => '#05c3f2', 'zoneColors' => ['shards' => '#03c8f7', 'shardsDeep' => '#0065f5']],
        // The netball dress (NDF 2026-11-04, the client's preferred model, images 425-427): a deep blue shift with azure
        // full-length side panels, yoke and neck and armhole binding (colours measured on 426 as rendered), each its own
        // colour area (viewer netballdress.js: zoneColors body / panels / yoke / binding).
        // (NDT: the body a little lighter, 43,88,145 on the stage as 426's.)
        // (TRD 2026-11-12, the user: the Tripo dress's starting look in the colours of its own picture, images/525 (the
        // mockup it was made from): a deep blue body (and yoke), light azure side panels and binding, the tabs a deeper
        // shade of the body; set so the stage renders them as the picture's. No bib: position letters are added in Studio.)
        // (BBSINGLET 2026-11-13, the user: the Basketball singlet tile's own 3D model (Tripo; viewer zoneColors.bballSinglet
        // shows it, every other singlet keeps the made one) starts as its mockup picture, images/538: a golden yellow mesh
        // body, a dark charcoal V-neck and armhole binding (Secondary), the "3" mark small on the wearer's right chest and the
        // 3DEEZI wordmark big across the chest where the picture's team name is (no second line: the singlet has no other
        // text mark); colours set so the stage renders them as the picture's. No text or logo from the picture.)
        'bballSinglet' => ['main' => '#e4bf00', 'secondary' => '#42444c', 'accent' => '#42444c', 'patternColor' => '#42444c', 'zoneColors' => ['bballSinglet' => '#42444c'], 'marks' => ['top_crest' => ['x' => -0.1, 'y' => 0.6, 'scale' => 0.3], 'top_wordmark' => ['x' => 0, 'y' => 0.45, 'scale' => 0.75]]],
        // (NBBIB 2026-11-13, the user: the Netball bibs tile's own 3D model (Tripo; viewer zoneColors.netballBib shows it,
        // every other singlet keeps the made one) starts as the booklet's "Netball bib" (Yellow Images 37504): a royal blue
        // bib with a yellow neck binding (the Neck trim), our big white position letters centred front and back (the
        // Number, which netball's Numbers panel calls Position letters), our 3DEEZI wordmark high on the wearer's right chest
        // and our "3" mark in yellow high on the left (zoneColors.crestInk); its edge binding and side ties follow the
        // Secondary (Colours › Netball bib areas); set so the stage renders them as the picture's. Nothing from the picture.)
        'netballBib' => ['number' => 'GS', 'main' => '#2c48bc', 'secondary' => '#2c48bc', 'accent' => '#ffffff', 'patternColor' => $cyan, 'parts' => ['collar' => ['colour' => '#f2bb00']], 'zoneColors' => ['netballBib' => '#2c48bc', 'crestInk' => '#f2bb00'],
            'marks' => ['top_name' => ['hidden' => true], 'top_number' => ['x' => 0, 'y' => 0.26, 'scale' => 0.6], 'top_frontNumber' => ['x' => 0, 'y' => 0.42, 'scale' => 1.4], 'top_crest' => ['x' => 0.095, 'y' => 0.56, 'scale' => 0.45], 'top_wordmark' => ['x' => -0.095, 'y' => 0.56, 'scale' => 0.4]], 'layers' => []],
        'netballDress' => ['number' => '', 'main' => '#30508a', 'secondary' => '#2295dc', 'accent' => '#00d0ff', 'pattern' => 'None', 'patternColor' => '#2295dc',
            'zoneColors' => ['body' => '#30508a', 'panels' => '#2295dc', 'yoke' => '#30508a', 'binding' => '#2295dc']],
    ];
    // The Rugby League Jersey tile (FBJERSEY 2026-11-13, the user: on its own 3D model (viewer fbjersey.js, chosen by
    // zoneColors.fbJersey) in the colours and places of its reference, the booklet's "Rugby jersey" (Yellow Images 15814,
    // images/539): a golden yellow body and round neck band, navy raglan sleeves and navy cuffs (zoneColors.cuffStripe: no
    // band at the cuffs; the picture's thin yellow stripe could not be printed cleanly on the model's cuffs), the number big
    // and navy in the middle of the chest (marks.top_frontNumber) and on the back, our "3" mark on the left chest and the
    // small 3DEEZI wordmark on the right chest, where the picture has its badge and its brand's mark (no text or logo from
    // the picture); set so the stage renders them as the picture's. Its collar, sleeves, side panels and hem are parts.)
    $looks['rlJersey'] = ['main' => '#e2bf3a', 'secondary' => '#e2bf3a', 'accent' => '#32324c', 'patternColor' => '#32324c',
        'parts' => ['leftSleeve' => ['colour' => '#32324c'], 'rightSleeve' => ['colour' => '#32324c']],
        'zoneColors' => ['fbJersey' => '#32324c', 'cuffStripe' => '#e2bf3a'],
        'marks' => ['top_number' => ['color' => '#32324c'], 'top_frontNumber' => ['x' => 0, 'y' => 0.45], 'top_wordmark' => ['x' => -0.1, 'y' => 0.6, 'scale' => 0.42], 'top_crest' => ['x' => 0.1, 'y' => 0.6, 'scale' => 1.0]]];
    return $extra + ($looks[$name] ?? []) + $base + ['number' => '23', 'marks' => []];
};

$sports = [
    // The client's own lists and words: Rugby League and Rugby (images/160.jpg, 11 tiles, no "More teamwear"); pictures:
    // the client's own tiles (images/161.jpg) remade in high resolution, garment-rugby-*.webp.
    ['id' => 'rugby-league', 'name' => 'Rugby League', 'description' => 'Made for every tackle. Built for your team.', 'group' => 'sports', 'more' => false, 'tiles' => [
        $tile('Rugby League Kit', 'Jersey, playing shorts and socks.', 'fullkit', 'rugby-kit'),
        // (On its own 3D model in its reference's colours, FBJERSEY 2026-11-13; the kit keeps the made jersey.)
        $tile('Jersey', 'Performance rugby league jersey.', 'jersey', 'rugby-jersey') + ['design' => $look('rlJersey')],
        $tile('Playing Shorts', 'Durable rugby league shorts.', 'shorts', 'rugby-shorts') + ['design' => $look('rlShorts')],
        $tile('Socks', 'Knee-high match socks.', 'socks', 'rugby-socks') + ['design' => $look('rlSocks')],
        $tile('Polo', 'Smart team polo with collar.', 'polo', 'rugby-polo'),
        $tile('Training Tee', 'Breathable tee for training.', 'tee', 'rugby-tee'),
        $tile('Training Shorts', 'Lightweight shorts with zip pockets.', 'shorts', 'rugby-training-shorts'),
        $tile('Hooded Tracksuit', 'Full-zip jacket with hood and pants.', 'trackjacket', 'rugby-hooded-tracksuit') + ['design' => ['trackStyle' => 'hood']],
        $tile('Cap', 'Curved brim sports cap.', 'cap', 'rugby-cap'),
        $tile('Bucket Hat', 'Wide brim bucket hat.', 'bucket-hat', 'rugby-bucket-hat'),
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
        $tile('Hooded Tracksuit', 'Full-zip jacket with hood and pants.', 'trackjacket', 'rugby-hooded-tracksuit') + ['design' => ['trackStyle' => 'hood']],
        $tile('Cap', 'Curved brim sports cap.', 'cap', 'rugby-cap'),
        $tile('Bucket Hat', 'Wide brim bucket hat.', 'bucket-hat', 'rugby-bucket-hat'),
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
        $tile('Basketball singlet', 'Game singlet with a big number.', 'singlet') + ['design' => $look('bballSinglet')],
        $tile('Basketball shorts', 'Long, loose game shorts.', 'shorts', 'basketball-shorts'),
        $tile('Shooting shirt', 'Warm-up shirt for the shoot-around.', 'shooting-shirt'),
        $tile('Reversible training singlet', 'Light singlet for practice games.', 'singlet'),
        $tile('Training tee', 'Breathable tee for training and warm-ups.', 'tee'),
        $tile('Warm-up hoodie', 'Warm hoodie for the bench and travel.', 'hoodie', 'team-hoodie'),
        $tile('Tracksuit', 'Full-zip jacket and matching pants.', 'trackjacket', 'tracksuit'),
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
        // Its own 3D model since 2026-11-13 (NBBIB, Tripo; look 'netballBib').
        $tile('Netball bibs', 'Pullover bibs with position patches.', 'singlet', 'netball-bibs') + ['design' => $look('netballBib')],
        $tile('Tracksuit', 'Full-zip jacket and matching pants.', 'trackjacket', 'netball-tracksuit'),
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
    // HEADWEAR (CP1, client mockup images/296.jpg, 2026-11-02): caps, bucket hats, beanies and 5-panel caps, next to AFL.
    // The beanie and the 5-panel cap show COMING SOON until their 3D models are ready.
    ['id' => 'headwear', 'name' => 'Headwear', 'description' => 'Caps, bucket hats and beanies in your colours.', 'group' => 'apparel', 'more' => false, 'names' => false, 'numbers' => false,
        'prompt' => 'headwear: team caps, bucket hats and knitted beanies with the club logo, black with bright accent piping and stripes', 'tiles' => [
            $tile('Cap', 'Six-panel cap with a curved brim.', 'cap', 'rugby-cap'),
            $tile('Bucket Hat', 'Wide brim bucket hat.', 'bucket-hat', 'rugby-bucket-hat'),
            $tile('Beanie', 'Rib-knit beanie with a pom-pom and a folded cuff.', 'beanie'),
            $tile('5 Panel Cap', 'One wide front panel and a flat brim.', 'five-panel-cap'),
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
            $tile('Hooded Tracksuit', 'Full-zip jacket with hood and pants.', 'trackjacket', 'nfl-hooded-tracksuit') + ['design' => ['trackStyle' => 'hood']],
            $near('Waterproof Jacket', 'Weatherproof jacket with hood.', 'trackjacket', 'waterproof-jacket', 'nfl-waterproof-jacket') + ['design' => ['trackStyle' => 'hood']],
            $tile('Cap', 'Curved brim sports cap.', 'cap', 'nfl-cap'),
            $tile('Bucket Hat', 'Wide brim bucket hat.', 'bucket-hat', 'nfl-bucket-hat'),
            $tile('Beanie', 'Knitted beanie with a cuff.', 'beanie', 'nfl-beanie'),
        ]],
    ['id' => 'golf', 'name' => 'Golf', 'description' => 'Clean lines for every round.', 'group' => 'sports',
        'prompt' => 'golf: a premium fitted performance polo, clean and understated; a quarter-zip pullover suits too', 'tiles' => [
            $tile('Golf polo', 'Premium fitted polo for every round.', 'polo'),
            $tile('Golf tee', 'Soft tee for the range.', 'tee'),
            $tile('Clubhouse hoodie', 'Warm hoodie for after the round.', 'hoodie', 'team-hoodie'),
            $tile('Zip hoodie', 'Full-zip layer for cool mornings.', 'ziphoodie'),
            $tile('Golf cap', 'Cap with an embroidered club logo.', 'cap'),
            $tile('Bucket hat', 'Sun-smart hat for the course.', 'bucket-hat'),
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
            $tile('Bucket hat', 'Wide-brim hat for the field.', 'bucket-hat'),
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
            $tile('Bucket hat', 'Sun-smart hat for the green.', 'bucket-hat'),
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
            $tile('Bucket hat', 'Sun-smart hat with a wide brim.', 'bucket-hat'),
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
    'jersey' => 'tribal', 'fullkit' => 'tribalKit', 'rugby-jersey' => 'rugbyTile', 'rugby-kit' => 'rugbyTile', 'nfl-kit' => 'nflgame', 'rash-guard' => 'blades',
    'polo' => 'poloZip', 'pocketpolo' => 'poloZipPocket', 'rugby-polo' => 'sleeves', 'tee' => 'teeTile', 'nfl-tee' => 'teeCyan', 'rugby-tee' => 'teeSides', 'netball-tee' => 'teeSidesNetball', 'shooting-shirt' => 'shooting',
    'singlet' => 'singletTile', 'netball-training-singlet' => 'bladesSides', 'afl-guernsey' => 'bladesSides', 'netball-singlet-bib' => 'bladesSides', 'bibs' => 'bibs', 'netball-bibs' => 'netballBibs', 'netball-dress' => 'bladesSides',
    'team-hoodie' => 'hoodie', 'nfl-hoodie' => 'nflHoodie', 'netball-hoodie' => 'netballHoodie', 'nfl-compression-top' => 'sides',
    'trackjacket' => 'track', 'netball-tracksuit' => 'trackSuit', 'tracksuit' => 'bballTracksuit', 'rugby-hooded-tracksuit' => 'rugbyTracksuit', 'nfl-hooded-tracksuit' => 'nflTracksuit',
    'rugby-waterproof-jacket' => 'waterproof', 'nfl-waterproof-jacket' => 'waterproof',
    'shorts' => 'shortsPlainTile', 'rugby-shorts' => 'rugbyShortsTile', 'rugby-training-shorts' => 'shortsTile', 'nfl-training-shorts' => 'shortsTile',
    'socks' => 'socksHeel', 'rugby-socks' => 'rugbySocks', 'nfl-socks' => 'gameSocks', 'cap' => 'capSweep', 'nfl-cap' => 'capSweep', 'netball-skirt' => 'skirt', 'basketball-shorts' => 'bballShorts',
    'bucket-hat' => 'hatShards', 'nfl-bucket-hat' => 'hat', 'rugby-bucket-hat' => 'hat',
    // (CP1: the beanie and the 5-panel cap pictures: black with bright cyan stripes, pom-pom and piping, the trim colour.)
    'beanie' => 'hat', 'nfl-beanie' => 'nflBeanie', 'five-panel-cap' => 'hat',
];
$sideLooks = ['shorts', 'trackjacket', 'compression'];
// What a picture shows on top of its look (objects with ids 'tile-…', which a new tile takes off again): netball
// position letters front and back (no name or number, as on the bibs), the small "3" high on the sleeve.
// (BR1 2026-11-02, the user: every item carries the 3DEEZI "3" and wordmark: as the singlet-with-bib and dress pictures,
// the "3" over a small 3DEEZI centred high on the chest, above the letters, as on the training bibs.)
$letters = fn (string $text, float $y = 0.36, float $size = 0.16) => ['marks' => ['top_name' => ['hidden' => true], 'top_number' => ['hidden' => true], 'top_crest' => ['x' => 0, 'y' => 0.6, 'scale' => 0.75], 'top_wordmark' => ['x' => 0, 'y' => 0.55, 'scale' => 0.45]], 'layers' => [
    ['type' => 'text', 'id' => 'tile-position', 'name' => 'Position', 'part' => 'top', 'side' => 'front', 'x' => 0, 'y' => $y, 'text' => $text, 'size' => $size, 'color' => '#ffffff'],
    ['type' => 'text', 'id' => 'tile-position-back', 'name' => 'Position', 'part' => 'top', 'side' => 'back', 'x' => 0, 'y' => $y, 'text' => $text, 'size' => $size, 'color' => '#ffffff'],
]];
// The training bibs picture (FN5 2026-10-30): the "3" mark over a small 3DEEZI high on the chest, the GS under them.
$trainingBibs = ['marks' => ['top_name' => ['hidden' => true], 'top_number' => ['hidden' => true], 'top_crest' => ['x' => 0, 'y' => 0.6, 'scale' => 0.75], 'top_wordmark' => ['x' => 0, 'y' => 0.55, 'scale' => 0.45]], 'layers' => $letters('GS', 0.42)['layers']];
// The netball bibs picture (FN5): a big GS and the cyan binding down each side edge, front and back (the open sides).
$netballBibs = $letters('GS', 0.38, 0.26);
foreach (['front', 'back'] as $side) foreach ([1, -1] as $dir) $netballBibs['layers'][] = ['type' => 'shape', 'id' => 'tile-edge-'.$side.($dir > 0 ? '-l' : '-r'), 'name' => 'Side binding', 'part' => 'top', 'side' => $side, 'x' => 0.205 * $dir, 'y' => 0.25, 'shape' => 'rectangle', 'w' => 0.024, 'h' => 0.52, 'color' => '#16b4f0'];
// The Game Kit picture's cyan "3" sits on the left chest, level with the crest at the V.
$chestThree = ['layers' => [['type' => 'text', 'id' => 'tile-sleeve', 'name' => 'Chest number', 'part' => 'top', 'side' => 'front', 'x' => 0.15, 'y' => 0.631, 'text' => '3', 'size' => 0.072, 'color' => '#00a0f8']]];
// The Game Jersey picture (FX3): its chest "3" bold and slanted in the block jersey font with a light cyan edge, clear
// of the shoulder piping; small white "3"s with a cyan line (as the 86) on the tops of the shoulders.
// (FN3 2026-10-30: the picture's shoulder numbers are the 86, its "8" on the one shoulder and its "6" on the other,
// lying along the shoulder.)
$shoulderThree = fn (int $dir) => ['type' => 'text', 'id' => $dir > 0 ? 'tile-shoulder' : 'tile-shoulder-right', 'name' => 'Shoulder number', 'part' => 'top', 'side' => 'front', 'x' => 0.168 * $dir, 'y' => 0.692, 'rot' => 80 * $dir, 'text' => $dir > 0 ? '8' : '6', 'size' => 0.056, 'color' => '#ffffff', 'font' => 'JerseyBlock', 'look' => ['style' => 'outline', 'width' => 0.08, 'color' => '#00a8ff']];
$gameThree = ['layers' => [
    ['type' => 'text', 'id' => 'tile-sleeve', 'name' => 'Chest number', 'part' => 'top', 'side' => 'front', 'x' => 0.132, 'y' => 0.632, 'text' => '3', 'size' => 0.072, 'color' => '#00a0f8', 'font' => 'JerseyBlock', 'look' => ['style' => 'outline', 'width' => 0.03, 'color' => '#8fe0ff', 'shape' => 'slant']],
    $shoulderThree(1), $shoulderThree(-1),
]];
// The Compression Top picture (CF1 2026-10-29): the cyan "3" upright on the upper arm, seen from the front. (DT4: the
// small "3" is on the black neck label inside the back neck, the viewer's own; nothing printed under the crew neck.)
// (FX3: a squared block numeral, taller, as the picture's: the jersey font.) (FM print fixer 2026-10-30: upright from
// the front, tall and condensed (`narrow`), just inside the arm's outer edge, no longer cut off by it.)
// (Detail tester 2026-10-30: the crest at its own place, stacked over the wordmark as in the picture; without it the
// Game Jersey tile's small high crest stayed on when this tile was picked after it.)
// (FM print fixer round 2, 2026-10-30: colours sampled from the picture: the panels, sleeve stripes and back print a
// deep azure (#008ad8), the raglan piping and the sleeve "3" the picture's brighter cyan (#00c4f0, zoneColors.piping);
// the "3" turned upright along the arm, smaller and set in from its outer edge, as the picture's 34 x 70 px.)
$sleeveThree = ['secondary' => '#008ad8', 'accent' => '#008ad8', 'patternColor' => '#008ad8', 'zoneColors' => ['piping' => '#00c4f0'], 'marks' => ['top_crest' => ['scale' => 1]], 'layers' => [
    ['type' => 'text', 'id' => 'tile-sleeve', 'name' => 'Sleeve number', 'part' => 'top', 'side' => 'front', 'x' => 0.3565, 'y' => 0.5467, 'rot' => -45, 'text' => '3', 'size' => 0.112, 'narrow' => 0.39, 'color' => '#00c4f0', 'font' => 'JerseyBlock'],
]];
// The netball dress on its own 3D dress (NDF, the client's 425 / 427): the 3DEEZI mark and wordmark on the chest under
// the yoke, a position bib a shade lighter than the body below them (0.36 to 0.61 of the height down, inside the
// viewer's bib-holder tabs) with the white position letters, the same on the back 3 cm lower (as 425's); no name or number. (Keyed
// picture@garment: the Tennis dress tile shows the same picture on the singlet, with the bibs' letters.)
$dressBib = ['marks' => ['top_name' => ['hidden' => true], 'top_number' => ['hidden' => true]], 'layers' => [
    ['type' => 'shape', 'id' => 'tile-bib', 'name' => 'Position bib', 'part' => 'top', 'side' => 'front', 'x' => 0, 'y' => 0.455, 'shape' => 'rectangle', 'w' => 0.205, 'h' => 0.215, 'color' => '#4a6696'],
    ['type' => 'shape', 'id' => 'tile-bib-back', 'name' => 'Position bib', 'part' => 'top', 'side' => 'back', 'x' => 0, 'y' => 0.434, 'shape' => 'rectangle', 'w' => 0.205, 'h' => 0.215, 'color' => '#4a6696'],
    ['type' => 'text', 'id' => 'tile-position', 'name' => 'Position', 'part' => 'top', 'side' => 'front', 'x' => 0, 'y' => 0.428, 'text' => 'WA', 'size' => 0.185, 'color' => '#ffffff'],
    ['type' => 'text', 'id' => 'tile-position-back', 'name' => 'Position', 'part' => 'top', 'side' => 'back', 'x' => 0, 'y' => 0.407, 'text' => 'WA', 'size' => 0.185, 'color' => '#ffffff'],
]];
// The Rugby kit picture (FN4): the cyan "3" over a small white 3DEEZI, low on the shorts' left leg.
$rugbyShorts = ['layers' => [
    ['type' => 'text', 'id' => 'tile-shorts-mark', 'name' => 'Shorts mark', 'part' => 'shorts', 'side' => 'front', 'x' => 0.15, 'y' => 0.11, 'text' => '3', 'size' => 0.06, 'color' => '#00a2e8', 'font' => 'JerseyBlock'],
    ['type' => 'text', 'id' => 'tile-shorts-word', 'name' => 'Shorts wordmark', 'part' => 'shorts', 'side' => 'front', 'x' => 0.15, 'y' => 0.06, 'text' => '3DEEZI', 'size' => 0.032, 'color' => '#ffffff'],
]];
// The shorts pictures (FN4): a 3DEEZI (white "3D", blue "EEZI") under the "3" mark, low on the left leg.
$shortsWord = ['layers' => [
    ['type' => 'text', 'id' => 'tile-shorts-word', 'name' => 'Shorts wordmark', 'part' => 'shorts', 'side' => 'front', 'x' => 0.11, 'y' => 0.06, 'text' => '3D', 'size' => 0.036, 'color' => '#ffffff'],
    ['type' => 'text', 'id' => 'tile-shorts-word2', 'name' => 'Shorts wordmark', 'part' => 'shorts', 'side' => 'front', 'x' => 0.15, 'y' => 0.06, 'text' => 'EEZI', 'size' => 0.036, 'color' => '#1e8ff0'],
]];
$pictureExtras = [
    'bibs' => $trainingBibs, 'netball-bibs' => $netballBibs, 'netball-singlet-bib' => $letters('GA'), 'netball-dress' => $letters('WA'),
    // (TRD 2026-11-12: the dress starts as its picture, images/525: no bib or letters; its position letters are the
    // Numbers panel's, as every netball top's.)
    'netball-dress@netball-dress' => ['marks' => ['top_name' => ['hidden' => true]], 'layers' => []],
    'nfl-kit' => $chestThree, 'nfl-compression-top' => $sleeveThree,
    'rugby-kit' => $rugbyShorts,
    'shorts' => $shortsWord, 'rugby-shorts' => $shortsWord, 'rugby-training-shorts' => $shortsWord, 'nfl-training-shorts' => $shortsWord,
];
$pictureLooks += ['varsity' => 'varsity', 'nfl-varsity' => 'nflVarsity'];
foreach ($sports as &$sport) {
    foreach ($sport['tiles'] as &$t) {
        if ($t['fit'] === 'soon') continue;
        if (! isset($t['design']['main'])) {
            $name = $pictureLooks[$t['image']] ?? (in_array($t['garment'], $sideLooks, true) ? 'sides' : 'plain');
            $t['design'] = $look($name, $t['design'] ?? []);
        }
        // (A look with its own objects (the Rugby League Playing Shorts' 'rlShorts': none) keeps them, not its picture's.)
        $extra = isset($t['design']['layers']) ? [] : $pictureExtras[$t['image'].'@'.$t['garment']] ?? $pictureExtras[$t['image']] ?? ($t['image'] === 'nfl-jersey' ? $gameThree : []);
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
        // Task 9.126 (NDF 2026-11-04): a women's fitted shift dress to mid-thigh, side panels and a yoke, on the female figure.
        ['id' => 'netball-dress', 'name' => 'Netball dress', 'description' => 'Fitted shift dress for women, with side panels and a yoke.'],
        // Task 9.113: the American football jersey, cut wide over shoulder pads with short cap sleeves (Game / Practice Jersey).
        ['id' => 'nfljersey', 'name' => 'Football jersey', 'description' => 'American football cut: wide over the shoulder pads, short cap sleeves.'],
        // The compression top (NFL base layer): skin-tight long sleeves, crew neck, smooth stretch fabric.
        // Knee-high team socks (garment 3): hoops under the top band, heel and toe, the crest on the shin.
        ['id' => 'socks', 'name' => 'Socks', 'description' => 'Knee-high team socks in rib knit, with hoops and your crest.'],
        // The team cap (garment 4): structured six panels with piping, a curved brim, your crest on the front.
        ['id' => 'cap', 'name' => 'Cap', 'description' => 'Six-panel team cap with piping, a curved brim and your crest.'],
        // The 5-panel cap (CP1, client 2026-11-02): one wide seamless front panel and a flatter brim.
        ['id' => 'five-panel-cap', 'name' => '5 panel cap', 'description' => 'One wide seamless front panel, piping and a flat brim.'],
        // The beanie (CP1, client mockup images/296.jpg): rib knit, a folded cuff with your crest, stripes and a pom-pom.
        ['id' => 'beanie', 'name' => 'Beanie', 'description' => 'Rib-knit beanie with a folded cuff, stripes and a pom-pom.'],
        // The netball / tennis skirt and hockey skort (COMING SOON 10): A-line, gathered elastic waistband, side panels.
        ['id' => 'skirt', 'name' => 'Skirt', 'description' => 'A-line skirt with a gathered waistband and side panels.'],
        // The bucket hat (garment 5): a soft cotton crown and a wide sloping brim with a bound edge, your crest on the front.
        ['id' => 'bucket-hat', 'name' => 'Bucket hat', 'description' => 'Soft cotton bucket hat with a wide brim and your crest.'],
        ['id' => 'compression', 'name' => 'Compression top', 'description' => 'Skin-tight long-sleeve base layer in smooth stretch fabric.'],
        // The basketball shooting shirt (FN5 2026-10-30): a loose raglan V-neck warm-up tee with wide short sleeves.
        ['id' => 'shooting-shirt', 'name' => 'Shooting shirt', 'description' => 'Loose V-neck warm-up shirt with raglan sleeves.'],
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
