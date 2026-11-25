import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { constants } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
const [mode = 'doctor', ...args] = process.argv.slice(2);
const packages = {
  ffmpeg: { brew: 'ffmpeg', winget: 'Gyan.FFmpeg' },
  'yt-dlp': { brew: 'yt-dlp', winget: 'yt-dlp.yt-dlp' },
  python: { brew: 'python@3.13', winget: 'Python.Python.3.13' },
};

function probe(command, args) {
  return spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 10_000, windowsHide: true });
}

async function run(command, args, env = process.env) {
  const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  const forward = signal => child.kill(signal);
  process.on('SIGINT', forward);
  process.on('SIGTERM', forward);
  try {
    const [code, signal] = await once(child, 'exit');
    return signal ? 128 + constants.signals[signal] : code;
  } finally {
    process.off('SIGINT', forward);
    process.off('SIGTERM', forward);
  }
}

async function runChecked(command, args, label, env) {
  const code = await run(command, args, env);
  if (code) throw new Error(`${label}失败（退出码 ${code}）。`);
}

function addPath(paths) {
  process.env.PATH = [...new Set([...(process.env.PATH ?? '').split(delimiter), ...paths].filter(Boolean))].join(delimiter);
}

function refreshToolPath() {
  if (windows) {
    // WinGet 更新用户或系统 PATH，启动服务前把这些目录同步进当前进程。
    const result = probe('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "[Console]::OutputEncoding = [Text.Encoding]::UTF8; [Environment]::GetEnvironmentVariable('Path', 'User'); [Environment]::GetEnvironmentVariable('Path', 'Machine')"]);
    if (result.status !== 0) throw new Error('无法读取 Windows 的用户和系统 PATH。');
    addPath(result.stdout.trim().split(/[;\r\n]+/));
  } else if (process.platform === 'darwin') {
    const bin = process.arch === 'arm64' ? '/opt/homebrew/bin' : '/usr/local/bin';
    if (existsSync(join(bin, 'brew'))) addPath([bin]);
  }
}

async function install(names) {
  if (windows) {
    if (probe('winget.exe', ['--version']).status !== 0) throw new Error('缺少运行依赖，请先安装带有 WinGet 的 Windows App Installer。');
    for (const name of names) {
      const id = packages[name].winget;
      console.log(`正在安装 ${id}…`);
      await runChecked('winget.exe', ['install', '--id', id, '--exact', '--source', 'winget', '--silent',
        '--accept-package-agreements', '--accept-source-agreements'], `安装 ${id}`);
    }
  } else {
    if (probe('brew', ['--version']).status !== 0) throw new Error('缺少运行依赖，请在 PATH 中提供 Homebrew 或安装缺失的工具。');
    const formulae = names.map(name => packages[name].brew);
    console.log(`正在安装 ${formulae.join('、')}…`);
    await runChecked('brew', ['install', ...formulae], `安装 ${formulae.join('、')}`, {
      ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_INSTALL_CLEANUP: '1',
    });
  }
  refreshToolPath();
}

function checkMedia(tools) {
  return tools.map(tool => {
    const result = probe(tool.bin, [tool.versionArg]);
    return { ...tool, ready: result.status === 0, version: result.stdout?.split(/\r?\n/, 1)[0] };
  });
}

function showMedia(statuses) {
  for (const { label, bin, ready, version } of statuses) {
    console.log(ready ? `OK ${label}  ${version}` : `MISSING ${label}  ${bin}`);
  }
}

async function prepareMedia(tools) {
  let statuses = checkMedia(tools);
  const missing = statuses.filter(tool => !tool.ready);
  const invalid = missing.find(tool => process.env[tool.override]);
  if (invalid) throw new Error(`${invalid.override} 指定的程序不可用（${invalid.bin}）。`);
  if (missing.length) {
    showMedia(missing);
    await install([...new Set(missing.map(tool => tool.package))]);
    statuses = checkMedia(tools);
  }
  showMedia(statuses);
  if (statuses.some(tool => !tool.ready)) throw new Error('安装后仍有媒体工具不可执行，请检查 PATH。');
}

function pnpm(args) {
  const cli = process.env.npm_execpath;
  if (!cli) throw new Error('请通过 pnpm 运行此命令。');
  return /\.[cm]?js$/i.test(cli) ? run(process.execPath, [cli, ...args]) : run(cli, args);
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 19)) throw new Error('需要 Node.js 22.19 或更新版本。');
  console.log(`OK Node.js  ${process.version}`);
  refreshToolPath();

  // 后端子进程在 apps/server 中运行，启动前把显式文件路径解析到项目根目录。
  for (const name of ['FFMPEG_BIN', 'FFPROBE_BIN', 'YT_DLP_BIN', 'X_MONITOR_PYTHON']) {
    const value = process.env[name];
    if (value && value !== basename(value)) process.env[name] = resolve(root, value);
  }
  const { DATA_ROOT, DIRS, FFMPEG, FFPROBE, ytDlpBin } = await import('../apps/server/src/config.ts');
  process.env.CREATOR_STUDIO_DATA_DIR = DATA_ROOT;
  const { createPythonRuntime } = await import('../apps/server/src/harness/x-monitor/python.ts');
  const media = [
    { label: 'FFmpeg', bin: FFMPEG, versionArg: '-version', override: 'FFMPEG_BIN', package: 'ffmpeg' },
    { label: 'FFprobe', bin: FFPROBE, versionArg: '-version', override: 'FFPROBE_BIN', package: 'ffmpeg' },
    { label: 'yt-dlp', bin: ytDlpBin(), versionArg: '--version', override: 'YT_DLP_BIN', package: 'yt-dlp' },
  ];
  const python = createPythonRuntime(DIRS.xMonitor, new AbortController().signal);

  if (mode === 'doctor') {
    const statuses = checkMedia(media);
    showMedia(statuses);
    const { python: executable, base } = await python.inspect();
    console.log(executable ? `OK X 监控  ${executable}` : base
      ? `MISSING X 监控依赖  找到 Python ${base}`
      : 'MISSING X 监控  需要 Python 3.10 或更新版本');
    if (!executable || statuses.some(tool => !tool.ready)) process.exitCode = 1;
    return;
  }

  console.log('正在检查工作区依赖…');
  const installCode = await pnpm(['install', '--frozen-lockfile', '--prefer-offline']);
  if (installCode) throw new Error(`工作区依赖安装失败（退出码 ${installCode}）。`);
  await prepareMedia(media);
  console.log('正在准备 X 监控的 Python 环境…');
  console.log(`OK X 监控  ${await python.ensure(() => install(['python']))}`);

  if (mode === 'dev') {
    const code = await pnpm(['build:contracts']);
    if (code) throw new Error(`共享类型构建失败（退出码 ${code}）。`);
    process.exitCode = await pnpm(['--parallel', '--filter', '@creator-studio/web', '--filter', '@creator-studio/server', 'dev', ...args]);
  } else if (mode === 'start') {
    process.exitCode = await pnpm(['--filter', '@creator-studio/server', 'start', ...args]);
  }
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
