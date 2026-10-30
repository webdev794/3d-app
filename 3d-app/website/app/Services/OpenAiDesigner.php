<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Server-side OpenAI integration for the design flow. The API key never
 * leaves the server. Prompts and schemas mirror the mobile app's
 * (lib/ai_service.dart), which are proven against the live API.
 */
class OpenAiDesigner
{
    private const BASE = 'https://api.openai.com/v1';

    /** The known-good models: a call that a newly set model or its parameters turn down is retried once with these. */
    public const SAFE_IMAGE_MODEL = 'gpt-image-2';

    public const SAFE_TEXT_MODEL = 'gpt-6-luna';

    public const PATTERNS = ['Velocity', 'Chevron', 'Stripes', 'Solid'];

    public const SCENES = [
        'Stadium tunnel' => 'floating on an invisible ghost mannequin above a glossy reflective floor in a cinematic futuristic stadium tunnel at night: deep navy-black, glowing cyan and blue light strips receding into the distance, volumetric haze, soft bokeh, strong depth of field',
        'Studio podium' => 'on an invisible ghost mannequin above a low brushed-black pedestal with a thin glowing rim, in a dark premium photo studio with a large softbox key light, cyan rim light and a soft contact shadow',
        'On athlete' => "worn by an athletic player standing confidently in a floodlit stadium at night, shot from chest height, the player's face in shadow or turned away, crowd and lights blurred behind",
        'Locker room' => 'hanging on a wooden hanger in a modern dark locker room with wood and steel lockers, warm spotlights and cyan accent lighting, shallow depth of field',
    ];

    private const SYSTEM = 'You are the lead designer at 3DEEZI, a custom sportswear studio. Turn client briefs into original, manufacturable kit designs. Never copy real club, league or brand logos. When a brief mentions a cultural style, create an original design inspired by it rather than reproducing sacred motifs.';

    /** Concepts are designed freely; the 3D kit's pattern list is only the nearest editable match. */
    public const FREE_DESIGN = 'Design each concept freely, like a premium sublimated teamwear brand: renderPrompt describes the whole design '
        .'(graphics such as lightning, speed lines, sharp angular shards, halftone dot fades, gradients and textures where they suit the theme; '
        .'the club\'s crest on the chest; the lettering on the back; trims), never a plain template with flat colour blocks. '
        .'pattern is only the nearest built-in pattern for the editable 3D kit, and patternMotif is the custom print that carries the concept\'s graphics onto the 3D kit.';

    /**
     * The client's attached logo is theirs: every model keeps it exactly as supplied (QA 2026-10-21: a planning model
     * wrote "do not reproduce the recognisable character" and invented a new mascot).
     */
    public const OWN_LOGO = 'The attached logos belong to the client, who owns the right to use them: keep the client\'s logo, mascot and lettering exactly as supplied in every design, '
        .'never redraw, replace, simplify or "make original" the client\'s own logo or mascot.';

    /** Kit colours like a top teamwear brand: from the logo's brand colours, dark and bold when the brief is, readable lettering. */
    public const COLOUR_RULES = 'Colours: take the kit colours only from the dominant brand colours of the client\'s logo or the brief, never from skin tones or tiny logo details. '
        .'For a cool, bold or aggressive brief with a logo, prefer a dark body (black or deep navy) with the logo\'s main colour as the graphics and white highlights. '
        .'The lettering on the back is white with an outline in the accent colour, so it stands out from the graphics.';

    /**
     * Every sport (client 2026-10-26, images/175.jpg: a huge 3DEEZI logo had filled the chest): the club's symbol on the
     * chest at a normal crest size, and 3DEEZI only as a small word mark at the top of the back.
     */
    public const BRAND_RULES = 'Logos: the club\'s symbol goes on the chest at a normal crest size (about a hand\'s width, on the left chest or centred high on the chest), unless the brief or the client\'s own design places it differently: '
        .'the client\'s own logo when one is attached, otherwise a simple original crest (a shield or roundel in the kit colours, with the team\'s initials when there is a team name). '
        .'Never put a large 3DEEZI logo, the 3DEEZI emblem or the words "AI SPORTSWEAR DESIGNER" on the chest or anywhere on the front. '
        .'3DEEZI appears only as a small 3DEEZI word mark at the top of the back, just under the collar, and nowhere else on the garment.';

    /**
     * The three alternatives look clearly different (client 2026-10-21: the BLITZ options were all dark blue with
     * similar layouts), each keeping the client's logo exactly. The dark body preference is for the brief's design only.
     */
    public const VARIETY_RULES = 'The 3 alternatives must look clearly different from the brief\'s design and from each other, while every one keeps the client\'s logo exactly as supplied: '
        .'alternative A has a different main body colour: the logo\'s secondary colour, or white or a light colour; '
        .'alternative B has a different layout: bold panels, a diagonal sash, hoops or stripes instead of all-over graphics; '
        .'alternative C is clearly bolder or clearly more minimal than the others. '
        .'No two designs share the same body colour and layout. The dark body preference in the colour rules applies to the brief\'s design only, not to the alternatives.';

    /** Colours for a direction that sets its own body colour (an alternative): no dark body preference. */
    public const DIRECTION_COLOUR_RULES = 'Colours: from the client\'s logo or the brief, never from skin tones or tiny logo details, with the body colour the creative direction sets. '
        .'The lettering on the back contrasts clearly with the body, with an outline in the accent colour.';

    /** Layouts an alternative can take; anything but all-over graphics replaces the "no flat panels" rule. */
    public const LAYOUTS = ['all-over graphics', 'bold panels', 'diagonal sash', 'hoops', 'stripes', 'minimal'];

    /** The art director's brief for the HD mockup (strict JSON). */
    private const DIRECTION_FIELDS = [
        'summary' => 'One friendly sentence to the client saying what you will create, e.g. "I\'ll create a BLITZ training singlet in electric blue, black and white, with your logo on the chest and lightning details flowing around the sides."',
        'ownDesign' => 'true only if an attached image is the client\'s own complete garment design (front and/or back fully designed) that must be kept exactly.',
        'teamName' => 'The team, club or brand name from the brief or the logo\'s wordmark, exactly as written; empty if none.',
        'palette' => 'The 3-4 kit colours with names and hex: the dominant brand colours of the client\'s logo or the brief (ignore skin tones and small details), high contrast, e.g. "electric blue #1E5BFF, black #0A0C12, white #FFFFFF".',
        'theme' => 'The theme and motifs drawn from the logo and brief, e.g. "speed and lightning: the mascot sprinting, jagged lightning edges".',
        'front' => 'The front design: base colour (dark black or navy for a cool or bold brief with a logo), the club\'s symbol on the chest at a normal crest size (the client\'s logo, or a simple crest when there is none; never a 3DEEZI logo), and the sublimated graphics around it.',
        'back' => 'The back design: the small 3DEEZI word mark just under the collar, then the team name in bold white athletic lettering over a large white player number (e.g. 01) with an outline in the accent colour, when it suits the garment, plus graphics.',
        'graphics' => 'The all-over sublimated graphics: shapes, flow across the sides, textures (halftone, gradients, grunge) and colours.',
        'trims' => 'Collar, armhole or cuff binding, side panels and hem, in the palette.',
        'presentation' => 'The photo setting: dramatic and dark (night stadium, floodlights, haze in the kit\'s main colour, reflective floor) unless the brief asks for something else.',
    ];

    /** The small 3DEEZI word mark the designs wear under the back collar (the only 3DEEZI branding, client 2026-10-26). */
    public const WORD_MARK = 'media/images/brand-wordmark.png';

    /**
     * The sport's marking rules from the catalogue (config/catalog.php 'names', 'numbers' and 'positions'; client
     * 2026-10-26, images/175.jpg): netball has no player names or numbers and shows the playing position letters
     * instead. `$sport` is the catalogue id or name, with or without its style hint ("Golf (golf: ...)").
     *
     * @return array{names: bool, numbers: bool, positions: array<int, string>}
     */
    public static function sportMarkings(string $sport): array
    {
        $key = mb_strtolower(trim($sport));
        $entry = collect(config('catalog.sports', []))->first(fn (array $s) => $key === mb_strtolower($s['id'])
            || $key === mb_strtolower($s['name']) || str_starts_with($key, mb_strtolower($s['name']).' ('));

        return [
            'names' => (bool) ($entry['names'] ?? true),
            'numbers' => (bool) ($entry['numbers'] ?? true),
            'positions' => array_values((array) ($entry['positions'] ?? [])),
        ];
    }

    /** What the sport's kits carry on the back (and, with playing positions, on the front), for every planning and image prompt. */
    public static function markingRules(string $sport): string
    {
        ['names' => $names, 'numbers' => $numbers, 'positions' => $positions] = self::sportMarkings($sport);
        if ($names && $numbers) {
            return 'Below the word mark, the back carries the team name in bold athletic lettering over a large player number (for example 01) when it suits the garment.';
        }
        $rule = match (true) {
            ! $names && ! $numbers => 'This sport has no player names and no numbers: never put a player name or any number anywhere on the garment (front, back, sides or hem). ',
            ! $names => 'This sport has no player names: never put a player name anywhere on the garment; below the word mark the back carries a large player number (for example 01). ',
            default => 'This sport has no numbers: never put a number anywhere on the garment; below the word mark the back carries the team name in bold athletic lettering. ',
        };
        if ($positions) {
            $rule .= 'Instead, match wear shows the playing position letters, as on real bibs ('.implode(', ', $positions).'): '
                .'one position only (for example '.$positions[0].'), in large bold athletic lettering centred on the front below the club\'s crest, '
                .'and again large on the back below the word mark (on the bib when the garment has one). '
                .'The back shows only the small word mark and the position letters: no team name, player name or number. '
                .'Training and warm-up wear (tees, hoodies, jackets) shows no position letters.';
        }

        return trim($rule);
    }

    /** The lettering the planner varies and scores: "the team name and number", or "the position letters" (netball). */
    public static function lettering(string $sport): string
    {
        $m = self::sportMarkings($sport);

        return $m['positions'] ? 'the position letters' : match (true) {
            $m['names'] && $m['numbers'] => 'the team name and number',
            $m['names'] => 'the team name',
            $m['numbers'] => 'the number',
            default => 'the lettering',
        };
    }

