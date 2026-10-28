import type { WindowDefinition } from '@creator-studio/plugin-sdk';
import type { WindowMount } from '@creator-studio/plugin-sdk/browser';

export type RegisteredView = {
  id: string;
  pluginId: string;
  definition: WindowDefinition;
  mount: WindowMount;
};
const views = new Map<string, RegisteredView>();
export function registerView(view: RegisteredView): void {
  if (views.has(view.id)) throw new Error(`窗口标识重复：${view.id}`);
  views.set(view.id, view);
}
export function listViews(): RegisteredView[] { return [...views.values()]; }
export function clearViews(): void { views.clear(); }
export function getView(id: string): RegisteredView {
  const view = views.get(id);
  if (!view) throw new Error(`窗口未注册：${id}`);
  return view;
}
