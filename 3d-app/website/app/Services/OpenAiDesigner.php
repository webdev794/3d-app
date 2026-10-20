<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Server-side OpenAI integration for the design flow. The API key never
 * leaves the server. Prompts and schemas mirror the mobile app's
 * (lib/ai_service.dart), which are proven against the live API.
 */
class OpenAiDesigner
{
    private const BASE = 'https://api.openai.com/v1';

    public const PATTERNS = ['Velocity', 'Chevron', 'Stripes', 'Solid'];

    public const SCENES = [
        'Stadium tunnel' => 'floating on an invisible ghost mannequin above a glossy reflective floor in a cinematic futuristic stadium tunnel at night: deep navy-black, glowing cyan and blue light strips receding into the distance, volumetric haze, soft bokeh, strong depth of field',
        'Studio podium' => 'on an invisible ghost mannequin above a low brushed-black pedestal with a thin glowing rim, in a dark premium photo studio with a large softbox key light, cyan rim light and a soft contact shadow',
        'On athlete' => "worn by an athletic player standing confidently in a floodlit stadium at night, shot from chest height, the player's face in shadow or turned away, crowd and lights blurred behind",
        'Locker room' => 'hanging on a wooden hanger in a modern dark locker room with wood and steel lockers, warm spotlights and cyan accent lighting, shallow depth of field',
    ];

    private const SYSTEM = 'You are the lead designer at 3DEEZI, a custom sportswear studio. Turn client briefs into original, manufacturable kit designs. Never copy real club, league or brand logos. When a brief mentions a cultural style, create an original design inspired by it rather than reproducing sacred motifs.';

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
            .'Create exactly 4 clearly different concept directions: 1) bold and aggressive, 2) classic and clean, '
            .'3) heritage or pattern-led, 4) modern minimal. Keep the team name consistent across all four.';
        if ($references) {
            $text .= "\nReference images are attached. Take colours, motifs and mood from them. If one shows the client's own finished garment design, make concept 1 follow it closely (its colours, pattern and lettering).";
        }
        $content = [['type' => 'input_text', 'text' => $text]];
        foreach (array_slice($references, 0, 3) as $reference) {
            $content[] = ['type' => 'input_image', 'image_url' => $reference];
        }