    /** The art direction's fields for the sport: its own back (and front) lettering. */
    public static function directionFields(string $sport): array
    {
        ['names' => $names, 'numbers' => $numbers, 'positions' => $positions] = self::sportMarkings($sport);
        $fields = self::DIRECTION_FIELDS;
        $outline = 'in bold white athletic lettering with an outline in the accent colour';
        if ($positions) {
            $fields['front'] = 'The front design: base colour (dark black or navy for a cool or bold brief with a logo), the club\'s symbol on the chest at a normal crest size (the client\'s logo, or a simple crest when there is none; never a 3DEEZI logo), '
                ."one playing position's letters (e.g. {$positions[0]}) large {$outline} centred below it, and the sublimated graphics around them.";
            $fields['back'] = "The back design: the small 3DEEZI word mark just under the collar, then the same position letters large {$outline}; no team name, no player name and no number anywhere; plus graphics.";
        } elseif (! $names || ! $numbers) {
            $fields['back'] = 'The back design: the small 3DEEZI word mark just under the collar, then '
                .($names ? "the team name {$outline}; no numbers anywhere" : ($numbers ? "a large player number (e.g. 01) {$outline}; no player names anywhere" : 'no player names and no numbers anywhere'))
                .'; plus graphics.';
        }

        return $fields;
    }

    /** The editable 3D kit's back name and number for the sport: none where the sport has none (netball: also no order defaults). */
    public static function kitBack(string $sport, string $logoText): array
    {
        $m = self::sportMarkings($sport);

        return ['number' => $m['numbers'] ? '23' : '', 'backName' => $m['names'] ? $logoText : ''];
    }

    /** The model that plans designs (art direction, the four designs, concepts); the ASSIST chat stays on the text model. */
    public static function planningModel(): string
    {
        return (string) (config('services.openai.planning_model') ?: config('services.openai.text_model'));
    }

    /** The model for HD renders ("HD primary", "Make HD") and the image editor; the image model when not set. */
    public static function hdImageModel(): string
    {
        return (string) (config('services.openai.hd_image_model') ?: config('services.openai.image_model'));
    }

    public static function enabled(): bool
    {
        return filled(config('services.openai.key'));
    }

    /** Provider description shown by the catalog and the concept screens. */
    public static function provider(): array
    {
        return [
            'id' => 'openai',
            'name' => 'AI concepts by OpenAI',
            'available' => true,
            'is_ai' => true,
            'description' => 'Concepts, previews, patterns and showcase images are generated with OpenAI on the server.',
        ];
    }

    /**
     * Four concept designs for the brief, each with a quick preview render.
     *
     * @param  array<int, string>  $references  data URLs of reference images
     * @return array<int, array<string, mixed>>
     */
    public function concepts(string $prompt, string $sport, string $garment, array $references = []): array
    {
        $text = "Sport: {$sport}\nGarment: {$garment}\nClient brief: {$prompt}\n"
            .'Create exactly 4 clearly different concept directions, each designed the way a top custom sublimation sportswear brand would: '
            .'1) bold and aggressive, with dynamic all-over sublimated graphics drawn from the theme of the client\'s logo or brief, '
            .'2) classic and clean, 3) heritage or pattern-led, 4) modern minimal. Keep the team name consistent across all four. '
            .self::FREE_DESIGN.' '.self::COLOUR_RULES.' '.self::BRAND_RULES.' '.self::markingRules($sport);
        if ($references) {
            $text .= "\nReference images are attached. Take the palette, motifs and mood from them (a logo's colours, mascot and lettering style set the theme), and make the client's main logo the crest on the chest. If one shows the client's own finished garment design, make concept 1 follow it closely (its colours, pattern and lettering).";
        }
        $content = [['type' => 'input_text', 'text' => $text]];
        foreach (array_slice($references, 0, 3) as $reference) {
            $content[] = ['type' => 'input_image', 'image_url' => $reference];
        }

        $json = $this->post('/responses', [
            'model' => self::planningModel(),
            'input' => [
                ['role' => 'system', 'content' => self::SYSTEM],
                ['role' => 'user', 'content' => $content],
            ],
            'text' => ['format' => [
                'type' => 'json_schema',
                'name' => 'kit_concepts',
                'strict' => true,
                'schema' => [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'required' => ['concepts'],
                    'properties' => ['concepts' => ['type' => 'array', 'items' => $this->conceptSchema()]],
                ],
            ]],
        ]);
        $specs = array_slice(json_decode($this->outputText($json), true)['concepts'] ?? [], 0, 4);
        if (! $specs) {
            throw new RuntimeException('The AI returned no concepts. Please try again.');
        }

        // Quick low-quality previews, generated in parallel (about 15 s). The
        // client's logos go in first as real image inputs (the chest crest),
        // then the 3DEEZI word mark (only ever small under the back collar).
        $logo = file_get_contents(public_path(self::WORD_MARK));
        $clientImages = array_map(fn (string $r) => $this->decodeDataUrl($r), array_slice($references, 0, 3));
        $responses = Http::pool(fn (Pool $pool) => array_map(
            function (array $spec) use ($pool, $logo, $clientImages, $sport, $garment) {
                $request = $this->imageRequest($pool);
                foreach ($clientImages as $i => [$mime, $bytes]) {
                    $request = $request->attach('image[]', $bytes, "reference-{$i}.".explode('/', $mime)[1], ['Content-Type' => $mime]);
                }

                return $request->attach('image[]', $logo, '3deezi-word-mark.png', ['Content-Type' => 'image/png'])
                    ->post(self::BASE.'/images/edits', [
                        'model' => config('services.openai.image_model'),
                        'prompt' => self::conceptPreviewPrompt($sport, $garment, $spec['renderPrompt'], $spec['logoText'], count($clientImages)),
                        'size' => '1024x1024',
                        'quality' => 'low',
                        'output_format' => 'jpeg',
                        'output_compression' => '82',
                    ]);
            },
            $specs,
        ));

        return array_map(function (array $spec, int $index) use ($responses, $prompt, $garment, $sport) {
            $preview = $responses[$index] instanceof Response && $responses[$index]->successful()
                ? 'data:image/jpeg;base64,'.$responses[$index]->json('data.0.b64_json')
                : null;
            $main = $this->hex($spec['mainColor']);
            $secondary = $this->hex($spec['secondaryColor']);
            $logoText = mb_strtoupper(mb_substr($spec['logoText'], 0, 20));

            return [
                'id' => substr(hash('sha256', json_encode($spec).$index), 0, 16),
                'name' => $spec['designName'],
                'description' => $spec['summary'],
                'motif' => $spec['patternMotif'],
                'preview' => $preview,
                'design' => [
                    'garment' => $garment,
                    'main' => $main,
                    'secondary' => $secondary,
                    'accent' => $this->hex($spec['accentColor']),
                    'pattern' => in_array($spec['pattern'], self::PATTERNS, true) ? $spec['pattern'] : 'Chevron',
                    'logoText' => $logoText,
                    ...self::kitBack($sport, $logoText),
                    'patternColor' => $this->mix($main, $secondary, 0.55),
                    'patternBody' => 0.08,
                    'prompt' => $prompt,
                ],
            ];
        }, $specs, array_keys($specs));
    }

    /** Seamless black-on-white pattern tile; the 3D viewer recolours it. */
    public function pattern(string $motif): string
    {
        $json = $this->post('/images/generations', [
            'model' => config('services.openai.image_model'),
            'prompt' => "Seamless tileable textile print pattern swatch filling the whole square edge to edge, for a sublimated sports jersey. Motif: {$motif}. Original design. Pure black (#000000) shapes on a pure white (#FFFFFF) background, flat 2D vector style, no grey, no shading, no gradients, no fabric texture, no garment, no text, no logos, no border. Left/right and top/bottom edges must tile perfectly.",
            'size' => '1024x1024',
            'quality' => 'medium',
            'output_format' => 'png',
            'n' => 1,
        ]);

        return 'data:image/png;base64,'.$this->firstImage($json);
    }

    /**
     * Photoreal marketing image from a capture of the live 3D kit, keeping
     * the design itself unchanged. Returns raw JPEG bytes.
     */
    public function showcase(string $capture, string $scene, array $meta): string
    {
        [$mime, $bytes] = $this->decodeDataUrl($capture);
        $back = (bool) ($meta['back'] ?? false);
        $logo = $meta['logoText'] ?? '';
        $number = $meta['number'] ?? '';
        $prompt = "Transform this 3D render of a {$meta['sport']} {$meta['garment']} into a premium photorealistic commercial sportswear photograph, "
            .(self::SCENES[$scene] ?? reset(self::SCENES)).'. '
            .'Keep the garment design EXACTLY as in the image: the same colours, panel layout, pattern, collar and trims, and the same '
            // A kit without a number (netball) gets none added.
            .($back ? (filled($number) ? "back name and number (the name reads exactly \"{$logo}\" and the number reads \"{$number}\")" : "back lettering (it reads exactly \"{$logo}\", with no number)") : "chest wordmark and crest (the wordmark reads exactly \"{$logo}\")")
            .'. Do not add, remove or change any text, logos or graphics. Make the fabric photoreal: fine knit and mesh texture, natural folds and drape, flatlock stitching, slight sheen on the print. Professional lighting with realistic shadows, ultra-detailed, no watermark, no UI.';

        $response = $this->withSafeModel((string) config('services.openai.image_model'), self::SAFE_IMAGE_MODEL, fn (string $model) => $this->send(fn () => $this->client()
            ->attach('image[]', $bytes, 'capture.'.($mime === 'image/png' ? 'png' : 'jpg'), ['Content-Type' => $mime])
            ->post(self::BASE.'/images/edits', [
                'model' => $model,
                'prompt' => $prompt,
                'size' => '1536x1024',
                'quality' => 'medium',
                'output_format' => 'jpeg',
                'output_compression' => '88',
            ])));

        return base64_decode($this->firstImage($response->json()), true) ?: throw new RuntimeException('The AI returned an unreadable image.');
    }

    /**
     * The Studio's "Mockup" (App\Services\ProductMockup builds the prompt): the 3D captures in, one
     * studio product photo out, with high input fidelity so the design stays as made. Raw JPEG bytes.
     *
     * @param  array<int, string>  $captures  data URLs, the view to photograph first
     */
    public function productMockup(array $captures, string $prompt): string
    {
        return $this->highFidelityEdit($prompt, array_map(fn (string $c) => $this->decodeDataUrl($c), $captures), [
            'size' => '1024x1024', 'quality' => 'medium', 'output_format' => 'jpeg', 'output_compression' => '90',
        ]);
    }

