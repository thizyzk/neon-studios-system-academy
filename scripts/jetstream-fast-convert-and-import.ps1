param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [Alias("Input")]
    [ValidateNotNullOrEmpty()]
    [string]$InputPath,

    [double]$Fps = 29.99,

    [int]$Workers = 4,

    [int]$Limit = 0,

    [int]$SpriteWidth = 192,

    [int]$SpriteHeight = 341,

    [switch]$LowLight,

    [string]$VideoFilter = "",

    [string]$ApiKey = "",

    [string]$UploaderId = "",

    [switch]$UploadAudio,

    [string]$AudioName = ""
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$VideosDir = Join-Path $ProjectRoot "src\ReplicatedStorage\Shared\Modules\JetstreamVideos"
$MetadataPath = Join-Path $VideosDir "_metadata.json"
$UploaderScript = Join-Path $PSScriptRoot "jetstream-fast-upload-images.py"
$AudioScript = Join-Path $PSScriptRoot "jetstream-upload-audio.ps1"
$CachePath = Join-Path $ProjectRoot "assets\JetstreamUploadCache\images.json"

if (-not (Test-Path $UploaderScript)) {
    throw "Fast uploader not found: $UploaderScript"
}

if ($UploadAudio -and -not (Test-Path $AudioScript)) {
    throw "Audio upload script not found: $AudioScript"
}

if (($ApiKey -and -not $UploaderId) -or ($UploaderId -and -not $ApiKey)) {
    throw "Pass both -ApiKey and -UploaderId, or pass neither to use the existing Jetstream config."
}

if ($ApiKey -and $UploaderId) {
    & (Join-Path $PSScriptRoot "jetstream-configure.ps1") -ApiKey $ApiKey -UploaderId $UploaderId
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    $ffmpeg = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "ffmpeg.exe" -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if ($ffmpeg) {
        $env:PATH = "$($ffmpeg.DirectoryName);$env:PATH"
    } else {
        throw "ffmpeg was not found on PATH. Install FFmpeg with: winget install --id Gyan.FFmpeg -e --source winget"
    }
}

if (-not (Test-Path $VideosDir)) {
    New-Item -ItemType Directory -Force -Path $VideosDir | Out-Null
}

$safeName = $Name -replace '[^A-Za-z0-9_]', ''
if ([string]::IsNullOrWhiteSpace($safeName)) {
    throw "Name must contain at least one letter or number."
}

$resolvedInput = Resolve-Path -LiteralPath $InputPath
$runStamp = Get-Date -Format "yyyyMMdd_HHmmss"
$RunDir = Join-Path (Join-Path $HOME ".jetstream\projects\$safeName-fast") $runStamp
New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

$transformFps = [Math]::Max(1, [int][Math]::Round($Fps))
$filters = New-Object System.Collections.Generic.List[string]
$filters.Add("fps=$transformFps")

if ($LowLight) {
    $filters.Add("eq=brightness=0.32:contrast=1.28:saturation=1.22:gamma=1.65")
}

if (-not [string]::IsNullOrWhiteSpace($VideoFilter)) {
    $filters.Add($VideoFilter)
}

$filterGraph = [string]::Join(",", $filters)
Write-Host "Extracting frames at $transformFps fps for playback at $Fps fps..."
Write-Host "Video filter: $filterGraph"
& ffmpeg -y -i $resolvedInput -vf $filterGraph (Join-Path $RunDir "frame%06d.png")

$destination = Join-Path $VideosDir "$safeName.luau"
$uploadArgs = @(
    "--name", $safeName,
    "--frames-dir", $RunDir,
    "--output", $destination,
    "--cache", $CachePath,
    "--workers", $Workers
)

if ($SpriteWidth -gt 0) {
    $uploadArgs += @("--sprite-width", $SpriteWidth)
}

if ($SpriteHeight -gt 0) {
    $uploadArgs += @("--sprite-height", $SpriteHeight)
}

if ($Limit -gt 0) {
    $uploadArgs += @("--limit", $Limit)
}

Write-Host "Uploading frames as direct Image assets with $Workers workers..."
& python $UploaderScript @uploadArgs
if ($LASTEXITCODE -ne 0) {
    throw "Fast image upload failed. The video module was not updated."
}

$metadata = [ordered]@{}
$existingEntry = $null
if (Test-Path $MetadataPath) {
    $existingMetadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
    foreach ($property in $existingMetadata.PSObject.Properties) {
        $metadata[$property.Name] = $property.Value
        if ($property.Name -eq $safeName) {
            $existingEntry = $property.Value
        }
    }
}

$entry = [ordered]@{
    Id = $safeName
    DisplayName = $safeName
    ModuleName = $safeName
    Fps = $Fps
    Looped = $true
    SourcePath = [string]$resolvedInput
    ImportedAt = (Get-Date).ToString("o")
    FastImageUpload = $true
    LowLight = [bool]$LowLight
    FrameSourceDir = [string]$RunDir
}

if ($existingEntry) {
    if ($existingEntry.DisplayName) {
        $entry.DisplayName = [string]$existingEntry.DisplayName
    }

    if ($existingEntry.AudioId) {
        $entry.AudioId = [string]$existingEntry.AudioId
    }

    if ($existingEntry.AudioName) {
        $entry.AudioName = [string]$existingEntry.AudioName
    }

    if ($existingEntry.AudioSourcePath) {
        $entry.AudioSourcePath = [string]$existingEntry.AudioSourcePath
    }

    if ($existingEntry.AudioImportedAt) {
        $entry.AudioImportedAt = [string]$existingEntry.AudioImportedAt
    }
}

$metadata[$safeName] = $entry
$metadataJson = $metadata | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($MetadataPath, $metadataJson, [System.Text.UTF8Encoding]::new($false))

if ($UploadAudio) {
    $audioParams = @{
        Name = $safeName
        InputPath = [string]$resolvedInput
    }

    if (-not [string]::IsNullOrWhiteSpace($AudioName)) {
        $audioParams.AudioName = $AudioName
    }

    & $AudioScript @audioParams
} else {
    & (Join-Path $PSScriptRoot "jetstream-refresh-catalog.ps1") -Fps $Fps
}

Write-Host "Fast imported Jetstream video module:" $destination
