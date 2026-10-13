param([int]$Port = 8000, [string]$BindAddress = '127.0.0.1')

$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot 'public')
try {
    & php -d upload_max_filesize=12M -d post_max_size=14M -S "${BindAddress}:$Port" '../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php'
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
