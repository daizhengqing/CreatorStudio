import { createContext, useContext, useLayoutEffect, useSyncExternalStore } from 'react';
import type { ApiContract, ApiHandlers } from '@creator-studio/plugin-sdk';
import type { WindowContext } from '@creator-studio/plugin-sdk/browser';

export const PluginContext = createContext<WindowContext | null>(null);
export function usePlugin() { return useContext(PluginContext)!; }
export function useSelectedAsset() {
  const { selection } = usePlugin().sdk;
  return useSyncExternalStore(selection.subscribe, selection.getSnapshot);
}
export function useExpose<C extends ApiContract>(handlers: ApiHandlers<C>): void {
  const context = usePlugin();
  useLayoutEffect(() => context.window.expose<C>(handlers), [context, handlers]);
}
