import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const requirementsPath = fileURLToPath(new URL('./requirements.txt', import.meta.url));
const checkVersion = 'import sys; sys.exit(sys.version_info < (3, 10))';
const checkPackage = 'import sys, twscrape; from importlib.metadata import version; sys.exit("twscrape==" + version("twscrape") != sys.argv[1])';

function runtimeError(message: string) {
  return Object.assign(new Error(message), { code: 'runtime_missing', statusCode: 503 });
}

export function createPythonRuntime(directory: string, signal: AbortSignal) {
  const environment = join(directory, 'python');
  const windows = process.platform === 'win32';
  const managedPython = windows ? join(environment, 'Scripts', 'python.exe') : join(environment, 'bin', 'python');
  let preparation: Promise<string> | undefined;

  function run(python: string, args: string[], timeout = 10_000) {
    return exec(python, args, { signal, timeout, cwd: directory, windowsHide: true });
  }

  async function hasPackage(python: string, requirement: string) {
    try {
      await run(python, ['-c', checkPackage, requirement]);
      return true;
    } catch {
      signal.throwIfAborted();
      return false;
    }
  }

  async function prepare() {
    const requirement = (await readFile(requirementsPath, 'utf8')).trim();
    const override = process.env.X_MONITOR_PYTHON?.trim();
    const base = override || (windows ? 'python' : 'python3');
    if (!override && await hasPackage(managedPython, requirement)) return managedPython;
    try {
      await run(base, ['-c', checkVersion]);
    } catch {
      signal.throwIfAborted();
      throw runtimeError(override
        ? 'X_MONITOR_PYTHON 需指向可运行的 Python 3.10 或更新版本。'
        : '找不到可用的 Python 3.10 或更新版本。安装 Python 后点击重试。');
    }
    if (override && await hasPackage(base, requirement)) return base;
    if (override && await hasPackage(managedPython, requirement)) return managedPython;

    // 依赖安装在插件自己的虚拟环境里，显式配置的解释器也可以作为创建环境的基础。
    try {
      await run(base, ['-m', 'venv', environment], 60_000);
    } catch {
      signal.throwIfAborted();
      throw runtimeError('创建 Python 虚拟环境失败。请检查 Python 的 venv 支持及工作台数据目录权限。');
    }
    try {
      await run(managedPython, ['-m', 'pip', 'install', '--no-input', '--disable-pip-version-check', '-r', requirementsPath], 180_000);
    } catch {
      signal.throwIfAborted();
      throw runtimeError('自动安装 X Monitor 的 Python 依赖失败。请检查网络或 pip 包源后点击重试。');
    }
    return managedPython;
  }

  return {
    ensure() {
      // 窗口初始化和后台采集共用一次安装，失败后可重试。
      return preparation ??= prepare().catch(error => {
        preparation = undefined;
        throw error;
      });
    },
    invalidate() { preparation = undefined; },
  };
}
