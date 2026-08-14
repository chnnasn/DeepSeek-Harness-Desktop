param(
    [string]$Version = "0.1.0-rc.6",
    [string]$NodeVersion = "24.19.0",
    [string]$EnigmaVbConsole = ""
)

$ErrorActionPreference = "Stop"

# ---------- helpers ----------

function New-EvbProject {
    param([string]$InputExe, [string]$OutputExe, [string]$RootPath)
    $sb = New-Object System.Text.StringBuilder
    $esc = { param($s) [System.Security.SecurityElement]::Escape([string]$s) }
    [void]$sb.AppendLine('<?xml version="1.0" encoding="windows-1252"?>')
    [void]$sb.AppendLine('<>')
    [void]$sb.AppendLine("  <InputFile>$(& $esc $InputExe)</InputFile>")
    [void]$sb.AppendLine("  <OutputFile>$(& $esc $OutputExe)</OutputFile>")
    [void]$sb.AppendLine('  <Files>')
    [void]$sb.AppendLine('    <Enabled>True</Enabled>')
    [void]$sb.AppendLine('    <DeleteExtractedOnExit>False</DeleteExtractedOnExit>')
    [void]$sb.AppendLine('    <CompressFiles>False</CompressFiles>')
    [void]$sb.AppendLine('    <Files>')
    [void]$sb.AppendLine('      <File>')
    [void]$sb.AppendLine('        <Type>3</Type>')
    [void]$sb.AppendLine('        <Name>%DEFAULT FOLDER%</Name>')
    [void]$sb.AppendLine('        <Action>0</Action>')
    [void]$sb.AppendLine('        <OverwriteDateTime>False</OverwriteDateTime>')
    [void]$sb.AppendLine('        <OverwriteAttributes>False</OverwriteAttributes>')
    [void]$sb.AppendLine('        <HideFromDialogs>0</HideFromDialogs>')
    [void]$sb.AppendLine('        <Files>')
    # The launcher resolves bundled files relative to the executable as
    # runtime\node.exe and runtime\dsh\.... Keep the same directory level in
    # the virtual filesystem instead of placing both entries at its root.
    Emit-EvbNode $sb $RootPath 'runtime' 10
    [void]$sb.AppendLine('        </Files>')
    [void]$sb.AppendLine('      </File>')
    [void]$sb.AppendLine('    </Files>')
    [void]$sb.AppendLine('  </Files>')
    [void]$sb.AppendLine('  <Registries>')
    [void]$sb.AppendLine('    <Enabled>False</Enabled>')
    [void]$sb.AppendLine('    <Registries>')
    foreach ($rn in @('Classes','User','Machine','Users','Config')) {
        [void]$sb.AppendLine('      <Registry>')
        [void]$sb.AppendLine('        <Type>1</Type>')
        [void]$sb.AppendLine('        <Virtual>True</Virtual>')
        [void]$sb.AppendLine("        <Name>$rn</Name>")
        [void]$sb.AppendLine('        <ValueType>0</ValueType>')
        [void]$sb.AppendLine('        <Value/>')
        [void]$sb.AppendLine('        <Registries/>')
        [void]$sb.AppendLine('      </Registry>')
    }
    [void]$sb.AppendLine('    </Registries>')
    [void]$sb.AppendLine('  </Registries>')
    [void]$sb.AppendLine('  <Packaging>')
    [void]$sb.AppendLine('    <Enabled>False</Enabled>')
    [void]$sb.AppendLine('  </Packaging>')
    [void]$sb.AppendLine('  <Options>')
    # node.exe is launched as a child process and must be able to read the
    # bundled runtime\dsh tree from the parent's virtual filesystem.
    [void]$sb.AppendLine('    <ShareVirtualSystem>True</ShareVirtualSystem>')
    [void]$sb.AppendLine('    <MapExecutableWithTemporaryFile>True</MapExecutableWithTemporaryFile>')
    [void]$sb.AppendLine('    <TemporaryFileMask/>')
    [void]$sb.AppendLine('    <AllowRunningOfVirtualExeFiles>True</AllowRunningOfVirtualExeFiles>')
    [void]$sb.AppendLine('    <ProcessesOfAnyPlatforms>False</ProcessesOfAnyPlatforms>')
    [void]$sb.AppendLine('  </Options>')
    [void]$sb.AppendLine('  <Storage>')
    [void]$sb.AppendLine('    <Files>')
    [void]$sb.AppendLine('      <Enabled>False</Enabled>')
    [void]$sb.AppendLine('      <Folder>%DEFAULT FOLDER%\</Folder>')
    [void]$sb.AppendLine('      <RandomFileNames>False</RandomFileNames>')
    [void]$sb.AppendLine('      <EncryptContent>False</EncryptContent>')
    [void]$sb.AppendLine('    </Files>')
    [void]$sb.AppendLine('  </Storage>')
    [void]$sb.AppendLine('</>')
    return $sb.ToString()
}

