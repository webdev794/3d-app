<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Schema;
use Throwable;

/** Admin-editable settings. Secrets are stored encrypted with the app key. */
class Setting extends Model
{
    public const SECRETS = ['openai_key'];

    /** Setting key => config key it overrides. */
    public const CONFIG = [
        'openai_key' => 'services.openai.key',
        'openai_text_model' => 'services.openai.text_model',
        'openai_image_model' => 'services.openai.image_model',
        'openai_planning_model' => 'services.openai.planning_model',
        'openai_hd_image_model' => 'services.openai.hd_image_model',
    ];

    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['key', 'value'];

    public static function put(string $key, ?string $value): void
    {
        if ($value === null || $value === '') {
            static::whereKey($key)->delete();

            return;
        }
        static::updateOrCreate(['key' => $key], ['value' => in_array($key, self::SECRETS, true) ? Crypt::encryptString($value) : $value]);
    }

    /** Copies saved settings over the .env configuration for this request. */
    public static function applyToConfig(): void
    {
        try {
            if (! Schema::hasTable('settings')) {
                return;
            }
            foreach (static::whereIn('key', array_keys(self::CONFIG))->get() as $setting) {
                $value = in_array($setting->key, self::SECRETS, true) ? Crypt::decryptString($setting->value) : $setting->value;
                config([self::CONFIG[$setting->key] => $value]);
            }
        } catch (Throwable) {
            // No database yet (fresh install) or a changed app key: keep .env values.
        }
    }

    public static function has(string $key): bool
    {
        return static::whereKey($key)->exists();
    }
}
