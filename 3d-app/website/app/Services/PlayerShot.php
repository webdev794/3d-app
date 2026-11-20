<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * "See it on a player" (tasks.md 9.128 C): the user's kit worn by a realistic athlete in the sport's own setting.
 * The kit pictures (3D front and back captures, or an AI design picture) go to the image edit model as the
 * reference, so the colours, print, crest and lettering stay the same.
 */
class PlayerShot
{
    private const BASE = 'https://api.openai.com/v1';

    public const POSES = [
        'front' => 'standing facing the camera in a confident hero pose, full upper body and thighs in frame, the whole front of the kit clearly visible',
        'action' => 'in a dynamic game-action moment typical of the sport, sharp motion, the kit clearly visible and in focus',
        'team' => 'in a team photo: the player in the front centre with three or four team-mates behind, every player wearing the identical kit',
    ];

    public const PLAYERS = ['male', 'female'];

    /** The sport's own setting, by keyword in the sport or garment name. */
    public static function setting(string $sport, string $garment = ''): string
    {
        $s = strtolower($sport.' '.$garment);
        $map = [
            'netball' => 'on an indoor netball court with painted court lines and a netball hoop behind, arena lighting',
            'rugby' => 'on a green rugby field with white rugby posts behind, floodlit stadium crowd softly blurred',
            'afl' => 'on an oval Australian rules football ground with tall goal posts, floodlit stands blurred',
            'american' => 'on an American football field with yard lines and goal posts, stadium lights',
            'football' => 'on a football (soccer) pitch with a goal net behind, floodlit stadium blurred',
            'soccer' => 'on a football (soccer) pitch with a goal net behind, floodlit stadium blurred',
            'basketball' => 'on an indoor basketball court with a hoop and hardwood floor, arena lighting',
            'hockey' => 'on a blue artificial hockey turf with a hockey goal, floodlights',
            'cricket' => 'on a cricket ground with the pitch and stumps, stadium under lights',
            'tennis' => 'on a tennis court with the net behind, bright daylight',
            'golf' => 'on a golf course fairway with the green behind, soft daylight',
            'athletic' => 'on a red running track in an athletics stadium',
            'swim' => 'on a pool deck beside an indoor swimming pool with lane ropes',
            'cycling' => 'on a scenic road with a road bike, soft daylight',
            'bmx' => 'at a BMX race track with dirt jumps and a start gate',
            'volleyball' => 'on an indoor volleyball court with the net behind',
            'softball' => 'on a softball diamond with the infield behind',
            'baseball' => 'on a baseball diamond with the infield behind',
            'lacrosse' => 'on a lacrosse field with a goal behind',
            'touch' => 'on a grass touch football field under floodlights',
            'darts' => 'in a darts and pool bar with a dartboard and pool table behind, warm lighting',
            'bowls' => 'on a lawn bowls green on a sunny day',
            'esports' => 'in an esports arena with gaming PCs and RGB lighting',
            'fight' => 'in a combat gym with an octagon cage behind',
            'fishing' => 'on a boat at sea on a sunny day',
            'workwear' => 'at a work site with a warehouse behind, daylight',
            'gym' => 'in a modern gym with weights and racks behind',
            'training' => 'on a training ground with cones and goals behind',
        ];
        foreach ($map as $key => $place) {
            if (str_contains($s, $key)) {
                return $place;
            }
        }

        return 'in a modern sports venue with soft natural light';
    }

    /** Netball dresses are worn by women; otherwise the user's choice. */
    public static function player(string $asked, string $garment): string
    {
        return str_contains(strtolower($garment), 'dress') ? 'female' : (in_array($asked, self::PLAYERS, true) ? $asked : 'male');
    }

