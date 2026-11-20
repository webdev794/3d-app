<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;

/**
 * Design files attached in the AI Designer (client 2026-11-02, picture 295.jpg): PDF, SVG, AI, EPS, PSD, TIFF, HEIC
 * and pictures. The AI reads pictures only, so a file is turned into one: the website and the app draw PDF, SVG and
 * PDF-compatible AI files themselves (pdf.js, as Artwork to 3D does); this server draws what they cannot, with
 * whatever it has (GD for pictures, Imagick, Ghostscript, CloudConvert). Nothing is installed for it.
 */
class DesignFiles
{
    /** The largest design file taken (25 MB, in KB as Laravel's max rule counts). */
    public const MAX_KB = 25600;

    /** The file endings the pickers offer. */
    public const EXTENSIONS = ['pdf', 'svg', 'ai', 'eps', 'ps', 'psd', 'tif', 'tiff', 'heic', 'heif', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];

    /** Each kind of file as it is kept. */
    public const MIME = [
        'pdf' => 'application/pdf', 'svg' => 'image/svg+xml', 'eps' => 'application/postscript', 'psd' => 'image/vnd.adobe.photoshop',
        'tiff' => 'image/tiff', 'heic' => 'image/heic', 'png' => 'image/png', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp',
        'gif' => 'image/gif', 'bmp' => 'image/bmp',
    ];

    /** What a file is, from its first bytes (an AI file saved with PDF compatibility is a PDF); null when unknown. */
    public static function kind(string $path): ?string
    {
        $head = (string) @file_get_contents($path, false, null, 0, 1024);
        if ($head === '') {
            return null;
        }

        return match (true) {
            str_contains(substr($head, 0, 1024), '%PDF-') => 'pdf',
            str_starts_with($head, '%!PS') || str_starts_with($head, "\xC5\xD0\xD3\xC6") => 'eps',
            str_starts_with($head, '8BPS') => 'psd',
            str_starts_with($head, "II*\0") || str_starts_with($head, "MM\0*") => 'tiff',
            substr($head, 4, 4) === 'ftyp' && in_array(substr($head, 8, 4), ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'], true) => 'heic',
            str_starts_with($head, "\x89PNG") => 'png',
            str_starts_with($head, "\xFF\xD8\xFF") => 'jpeg',
            str_starts_with($head, 'RIFF') && substr($head, 8, 4) === 'WEBP' => 'webp',
            str_starts_with($head, 'GIF8') => 'gif',
            str_starts_with($head, 'BM') => 'bmp',
            (bool) preg_match('/<svg[\s>]/i', $head) || ((bool) preg_match('/^\s*(<\?xml|<!--|<!DOCTYPE svg)/i', $head) && str_contains((string) @file_get_contents($path, false, null, 0, 65536), '<svg')) => 'svg',
            default => null,
        };
    }

    /** A plain message for a file this server cannot draw. */
    public static function cannotRead(string $kind): string
    {
        $what = ['eps' => 'EPS (or older Illustrator)', 'psd' => 'Photoshop (PSD)', 'tiff' => 'TIFF', 'heic' => 'HEIC', 'pdf' => 'PDF', 'svg' => 'SVG'][$kind] ?? strtoupper($kind);
        $instead = in_array($kind, ['pdf', 'svg'], true) ? 'PNG or JPG' : 'PDF, SVG or PNG';

        return "{$what} files can't be read here yet. Please save it as {$instead} and upload that.";
    }

    /** The kinds this server can draw as a picture (for the pickers' messages). */
    public static function convertible(): array
    {
        $kinds = ['png', 'jpeg', 'webp', 'gif', 'bmp'];
        if (class_exists(\Imagick::class)) {
            $formats = array_map('strtolower', \Imagick::queryFormats());
            foreach (['pdf' => 'PDF', 'eps' => 'EPS', 'psd' => 'PSD', 'tiff' => 'TIFF', 'heic' => 'HEIC', 'svg' => 'SVG'] as $kind => $format) {
                if (in_array(strtolower($format), $formats, true)) {
                    $kinds[] = $kind;
                }
            }
        }
        if (self::ghostscript()) {
            array_push($kinds, 'pdf', 'eps');
        }
        if (config('services.cdr.cloudconvert')) {
            array_push($kinds, 'pdf', 'eps', 'psd', 'tiff', 'heic', 'svg');
        }

        return array_values(array_unique($kinds));
    }

    /**
     * The file as a PNG, at most $long pixels on its longer side ($page: a PDF's page, from 1); null when this
     * server cannot draw it.
     */
    public function picture(string $path, string $kind, int $page = 1, int $long = 2048): ?string
    {
        $page = max(1, $page);
        if (in_array($kind, ['png', 'jpeg', 'webp', 'gif', 'bmp'], true)) {
            return $this->fit((string) file_get_contents($path), $long);
        }

        return $this->viaImagick($path, $kind, $page, $long)
            ?? (in_array($kind, ['pdf', 'eps'], true) ? $this->viaGhostscript($path, $kind, $page, $long) : null)
            ?? $this->viaCloudConvert($path, $kind, $page, $long);
    }

    /** How many pages a PDF has (a quick look at its page tree; 1 when it cannot tell). */
    public static function pages(string $path): int
    {
        $text = (string) @file_get_contents($path);
        preg_match_all('#/Type\s*/Pages\b[^>]*?/Count\s+(\d+)#s', $text, $m);

        return max(1, (int) max($m[1] ?: [1]));
    }

    /** A picture GD can read, made no bigger than $long and saved as a PNG (see-through kept). */
    private function fit(string $bytes, int $long): ?string
    {
        if (! function_exists('imagecreatefromstring')) {
            return null;
        }
        $src = @imagecreatefromstring($bytes);
        if (! $src) {
            return null;
        }
        $w = imagesx($src);
        $h = imagesy($src);
        $k = min(1, $long / max($w, $h, 1));
        $tw = max(1, (int) round($w * $k));
        $th = max(1, (int) round($h * $k));
        $dst = imagecreatetruecolor($tw, $th);
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $tw, $th, $w, $h);
        ob_start();
        imagepng($dst, null, 6);
        $png = (string) ob_get_clean();
        imagedestroy($src);
        imagedestroy($dst);

        return $png !== '' ? $png : null;
    }