    /**
     * One brief in, one finished HD presentation mockup out, the way people
     * use ChatGPT: front and back views with close-up detail panels. Logos the
     * user attaches are placed as the brief says (the club's symbol on the
     * chest); otherwise a simple crest. 3DEEZI is only a small word mark under
     * the back collar. Returns raw JPEG bytes.
     *
     * @param  array<int, string>  $references  data URLs (logos, sketches, photos)
     */
    public function mockup(string $brief, string $sport, string $garment, array $references = []): string
    {
        return $this->renderMockup($this->mockupPlan($brief, $sport, $garment, $references)['prompt'], $references);
    }

    /**
     * The art direction (a short creative brief from the chat model, which
     * sees the client's logos) and the image prompt built from it, the way
     * ChatGPT plans before it draws. Without a direction (the chat model
     * failed or timed out) the prompt still carries the full design rules.
     *
     * @param  array<int, string>  $references  data URLs (logos, sketches, photos)
     * @return array{direction: ?array<string, mixed>, prompt: string}
     */
    public function mockupPlan(string $brief, string $sport, string $garment, array $references = []): array
    {
        $references = array_slice($references, 0, 4);
        $direction = $this->artDirection($brief, $sport, $garment, $references);

        return ['direction' => $direction, 'prompt' => self::mockupPrompt($brief, $sport, $garment, count($references), $direction)];
    }

    /** @return ?array<string, mixed> */
    public function artDirection(string $brief, string $sport, string $garment, array $references = []): ?array
    {
        $count = count($references);
        $text = "Sport: {$sport}\nGarment: {$garment}\nClient brief: {$brief}\n"
            .($count ? "{$count} image(s) from the client are attached: logos, references or their own finished design.\n" : "No images are attached.\n")
            .'You are the art director of a top custom sublimation sportswear brand. Before the designer renders one hero mockup, write its creative direction. '
            .'Take the palette and theme from the client\'s logo (its colours, mascot, lettering style and motifs such as lightning, flames, claws or waves) or from the brief. '
            .'Design bold, fully sublimated graphics derived from that theme, flowing across the front, sides and back, never a plain template with flat colour blocks. '
            .self::BRAND_RULES.' '.self::markingRules($sport).' '
            .'Follow everything the brief specifies (colours, layout, background, text). If an attached image is the client\'s own complete garment design, set ownDesign to true and describe that design exactly instead of inventing one. '
            .self::COLOUR_RULES.' '
            .'Never use real club, league or brand logos other than the client\'s own. '.self::OWN_LOGO;
        $content = [['type' => 'input_text', 'text' => $text]];
        foreach ($references as $reference) {
            $content[] = ['type' => 'input_image', 'image_url' => $reference];
        }
        $properties = [];
        foreach (self::directionFields($sport) as $field => $description) {
            $properties[$field] = ['type' => $field === 'ownDesign' ? 'boolean' : 'string', 'description' => $description];
        }
        try {
            $json = $this->post('/responses', [
                'model' => self::planningModel(),
                'input' => [['role' => 'system', 'content' => self::SYSTEM], ['role' => 'user', 'content' => $content]],
                'text' => ['format' => ['type' => 'json_schema', 'name' => 'art_direction', 'strict' => true, 'schema' => [
                    'type' => 'object', 'additionalProperties' => false,
                    'required' => array_keys(self::DIRECTION_FIELDS), 'properties' => $properties,
                ]]],
            ], 90);
            $direction = json_decode($this->outputText($json), true);
        } catch (RuntimeException) {
            return null; // The mockup still renders from the brief and the design rules.
        }

        return is_array($direction) && filled($direction['front'] ?? null) ? $direction : null;
    }

    /**
     * The HD mockup prompt: a bold sublimated design from the logo's theme,
     * the club's symbol on the chest at crest size, the sport's own back
     * lettering (netball: position letters, no names or numbers), the small
     * 3DEEZI word mark under the back collar, front and back side by side in
     * a dramatic dark setting (unless the brief asks otherwise); a client's
     * own complete design is kept exactly.
     *
     * @param  ?array<string, mixed>  $direction  from artDirection()
     */
    public static function mockupPrompt(string $brief, string $sport, string $garment, int $count, ?array $direction = null, string $view = 'presentation', bool $portrait = true): string
    {
        // A full kit (a top with shorts) stands as worn: each top with its shorts below it (client picture 146.jpg).
        $fullKit = str_contains(mb_strtolower($garment), 'kit');
        $labels = ['body' => 'Body colour', 'layout' => 'Layout', 'theme' => 'Theme', 'palette' => 'Palette', 'front' => 'Front', 'back' => 'Back', 'graphics' => 'Graphics', 'trims' => 'Trims', 'presentation' => 'Presentation'];
        $layout = strtolower(trim((string) ($direction['layout'] ?? '')));
        $prompt = "You are the lead designer of a top custom sublimation sportswear brand, making a client presentation mockup.\n"
            ."Sport: {$sport}. Garment: {$garment}.\nClient brief: {$brief}\n\n";
        if (array_filter(array_intersect_key($direction ?? [], $labels), 'filled')) { // the brief as written adds nothing
            $prompt .= "Creative direction (follow it; the brief wins if they differ):\n";
            foreach ($labels as $key => $label) {
                if (filled($direction[$key] ?? null)) {
                    $prompt .= "- {$label}: ".trim((string) $direction[$key])."\n";
                }
            }
            $prompt .= "\n";
        }
        $prompt .= 'Design: unless the client attached their own complete garment design, design the garment freely like a premium sublimated teamwear brand: '
            .'a bold, fully sublimated all-over design with dynamic graphics drawn from the theme and colours of the client\'s logo or brief '
            .'(for example lightning, speed lines, sharp angular shards, halftone dot fades, gradients and textures) flowing across the front, sides and back. '
            .($layout !== '' && $layout !== 'all-over graphics'
                ? 'Follow the layout in the creative direction ('.$layout.'), finished with sublimated textures and fine detail, never a cheap flat template. '
                : 'Never a plain template with flat colour blocks or simple side panels. ')
            .self::BRAND_RULES.' '
            .(filled($direction['body'] ?? null) ? self::DIRECTION_COLOUR_RULES : self::COLOUR_RULES).' '
            .self::markingRules($sport).' Matching trims on the collar, armholes or cuffs and hem.'."\n"
            .($view === 'front'
                // The option cards (client picture 138.jpg): one garment that reads well small.
                ? 'Presentation: one square image of premium commercial product photography: a single garment, the front view only (straight on or a slight three-quarter turn), '
                    .'centred, complete and fully visible with a little space around it, on an invisible ghost mannequin, no back view, '
                : ($portrait
                    // YOUR DESIGNS (client picture 146.jpg, 2026-10-22): one tall picture that fills a phone screen.
                    ? 'Presentation: unless the brief asks for a different layout, angle or background, make one tall portrait image (2:3) of premium commercial product photography that fills a phone screen: '
                        .($fullKit
                            ? 'each set stands as worn, the top with its shorts directly below it: the front set on the left and the back set on the right, side by side, '
                            : 'the front view on the left and the back view on the right, side by side, ')
                        .'both complete, fully visible and not overlapping, large so they fill most of the width and height of the frame with a little space around them, on invisible ghost mannequins, '
                    : 'Presentation: unless the brief asks for a different layout, angle or background, make one landscape image of premium commercial product photography: '
                        .($fullKit ? 'the front set (the top with its shorts below it) on the left and the back set on the right, side by side, ' : 'the front view on the left and the back view on the right, side by side, ')
                        .'both complete, fully visible and not overlapping, on invisible ghost mannequins, '))
            .'in a dramatic dark setting: a night stadium with floodlights, haze tinted in the kit\'s main colour, a glossy reflective floor and rim lighting. '
            .'Photorealistic fabric: fine knit and mesh texture, natural folds, flatlock stitching, a crisp vivid sublimated print. '
            .'All text must be spelled exactly as written in the brief or the logo. ';
        $prompt .= $count
            ? "The first {$count} attached image(s) come from the client: logos, references, or the client's own finished garment design (flat artwork, a sketch, a snapshot or a photo). "
                .'If one of them shows a complete garment design, make the garment exactly that design: the same colours, pattern, panels, collar, trims, logos, text and numbers, front and back as shown; '
                .'do not redesign or simplify it, just turn it into a real 3D garment presented as the brief asks. '
                .'Reproduce any logos faithfully (the same artwork, colours and lettering) and place them where the brief says, where the design shows them, or in sensible positions (the main logo on the chest at a normal crest size). '
                .'The last attached image is the 3DEEZI word mark: use it only small at the top of the back, just under the collar, and nowhere else; leave it out when the client\'s design carries its own brand.'
            : 'The attached image is the 3DEEZI word mark: use it only small at the top of the back, just under the collar, and nowhere else; do NOT put 3DEEZI on the chest or anywhere on the front. '
                .'If the brief gives any wordmark, team, club or brand name, use exactly that text where the brief says. '
                .'With no client logo, the chest carries a simple original crest at a normal crest size.';

        return $prompt.($count ? ' '.self::OWN_LOGO : '').' No watermarks, no extra brands.';
    }

    /**
     * The AI designer's results (client visual 2026-10-21, images/138.jpg), fast like ChatGPT: the PRIMARY (the brief
     * exactly as written, under the full design rules) starts rendering at once; meanwhile this one short planning call
     * gives its 3D kit spec and three clearly different alternatives (palette, motifs, layout, treatment of the sport's
     * lettering), scored and ranked best first as options 2-4. Every direction follows the logo, colour, word mark,
     * sport marking (netball: position letters) and brand rules. When the call fails or takes over `$timeout` seconds,
     * ready-made takes on the brief are used
     * (`planned` false), so the pictures never wait.
     *
     * @param  array<int, string>  $references  data URLs (logos, sketches, photos)
     * @return array<int, array<string, mixed>> best first, each with `rank` (1-4), `score`, `planned`, `direction` and `design`
     */
    public function designDirections(string $brief, string $sport, string $garment, array $references = [], ?int $timeout = null): array
    {
        try {
            return $this->plannedDirections($brief, $sport, $garment, $references, $timeout ?? (int) config('services.openai.plan_timeout', 45));
        } catch (RuntimeException) {
            return $this->readyDirections($brief, $garment, $sport);
        }
    }