    /**
     * A hex colour in plain words ("#240c12" → "near-black burgundy"). The image model reads a bare hex code
     * loosely, so every colour goes with its name (bug 2026-10-27, images/193.jpg: the codes alone came out as a
     * pink-to-purple gradient body with cream sleeves).
     */
    public static function colourName(string $hex): string
    {
        $hex = ltrim(trim($hex), '#');
        if (! preg_match('/^[0-9a-f]{6}$/i', $hex)) {
            return 'colour';
        }
        [$r, $g, $b] = array_map(fn (int $i) => hexdec(substr($hex, $i, 2)) / 255, [0, 2, 4]);
        $max = max($r, $g, $b);
        $min = min($r, $g, $b);
        $d = $max - $min;
        $l = ($max + $min) / 2;
        $s = $d == 0 ? 0 : $d / (1 - abs(2 * $l - 1));
        if ($d < 0.06 || $s < 0.12) {
            return match (true) {
                $l < 0.1 => 'black', $l < 0.22 => 'near-black charcoal', $l < 0.42 => 'dark grey',
                $l < 0.68 => 'grey', $l < 0.9 => 'light grey', default => 'white',
            };
        }
        $h = match (true) {
            $max == $r => 60 * fmod(($g - $b) / $d + 6, 6),
            $max == $g => 60 * (($b - $r) / $d + 2),
            default => 60 * (($r - $g) / $d + 4),
        };
        $hue = match (true) {
            $h < 10 || $h >= 338 => $l > 0.55 ? 'pinkish red' : 'red', $h < 20 => 'red-orange', $h < 40 => 'orange',
            $h < 52 => 'gold', $h < 66 => 'yellow', $h < 90 => 'lime green', $h < 150 => 'green',
            $h < 172 => 'teal green', $h < 195 => 'cyan', $h < 215 => 'sky blue', $h < 240 => 'blue',
            $h < 258 => 'indigo', $h < 290 => 'purple', $h < 320 => 'magenta', default => 'pink',
        };
        $reds = in_array($hue, ['red', 'pinkish red', 'pink', 'magenta'], true);
        $blues = in_array($hue, ['blue', 'indigo', 'sky blue'], true);
        $warm = in_array($hue, ['red-orange', 'orange', 'gold', 'yellow'], true);
        if ($l < 0.12) {
            return 'near-black '.($reds ? 'burgundy' : ($blues ? 'navy' : $hue));
        }
        if ($l < 0.3) {
            return match (true) {
                $reds => 'dark burgundy', $blues => 'navy', $warm => 'dark brown', default => "dark {$hue}",
            };
        }
        if ($warm && $l < 0.38) {
            return 'brown';
        }
        if ($l > 0.85) {
            return match (true) {
                $warm => 'cream', $reds => 'pale pink', default => "very pale {$hue}",
            };
        }
        if ($l > 0.7) {
            return $reds ? 'light pink' : "light {$hue}";
        }

        return ($s > 0.7 ? 'bright ' : ($s < 0.35 ? 'muted ' : '')).($l < 0.4 ? 'deep ' : '').$hue;
    }

    /** The kit's colour list ("body: #240c12", …) with every hex code named in words. */
    public static function namedColours(array $colours): array
    {
        $named = array_map(fn ($c) => preg_replace_callback('/#[0-9a-f]{6}\b/i', fn (array $m) => strtolower($m[0]).' ('.self::colourName($m[0]).')', trim((string) $c)), $colours);

        return array_values(array_filter($named, fn ($c) => $c !== ''));
    }

    /** What the garment covers: 'top', 'full' (top and shorts), 'shorts' or 'dress'. */
    public static function coverage(string $garment): string
    {
        $g = strtolower($garment);

        return match (true) {
            (bool) preg_match('/full ?kit/', $g) => 'full',
            str_contains($g, 'dress') => 'dress',
            (bool) preg_match('/\bshorts\b/', $g) => 'shorts',
            default => 'top',
        };
    }

    /**
     * The kit to copy: its colours by area in words, then the lettering. The Studio's 3D renders (two pictures) are
     * lit by blue and pink stadium light, which is not part of the kit; one AI picture shows the design in a studio.
     */
    private static function kitSection(array $meta, int $pictures): string
    {
        $colours = self::namedColours((array) ($meta['colours'] ?? []));
        $renders = $pictures > 1;
        $logo = mb_strtoupper(trim((string) ($meta['logoText'] ?? '')));

        return ($colours
                ? 'THE KIT, to copy exactly: '.implode('; ', $colours).'. These are its true colours: use each one only for its own area, and take the pattern\'s shape and placement, the trims, the crest and the logos from the kit pictures'
                : 'THE KIT, to copy exactly: take its colours, pattern, trims, crest and logos from the kit picture')
            .($renders ? '. The kit pictures are 3D renders under coloured stadium lights: the blue and pink light, the dark backdrop and the podium are not part of the kit' : '')
            .'. No other colours, no gradients or patterns that the kit does not have. '
            .'Lettering: the same crest and logos in the same places'
            .($logo ? ", the team wordmark on the chest reads exactly \"{$logo}\"" : '')
            .self::badge($pictures);
    }

