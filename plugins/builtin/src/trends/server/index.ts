import { MODEL_CONFIG_CHANGED } from '@creator-studio/plugin-sdk';
import type { BackendPlugin } from '@creator-studio/plugin-sdk/server';
import type { TrendsApi } from '../contracts';
import { sourceDefinitions } from './catalog';
import { collectSource } from './collectors';
import { openDatabase } from './database';
import { createSettings } from './settings';
import { createItems } from './items';
import { createQueue } from './queue';
import { createAiWorker } from './ai-worker';
import { closeTransport } from './http';

export default {
  activate(context) {
    const db = openDatabase(context.dataDirectory, sourceDefinitions);
    const settings = createSettings(db, sourceDefinitions);
    const modelReady = () => context.models.active().verified;
    const automatic = () => settings.getConfig().autoGenerate;
    const items = createItems(db, sourceDefinitions, () => ({ ready: modelReady(), automatic: automatic() }));
    const queue = createQueue(db, automatic);
    let disposed = false;
    let scheduled = false;
    function notify() {
      if (disposed || scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (!disposed) void context.events.emit('studio.trends.changed', null);
      });
    }
    const worker = createAiWorker(queue, context.models, notify);
    const unsubscribeModels = context.events.subscribe(MODEL_CONFIG_CHANGED, () => { worker.wake(); notify(); });
    const active = new Map<string, { controller: AbortController; promise: Promise<void> }>();

    function refreshOne(id: string, credentialTest = false): Promise<void> {
      const underway = active.get(id);
      if (underway) return underway.promise;
      const definition = sourceDefinitions.find(source => source.id === id);
      if (!definition) return Promise.reject(new Error('信息源不存在'));
      const row = settings.sourceRow(id);
      if (definition.requiresCredentials && !row.cookie) {
        db.prepare("UPDATE sources SET state='needs_auth',enabled=0,error='请配置你自己的微博登录 Cookie' WHERE id=?").run(id);
        notify();
        return Promise.resolve();
      }
      const controller = new AbortController();
      db.prepare("UPDATE sources SET state='refreshing',checked_at=?,error=NULL WHERE id=?").run(Date.now(), id);
      notify();
      const promise = (async () => {
        try {
          const batch = await collectSource(definition, { proxyUrl: settings.getConfig().proxyUrl, cookie: row.cookie, signal: controller.signal });
          if (disposed || controller.signal.aborted || settings.sourceRow(id).cookie !== row.cookie) return;
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
          if (!disposed) notify();
        }
      })();
      active.set(id, { controller, promise });
      return promise;
    }
    function refreshEnabled() {
      for (const source of settings.sources()) if (source.enabled) void refreshOne(source.id);
    }
    const unregister = context.api.expose<TrendsApi>({
      list: query => items.list(query),
      rankings: query => settings.sources().filter(source => (source.kind === 'hot' || source.kind === 'community') && (!query.sourceId || query.sourceId === source.id) && (!query.category || query.category === source.category))
        .map(source => ({ source, items: items.ranked(source.id, query) })),
      getStatus: () => ({ sources: settings.sources(), queue: queue.counts(), modelReady: modelReady(), autoGenerate: automatic() }),
      refresh: ({ sourceId }) => { if (sourceId) { settings.sourceRow(sourceId); void refreshOne(sourceId); } else refreshEnabled(); return null; },
      setSourceEnabled: ({ sourceId, enabled }) => {
        settings.setEnabled(sourceId, enabled);
        if (enabled) void refreshOne(sourceId); else active.get(sourceId)?.controller.abort();
        notify();
        return null;
      },
      saveSourceCredentials: ({ sourceId, cookie }) => {
        active.get(sourceId)?.controller.abort();
        settings.saveCredentials(sourceId, cookie);
        // 新登录态只在试采成功后启用，已有请求结束后再进行本次试采。
        if (cookie.trim()) void (active.get(sourceId)?.promise ?? Promise.resolve()).then(() => { if (!disposed) return refreshOne(sourceId, true); });
        notify();
        return null;
      },
      saveTopic: ({ itemId, note }) => { items.saveTopic(itemId, note); notify(); return null; },
      removeTopic: ({ itemId }) => { items.removeTopic(itemId); notify(); return null; },
      getConfig: () => settings.getConfig(),
      saveConfig: config => { const saved = settings.saveConfig(config); notify(); worker.wake(); return saved; },
      retryAi: ({ itemId }) => {
        if (!modelReady()) throw new Error('请在「大模型配置」中保存并测试当前模型');
        queue.retryAi(itemId); worker.wake(); notify(); return null;
      },
    });
    items.cleanup();
    // 网络请求不阻塞工作台启动，窗口关闭也不会停止后台定时采集。
    const startup = setTimeout(refreshEnabled, 0);
    const timer = setInterval(() => { items.cleanup(); refreshEnabled(); notify(); }, 300_000);
    timer.unref();
    worker.wake();
    return () => {
      disposed = true;
      clearTimeout(startup); clearInterval(timer);
      worker.dispose(); unregister(); unsubscribeModels();
      for (const { controller } of active.values()) controller.abort();
      db.close();
      void closeTransport();
    };
  },
} satisfies BackendPlugin;
