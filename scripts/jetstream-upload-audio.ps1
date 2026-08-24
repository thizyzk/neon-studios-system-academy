param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [string]$InputPath = "",

    [string]$AudioName = "",

    [int]$BitrateKbps = 96
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$VideosDir = Join-Path $ProjectRoot "src\ReplicatedStorage\Shared\Modules\JetstreamVideos"
$MetadataPath = Join-Path $VideosDir "_metadata.json"
$AudioOutputDir = Join-Path $ProjectRoot "assets\JetstreamAudio"

if (-not (Test-Path $MetadataPath)) {
    throw "Metadata file not found: $MetadataPath"
}

if (-not (Test-Path $AudioOutputDir)) {
    New-Item -ItemType Directory -Force -Path $AudioOutputDir | Out-Null
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
$audioPath = Join-Path $AudioOutputDir "$safeName.mp3"

if ([string]::IsNullOrWhiteSpace($AudioName)) {
    $AudioName = "Som original - $safeName"
}

& ffmpeg -y -i $resolvedInput -vn -ac 2 -ar 44100 -b:a "${BitrateKbps}k" $audioPath

$python = @"
import json
from pathlib import Path

from rblxopencloud import AssetType, Group, User
from jetstreamcli.config import load_config

config = load_config()
key = config.get("robloxKey")
uploader = config.get("uploader")
is_group = config.get("groupKey")

if not key or uploader is None:
    raise SystemExit("Jetstream Roblox key/uploader is not configured.")

creator = Group(uploader, key) if is_group else User(uploader, key)
audio_path = Path(r"$audioPath")

with audio_path.open("rb") as file:
    operation = creator.upload_asset(
        file,
        AssetType.Audio,
        "$AudioName",
        "Original audio extracted from a Jetstream reel"
    )

asset = operation.wait()
print(asset.id)
"@

$audioId = ($python | python - | Select-Object -Last 1).Trim()
if ([string]::IsNullOrWhiteSpace($audioId)) {
    throw "Audio upload did not return an asset id."
}

$metadataMap = [ordered]@{}
foreach ($property in $metadata.PSObject.Properties) {
    $metadataMap[$property.Name] = $property.Value
}

$entry | Add-Member -NotePropertyName "AudioId" -NotePropertyValue "rbxassetid://$audioId" -Force
$entry | Add-Member -NotePropertyName "AudioName" -NotePropertyValue $AudioName -Force
$entry | Add-Member -NotePropertyName "AudioSourcePath" -NotePropertyValue ([string]$audioPath) -Force
$entry | Add-Member -NotePropertyName "AudioImportedAt" -NotePropertyValue ((Get-Date).ToString("o")) -Force
$metadataMap[$Name] = $entry

$metadataJson = $metadataMap | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($MetadataPath, $metadataJson, [System.Text.UTF8Encoding]::new($false))

& (Join-Path $PSScriptRoot "jetstream-refresh-catalog.ps1")

Write-Host "Uploaded audio for $Name as rbxassetid://$audioId"
