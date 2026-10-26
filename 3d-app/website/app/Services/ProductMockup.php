<?php

namespace App\Services;

/**
 * The Studio's "Mockup" button: studio product photos (front, back, 3/4) of the user's own design, in the
 * style of premium ghost-mannequin catalogue mockups. The 3D captures are the reference; the prompt asks for
 * product-photo realism while keeping the design exactly as made.
 */
class ProductMockup
{
    public const VIEWS = ['front', 'back', 'three-quarter'];

    public const BACKGROUNDS = [
        'light-grey' => 'a seamless smooth light-grey (#e6e7e9) studio paper background with a very soft vignette',
        'white' => 'a seamless clean pure-white studio background, like an e-commerce product shot',
        'dark' => 'a seamless charcoal-grey (#2a2c30) studio background with a soft gradient falloff',
    ];

    /**
     * The 3DEEZI shield the 3D kit wears on the chest until the club has a logo: image models misread its
     * small "3D" as "30". Also used by PlayerShot (the app's ProductMockup.badge matches).
     */
    public const BADGE = 'the small shield badge on the chest, if there is one, reads the letters 3D (three-D, not the number 30): a 3 and a capital letter D';

    public static function prompt(string $view, string $background, array $meta): string
    {
        $garment = trim(($meta['sport'] ?? '').' '.($meta['garment'] ?? 'garment'));
        // In capitals, as the 3D kit draws the wordmark and the back name.
        $logo = mb_strtoupper(trim((string) ($meta['logoText'] ?? '')));
        $back = mb_strtoupper(trim((string) ($meta['backName'] ?? ''))) ?: $logo;
        $number = trim((string) ($meta['number'] ?? ''));
        $text = match ($view) {
            'back' => filled($number)
                ? "the back name reads exactly \"{$back}\" and the back number reads exactly \"{$number}\""
                : (filled($back) ? "the back lettering reads exactly \"{$back}\"" : 'the back keeps its graphics as they are'),
            default => (filled($logo) ? "the team wordmark on the chest reads exactly \"{$logo}\"" : 'the chest crest and graphics stay as they are')
                .(filled($number) ? ", and any front number reads \"{$number}\"" : '')
                .'; '.self::BADGE,
        };
        $angle = match ($view) {
            'back' => 'Show the BACK of the garment, straight-on and centred. The first image is the back view to reproduce; the second is the front of the same garment, a guide to its true colours.',
            'three-quarter' => 'Show the garment turned about 35 degrees in a three-quarter front view, so the front plus one side and sleeve are visible, centred. The first image is the front and the second the back of the same garment: keep the front design from the first image and wrap the side panels naturally, matching both.',
            default => 'Show the FRONT of the garment, straight-on and centred. The image is the front view to reproduce.',
        };

        $colours = array_values(array_filter((array) ($meta['colors'] ?? []), fn ($c) => is_string($c) && preg_match('/^#[0-9a-f]{6}$/i', $c)));
        $palette = $colours
            ? 'The design\'s true colours are '.implode(', ', $colours).' (the main body colour first): use exactly these, correcting any blue or dark tint from the 3D render\'s lighting. '
            : '';

        return "Create a premium studio product photograph (a catalogue mockup) of this {$garment}, from the reference 3D render. "
            .$angle.' '
            .'Style: ghost-mannequin (invisible mannequin) product shot, the garment alone with a natural 3D body shape and an open neck showing the inside back collar; no person, no hanger, no visible mannequin. '
            .'Background: '.(self::BACKGROUNDS[$background] ?? self::BACKGROUNDS['light-grey']).', with a soft natural contact shadow below the garment. '
            .'Lighting: large soft key light from the upper left, gentle fill, subtle rim light, true-to-life colour, sharp focus, like a full-frame camera with an 85 mm lens. '
            .'Fabric realism: fine sublimated polyester knit and mesh texture visible up close, realistic stitching and twin-needle hems, rib-knit collar and cuffs, soft natural folds, gentle drape and creases at the sleeves and waist, a subtle sheen on the print, real seams where the panels meet. '
            .$palette
            .'Keep the design EXACTLY as in the reference: the same colours (no colour shift), panel layout, pattern, stripes, collar style and trims, and every logo, crest, name and number in the same place, size and shape; '
            .$text.'; any crest or badge keeps its exact shape and its letters or numbers as drawn. Do not add, remove, restyle or invent any text, logos, sponsors, tags or graphics. '
            .'Square frame, the garment filling about 80% of the height with even margins. No text overlay, no watermark, no UI, no props.';
    }
}
