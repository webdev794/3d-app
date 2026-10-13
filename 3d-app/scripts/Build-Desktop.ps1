param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$flutterTool = Join-Path $projectRoot '.tools/flutter/bin/flutter.bat'
if (-not (Test-Path -LiteralPath $flutterTool)) { $flutterTool = 'flutter' }
Push-Location $projectRoot
try {
    Push-Location 'website'
    try {
        & php artisan migrate --force
        if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
        & npm.cmd run sync-assets
        if ($LASTEXITCODE -ne 0) { throw 'Viewer/assets build failed.' }
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'React build failed.' }
    } finally { Pop-Location }
    & $flutterTool build web --release --no-web-resources-cdn --base-href /
    if ($LASTEXITCODE -ne 0) { throw 'Flutter web build failed.' }
    Write-Host 'Ready. Run scripts/Start-Desktop.cmd. No phone is needed.'
} finally { Pop-Location }
