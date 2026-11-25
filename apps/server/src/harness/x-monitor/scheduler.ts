import { MINUTE_MS } from './contracts.js';
import { describeFailure, type createBridge } from './bridge.js';
import { newScan, processPage } from './scan.js';
import type { openStore, TargetJob } from './store.js';

export function createScheduler(
  store: ReturnType<typeof openStore>,
  bridge: ReturnType<typeof createBridge>,
  signal: AbortSignal,
) {
  let timer: NodeJS.Timeout | undefined;
  let runningId: string | null = null;

  function wake() {
    clearTimeout(timer);
    if (signal.aborted || runningId) return;
    const target = store.nextJob();
    if (target) {
      const delay = Math.max(0, Math.min(target.nextRunAt - Date.now(), 2_147_483_647));
      timer = setTimeout(() => { void runNext(); }, delay);
      timer.unref();
    }
  }

  function currentJob(target: TargetJob) {
    if (signal.aborted) return null;
    const current = store.getJob(target.id);
    // 移除后重新添加的目标有新起点，旧请求不能覆盖其采集进度。
    return current && !current.removed && current.addedAt === target.addedAt ? current : null;
  }

  async function runNext() {
    const target = store.nextJob();
    if (!target || target.nextRunAt > Date.now()) return wake();
    const scan = target.scan ?? newScan();
    runningId = target.id;
    try {
      const page = await bridge.call('timelinePage', { userId: target.id, cursor: scan.cursor });
      const current = currentJob(target);
      if (current) store.commitPage(current, processPage(target, scan, page), Date.now());
    } catch (error) {
      const current = currentJob(target);
      if (!current) return;
      const failure = describeFailure(error);
      const state = failure.code === 'rate_limited' || failure.code === 'needs_auth' || failure.code === 'runtime_missing'
        ? failure.code : 'error';
      const retryAt = Math.max(Date.now() + current.intervalMinutes * MINUTE_MS, failure.retryAt ?? 0);
      store.writeFailure(target.id, state, failure.message, retryAt);
    } finally {
      runningId = null;
      if (!signal.aborted) wake();
    }
  }

  return { wake, runningId: () => runningId, dispose: () => clearTimeout(timer) };
}
