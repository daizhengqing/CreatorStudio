import type { BrowserSDK } from '@creator-studio/plugin-sdk/browser';

const KEY = 'creator-studio-selection-v1';
let selected = JSON.parse(localStorage.getItem(KEY) ?? 'null') as string | null;
const listeners = new Set<() => void>();
export const selection: BrowserSDK['selection'] = {
  getSnapshot: () => selected,
  subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  set(assetId) {
    if (selected === assetId) return;
    selected = assetId;
    localStorage.setItem(KEY, JSON.stringify(assetId));
    for (const listener of listeners) listener();
  },
};