    /**
     * Four designs without the planning call: the brief exactly as written first (the full design rules still
     * apply), then three clearly different takes on it.
     */
    public function readyDirections(string $brief, string $garment, string $sport = ''): array
    {
        $takes = [
            ['Your brief', null],
            ['Bold Strike', 'bold and aggressive: dynamic sharp angular shards and speed lines across the front and sides, a dark body with the logo\'s main colour as the graphics'],
            ['Clean Classic', 'classic and clean: confident colour blocking with thin pinstripes and a tidy collar, the logo crisp on a calm body'],
            ['Heritage Pattern', 'heritage and pattern-led: an all-over tonal geometric pattern drawn from the logo, with contrast trims'],
        ];

        return array_map(fn (array $take, int $i) => [
            'id' => substr(hash('sha256', $brief.$i), 0, 16),
            'rank' => $i + 1,
            'score' => 0,
            'planned' => false,
            'name' => $take[0],
            'description' => $take[1] ? ucfirst(strtok($take[1], ':')).' take on your brief.' : 'Your brief, exactly as written.',
            'motif' => '',
            'direction' => $take[1] ? ['theme' => $take[1], 'ownDesign' => false] : ['ownDesign' => false],
            'design' => $this->kitSpec(['pattern' => ['Velocity', 'Velocity', 'Stripes', 'Chevron'][$i], 'mainColor' => '#0B1016', 'secondaryColor' => '#04D9E8', 'accentColor' => '#FFFFFF'], $brief, $garment, $sport),
        ], $takes, array_keys($takes));
    }

    private function plannedDirections(string $brief, string $sport, string $garment, array $references, int $timeout): array
    {
        $references = array_slice($references, 0, 4);
        $count = count($references);
        $text = "Sport: {$sport}\nGarment: {$garment}\nClient brief: {$brief}\n"
            .($count ? "{$count} image(s) from the client are attached: logos, references or their own finished design.\n" : "No images are attached.\n")
            .'You are the art director of a top custom sublimation sportswear brand. The designer is already rendering the brief exactly as written; '
            .'give its editable 3D kit spec in `brief`. Then write exactly 3 clearly different alternative design directions in `directions`, '
            .'each with its own palette, motifs, layout of the graphics and treatment of '.self::lettering($sport).'. '
            .'Take the palette and theme from the client\'s logo (its colours, mascot, lettering style and motifs such as lightning, flames, claws or waves) or from the brief. '
            .'Bold, fully sublimated graphics derived from that theme, flowing across the front, sides and back, never a plain template with flat colour blocks. '
            .self::BRAND_RULES.' The client\'s logo is reproduced faithfully. '.self::markingRules($sport).' '
            .'Follow everything the brief specifies (colours, layout, background, text) and keep the team name the same. '
            .self::COLOUR_RULES.' '
            .self::VARIETY_RULES.' '
            .'Score each alternative 0-100 as the client would judge it: brief fit, logo fit, boldness and readability of '.self::lettering($sport).'. '
            .'Every design, including the brief, gets its own different name. Be quick and brief: every text field is one short phrase of at most 20 words. '
            .'Never use real club, league or brand logos other than the client\'s own. '.self::OWN_LOGO;
        $content = [['type' => 'input_text', 'text' => $text]];
        foreach ($references as $reference) {
            $content[] = ['type' => 'input_image', 'image_url' => $reference];
        }
        $string = fn (string $description) => ['type' => 'string', 'description' => $description];
        $kit = [
            'designName' => $string('Short catchy design name, max 3 words.'),
            'summary' => $string('One short sentence to the client about this design.'),
            'mainColor' => $string('Hex like #101D2A for the garment body.'),
            'secondaryColor' => $string('Hex for panels and pattern.'),
            'accentColor' => $string('Hex for the wordmark and numbers; must contrast mainColor.'),
            'pattern' => ['type' => 'string', 'enum' => self::PATTERNS, 'description' => 'Only the nearest built-in pattern for the editable 3D kit.'],
            'logoText' => $string('Chest wordmark, max 12 characters. Use the team or brand name from the brief; if the brief names none, use 3DEEZI.'),
            'patternMotif' => $string('The signature print as a black-and-white pattern description for the 3D kit, max 20 words. No colours.'),
        ];
        $alternative = $kit + ['score' => ['type' => 'integer', 'description' => '0-100: brief fit, logo fit, boldness and readability of '.self::lettering($sport).'.']];
        $alternative['bodyColour'] = $string('The main body colour, name and hex, e.g. "white #FFFFFF"; different for each design.');
        $alternative['layout'] = ['type' => 'string', 'enum' => self::LAYOUTS, 'description' => 'The layout of the graphics; the alternatives use different layouts.'];
        $fields = self::directionFields($sport);
        foreach (['palette', 'theme', 'front', 'back', 'graphics', 'trims'] as $field) {
            $alternative[$field] = $string($fields[$field]);
        }
        $object = fn (array $properties) => ['type' => 'object', 'additionalProperties' => false, 'required' => array_keys($properties), 'properties' => $properties];
        $json = $this->post('/responses', [
            'model' => self::planningModel(),
            'input' => [['role' => 'system', 'content' => self::SYSTEM], ['role' => 'user', 'content' => $content]],
            'text' => ['format' => ['type' => 'json_schema', 'name' => 'design_directions', 'strict' => true, 'schema' => $object([
                'brief' => $object($kit),
                'directions' => ['type' => 'array', 'items' => $object($alternative)],
            ])]],
        ], $timeout);
        $plan = json_decode($this->outputText($json), true);
        $specs = array_values(array_filter(
            array_slice($plan['directions'] ?? [], 0, 3),
            fn ($spec) => is_array($spec) && filled($spec['front'] ?? null),
        ));
        if (! $specs || ! is_array($plan['brief'] ?? null)) {
            throw new RuntimeException('The AI returned no designs. Please try again.');
        }
        // The alternatives best first (equal scores keep the AI's order), after the brief as written.
        $order = array_keys($specs);
        usort($order, fn (int $a, int $b) => [-(int) ($specs[$a]['score'] ?? 0), $a] <=> [-(int) ($specs[$b]['score'] ?? 0), $b]);
        $entry = function (array $spec, int $rank, array $direction) use ($brief, $garment, $sport) {
            return [
                'id' => substr(hash('sha256', json_encode($spec).$rank), 0, 16),
                'rank' => $rank,
                'score' => (int) ($spec['score'] ?? 0),
                'planned' => true,
                'name' => mb_substr((string) ($spec['designName'] ?? 'Design '.$rank), 0, 60),
                'description' => (string) ($spec['summary'] ?? ''),
                'motif' => (string) ($spec['patternMotif'] ?? ''),
                'direction' => [...array_map(fn ($v) => mb_substr(trim((string) $v), 0, 1500), $direction), 'ownDesign' => false],
                'design' => $this->kitSpec($spec, $brief, $garment, $sport),
            ];
        };

        return self::distinctNames([
            $entry($plan['brief'], 1, []),
            ...array_map(fn (int $index, int $position) => $entry($specs[$index], $position + 2, ['body' => $specs[$index]['bodyColour'] ?? '', 'layout' => in_array($specs[$index]['layout'] ?? null, self::LAYOUTS, true) ? $specs[$index]['layout'] : ''] + array_intersect_key($specs[$index], array_flip(['summary', 'palette', 'theme', 'front', 'back', 'graphics', 'trims']))), $order, array_keys($order)),
        ]);
    }

    /** Four designs, four names: a repeated name (QA 2026-10-21: "Blitz Velocity" twice) gets a distinct word added. */
    public static function distinctNames(array $designs): array
    {
        $words = ['Strike', 'Edge', 'Pulse', 'Surge', 'Nova', 'Prime'];
        $seen = [];
        foreach ($designs as $i => $design) {
            $name = trim((string) ($design['name'] ?? '')) ?: 'Design '.($i + 1);
            for ($w = 0; in_array(mb_strtolower($name), $seen, true); $w++) {
                $name = trim((string) $design['name']).' '.($words[$w] ?? ($w + 2));
            }
            $seen[] = mb_strtolower($name);
            $designs[$i]['name'] = $name;
        }

        return $designs;
    }

    /**
     * One direction rendered as the presentation mockup (the same prompt and inputs as the HD mockup): `high` for the
     * PRIMARY and "Make HD", `medium` for the three options. Returns raw JPEG bytes.
     *
     * @param  array<string, mixed>  $direction  from designDirections()
     */
    public function renderDirection(string $brief, string $sport, string $garment, array $direction, array $references = [], string $quality = 'high', string $view = 'presentation'): string
    {
        $references = array_slice($references, 0, 4);
        if ($view === 'front') {
            return $this->renderMockup(self::mockupPrompt($brief, $sport, $garment, count($references), $direction, $view), $references, $quality, '1024x1024');
        }
        // Portrait (2026-10-22, client picture 146.jpg: the design fills a phone); a model that turns the size down gets
        // the landscape picture once instead (the results page fits any proportions).
        try {
            return $this->renderMockup(self::mockupPrompt($brief, $sport, $garment, count($references), $direction, $view), $references, $quality, self::PORTRAIT);
        } catch (RuntimeException $e) {
            if (! self::sizeProblem($e->getMessage())) {
                throw $e;
            }
            Log::warning('The image model turned down '.self::PORTRAIT.'; rendered landscape instead: '.$e->getMessage());

            return $this->renderMockup(self::mockupPrompt($brief, $sport, $garment, count($references), $direction, $view, false), $references, $quality, '1536x1024');
        }
    }

    /** The AI designs' picture size: tall, so the selected design fills a phone (YOUR DESIGNS, 146.jpg). */
    public const PORTRAIT = '1024x1536';

    /** Whether an image error is about the picture size (then the landscape size is tried once). */
    public static function sizeProblem(string $message): bool
    {
        return (bool) preg_match('/\bsize\b|1024x1536|dimension|aspect ratio/i', $message);
    }

