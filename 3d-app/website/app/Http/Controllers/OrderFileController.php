<?php

namespace App\Http\Controllers;

use App\Models\OrderFile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Downloads a file kept with an order or a draft: staff any file; a customer the files of their own drafts, and the
 * customer-visible files of their own orders (never a staff-only one). Anything else is "not found".
 */
class OrderFileController extends Controller
{
    public function show(Request $request, int $file): StreamedResponse
    {
        $found = OrderFile::with(['order:id,user_id', 'draft:id,user_id'])->findOrFail($file);
        $user = $request->user();
        $allowed = $user->is_admin
            || ($found->order && $found->order->user_id === $user->id && $found->visibility === 'customer')
            || (! $found->order && $found->draft && $found->draft->user_id === $user->id);
        abort_unless($allowed, 404);
        abort_unless(Storage::disk('local')->exists($found->path), 404, 'The file is missing on the server.');

        return Storage::disk('local')->download($found->path, $found->name, [
            'Content-Type' => $found->mime_type,
            'X-Content-Type-Options' => 'nosniff',
            // Downloaded, never run: an SVG or PDF opened on its own gets no powers.
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            'Cache-Control' => 'private, max-age=300',
        ]);
    }
}
