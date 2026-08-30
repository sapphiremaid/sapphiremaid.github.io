$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = Get-Command node.exe -ErrorAction SilentlyContinue

if (-not $node) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    'Greyblue needs Node.js on this computer. Install Node.js 22 or newer, then launch Greyblue again.',
    'Greyblue',
    'OK',
    'Error'
  ) | Out-Null
  exit 1
}

Start-Process -FilePath $node.Source -ArgumentList 'serve-greyblue.mjs' -WorkingDirectory $root -WindowStyle Hidden
