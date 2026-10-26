<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\OpenAiDesigner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * "Open in 3D Designer" (task 9.116, client 2026-10-23): the AI picture is read for the nearest 3D garment we have and
 * its own colours, pattern, team name and lettering (netball: the position letters). OpenAI is faked.
 */
class AiOpenIn3dTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    private function reading(array $over = []): array
    {
        return [
            'seen' => 'soccer jersey', 'garment' => 'jersey', 'exact' => true, 'hood' => false,
            'mainColor' => '#0b6e3a', 'secondaryColor' => '#ffffff', 'accentColor' => '#f5c400', 'pattern' => 'Stripes',
            'patternMotif' => 'thin pinstripes', 'teamName' => 'Green Hawks', 'backName' => 'HAWKS', 'number' => '10',
            'positionLetters' => '', 'crest' => ['found' => true, 'x0' => 0.55, 'y0' => 0.22, 'x1' => 0.63, 'y1' => 0.3],
            ...$over,
        ];
    }

    private function fake(array $reading): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/v1/responses' => Http::response(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode($reading)]]]]])]);
    }

    public function test_a_soccer_jersey_opens_on_the_jersey_in_the_pictures_own_colours(): void
    {
        $this->fake($this->reading());
        Sanctum::actingAs(User::factory()->create());

        $data = $this->postJson('/api/v1/ai/designs/read', ['image' => self::PNG, 'sport' => 'football', 'garment' => 'jersey'])->assertOk()->json('data');

        $this->assertSame('jersey', $data['garment']);
        $this->assertTrue($data['exact']);
        $this->assertSame(['garment' => 'jersey', 'main' => '#0B6E3A', 'secondary' => '#FFFFFF', 'accent' => '#F5C400', 'pattern' => 'Stripes', 'logoText' => 'GREEN HAWKS', 'backName' => 'HAWKS', 'number' => '10'], array_intersect_key($data['design'], array_flip(['garment', 'main', 'secondary', 'accent', 'pattern', 'logoText', 'backName', 'number'])));
        $this->assertSame('thin pinstripes', $data['motif']);
        $this->assertEqualsWithDelta(0.08, $data['crest']['w'], 0.0001);
        $this->assertArrayNotHasKey('marks', $data['design']);
        // The picture, the sport's name and the garment list go to the planning model.
        Http::assertSent(function (Request $r) {
            $content = $r['input'][1]['content'];

            return $content[1]['image_url'] === self::PNG && str_contains($content[0]['text'], 'Football garment') && str_contains($content[0]['text'], 'netball dresses')
                && $r['text']['format']['schema']['properties']['garment']['enum'] === array_keys(OpenAiDesigner::READ_GARMENTS);
        });
    }

    public function test_a_netball_dress_opens_on_the_singlet_with_position_letters_and_no_name(): void
    {
        $this->fake($this->reading(['seen' => 'netball dress', 'garment' => 'singlet', 'exact' => false, 'teamName' => '3DEEZI', 'backName' => '', 'number' => '', 'positionLetters' => 'gs', 'crest' => ['found' => false, 'x0' => 0, 'y0' => 0, 'x1' => 0, 'y1' => 0]]));
        Sanctum::actingAs(User::factory()->create());

        $data = $this->postJson('/api/v1/ai/designs/read', ['image' => self::PNG, 'sport' => 'netball', 'garment' => 'singlet'])->assertOk()->json('data');

        $this->assertSame('singlet', $data['garment']);
        $this->assertFalse($data['exact']);
        $this->assertSame('netball dress', $data['seen']);
        $this->assertNull($data['crest']);
        $this->assertSame('', $data['design']['backName']);
        $this->assertSame('GS', $data['design']['number']);
        // No team name in the picture: the chest wordmark is hidden (never 3DEEZI on the front), the back shows no name.
        $this->assertSame(['top_name' => ['hidden' => true], 'top_wordmark' => ['hidden' => true]], $data['design']['marks']);
        $this->assertSame('GS', $data['design']['layers'][0]['text']);
        $this->assertSame('front', $data['design']['layers'][0]['side']);
    }

    public function test_a_reading_never_refuses_and_saves_as_a_project(): void
    {
        // An unknown garment or bad colours fall back to the one asked for and safe colours; a hooded track top keeps its hood.
        $odd = OpenAiDesigner::designFromReading(['garment' => 'dress', 'mainColor' => 'green', 'positionLetters' => 'XX'], 'Netball', 'singlet');
        $this->assertSame('singlet', $odd['garment']);
        $this->assertSame('#0B1016', $odd['design']['main']);
        $this->assertSame('GS', $odd['design']['number']);
        $track = OpenAiDesigner::designFromReading($this->reading(['garment' => 'trackjacket', 'hood' => true, 'number' => '']), 'Rugby League', 'jersey');
        $this->assertSame('hood', $track['design']['trackStyle']);
        $this->assertSame('23', $track['design']['number']);

        // The netball design saves as a project as it is.
        Sanctum::actingAs(User::factory()->create());
        $net = OpenAiDesigner::designFromReading($this->reading(['garment' => 'singlet', 'positionLetters' => 'WD', 'teamName' => '']), 'Netball', 'singlet');
        $this->postJson('/api/v1/projects', ['name' => 'Netball', 'sport' => 'netball', 'garment' => 'singlet', 'mode' => 'ai', 'design' => $net['design']])->assertCreated()
            ->assertJsonPath('data.design.number', 'WD')->assertJsonPath('data.design.layers.0.text', 'WD');
    }

    public function test_a_print_sheet_with_the_front_and_back_touching_is_moved_apart(): void
    {
        $sheet = function (bool $touching): string {
            $im = imagecreatetruecolor(300, 200);
            imagefill($im, 0, 0, imagecolorallocate($im, 255, 255, 255));
            $green = imagecolorallocate($im, 10, 120, 40);
            imagefilledrectangle($im, 20, 30, $touching ? 150 : 130, 180, $green);
            imagefilledrectangle($im, $touching ? 150 : 170, 30, 280, 180, $green);
            ob_start();
            imagejpeg($im, null, 95);

            return (string) ob_get_clean();
        };
        $apart = $sheet(false);
        $this->assertSame($apart, OpenAiDesigner::separateHalves($apart), 'a sheet with a gap is kept as it is');
        $fixed = imagecreatefromstring(OpenAiDesigner::separateHalves($sheet(true)));
        $this->assertSame(300 + 24, imagesx($fixed));
        // The middle is white now, the two halves either side.
        $this->assertGreaterThan(230, (imagecolorat($fixed, 162, 100) >> 8) & 255);
        $this->assertLessThan(160, (imagecolorat($fixed, 140, 100) >> 16) & 255);
        $this->assertLessThan(160, (imagecolorat($fixed, 190, 100) >> 16) & 255);
        $this->assertStringContainsString('never touch or overlap', OpenAiDesigner::printSheetPrompt('Football', 'Jersey'));
    }

    public function test_reading_needs_a_login_a_key_and_a_picture(): void
    {
        $this->postJson('/api/v1/ai/designs/read', ['image' => self::PNG, 'sport' => 'football', 'garment' => 'jersey'])->assertUnauthorized();
        Sanctum::actingAs(User::factory()->create());
        config(['services.openai.key' => null]);
        $this->postJson('/api/v1/ai/designs/read', ['image' => self::PNG, 'sport' => 'football', 'garment' => 'jersey'])->assertStatus(503);
        config(['services.openai.key' => 'sk-test']);
        $this->postJson('/api/v1/ai/designs/read', ['image' => 'not a picture', 'sport' => 'football', 'garment' => 'jersey'])->assertUnprocessable();
    }
}
