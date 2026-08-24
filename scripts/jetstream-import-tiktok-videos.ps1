param(
    [string]$InputDir = ".\assets\TikTokVideos",

    [double]$Fps = 29.99,

    [bool]$Big = $true,

    [int]$StartAt = 1,

    [int]$Limit = 0,

    [string]$NamePrefix = "TikTokReel",

    [string]$ApiKey = "",

    [string]$UploaderId = "",

    [switch]$Fast,

    [int]$Workers = 4,

    [int]$SpriteWidth = 192,

    [int]$SpriteHeight = 341,

    [switch]$LowLight,

    [switch]$UploadAudio,

    [string]$AudioNamePrefix = "Som original",

    [switch]$SkipExisting,

    [switch]$WhatIfOnly
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ImportScript = if ($Fast) {
    Join-Path $PSScriptRoot "jetstream-fast-convert-and-import.ps1"
} else {
    Join-Path $PSScriptRoot "jetstream-convert-and-import.ps1"
}
$AudioScript = Join-Path $PSScriptRoot "jetstream-upload-audio.ps1"
$VideosDir = Join-Path $ProjectRoot "src\ReplicatedStorage\Shared\Modules\JetstreamVideos"
$MetadataPath = Join-Path $VideosDir "_metadata.json"
$ResolvedInputDir = Resolve-Path -LiteralPath (Join-Path $ProjectRoot $InputDir)

if (-not (Test-Path $ImportScript)) {
    throw "Import script not found: $ImportScript"
}

if ($UploadAudio -and -not (Test-Path $AudioScript)) {
    throw "Audio import script not found: $AudioScript"
}

if (($ApiKey -and -not $UploaderId) -or ($UploaderId -and -not $ApiKey)) {
    throw "Pass both -ApiKey and -UploaderId, or pass neither to use the existing Jetstream config."
}

if (-not $WhatIfOnly -and -not $ApiKey -and -not (Test-Path (Join-Path $HOME ".jetstream\config.json"))) {
    throw "Jetstream is not configured yet. Run scripts\jetstream-configure.ps1 first, or pass -ApiKey and -UploaderId."
}

if (-not (Test-Path $VideosDir)) {
    New-Item -ItemType Directory -Force -Path $VideosDir | Out-Null
}

function Get-VideoOrdinal {
    param([string]$FileName)

    if ($FileName -match '^(\d+)-') {
        return [int]$Matches[1]
    }

    return [int]::MaxValue
}

function Get-MetadataEntry {
    param([string]$ModuleName)

    if (-not (Test-Path $MetadataPath)) {
        return $null
    }

    $currentMetadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
    $property = $currentMetadata.PSObject.Properties[$ModuleName]
    if ($property) {
        return $property.Value
    }

    return $null
}

function Import-AudioIfNeeded {
    param(
        [string]$ModuleName,
        [string]$SourcePath
    )

    if (-not $UploadAudio -or $WhatIfOnly) {
        return
    }

    $entry = Get-MetadataEntry -ModuleName $ModuleName
    if ($entry -and $entry.AudioId) {
        Write-Host "Skipping existing audio for $ModuleName"
        return
    }

    & $AudioScript -Name $ModuleName -InputPath $SourcePath -AudioName "$AudioNamePrefix - $ModuleName"
}

$videos = Get-ChildItem -LiteralPath $ResolvedInputDir -File |
    Where-Object { $_.Extension -in ".mp4", ".mov", ".webm", ".gif" } |
    Sort-Object @{ Expression = { Get-VideoOrdinal $_.Name } }, Name

if ($videos.Count -eq 0) {
    throw "No videos found in $ResolvedInputDir"
}

$selected = $videos | Select-Object -Skip ([Math]::Max(0, $StartAt - 1))

if ($Limit -gt 0) {
    $selected = $selected | Select-Object -First $Limit
}

$selected = @($selected)

$importedSourcePaths = @{}
if (Test-Path $MetadataPath) {
    $metadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
    foreach ($property in $metadata.PSObject.Properties) {
        if ($property.Value.SourcePath) {
            $importedSourcePaths[[string]$property.Value.SourcePath] = $property.Name
        }
    }
}

Write-Host "Found $($videos.Count) videos in $ResolvedInputDir"
Write-Host "Selected $($selected.Count) videos starting at item $StartAt"

$counter = $StartAt
foreach ($video in $selected) {
    $name = "{0}{1:D2}" -f $NamePrefix, $counter
    $destination = Join-Path $VideosDir "$name.luau"
    $sourcePath = [string](Resolve-Path -LiteralPath $video.FullName)

    if ($SkipExisting -and (Test-Path $destination)) {
        Write-Host "Skipping existing module $name"
        Import-AudioIfNeeded -ModuleName $name -SourcePath $video.FullName
        $counter += 1
        continue
    }

    if ($SkipExisting -and $importedSourcePaths.ContainsKey($sourcePath)) {
        $existingName = $importedSourcePaths[$sourcePath]
        Write-Host "Skipping already imported source $($video.Name) -> $existingName"
        Import-AudioIfNeeded -ModuleName $existingName -SourcePath $video.FullName
        $counter += 1
        continue
    }

    Write-Host "[$counter] $($video.Name) -> $name"

    if (-not $WhatIfOnly) {
        $importParams = @{
            Name = $name
            InputPath = $video.FullName
            Fps = $Fps
        }

        if ($Fast) {
            $importParams.Workers = $Workers
            $importParams.SpriteWidth = $SpriteWidth
            $importParams.SpriteHeight = $SpriteHeight
            if ($LowLight) {
                $importParams.LowLight = $true
            }
            if ($UploadAudio) {
                $importParams.UploadAudio = $true
                $importParams.AudioName = "$AudioNamePrefix - $name"
            }
        } else {
            $importParams.Big = $Big
        }

        if ($ApiKey -and $UploaderId) {
            $importParams.ApiKey = $ApiKey
            $importParams.UploaderId = $UploaderId
        }

        & $ImportScript @importParams
        if (-not $Fast) {
            Import-AudioIfNeeded -ModuleName $name -SourcePath $video.FullName
        }
    }

    $counter += 1
}

if ($WhatIfOnly) {
    Write-Host "Dry run complete. Remove -WhatIfOnly to convert and upload."
} else {
    Write-Host "TikTok video import complete."
}
