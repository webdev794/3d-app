<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Artwork for an order form order (required since client 2026-11-05): an Order Assistant chat with a design
     * picture, sent as assist_token.
     */
    private ?string $artworkToken = null;

    protected function artwork(): array
    {
        // One chat per test (made once, so a test may make it before acting as an older database).
        $this->artworkToken ??= \App\Models\OrderAssist::create(['messages' => [], 'files' => [['kind' => 'design', 'name' => 'logo.png']], 'analysis' => null])->token;

        return ['assist_token' => $this->artworkToken];
    }

    /** Artwork uploaded to a draft (Upload Your Order needs artwork since client 2026-11-05). */
    protected function addArtwork(int $draft): void
    {
        $this->post("/api/v1/order-drafts/{$draft}/files", ['kind' => 'artwork', 'file' => \Illuminate\Http\UploadedFile::fake()->image('logo.png', 40, 40)], ['Accept' => 'application/json'])->assertCreated();
    }
}
