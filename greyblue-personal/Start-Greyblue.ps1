$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Show-GreyblueError([string]$message) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    $message,
    'Greyblue',
    'OK',
    'Error'
  ) | Out-Null
}

$bundledNode = Join-Path $root 'runtime\node.exe'
if (Test-Path -LiteralPath $bundledNode -PathType Leaf) {
  $nodePath = $bundledNode
  $runtimeLabel = 'bundled runtime'
} else {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) {
    Show-GreyblueError 'This Greyblue copy does not include its bundled runtime and Node.js was not found on this computer. Use the packaged private build, or install Node.js 22 or newer for a source checkout.'
    exit 1
  }
  $nodePath = $node.Source
  $runtimeLabel = 'system Node.js'
}

try {
  $versionText = (& $nodePath --version 2>$null | Select-Object -First 1).Trim()
  if ($LASTEXITCODE -ne 0 -or $versionText -notmatch '^v(?<major>\d+)\.') {
    throw "unexpected version response: $versionText"
  }
  $majorVersion = [int]$Matches['major']
} catch {
  Show-GreyblueError "Greyblue could not start its $runtimeLabel. Re-extract the packaged build, or install Node.js 22 or newer for a source checkout."
  exit 1
}

if ($majorVersion -lt 22) {
  Show-GreyblueError "Greyblue needs Node.js 22 or newer. The selected $runtimeLabel is $versionText. Use the packaged private build, or update Node.js for a source checkout."
  exit 1
}

Start-Process -FilePath $nodePath -ArgumentList 'serve-greyblue.mjs' -WorkingDirectory $root -WindowStyle Hidden
