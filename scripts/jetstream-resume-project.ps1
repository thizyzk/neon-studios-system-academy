param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [double]$Fps = 29.99,

    [string]$SourcePath = "",

    [string]$AudioId = "",

    [string]$AudioName = ""
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ProjectsDir = Join-Path $HOME ".jetstream\projects"
$ProjectDir = Join-Path $ProjectsDir $Name
$BuildPath = Join-Path $ProjectDir "build.json"
$VideosDir = Join-Path $ProjectRoot "src\ReplicatedStorage\Shared\Modules\JetstreamVideos"
$MetadataPath = Join-Path $VideosDir "_metadata.json"

if (-not (Test-Path $BuildPath)) {
    throw "No Jetstream build.json found for project $Name at $BuildPath"
}

if (-not (Test-Path $VideosDir)) {
    New-Item -ItemType Directory -Force -Path $VideosDir | Out-Null
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    $ffmpeg = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "ffmpeg.exe" -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if ($ffmpeg) {
        $env:PATH = "$($ffmpeg.DirectoryName);$env:PATH"
    }
}

$python = @"
import json
import re
import shutil
from pathlib import Path

from jetstreamcli.robloxfuncs import upload_images, get_image_ids, generate_script

project_dir = Path(r"$ProjectDir")
build_path = Path(r"$BuildPath")
videos_dir = Path(r"$VideosDir")

with build_path.open("r", encoding="utf-8") as file:
    data = json.load(file)

project_name = data.get("project_name") or "$Name"
big_project = bool(data.get("big_proj"))
rblx_ids = [str(asset_id) for asset_id in data.get("rblx_ids", [])]
last_file = int(data.get("last_file") or len(rblx_ids))
step = data.get("step")

def frame_number(path: Path):
    match = re.search(r"frame(\d+)\.png$", path.name)
    return int(match.group(1)) if match else 0

frame_files = sorted(project_dir.glob("frame*.png"), key=frame_number)

# Jetstream's own frame list starts with a phantom frame0 path and then uploads
# from index 1. Keep that shape so resume indexes match its build.json.
paths = [project_dir / f"frame{i}.png" for i in range(0, len(frame_files))]

if step == "upload_images":
    id_list = upload_images(project_name, paths, big_project, project_dir, last_file + 1, rblx_ids)
    if id_list is None:
        raise SystemExit(1)
    image_ids = get_image_ids(id_list, project_dir, project_name)
    if image_ids is None:
        raise SystemExit(1)
    generate_script(project_name, image_ids, project_dir)
elif step == "image_ids":
    image_ids = get_image_ids(rblx_ids, project_dir, project_name)
    if image_ids is None:
        raise SystemExit(1)
    generate_script(project_name, image_ids, project_dir)
elif step == "script":
    generate_script(project_name, data["img_ids"], project_dir)
elif step == "done":
    image_ids = data.get("img_ids") or rblx_ids
    generate_script(project_name, image_ids, project_dir)
else:
    raise SystemExit(f"Unsupported resume step: {step}")

source = project_dir / f"{project_name}.luau"
if not source.exists():
    raise SystemExit(f"Generated module was not found: {source}")

destination = videos_dir / source.name
shutil.copyfile(source, destination)
print(f"Imported Jetstream video module: {destination}")
"@

$python | python -

$metadata = [ordered]@{}
$existingEntry = $null
if (Test-Path $MetadataPath) {
    $existingMetadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
    foreach ($property in $existingMetadata.PSObject.Properties) {
        $metadata[$property.Name] = $property.Value
        if ($property.Name -eq $Name) {
            $existingEntry = $property.Value
        }
    }
}

$entry = [ordered]@{
    Id = $Name
    DisplayName = $Name
    ModuleName = $Name
    Fps = $Fps
    Looped = $true
    SourcePath = $SourcePath
    ImportedAt = (Get-Date).ToString("o")
}

if ($existingEntry) {
    if ([string]::IsNullOrWhiteSpace($SourcePath) -and $existingEntry.SourcePath) {
        $entry.SourcePath = [string]$existingEntry.SourcePath
    }

    if ([string]::IsNullOrWhiteSpace($AudioId) -and $existingEntry.AudioId) {
        $AudioId = [string]$existingEntry.AudioId
    }

    if ([string]::IsNullOrWhiteSpace($AudioName) -and $existingEntry.AudioName) {
        $AudioName = [string]$existingEntry.AudioName
    }

    if ($existingEntry.AudioSourcePath) {
        $entry.AudioSourcePath = [string]$existingEntry.AudioSourcePath
    }

    if ($existingEntry.AudioImportedAt) {
        $entry.AudioImportedAt = [string]$existingEntry.AudioImportedAt
    }
}

if (-not [string]::IsNullOrWhiteSpace($AudioId)) {
    $entry.AudioId = $AudioId
}

if (-not [string]::IsNullOrWhiteSpace($AudioName)) {
    $entry.AudioName = $AudioName
}

$metadata[$Name] = $entry

$metadataJson = $metadata | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($MetadataPath, $metadataJson, [System.Text.UTF8Encoding]::new($false))

& (Join-Path $PSScriptRoot "jetstream-refresh-catalog.ps1") -Fps $Fps