    /** The editable 3D kit's spec for a design direction (netball: no back name or number, so the Studio and orders add none). */
    private function kitSpec(array $spec, string $prompt, string $garment, string $sport = ''): array
    {
        $main = $this->hex((string) ($spec['mainColor'] ?? ''));
        $secondary = $this->hex((string) ($spec['secondaryColor'] ?? ''));
        $logoText = mb_strtoupper(mb_substr((string) ($spec['logoText'] ?? '3DEEZI'), 0, 20));

        return [
            'garment' => $garment,
            'main' => $main,
            'secondary' => $secondary,
            'accent' => $this->hex((string) ($spec['accentColor'] ?? '')),
            'pattern' => in_array($spec['pattern'] ?? null, self::PATTERNS, true) ? $spec['pattern'] : 'Chevron',
            'logoText' => $logoText,
            ...self::kitBack($sport, $logoText),
            'patternColor' => $this->mix($main, $secondary, 0.55),
            'patternBody' => 0.08,
            'prompt' => $prompt,
        ];
    }

    /**
     * Renders a mockup prompt with the client's images and the 3DEEZI word mark (only the lettering, client 2026-10-26:
     * the full logo had ended up huge on the chest) as real image inputs. Returns raw JPEG bytes.
     */
    public function renderMockup(string $prompt, array $references = [], string $quality = 'high', string $size = '1536x1024'): string
    {
        $references = array_slice($references, 0, 4);
        $images = array_map(fn (string $r) => $this->decodeDataUrl($r), $references);
        $images[] = ['image/png', file_get_contents(public_path(self::WORD_MARK))];

        return $this->highFidelityEdit($prompt, $images, [
            'model' => $quality === 'medium' ? config('services.openai.image_model') : self::hdImageModel(),
            'size' => $size,
            'quality' => $quality === 'medium' ? 'medium' : 'high',
            'output_format' => 'jpeg',
            'output_compression' => $quality === 'medium' ? '85' : '90',
        ]);
    }

    /**
     * "Make it 3D": the same design redrawn as a flat print sheet (front and
     * back side by side on plain white, like a factory drawing), ready for
     * the Studio's "My design picture", which maps it onto the 3D kit.
     * The client's logos go in after the mockup so they stay faithful.
     * Returns raw JPEG bytes.
     *
     * @param  array<int, string>  $references  data URLs of the client's logos
     */
    public function printSheet(string $mockup, string $sport, string $garment, array $references = [], bool $frontOnly = false): string
    {
        $images = [$this->decodeDataUrl($mockup)];
        foreach (array_slice($references, 0, 3) as $reference) {
            $images[] = $this->decodeDataUrl($reference);
        }

        return self::separateHalves($this->highFidelityEdit(self::printSheetPrompt($sport, $garment, count($images) - 1, $frontOnly), $images, [
            'size' => '1536x1024',
            'quality' => 'high',
            'output_format' => 'jpeg',
            'output_compression' => '95',
        ]));
    }

    /**
     * A print sheet whose front and back touch (task 9.116: the image model sometimes draws the sleeves overlapping, and
     * the 3D check then reads both as one garment, half front and half back): cut at the middle, where the prompt puts
     * the gap, and moved apart with white between. A sheet with a clear gap, or one that cannot be read, is kept as is.
     */
    public static function separateHalves(string $jpeg): string
    {
        if (! function_exists('imagecreatefromstring')) {
            return $jpeg;
        }
        $image = @imagecreatefromstring($jpeg);
        if (! $image) {
            return $jpeg;
        }
        $w = imagesx($image);
        $h = imagesy($image);
        if ($w < 64 || $h < 64) {
            imagedestroy($image);

            return $jpeg;
        }
        $white = function (int $x) use ($image, $h): bool {
            for ($y = 0; $y < $h; $y += 3) {
                $c = imagecolorat($image, $x, $y);
                if ((($c >> 16) & 255) < 225 || (($c >> 8) & 255) < 225 || ($c & 255) < 225) {
                    return false;
                }
            }

            return true;
        };
        // A white column near the middle: the two are apart already.
        for ($x = (int) ($w * 0.38); $x <= (int) ($w * 0.62); $x += 2) {
            if ($white($x)) {
                imagedestroy($image);

                return $jpeg;
            }
        }
        $gap = (int) round($w * 0.08);
        $half = intdiv($w, 2);
        $out = imagecreatetruecolor($w + $gap, $h);
        imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
        imagecopy($out, $image, 0, 0, 0, 0, $half, $h);
        imagecopy($out, $image, $half + $gap, 0, $half, 0, $w - $half, $h);
        ob_start();
        imagejpeg($out, null, 95);
        $bytes = (string) ob_get_clean();
        imagedestroy($image);
        imagedestroy($out);

        return $bytes !== '' ? $bytes : $jpeg;
    }

    public static function printSheetPrompt(string $sport, string $garment, int $logos = 0, bool $frontOnly = false): string
    {
        $m = self::sportMarkings($sport);
        $back = $m['positions'] ? 'the same position letters large, no team name, no player name and no number'
            : ($m['names'] && $m['numbers'] ? 'the team name in bold lettering over a large number'
                : ($m['names'] ? 'the team name in bold lettering, no numbers' : ($m['numbers'] ? 'a large number, no player names' : 'no player names and no numbers')));

        return "The first attached image shows a {$sport} {$garment} design. Redraw exactly the same design as a flat print artwork sheet for the factory: "
            .($frontOnly ? "The picture shows the front only: draw the front exactly and design the back to match it (the same colours, graphics and trims, the small 3DEEZI word mark just under the collar, {$back}). " : '')
            .'the garment\'s front on the left and its back on the right, side by side, both complete and the same size, drawn flat and straight-on like a technical flat drawing, '
            .'on a plain pure white background with clear white space around and between them: a wide white gap between the front and the back, so their sleeves and edges never touch or overlap. '
            .'Draw each neck opening as an empty white cut-out, as on a technical flat drawing: never show the inside of the garment, the inner collar or the neckline of the other side through it, and keep all lettering clear of the collar. '
            .'No mannequin, no person, no folds, no perspective, no lighting effects, no shadows, no scene. '
            .'Keep the design exactly: the same colours, graphics, gradients, lettering, logos, numbers and trims, in the same places and proportions, and the same garment shape (neck, armholes or sleeves, hem). '
            .($logos ? "The other {$logos} attached image(s) are the client's logos: reproduce them faithfully where the design shows them. " : '')
            .'No labels, captions, measurements, hangers, sewn-in neck labels or extra text.';
    }

    /**
     * An image edit that asks the model to keep the first input image (the
     * client's logo or design) at high fidelity. The gpt-image-2.5 models
     * reject input_fidelity, so they never get it; another model that turns
     * it down gets the same request again without it.
     *
     * @param  array<int, array{0: string, 1: string}>  $images  mime and bytes
     */
    private function highFidelityEdit(string $prompt, array $images, array $fields): string
    {
        $edit = function (string $model) use ($prompt, $images, $fields) {
            $post = function (bool $fidelity) use ($prompt, $images, $fields, $model) {
                $request = $this->client()->timeout(300);
                foreach ($images as $i => [$mime, $bytes]) {
                    $request = $request->attach('image[]', $bytes, "image-{$i}.".explode('/', $mime)[1], ['Content-Type' => $mime]);
                }

                return $this->send(fn () => $request->post(self::BASE.'/images/edits', [
                    'prompt' => $prompt,
                    ...$fields,
                    'model' => $model,
                    ...($fidelity ? ['input_fidelity' => 'high'] : []),
                ]));
            };
            try {
                return $post(self::takesInputFidelity($model));
            } catch (RuntimeException $e) {
                if (! str_contains($e->getMessage(), 'input_fidelity')) {
                    throw $e;
                }

                return $post(false);
            }
        };
        $response = $this->withSafeModel((string) ($fields['model'] ?? config('services.openai.image_model')), self::SAFE_IMAGE_MODEL, $edit);

        return base64_decode($this->firstImage($response->json()), true) ?: throw new RuntimeException('The AI returned an unreadable image.');
    }

    /** gpt-image-1, 1.5 and 2 take input_fidelity; the gpt-image-2.5 models (Flare, Sunburst) reject it. */
    public static function takesInputFidelity(string $model): bool
    {
        return ! str_starts_with($model, 'gpt-image-2.5');
    }

    /**
     * The quick concept preview (a front view): the concept's free design, the club's symbol on the chest at crest size,
     * the sport's own front lettering (netball: position letters) and no 3DEEZI on the front.
     */
    public static function conceptPreviewPrompt(string $sport, string $garment, string $design, string $logoText, int $clientImages): string
    {
        // A team name is a wordmark on the front; 3DEEZI never is (client 2026-10-26).
        $wordmark = filled($logoText) && mb_strtoupper(trim($logoText)) !== '3DEEZI' ? "Any team wordmark on the front reads exactly \"{$logoText}\". " : '';

        return "Premium photoreal product render of a {$sport} {$garment}, front view, centred and fully visible, on an invisible ghost mannequin "
            .'against a dramatic dark background with soft floodlight haze and a rim light in the kit\'s colours. '
            ."Design: {$design} A bold, fully sublimated print, never a plain template. "
            .($clientImages
                ? "The first {$clientImages} attached image(s) come from the client: reproduce the client's main logo faithfully as the crest on the chest, at a normal crest size "
                    ."(if one shows the client's own complete garment design, follow it). "
                : 'The chest carries a simple original crest at a normal crest size. ')
            .$wordmark
            .'The last attached image is the 3DEEZI word mark: it goes only small under the back collar, which this front view does not show, so never put 3DEEZI on the front. '
            .self::markingRules($sport).' No other logos or text.';
    }

    /** Output sizes the image model can make. */
    public const EDIT_SIZES = ['auto', '1024x1024', '1536x1024', '1024x1536'];

