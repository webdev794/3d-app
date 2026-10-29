<?php

namespace Tests\Feature;

use App\Http\Controllers\AiController;
use Tests\TestCase;

/** The sports and apparel categories (config/catalog.php, task 9.79, 2026-10-21). */
class SportsCatalogTest extends TestCase
{
    public function test_every_category_has_a_group_garments_and_its_pictures(): void
    {
        $sports = config('catalog.sports');
        $garments = array_column(config('catalog.garments'), 'id');
        $this->assertGreaterThanOrEqual(29, count($sports));
        $this->assertSame(count($sports), count(array_unique(array_column($sports, 'id'))));
        // The old ids stay, in their old order at the front.
        $this->assertSame(['rugby-league', 'rugby-union', 'football', 'basketball', 'netball', 'afl', 'hockey'], array_slice(array_column($sports, 'id'), 0, 7));
        foreach (['training', 'american-football', 'golf', 'tennis', 'athletics', 'swimming', 'darts', 'fight-wear', 'fishing', 'workwear'] as $id) {
            $this->assertContains($id, array_column($sports, 'id'));
        }
        foreach ($sports as $sport) {
            $this->assertContains($sport['group'], ['sports', 'apparel'], $sport['id']);
            $this->assertNotEmpty($sport['garments'], $sport['id']);
            foreach ($sport['garments'] as $garment) {
                $this->assertContains($garment, $garments, "{$sport['id']}: {$garment}");
            }
            $this->assertFileExists(public_path("media/showroom/kit-{$sport['id']}.webp"));
            $this->assertFileExists(public_path("media/images/ai-designer/sport-{$sport['id']}.webp"));
        }
        // Worked out from the sport's garment tiles (task 9.99).
        $this->assertSame(['pocketpolo', 'polo', 'tee', 'hoodie', 'ziphoodie'], collect($sports)->firstWhere('id', 'darts')['garments']);
    }

    public function test_the_ai_gets_the_style_hint_and_old_sports_read_as_before(): void
    {
        $this->assertSame('Rugby League', AiController::sportForAi('rugby-league'));
        $this->assertStringStartsWith('Golf (golf: a premium fitted performance polo', AiController::sportForAi('golf'));
        $this->assertStringContainsString('big block numbers', AiController::sportForAi('american-football'));
    }

    public function test_the_public_catalogue_lists_them_with_their_garments(): void
    {
        $this->getJson('/api/v1/catalog')->assertOk()
            ->assertJsonPath('data.sports.7.id', 'american-football')
            ->assertJsonPath('data.sports.7.garments.0', 'fullkit')->assertJsonPath('data.sports.7.garments.1', 'nfljersey'); // the client's list starts with Game Kit (images/165.jpg)
    }
}
