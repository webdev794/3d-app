<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Throwable;

/**
 * Address suggestions for the order forms' Street address (task TL-2, 2026-11-05): GET /api/v1/address/suggest?q=…
 * through the free, no-key Photon geocoder by komoot (OpenStreetMap data). The answers are kept for 30 days, the
 * whole site asks Photon at most twice a second (fair use), and a proper User-Agent names us. Australia / New Zealand
 * first; a search with nothing there tries anywhere. Any failure answers an empty list, so manual typing still works.
 */
class AddressController extends Controller
{
    public const ENDPOINT = 'https://photon.komoot.io/api/';

    /** Australia and New Zealand (west, south, east, north). */
    public const AU_NZ_BOX = '112,-48,179,-9';

    private const STATES = [
        'australian capital territory' => 'ACT', 'new south wales' => 'NSW', 'northern territory' => 'NT',
        'queensland' => 'QLD', 'south australia' => 'SA', 'tasmania' => 'TAS', 'victoria' => 'VIC',
        'western australia' => 'WA',
    ];

    public function suggest(Request $request): JsonResponse
    {
        $q = trim(preg_replace('/\s+/', ' ', (string) $request->query('q', '')));
        if (mb_strlen($q) < 3 || mb_strlen($q) > 200) {
            return response()->json(['data' => []]);
        }
        $key = 'address-suggest:'.sha1(mb_strtolower($q));
        $cached = Cache::get($key);
        if (is_array($cached)) {
            return response()->json(['data' => $cached]);
        }
        try {
            $items = $this->ask($q, true);
            if ($items === null) {
                return response()->json(['data' => []]);
            }
            if ($items === []) {
                $items = $this->ask($q, false) ?? [];
            }
        } catch (Throwable) {
            return response()->json(['data' => []]);
        }
        Cache::put($key, $items, now()->addDays(30));

        return response()->json(['data' => $items]);
    }

    /** Photon's places for $q as our address fields (null: busy or failed, not kept). */
    private function ask(string $q, bool $auNz): ?array
    {
        // Fair use: at most two requests a second from the whole site.
        if (! RateLimiter::attempt('photon-global', 2, fn () => true, 1)) {
            return null;
        }
        $query = ['q' => $q, 'limit' => 6, 'lang' => 'en', 'lat' => -30, 'lon' => 150];
        if ($auNz) {
            $query['bbox'] = self::AU_NZ_BOX;
        }
        $response = Http::timeout(6)
            ->withHeaders(['User-Agent' => '3DEEZI order form address lookup (+'.config('app.url').'; '.config('mail.from.address').')'])
            ->acceptJson()
            ->get(self::ENDPOINT, $query);
        if (! $response->successful()) {
            return null;
        }
        $items = [];
        foreach ((array) $response->json('features', []) as $feature) {
            $item = self::fields((array) ($feature['properties'] ?? []));
            if ($item && ! in_array($item['label'], array_column($items, 'label'), true)) {
                $items[] = $item;
            }
        }

        return array_slice($items, 0, 5);
    }

    /** One Photon place as {label, street, suburb, state, postcode, country}, or null for a whole country / state. */
    public static function fields(array $p): ?array
    {
        $country = trim((string) ($p['country'] ?? ''));
        $street = trim(trim((string) ($p['housenumber'] ?? '')).' '.trim((string) ($p['street'] ?? '')));
        $type = (string) ($p['type'] ?? '');
        $name = trim((string) ($p['name'] ?? ''));
        if ($street === '' && $name !== '' && ! in_array($type, ['city', 'district', 'locality', 'county', 'state', 'country'], true)) {
            $street = $name;
        }
        $suburb = trim((string) ($p['district'] ?? $p['city'] ?? $p['locality'] ?? ''));
        if ($suburb === '' && in_array($type, ['city', 'district', 'locality'], true)) {
            $suburb = $name;
        }
        if ($suburb === '' && $street === '') {
            return null;
        }
        $state = trim((string) ($p['state'] ?? ''));
        if (strtoupper((string) ($p['countrycode'] ?? '')) === 'AU') {
            $state = self::STATES[mb_strtolower($state)] ?? $state;
        }
        $postcode = trim((string) ($p['postcode'] ?? ''));
        $label = implode(', ', array_filter([$street, trim($suburb.' '.$state.' '.$postcode), $country]));

        return compact('label', 'street', 'suburb', 'state', 'postcode', 'country');
    }
}
