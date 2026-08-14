param(
    [string]$Version = "0.1.0-rc.6"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot   # scripts/ -> repo root
$dist     = Join-Path $repoRoot "dist"
$work     = Join-Path $repoRoot "build"
$dshRoot  = Join-Path $work "runtime\dsh"

Write-Host "[1/4] Cleaning previous build..."
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dist, $dshRoot | Out-Null

Write-Host "[2/4] Installing @deepseek-ai/dsh@$Version (production deps only)..."
npm install "@deepseek-ai/dsh@$Version" --omit=dev --prefix $dshRoot --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

# electron + electron-builder are devDependencies at the repo root. Install
# them on demand so local packagers only need Node.js (no Go, no EVB).
if (-not (Test-Path (Join-Path $repoRoot "node_modules\.bin\electron-builder.cmd"))) {
    Write-Host "Installing root dev dependencies (electron, electron-builder)..."
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "root npm install failed" }
}

Write-Host "[3/4] Packaging with electron-builder (portable single exe) ..."
$builder = Join-Path $repoRoot "node_modules\.bin\electron-builder.cmd"
& $builder --win portable --x64
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

Write-Host "[4/4] Done."
Get-ChildItem $dist -Filter *.exe | Select-Object Name, @{n='SizeMB';e={[math]::Round($_.Length/1MB,1)}}, FullName