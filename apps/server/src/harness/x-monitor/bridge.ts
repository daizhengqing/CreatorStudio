import { spawn } from 'node:child_process';
import { addAbortListener } from 'node:events';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { XMonitorAuthor, XMonitorTweet } from '@creator-studio/contracts';
import type { LoginAccount, LoginDetails } from './contracts.js';
import { createPythonRuntime } from './python.js';
import type { ResearchInput, ResearchResult } from './research.js';

export type TimelinePage = {
  items: XMonitorTweet[];
  pinned: XMonitorTweet | null;
  nextCursor: string | null;
};

type Calls = {
  runtime: { input: null; output: null };
  listAccounts: { input: null; output: LoginAccount[] };
  saveAccount: { input: LoginDetails; output: LoginAccount };
  removeAccount: { input: { username: string }; output: null };
  resolveTarget: { input: { handle: string }; output: XMonitorAuthor | null };
  timelinePage: { input: { userId: string; cursor: string | null }; output: TimelinePage };
  research: { input: ResearchInput; output: ResearchResult };
};

const failures = {
  runtime_missing: 'X Monitor 的 Python 环境不可用，请点击重试。',
  needs_auth: '请先在「登录账号」添加可用会话，或更新已失效的会话。',
  rate_limited: '当前登录账号已达到 X 的请求限制。',
  email_verification_required: 'X 要求邮箱验证码，请填写邮箱应用密码后重新登录。',
  totp_required: 'X 要求两步验证，请填写 TOTP 密钥后重新登录。',
  login_failed: 'X 登录失败，请检查登录和验证信息，或使用浏览器 Cookie。',
  invalid_cookie: 'Cookie 格式有误，需包含 auth_token 和 ct0。',
  invalid_cursor: 'X 查询游标无效，请用同一查询返回的 nextCursor，或从第一页重新读取。',
  timeout: '请求 X 超时，请稍后重试。',
  upstream: '读取 X 数据失败，请稍后重试。',
} as const;
type Failure = { code: keyof typeof failures; retryAt?: number };
type Result<T> = { ok: true; result: T } | { ok: false; error: Failure };

function requestError(failure: Failure) {
  return Object.assign(new Error(failures[failure.code]), failure, {
    statusCode: ['invalid_cookie', 'invalid_cursor', 'login_failed', 'email_verification_required', 'totp_required'].includes(failure.code)
      ? 400 : failure.code === 'rate_limited' ? 429 : 503,
  });
}

export function describeFailure(error: unknown): Failure & { message: string } {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string' && Object.hasOwn(failures, error.code)) {
    return { code: error.code as Failure['code'], message: error.message,
      retryAt: 'retryAt' in error && typeof error.retryAt === 'number' ? error.retryAt : undefined };
  }
  return { code: 'upstream', message: failures.upstream };
}

export function createBridge(directory: string, lifetime: AbortSignal) {
  const runtime = createPythonRuntime(directory, lifetime);
  const sessionDirectory = join(directory, 'sessions');
  mkdirSync(sessionDirectory, { recursive: true, mode: 0o700 });
  const database = join(sessionDirectory, 'accounts.db');
  const script = fileURLToPath(new URL('./bridge.py', import.meta.url));
  let tail = Promise.resolve();

  async function execute<M extends keyof Calls>(method: M, input: Calls[M]['input'], requested: AbortSignal): Promise<Calls[M]['output']> {
    requested.throwIfAborted();
    const python = await runtime.ensure();
    requested.throwIfAborted();
    const timeout = AbortSignal.timeout(method === 'saveAccount' ? 120_000 : 50_000);
    const signal = AbortSignal.any([requested, timeout]);
    return new Promise((resolve, reject) => {
      const child = spawn(python, ['-B', '-u', script, database], {
        cwd: sessionDirectory, signal, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
      });
      const output: string[] = [];
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => output.push(chunk));
      child.once('error', error => {
        const code = timeout.aborted ? 'timeout' : 'code' in error && error.code === 'ENOENT' ? 'runtime_missing' : 'upstream';
        if (code === 'runtime_missing') runtime.invalidate();
        reject(requestError({ code }));
      });
      child.once('close', code => {
        if (code !== 0) return reject(requestError({ code: timeout.aborted ? 'timeout' : 'upstream' }));
        try {
          const response = JSON.parse(output.join('')) as Result<Calls[M]['output']>;
          if (response.ok) resolve(response.result);
          else {
            if (response.error.code === 'runtime_missing') runtime.invalidate();
            reject(requestError(response.error));
          }
        } catch {
          reject(requestError({ code: 'upstream' }));
        }
      });
      child.stdin.on('error', error => {
        // 解释器退出时由进程状态返回原因，EPIPE 不覆盖该错误。
        if (!('code' in error) || error.code !== 'EPIPE') reject(requestError({ code: 'upstream' }));
      });
      child.stdin.end(JSON.stringify({ method, input }));
    });
  }

  return {
    call<M extends keyof Calls>(method: M, input: Calls[M]['input'], caller?: AbortSignal): Promise<Calls[M]['output']> {
      // 采集和管理共用账号库。取消本轮工具时仍让共享的 Python 环境初始化结束。
      const signal = caller ? AbortSignal.any([lifetime, caller]) : lifetime;
      const next = tail.then(() => execute(method, input, signal));
      tail = next.then(() => undefined, () => undefined);
      if (!caller) return next;
      return new Promise((resolve, reject) => {
        const listener = addAbortListener(signal, () => reject(signal.reason));
        void next.then(resolve, reject).finally(() => listener[Symbol.dispose]());
      });
    },
  };
}
