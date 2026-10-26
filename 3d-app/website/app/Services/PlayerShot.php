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

    public static function prompt(array $meta, int $pictures): string
    {
        $player = self::player((string) ($meta['player'] ?? 'male'), (string) $meta['garment']);
        $pose = self::POSES[$meta['pose'] ?? 'front'] ?? self::POSES['front'];
        // In capitals, as the 3D kit draws the wordmark and the back name.
        $logo = mb_strtoupper(trim((string) ($meta['logoText'] ?? '')));
        $back = mb_strtoupper(trim((string) ($meta['backName'] ?? ''))) ?: $logo;
        $number = trim((string) ($meta['number'] ?? ''));
        $colours = implode(', ', array_filter((array) ($meta['colours'] ?? [])));
        $refs = $pictures > 1 ? 'The reference images show the front and the back of the garment; they are only references for the design: make ONE single photograph, never a collage, split image or two panels.' : 'The reference image shows the garment design.';

        return "A premium photorealistic sports photograph of a real {$player} athlete wearing this exact {$meta['sport']} {$meta['garment']}, {$pose}, "
            .self::setting((string) $meta['sport'], (string) $meta['garment']).'. '
            ."{$refs} Reproduce the garment EXACTLY as in the reference: the same colours"
            .($colours ? " ({$colours})" : '')
            .', the same panel layout, print pattern and graphics, collar and trims, the same crest and logos in the same places'
            .($logo ? ", the team wordmark on the chest reads exactly \"{$logo}\"" : '')
            .self::badge($pictures)
            .($back && ($meta['pose'] ?? '') !== 'front' ? ", where the back shows the lettering reads exactly \"{$back}\"".($number ? " with the number \"{$number}\"" : '') : '')
            .'. Do not add, remove or change any text, logos or graphics; do not invent sponsors. The garment fits the athlete naturally with real fabric folds, stitching and slight sheen. '
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

    /** The user's own photo: dress that person in the kit, keeping everything else. */
    public static function personPrompt(array $meta, int $kitPictures): string
    {
        $logo = mb_strtoupper(trim((string) ($meta['logoText'] ?? '')));
        $back = mb_strtoupper(trim((string) ($meta['backName'] ?? ''))) ?: $logo;
        $number = trim((string) ($meta['number'] ?? ''));
        $colours = implode(', ', array_filter((array) ($meta['colours'] ?? [])));
        $full = preg_match('/full ?kit/i', (string) $meta['garment']);

        return 'Image 1 is a photo of a real person. '.($kitPictures > 1 ? 'Images 2 and 3 show the front and back' : 'Image 2 shows the design')
            ." of a {$meta['sport']} {$meta['garment']}. Edit image 1 only: replace the person's clothing with this exact garment"
            .($full ? ' (the top and the matching shorts)' : '').', worn naturally and fitted to their body and pose. '
            ."Keep the person's face, identity, skin, hair, body shape, pose, hands, framing, lighting and background exactly as in image 1; change nothing else. "
            .'Reproduce the garment EXACTLY: the same colours'.($colours ? " ({$colours})" : '')
            .', panel layout, print pattern and graphics, collar and trims, the same crest and logos in the same places'
            .($logo ? ", the team wordmark on the chest reads exactly \"{$logo}\"" : '')
            .self::badge($kitPictures)
            .($back ? ", any visible back lettering reads exactly \"{$back}\"".($number ? " with the number \"{$number}\"" : '') : '')
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