    /**
     * The image editor's "Describe edits", like ChatGPT's image editor: the
     * picture changed only where and as the client asks. A mask (transparent
     * where the AI may change the picture), a copy of the picture with the
     * client's marks and numbered notes show where. A PNG picture comes back
     * as a PNG (it may be see-through), any other as a JPEG.
     *
     * @param  array<int, array{text: string, x: float|int|string, y: float|int|string}>  $notes  x and y from 0 to 1
     * @return array{0: string, 1: string} mime type and raw bytes
     */
    public function editImage(string $image, string $instruction, ?string $mask = null, ?string $marked = null, array $notes = [], ?string $size = null): array
    {
        [$mime, $bytes] = $this->decodeDataUrl($image);
        $dimensions = @getimagesizefromstring($bytes) ?: [1024, 1024];
        $ratio = $dimensions[0] / max(1, $dimensions[1]);
        $size = in_array($size, self::EDIT_SIZES, true) ? $size
            : ($ratio > 1.2 ? '1536x1024' : ($ratio < 0.83 ? '1024x1536' : '1024x1024'));
        $png = $mime === 'image/png';

        $prompt = 'Edit this picture exactly as the client asks. Change only what the client asks for and keep everything else the same: '
            .'the garment design, colours, panels, logos, lettering and numbers, the camera angle, the lighting and the background, unless the client asks to change them. '
            .'Spell any text exactly as written.';
        if ($mask) {
            $prompt .= ' The mask shows the area to change (its transparent part): fill and change that area as asked, and leave the rest of the picture as it is.';
        }
        if ($marked) {
            $prompt .= ' The second image is a copy of the picture with the client\'s marks on it: red brush strokes and circles show where to change, and numbered pins show where each note applies. '
                .'Use it only to find those places. Never draw the marks, pins or numbers in the result.';
        }
        if ($notes) {
            $prompt .= "\nThe client's notes on the picture:";
            foreach (array_values($notes) as $i => $note) {
                $prompt .= "\n".($i + 1).' ('.$this->place((float) $note['x'], (float) $note['y']).'): '.trim($note['text']);
            }
        }
        if (filled($instruction)) {
            $prompt .= "\nClient request: ".trim($instruction);
        }
        $prompt .= "\nPhotoreal where the picture is photoreal. No watermarks, no extra logos, no UI.";

        $request = $this->client()->timeout(300)
            ->attach('image[]', $bytes, 'picture.'.explode('/', $mime)[1], ['Content-Type' => $mime]);
        if ($marked) {
            [$markedMime, $markedBytes] = $this->decodeDataUrl($marked);
            $request = $request->attach('image[]', $markedBytes, 'marks.'.explode('/', $markedMime)[1], ['Content-Type' => $markedMime]);
        }
        if ($mask) {
            $request = $request->attach('mask', $this->decodeDataUrl($mask)[1], 'mask.png', ['Content-Type' => 'image/png']);
        }

        $response = $this->withSafeModel(self::hdImageModel(), self::SAFE_IMAGE_MODEL, fn (string $model) => $this->send(fn () => $request->post(self::BASE.'/images/edits', [
            'model' => $model,
            'prompt' => $prompt,
            'size' => $size,
            // HD pictures (mockups, showcases) stay HD; smaller ones are edited faster.
            'quality' => max($dimensions[0], $dimensions[1]) >= 1400 ? 'high' : 'medium',
            'output_format' => $png ? 'png' : 'jpeg',
            ...($png ? [] : ['output_compression' => '90']),
        ])));

        return [
            $png ? 'image/png' : 'image/jpeg',
            base64_decode($this->firstImage($response->json()), true) ?: throw new RuntimeException('The AI returned an unreadable image.'),
        ];
    }

    /** Where a note sits on the picture, in words the image model follows. */
    private function place(float $x, float $y): string
    {
        $row = $y < 0.34 ? 'top' : ($y > 0.66 ? 'bottom' : '');
        $column = $x < 0.34 ? 'left' : ($x > 0.66 ? 'right' : '');

        return sprintf('%s, %d%% from the left and %d%% from the top',
            trim("{$row} {$column}") ?: 'centre', round($x * 100), round($y * 100));
    }

    /**
     * Applies a plain-language instruction ("make it red and gold", "add
     * stripes", "number 7 for SMITH") to the current design. An attached image
     * guides colours and style. Returns the changed fields and a short reply.
     *
     * @return array{design: array<string, mixed>, reply: string, motif: ?string}
     */
    public function editDesign(array $design, string $instruction, ?string $image = null): array
    {
        $current = json_encode(array_intersect_key($design, array_flip(['garment', 'main', 'secondary', 'accent', 'pattern', 'patternColor', 'logoText', 'backName', 'number'])));
        $content = [['type' => 'input_text', 'text' => "Current kit design (JSON): {$current}\nClient request: {$instruction}\n"
            .'Return the complete updated design. Change only what the request asks for and keep everything else exactly the same. '
            .'If the request names one of the built-in patterns (Chevron, Stripes, Velocity, Solid; "plain" means Solid), set pattern to it and newPatternMotif to null. '
            .'Set newPatternMotif only when the client asks for a custom print, texture or graphic that is not a built-in pattern; otherwise null. '
            .'reply is one short friendly sentence telling the client what you changed.'.($image ? ' An image is attached: use it as the reference for colours and style.' : '')]];
        if ($image) {
            $content[] = ['type' => 'input_image', 'image_url' => $image];
        }
        $hex = ['type' => 'string', 'description' => 'Hex colour like #0B1016.'];
        $json = $this->post('/responses', [
            'model' => config('services.openai.text_model'),
            'input' => [['role' => 'system', 'content' => self::SYSTEM], ['role' => 'user', 'content' => $content]],
            'text' => ['format' => ['type' => 'json_schema', 'name' => 'kit_edit', 'strict' => true, 'schema' => [
                'type' => 'object',
                'additionalProperties' => false,
                'required' => ['main', 'secondary', 'accent', 'pattern', 'patternColor', 'logoText', 'backName', 'number', 'newPatternMotif', 'reply'],
                'properties' => [
                    'main' => $hex, 'secondary' => $hex, 'accent' => $hex, 'patternColor' => $hex,
                    'pattern' => ['type' => 'string', 'enum' => self::PATTERNS],
                    'logoText' => ['type' => 'string', 'description' => 'Chest wordmark, max 20 characters.'],
                    'backName' => ['type' => 'string', 'description' => 'Player name on the back, max 20 characters.'],
                    'number' => ['type' => 'string', 'description' => 'Player number, 0-3 digits.'],
                    'newPatternMotif' => ['type' => ['string', 'null'], 'description' => 'Black-and-white print motif description, max 25 words, or null.'],
                    'reply' => ['type' => 'string'],
                ],
            ]]],
        ]);
        $out = json_decode($this->outputText($json), true) ?: throw new RuntimeException('The AI returned nothing. Please try again.');

        return [
            'design' => [
                'main' => $this->hex($out['main']),
                'secondary' => $this->hex($out['secondary']),
                'accent' => $this->hex($out['accent']),
                'patternColor' => $this->hex($out['patternColor']),
                'pattern' => in_array($out['pattern'], self::PATTERNS, true) ? $out['pattern'] : ($design['pattern'] ?? 'Chevron'),
                'logoText' => mb_strtoupper(mb_substr($out['logoText'], 0, 20)),
                'backName' => mb_strtoupper(mb_substr($out['backName'], 0, 20)),
                'number' => mb_substr(preg_replace('/\D/', '', $out['number']), 0, 3),
            ],
            'reply' => $out['reply'],
            'motif' => filled($out['newPatternMotif']) ? $out['newPatternMotif'] : null,
        ];
    }

    /**
     * Reads a photo, sketch or mockup of a kit (for example one made in
     * ChatGPT) and turns it into an editable 3D design.
     *
     * @param  array<int, string>  $sports  catalog sport ids
     * @param  array<int, string>  $garments  catalog garment ids
     */
    public function convert(string $image, array $sports, array $garments): array
    {
        $string = fn (string $d) => ['type' => 'string', 'description' => $d];
        $json = $this->post('/responses', [
            'model' => config('services.openai.text_model'),
            'input' => [
                ['role' => 'system', 'content' => self::SYSTEM],
                ['role' => 'user', 'content' => [
                    ['type' => 'input_text', 'text' => 'Analyse this sportswear image and describe the main garment as an editable kit design: its colours, the closest pattern style, the wordmark text, the back name and number if visible, and the repeating print motif.'],
                    ['type' => 'input_image', 'image_url' => $image],
                ]],
            ],
            'text' => ['format' => ['type' => 'json_schema', 'name' => 'kit_from_image', 'strict' => true, 'schema' => [
                'type' => 'object',
                'additionalProperties' => false,
                'required' => ['designName', 'summary', 'sport', 'garment', 'mainColor', 'secondaryColor', 'accentColor', 'pattern', 'logoText', 'backName', 'number', 'patternMotif'],
                'properties' => [
                    'designName' => $string('Short name for the design, max 3 words.'),
                    'summary' => $string('One sentence describing what you see.'),
                    'sport' => ['type' => 'string', 'enum' => $sports],
                    'garment' => ['type' => 'string', 'enum' => $garments],
                    'mainColor' => $string('Hex of the garment body.'),
                    'secondaryColor' => $string('Hex of panels and pattern.'),
                    'accentColor' => $string('Hex of the wordmark, trims and numbers.'),
                    'pattern' => ['type' => 'string', 'enum' => self::PATTERNS],
                    'logoText' => $string('Main chest wordmark exactly as written, or empty.'),
                    'backName' => $string('Name on the back, or empty.'),
                    'number' => $string('Number on the garment, or empty.'),
                    'patternMotif' => $string('The print motif as a black-and-white pattern description, max 25 words, or empty if plain.'),
                ],
            ]]],
        ]);
        $s = json_decode($this->outputText($json), true) ?: throw new RuntimeException('The AI returned nothing. Please try again.');
        $main = $this->hex($s['mainColor']);
        $secondary = $this->hex($s['secondaryColor']);

        return [
            'name' => $s['designName'],
            'summary' => $s['summary'],
            'sport' => $s['sport'],
            'garment' => $s['garment'],
            'motif' => $s['patternMotif'] ?: null,
            'design' => [
                'garment' => $s['garment'],
                'main' => $main,
                'secondary' => $secondary,
                'accent' => $this->hex($s['accentColor']),
                'pattern' => $s['pattern'],
                'logoText' => mb_strtoupper(mb_substr($s['logoText'], 0, 20)),
                'backName' => mb_strtoupper(mb_substr($s['backName'], 0, 20)),
                'number' => mb_substr(preg_replace('/\D/', '', $s['number']), 0, 3),
                'patternColor' => $this->mix($main, $secondary, 0.55),
                'patternBody' => 0.08,
            ],
        ];
    }

