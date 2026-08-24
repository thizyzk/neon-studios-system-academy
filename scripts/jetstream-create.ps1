param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [Alias("Input")]
    [ValidateNotNullOrEmpty()]
    [string]$InputPath,

    [double]$Fps = 29.99,

    [bool]$Big = $true
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"

$Jetstream = Join-Path $env:APPDATA "Python\Python314\Scripts\jetstream.exe"
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

$ResolvedInput = Resolve-Path -LiteralPath $InputPath
$transformFps = [Math]::Max(1, [int][Math]::Round($Fps))
& $Jetstream create --name $Name --input $ResolvedInput --fps $transformFps --big $Big
