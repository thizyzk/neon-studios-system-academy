$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$GuiRoot = Join-Path $ProjectRoot "tools\robloxcube-gui"
$BuildRoot = Join-Path $GuiRoot "build"
$ClassesRoot = Join-Path $BuildRoot "classes"
$JarPath = Join-Path $BuildRoot "RobloxCubeGui.jar"
$SourcePath = Join-Path $GuiRoot "RobloxCubeGui.java"
$JdkBin = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot\bin"

if (Test-Path $JdkBin) {
    $env:Path = "$JdkBin;$env:Path"
}

$Java = (Get-Command javaw.exe -ErrorAction SilentlyContinue)
if (-not $Java) {
    $Java = Get-Command java.exe -ErrorAction Stop
}

$Javac = Get-Command javac.exe -ErrorAction SilentlyContinue
if (-not $Javac) {
    throw "JDK nao encontrado. Instale o JDK 21 ou rode: winget install --id EclipseAdoptium.Temurin.21.JDK -e"
}

$LatestJar = Get-ChildItem $BuildRoot -Filter "RobloxCubeGui*.jar" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

if ($LatestJar) {
    $JarPath = $LatestJar.FullName
}

$NeedsBuild = -not $LatestJar
if (-not $NeedsBuild) {
    $NeedsBuild = (Get-Item $SourcePath).LastWriteTimeUtc -gt $LatestJar.LastWriteTimeUtc
}

if ($NeedsBuild) {
    New-Item -ItemType Directory -Force $ClassesRoot | Out-Null
    & $Javac.Source "-encoding" "UTF-8" "-d" $ClassesRoot $SourcePath
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao compilar a interface Java."
    }
    $Stamp = Get-Date -Format "yyyyMMddHHmmss"
    $JarPath = Join-Path $BuildRoot "RobloxCubeGui-$Stamp.jar"
    & jar.exe "--create" "--file" $JarPath "--main-class" "RobloxCubeGui" "-C" $ClassesRoot "."
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao criar o JAR da interface Java."
    }
}

Get-ChildItem $BuildRoot -Filter "RobloxCubeGui-*.jar" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -Skip 3 |
    Remove-Item -Force -ErrorAction SilentlyContinue

$JavaArgs = "-jar `"$JarPath`" `"$ProjectRoot`""
Start-Process -FilePath $Java.Source -ArgumentList $JavaArgs -WorkingDirectory $ProjectRoot