    /**
     * Our 3D garments an AI picture can open on (task 9.116), each with what it stands for, so the nearest one is
     * chosen for a garment we have no 3D model of (a long-sleeve top is a tee; since task 9.126 a netball dress has its own).
     */
    public const READ_GARMENTS = [
        'jersey' => 'short-sleeve sports jersey (rugby, soccer, league, cricket shirts)',
        'nfljersey' => 'American football jersey: cut wide over shoulder pads, short cap sleeves, big numbers (game and practice jerseys)',
        'compression' => 'skin-tight long-sleeve compression top or base layer',
        'shooting-shirt' => 'loose short-sleeve V-neck raglan warm-up shirt (basketball shooting shirt)',
        'socks' => 'knee-high team socks with hoops (rugby, football, footy, hockey socks)',
        'cap' => 'six-panel team cap with a curved brim (ball cap, golf, cricket, cycling, club cap)',
        'skirt' => 'a skirt alone: netball and tennis skirts, hockey skorts',
        'bucket-hat' => 'a soft bucket hat with a wide brim (sun hat for golf, cricket, bowls, the sideline)',
        'polo' => 'polo shirt with a collar and buttons',
        'pocketpolo' => 'polo shirt with a chest pocket (pool, darts)',
        'singlet' => 'any other sleeveless top: singlets, tanks, bibs, basketball tops, AFL guernseys',
        'netball-dress' => 'a fitted dress for women, with a skirt: netball dresses and tennis dresses',
        'tee' => 'training t-shirt or other crew-neck top, also long-sleeve tops',
        'hoodie' => 'pull-over hoodie',
        'ziphoodie' => 'full-zip hoodie',
        'varsity' => 'varsity or letterman jacket',
        'trackjacket' => 'full-zip track jacket or tracksuit top (with a stand-up collar or a hood)',
        'shorts' => 'shorts alone',
        'fullkit' => 'a top and shorts shown together as one kit',
    ];

    /**
     * "Open in 3D Designer" (task 9.116, client 2026-10-23 and 2026-10-26): reads an AI design picture for the editable
     * 3D kit. One cheap planning call gives the nearest 3D garment we have (never a refusal: when the picture shows a
     * garment we have no model of, the closest one, with `exact` false), the picture's own colours, the nearest pattern,
     * the team name, the back name and number (netball: the position letters instead) and where the club symbol is.
     *
     * @return array{garment: string, seen: string, exact: bool, hood: bool, motif: ?string, crest: ?array{x: float, y: float, w: float, h: float}, design: array<string, mixed>}
     */
    public function readDesign(string $image, string $sport, string $asked): array
    {
        $m = self::sportMarkings($sport);
        $garments = implode('; ', array_map(fn ($id, $what) => "{$id}: {$what}", array_keys(self::READ_GARMENTS), self::READ_GARMENTS));
        $string = fn (string $d) => ['type' => 'string', 'description' => $d];
        $number = fn (string $d) => ['type' => 'number', 'description' => $d];
        $text = "This picture is an AI design of a {$sport} garment (the client asked for: {$asked}). Read it so the same design can be put on our editable 3D garment.\n"
            ."Our 3D garments: {$garments}.\n"
            .'Choose the nearest of them to the main garment in the picture; when the picture shows something we have no model of, choose the closest and set exact to false. '
            .'Take the colours exactly as they look in the picture (not from the brief): the body\'s main colour, the second colour of its panels and graphics, and the accent colour of its lettering and trims. '
            .'Read every text exactly as written. 3DEEZI is our brand and never the team name.'
            .($m['positions'] ? ' This sport shows playing position letters ('.implode(', ', $m['positions']).') instead of names and numbers.' : '');
        $json = $this->post('/responses', [
            'model' => self::planningModel(),
            'input' => [
                ['role' => 'system', 'content' => self::SYSTEM],
                ['role' => 'user', 'content' => [
                    ['type' => 'input_text', 'text' => $text],
                    ['type' => 'input_image', 'image_url' => $image],
                ]],
            ],
            'text' => ['format' => ['type' => 'json_schema', 'name' => 'design_for_3d', 'strict' => true, 'schema' => [
                'type' => 'object',
                'additionalProperties' => false,
                'required' => ['seen', 'garment', 'exact', 'hood', 'mainColor', 'secondaryColor', 'accentColor', 'pattern', 'patternMotif', 'teamName', 'nameOnFront', 'backName', 'number', 'positionLetters', 'crest', 'printBox'],
                'properties' => [
                    'seen' => $string('The garment in the picture in 1-3 words, e.g. "netball dress", "soccer jersey".'),
                    'garment' => ['type' => 'string', 'enum' => array_keys(self::READ_GARMENTS), 'description' => 'The nearest of our 3D garments.'],
                    'exact' => ['type' => 'boolean', 'description' => 'True when the picture\'s garment is that kind of garment, false when it is only the closest.'],
                    'hood' => ['type' => 'boolean', 'description' => 'True when the garment has a hood.'],
                    'mainColor' => $string('Hex of the body\'s main colour as seen, e.g. #0B6E3A.'),
                    'secondaryColor' => $string('Hex of the second colour (panels, graphics, stripes) as seen.'),
                    'accentColor' => $string('Hex of the lettering and trims as seen; contrasts the main colour.'),
                    'pattern' => ['type' => 'string', 'enum' => self::PATTERNS, 'description' => 'The nearest of these patterns: Velocity (sweeping or flowing graphics, swirls, streaks), Chevron, Stripes (stripes or hoops), Solid (only a plain body with no graphics).'],
                    'patternMotif' => $string('The body\'s signature print as a black-and-white pattern description, max 20 words, no colours; empty when plain.'),
                    'teamName' => $string('The team or club name written on the garment (chest wordmark or back), exactly; empty if none. Never 3DEEZI.'),
                    'nameOnFront' => ['type' => 'boolean', 'description' => 'True when the team name is written across the front of the garment (not only on the back).'],
                    'backName' => $string('The name on the back, exactly; empty if none. Never 3DEEZI.'),
                    'number' => $string('The player number on the back, digits only; empty if none.'),
                    'positionLetters' => $string('Playing position letters shown large (e.g. GS); empty if none.'),
                    'printBox' => ['type' => 'object', 'additionalProperties' => false, 'required' => ['found', 'x0', 'y0', 'x1', 'y1'], 'description' => 'A patch of the front garment body that shows only its all-over print (graphics, stripes, texture): no crest, lettering, pocket, collar, seam, edge or background. A typical patch with the same mix of colours as the whole body (not its brightest part), as large as possible, as a box in fractions of the whole picture width and height. found is false when the body is plain.', 'properties' => [
                        'found' => ['type' => 'boolean', 'description' => 'True when the body has a print and such a patch exists.'],
                        'x0' => $number('Left edge.'), 'y0' => $number('Top edge.'), 'x1' => $number('Right edge.'), 'y1' => $number('Bottom edge.'),
                    ]],
                    'crest' => ['type' => 'object', 'additionalProperties' => false, 'required' => ['found', 'x0', 'y0', 'x1', 'y1'], 'description' => 'The club symbol (crest or logo) on the chest of the front view (the garment on the left when front and back are shown), as a box in fractions of the whole picture\'s width and height (0 = left/top, 1 = right/bottom). Measure carefully: the box tightly encloses the whole symbol and nothing else.', 'properties' => [
                        'found' => ['type' => 'boolean', 'description' => 'True when the front shows a club symbol on the chest.'],
                        'x0' => $number('Left edge.'), 'y0' => $number('Top edge.'), 'x1' => $number('Right edge.'), 'y1' => $number('Bottom edge.'),
                    ]],
                ],
            ]]],
        ], 60);
        $s = json_decode($this->outputText($json), true);
        if (! is_array($s)) {
            throw new RuntimeException('The AI could not read this design. Please try again.');
        }

        return self::designFromReading($s, $sport, $asked);
    }

    /**
     * The 3D kit from a reading of the picture (readDesign): the garment it opens on, the colours, pattern and lettering.
     * Netball's position letters go in the number's place and its back shows no name (the name mark is hidden).
     */
    public static function designFromReading(array $s, string $sport, string $asked = ''): array
    {
        $hex = function ($value, string $fallback) {
            $v = ltrim(trim((string) $value), '#');

            return preg_match('/^[0-9a-f]{6}$/i', $v) ? '#'.strtoupper($v) : $fallback;
        };
        $garment = array_key_exists($s['garment'] ?? '', self::READ_GARMENTS) ? $s['garment'] : (array_key_exists($asked, self::READ_GARMENTS) ? $asked : 'jersey');
        $main = $hex($s['mainColor'] ?? '', '#0B1016');
        $secondary = $hex($s['secondaryColor'] ?? '', '#04D9E8');
        $mixed = sprintf('#%02X%02X%02X', ...array_map(fn ($a, $b) => (int) round($a + ($b - $a) * 0.55), sscanf($main, '#%02x%02x%02x'), sscanf($secondary, '#%02x%02x%02x')));
        $clean = fn ($v) => mb_strtoupper(mb_substr(trim(preg_replace('/\b3\s?DEEZI\b/i', '', (string) $v)), 0, 20));
        $m = self::sportMarkings($sport);
        $team = $clean($s['teamName'] ?? '');
        $letters = mb_substr(preg_replace('/[^A-Z]/', '', mb_strtoupper((string) ($s['positionLetters'] ?? ''))), 0, 3);
        if ($m['positions'] && ! in_array($letters, $m['positions'], true)) {
            $letters = $m['positions'][0];
        }
        $marks = [];
        if ($m['positions']) {
            // Netball: no names or numbers; the position letters in the number's place, no name above them.
            $backName = '';
            $num = $letters;
            $marks['top_name'] = ['hidden' => true];
        } else {
            $backName = $m['names'] ? ($clean($s['backName'] ?? '') ?: $team) : '';
            $num = $m['numbers'] ? mb_substr(preg_replace('/\D/', '', (string) ($s['number'] ?? '')), 0, 3) : '';
            if ($m['numbers'] && $num === '') {
                $num = '23';
            }
        }
        // No team name on the picture's front: no chest wordmark (3DEEZI is never on the front, client 2026-10-26).
        if ($team === '' || ($s['nameOnFront'] ?? true) === false) {
            $marks['top_wordmark'] = ['hidden' => true];
        }
        $box = $s['crest'] ?? null;
        $crest = null;
        if (is_array($box) && ($box['found'] ?? false)) {
            $x0 = max(0.0, min(1.0, (float) $box['x0']));
            $y0 = max(0.0, min(1.0, (float) $box['y0']));
            $x1 = max(0.0, min(1.0, (float) $box['x1']));
            $y1 = max(0.0, min(1.0, (float) $box['y1']));
            // A sensible crest only: not a speck, not half the picture.
            if ($x1 - $x0 > 0.015 && $y1 - $y0 > 0.01 && $x1 - $x0 < 0.4 && $y1 - $y0 < 0.4) {
                $crest = ['x' => $x0, 'y' => $y0, 'w' => $x1 - $x0, 'h' => $y1 - $y0];
            }
        }

        // A patch of the picture's own print (task 9.126): the hosts cut it from the picture and lay it on the body.
        $pb = $s['printBox'] ?? null;
        $print = null;
        if (is_array($pb) && ($pb['found'] ?? false)) {
            $x0 = max(0.0, min(1.0, (float) $pb['x0']));
            $y0 = max(0.0, min(1.0, (float) $pb['y0']));
            $x1 = max(0.0, min(1.0, (float) $pb['x1']));
            $y1 = max(0.0, min(1.0, (float) $pb['y1']));
            if ($x1 - $x0 > 0.04 && $y1 - $y0 > 0.03 && $x1 - $x0 < 0.5 && $y1 - $y0 < 0.5) {
                $print = ['x' => $x0, 'y' => $y0, 'w' => $x1 - $x0, 'h' => $y1 - $y0];
            }
        }

        return [
            'garment' => $garment,
            'print' => $print,
            'seen' => mb_substr(trim((string) ($s['seen'] ?? '')), 0, 40),
            'exact' => (bool) ($s['exact'] ?? true),
            'hood' => (bool) ($s['hood'] ?? false),
            'motif' => filled($s['patternMotif'] ?? null) ? mb_substr(trim((string) $s['patternMotif']), 0, 300) : null,
            'crest' => $crest,
            'design' => [
                'garment' => $garment,
                'main' => $main,
                'secondary' => $secondary,
                'accent' => $hex($s['accentColor'] ?? '', '#FFFFFF'),
                // A picture with graphics is never a plain kit (the model often answers Solid for an all-over print).
                'pattern' => in_array($s['pattern'] ?? null, self::PATTERNS, true) && ! ($s['pattern'] === 'Solid' && filled($s['patternMotif'] ?? null)) ? $s['pattern'] : 'Velocity',
                'logoText' => $team !== '' ? $team : '3DEEZI',
                'backName' => $backName,
                'number' => $num,
                'patternColor' => $mixed,
                'patternBody' => 0.08,
                ...($garment === 'trackjacket' ? ['trackStyle' => ($s['hood'] ?? false) ? 'hood' : 'collar'] : []),
                ...($marks ? ['marks' => $marks] : []),
                // Netball: the position letters large on the front too, below the crest (an editable text layer).
                ...($m['positions'] ? ['layers' => [['id' => 'position-front', 'name' => 'Position letters', 'type' => 'text', 'part' => 'top', 'side' => 'front', 'x' => 0, 'y' => $garment === 'netball-dress' ? 0.5 : 0.36, 'rot' => 0, 'text' => $letters, 'size' => 0.17, 'color' => $hex($s['accentColor'] ?? '', '#FFFFFF')]]] : []),
            ],
        ];
    }