        $json = $this->post('/responses', [
            'model' => config('services.openai.text_model'),
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
        // 3DEEZI logo goes in so every mockup carries the real emblem.
        $logo = file_get_contents(public_path('media/images/logo_full.png'));
        $responses = Http::pool(fn (Pool $pool) => array_map(
            fn (array $spec) => $this->imageRequest($pool)
                ->attach('image[]', $logo, '3deezi-logo.png', ['Content-Type' => 'image/png'])
                ->post(self::BASE.'/images/edits', [
                    'model' => config('services.openai.image_model'),
                    'prompt' => "Premium photoreal product render of a {$sport} {$garment}, front view, centred and fully visible, on an invisible mannequin floating on a near-black background with a cyan rim light. Design: {$spec['renderPrompt']} The chest wordmark reads exactly \"{$spec['logoText']}\". The attached image is the 3DEEZI logo: use its emblem as the chest crest. No other logos or text.",
                    'size' => '1024x1024',
                    'quality' => 'low',
                    'output_format' => 'jpeg',
                    'output_compression' => '82',
                ]),
            $specs,
        ));

        return array_map(function (array $spec, int $index) use ($responses, $prompt, $garment) {
            $preview = $responses[$index] instanceof Response && $responses[$index]->successful()
                ? 'data:image/jpeg;base64,'.$responses[$index]->json('data.0.b64_json')
                : null;
            $main = $this->hex($spec['mainColor']);
            $secondary = $this->hex($spec['secondaryColor']);

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
                    'logoText' => mb_strtoupper(mb_substr($spec['logoText'], 0, 20)),
                    'number' => '23',
                    'backName' => mb_strtoupper(mb_substr($spec['logoText'], 0, 20)),
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
            .($back ? "back name and number (the name reads exactly \"{$logo}\" and the number reads \"{$number}\")" : "chest wordmark and crest (the wordmark reads exactly \"{$logo}\")")
            .'. Do not add, remove or change any text, logos or graphics. Make the fabric photoreal: fine knit and mesh texture, natural folds and drape, flatlock stitching, slight sheen on the print. Professional lighting with realistic shadows, ultra-detailed, no watermark, no UI.';

        $response = $this->send(fn () => $this->client()
            ->attach('image[]', $bytes, 'capture.'.($mime === 'image/png' ? 'png' : 'jpg'), ['Content-Type' => $mime])
            ->post(self::BASE.'/images/edits', [
                'model' => config('services.openai.image_model'),
                'prompt' => $prompt,
                'size' => '1536x1024',
                'quality' => 'medium',
                'output_format' => 'jpeg',
                'output_compression' => '88',
            ]));

        return base64_decode($this->firstImage($response->json()), true) ?: throw new RuntimeException('The AI returned an unreadable image.');
    }

    /**
     * One brief in, one finished HD presentation mockup out, the way people
     * use ChatGPT: front and back views with close-up detail panels. Logos the
     * user attaches are placed as the brief says; otherwise the garment wears
     * the 3DEEZI emblem and wordmark. Returns raw JPEG bytes.
     *
     * @param  array<int, string>  $references  data URLs (logos, sketches, photos)
     */
    public function mockup(string $brief, string $sport, string $garment, array $references = []): string
    {
        $references = array_slice($references, 0, 4);
        $count = count($references);
        $prompt = "You are a world-class sportswear designer making a client presentation mockup.\n"
            ."Sport: {$sport}. Garment: {$garment}.\nClient brief: {$brief}\n\n"
            .'Unless the brief asks for a different layout, angle or background, make one landscape presentation sheet: the garment shown flat-front on the left and from the back in the centre, '
            .'on invisible ghost mannequins against a soft light-grey seamless studio background with gentle shadows, plus a column of 4 square close-up detail panels on the right '
            .'(for example collar, raised logo, crest and fabric) each with a short uppercase caption underneath. '
            .'Photorealistic commercial product photography: real fabric with fine knit texture, natural folds, flatlock stitching, ribbed trims, crisp printed and raised logos. '
            .'All text must be spelled exactly as written in the brief. ';
        $prompt .= $count
            ? "The first {$count} attached image(s) come from the client: logos, references, or the client's own finished garment design (flat artwork, a sketch, a snapshot or a photo). "
                .'If one of them shows a complete garment design, make the garment exactly that design: the same colours, pattern, panels, collar, trims, logos, text and numbers, front and back as shown; '
                .'do not redesign or simplify it, just turn it into a real 3D garment presented as the brief asks. '
                .'Reproduce any logos faithfully and place them where the brief says, where the design shows them, or in sensible positions. '
                .'The last attached image is the 3DEEZI logo: use it only for the small neck label, unless the brief asks for 3DEEZI branding; leave it out when the client\'s design carries its own brand.'
            : 'The attached image is the 3DEEZI logo (emblem and wordmark). '
                .'If the brief gives any wordmark, team, club or brand name, use exactly that text where the brief says and do NOT put 3DEEZI on the chest; then use the 3DEEZI emblem only on the small neck label. '
                .'Only if the brief names no wordmark or brand at all, put the 3DEEZI wordmark across the chest and the 3DEEZI emblem as the crest, exactly as in the logo.';
        $prompt .= ' No watermarks, no extra brands.';

        $request = $this->client()->timeout(300);
        foreach ($references as $i => $reference) {
            [$mime, $bytes] = $this->decodeDataUrl($reference);
            $request = $request->attach('image[]', $bytes, "reference-{$i}.".explode('/', $mime)[1], ['Content-Type' => $mime]);
        }
        $request = $request->attach('image[]', file_get_contents(public_path('media/images/logo_full.png')), '3deezi-logo.png', ['Content-Type' => 'image/png']);

        $response = $this->send(fn () => $request->post(self::BASE.'/images/edits', [
            'model' => config('services.openai.image_model'),
            'prompt' => $prompt,
            'size' => '1536x1024',
            'quality' => 'high',
            'output_format' => 'jpeg',
            'output_compression' => '90',
        ]));

        return base64_decode($this->firstImage($response->json()), true) ?: throw new RuntimeException('The AI returned an unreadable image.');
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

        $response = $this->send(fn () => $request->post(self::BASE.'/images/edits', [
            'model' => config('services.openai.image_model'),
            'prompt' => $prompt,
            'size' => $size,
            // HD pictures (mockups, showcases) stay HD; smaller ones are edited faster.
            'quality' => max($dimensions[0], $dimensions[1]) >= 1400 ? 'high' : 'medium',
            'output_format' => $png ? 'png' : 'jpeg',
            ...($png ? [] : ['output_compression' => '90']),
        ]));

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
                'renderPrompt' => $string('Detailed visual description of the garment design for an image model: colours, panels, pattern, trims, collar, wordmark text and placement. Garment only.'),
                'patternMotif' => $string('The repeating print motif as a black-and-white pattern description, max 25 words. No colours.'),
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

    private function post(string $path, array $body): array
    {
        // An empty or non-JSON answer is a failed request too (callers fall back or show a message).
        return $this->send(fn () => $this->client()->post(self::BASE.$path, $body))->json()
            ?? throw new RuntimeException('The AI service sent an unexpected reply. Please try again.');
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
            throw new RuntimeException(match ($response->status()) {
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
