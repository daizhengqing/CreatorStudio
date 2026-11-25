import type { AddTarget, LoginDetails, RuntimeStatus, UpdateTarget } from '@creator-studio/contracts';
import { createBridge, describeFailure } from './bridge.js';
import { createScheduler } from './scheduler.js';
import { openStore } from './store.js';

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function normalizeHandle(input: string) {
  const handle = input.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) throw badRequest('请输入有效的 X 用户名。');
  return handle;
}

export function createXMonitorService(directory: string) {
  const lifetime = new AbortController();
  const store = openStore(directory);
  const bridge = createBridge(directory, lifetime.signal);
  const scheduler = createScheduler(store, bridge, lifetime.signal);

  function findActiveTarget(id: string) {
    const target = store.getJob(id);
    if (!target || target.removed) throw Object.assign(new Error('监控账号不存在。'), { statusCode: 404 });
    return target;
  }

  const listTargets = () => store.listTargets(scheduler.runningId());
  scheduler.wake();

  return {
    async getRuntime(signal?: AbortSignal): Promise<RuntimeStatus> {
      try {
        await bridge.call('runtime', null, signal);
        return { ready: true, message: null };
      } catch (error) {
        signal?.throwIfAborted();
        return { ready: false, message: describeFailure(error).message };
      }
    },
    listLoginAccounts: () => bridge.call('listAccounts', null),
    async saveLoginAccount(input: LoginDetails) {
      const username = normalizeHandle(input.username);
      if (input.mode === 'password' && (!input.password || !input.email.trim())) throw badRequest('请填写 X 密码和邮箱。');
      const account = await bridge.call('saveAccount', { ...input, username });
      store.wakeBlocked(Date.now());
      scheduler.wake();
      return account;
    },
    removeLoginAccount: (username: string) => bridge.call('removeAccount', { username: normalizeHandle(username) }),
    async addTarget({ handle, intervalMinutes, backfill }: AddTarget, signal?: AbortSignal) {
      const author = await bridge.call('resolveTarget', { handle: normalizeHandle(handle) }, signal);
      signal?.throwIfAborted();
      if (!author) throw Object.assign(new Error('未找到该 X 账号。'), { statusCode: 404 });
      const target = store.addTarget(author, intervalMinutes, backfill, Date.now());
      scheduler.wake();
      return target;
    },
    updateTarget(input: UpdateTarget) {
      store.updateTarget(findActiveTarget(input.id), input, Date.now());
      scheduler.wake();
      return listTargets().find(target => target.id === input.id)!;
    },
    removeTarget(id: string) {
      findActiveTarget(id);
      store.removeTarget(id);
      scheduler.wake();
    },
    collectNow(id: string) {
      const target = findActiveTarget(id);
      if (!target.enabled) throw badRequest('请先恢复该账号的监控。');
      if (scheduler.runningId() !== id) {
        store.scheduleTarget(id, Date.now());
        scheduler.wake();
      }
      return listTargets().find(target => target.id === id)!;
    },
    listTargets,
    listTweets: store.listTweets,
    getTweet: store.getTweet,
    dispose() {
      lifetime.abort();
      scheduler.dispose();
      store.close();
    },
  };
}
