$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

function Update-CommandPath {
  # winget 会更新注册表中的 PATH，当前终端需要自行刷新。
  $registered = @(
    [Environment]::GetEnvironmentVariable('Path', 'Machine')
    [Environment]::GetEnvironmentVariable('Path', 'User')
  ) -join ';'
  $entries = @($env:Path -split ';') + @($registered -split ';')
  $env:Path = ($entries | Where-Object { $_ } | Select-Object -Unique) -join ';'
}

function Test-Program([string] $name, [string[]] $arguments) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { return $false }
  try {
    & $name @arguments *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Find-YtDlp {
  $command = Get-Command yt-dlp -CommandType Application -ErrorAction SilentlyContinue
  if ($command -and (Test-Program $command.Source @('--version'))) { return $command.Source }

  # winget 可能已安装成功，但其目录尚未进入当前终端的 PATH。
  $packages = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
  if (Test-Path $packages) {
    foreach ($dir in (Get-ChildItem -LiteralPath $packages -Directory -Filter 'yt-dlp.yt-dlp_*' | Sort-Object LastWriteTime -Descending)) {
      $candidate = Join-Path $dir.FullName 'yt-dlp.exe'
      if (Test-Program $candidate @('--version')) { return $candidate }
    }
  }

  $local = Join-Path (Get-Location).Path '.tools\yt-dlp.exe'
  if (Test-Program $local @('--version')) { return $local }
  return $null
}

function Install-WingetPackage([string] $id) {
  if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw "缺少 $id，且未找到 winget。请先安装 Windows App Installer。"
  }
  Write-Host "正在安装 $id ..."
  & winget.exe install --id $id --exact --source winget --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw "$id 安装失败（退出码 $LASTEXITCODE）" }
  Update-CommandPath
}

function Test-NodeVersion {
  if (-not (Test-Program 'node.exe' @('--version'))) { return $false }
  $version = (& node.exe --version).Trim()
  if ($version -notmatch '^v(\d+)\.(\d+)\.') { return $false }
  return [int]$Matches[1] -ge 22
}

function Test-PnpmVersion {
  if (-not (Test-Program 'pnpm.cmd' @('--version'))) { return $false }
  $version = (& pnpm.cmd --version 2>$null | Select-Object -Last 1).Trim()
  return $version -match '^(\d+)\.' -and [int]$Matches[1] -ge 10
}

Update-CommandPath

if (-not (Test-NodeVersion) -or -not (Test-Program 'npm.cmd' @('--version'))) {
  Install-WingetPackage 'OpenJS.NodeJS.LTS'
}
if (-not (Test-NodeVersion) -or -not (Test-Program 'npm.cmd' @('--version'))) {
  throw 'Node.js 22+ 或 npm 仍不可用，请重开终端后运行 scripts/init.cmd。'
}
Write-Host 'OK Node.js / npm'

$ffmpeg = if ($env:FFMPEG_BIN) { $env:FFMPEG_BIN } else { 'ffmpeg' }
$ffprobe = if ($env:FFPROBE_BIN) { $env:FFPROBE_BIN } else { 'ffprobe' }
if (-not (Test-Program $ffmpeg @('-version')) -or -not (Test-Program $ffprobe @('-version'))) {
  if ($env:FFMPEG_BIN -or $env:FFPROBE_BIN) { throw 'FFMPEG_BIN 或 FFPROBE_BIN 指向的程序不可用。' }
  Install-WingetPackage 'Gyan.FFmpeg'
}
if (-not (Test-Program $ffmpeg @('-version')) -or -not (Test-Program $ffprobe @('-version'))) {
  throw 'FFmpeg 或 FFprobe 仍不可用，请重开终端后运行 scripts/init.cmd。'
}
Write-Host 'OK FFmpeg / FFprobe'

$ytDlp = if ($env:YT_DLP_BIN) { $env:YT_DLP_BIN } else { Find-YtDlp }
if (-not $ytDlp -or -not (Test-Program $ytDlp @('--version'))) {
  if ($env:YT_DLP_BIN) { throw 'YT_DLP_BIN 指向的程序不可用。' }
  Install-WingetPackage 'yt-dlp.yt-dlp'
  $ytDlp = Find-YtDlp
}
if (-not $ytDlp -or -not (Test-Program $ytDlp @('--version'))) {
  throw 'yt-dlp 仍不可用，请重开终端后运行 scripts/init.cmd。'
}
if (-not $env:YT_DLP_BIN) {
  # 服务从固定的项目路径启动 yt-dlp，不受当前终端 PATH 是否刷新的影响。
  $toolsDir = Join-Path (Get-Location).Path '.tools'
  New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
  $localYtDlp = Join-Path $toolsDir 'yt-dlp.exe'
  if ($ytDlp -ne $localYtDlp) {
    Copy-Item -LiteralPath $ytDlp -Destination $localYtDlp -Force
  }
  if (-not (Test-Program $localYtDlp @('--version'))) {
    throw '项目本地 yt-dlp 不可用。'
  }
}
Write-Host 'OK yt-dlp'

if (-not (Test-PnpmVersion)) {
  Write-Host '正在安装 pnpm 10.9.0 ...'
  & npm.cmd install --global pnpm@10.9.0
  if ($LASTEXITCODE -ne 0) { throw "pnpm 安装失败（退出码 $LASTEXITCODE）" }
  Update-CommandPath
  $npmPrefix = (& npm.cmd config get prefix | Select-Object -Last 1).Trim()
  $env:Path = "$npmPrefix;$env:Path"
}
if (-not (Test-PnpmVersion)) { throw 'pnpm 10+ 仍不可用。' }
Write-Host 'OK pnpm'

Write-Host '正在安装项目依赖 ...'
& pnpm.cmd install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "项目依赖安装失败（退出码 $LASTEXITCODE）" }
Write-Host '初始化完成。请重启开发服务并运行 pnpm.cmd dev；若找不到 pnpm.cmd，再重开 PowerShell。'
