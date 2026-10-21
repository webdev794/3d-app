<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * A file with a design request: the customer's logos, references and message attachments, and the designer's
 * versioned deliveries (artwork, mockups) and working files. Stored privately; downloaded through the API.
 */
class TeamFile extends Model
{
    public const KINDS = ['logo', 'reference', 'artwork', 'mockup', 'attachment', 'working'];

    public const DELIVERY_KINDS = ['artwork', 'mockup'];

    /** Allowed extensions per use; the content is checked as for order files. */
    public const TYPES = [
        'logo' => ['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf', 'ai', 'eps'],
        'reference' => ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'pdf', 'ai', 'eps', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'zip'],
        'delivery' => ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'svg', 'ai', 'eps', 'zip'],
    ];

    /** KB: customer files 20 MB, deliveries 30 MB. */
    public const MAX_KB = 20480;

    public const DELIVERY_MAX_KB = 30720;

    /** All of a request's customer uploads together. */
    public const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

    /** Pictures that can go into the customer's assets and the Studio. */
    public const PICTURES = ['png', 'jpg', 'jpeg', 'webp'];

    private const POWERPOINT = [
        'ppt' => ['application/vnd.ms-powerpoint', 'application/cdfv2', 'application/x-ole-storage', 'application/vnd.ms-office', 'application/octet-stream'],
        'pptx' => ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip', 'application/octet-stream'],
    ];

    protected $fillable = ['user_id', 'team_message_id', 'kind', 'visibility', 'name', 'extension', 'path', 'mime_type', 'size', 'thumb', 'version'];

    protected function casts(): array
    {
        return ['size' => 'integer', 'version' => 'integer'];
    }

    protected static function booted(): void
    {
        static::deleted(fn (TeamFile $file) => Storage::disk('local')->delete($file->path));
    }

    public function request(): BelongsTo
    {
        return $this->belongsTo(TeamRequest::class, 'team_request_id');
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function isPicture(): bool
    {
        return in_array($this->extension, self::PICTURES, true);
    }

    /** Validation rules for one uploaded file of this use (logo, reference or delivery). */
    public static function rules(string $use): array
    {
        $max = $use === 'delivery' ? self::DELIVERY_MAX_KB : self::MAX_KB;

        return ['file', 'max:'.$max, function (string $attribute, mixed $file, \Closure $fail) use ($use) {
            if ($file instanceof UploadedFile && ($problem = self::problem($file, $use))) {
                $fail($problem);
            }
        }];
    }

    /** Why this file can't be attached, or null. Reuses the order files' content checks. */
    public static function problem(UploadedFile $file, string $use): ?string
    {
        $extension = strtolower($file->getClientOriginalExtension());
        if (! in_array($extension, self::TYPES[$use] ?? [], true)) {
            return 'Choose a '.strtoupper(implode(', ', self::TYPES[$use] ?? [])).' file.';
        }
        if (isset(self::POWERPOINT[$extension])) {
            return in_array(strtolower((string) $file->getMimeType()), self::POWERPOINT[$extension], true) ? null : 'This is not a real '.strtoupper($extension).' file.';
        }

        // An "other" order file accepts every other type listed here, with the same content check.
        return OrderFile::problem($file, 'other') ? 'This is not a real '.strtoupper($extension).' file.' : null;
    }

    /** Stores an upload privately and makes its record (not saved yet). */
    public static function fromUpload(UploadedFile $upload, string $kind, int $requestId): self
    {
        $extension = strtolower($upload->getClientOriginalExtension());
        $path = $upload->storeAs('team-files/'.$requestId, Str::uuid().'.'.$extension, 'local');
        abort_if(! $path, 500, 'The file could not be stored. Please try again.');
        $name = trim(preg_replace('/[\x00-\x1F\x7F\/\\\\]+/', '', $upload->getClientOriginalName()) ?? '') ?: 'file.'.$extension;

        return new self([
            'kind' => $kind,
            'name' => mb_substr($name, -160),
            'extension' => $extension,
            'path' => $path,
            'mime_type' => $upload->getMimeType() ?: 'application/octet-stream',
            'size' => $upload->getSize(),
            'thumb' => OrderFile::thumbnail(Storage::disk('local')->path($path)),
        ]);
    }
}
