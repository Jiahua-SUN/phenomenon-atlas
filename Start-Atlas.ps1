param([switch]$NoBrowser, [int]$Port = 18811)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtimeDir = Join-Path $PSScriptRoot '.runtime'
$toolDir = Join-Path $runtimeDir 'tools'
New-Item -ItemType Directory -Path $toolDir -Force | Out-Null
$uvExe = Join-Path $toolDir 'uv.exe'
$env:UV_CACHE_DIR = Join-Path $runtimeDir 'uv-cache'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $runtimeDir 'python'
$env:UV_UNMANAGED_INSTALL = $toolDir
$env:UV_NO_MODIFY_PATH = '1'
if (-not (Test-Path -LiteralPath $uvExe)) {
    Write-Host 'Downloading the Python environment manager from Astral...'
    $installerFile = Join-Path $runtimeDir 'uv-installer.ps1'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://astral.sh/uv/0.13.6/install.ps1' -OutFile $installerFile
    & $installerFile
    if (-not (Test-Path -LiteralPath $uvExe)) { throw 'Could not install uv.' }
}
Write-Host 'Preparing the local environment. First launch needs an internet connection.'
$launchArgs = @('run','--locked','--managed-python','--python','3.13','python','-X','utf8','-I','launch.py','--port',"$Port")
if ($NoBrowser) { $launchArgs += '--no-browser' }
& $uvExe @launchArgs
exit $LASTEXITCODE
