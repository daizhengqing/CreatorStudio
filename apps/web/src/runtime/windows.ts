import type { Dispose, WindowHandle } from '@creator-studio/plugin-sdk';
import type { BrowserSDK, WindowApi, WindowContext } from '@creator-studio/plugin-sdk/browser';
import { createApiClient, createApiRegistry, createScope } from '@creator-studio/plugin-sdk/runtime';
import { useWorkspace } from '@/store/workspace';
import { getView } from './catalog';

type Waiter = { resolve: (handle: WindowHandle) => void; reject: (error: Error) => void };
type Instance = {
  id: string; viewId: string; ready: boolean; closed: boolean; error?: Error;
  waiters: Set<Waiter>; scope: ReturnType<typeof createScope>;
};
const registry = createApiRegistry();
const instances = new Map<string, Instance>();

function instanceFor(id: string): Instance {
  const record = useWorkspace.getState().windows.find(window => window.id === id);
  if (!record) throw new Error(`窗口已关闭：${id}`);
  let instance = instances.get(id);
  if (!instance) {
    instance = { id, viewId: record.viewId, ready: false, closed: false, waiters: new Set(), scope: createScope() };
    instances.set(id, instance);
  }
  return instance;
}
function ready(id: string): Promise<WindowHandle> {
  const instance = instanceFor(id);
  if (instance.error) return Promise.reject(instance.error);
  if (instance.ready) return Promise.resolve({ id, viewId: instance.viewId });
  return new Promise((resolve, reject) => { instance.waiters.add({ resolve, reject }); });
}
function release(instance: Instance, remount = false): void {
  instance.closed = true;
  instance.scope.dispose();
  // React 开发模式重放挂载时，等待者交给下一次挂载，不视为窗口关闭。
  if (remount && instances.get(instance.id) === instance) {
    instances.set(instance.id, { ...instance, ready: false, closed: false, error: undefined, scope: createScope() });
    return;
  }
  for (const waiter of instance.waiters) waiter.reject(new Error(`窗口已关闭：${instance.id}`));
  instance.waiters.clear();
  if (instances.get(instance.id) === instance) instances.delete(instance.id);
}
async function call(id: string, method: string, input: unknown): Promise<unknown> {
  await ready(id);
  return registry.call(id, method, input);
}
export const windows: WindowApi = {
  async open(viewId, input) { return ready(useWorkspace.getState().open(viewId, input).id); },
  list(viewId) { return useWorkspace.getState().windows.filter(window => !viewId || window.viewId === viewId).map(({ id, viewId }) => ({ id, viewId })); },
  focus(id) { useWorkspace.getState().focus(id); },
  close(id) {
    const instance = instances.get(id);
    if (instance) release(instance);
    useWorkspace.getState().close(id);
  },
  call,
  client: target => createApiClient(target, call),
};

export function disposeWindows(): void {
  for (const instance of [...instances.values()]) release(instance);
}

export function mountWindow(id: string, container: HTMLElement, sdkFor: (pluginId: string, scope: ReturnType<typeof createScope>) => BrowserSDK, onError: (error: Error) => void): Dispose {
  const instance = instanceFor(id);
  const view = getView(instance.viewId);
  let input = useWorkspace.getState().windows.find(window => window.id === id)!.input;
  const context: WindowContext = {
    sdk: sdkFor(view.pluginId, instance.scope),
    window: {
      id, viewId: view.id,
      expose: handlers => instance.scope.add(registry.expose(id, handlers)),
      input: {
        getSnapshot: () => {
          const record = useWorkspace.getState().windows.find(window => window.id === id);
          if (record) input = record.input;
          return input;
        },
        subscribe: listener => {
          let previous = input;
          return instance.scope.add(useWorkspace.subscribe(state => {
            const next = state.windows.find(window => window.id === id)?.input;
            if (next !== undefined && next !== previous) { input = next; previous = next; listener(); }
          }));
        },
      },
    },
  };
  // 在宿主提交完成后挂载独立根；StrictMode 取消的挂载不会执行插件代码。
  void Promise.resolve().then(async () => {
    if (instance.closed) return;
    const dispose = await view.mount(container, context);
    if (instance.closed) { dispose(); return; }
    instance.scope.add(dispose);
    instance.ready = true;
    for (const waiter of instance.waiters) waiter.resolve({ id, viewId: view.id });
    instance.waiters.clear();
  }).catch((error: Error) => {
    if (instance.closed) return;
    instance.scope.dispose();
    instance.error = error;
    for (const waiter of instance.waiters) waiter.reject(error);
    instance.waiters.clear();
    onError(error);
  });
  return () => { release(instance, useWorkspace.getState().windows.some(window => window.id === id)); };
}