    // ------------------------------------------------------------------ helpers

    private function conceptSchema(): array
    {
        $string = fn (string $description) => ['type' => 'string', 'description' => $description];

        return [
            'type' => 'object',
            'additionalProperties' => false,
            'required' => ['designName', 'summary', 'mainColor', 'secondaryColor', 'accentColor', 'pattern', 'logoText', 'renderPrompt', 'patternMotif'],
            'properties' => [
                'designName' => $string('Short catchy concept name, max 3 words.'),
                'summary' => $string('One sentence describing the design for the client.'),
                'mainColor' => $string('Hex like #101D2A for the garment body.'),
                'secondaryColor' => $string('Hex for panels and pattern.'),
                'accentColor' => $string('Hex for the wordmark and numbers; must contrast mainColor.'),
                'pattern' => ['type' => 'string', 'enum' => self::PATTERNS],
                'logoText' => $string('Chest wordmark, max 12 characters. Use the team or brand name from the brief; if the brief names none, use 3DEEZI.'),
                'renderPrompt' => $string('Detailed visual description of the whole fully sublimated garment design for an image model: colours, graphics and how they flow across front, sides and back, textures, trims, collar, the club\'s crest on the chest, the small 3DEEZI word mark under the back collar and the lettering the sport uses. Free design, not limited to the pattern list. Garment only.'),
                'patternMotif' => $string('The concept signature print as a black-and-white pattern description for the 3D kit, max 25 words, e.g. "jagged lightning bolts and speed streaks with halftone dot fades". No colours.'),
            ],
        ];
    }

    /**
     * A plain text reply to a conversation (used by 3DEEZI ASSIST).
     *
     * @param  array<int, array{role: string, content: string}>  $messages
     */
    public function respond(string $instructions, array $messages, int $maxTokens = 1500): string
    {
        $json = $this->post('/responses', [
            'model' => config('services.openai.text_model'),
            'instructions' => $instructions,
            'input' => $messages,
            'max_output_tokens' => $maxTokens,
        ]);

        return trim($this->outputText($json));
    }

    /**
     * A reply to a conversation as JSON following `$schema` (strict structured output).
     *
     * @param  array<int, array{role: string, content: string}>  $messages
     * @param  array<string, mixed>  $schema
     * @return array<string, mixed>
     */
    public function respondJson(string $instructions, array $messages, string $name, array $schema, int $maxTokens = 1500): array
    {
        $json = $this->post('/responses', [
            'model' => config('services.openai.text_model'),
            'instructions' => $instructions,
            'input' => $messages,
            'max_output_tokens' => $maxTokens,
            'text' => ['format' => ['type' => 'json_schema', 'name' => $name, 'strict' => true, 'schema' => $schema]],
        ]);

        return json_decode($this->outputText($json), true) ?: throw new RuntimeException('The AI returned nothing. Please try again.');
    }

    private function client()
    {
        return Http::withToken((string) config('services.openai.key'))->timeout(180)->acceptJson();
    }

    private function imageRequest(Pool $pool)
    {
        return $pool->withToken((string) config('services.openai.key'))->timeout(180)->acceptJson();
    }

    private function post(string $path, array $body, int $timeout = 180): array
    {
        // A newly set model that is turned down falls back to the known-good one (text or image).
        $safe = $path === '/responses' ? self::SAFE_TEXT_MODEL : self::SAFE_IMAGE_MODEL;
        $response = isset($body['model'])
            ? $this->withSafeModel((string) $body['model'], $safe, fn (string $model) => $this->send(fn () => $this->client()->timeout($timeout)->post(self::BASE.$path, ['model' => $model] + $body)))
            : $this->send(fn () => $this->client()->timeout($timeout)->post(self::BASE.$path, $body));

        // An empty or non-JSON answer is a failed request too (callers fall back or show a message).
        return $response->json() ?? throw new RuntimeException('The AI service sent an unexpected reply. Please try again.');
    }

    /**
     * Runs `$call` with `$model`; when OpenAI turns that model or one of its parameters down (not the content), logs
     * a warning and runs it once more with the known-good `$safe` model, so a new model setting never stops a
     * feature that worked before.
     */
    private function withSafeModel(string $model, string $safe, callable $call): mixed
    {
        try {
            return $call($model);
        } catch (AiModelException $e) {
            if ($model === $safe) {
                throw $e;
            }
            Log::warning("OpenAI turned down the model {$model} ({$e->getMessage()}); retried with {$safe}.");

            return $call($safe);
        }
    }

    /** True when OpenAI turned down the model or a parameter, not the content. */
    private static function modelProblem(Response $response): bool
    {
        $code = (string) $response->json('error.code');
        $message = strtolower((string) $response->json('error.message'));
        if (in_array($code, ['moderation_blocked', 'content_policy_violation', 'content_filter'], true) || str_contains($message, 'safety') || str_contains($message, 'policy')) {
            return false;
        }

        return in_array($response->status(), [400, 403, 404], true) && (
            in_array($code, ['model_not_found', 'invalid_model', 'unsupported_parameter', 'unknown_parameter', 'unsupported_value', 'invalid_parameter'], true)
            || $response->json('error.param') === 'model'
            || str_contains($message, 'model') || str_contains($message, 'parameter')
        );
    }

    /** Sends a request and turns failures into friendly messages. */
    private function send(callable $call): Response
    {
        try {
            $response = $call();
        } catch (ConnectionException) {
            throw new RuntimeException('Could not reach the AI service. Please try again.');
        }
        if ($response->failed()) {
            $class = self::modelProblem($response) ? AiModelException::class : RuntimeException::class;
            throw new $class(match ($response->status()) {
                401 => 'The server\'s AI key was rejected.',
                429 => 'AI usage limit reached. Please try again shortly.',
                default => 'AI error: '.($response->json('error.message') ?? $response->status()),
            });
        }

        return $response;
    }

    private function outputText(array $json): string
    {
        foreach ($json['output'] ?? [] as $item) {
            if (($item['type'] ?? '') !== 'message') {
                continue;
            }
            foreach ($item['content'] ?? [] as $part) {
                if (($part['type'] ?? '') === 'refusal') {
                    throw new RuntimeException('The AI declined this brief: '.$part['refusal']);
                }
                if (($part['type'] ?? '') === 'output_text') {
                    return $part['text'];
                }
            }
        }
        throw new RuntimeException('The AI returned nothing. Please try again.');
    }

    private function firstImage(array $json): string
    {
        return $json['data'][0]['b64_json'] ?? throw new RuntimeException('No image came back. Please try again.');
    }

    /** @return array{0: string, 1: string} mime and raw bytes */
    private function decodeDataUrl(string $url): array
    {
        if (! preg_match('#^data:(image/(?:png|jpeg|webp));base64,(.+)$#s', $url, $m)) {
            throw new RuntimeException('The capture must be a PNG, JPEG or WebP image.');
        }

        return [$m[1], base64_decode($m[2], true) ?: throw new RuntimeException('The capture could not be read.')];
    }

    private function hex(string $value): string
    {
        $value = ltrim(trim($value), '#');

        return preg_match('/^[0-9a-fA-F]{6}$/', $value) ? '#'.strtoupper($value) : '#0B1016';
    }

    private function mix(string $a, string $b, float $t): string
    {
        $ca = sscanf($a, '#%02x%02x%02x');
        $cb = sscanf($b, '#%02x%02x%02x');

        return sprintf('#%02X%02X%02X', ...array_map(fn ($x, $y) => (int) round($x + ($y - $x) * $t), $ca, $cb));
    }
}
