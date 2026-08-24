param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [string]$InputPath = "",

    [int]$Width = 720,

    [double]$Fps = 29.99,

    [int]$BitrateKbps = 1800,

    [int]$ExpectedRobuxPrice = 0,

    [switch]$LowLight,

    [string]$VideoFilter = ""
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$VideosDir = Join-Path $ProjectRoot "src\ReplicatedStorage\Shared\Modules\JetstreamVideos"
$MetadataPath = Join-Path $VideosDir "_metadata.json"
$NativeVideoDir = Join-Path $ProjectRoot "assets\JetstreamNativeVideo"

if (-not (Test-Path $MetadataPath)) {
    throw "Metadata file not found: $MetadataPath"
}

if (-not (Test-Path $NativeVideoDir)) {
    New-Item -ItemType Directory -Force -Path $NativeVideoDir | Out-Null
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

$metadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
$entryProperty = $metadata.PSObject.Properties[$Name]
if (-not $entryProperty) {
    throw "No metadata entry found for $Name"
}

$entry = $entryProperty.Value
if ([string]::IsNullOrWhiteSpace($InputPath)) {
    $InputPath = [string]$entry.SourcePath
}

if ([string]::IsNullOrWhiteSpace($InputPath)) {
    throw "No source video path found. Pass -InputPath."
}

$resolvedInput = Resolve-Path -LiteralPath $InputPath
$safeName = $Name -replace '[^A-Za-z0-9_]', ''
if ([string]::IsNullOrWhiteSpace($safeName)) {
    throw "Name must contain at least one letter or number."
}

$nativeVideoPath = Join-Path $NativeVideoDir "$safeName.mp4"
$transformFps = [Math]::Max(1, [int][Math]::Round($Fps))
$safeWidth = [Math]::Max(180, $Width)
$filters = New-Object System.Collections.Generic.List[string]
$filters.Add("fps=$transformFps")
$filters.Add("scale=$safeWidth`:-2")

if ($LowLight) {
    $filters.Add("eq=brightness=0.32:contrast=1.28:saturation=1.22:gamma=1.65")
}

if (-not [string]::IsNullOrWhiteSpace($VideoFilter)) {
    $filters.Add($VideoFilter)
}

$filterGraph = [string]::Join(",", $filters)
Write-Host "Transcoding native video at $transformFps fps..."
Write-Host "Video filter: $filterGraph"

& ffmpeg -y -i $resolvedInput -vf $filterGraph -an -c:v libx264 -pix_fmt yuv420p -preset veryfast -b:v "${BitrateKbps}k" -movflags +faststart $nativeVideoPath

$python = @"
from pathlib import Path

from jetstreamcli.config import load_config
from rblxopencloud import AssetType, Group, User

config = load_config()
key = config.get("robloxKey")
uploader = config.get("uploader")
is_group = config.get("groupKey")

if not key or uploader is None:
    raise SystemExit("Jetstream Roblox key/uploader is not configured.")

creator = Group(uploader, key) if is_group else User(uploader, key)
video_path = Path(r"$nativeVideoPath")

with video_path.open("rb") as file:
    operation = creator.upload_asset(
        file,
        AssetType.Video,
        "$safeName Native Video",
        "Native VideoFrame source for a Jetstream reel",
        $ExpectedRobuxPrice,
    )

asset = operation.wait()
print(asset.id)
"@

$videoOutput = $python | python -
if ($LASTEXITCODE -ne 0) {
    throw "Native video upload failed. If Roblox is charging for this upload, rerun with -ExpectedRobuxPrice after confirming the cost."
}
$videoIdLine = $videoOutput | Select-Object -Last 1
if ($null -eq $videoIdLine) {
    throw "Video upload did not return an asset id."
}

$videoId = $videoIdLine.Trim()
if ([string]::IsNullOrWhiteSpace($videoId)) {
    throw "Video upload did not return an asset id."
}

$metadataMap = [ordered]@{}
foreach ($property in $metadata.PSObject.Properties) {
    $metadataMap[$property.Name] = $property.Value
}

$entry | Add-Member -NotePropertyName "VideoId" -NotePropertyValue "rbxassetid://$videoId" -Force
$entry | Add-Member -NotePropertyName "NativeVideoSourcePath" -NotePropertyValue ([string]$nativeVideoPath) -Force
$entry | Add-Member -NotePropertyName "NativeVideoImportedAt" -NotePropertyValue ((Get-Date).ToString("o")) -Force
$metadataMap[$Name] = $entry

$metadataJson = $metadataMap | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($MetadataPath, $metadataJson, [System.Text.UTF8Encoding]::new($false))

& (Join-Path $PSScriptRoot "jetstream-refresh-catalog.ps1") -Fps $Fps

Write-Host "Uploaded native video for $Name as rbxassetid://$videoId"
