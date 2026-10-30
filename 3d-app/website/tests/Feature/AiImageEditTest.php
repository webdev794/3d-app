<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** The image editor's "Describe edits" (POST /ai/image-edit) with a faked OpenAI: no real calls are made. */
class AiImageEditTest extends TestCase
{
    use RefreshDatabase;

    /** A 1 x 1 JPEG. */
    private const JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    /** A plain PNG of any size, made without GD. */
    private static function png(int $width, int $height, bool $alpha = false): string
    {
        $chunk = fn (string $type, string $data) => pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));
        $rows = str_repeat("\x00".str_repeat($alpha ? "\x00\x00\x00\x00" : "\x10\x20\x30", $width), $height);

        return "\x89PNG\r\n\x1a\n"
            .$chunk('IHDR', pack('NNCCCCC', $width, $height, 8, $alpha ? 6 : 2, 0, 0, 0))
            .$chunk('IDAT', gzcompress($rows))
            .$chunk('IEND', '');
    }

    private static function url(string $bytes, string $mime = 'image/png'): string
    {
        return "data:{$mime};base64,".base64_encode($bytes);
    }

    /** One field of a multipart request to the image model. */
    private static function field(Request $request, string $name): ?string
    {
        return collect($request->data())->firstWhere('name', $name)['contents'] ?? null;
    }

    private function fakeOpenAi(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/v1/images/edits' => Http::response(['data' => [['b64_json' => base64_encode(self::png(4, 4))]]])]);
    }

    public function test_image_edit_needs_a_login(): void
    {
        $this->postJson('/api/v1/ai/image-edit', ['image' => self::url(self::png(2, 2)), 'instruction' => 'make it gold'])
            ->assertUnauthorized();
    }

    public function test_image_edit_checks_the_picture_and_mask(): void
    {
        $this->fakeOpenAi();
        Sanctum::actingAs(User::factory()->create());
        $picture = self::url(self::png(3, 2));

        $this->postJson('/api/v1/ai/image-edit', ['instruction' => 'make it gold'])->assertJsonValidationErrors('image');
        $this->postJson('/api/v1/ai/image-edit', ['image' => 'data:image/gif;base64,R0lGOD', 'instruction' => 'make it gold'])->assertJsonValidationErrors('image');
        $this->postJson('/api/v1/ai/image-edit', ['image' => 'data:image/png;base64,bm90IGFuIGltYWdl', 'instruction' => 'make it gold'])
            ->assertJsonValidationErrors(['image' => 'The picture could not be read. Use a PNG, JPEG or WebP image.']);
        $this->postJson('/api/v1/ai/image-edit', ['image' => $picture, 'instruction' => 'gold', 'mask' => self::url(base64_decode(self::JPEG), 'image/jpeg')])
            ->assertJsonValidationErrors(['mask' => 'The mask must be a PNG image.']);
        $this->postJson('/api/v1/ai/image-edit', ['image' => $picture, 'instruction' => 'gold', 'mask' => self::url(self::png(2, 3, true))])
            ->assertJsonValidationErrors(['mask' => 'The mask must be the same size as the picture.']);
        $this->postJson('/api/v1/ai/image-edit', ['image' => $picture, 'instruction' => 'gold', 'marked' => 'https://example.com/a.png'])->assertJsonValidationErrors('marked');
        $this->postJson('/api/v1/ai/image-edit', ['image' => $picture, 'instruction' => 'gold', 'size' => '800x600'])->assertJsonValidationErrors('size');
        Http::assertNothingSent();
    }

    public function test_image_edit_needs_a_description_or_notes(): void
    {
        $this->fakeOpenAi();
        Sanctum::actingAs(User::factory()->create());
        $picture = self::url(self::png(3, 2));

        $this->postJson('/api/v1/ai/image-edit', ['image' => $picture, 'instruction' => '   '])
            ->assertJsonValidationErrors(['instruction' => 'Describe the change you want, or add a note on the picture.']);
        $this->postJson('/api/v1/ai/image-edit', ['image' => $picture, 'notes' => []])->assertJsonValidationErrors('instruction');
        $this->postJson('/api/v1/ai/image-edit', ['image' => $picture, 'instruction' => str_repeat('a', 1001)])->assertJsonValidationErrors('instruction');
        $this->postJson('/api/v1/ai/image-edit', ['image' => $picture, 'notes' => [['text' => 'gold', 'x' => 1.5, 'y' => 0.2]]])->assertJsonValidationErrors('notes.0.x');
        $this->postJson('/api/v1/ai/image-edit', ['image' => $picture, 'notes' => [['x' => 0.5, 'y' => 0.2]]])->assertJsonValidationErrors('notes.0.text');
        $this->postJson('/api/v1/ai/image-edit', ['image' => $picture, 'notes' => array_fill(0, 21, ['text' => 'a', 'x' => 0, 'y' => 0])])->assertJsonValidationErrors('notes');
        Http::assertNothingSent();
    }

    public function test_image_edit_needs_ai_on_the_server(): void
    {
        config(['services.openai.key' => null]);
        Http::fake();
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/v1/ai/image-edit', ['image' => self::url(self::png(2, 2)), 'instruction' => 'make the collar gold'])
            ->assertStatus(503)
            ->assertJsonPath('message', 'AI generation is not configured on this server.');
        Http::assertNothingSent();
    }

    public function test_image_edit_sends_the_picture_its_marks_mask_and_notes(): void
    {
        $this->fakeOpenAi();
        Sanctum::actingAs(User::factory()->create());

        $response = $this->postJson('/api/v1/ai/image-edit', [
            'image' => self::url(self::png(6, 6)),
            'mask' => self::url(self::png(6, 6, true)),
            'marked' => self::url(base64_decode(self::JPEG), 'image/jpeg'),
            'instruction' => 'Make the collar gold',
            'notes' => [['text' => 'Gold trim here', 'x' => 0.2, 'y' => 0.1], ['text' => 'Number 7', 'x' => 0.5, 'y' => 0.9]],
        ])->assertOk();

        // A PNG comes back as a PNG, so a see-through picture stays see-through.
        $this->assertSame(self::url(self::png(4, 4)), $response->json('data.image'));
        Http::assertSent(function (Request $request) {
            $prompt = self::field($request, 'prompt');

            return str_ends_with($request->url(), '/images/edits')
                && $request->hasHeader('Authorization', 'Bearer sk-test')
                && self::field($request, 'model') === config('services.openai.image_model')
                && collect($request->data())->where('name', 'image[]')->count() === 2
                && $request->hasFile('mask', null, 'mask.png')
                && str_contains($prompt, 'Client request: Make the collar gold')
                && str_contains($prompt, '1 (top left, 20% from the left and 10% from the top): Gold trim here')
                && str_contains($prompt, '2 (bottom, 50% from the left and 90% from the top): Number 7')
                && str_contains($prompt, 'Never draw the marks, pins or numbers')
                && self::field($request, 'size') === '1024x1024'
                && self::field($request, 'output_format') === 'png'
                && self::field($request, 'quality') === 'medium';
        });
        Http::assertSentCount(1);
    }

    public function test_notes_alone_are_enough_and_a_photo_comes_back_as_a_jpeg(): void
    {
        $this->fakeOpenAi();
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/v1/ai/image-edit', [
            'image' => self::url(self::png(1536, 1024), 'image/png'),
            'notes' => [['text' => 'Remove this logo', 'x' => 0.7, 'y' => 0.5]],
        ])->assertOk();
        // A landscape HD picture keeps its shape and quality.
        Http::assertSent(fn (Request $request) => self::field($request, 'size') === '1536x1024'
            && self::field($request, 'quality') === 'high'
            && str_contains(self::field($request, 'prompt'), '1 (right, 70% from the left and 50% from the top): Remove this logo')
            && ! str_contains(self::field($request, 'prompt'), 'Client request:')
            && ! $request->hasFile('mask'));

        $photo = $this->postJson('/api/v1/ai/image-edit', [
            'image' => self::url(base64_decode(self::JPEG), 'image/jpeg'),
            'instruction' => 'Extend the background',
            'size' => '1024x1536',
        ])->assertOk();
        $this->assertStringStartsWith('data:image/jpeg;base64,', $photo->json('data.image'));
        Http::assertSent(fn (Request $request) => self::field($request, 'size') === '1024x1536'
            && self::field($request, 'output_format') === 'jpeg'
            && self::field($request, 'output_compression') === '90'
            && collect($request->data())->where('name', 'image[]')->count() === 1);
    }

    public function test_image_edit_reports_ai_errors(): void
    {
        config(['services.openai.key' => 'sk-test']);
        Http::fake(['api.openai.com/v1/images/edits' => Http::sequence()
            ->push(['error' => ['message' => 'Your request was rejected by the safety system.']], 400)
            ->push(['data' => []])]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/v1/ai/image-edit', ['image' => self::url(self::png(2, 2)), 'instruction' => 'make it gold'])
            ->assertStatus(502)
            ->assertJsonPath('message', 'AI error: Your request was rejected by the safety system.');
        $this->postJson('/api/v1/ai/image-edit', ['image' => self::url(self::png(2, 2)), 'instruction' => 'make it gold'])
            ->assertStatus(502)
            ->assertJsonPath('message', 'No image came back. Please try again.');
    }
}
