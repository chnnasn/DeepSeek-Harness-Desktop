# Prune the dsh runtime for a x64-Windows-only target.
#
# Removes only files that the x64 Windows runtime NEVER loads:
#   1. other-platform prebuilds  (win32-arm64 / darwin-* / linux-* ...)
#   2. sharp's WASM fallback     (@img/sharp-wasm32 — native win32-x64 is present)
#   3. dev-only files            (.map / .d.ts / .md / .tsbuildinfo / .pdb / .ilk / .exp / .lib / .obj)
#   4. dev-only directories      (test / docs / examples / benchmark ...)
#
# Keeps: prebuilds/win32-x64 and every .node/.dll/.wasm/.exe that
# node-pty/sharp/koffi actually load at runtime.
#
# Idempotent: running it twice is a no-op.
#
# Usage: .\scripts\prune-dsh.ps1 -DshRoot <path-to-dsh-runtime>

param(
    [Parameter(Mandatory = $true)][string]$DshRoot
)

$ErrorActionPreference = "Stop"

$nm = Join-Path $DshRoot "node_modules"
if (-not (Test-Path $nm)) { throw "node_modules not found: $nm" }

function Get-SizeMB($path) {
    $sum = (Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    return [math]::Round($sum / 1MB, 1)
}

$before = Get-SizeMB $nm

# 1) other-platform prebuilds (keep only win32-x64)
Get-ChildItem $nm -Recurse -Directory -Filter "prebuilds" -ErrorAction SilentlyContinue |
    ForEach-Object {
        Get-ChildItem $_.FullName -Directory |
            Where-Object { $_.Name -ne "win32-x64" } |
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }

# 2) sharp platform packages (keep win32-x64 + the shared 'colour' helper)
$imgDir = Join-Path $nm "@img"
if (Test-Path $imgDir) {
    Get-ChildItem $imgDir -Directory |
        Where-Object { $_.Name -ne "sharp-win32-x64" -and $_.Name -ne "colour" } |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

# 3) dev-only file types
Get-ChildItem $nm -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Extension -in ".map", ".md", ".markdown", ".tsbuildinfo", ".pdb", ".ilk", ".exp", ".lib", ".obj", ".iobj", ".ipdb" -or
        $_.Name -match '\.d\.(ts|mts|cts)$'
    } |
    Remove-Item -Force -ErrorAction SilentlyContinue

# 4) dev-only directories
Get-ChildItem $nm -Recurse -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -in "test", "tests", "__tests__", "benchmark", "bench", "examples", "example", "docs", ".github", ".nyc_output" } |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# 5) node-pty build-time-only dirs. The runtime loads .node from
#    prebuilds/win32-x64 and resolves conpty.dll / winpty-agent.exe relative to
#    the .node's own directory (src/win/conpty.cc -> GetModuleFileNameW), so
#    the source + build trees below are never read at runtime.
$np = Join-Path $nm "node-pty"
if (Test-Path $np) {
    foreach ($d in @("third_party", "deps", "src", "build")) {
        $p = Join-Path $np $d
        if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

# 6) desktop pet — removed from the default web profile (see package.ps1);
#    drop the package so it is not shipped at all. No other bundled package
#    imports it statically, so removing the dir is safe.
$petDir = Join-Path $nm "@linxin666\dsh-pet"
if (Test-Path $petDir) { Remove-Item $petDir -Recurse -Force -ErrorAction SilentlyContinue }
$after = Get-SizeMB $nm
$files = (Get-ChildItem $nm -Recurse -File -ErrorAction SilentlyContinue).Count

Write-Host ("    pruned dsh runtime: {0:N1} MB -> {1:N1} MB ({2:N0} files)" -f $before, $after, $files)