    private function viaImagick(string $path, string $kind, int $page, int $long): ?string
    {
        if (! class_exists(\Imagick::class)) {
            return null;
        }
        try {
            $im = new \Imagick;
            if (in_array($kind, ['pdf', 'eps', 'svg'], true)) {
                $im->setResolution(150, 150);
            }
            $im->setBackgroundColor(new \ImagickPixel('transparent'));
            // [n]: a PDF's page; the first image of the others (a PSD's flattened picture, a TIFF's first page).
            $im->readImage($path.'['.($kind === 'pdf' ? $page - 1 : 0).']');
            $im->setImageFormat('png');
            if (max($im->getImageWidth(), $im->getImageHeight()) > $long) {
                $im->thumbnailImage($long, $long, true);
            }
            $png = $im->getImageBlob();
            $im->clear();

            return $png !== '' ? $png : null;
        } catch (\Throwable) {
            return null;
        }
    }

    /** Ghostscript: GHOSTSCRIPT_PATH, or gs / gswin64c on the PATH (checked once an hour). */
    public static function ghostscript(): ?string
    {
        $set = config('services.design_files.ghostscript');
        if ($set) {
            return is_executable($set) ? $set : null;
        }

        return Cache::remember('design-files:ghostscript', 3600, function () {
            foreach (PHP_OS_FAMILY === 'Windows' ? ['gswin64c', 'gswin32c'] : ['gs'] as $bin) {
                try {
                    if (Process::timeout(10)->run([$bin, '--version'])->successful()) {
                        return $bin;
                    }
                } catch (\Throwable) {
                    // Not installed.
                }
            }

            return '';
        }) ?: null;
    }

    private function viaGhostscript(string $path, string $kind, int $page, int $long): ?string
    {
        $gs = self::ghostscript();
        if (! $gs) {
            return null;
        }
        $out = sys_get_temp_dir().'/design-'.Str::random(12).'.png';
        try {
            $result = Process::timeout(60)->run([$gs, '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET', '-sDEVICE=pngalpha', '-r150',
                ...($kind === 'pdf' ? ["-dFirstPage={$page}", "-dLastPage={$page}"] : ['-dEPSCrop']), '-sOutputFile='.$out, $path]);

            return $result->successful() && is_file($out) ? $this->fit((string) file_get_contents($out), $long) : null;
        } catch (\Throwable) {
            return null;
        } finally {
            @unlink($out);
        }
    }

    private function viaCloudConvert(string $path, string $kind, int $page, int $long): ?string
    {
        if (! config('services.cdr.cloudconvert')) {
            return null;
        }
        $convert = ['operation' => 'convert', 'input' => 'upload', 'input_format' => $kind === 'jpeg' ? 'jpg' : $kind, 'output_format' => 'png',
            ...($kind === 'pdf' ? ['pages' => (string) $page] : [])];
        $png = self::cloudConvert($path, 'design.'.($kind === 'jpeg' ? 'jpg' : $kind), $convert);

        return $png !== null ? $this->fit($png, $long) : null;
    }

    /**
     * One CloudConvert job (upload, $convert, export) and the first file it gives; null when it is not set up or fails.
     * Also used by the CorelDRAW import (ConvertController).
     */
    public static function cloudConvert(string $path, string $name, array $convert): ?string
    {
        $key = config('services.cdr.cloudconvert');
        if (! $key) {
            return null;
        }
        $api = Http::withToken($key)->timeout(30)->baseUrl('https://api.cloudconvert.com/v2');
        $job = $api->post('/jobs', ['tasks' => [
            'upload' => ['operation' => 'import/upload'],
            'convert' => $convert,
            'export' => ['operation' => 'export/url', 'input' => 'convert'],
        ]]);
        if (! $job->successful()) {
            return null;
        }
        $uploadTask = collect($job->json('data.tasks'))->firstWhere('name', 'upload');
        $form = $uploadTask['result']['form'] ?? null;
        if (! $form) {
            return null;
        }
        $upload = Http::asMultipart();
        foreach ($form['parameters'] as $k => $v) {
            $upload = $upload->attach($k, $v);
        }
        if (! $upload->attach('file', file_get_contents($path), $name)->post($form['url'])->successful()) {
            return null;
        }
        $jobId = $job->json('data.id');
        for ($i = 0; $i < 30; $i++) {
            sleep(2);
            $status = $api->get("/jobs/{$jobId}");
            if ($status->json('data.status') === 'error') {
                return null;
            }
            if ($status->json('data.status') === 'finished') {
                $exportTask = collect($status->json('data.tasks'))->firstWhere('name', 'export');
                $url = $exportTask['result']['files'][0]['url'] ?? null;

                return $url ? Http::timeout(60)->get($url)->body() : null;
            }
        }

        return null;
    }
}
