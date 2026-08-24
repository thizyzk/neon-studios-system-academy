param(
    [Parameter(Mandatory = $true)]
    [string]$ApiKey,

    [Parameter(Mandatory = $true)]
    [string]$UploaderId,

    [switch]$Test
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"

$Jetstream = Join-Path $env:APPDATA "Python\Python314\Scripts\jetstream.exe"
if (-not (Test-Path $Jetstream)) {
    throw "jetstream.exe was not found at $Jetstream. Run: pip install --user jetstreamcli"
}

& $Jetstream roblox set --key $ApiKey
& $Jetstream roblox uploader --id $UploaderId

if ($Test) {
    & $Jetstream roblox test
}
