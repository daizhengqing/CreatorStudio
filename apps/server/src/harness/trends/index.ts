import type { Category, ModelService } from '@creator-studio/contracts';
import { sourceDefinitions } from './catalog.js';
import { collectSource } from './collectors.js';
import { openDatabase } from './database.js';
import { createSettings } from './settings.js';
import { createItems } from './items.js';
import { createQueue } from './queue.js';
import { createAiWorker } from './ai-worker.js';
import { closeTransport } from './http.js';

export function createTrendsService(directory: string, models: ModelService) {
  const db = openDatabase(directory, sourceDefinitions);
  const settings = createSettings(db, sourceDefinitions);
  const modelReady = () => models.active().verified;
  const automatic = () => settings.getConfig().autoGenerate;
  const items = createItems(db, sourceDefinitions, () => ({ ready: modelReady(), automatic: automatic() }));
  const queue = createQueue(db, automatic);
  const worker = createAiWorker(queue, models);
  const active = new Map<string, { controller: AbortController; promise: Promise<void> }>();
  let disposed = false;

  function refreshOne(id: string, credentialTest = false): Promise<void> {
    const underway = active.get(id);
    if (underway) return underway.promise;
    const definition = sourceDefinitions.find(source => source.id === id);
    if (!definition) throw new Error('信息源不存在');
    const row = settings.sourceRow(id);
    if (definition.requiresCredentials && !row.cookie) {
      db.prepare("UPDATE sources SET state='needs_auth',enabled=0,error='请在设置中录入微博登录 Cookie' WHERE id=?").run(id);
      return Promise.resolve();
    }
    const controller = new AbortController();
    db.prepare("UPDATE sources SET state='refreshing',checked_at=?,error=NULL WHERE id=?").run(Date.now(), id);
    const promise = (async () => {
      try {
        const batch = await collectSource(definition, {
          proxyUrl: settings.getConfig().proxyUrl, cookie: row.cookie, signal: controller.signal,
        });
        if (disposed || controller.signal.aborted) return;
        items.ingest(definition, batch);
        if (credentialTest) db.prepare('UPDATE sources SET enabled=1 WHERE id=?').run(id);
        worker.wake();
      } catch (error) {
        if (disposed || controller.signal.aborted) return;
        const needsAuth = error instanceof Error && 'code' in error && error.code === 'NEEDS_AUTH';
        const message = error instanceof Error ? error.message : '采集失败';
        const safeMessage = row.cookie ? message.replaceAll(row.cookie, '[登录态已隐藏]') : message;
        db.prepare('UPDATE sources SET state=?,error=?,enabled=CASE WHEN ? THEN 0 ELSE enabled END WHERE id=?')
          .run(needsAuth ? 'needs_auth' : 'error', safeMessage.slice(0, 240), Number(needsAuth || credentialTest), id);
      } finally {
        active.delete(id);
      }
    })();
    active.set(id, { controller, promise });
    return promise;
  }

  function refresh(sourceId?: string): string[] {
    const ids = sourceId ? [sourceId] : settings.sources().filter(source => source.enabled).map(source => source.id);
    for (const id of ids) void refreshOne(id);
    return ids;
  }

  items.cleanup();
  const startup = setTimeout(refresh, 0);
  const timer = setInterval(() => { items.cleanup(); refresh(); }, 300_000);
  timer.unref();
  worker.wake();

  return {
    list: items.list,
    get: items.get,
    rankings(query: { search?: string; category?: Category; sourceId?: string; limit?: number }) {
      return settings.sources()
        .filter(source => (source.kind === 'hot' || source.kind === 'community') && (!query.sourceId || query.sourceId === source.id) && (!query.category || query.category === source.category))
        .map(source => ({ source, items: items.ranked(source.id, query).slice(0, query.limit ?? 10) }));
    },
    getStatus: () => ({ sources: settings.sources(), queue: queue.counts(), modelReady: modelReady(), autoGenerate: automatic() }),
    refresh,
    async setSourceEnabled(sourceId: string, enabled: boolean) {
      const underway = active.get(sourceId);
      if (!enabled) underway?.controller.abort();
      settings.setEnabled(sourceId, enabled);
      if (enabled) {
        if (underway?.controller.signal.aborted) await underway.promise;
        if (!disposed) void refreshOne(sourceId);
      }
      return settings.sources().find(source => source.id === sourceId)!;
    },
    async saveSourceCredentials(sourceId: string, cookie: string) {
      const underway = active.get(sourceId);
      underway?.controller.abort();
      settings.saveCredentials(sourceId, cookie);
      // 新 Cookie 通过试采后启用来源。
      await underway?.promise;
      if (cookie.trim() && !disposed) await refreshOne(sourceId, true);
      return settings.sources().find(source => source.id === sourceId)!;
    },
    saveTopic: items.saveTopic,
    removeTopic: items.removeTopic,
    getConfig: settings.getConfig,
    setProxy: (proxyUrl: string) => settings.saveConfig({ ...settings.getConfig(), proxyUrl }),
    setAutoSummary(autoGenerate: boolean) {
      settings.saveConfig({ ...settings.getConfig(), autoGenerate });
      worker.wake();
      return { autoGenerate };
    },
    retryAi(itemId: string) {
      if (!modelReady()) throw new Error('请先在设置中验证热点摘要模型');
      queue.retryAi(itemId);
      worker.wake();
    },
    async dispose() {
      disposed = true;
      clearTimeout(startup);
      clearInterval(timer);
      worker.dispose();
      for (const { controller } of active.values()) controller.abort();
      await Promise.all([...active.values()].map(({ promise }) => promise));
      db.close();
      await closeTransport();
    },
  };
}
