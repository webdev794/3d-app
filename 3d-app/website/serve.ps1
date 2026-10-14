param([int]$Port = 8000, [string]$BindAddress = '127.0.0.1')

$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot 'public')
try {
    # display_errors off: PHP request-startup notices (e.g. large bodies spooling to temp files)
    # otherwise print HTML before the JSON response and break API clients. Laravel logs errors itself.
    & php -d upload_max_filesize=32M -d post_max_size=64M -d display_errors=Off -d log_errors=On -S "${BindAddress}:$Port" '../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php'
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
