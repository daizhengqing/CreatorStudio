import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { SDK_VERSION, type EventMessage, type JsonValue, type PluginInfo, type PluginManifest } from '@creator-studio/plugin-sdk';
import type { BackendPlugin } from '@creator-studio/plugin-sdk/server';
import { createApiClient, createApiRegistry, createScope } from '@creator-studio/plugin-sdk/runtime';
import { DIRS, REPOSITORY_ROOT } from '../config.js';
import { events } from '../services/events.js';
import { media } from './media.js';
import { createPluginStorage } from './storage.js';

export async function installPlugins(app: FastifyInstance): Promise<void> {
  const registry = createApiRegistry();
  const scope = createScope();
  const plugins: PluginInfo[] = [];
  const stores = new Map<string, ReturnType<typeof createPluginStorage>>();
  const roots = [join(REPOSITORY_ROOT, 'plugins/builtin/dist'), DIRS.plugins];

  for (const root of roots) {
    for (const entry of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const directory = join(root, entry.name);
      const manifest = JSON.parse(await readFile(join(directory, 'plugin.json'), 'utf8')) as PluginManifest;
      if (!/^[a-z][a-z0-9.-]*$/.test(manifest.id)) throw new Error(`插件标识无效：${manifest.id}`);
      if (manifest.sdkVersion !== SDK_VERSION) throw new Error(`${manifest.id} 需要 SDK ${manifest.sdkVersion}，当前为 ${SDK_VERSION}`);
      if (stores.has(manifest.id)) throw new Error(`插件标识重复：${manifest.id}`);
      if (new Set(manifest.windows.map(view => view.id)).size !== manifest.windows.length) throw new Error(`${manifest.id} 的窗口标识重复`);
      if (manifest.windows.length && !manifest.frontend) throw new Error(`${manifest.id} 声明了窗口但缺少前端入口`);
      const store = createPluginStorage(manifest.id);
      stores.set(manifest.id, store);
      const prefix = `/plugins/${manifest.id}/`;
      plugins.push({ manifest, frontendUrl: manifest.frontend ? prefix + manifest.frontend : undefined, styleUrls: (manifest.styles ?? []).map(path => prefix + path) });

      await app.register(fastifyStatic, { root: directory, prefix, decorateReply: false, cacheControl: false });
      if (manifest.backend) {
        const { default: backend } = await import(pathToFileURL(join(directory, manifest.backend)).href) as { default: BackendPlugin };
        const dispose = await backend.activate({
          pluginId: manifest.id, dataDirectory: join(DIRS.pluginData, manifest.id), media, storage: store.storage,
          api: { expose: handlers => scope.add(registry.expose(manifest.id, handlers)) },
          plugins: { call: registry.call, client: target => createApiClient(target, registry.call) },
          events: { emit: events.emit, subscribe: (topic, handler) => scope.add(events.subscribe(topic, handler)) },
        });
        if (dispose) scope.add(dispose);
      }
      app.log.info({ plugin: manifest.id, version: manifest.version }, 'Plugin loaded');
    }
  }

  function storeFor(id: string) {
    const store = stores.get(id);
    if (!store) throw Object.assign(new Error(`插件不存在：${id}`), { statusCode: 404 });
    return store.storage;
  }
  app.get('/api/plugins', async () => plugins);
  app.post<{ Params: { id: string; method: string }; Body: unknown }>('/api/plugins/:id/call/:method', async request => {
    storeFor(request.params.id);
    return (await registry.call(request.params.id, request.params.method, request.body)) ?? null;
  });
  app.get<{ Params: { id: string; key: string } }>('/api/plugins/:id/storage/:key', async request => ({ value: await storeFor(request.params.id).get(request.params.key) }));
  app.put<{ Params: { id: string; key: string }; Body: { value: JsonValue } }>('/api/plugins/:id/storage/:key', async request => {
    await storeFor(request.params.id).set(request.params.key, request.body.value);
    return { saved: true };
  });
  app.delete<{ Params: { id: string; key: string } }>('/api/plugins/:id/storage/:key', async request => {
    await storeFor(request.params.id).delete(request.params.key);
    return { deleted: true };
  });
  app.post<{ Params: { id: string }; Body: EventMessage }>('/api/plugins/:id/events', async request => {
    storeFor(request.params.id);
    await events.emit(request.body.topic, request.body.payload);
    return { emitted: true };
  });
  app.addHook('onClose', async () => {
    scope.dispose();
    await Promise.all([...stores.values()].map(store => store.flush()));
  });
}
