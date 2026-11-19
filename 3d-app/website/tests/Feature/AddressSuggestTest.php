<?php

namespace Tests\Feature;

use App\Http\Controllers\AddressController;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/** Street address suggestions (task TL-2): Photon through our server, AU / NZ first, cached, empty on any failure. */
class AddressSuggestTest extends TestCase
{
    private function photon(array $features): array
    {
        return ['type' => 'FeatureCollection', 'features' => array_map(fn ($p) => ['type' => 'Feature', 'properties' => $p], $features)];
    }

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        RateLimiter::clear('photon-global');
    }

    public function test_a_suggestion_fills_every_address_field_with_the_australian_state_short(): void
    {
        Http::fake(['photon.komoot.io/*' => Http::response($this->photon([[
            'type' => 'house', 'housenumber' => '7', 'street' => 'Marabou Close', 'district' => 'Narre Warren South',
            'city' => 'Melbourne', 'state' => 'Victoria', 'country' => 'Australia', 'postcode' => '3805', 'countrycode' => 'AU',
        ]]))]);

        $this->getJson('/api/v1/address/suggest?q=7 Marabou Close')->assertOk()->assertExactJson(['data' => [[
            'label' => '7 Marabou Close, Narre Warren South VIC 3805, Australia', 'street' => '7 Marabou Close',
            'suburb' => 'Narre Warren South', 'state' => 'VIC', 'postcode' => '3805', 'country' => 'Australia',
        ]]]);
        Http::assertSent(fn (ClientRequest $r) => str_contains($r->url(), 'bbox='.urlencode(AddressController::AU_NZ_BOX))
            && str_contains($r->header('User-Agent')[0] ?? '', '3DEEZI'));
    }

    public function test_answers_are_cached_and_short_queries_never_ask(): void
    {
        Http::fake(['photon.komoot.io/*' => Http::response($this->photon([['type' => 'city', 'name' => 'Rotorua', 'state' => 'Bay of Plenty', 'country' => 'New Zealand', 'countrycode' => 'NZ']]))]);

        $this->getJson('/api/v1/address/suggest?q=ab')->assertExactJson(['data' => []]);
        $this->getJson('/api/v1/address/suggest?q=Rotorua')->assertOk()->assertJsonPath('data.0.suburb', 'Rotorua');
        RateLimiter::clear('photon-global');
        $this->getJson('/api/v1/address/suggest?q=ROTORUA')->assertJsonPath('data.0.country', 'New Zealand');
        Http::assertSentCount(1);
    }

    public function test_nothing_in_australia_or_new_zealand_tries_anywhere(): void
    {
        Http::fakeSequence('photon.komoot.io/*')
            ->push($this->photon([]))
            ->push($this->photon([['type' => 'house', 'housenumber' => '1', 'street' => 'Main Road', 'city' => 'Suva', 'country' => 'Fiji', 'countrycode' => 'FJ']]));

        $this->getJson('/api/v1/address/suggest?q=1 Main Road Suva')->assertJsonPath('data.0.suburb', 'Suva');
        Http::assertSentCount(2);
    }

    public function test_the_service_down_answers_an_empty_list_and_is_not_cached(): void
    {
        Http::fake(['photon.komoot.io/*' => Http::response('busy', 503)]);
        $this->getJson('/api/v1/address/suggest?q=12 Smith Street')->assertOk()->assertExactJson(['data' => []]);
        $this->assertNull(Cache::get('address-suggest:'.sha1('12 smith street')));
    }
}
