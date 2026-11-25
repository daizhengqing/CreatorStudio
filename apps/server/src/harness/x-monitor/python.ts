import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const requirementsPath = fileURLToPath(new URL('./requirements.txt', import.meta.url));
const identifyPython = 'import sys; print(sys.executable); sys.exit(sys.version_info < (3, 10))';
const checkPackage = 'import sys, twscrape; from importlib.metadata import version; sys.exit("twscrape==" + version("twscrape") != sys.argv[1])';
const windows = process.platform === 'win32';
const pythonCommands: readonly [command: string, ...args: string[]][] = windows
  ? [['python'], ['py', '-3']]
  : [['python3'], ['python'], ['python3.15'], ['python3.14'], ['python3.13'], ['python3.12'], ['python3.11'], ['python3.10']];

function runtimeError(message: string) {
  return Object.assign(new Error(message), { code: 'runtime_missing', statusCode: 503 });
}

export function createPythonRuntime(directory: string, signal: AbortSignal) {
  const environment = join(directory, 'python');
  const managedPython = windows ? join(environment, 'Scripts', 'python.exe') : join(environment, 'bin', 'python');
  const override = process.env.X_MONITOR_PYTHON?.trim();
  let preparation: Promise<string> | undefined;

  function run(python: string, args: string[], timeout = 10_000) {
    return exec(python, args, { signal, timeout, windowsHide: true });
  }

  async function resolvePython(command: string, args: string[] = []) {
    try {
      const { stdout } = await run(command, [...args, '-X', 'utf8', '-c', identifyPython]);
      return stdout.trim();
    } catch {
      signal.throwIfAborted();
    }
  }

  async function findBase() {
    // 系统的 python3 可能比 PATH 中带版本号的解释器更旧。
    for (const [command, ...args] of pythonCommands) {
      const executable = await resolvePython(command, args);
      if (executable) return executable;
    }
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

  async function inspect() {
    const requirement = (await readFile(requirementsPath, 'utf8')).trim();
    const base = override ? await resolvePython(override) : undefined;
    if (override && !base) throw runtimeError('X_MONITOR_PYTHON 需指向可运行的 Python 3.10 或更新版本。');
    if (base && await hasPackage(base, requirement)) return { python: base, base, requirement };
    if (await hasPackage(managedPython, requirement)) return { python: managedPython, base, requirement };
    const managed = await resolvePython(managedPython);
    return { python: undefined, base: base ?? managed ?? await findBase(), managed, requirement };
  }

  async function prepare(installPython?: () => Promise<void>) {
    const status = await inspect();
    if (status.python) return status.python;
    let base = status.base;
    if (!base && installPython) {
      await installPython();
      base = await findBase();
    }
    if (!base) throw runtimeError('找不到可用的 Python 3.10 或更新版本，请检查 PATH。');

    if (!status.managed) {
      try {
        await mkdir(directory, { recursive: true });
        // 重建应用管理的虚拟环境，替换指向已移除 Python 版本的链接。
        await run(base, ['-m', 'venv', '--clear', environment], 60_000);
      } catch {
        signal.throwIfAborted();
        throw runtimeError('创建 Python 虚拟环境失败。请检查 Python 的 venv 支持及工作台数据目录权限。');
      }
    }
    try {
      await run(managedPython, ['-m', 'pip', 'install', '--no-input', '--disable-pip-version-check', '-r', requirementsPath], 180_000);
    } catch {
      signal.throwIfAborted();
      throw runtimeError('自动安装 X Monitor 的 Python 依赖失败。请检查网络或 pip 包源后重试。');
    }
    if (!await hasPackage(managedPython, status.requirement)) {
      throw runtimeError('X Monitor 的 Python 依赖已安装，但加载检查失败。');
    }
    return managedPython;
  }

  return {
    inspect,
    ensure(installPython?: () => Promise<void>) {
      // 启动准备和运行时检查使用同一套虚拟环境。
      return preparation ??= prepare(installPython).catch(error => {
        preparation = undefined;
        throw error;
      });
    },
    invalidate() { preparation = undefined; },
  };
}
