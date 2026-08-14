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

# Upstream dsh 0.1.0-rc.x forces the native Win32 COM folder dialog on Windows,
# whose koffi-driven worker is unstable on some machines and fails with
# "win32 folder dialog worker exited before reporting a result". The dsh
# browse backend (in-app directory browser) is fully supported and works
# everywhere; make Windows use it until upstream ships a fix.
Write-Host "[3/5] Patching dsh directory picker to use the browse backend on Windows..."
$pickerAuto = Join-Path $dshRoot "node_modules\@deepseek-ai\dsh-host-directory-picker-auto\lib\index.js"
if (-not (Test-Path $pickerAuto)) { throw "dsh directory-picker-auto not found: $pickerAuto" }
$pickerContent = Get-Content $pickerAuto -Raw
$pickerOld = 'if (facts.platform === "darwin" || facts.platform === "win32") return "native";'
$pickerNew = 'if (facts.platform === "darwin") return "native";'
if (-not $pickerContent.Contains($pickerOld)) {
    throw "directory-picker-auto marker not found; upstream may have changed, please re-check the patch"
}
Set-Content -Path $pickerAuto -Value ($pickerContent.Replace($pickerOld, $pickerNew)) -Encoding UTF8 -NoNewline
Write-Host "    patched: win32 directory picker -> browse"

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
