import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { JsonValue, WindowHandle, WindowRecord } from '@creator-studio/plugin-sdk';
import { getView, listViews } from '@/runtime/catalog';

const STORAGE_KEY = 'creator-studio-workspace-v2';

function initialWindows(): WindowRecord[] {
  return [];
}

type WorkspaceStore = {
  windows: WindowRecord[];
  projectName: string;
  open(viewId: string, input?: JsonValue): WindowHandle;
  close(id: string): void;
  focus(id: string): void;
  move(id: string, x: number, y: number): void;
  resize(id: string, x: number, y: number, width: number, height: number): void;
  toggleMinimize(id: string): void;
  resetLayout(): void;
  renameProject(name: string): void;
};

export const useWorkspace = create<WorkspaceStore>()(persist((set, get) => ({
  windows: [], projectName: '未命名项目',
  open(viewId, input) {
    const { definition } = getView(viewId);
    const z = Math.max(0, ...get().windows.map(window => window.z)) + 1;
    const same = definition.singleton ? get().windows.find(window => window.viewId === viewId) : undefined;
    if (same) {
      set(state => ({ windows: state.windows.map(window => window.id === same.id ? { ...window, minimized: false, z, input: input === undefined ? window.input : input } : window) }));
      return { id: same.id, viewId };
    }
    const id = crypto.randomUUID();
    const offset = Math.min(z * 16, 120);
    set(state => ({ windows: [...state.windows, {
      id, viewId, title: definition.title, input: input ?? null, minimized: false,
      x: 90 + offset, y: 35 + offset, width: definition.width, height: definition.height, z,
    }] }));
    return { id, viewId };
  },
  close(id) { set(state => ({ windows: state.windows.filter(window => window.id !== id) })); },
  focus(id) {
    const current = get().windows.find(window => window.id === id);
    const z = Math.max(0, ...get().windows.map(window => window.z));
    if (!current || current.z === z) return;
    set(state => ({ windows: state.windows.map(window => window.id === id ? { ...window, z: z + 1 } : window) }));
  },
  move(id, x, y) { set(state => ({ windows: state.windows.map(window => window.id === id ? { ...window, x, y } : window) })); },
  resize(id, x, y, width, height) { set(state => ({ windows: state.windows.map(window => window.id === id ? { ...window, x, y, width, height } : window) })); },
  toggleMinimize(id) { set(state => ({ windows: state.windows.map(window => window.id === id ? { ...window, minimized: !window.minimized } : window) })); },
  resetLayout() { set({ windows: initialWindows() }); },
  renameProject(name) { set({ projectName: name.trim().slice(0, 80) || '未命名项目' }); },
}), { name: STORAGE_KEY, partialize: state => ({ windows: state.windows, projectName: state.projectName }) }));

export function initializeWorkspace(): void {
  if (!localStorage.getItem(STORAGE_KEY)) { useWorkspace.getState().resetLayout(); return; }
  const available = new Set(listViews().map(view => view.id));
  // 已卸载插件的窗口退出布局，其余窗口保持不变。
  useWorkspace.setState(state => ({ windows: state.windows.filter(window => available.has(window.viewId)) }));
}
