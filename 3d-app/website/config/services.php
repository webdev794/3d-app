<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'openai' => [
        'key' => env('OPENAI_API_KEY'),
        'text_model' => env('OPENAI_TEXT_MODEL', 'gpt-6-luna'),
        'image_model' => env('OPENAI_IMAGE_MODEL', 'gpt-image-2'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    /*
     * CorelDRAW (.cdr) conversion, tried in this order:
     * 1. A conversion microservice (POST multipart "file", returns SVG) — any hosting.
     * 2. A LibreOffice binary on this server — VPS/dedicated hosting.
     * 3. The CloudConvert API — shared hosting without binaries.
     */
    'cdr' => [
        'converter_url' => env('CDR_CONVERTER_URL'),
        'soffice' => env('CDR_SOFFICE_PATH'),
        'cloudconvert' => env('CLOUDCONVERT_API_KEY'),
    ],

    /* Where messages from the Support page's contact form are emailed (every administrator when empty). */
    'support' => [
        'email' => env('SUPPORT_EMAIL'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
