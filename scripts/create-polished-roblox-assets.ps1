$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Blender = "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"
$Script = Join-Path $PSScriptRoot "create-polished-roblox-assets.py"

if (-not (Test-Path $Blender)) {
    throw "Blender not found at $Blender"
}

& $Blender --background --python $Script

Write-Host "Polished assets written to: $ProjectRoot\generated-models\polished"
