import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { JsonValue, WindowHandle, WindowRecord } from '@creator-studio/plugin-sdk';
import { getView, listViews } from '@/runtime/catalog';

const STORAGE_KEY = 'creator-studio-workspace-v2';

function initialWindows(): WindowRecord[] {
  // 默认位置来自插件声明，保留现有画布比例。
  const available = Math.max(850, window.innerWidth);
  const height = Math.max(500, window.innerHeight) - 46;
  const left = Math.min(300, Math.max(220, Math.floor(available * 0.22)));
  const right = Math.min(330, Math.max(230, Math.floor(available * 0.23)));
  const center = available - left - right - 40;
  const fullHeight = height - 20;
  const upperHeight = Math.floor((fullHeight - 10) * 0.48);
  const slots = {
    left: { x: 10, y: 10, width: left, height: fullHeight },
    center: { x: left + 20, y: 10, width: center, height: fullHeight },
    'right-top': { x: left + center + 30, y: 10, width: right, height: upperHeight },
    'right-bottom': { x: left + center + 30, y: upperHeight + 20, width: right, height: fullHeight - upperHeight - 10 },
  };
  return listViews().filter(view => view.definition.defaultSlot).map((view, index) => ({
    id: crypto.randomUUID(), viewId: view.id, title: view.definition.title,
    input: null, minimized: false, z: index + 1, ...slots[view.definition.defaultSlot!],
  }));
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
