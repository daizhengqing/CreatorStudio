import type { EventMessage, JsonValue, PluginInfo, PluginStorage } from '@creator-studio/plugin-sdk';
import type { BrowserSDK, FrontendPlugin } from '@creator-studio/plugin-sdk/browser';
import { createApiClient, createEventBus, createScope } from '@creator-studio/plugin-sdk/runtime';
import { initializeWorkspace } from '@/store/workspace';
import { clearViews, registerView } from './catalog';
import { json, request } from './http';
import { media } from './media';
import { selection } from './selection';
import { disposeWindows, windows } from './windows';

const bus = createEventBus();
const call = (id: string, method: string, input: unknown) => request<unknown>(`/api/plugins/${encodeURIComponent(id)}/call/${encodeURIComponent(method)}`, json(input));

export function sdkFor(pluginId: string, scope: ReturnType<typeof createScope>): BrowserSDK {
  const prefix = `/api/plugins/${encodeURIComponent(pluginId)}`;
  const storage: PluginStorage = {
    async get<T extends JsonValue>(key: string) { return (await request<{ value?: T }>(`${prefix}/storage/${encodeURIComponent(key)}`)).value; },
    async set(key, value) { await request(`${prefix}/storage/${encodeURIComponent(key)}`, json({ value }, 'PUT')); },
    async delete(key) { await request(`${prefix}/storage/${encodeURIComponent(key)}`, { method: 'DELETE' }); },
  };
  return {
    pluginId, media, windows, storage,
    selection: { ...selection, subscribe: listener => scope.add(selection.subscribe(listener)) },
    plugins: { call, client: target => createApiClient(target, call) },
    events: {
      subscribe: (topic, listener) => scope.add(bus.subscribe(topic, listener)),
      async emit(topic, payload) { await request(`${prefix}/events`, json({ topic, payload })); },
    },
  };
}

export async function initializeRuntime() {
  const plugins = await request<PluginInfo[]>('/api/plugins');
  const scope = createScope();
  const activations: (() => Promise<void>)[] = [];
  for (const info of plugins) {
    await Promise.all(info.styleUrls.map(url => new Promise<void>((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = url;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`插件样式加载失败：${url}`));
      document.head.append(link);
      scope.add(() => link.remove());
    })));
    if (!info.frontendUrl) continue;
    const { default: frontend } = await import(/* @vite-ignore */ info.frontendUrl) as { default: FrontendPlugin };
    for (const definition of info.manifest.windows) {
      const mount = frontend.windows[definition.id];
      if (!mount) throw new Error(`${info.manifest.id} 未实现窗口：${definition.id}`);
      registerView({ id: `${info.manifest.id}/${definition.id}`, pluginId: info.manifest.id, definition, mount });
    }
    activations.push(async () => {
      const dispose = await frontend.activate?.(sdkFor(info.manifest.id, scope));
      if (dispose) scope.add(dispose);
    });
  }
  initializeWorkspace();
  const source = new EventSource('/api/events');
  source.addEventListener('studio', event => bus.dispatch(JSON.parse((event as MessageEvent<string>).data) as EventMessage));
  source.addEventListener('open', () => {
    for (const type of ['assets', 'downloads', 'exports']) bus.dispatch({ topic: `media.${type}.changed`, payload: null });
  });
  scope.add(() => source.close());
  return {
    async activate() { for (const activate of activations) await activate(); },
    dispose() { disposeWindows(); scope.dispose(); clearViews(); },
  };
}
