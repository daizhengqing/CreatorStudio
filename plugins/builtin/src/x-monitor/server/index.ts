import type { BackendPlugin } from '@creator-studio/plugin-sdk/server';
import { X_MONITOR_TWEETS_CHANGED } from '@creator-studio/plugin-sdk/x-monitor';
import { STATUS_CHANGED, type XMonitorApi } from '../contracts';
import { createBridge, describeFailure } from './bridge';
import { createScheduler } from './scheduler';
import { openStore } from './store';

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function normalizeHandle(input: string) {
  const handle = input.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) throw badRequest('请输入有效的 X 用户名。');
  return handle;
}

function positiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw badRequest(`${label}必须为正整数。`);
}

export default {
  activate(context) {
    const lifetime = new AbortController();
    const store = openStore(context.dataDirectory);
    const bridge = createBridge(context.dataDirectory, lifetime.signal);
    const notifyStatus = () => { void context.events.emit(STATUS_CHANGED, null); };
    const scheduler = createScheduler(store, bridge, lifetime.signal, notifyStatus, targetId => {
      void context.events.emit(X_MONITOR_TWEETS_CHANGED, { targetId });
    });

    function findActiveTarget(id: string) {
      const target = store.getJob(id);
      if (!target || target.removed) throw Object.assign(new Error('监控账号不存在。'), { statusCode: 404 });
      return target;
    }

    function scheduleChanged() {
      notifyStatus();
      scheduler.wake();
    }

    const unregister = context.api.expose<XMonitorApi>({
      async getRuntime() {
        try {
          await bridge.call('runtime', null);
          return { ready: true, message: null };
        } catch (error) {
          return { ready: false, message: describeFailure(error).message };
        }
      },
      listLoginAccounts: () => bridge.call('listAccounts', null),
      async saveLoginAccount(input) {
        const username = normalizeHandle(input.username);
        if (input.mode === 'password' && (!input.password || !input.email.trim())) throw badRequest('请填写 X 密码和邮箱。');
        const account = await bridge.call('saveAccount', { ...input, username });
        store.wakeBlocked(Date.now());
        scheduleChanged();
        return account;
      },
      async removeLoginAccount({ username }) {
        await bridge.call('removeAccount', { username });
        notifyStatus();
        return null;
      },
      async addTarget({ handle, intervalMinutes, backfill }) {
        positiveInteger(intervalMinutes, '采集间隔');
        if (backfill.mode !== 'from_now') positiveInteger(backfill.amount, '补采范围');
        const author = await bridge.call('resolveTarget', { handle: normalizeHandle(handle) });
        if (!author) throw Object.assign(new Error('未找到该 X 账号。'), { statusCode: 404 });
        const target = store.addTarget(author, intervalMinutes, backfill, Date.now());
        scheduleChanged();
        return target;
      },
      updateTarget(input) {
        if (input.intervalMinutes !== undefined) positiveInteger(input.intervalMinutes, '采集间隔');
        store.updateTarget(findActiveTarget(input.id), input, Date.now());
        scheduleChanged();
        return null;
      },
      removeTarget({ id }) {
        findActiveTarget(id);
        store.removeTarget(id);
        scheduleChanged();
        return null;
      },
      collectNow({ id }) {
        const target = findActiveTarget(id);
        if (!target.enabled) throw badRequest('请先恢复该账号的监控。');
        if (scheduler.runningId() !== id) {
          store.scheduleTarget(id, Date.now());
          scheduleChanged();
        }
        return null;
      },
      listTargets: () => store.listTargets(scheduler.runningId()),
      listTweets: query => store.listTweets(query),
      getTweet: ({ id }) => store.getTweet(id),
    });

    scheduler.wake();
    return () => {
      lifetime.abort();
      scheduler.dispose();
      unregister();
      store.close();
    };
  },
} satisfies BackendPlugin;
