param(
    [double]$Fps = 29.99
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$VideosDir = Join-Path $ProjectRoot "src\ReplicatedStorage\Shared\Modules\JetstreamVideos"
$CatalogPath = Join-Path $ProjectRoot "src\ReplicatedStorage\Shared\Modules\JetstreamReelsCatalog.luau"
$MetadataPath = Join-Path $VideosDir "_metadata.json"

if (-not (Test-Path $VideosDir)) {
    New-Item -ItemType Directory -Force -Path $VideosDir | Out-Null
}

$modules = Get-ChildItem -LiteralPath $VideosDir -Filter "*.luau" -File |
    Where-Object { $_.BaseName -ne "init" } |
    Sort-Object BaseName

$metadata = $null
if (Test-Path $MetadataPath) {
    $metadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("return {")

foreach ($module in $modules) {
    $safeId = $module.BaseName -replace '[^A-Za-z0-9_]', ''
    if ([string]::IsNullOrWhiteSpace($safeId)) {
        continue
    }

    $entryMetadata = $null
    if ($metadata) {
        $entryProperty = $metadata.PSObject.Properties[$module.BaseName]
        if ($entryProperty) {
            $entryMetadata = $entryProperty.Value
        }
    }

    $entryFps = $Fps
    $displayName = $module.BaseName
    $looped = "true"
    $audioId = ""
    $audioName = ""
    $videoId = ""

    if ($entryMetadata) {
        if ($entryMetadata.Enabled -eq $false) {
            continue
        }

        if ($entryMetadata.Fps) {
            $entryFps = [double]$entryMetadata.Fps
        }

        if ($entryMetadata.DisplayName) {
            $displayName = [string]$entryMetadata.DisplayName
        }

        if ($entryMetadata.Looped -eq $false) {
            $looped = "false"
        }

        if ($entryMetadata.AudioId) {
            $audioId = [string]$entryMetadata.AudioId
        }

        if ($entryMetadata.AudioName) {
            $audioName = [string]$entryMetadata.AudioName
        }

        if ($entryMetadata.VideoId) {
            $videoId = [string]$entryMetadata.VideoId
        }
    }

    $lines.Add("`t{")
    $lines.Add("`t`tId = `"$safeId`",")
    $lines.Add("`t`tDisplayName = `"$displayName`",")
    $lines.Add("`t`tModuleName = `"$($module.BaseName)`",")
    $lines.Add("`t`tFps = $entryFps,")
    $lines.Add("`t`tLooped = $looped,")
    if (-not [string]::IsNullOrWhiteSpace($audioId)) {
        $lines.Add("`t`tAudioId = `"$audioId`",")
        $lines.Add("`t`tAudioName = `"$audioName`",")
    }
    if (-not [string]::IsNullOrWhiteSpace($videoId)) {
        $lines.Add("`t`tVideoId = `"$videoId`",")
    }
    $lines.Add("`t},")
}

$lines.Add("}")
$lines.Add("")

[System.IO.File]::WriteAllLines($CatalogPath, $lines, [System.Text.UTF8Encoding]::new($false))
Write-Host "Updated Jetstream catalog:" $CatalogPath