function Emit-EvbNode {
    param($sb, [string]$path, [string]$virtualName, [int]$indent)
    $esc = { param($s) [System.Security.SecurityElement]::Escape([string]$s) }
    $pad = ' ' * $indent
    if ([System.IO.Directory]::Exists($path)) {
        [void]$sb.AppendLine("$pad<File>")
        [void]$sb.AppendLine("$pad  <Type>3</Type>")
        [void]$sb.AppendLine("$pad  <Name>$(& $esc $virtualName)</Name>")
        [void]$sb.AppendLine("$pad  <Action>0</Action>")
        [void]$sb.AppendLine("$pad  <OverwriteDateTime>False</OverwriteDateTime>")
        [void]$sb.AppendLine("$pad  <OverwriteAttributes>False</OverwriteAttributes>")
        [void]$sb.AppendLine("$pad  <HideFromDialogs>0</HideFromDialogs>")
        [void]$sb.AppendLine("$pad  <Files>")
        foreach ($f in [System.IO.Directory]::GetFiles($path)) {
            Emit-EvbFileNode $sb $f ($indent + 4)
        }
        foreach ($d in [System.IO.Directory]::GetDirectories($path)) {
            Emit-EvbNode $sb $d ([System.IO.Path]::GetFileName($d)) ($indent + 4)
        }
        [void]$sb.AppendLine("$pad  </Files>")
        [void]$sb.AppendLine("$pad</File>")
    }
}

function Emit-EvbFileNode {
    param($sb, [string]$path, [int]$indent)
    $esc = { param($s) [System.Security.SecurityElement]::Escape([string]$s) }
    $pad = ' ' * $indent
    [void]$sb.AppendLine("$pad<File>")
    [void]$sb.AppendLine("$pad  <Type>2</Type>")
    [void]$sb.AppendLine("$pad  <Name>$(& $esc ([System.IO.Path]::GetFileName($path)))</Name>")
    [void]$sb.AppendLine("$pad  <File>$(& $esc $path)</File>")
    [void]$sb.AppendLine("$pad  <ActiveX>False</ActiveX>")
    [void]$sb.AppendLine("$pad  <ActiveXInstall>False</ActiveXInstall>")
    [void]$sb.AppendLine("$pad  <Action>0</Action>")
    [void]$sb.AppendLine("$pad  <OverwriteDateTime>False</OverwriteDateTime>")
    [void]$sb.AppendLine("$pad  <OverwriteAttributes>False</OverwriteAttributes>")
    [void]$sb.AppendLine("$pad  <PassCommandLine>False</PassCommandLine>")
    [void]$sb.AppendLine("$pad  <HideFromDialogs>0</HideFromDialogs>")
    [void]$sb.AppendLine("$pad</File>")
}

# ---------- main pipeline ----------

$repoRoot = Split-Path -Parent $PSScriptRoot   # scripts/ -> repo root
$dist     = Join-Path $repoRoot "dist"
$work     = Join-Path $repoRoot "build"
$runtime  = Join-Path $dist "runtime"

