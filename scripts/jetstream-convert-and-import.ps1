param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [Alias("Input")]
    [ValidateNotNullOrEmpty()]
    [string]$InputPath,

    [double]$Fps = 29.99,

    [bool]$Big = $true,

    [string]$ApiKey = "",

    [string]$UploaderId = "",

    [switch]$SkipCreate
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Jetstream = Join-Path $env:APPDATA "Python\Python314\Scripts\jetstream.exe"
$VideosDir = Join-Path $ProjectRoot "src\ReplicatedStorage\Shared\Modules\JetstreamVideos"
$MetadataPath = Join-Path $VideosDir "_metadata.json"

if (-not (Test-Path $Jetstream)) {
    throw "jetstream.exe was not found at $Jetstream. Run: pip install --user jetstreamcli"
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

if (($ApiKey -and -not $UploaderId) -or ($UploaderId -and -not $ApiKey)) {
    throw "Pass both -ApiKey and -UploaderId, or pass neither to use the existing Jetstream config."
}

if ($ApiKey -and $UploaderId) {
    & (Join-Path $PSScriptRoot "jetstream-configure.ps1") -ApiKey $ApiKey -UploaderId $UploaderId
}

if (-not $SkipCreate) {
    $resolvedInput = Resolve-Path -LiteralPath $InputPath
    $transformFps = [Math]::Max(1, [int][Math]::Round($Fps))
    & $Jetstream create --name $safeName --input $resolvedInput --fps $transformFps --big $Big
}

$ProjectsDir = Join-Path $HOME ".jetstream\projects"
$generated = Get-ChildItem -LiteralPath $ProjectsDir -Recurse -Filter "$safeName.luau" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $generated) {
    throw "Could not find generated Jetstream module for $safeName in $ProjectsDir."
}

$destination = Join-Path $VideosDir "$safeName.luau"
Copy-Item -LiteralPath $generated.FullName -Destination $destination -Force

$metadata = [ordered]@{}
if (Test-Path $MetadataPath) {
    $existingMetadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
    foreach ($property in $existingMetadata.PSObject.Properties) {
        $metadata[$property.Name] = $property.Value
    }
}

$metadata[$safeName] = [ordered]@{
    Id = $safeName
    DisplayName = $safeName
    ModuleName = $safeName
    Fps = $Fps
    Looped = $true
    SourcePath = [string](Resolve-Path -LiteralPath $InputPath)
    ImportedAt = (Get-Date).ToString("o")
}

$metadataJson = $metadata | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($MetadataPath, $metadataJson, [System.Text.UTF8Encoding]::new($false))

& (Join-Path $PSScriptRoot "jetstream-refresh-catalog.ps1") -Fps $Fps

Write-Host "Imported Jetstream video module:" $destination
