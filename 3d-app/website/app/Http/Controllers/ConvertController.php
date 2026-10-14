<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;

class ConvertController extends Controller
{
    /** Which conversions this server can do. Public, so the Artboard can say so before asking anyone to sign in. */
    public function formats()
    {
        $soffice = config('services.cdr.soffice');
        $cdr = (bool) (config('services.cdr.converter_url') || ($soffice && is_executable($soffice)) || config('services.cdr.cloudconvert'));

        return response()->json(['data' => ['cdr' => $cdr]]);
    }

    /** Convert an uploaded CorelDRAW file to SVG with whichever converter this server has. */
    public function cdr(Request $request)
    {
        $request->validate(['file' => ['required', 'file', 'max:20480']]);
        $file = $request->file('file');
        abort_unless(strtolower($file->getClientOriginalExtension()) === 'cdr', 422, 'Choose a CorelDRAW (.cdr) file.');
        $head = (string) file_get_contents($file->getRealPath(), false, null, 0, 12);
        // CDR files are RIFF containers: "RIFF....CDR*". Old (pre-7) versions use "WL".
        abort_unless(str_starts_with($head, 'RIFF') && str_contains($head, 'CDR'), 422, 'This file does not look like a CorelDRAW drawing.');

        $svg = $this->viaMicroservice($file->getRealPath(), $file->getClientOriginalName())
            ?? $this->viaLibreOffice($file->getRealPath())
            ?? $this->viaCloudConvert($file->getRealPath(), $file->getClientOriginalName());
        abort_unless($svg !== null, 503, 'CorelDRAW conversion is not configured on this server yet. Export the file as SVG from CorelDRAW and import that instead.');
        abort_unless(str_contains($svg, '<svg'), 502, 'The converter could not read this CorelDRAW file. Try saving it with "version compatibility" in CorelDRAW, or export it as SVG.');

        // Belt and braces: the artwork renders as an image, but never pass scripts through.
        $svg = preg_replace('#<script\b[^>]*>.*?</script>#is', '', $svg);

        return response()->json(['data' => [
            'svg' => $svg,
            'name' => Str::of($file->getClientOriginalName())->beforeLast('.cdr')->limit(100)->toString() ?: 'CorelDRAW artwork',
        ]]);
    }

    private function viaMicroservice(string $path, string $name): ?string
    {
        $url = config('services.cdr.converter_url');
        if (! $url) {
            return null;
        }
        $response = Http::timeout(90)->attach('file', file_get_contents($path), $name)->post($url);

        return $response->successful() ? $response->body() : null;
    }

    private function viaLibreOffice(string $path): ?string
    {
        $soffice = config('services.cdr.soffice');
        if (! $soffice || ! is_executable($soffice)) {
            return null;
        }
        $dir = sys_get_temp_dir().'/cdr-'.Str::random(10);
        mkdir($dir);
        $input = $dir.'/input.cdr';
        copy($path, $input);
        try {
            $result = Process::timeout(90)->run([$soffice, '--headless', '--convert-to', 'svg', '--outdir', $dir, $input]);
            $out = $dir.'/input.svg';

            return $result->successful() && is_file($out) ? file_get_contents($out) : null;
        } finally {
            foreach (glob($dir.'/*') ?: [] as $f) {
                @unlink($f);
            }
            @rmdir($dir);
        }
    }

    private function viaCloudConvert(string $path, string $name): ?string
    {
        $key = config('services.cdr.cloudconvert');
        if (! $key) {
            return null;
        }
        $api = Http::withToken($key)->timeout(30)->baseUrl('https://api.cloudconvert.com/v2');
        $job = $api->post('/jobs', ['tasks' => [
            'upload' => ['operation' => 'import/upload'],
            'convert' => ['operation' => 'convert', 'input' => 'upload', 'input_format' => 'cdr', 'output_format' => 'svg'],
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