    /** The back's name and number, when the back may be seen. */
    private static function backLettering(array $meta, string $lead): string
    {
        $logo = mb_strtoupper(trim((string) ($meta['logoText'] ?? '')));
        $back = mb_strtoupper(trim((string) ($meta['backName'] ?? ''))) ?: $logo;
        $number = trim((string) ($meta['number'] ?? ''));

        return $back ? "{$lead} reads exactly \"{$back}\"".($number ? " with the number \"{$number}\"" : '') : '';
    }

    public static function prompt(array $meta, int $pictures): string
    {
        $player = self::player((string) ($meta['player'] ?? 'male'), (string) $meta['garment']);
        $pose = self::POSES[$meta['pose'] ?? 'front'] ?? self::POSES['front'];
        $refs = $pictures > 1 ? 'The reference images show the front and the back of the garment; they are only references for the design: make ONE single photograph, never a collage, split image or two panels.' : 'The reference image shows the garment design.';
        // Only the user's garment carries the design (images/193.jpg: invented kit shorts and socks).
        $wear = match (self::coverage((string) $meta['garment'])) {
            'full' => 'The kit is the top and the matching shorts, both as in the kit pictures, with plain socks.',
            'dress' => 'The dress is the whole kit, with plain socks.',
            'shorts' => 'Only the shorts are the user\'s design: the athlete wears them with a plain top in a simple matching solid colour, with no logos, numbers or graphics on it.',
            default => "Only the {$meta['garment']} is the user's design: the athlete wears it with plain shorts and socks in a simple matching solid colour, with no logos, numbers or graphics on them.",
        };

        return "A premium photorealistic sports photograph of a real {$player} athlete wearing this exact {$meta['sport']} {$meta['garment']}, {$pose}, "
            .self::setting((string) $meta['sport'], (string) $meta['garment']).". {$refs} "
            .self::kitSection($meta, $pictures)
            .(($meta['pose'] ?? '') !== 'front' ? self::backLettering($meta, ', where the back shows the lettering') : '')
            .". {$wear} "
            .'Do not add, remove or change any text, logos or graphics; do not invent sponsors. The garment fits the athlete naturally with real fabric folds, stitching and slight sheen. '
            .'A believable athlete with a natural face and body, professional sports photography, sharp focus on the kit, cinematic lighting, shallow depth of field, ultra-detailed, no watermark, no UI, no text overlays.';
    }

    /**
     * The 3D front and back captures (two pictures) wear the 3DEEZI "3D" shield unless the club has a logo:
     * named so it is not misread as "30". A single AI design picture has its own crest.
     */
    private static function badge(int $pictures): string
    {
        return $pictures > 1 ? ', '.ProductMockup::BADGE : '';
    }

    /**
     * The user's own photo: dress that person in the kit, keeping everything else. Only the clothes the garment
     * covers change (a jersey: the top; their own shorts, socks and shoes stay), and nothing of their old clothes
     * carries over (bug 2026-10-27, images/193.jpg: purple kit shorts and socks were invented).
     */
    public static function personPrompt(array $meta, int $kitPictures): string
    {
        $garment = (string) $meta['garment'];
        [$swap, $keep] = match (self::coverage($garment)) {
            'full' => ["replace their top with the kit's top and their shorts or trousers with the kit's matching shorts", ', and their own socks and shoes'],
            'dress' => ['replace their top and their shorts, trousers or skirt with the kit dress', ', and their own socks and shoes'],
            'shorts' => ['replace ONLY their shorts or trousers with the kit shorts', ', and their own top, socks and shoes'],
            default => ["replace ONLY their top (shirt, jersey or jacket) with the kit {$garment}", ', and their own shorts or trousers, socks and shoes (do not turn them into kit shorts or socks, do not add a number or logo to them)'],
        };

        return 'Image 1 is a photo of a real person. '.($kitPictures > 1 ? 'Images 2 and 3 show the front and back' : 'Image 2 shows the design')
            ." of a {$meta['sport']} {$garment} (the kit). Edit image 1 only: {$swap}, worn naturally and fitted to their body and pose. "
            ."Keep the person's face, identity, skin, hair, body shape, pose, hands, framing, lighting and background exactly as in image 1{$keep}; change nothing else. "
            .'Ignore the clothes the person wears in image 1: none of their colours, logos, badges, numbers or patterns may appear on the kit. '
            .self::kitSection($meta, $kitPictures)
            .self::backLettering($meta, ', any visible back lettering')
            .'. Do not add, remove or change any text, logos or graphics. Real fabric folds and stitching, photoreal, ONE single photograph (not a collage), no watermark, no text overlays.';
    }

