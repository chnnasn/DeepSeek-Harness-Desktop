param(
    [string]$Version = "0.1.0-rc.6"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot   # scripts/ -> repo root
$dist     = Join-Path $repoRoot "dist"
$work     = Join-Path $repoRoot "build"
$dshRoot  = Join-Path $work "runtime\dsh"

Write-Host "[1/5] Cleaning previous build..."
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dist, $dshRoot | Out-Null

Write-Host "[2/5] Installing @deepseek-ai/dsh@$Version (production deps only)..."
npm install "@deepseek-ai/dsh@$Version" --omit=dev --prefix $dshRoot --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

# dsh's Windows native folder picker drives the Win32 COM dialog through a
# koffi worker that is unstable on some machines ("win32 folder dialog worker
# exited before reporting a result"). Replace that worker with our delegate:
# it asks the Electron main process to show the OS dialog
# (dialog.showOpenDialog -> IFileDialog) and replies over a localhost socket.
# Keeps dsh's native flow AND the native Windows dialog UX.
Write-Host "[3/5] Replacing dsh folder-picker worker with Electron-dialog delegate..."
$workerSrc = Join-Path $repoRoot "electron\win32-dialog-worker.cjs"
$workerDst = Join-Path $dshRoot "node_modules\@deepseek-ai\dsh-host-directory-picker-native\lib\worker.cjs"
if (-not (Test-Path $workerSrc)) { throw "worker source not found: $workerSrc" }
if (-not (Test-Path $workerDst)) { throw "dsh worker target not found: $workerDst" }
Copy-Item -LiteralPath $workerSrc -Destination $workerDst -Force
Write-Host "    replaced dsh worker with Electron-dialog delegate"

# electron + electron-builder are devDependencies at the repo root. Install
# them on demand so local packagers only need Node.js (no Go, no EVB).
if (-not (Test-Path (Join-Path $repoRoot "node_modules\.bin\electron-builder.cmd"))) {
    Write-Host "Installing root dev dependencies (electron, electron-builder)..."
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "root npm install failed" }
}

Write-Host "[4/5] Packaging with electron-builder (NSIS setup) ..."
$builder = Join-Path $repoRoot "node_modules\.bin\electron-builder.cmd"
& $builder --win nsis --x64 --publish never
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

Write-Host "[5/5] Done."
Get-ChildItem $dist -Filter *.exe | Select-Object Name, @{n='SizeMB';e={[math]::Round($_.Length/1MB,1)}}, FullName
