param(
    [Parameter(Mandatory = $true)]
    [string]$Prompt,

    [string]$Name = "cube-output",
    [double]$ResolutionBase = 4.0,
    [double[]]$BoundingBoxXyz = @(1.0, 1.0, 1.0),
    [switch]$FastInference,
    [switch]$Postprocess
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$CubeRoot = Join-Path $ProjectRoot ".robloxcube\cube"
$Python = Join-Path $ProjectRoot ".robloxcube\.venv\Scripts\python.exe"
$OutputDir = Join-Path $ProjectRoot "generated-models\$Name"

if (-not (Test-Path $Python)) {
    throw "RobloxCube venv not found at $Python"
}

if (-not (Test-Path $CubeRoot)) {
    throw "RobloxCube repo not found at $CubeRoot"
}

New-Item -ItemType Directory -Force $OutputDir | Out-Null

$ArgsList = @(
    "-m", "cube3d.generate",
    "--gpt-ckpt-path", "model_weights\shape_gpt.safetensors",
    "--shape-ckpt-path", "model_weights\shape_tokenizer.safetensors",
    "--prompt", $Prompt,
    "--output-dir", $OutputDir,
    "--resolution-base", "$ResolutionBase",
    "--bounding-box-xyz", "$($BoundingBoxXyz[0])", "$($BoundingBoxXyz[1])", "$($BoundingBoxXyz[2])"
)

if ($FastInference) {
    $ArgsList += "--fast-inference"
}

if (-not $Postprocess) {
    $ArgsList += "--disable-postprocessing"
}

Push-Location $CubeRoot
try {
    & $Python @ArgsList
}
finally {
    Pop-Location
}

Write-Host "Generated OBJ: $OutputDir\output.obj"