    /** A cheap look at the upload: is it a photo of a real person? */
    public function isPerson(string $photo): bool
    {
        $answer = app(OpenAiDesigner::class)->respondJson(
            'You check uploads for a clothing try-on. Answer whether the image is a photograph of a real person (at least the upper body visible).',
            [['role' => 'user', 'content' => [['type' => 'input_text', 'text' => 'Is this a photo of a real person?'], ['type' => 'input_image', 'image_url' => $photo]]]],
            'person_check',
            ['type' => 'object', 'properties' => ['person' => ['type' => 'boolean']], 'required' => ['person'], 'additionalProperties' => false],
            100,
        );

        return (bool) ($answer['person'] ?? false);
    }

    /**
     * @param  array<int, string>  $images  data URLs: front first, then back; with a person photo it goes first
     * @return string raw JPEG bytes
     */
    public function make(array $images, array $meta, ?string $person = null): string
    {
        $files = [];
        foreach ([...($person ? [$person] : []), ...array_slice($images, 0, 2)] as $url) {
            if (! preg_match('#^data:(image/(?:png|jpeg|webp));base64,(.+)$#s', $url, $m)) {
                throw new RuntimeException('The kit picture must be a PNG, JPEG or WebP image.');
            }
            $files[] = [$m[1], base64_decode($m[2], true) ?: throw new RuntimeException('The kit picture could not be read.')];
        }
        $prompt = $person ? self::personPrompt($meta, count($files) - 1) : self::prompt($meta, count($files));
        $size = ($meta['pose'] ?? '') === 'team' ? '1536x1024' : '1024x1536';
        if ($person) {
            // The person's own photo keeps its shape.
            [$w, $h] = @getimagesizefromstring($files[0][1]) ?: [2, 3];
            $size = $w > $h * 1.15 ? '1536x1024' : ($h > $w * 1.15 ? '1024x1536' : '1024x1024');
        }
        $model = (string) config('services.openai.image_model') ?: OpenAiDesigner::SAFE_IMAGE_MODEL;

        $post = function (string $model, bool $fidelity) use ($files, $prompt, $size) {
            $request = Http::withToken((string) config('services.openai.key'))->timeout(300)->acceptJson();
            foreach ($files as $i => [$mime, $bytes]) {
                $request = $request->attach('image[]', $bytes, "kit-{$i}.".explode('/', $mime)[1], ['Content-Type' => $mime]);
            }
            try {
                return $request->post(self::BASE.'/images/edits', [
                    'model' => $model, 'prompt' => $prompt, 'size' => $size, 'quality' => 'medium',
                    'output_format' => 'jpeg', 'output_compression' => '88',
                    ...($fidelity ? ['input_fidelity' => 'high'] : []),
                ]);
            } catch (ConnectionException $e) {
                Log::warning('Player shot: '.$e->getMessage());
                throw new RuntimeException('Could not reach the AI service. Please try again.');
            }
        };
        $response = $post($model, OpenAiDesigner::takesInputFidelity($model));
        if ($response->failed() && $response->status() === 400 && $model !== OpenAiDesigner::SAFE_IMAGE_MODEL
            && preg_match('/model|parameter|input_fidelity/i', (string) $response->json('error.message'))) {
            Log::warning("Player shot: {$model} turned down ({$response->json('error.message')}); retried with ".OpenAiDesigner::SAFE_IMAGE_MODEL);
            $response = $post(OpenAiDesigner::SAFE_IMAGE_MODEL, true);
        }
        if ($response->failed()) {
            throw new RuntimeException(match ($response->status()) {
                401 => 'The server\'s AI key was rejected.',
                429 => 'AI usage limit reached. Please try again shortly.',
                default => 'AI error: '.($response->json('error.message') ?? $response->status()),
            });
        }
        $b64 = $response->json('data.0.b64_json') ?? throw new RuntimeException('No image came back. Please try again.');

        return base64_decode($b64, true) ?: throw new RuntimeException('The AI returned an unreadable image.');
    }
}
