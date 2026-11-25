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
  $major = [int]$Matches[1]
  $minor = [int]$Matches[2]
  return $major -gt 22 -or ($major -eq 22 -and $minor -ge 19)
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
  throw 'Node.js 22.19+ 或 npm 仍不可用，请重开终端后运行 scripts/init.cmd。'
}
Write-Host 'OK Node.js / npm'

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

& pnpm.cmd run setup
if ($LASTEXITCODE -ne 0) { throw "运行环境准备失败（退出码 $LASTEXITCODE）" }
Write-Host '初始化完成。运行 pnpm.cmd dev 启动项目。'
