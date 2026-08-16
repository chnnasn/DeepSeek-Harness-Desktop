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
npm install "@deepseek-ai/dsh@$Version" pnpm --omit=dev --prefix $dshRoot --no-audit --no-fund
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

# Patch the plugin-inventory page: add a per-plugin enable/disable toggle that
# writes the machine-local user patch layer through the Electron bridge in
# main.js (plugin toggle server on :3091). Upstream's inventory page is
# read-only; this build of client.js adds the switch + "restart to apply".
Write-Host "[3.25/5] Patching plugin-inventory page (plugin toggle)..."
$invSrc = Join-Path $repoRoot "scripts\plugin-inventory-client.patch.js"
$invDst = Join-Path $dshRoot "node_modules\@deepseek-ai\dsh-client-ui-settings-plugin-inventory\lib\client.js"
if (-not (Test-Path $invSrc)) { throw "inventory client patch source not found: $invSrc" }
if (-not (Test-Path $invDst)) { throw "inventory client target not found: $invDst" }
Copy-Item -LiteralPath $invSrc -Destination $invDst -Force
Write-Host "    replaced plugin-inventory client with toggle-enabled build"

# Patch the theme (Appearance) row: embed the custom-appearance page (color
# tokens + optional background image) served by the Electron shell at
# /appearance-page, so it lives inside the General settings like other rows.
Write-Host "[3.27/5] Patching theme row (custom appearance)..."
$themeSrc = Join-Path $repoRoot "scripts\theme-client.patch.js"
$themeDst = Join-Path $dshRoot "node_modules\@deepseek-ai\dsh-client-ui-theme\lib\client.js"
if (-not (Test-Path $themeSrc)) { throw "theme patch source not found: $themeSrc" }
if (-not (Test-Path $themeDst)) { throw "theme client target not found: $themeDst" }
Copy-Item -LiteralPath $themeSrc -Destination $themeDst -Force
Write-Host "    replaced theme client with custom-appearance build"

# Hide console windows for every dsh-spawned child process. Upstream
# dsh-subprocess-local spawns without `windowsHide`, so each pwsh/bash/ripgrep
# invocation flashes a console window on Windows. One-line fix, applied as a
# string patch so it survives dsh upgrades without carrying a full file copy.
Write-Host "[3.3/5] Patching subprocess spawn (hide console windows)..."
$subproc = Join-Path $dshRoot "node_modules\@deepseek-ai\dsh-subprocess-local\lib\index.js"
$subprocText = Get-Content -LiteralPath $subproc -Raw

$spawnOld = @'
		cwd: spec.cwd,
		env,
		stdio: [
'@

$spawnNew = @'
		cwd: spec.cwd,
		env,
		windowsHide: true,
		stdio: [
'@

if ($subprocText.Contains($spawnOld)) {
    $subprocText = $subprocText.Replace($spawnOld, $spawnNew)
    [System.IO.File]::WriteAllText($subproc, $subprocText, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "    added windowsHide: true to subprocess spawn"
} elseif ($subprocText.Contains("windowsHide: true")) {
    Write-Host "    subprocess spawn already patched"
} else {
    throw "subprocess-local spawn options not recognized (dsh may have changed it)"
}

# Prune the dsh runtime for a x64-Windows-only target: drop other-platform
# prebuilds, sharp's WASM fallback, and dev-only files (.map/.d.ts/.md/tests/
# docs). Nothing removed here is ever loaded by the x64 Windows runtime, so it
# is pure size/install-time win with zero behavior change.
Write-Host "[3.5/5] Pruning dsh runtime (platform binaries + dev files)..."
& (Join-Path $repoRoot "scripts\prune-dsh.ps1") -DshRoot $dshRoot

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
