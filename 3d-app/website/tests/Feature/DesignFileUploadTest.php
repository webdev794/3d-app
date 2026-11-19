<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\DesignFiles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** AI Designer uploads (client 2026-11-02, picture 295.jpg): design files as well as pictures, the original kept. */
class DesignFileUploadTest extends TestCase
{
    use RefreshDatabase;

    private const PDF = "%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n";

    private function png(int $w = 40, int $h = 30): string
    {
        $im = imagecreatetruecolor($w, $h);
        imagefill($im, 0, 0, imagecolorallocate($im, 0, 200, 220));
        ob_start();
        imagepng($im);

        return (string) ob_get_clean();
    }

    public function test_a_picture_drawn_from_a_pdf_keeps_the_pdf_as_a_design_file(): void
    {
        Storage::fake('local');
        Sanctum::actingAs(User::factory()->create());
        $data = $this->postJson('/api/v1/assets', [
            'type' => 'reference',
            'file' => UploadedFile::fake()->createWithContent('Club kit.png', $this->png()),
            'original' => UploadedFile::fake()->createWithContent('Club kit.ai', self::PDF),
        ])->assertCreated()->json('data');
        $this->assertSame('reference', $data['type']);
        $this->assertSame('image/png', $data['mime_type']);
        $this->assertSame('Club kit', $data['name']);
        $this->assertSame('design', $data['source']['type']);
        $this->assertSame('Club kit.ai', $data['source']['name']);
        $this->assertSame('application/pdf', $data['source']['mime_type']);
        $this->assertSame($data['source']['id'], $data['source_id']);
        // The original is kept as it was, and served without powers.
        $this->get('/api/v1/assets/'.$data['source']['id'].'/file')->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        $this->assertSame(self::PDF, $this->get('/api/v1/assets/'.$data['source']['id'].'/file')->streamedContent());

        // A Recent designs session lists the design file beside its picture.
        $session = $this->postJson('/api/v1/ai/sessions', [
            'prompt' => 'A design from my file', 'reference_ids' => [$data['id']],
            'options' => [['image' => 'data:image/png;base64,'.base64_encode($this->png(60, 90)), 'name' => 'Design 1']],
        ])->assertCreated()->json('data.id');
        $shown = $this->getJson('/api/v1/ai/sessions/'.$session)->assertOk()->json('data');
        $this->assertSame([$data['id']], $shown['reference_ids']);
        $this->assertSame('Club kit.ai', $shown['files'][0]['name']);
        $this->assertSame($data['id'], $shown['files'][0]['picture_id']);
    }

    public function test_the_server_draws_what_it_can_and_says_plainly_what_it_cannot(): void
    {
        Storage::fake('local');
        Sanctum::actingAs(User::factory()->create());
        // A GIF (no picture sent): GD draws it.
        $gif = imagecreatetruecolor(20, 20);
        ob_start();
        imagegif($gif);
        $this->postJson('/api/v1/assets', [
            'type' => 'reference', 'original' => UploadedFile::fake()->createWithContent('logo.gif', (string) ob_get_clean()),
        ])->assertCreated()->assertJsonPath('data.mime_type', 'image/png')->assertJsonPath('data.source.mime_type', 'image/gif');

        // A Photoshop file: drawn only with Imagick (or CloudConvert); otherwise a plain message.
        $psd = UploadedFile::fake()->createWithContent('crest.psd', '8BPS'.str_repeat("\0", 40));
        if (! in_array('psd', DesignFiles::convertible(), true)) {
            $this->postJson('/api/v1/assets', ['type' => 'reference', 'original' => $psd])
                ->assertUnprocessable()->assertJsonPath('message', DesignFiles::cannotRead('psd'));
            $this->postJson('/api/v1/convert/picture', ['file' => $psd])
                ->assertUnprocessable()->assertJsonPath('message', "Photoshop (PSD) files can't be read here yet. Please save it as PDF, SVG or PNG and upload that.");
        }
        // Not a design file at all.
        $this->postJson('/api/v1/convert/picture', ['file' => UploadedFile::fake()->createWithContent('notes.txt', 'hello')])
            ->assertUnprocessable();
        $this->postJson('/api/v1/assets', ['type' => 'reference', 'original' => UploadedFile::fake()->createWithContent('run.php', '<?php echo 1;')])
            ->assertUnprocessable();
        // A picture through the converter comes back as a PNG; over 25 MB is refused.
        $this->postJson('/api/v1/convert/picture', ['file' => UploadedFile::fake()->createWithContent('a.png', $this->png(3000, 100))])
            ->assertOk()->assertJsonPath('data.kind', 'png');
        $this->postJson('/api/v1/convert/picture', ['file' => UploadedFile::fake()->create('big.pdf', 26000, 'application/pdf')])
            ->assertUnprocessable()->assertJsonPath('errors.file.0', 'Use a file under 25 MB.');
        // Other asset types still take pictures only.
        $this->postJson('/api/v1/assets', ['type' => 'logo', 'file' => UploadedFile::fake()->createWithContent('a.png', $this->png()), 'original' => UploadedFile::fake()->createWithContent('a.pdf', self::PDF)])
            ->assertUnprocessable()->assertJsonValidationErrors('original');
    }

    public function test_file_kinds_are_read_from_their_first_bytes(): void
    {
        $kinds = [
            'pdf' => self::PDF, 'eps' => "%!PS-Adobe-3.0 EPSF-3.0\n", 'psd' => '8BPS', 'tiff' => "II*\0rest", 'png' => $this->png(),
            'svg' => "<?xml version=\"1.0\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>", 'heic' => "\0\0\0\x18ftypheic\0\0\0\0",
        ];
        foreach ($kinds as $kind => $bytes) {
            $path = tempnam(sys_get_temp_dir(), 'df');
            file_put_contents($path, $bytes);
            $this->assertSame($kind, DesignFiles::kind($path), $kind);
            unlink($path);
        }
        $path = tempnam(sys_get_temp_dir(), 'df');
        file_put_contents($path, self::PDF);
        $this->assertSame(2, DesignFiles::pages($path));
        unlink($path);
    }
}
