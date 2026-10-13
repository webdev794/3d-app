$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskDist = Join-Path $taskRoot 'dist'
New-Item -ItemType Directory -Force -Path $taskDist | Out-Null

function Write-Archive($destination, $entries) {
    $taskStream = [System.IO.File]::Open($destination, [System.IO.FileMode]::Create)
    $taskZip = [System.IO.Compression.ZipArchive]::new($taskStream, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($taskEntry in $entries) {
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip, $taskEntry.Source, $taskEntry.Name, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $taskZip.Dispose(); $taskStream.Dispose() }
}

$taskEntries = [System.Collections.Generic.List[object]]::new()
foreach ($taskFolder in @('.github','android','ios','assets','lib','test','web','scripts','viewer')) {
    foreach ($taskFile in Get-ChildItem -LiteralPath (Join-Path $taskRoot $taskFolder) -File -Recurse -Force) {
        $taskRelative = $taskFile.FullName.Substring($taskRoot.Length + 1).Replace('\','/')
        if ($taskRelative -match '(^|/)(\.gradle|build|\.dart_tool|ephemeral|node_modules|Pods|\.symlinks|xcuserdata)/|\.(iml|hprof|dmp|log)$|local\.properties$|Generated\.xcconfig$|flutter_export_environment\.sh$|prototype_contract\.md$') { continue }
        $taskEntries.Add(@{Source=$taskFile.FullName; Name="3DEEZI_Flutter_Source/$taskRelative"})
    }
}
foreach ($taskName in @('README.md','IOS_SETUP.md','BUILD_INFO.md','pubspec.yaml','pubspec.lock','.metadata','.gitignore','.gitattributes')) {
    $taskFile = Join-Path $taskRoot $taskName
    if (Test-Path -LiteralPath $taskFile) { $taskEntries.Add(@{Source=$taskFile;Name="3DEEZI_Flutter_Source/$taskName"}) }
}
Write-Archive (Join-Path $taskDist '3DEEZI_Flutter_Source.zip') $taskEntries

$taskBuild = Join-Path $taskRoot 'build\web'
if (Test-Path -LiteralPath (Join-Path $taskBuild 'index.html')) {
    $taskIndex = Join-Path $taskBuild 'index.html'
    $taskHtml = [System.IO.File]::ReadAllText($taskIndex).Replace('<base href="/">','<base href="./">')
    [System.IO.File]::WriteAllText($taskIndex,$taskHtml,[System.Text.UTF8Encoding]::new($false))
    $taskWebEntries = [System.Collections.Generic.List[object]]::new()
    foreach ($taskFile in Get-ChildItem -LiteralPath $taskBuild -Recurse -File) {
        $taskRelative = $taskFile.FullName.Substring($taskBuild.Length + 1).Replace('\','/')
        $taskWebEntries.Add(@{Source=$taskFile.FullName;Name="3DEEZI_Web_Preview/$taskRelative"})
    }
    $taskWebEntries.Add(@{Source=(Join-Path $PSScriptRoot 'serve_preview.mjs');Name='3DEEZI_Web_Preview/serve.mjs'})
    $taskWebEntries.Add(@{Source=(Join-Path $PSScriptRoot 'Start-Preview.cmd');Name='3DEEZI_Web_Preview/Start-Preview.cmd'})
    $taskWebEntries.Add(@{Source=(Join-Path $PSScriptRoot 'Start-iPhone-Preview.cmd');Name='3DEEZI_Web_Preview/Start-iPhone-Preview.cmd'})
    $taskWebEntries.Add(@{Source=(Join-Path $taskRoot 'README.md');Name='3DEEZI_Web_Preview/README.md'})
    Write-Archive (Join-Path $taskDist '3DEEZI_Web_Preview.zip') $taskWebEntries
}

$taskApk = Join-Path $taskRoot 'build\app\outputs\flutter-apk\app-release.apk'
if (Test-Path -LiteralPath $taskApk) { Copy-Item -LiteralPath $taskApk -Destination (Join-Path $taskDist '3DEEZI_Android_Demo.apk') -Force }
Get-ChildItem -LiteralPath $taskDist -File | Select-Object Name,Length
