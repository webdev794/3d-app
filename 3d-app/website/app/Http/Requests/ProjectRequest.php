<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProjectRequest extends FormRequest
{
    /**
     * The parts of a kit that can have a look of their own (task 9.134): every part the viewer paints on its own (zones.js
     * TOP_PARTS, SHORTS_PARTS; bballprint.js, sockprint.js, skirtprint.js, capprint.js, hatprint.js, beanieprint.js).
     * (QA10 2026-11-11: the socks' parts were missing, so the Rugby League Kit could not be saved.)
     */
    public const PARTS = [
        'front', 'back', 'leftSleeve', 'rightSleeve', 'collar', 'sides', 'hem',
        'shortsFront', 'shortsBack', 'shortsSides', 'shortsHem', 'waistband', 'shortsBand', 'shortsPiping',
        'sockBand', 'sockHoops', 'sockFoot',
        'skirtBand',
        'capBrim', 'capUnder', 'capPiping', 'capSweep', 'capSweepLow',
        'hatTop', 'hatBrim', 'hatUnder', 'hatBinding',
        'beanieCuff', 'beanieStripe', 'beaniePom',
    ];

    /**
     * The colour areas a design can colour on their own (design.zoneColors, each a hex colour): the hoodie, varsity, track
     * jacket, basketball shorts and netball dress areas the Studio lists, and the garment tiles' own details the viewer
     * draws (config/catalog.php looks, lib/sports_catalog.dart: the rugby sweeps and raglan, the socks' toe line and
     * mark, the polo's quarter zip…). (QA10 2026-11-11: most of the tiles' areas were missing.)
     */
    public const ZONE_COLORS = [
        // Hoodies, the varsity jacket, the track jacket (and its pants), the netball dress, the basketball shorts.
        'hood', 'lining', 'rib', 'pocket', 'zip', 'body', 'sleeves', 'ribStripe', 'snaps', 'pocketTrim', 'shoulder', 'side',
        'stripe', 'stripeDeep', 'cord', 'collar', 'cuffs', 'collarStripe', 'pantsStripe', 'sideBlade', 'varsityBoxy',
        'panels', 'yoke', 'binding', 'bballBand', 'bballTrim1', 'bballTrim2',
        // Tops: the rugby sweeps and raglan, the wing collar, the crew neck, the quarter zip, piping and inks.
        'raglan', 'sweep', 'sweepDeep', 'wingCollar', 'wingCollarInside', 'crewNeck', 'quarterZip', 'collarPiping', 'piping',
        'vInsert', 'badge', 'brandInk', 'crestWord', 'crestMark', 'labelDark', 'teeFlare', 'teeLong', 'teeNetball',
        'flow', 'flowLight', 'flowDeep',
        // The ready-made models' flags (viewer tripomesh.js): the Rugby League Jersey on the football jersey's model and its
        // V cut in it (FBJERSEY 2026-11-13), the Basketball singlet's model (BBSINGLET).
        'fbJersey', 'fbV', 'bballSinglet',
        // Shorts, socks and hats.
        'kitBlade', 'cordTips', 'shortsPlain', 'shortsNarrow', 'sockToeLine', 'sockMark', 'sockHoopsWide', 'beanieOne',
        'shards', 'shardsDeep',
    ];

    /** The fixed marks that can be moved, resized, turned or hidden (top_frontNumber: the football jerseys' front number). */
    public const MARKS = ['top_wordmark', 'top_sponsor', 'top_crest', 'top_name', 'top_number', 'top_frontNumber', 'shorts_crest', 'shorts_number', 'shorts_wordmark'];

    /** A text object's own font (viewer texture.js LAYER_FONTS; the marquee's text fonts). */
    public const LAYER_FONTS = ['JerseyBlock', 'Rajdhani'];

    /** The fabric types (Colours › Fabric type; KitViewer.tsx fabricTypes, the apps' designFabrics). */
    public const FABRICS = ['Standard', 'Mesh', 'Pro', 'Eco'];

    /** Garment style › Neck style (resources/js/garmentStyle.ts neckValues, the apps' garment_style.dart): round, V, the rugby collars. */
    public const NECKS = ['round', 'v', 'rc001', 'rc002', 'rc003', 'rc004', 'rc005', 'rc006', 'rc007', 'rc008', 'rc009', 'rc010', 'shallow-v'];

    /**
     * Products outside the garment catalogue that are saved as projects too: the marquee (Signage & Marquees, 2026-11-02),
     * its design in design.marquee (resources/js/marquee.ts).
     */
    public const PRODUCTS = ['marquee'];

    /** The marquee's printable zones (viewer marquee.js ZONES). */
    public const MARQUEE_ZONES = ['roof', 'valanceFront', 'valanceBack', 'valanceLeft', 'valanceRight', 'wallLeft', 'wallRight', 'wallBack'];

    /** A name typed in "Custom…" (sport or garment): plain text, no tags or control characters. */
    public const PLAIN_TEXT = 'not_regex:/[<>\x00-\x1F\x7F]/';

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';
        $patterns = ['Solid', 'Stripes', 'Chevron', 'Velocity', 'Blades', 'Swirl', 'Hoops', 'Dots', 'Diagonal', 'Tribal', 'Camo'];
        $color = 'regex:/^#[0-9a-fA-F]{6}$/';
        // How a word looks (task 9.146): viewer/src/wordart.js; on a fixed mark and on a text object.
        $wordLook = fn (string $at) => [
            "$at" => ['sometimes', 'nullable', 'array:style,width,color,shape,spacing'],
            "$at.style" => ['sometimes', Rule::in(['plain', 'outline', 'shadow', 'extrude', 'contour'])],
            "$at.width" => ['sometimes', 'numeric', 'between:0,0.3'],
            "$at.color" => ['sometimes', $color],
            "$at.shape" => ['sometimes', Rule::in(['straight', 'archUp', 'archDown', 'wave', 'bridge', 'slant'])],
            "$at.spacing" => ['sometimes', 'numeric', 'between:-0.1,0.6'],
        ];

        return [
            'name' => [$required, 'string', 'max:120'],
            'sport' => [$required, Rule::in(array_column(config('catalog.sports'), 'id'))],
            'garment' => [$required, Rule::in([...array_column(config('catalog.garments'), 'id'), ...self::PRODUCTS])],
            'mode' => ['sometimes', Rule::in(['ai', 'dyo'])],
            'status' => ['sometimes', Rule::in(['draft', 'approved'])],
            'design' => [$required, 'array:garment,main,secondary,accent,pattern,logoText,number,backName,patternImage,logoImage,sponsorImage,patternColor,patternColorOwn,patternScale,patternBody,prompt,renderFront,renderBack,app,gradient,gradients,zones,zoneColors,trackStyle,layers,marks,layout,presetId,productName,sportName,parts,fabric,marquee,neck,fit'],
            // The marquee (garment 'marquee'): its size, walls and each zone's colour and artwork layers (viewer marquee.js).
            'design.marquee' => ['sometimes', 'nullable', 'array:size,walls,halfWall,zones'],
            'design.marquee.size' => ['required_with:design.marquee', Rule::in(['3x3', '3x6'])],
            'design.marquee.walls' => ['required_with:design.marquee', Rule::in(['none', 'back', 'full'])],
            'design.marquee.halfWall' => ['sometimes', 'boolean'],
            'design.marquee.zones' => ['required_with:design.marquee', 'array:'.implode(',', self::MARQUEE_ZONES)],
            'design.marquee.zones.*' => ['array:color,layers'],
            'design.marquee.zones.*.color' => ['required', $color],
            'design.marquee.zones.*.layers' => ['present', 'array', 'max:30'],
            'design.marquee.zones.*.layers.*' => ['array:id,type,name,visible,color,accent,scale,x,y,rot,src,w,text,font,size,outline,italic'],
            'design.marquee.zones.*.layers.*.id' => ['required', 'string', 'max:80'],
            'design.marquee.zones.*.layers.*.type' => ['required', Rule::in(['pattern', 'image', 'text'])],
            'design.marquee.zones.*.layers.*.name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'design.marquee.zones.*.layers.*.visible' => ['sometimes', 'boolean'],
            'design.marquee.zones.*.layers.*.color' => ['sometimes', 'nullable', $color],
            'design.marquee.zones.*.layers.*.accent' => ['sometimes', 'nullable', $color],
            'design.marquee.zones.*.layers.*.outline' => ['sometimes', 'nullable', $color],
            'design.marquee.zones.*.layers.*.scale' => ['sometimes', 'numeric', 'between:0.1,5'],
            'design.marquee.zones.*.layers.*.x' => ['sometimes', 'numeric', 'between:-1,2'],
            'design.marquee.zones.*.layers.*.y' => ['sometimes', 'numeric', 'between:-1,2'],
            'design.marquee.zones.*.layers.*.rot' => ['sometimes', 'numeric', 'between:-360,360'],
            'design.marquee.zones.*.layers.*.w' => ['sometimes', 'numeric', 'between:0.005,2'],
            'design.marquee.zones.*.layers.*.size' => ['sometimes', 'numeric', 'between:0.005,2'],
            'design.marquee.zones.*.layers.*.src' => ['sometimes', 'nullable', 'string', 'max:4000000', function (string $attribute, mixed $value, \Closure $fail) {
                // The built-in 3DEEZI logos, or a picture as every other layer's.
                if ($value !== '3deezi:logo' && $value !== '3deezi:wordmark') {
                    ($this->imageSourceRule())($attribute, $value, $fail);
                }
            }],
            'design.marquee.zones.*.layers.*.text' => ['sometimes', 'nullable', 'string', 'max:120', self::PLAIN_TEXT],
            'design.marquee.zones.*.layers.*.font' => ['sometimes', 'nullable', Rule::in(['Rajdhani', 'JerseyBlock'])],
            'design.marquee.zones.*.layers.*.italic' => ['sometimes', 'boolean'],
            // Colours › Fabric type (website and apps; the 3D viewer shows it). Unset or Standard: the garment's own.
            'design.fabric' => ['sometimes', 'nullable', Rule::in(self::FABRICS)],
            'design.garment' => ['sometimes', Rule::in([...array_column(config('catalog.garments'), 'id'), ...self::PRODUCTS])],
            'design.main' => ['required_with:design', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'design.secondary' => ['required_with:design', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'design.accent' => ['required_with:design', 'regex:/^#[0-9a-fA-F]{6}$/'],
            // (Also None, no pattern, and Shards, the basketball shooting shirt's: the garment tiles' starting looks.)
            'design.pattern' => ['required_with:design', Rule::in([...$patterns, 'None', 'Shards'])],
            'design.presetId' => ['sometimes', 'nullable', 'string', 'max:80'],
            // The sport's garment tile the design was made as ("Netball dress", task 9.99); 'garment' stays the 3D garment.
            // (Or a garment typed in "Custom…", client 2026-11-02: plain text only.)
            'design.productName' => ['sometimes', 'nullable', 'string', 'max:60', self::PLAIN_TEXT],
            // A sport typed in "Custom…" (client 2026-11-02): its name; 'sport' stays a catalogue sport.
            'design.sportName' => ['sometimes', 'nullable', 'string', 'max:40', self::PLAIN_TEXT],
            // Gradient fills per colour zone: Primary in design.gradient (its original place), Secondary and Pattern in
            // design.gradients. Each has from, to and angle; stops (2 to 6, e.g. Sunset's three) when it has more colours,
            // and the ready-made preset it came from.
            'design.gradient' => ['sometimes', 'nullable', 'array:from,to,angle,stops,preset'],
            'design.gradient.from' => ['required_with:design.gradient', $color],
            'design.gradient.to' => ['required_with:design.gradient', $color],
            'design.gradient.angle' => ['sometimes', 'numeric', 'between:-360,360'],
            'design.gradient.stops' => ['sometimes', 'nullable', 'array', 'min:2', 'max:6'],
            'design.gradient.stops.*' => ['array:color,at'],
            'design.gradient.stops.*.color' => ['required', $color],
            'design.gradient.stops.*.at' => ['required', 'numeric', 'between:0,1'],
            'design.gradient.preset' => ['sometimes', 'nullable', 'string', 'max:40'],
            'design.gradients' => ['sometimes', 'nullable', 'array:secondary,patternColor'],
            'design.gradients.*' => ['nullable', 'array:from,to,angle,stops,preset'],
            'design.gradients.*.from' => ['required_with:design.gradients.*', $color],
            'design.gradients.*.to' => ['required_with:design.gradients.*', $color],
            'design.gradients.*.angle' => ['sometimes', 'numeric', 'between:-360,360'],
            'design.gradients.*.stops' => ['sometimes', 'nullable', 'array', 'min:2', 'max:6'],
            'design.gradients.*.stops.*' => ['array:color,at'],
            'design.gradients.*.stops.*.color' => ['required', $color],
            'design.gradients.*.stops.*.at' => ['required', 'numeric', 'between:0,1'],
            'design.gradients.*.preset' => ['sometimes', 'nullable', 'string', 'max:40'],
            'design.zones' => ['sometimes', 'array:body,yoke,sleeves,sides,hem,pocket,hood'],
            // An area takes a pattern name or the user's own pattern picture (Patterns › My patterns).
            'design.zones.*' => ['string', 'max:4000000', function (string $attribute, mixed $value, \Closure $fail) use ($patterns) {
                if (in_array($value, [...$patterns, 'None'], true)) {
                    return;
                }
                ($this->imageSourceRule())($attribute, $value, $fail);
            }],
            // One part of the kit with a look of its own (task 9.134): its colour, a fade across it (to null: fading out
            // into what is under it), a pattern on it only (a pattern name or the user's own picture) and that
            // pattern's colour and opacity. A design without parts looks as before.
            'design.parts' => ['sometimes', 'nullable', 'array:'.implode(',', self::PARTS)],
            'design.parts.*' => ['nullable', 'array:colour,fade,pattern,patternColour,patternOpacity'],
            'design.parts.*.colour' => ['sometimes', 'nullable', $color],
            'design.parts.*.fade' => ['sometimes', 'nullable', 'array:from,to,angle'],
            'design.parts.*.fade.from' => ['required_with:design.parts.*.fade', $color],
            'design.parts.*.fade.to' => ['sometimes', 'nullable', $color],
            'design.parts.*.fade.angle' => ['sometimes', 'numeric', 'between:-360,360'],
            'design.parts.*.pattern' => ['sometimes', 'nullable', 'string', 'max:4000000', function (string $attribute, mixed $value, \Closure $fail) use ($patterns) {
                if ($value === null || in_array($value, [...$patterns, 'None'], true)) {
                    return;
                }
                ($this->imageSourceRule())($attribute, $value, $fail);
            }],
            'design.parts.*.patternColour' => ['sometimes', 'nullable', $color],
            'design.parts.*.patternOpacity' => ['sometimes', 'nullable', 'numeric', 'between:0,1'],
            // Each colour area's own colour (hoodies: the hood, its lining, the rib cuffs and waistband, the pocket, the zip;
            // the garment tiles' details: ZONE_COLORS).
            'design.zoneColors' => ['sometimes', 'nullable', 'array:'.implode(',', self::ZONE_COLORS)],
            'design.zoneColors.*' => ['nullable', $color],
            // The track jacket's style: its stand-up collar or a hood.
            'design.trackStyle' => ['sometimes', 'nullable', Rule::in(['collar', 'hood'])],
            // Garment style (the Studio's Style tool, NK1 2026-11-02): the neck's shape, or a rugby jersey's collar from the
            // rugby collar library; a rugby jersey's fit. Unset: the garment's own.
            'design.neck' => ['sometimes', 'nullable', Rule::in(self::NECKS)],
            'design.fit' => ['sometimes', 'nullable', Rule::in(['classic', 'pro', 'tight'])],
            // The fixed marks moved, resized, turned or hidden on the 2D panels.
            'design.marks' => ['sometimes', 'array:'.implode(',', self::MARKS)],
            'design.marks.*' => ['array:side,x,y,scale,rot,hidden,shape,color,look'],
            // How a word looks (task 9.146): viewer/src/wordart.js.
            ...$wordLook('design.marks.*.look'),
            // Chosen on the 3D kit (task 9.144): the crest's badge shape and a word's own colour.
            'design.marks.*.shape' => ['sometimes', Rule::in(['shield', 'circle', 'square', 'rounded', 'diamond'])],
            'design.marks.*.color' => ['sometimes', $color],
            'design.marks.*.side' => ['sometimes', Rule::in(['front', 'back'])],
            'design.marks.*.x' => ['sometimes', 'numeric', 'between:-1,1'],
            'design.marks.*.y' => ['sometimes', 'numeric', 'between:-0.5,1.5'],
            'design.marks.*.scale' => ['sometimes', 'numeric', 'between:0.1,6'],
            'design.marks.*.rot' => ['sometimes', 'numeric', 'between:-360,360'],
            'design.marks.*.hidden' => ['sometimes', 'boolean'],
            // A factory print layout on the kit: the file (one of the user's assets), the part each panel found in it
            // is (in the order they are found), whether the plain strip under the body panels is the hem fold, and
            // whether the white lines across the sleeves are joined up (left out, as in the mock-ups).
            // kind 'drawing': a design picture (the finished garment's front and back drawn flat) put on the garment in
            // parts (a singlet), exactly as drawn.
            'design.layout' => ['sometimes', 'nullable', 'array:asset,name,roles,hemFold,joinLines,parts,kind'],
            'design.layout.kind' => ['sometimes', 'nullable', Rule::in(['drawing'])],
            'design.layout.asset' => ['required_with:design.layout', 'integer', Rule::exists('assets', 'id')->where('user_id', $this->user()?->id)],
            'design.layout.name' => ['required_with:design.layout', 'string', 'max:160'],
            'design.layout.roles' => ['required_with:design.layout', 'array', 'max:60'],
            'design.layout.roles.*' => [Rule::in(['front', 'back', 'sleeveL', 'sleeveR', 'neck', 'legL', 'legR', 'none'])],
            'design.layout.hemFold' => ['sometimes', 'boolean'],
            'design.layout.joinLines' => ['sometimes', 'boolean'],
            'design.layout.parts' => ['sometimes', 'array', 'max:2'],
            // (The netball dress takes a design picture as the singlet does: task 9.126.)
            'design.layout.parts.*' => [Rule::in(['raglan', 'shorts', 'singlet', 'netball-dress', 'jersey', 'tee', 'polo'])],
            'design.layers' => ['sometimes', 'array', 'max:40'],
            'design.layers.*' => ['array:id,name,type,part,side,x,y,w,h,rot,opacity,src,text,size,color,shape,artboard,clip,font,look,narrow'],
            // A text object's own font, word look and squeeze (the garment tiles' numbers: the Rugby League Kit's shorts
            // "3", the football jerseys' "3"s; viewer texture.js).
            'design.layers.*.font' => ['sometimes', 'nullable', Rule::in(self::LAYER_FONTS)],
            ...$wordLook('design.layers.*.look'),
            'design.layers.*.narrow' => ['sometimes', 'nullable', 'numeric', 'between:0.1,1'],
            // An object on one part of the kit only (task 9.134): cut to that part's edges.
            'design.layers.*.clip' => ['sometimes', 'nullable', Rule::in(self::PARTS)],
            // Artwork sent from the Artboard: the id of the design it came from (Edit in Artboard opens it again).
            'design.layers.*.artboard' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'design.layers.*.id' => ['required', 'string', 'max:80', 'distinct:strict'],
            'design.layers.*.name' => ['sometimes', 'string', 'max:120'],
            'design.layers.*.type' => ['required', Rule::in(['image', 'text', 'shape'])],
            'design.layers.*.part' => ['sometimes', Rule::in(['top', 'shorts'])],
            'design.layers.*.side' => ['required', Rule::in(['front', 'back'])],
            'design.layers.*.x' => ['required', 'numeric', 'between:-1,1'],
            'design.layers.*.y' => ['required', 'numeric', 'between:-0.5,1.5'],
            'design.layers.*.w' => ['sometimes', 'numeric', 'between:0.005,1'],
            'design.layers.*.h' => ['sometimes', 'numeric', 'between:0.005,1'],
            'design.layers.*.rot' => ['sometimes', 'numeric', 'between:-360,360'],
            'design.layers.*.opacity' => ['sometimes', 'numeric', 'between:0,1'],
            'design.layers.*.src' => ['required_if:design.layers.*.type,image', 'nullable', 'string', 'max:4000000', $this->imageSourceRule()],
            'design.layers.*.text' => ['required_if:design.layers.*.type,text', 'nullable', 'string', 'max:120'],
            'design.layers.*.size' => ['sometimes', 'numeric', 'between:0.005,0.4'],
            'design.layers.*.color' => ['sometimes', $color],
            'design.layers.*.shape' => ['required_if:design.layers.*.type,shape', Rule::in(['rectangle', 'ellipse', 'triangle'])],
            'design.logoText' => ['sometimes', 'nullable', 'string', 'max:40'],
            'design.number' => ['sometimes', 'nullable', 'string', 'max:3'],
            'design.backName' => ['sometimes', 'nullable', 'string', 'max:40'],
            'design.patternColor' => ['sometimes', 'nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            // The user chose the Pattern colour: the built-in and area patterns are painted in it (viewer texture.js).
            'design.patternColorOwn' => ['sometimes', 'nullable', 'boolean'],
            'design.patternScale' => ['sometimes', 'numeric', 'min:0.1', 'max:10'],
            'design.patternBody' => ['sometimes', 'numeric', 'min:0', 'max:1'],
            'design.logoImage' => ['sometimes', 'nullable', 'string', 'max:4000000', $this->imageSourceRule()],
            'design.sponsorImage' => ['sometimes', 'nullable', 'string', 'max:4000000', $this->imageSourceRule()],
            'design.patternImage' => ['sometimes', 'nullable', 'string', 'max:4000000', $this->imageSourceRule()],
            // The apps also keep their AI renders and app-only details (fabric, AI spec).
            'design.renderFront' => ['sometimes', 'nullable', 'string', 'max:4000000', $this->imageSourceRule()],
            'design.renderBack' => ['sometimes', 'nullable', 'string', 'max:4000000', $this->imageSourceRule()],
            'design.app' => ['sometimes', 'nullable', 'array'],
            'thumbnail' => ['sometimes', 'nullable', 'string', 'max:4000000', $this->imageSourceRule()],
            'design.prompt' => ['sometimes', 'nullable', 'string', 'max:4000'],
            'expected_version' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    public function messages(): array
    {
        return [
            'design.layout.asset.exists' => 'The print layout file is no longer in your saved assets: remove the print layout (Artwork, Factory print layout) or upload it again.',
        ];
    }

    /**
     * An emptied player number stays empty: Laravel turns '' into null, and the 3D kit draws its sample 23 for a
     * missing number, so a kit without a number (netball designs, client 2026-10-26) showed 23 again once saved.
     */
    protected function prepareForValidation(): void
    {
        $design = $this->input('design');
        if (is_array($design) && array_key_exists('number', $design) && $design['number'] === null) {
            $design['number'] = '';
            $this->merge(['design' => $design]);
        }
    }

    private function imageSourceRule(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) {
            if ($value === null || $value === '') {
                return;
            }

            $isRasterData = preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$#D', $value);
            $isLocal = str_starts_with($value, '/') && ! str_starts_with($value, '//') && ! str_contains($value, '\\');
            $origin = $this->getSchemeAndHttpHost();
            $isSameOrigin = str_starts_with($value, $origin.'/');

            if (! $isRasterData && ! $isLocal && ! $isSameOrigin) {
                $fail('The image must be a local image URL or a PNG, JPEG, or WebP data URL.');
            }
        };
    }
}
