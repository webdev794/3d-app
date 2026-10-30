<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

/**
 * A file with an order (or with a draft until it is submitted): the customer's order form and artwork, and staff's
 * design proofs, photos, invoices and other files. Stored privately; downloaded through the API by the customer
 * (customer-visible files only) or staff. Design proofs are versioned and carry the customer's review.
 */
class OrderFile extends Model
{
    public const KINDS = ['order_form', 'artwork', 'proof', 'photo', 'invoice', 'other'];

    /** What customers may attach. */
    public const CUSTOMER_KINDS = ['order_form', 'artwork'];

    public const VISIBILITIES = ['customer', 'internal'];

    public const MAX_KB = 25600;

    /** Files on one draft (order forms and artwork together). */
    public const MAX_FILES = 15;

    /** Allowed extensions per kind. */
    public const TYPES = [
        'order_form' => ['pdf', 'xlsx', 'xls', 'csv', 'ods', 'doc', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'webp', 'heic'],
        'artwork' => ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'pdf', 'ai', 'eps', 'cdr', 'psd', 'tif', 'tiff', 'heic'],
        'proof' => ['png', 'jpg', 'jpeg', 'webp', 'pdf'],
        'photo' => ['png', 'jpg', 'jpeg', 'webp', 'heic'],
        'invoice' => ['pdf', 'png', 'jpg', 'jpeg', 'xlsx', 'xls', 'csv', 'doc', 'docx'],
        'other' => ['pdf', 'xlsx', 'xls', 'csv', 'ods', 'doc', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ai', 'eps', 'cdr', 'psd', 'tif', 'tiff', 'heic', 'zip'],
    ];

