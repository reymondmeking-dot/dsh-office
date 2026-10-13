# Build DSH Office: copy app into Electron resources, rename exe, set icon, create desktop shortcut.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist\DSH Office'
$ver = '39.8.5'
$zip = Join-Path $env:LOCALAPPDATA "electron\Cache\electron-v$ver-win32-x64.zip"
if (-not (Test-Path $zip)) {
  $mirror = if ($env:ELECTRON_MIRROR) { $env:ELECTRON_MIRROR.TrimEnd('/') } else { 'https://github.com/electron/electron/releases/download' }
  $url = "$mirror/v$ver/electron-v$ver-win32-x64.zip"
  Write-Host "downloading $url"
  New-Item -ItemType Directory -Force (Split-Path $zip) | Out-Null
  Invoke-WebRequest -Uri $url -OutFile "$zip.tmp" -UseBasicParsing
  Move-Item "$zip.tmp" $zip -Force
}

if (-not (Test-Path (Join-Path $dist 'electron.exe')) -and -not (Test-Path (Join-Path $dist 'DSH Office.exe'))) {
  New-Item -ItemType Directory -Force $dist | Out-Null
  tar -xf $zip -C $dist
}
node (Join-Path $root 'scripts\make-icon.cjs') (Join-Path $root 'app\icon.ico')

$res = Join-Path $dist 'resources'
Remove-Item -Recurse -Force (Join-Path $res 'default_app.asar') -ErrorAction SilentlyContinue
$appDst = Join-Path $res 'app'
if (Test-Path $appDst) { Remove-Item -Recurse -Force $appDst }
Copy-Item -Recurse (Join-Path $root 'app') $appDst

$exe = Join-Path $dist 'DSH Office.exe'
if (Test-Path (Join-Path $dist 'electron.exe')) {
  if (Test-Path $exe) { Remove-Item -Force $exe }
  Rename-Item (Join-Path $dist 'electron.exe') 'DSH Office.exe'
}
$rcedit = 'C:\Users\Administrator\AppData\Local\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\rcedit-x64.exe'
if (Test-Path $rcedit) {
  & $rcedit $exe --set-icon (Join-Path $root 'app\icon.ico') --set-version-string FileDescription 'DSH Office' --set-version-string ProductName 'DSH Office' --set-file-version 1.0.0 --set-product-version 1.0.0
}

$desktop = [Environment]::GetFolderPath('Desktop')
$ws = New-Object -ComObject WScript.Shell
foreach ($lnkDir in @($desktop, (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) {
  $lnk = $ws.CreateShortcut((Join-Path $lnkDir 'DSH Office.lnk'))
  $lnk.TargetPath = $exe
  $lnk.WorkingDirectory = $dist
  $lnk.IconLocation = "$exe,0"
  $lnk.Description = 'DSH Office - pixel-office multi-agent desktop app'
  $lnk.Save()
}
Write-Host "Built: $exe"
