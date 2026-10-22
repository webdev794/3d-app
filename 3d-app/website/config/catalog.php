<?php

return [
    /*
     * The sports and apparel categories, in carousel order: the DYO sport chooser, the AI designer's tiles, orders, pricing and
     * ASSIST all read this list. 'group' sorts the quick-access tiles (ALL / SPORTS / APPAREL). 'garments': the 3D garments
     * offered for it, most likely first (the DYO garment step and the AI designer's garment chips); the new garments of tasks
     * 9.18-9.49 replace these defaults as they are built. 'prompt': a style hint the image model gets with the sport's name.
     * Pictures: media/showroom/kit-<id>.webp (DYO stage) and media/images/ai-designer/sport-<id>.webp (AI tile); the symbol is
     * CategoryIcon (GarmentIcon.tsx and lib/widgets/category_icon.dart). The app mirrors this list in lib/sports_catalog.dart.
     */
    'sports' => [
        ['id' => 'rugby-league', 'name' => 'Rugby League', 'description' => 'Made for every tackle. Built for your team.', 'group' => 'sports', 'garments' => ['jersey', 'fullkit', 'shorts', 'tee', 'singlet', 'polo', 'trackjacket']],
        ['id' => 'rugby-union', 'name' => 'Rugby Union', 'description' => 'A proud tradition. A kit of your own.', 'group' => 'sports', 'garments' => ['jersey', 'fullkit', 'shorts', 'tee', 'singlet', 'polo', 'trackjacket']],
        ['id' => 'football', 'name' => 'Football', 'description' => 'Own the pitch, from first whistle to last.', 'group' => 'sports', 'garments' => ['jersey', 'fullkit', 'shorts', 'tee', 'singlet', 'polo', 'trackjacket']],
        ['id' => 'basketball', 'name' => 'Basketball', 'description' => 'Court-ready looks for a different kind of game.', 'group' => 'sports', 'garments' => ['singlet', 'fullkit', 'shorts', 'tee', 'polo', 'varsity', 'trackjacket']],
        ['id' => 'netball', 'name' => 'Netball', 'description' => 'Move together. Stand out together.', 'group' => 'sports', 'garments' => ['singlet', 'shorts', 'tee', 'polo', 'trackjacket']],
        ['id' => 'afl', 'name' => 'AFL', 'description' => 'A new look for your next big mark.', 'group' => 'sports', 'garments' => ['jersey', 'fullkit', 'shorts', 'tee', 'singlet', 'polo', 'trackjacket']],
        ['id' => 'hockey', 'name' => 'Hockey', 'description' => 'Fast play. Unmistakable team identity.', 'group' => 'sports', 'garments' => ['jersey', 'fullkit', 'shorts', 'tee', 'singlet', 'polo', 'trackjacket']],
        // Added 2026-10-21 (task 9.79). The client's first six: American football, golf, tennis, athletics, swimming, darts.
        ['id' => 'american-football', 'name' => 'American Football', 'description' => 'Big numbers. Bigger game days.', 'group' => 'sports', 'garments' => ['jersey', 'fullkit', 'shorts', 'tee', 'varsity'],
            'prompt' => 'American football: a short-sleeve jersey cut wide over the shoulder pads, big block numbers on the front, back and sleeves, sleeve stripes'],
        ['id' => 'golf', 'name' => 'Golf', 'description' => 'Clean lines for every round.', 'group' => 'sports', 'garments' => ['polo', 'tee'],
            'prompt' => 'golf: a premium fitted performance polo, clean and understated; a quarter-zip pullover suits too'],
        ['id' => 'tennis', 'name' => 'Tennis', 'description' => 'Crisp kit for every rally.', 'group' => 'sports', 'garments' => ['polo', 'tee', 'shorts', 'singlet'],
            'prompt' => 'tennis: a crisp performance polo or crew tee with shorts; a skirt or dress for women\'s kits'],
        ['id' => 'athletics', 'name' => 'Athletics', 'description' => 'Track, road and cross-country, built for speed.', 'group' => 'sports', 'garments' => ['singlet', 'shorts', 'tee', 'trackjacket'],
            'prompt' => 'athletics and running: a racing singlet with split shorts; a crop top for women'],
        ['id' => 'swimming', 'name' => 'Swimming', 'description' => 'Club colours on the pool deck.', 'group' => 'sports', 'garments' => ['tee', 'polo', 'singlet', 'shorts', 'hoodie'],
            'prompt' => 'swimming: club deck apparel (tees, hoodies, parka-style deck coats) with swim caps in the club colours'],
        ['id' => 'darts', 'name' => 'Darts & Pool', 'description' => 'Your name on your back, every leg and frame.', 'group' => 'sports', 'garments' => ['pocketpolo', 'polo', 'tee'],
            'prompt' => 'darts and pool: a sublimated polo with a chest pocket, the player\'s name across the back shoulders and sponsors on the back and sleeves'],
        ['id' => 'touch', 'name' => 'Touch', 'description' => 'Touch football and Oztag, fast and light.', 'group' => 'sports', 'garments' => ['tee', 'fullkit', 'shorts', 'singlet', 'trackjacket'],
            'prompt' => 'Touch football and Oztag: a lightweight raglan tee or singlet with shorts'],
        ['id' => 'cricket', 'name' => 'Cricket', 'description' => 'Coloured kit for the short game.', 'group' => 'sports', 'garments' => ['polo', 'tee', 'jersey', 'trackjacket'],
            'prompt' => 'cricket: a one-day cricket shirt with a polo collar (short or long sleeves) and matching long trousers; whites for the long format'],
        ['id' => 'softball', 'name' => 'Softball', 'description' => 'Softball and baseball, straight from the diamond.', 'group' => 'sports', 'garments' => ['jersey', 'tee', 'polo', 'shorts', 'varsity'],
            'prompt' => 'softball and baseball: a full button-front jersey (or a two-button henley with raglan sleeves), pinstripes allowed, script team name across the chest'],
        ['id' => 'volleyball', 'name' => 'Volleyball', 'description' => 'Indoor and beach, ready to rise.', 'group' => 'sports', 'garments' => ['jersey', 'singlet', 'shorts', 'fullkit'],
            'prompt' => 'volleyball: a fitted short-sleeve or sleeveless jersey with a big number, short shorts'],
        ['id' => 'lacrosse', 'name' => 'Lacrosse', 'description' => 'Pinnies and shorts for the fastest game on feet.', 'group' => 'sports', 'garments' => ['singlet', 'shorts', 'jersey', 'fullkit'],
            'prompt' => 'lacrosse: a loose sleeveless pinnie with a big number, long lacrosse shorts'],
        ['id' => 'cycling', 'name' => 'Cycling', 'description' => 'Club jerseys made for the long ride.', 'group' => 'sports', 'garments' => ['jersey', 'singlet', 'shorts'],
            'prompt' => 'cycling: a close-fitting full-zip cycling jersey with rear pockets, bib shorts'],
        ['id' => 'bmx', 'name' => 'BMX', 'description' => 'Loud race jerseys for the gate.', 'group' => 'sports', 'garments' => ['jersey', 'fullkit', 'tee'],
            'prompt' => 'BMX and motocross: a loose long-sleeve V-neck race jersey with bold graphics, vented race pants'],
        ['id' => 'lawn-bowls', 'name' => 'Lawn Bowls', 'description' => 'Smart club colours for the green.', 'group' => 'sports', 'garments' => ['polo', 'tee'],
            'prompt' => 'lawn bowls: a smart club polo with a collar, light sublimated patterns'],
        ['id' => 'esports', 'name' => 'Esports', 'description' => 'Pro gaming jerseys with your tag on the back.', 'group' => 'sports', 'garments' => ['jersey', 'tee', 'polo'],
            'prompt' => 'esports: a pro gaming jersey with sharp sublimated graphics, sponsor patches and the gamer tag across the back'],
        ['id' => 'training', 'name' => 'Training', 'description' => 'Everyday performance, your way.', 'group' => 'apparel', 'garments' => ['tee', 'singlet', 'shorts', 'polo', 'jersey', 'hoodie', 'ziphoodie', 'varsity', 'trackjacket']],
        ['id' => 'fight-wear', 'name' => 'Fight Wear', 'description' => 'Rash guards and fight shorts for the cage and the mat.', 'group' => 'apparel', 'garments' => ['tee', 'shorts', 'singlet'],
            'prompt' => 'fight wear (MMA, boxing, BJJ, Muay Thai): a compression rash guard and fight shorts with side splits'],
        ['id' => 'fishing', 'name' => 'Fishing', 'description' => 'Sun-smart shirts for the boat and the beach.', 'group' => 'apparel', 'garments' => ['jersey', 'polo', 'tee', 'hoodie'],
            'prompt' => 'fishing: a lightweight long-sleeve fishing shirt with a zip or button collar or a hood, ocean graphics'],
        ['id' => 'workwear', 'name' => 'Workwear', 'description' => 'Hi-vis and work shirts with your business on them.', 'group' => 'apparel', 'garments' => ['polo', 'tee', 'jersey'],
            'prompt' => 'workwear and hi-vis: a fluoro work shirt or polo with reflective tape bands and the business logo'],
        ['id' => 'gymwear', 'name' => 'Gymwear', 'description' => 'Fitness gear for every session.', 'group' => 'apparel', 'garments' => ['singlet', 'tee', 'shorts', 'hoodie', 'ziphoodie', 'trackjacket'],
            'prompt' => 'gym and fitness wear: a muscle-fit singlet or tee with training shorts'],
        ['id' => 'teamwear', 'name' => 'Club Casual', 'description' => 'Teamwear for travel, the sideline and the clubhouse.', 'group' => 'apparel', 'garments' => ['polo', 'tee', 'shorts', 'hoodie', 'ziphoodie', 'varsity', 'trackjacket'],
            'prompt' => 'club casual teamwear: a smart club polo or tee with an embroidered crest'],
        ['id' => 'school-leavers', 'name' => 'School Leavers', 'description' => 'Your year, your names, one jersey.', 'group' => 'apparel', 'garments' => ['jersey', 'polo', 'tee', 'hoodie', 'ziphoodie', 'varsity', 'trackjacket'],
            'prompt' => 'school leavers: a long-sleeve rugby-collar jersey with the class year big on the front or back and every student\'s name'],
    ],
    'garments' => [
        ['id' => 'jersey', 'name' => 'Jersey', 'description' => 'Your match-day essential.'],
        ['id' => 'shorts', 'name' => 'Shorts', 'description' => 'Complete your team look.'],
        ['id' => 'tee', 'name' => 'Training Tee', 'description' => 'From warm-up to wind-down.'],
        ['id' => 'singlet', 'name' => 'Singlet', 'description' => 'Lightweight and ready to move.'],
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