    /**
     * The content types each extension may really have (read from the file, not its name). Office, Corel and
     * Photoshop files are often only recognised as a zip or as generic binary data.
     */
    private const CONTENT = [
        'pdf' => ['application/pdf', 'application/x-pdf'],
        'ai' => ['application/pdf', 'application/postscript', 'application/illustrator', 'application/octet-stream'],
        'eps' => ['application/postscript', 'image/x-eps', 'application/eps', 'application/octet-stream'],
        'png' => ['image/png'],
        'jpg' => ['image/jpeg', 'image/pjpeg'],
        'jpeg' => ['image/jpeg', 'image/pjpeg'],
        'webp' => ['image/webp'],
        'gif' => ['image/gif'],
        'svg' => ['image/svg+xml', 'image/svg', 'text/xml', 'application/xml', 'text/plain'],
        'tif' => ['image/tiff'],
        'tiff' => ['image/tiff'],
        'heic' => ['image/heic', 'image/heif', 'image/heic-sequence', 'application/octet-stream'],
        'psd' => ['image/vnd.adobe.photoshop', 'application/x-photoshop', 'image/x-photoshop', 'application/octet-stream'],
        'cdr' => ['application/x-cdr', 'application/cdr', 'application/coreldraw', 'image/x-coreldraw', 'application/vnd.corel-draw', 'application/x-riff', 'application/zip', 'application/octet-stream'],
        'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream'],
        'xls' => ['application/vnd.ms-excel', 'application/cdfv2', 'application/x-ole-storage', 'application/msword', 'application/octet-stream'],
        'ods' => ['application/vnd.oasis.opendocument.spreadsheet', 'application/zip', 'application/octet-stream'],
        'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream'],
        'doc' => ['application/msword', 'application/cdfv2', 'application/x-ole-storage', 'application/vnd.ms-office', 'application/octet-stream'],
        'csv' => ['text/csv', 'text/plain', 'application/csv', 'text/x-csv', 'application/vnd.ms-excel', 'text/comma-separated-values'],
        'txt' => ['text/plain'],
        'zip' => ['application/zip', 'application/x-zip-compressed'],
    ];

    /** Never accepted, whatever the file is called. */
    private const BLOCKED = ['application/x-dosexec', 'application/x-msdownload', 'application/x-executable', 'application/x-sharedlib',
        'text/x-php', 'application/x-php', 'text/html', 'application/javascript', 'text/javascript', 'application/x-sh', 'text/x-shellscript', 'application/java-archive'];

    private const TYPE_NAMES = [
        'order_form' => 'a PDF, Excel, CSV, Word, text or picture file for the order form',
        'artwork' => 'a picture or design file for the artwork (PNG, JPG, WEBP, GIF, SVG, PDF, AI, EPS, CDR, PSD, TIFF, HEIC)',
        'proof' => 'a PNG, JPG, WEBP or PDF file for the proof',
        'photo' => 'a PNG, JPG, WEBP or HEIC photo',
        'invoice' => 'a PDF, picture, Excel, CSV or Word file for the invoice',
        'other' => 'a document, picture, design file or zip',
    ];

    protected $fillable = ['kind', 'visibility', 'name', 'extension', 'path', 'mime_type', 'size', 'thumb', 'version', 'review_status', 'reviewed_at', 'review_note', 'meta'];

    protected $hidden = ['path', 'user_id', 'order_id', 'order_draft_id', 'updated_at', 'meta'];

    protected $appends = ['download'];

    protected function casts(): array
    {
        return ['size' => 'integer', 'version' => 'integer', 'reviewed_at' => 'datetime', 'meta' => 'array'];
    }

    protected static function booted(): void
    {
        // The stored file goes with its record.
        static::deleted(fn (OrderFile $file) => Storage::disk('local')->delete($file->path));
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function draft(): BelongsTo
    {
        return $this->belongsTo(OrderDraft::class, 'order_draft_id');
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** The API path to download it (with the signed-in token). */
    public function getDownloadAttribute(): string
    {
        return '/order-files/'.$this->id;
    }

    /** Validation rules for an upload of this kind. */
    public static function rules(string $kind): array
    {
        return ['required', 'file', 'max:'.self::MAX_KB, function (string $attribute, mixed $file, \Closure $fail) use ($kind) {
            if ($file instanceof UploadedFile && ($problem = self::problem($file, $kind))) {
                $fail($problem);
            }
        }];
    }

    /** Why this file can't be attached as this kind, or null when it can. */
    public static function problem(UploadedFile $file, string $kind): ?string
    {
        $extension = strtolower($file->getClientOriginalExtension());
        $mime = strtolower((string) $file->getMimeType());
        if (in_array($mime, self::BLOCKED, true)) {
            return 'This kind of file can\'t be attached.';
        }
        if (! in_array($extension, self::TYPES[$kind] ?? [], true) || ! in_array($mime, self::CONTENT[$extension] ?? [], true)) {
            return 'Choose '.(self::TYPE_NAMES[$kind] ?? 'another file').'.';
        }

        return null;
    }

    /** Stores an uploaded file privately and makes its record (not yet saved), with a preview for pictures. */
    public static function fromUpload(UploadedFile $upload, string $kind, string $folder): self
    {
        $extension = strtolower($upload->getClientOriginalExtension());
        $path = $upload->storeAs('order-files/'.$folder, Str::uuid().'.'.$extension, 'local');
        abort_if(! $path, 500, 'The file could not be stored. Please try again.');
        $name = trim(preg_replace('/[\x00-\x1F\x7F\/\\\\]+/', '', $upload->getClientOriginalName()) ?? '') ?: 'file.'.$extension;

        return new self([
            'kind' => $kind,
            'name' => mb_substr($name, -160),
            'extension' => $extension,
            'path' => $path,
            'mime_type' => $upload->getMimeType() ?: 'application/octet-stream',
            'size' => $upload->getSize(),
            'thumb' => self::thumbnail(Storage::disk('local')->path($path)),
        ]);
    }

    /** A JPEG preview of a picture (360 px), as a data URL; null for other files, or without the GD extension. */
    public static function thumbnail(string $file): ?string
    {
        if (! function_exists('imagecreatefromstring')) {
            return null;
        }
        try {
            $info = @getimagesize($file);
            if (! $info || ! in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_JPEG, IMAGETYPE_GIF, IMAGETYPE_WEBP], true)) {
                return null;
            }
            [$width, $height] = $info;
            // About 5 bytes a pixel while it is read: skip pictures too big for the memory left.
            $limit = self::memoryLimit();
            if ($width < 1 || $height < 1 || ($limit > 0 && $width * $height * 5 > ($limit - memory_get_usage()) * 0.7)) {
                return null;
            }
            $image = @imagecreatefromstring((string) file_get_contents($file));
            if (! $image) {
                return null;
            }
            $scale = min(1, 360 / max($width, $height));
            $w = max(1, (int) round($width * $scale));
            $h = max(1, (int) round($height * $scale));
            $thumb = imagecreatetruecolor($w, $h);
            // Transparent pictures (logos) on the site's dark navy.
            imagefill($thumb, 0, 0, imagecolorallocate($thumb, 7, 19, 31));
            imagecopyresampled($thumb, $image, 0, 0, 0, 0, $w, $h, $width, $height);
            ob_start();
            imagejpeg($thumb, null, 78);
            $jpeg = (string) ob_get_clean();
            imagedestroy($image);
            imagedestroy($thumb);

            return $jpeg === '' ? null : 'data:image/jpeg;base64,'.base64_encode($jpeg);
        } catch (Throwable) {
            return null;
        }
    }

    private static function memoryLimit(): int
    {
        $value = trim((string) ini_get('memory_limit'));
        if ($value === '' || $value === '-1') {
            return 0;
        }
        $number = (int) $value;

        return match (strtolower(substr($value, -1))) {
            'g' => $number * 1024 ** 3,
            'm' => $number * 1024 ** 2,
            'k' => $number * 1024,
            default => $number,
        };
    }
}