Write-Host "[1/6] Cleaning previous build..."
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dist, $runtime, $work | Out-Null

Write-Host "[2/6] Building Go launcher -> Desktop.exe ..."
go install github.com/akavel/rsrc@latest
$gopath = (go env GOPATH).Trim()
$rsrc = Join-Path (Join-Path $gopath "bin") "rsrc.exe"
& $rsrc -ico (Join-Path $repoRoot "launcher\icon.ico") -o (Join-Path $repoRoot "launcher\rsrc_windows_amd64.syso")
if ($LASTEXITCODE -ne 0) { throw "rsrc: failed to embed icon" }
go build -C (Join-Path $repoRoot "launcher") -trimpath -ldflags "-s -w -H windowsgui" -o (Join-Path $dist "Desktop.exe") .
if ($LASTEXITCODE -ne 0) { throw "go build failed" }

Write-Host "[3/6] Downloading portable Node.js v$NodeVersion ..."
$nodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
$nodeZip = Join-Path $work "node.zip"
Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip -UseBasicParsing
Expand-Archive -Path $nodeZip -DestinationPath $work -Force
Copy-Item (Join-Path $work "node-v$NodeVersion-win-x64\node.exe") (Join-Path $runtime "node.exe") -Force

Write-Host "[4/6] Installing @deepseek-ai/dsh@$Version (production deps only)..."
$dshRoot = Join-Path $runtime "dsh"
New-Item -ItemType Directory -Force -Path $dshRoot | Out-Null
npm install "@deepseek-ai/dsh@$Version" --omit=dev --prefix $dshRoot --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

# Use the output name from the reference .evb if present (so manual .evb edits are honored)
$outputName = "DeepSeek-Harness-Desktop.exe"
$refEvb = Join-Path $PSScriptRoot "DeepSeek-Harness-Desktop.evb"
if (Test-Path $refEvb) {
    try {
        $refXml = [System.IO.File]::ReadAllText($refEvb, [System.Text.Encoding]::UTF8)
        $m = [regex]::Match($refXml, '<OutputFile>(.*?)</OutputFile>')
        if ($m.Success -and $m.Groups[1].Value.Trim()) {
            $outputName = [System.IO.Path]::GetFileName($m.Groups[1].Value.Trim())
        }
    } catch { }
}
$outputExe = Join-Path $dist $outputName
Write-Host "[5/6] Generating Enigma Virtual Box project (.evb) -> $outputName ..."
$evb = Join-Path $dist "DeepSeek-Harness-Desktop.evb"
$evbXml = New-EvbProject -InputExe (Join-Path $dist "Desktop.exe") -OutputExe $outputExe -RootPath $runtime
[System.IO.File]::WriteAllText($evb, $evbXml, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "[6/6] Packing with Enigma Virtual Box -> $outputName ..."
if (-not $EnigmaVbConsole) {
    foreach ($c in @(
        "D:\Enigma Virtual Box\enigmavbconsole.exe",
        "C:\Program Files (x86)\Enigma Virtual Box\enigmavbconsole.exe",
        "C:\Program Files\Enigma Virtual Box\enigmavbconsole.exe"
    )) { if (Test-Path $c) { $EnigmaVbConsole = $c; break } }
    if (-not $EnigmaVbConsole) {
        $cmd = Get-Command enigmavbconsole.exe -ErrorAction SilentlyContinue
        if ($cmd) { $EnigmaVbConsole = $cmd.Source }
    }
}
if (-not $EnigmaVbConsole -or -not (Test-Path $EnigmaVbConsole)) {
    throw "Not found: enigmavbconsole.exe. Install Enigma Virtual Box or pass -EnigmaVbConsole."
}
& $EnigmaVbConsole $evb
if ($LASTEXITCODE -ne 0) { throw "Enigma Virtual Box packing failed" }

Write-Host "Done: $outputExe"
