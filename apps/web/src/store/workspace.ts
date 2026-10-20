import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WindowRecord, WindowType } from '@creator-studio/shared';

export const TITLES: Record<WindowType, string> = {
  assets: '素材库', downloads: '解析下载列表', editor: '剪辑工作台',
  inspector: '素材详情', exports: '导出队列',
};

function initialWindows(): WindowRecord[] {
  const available = typeof window === 'undefined' ? 1440 : window.innerWidth;
  const height = typeof window === 'undefined' ? 790 : window.innerHeight - 64;
  const left = Math.min(330, Math.max(250, Math.floor(available * 0.24)));
  const right = Math.min(370, Math.max(280, Math.floor(available * 0.24)));
  const center = Math.max(350, available - left - right - 64);
  const fullHeight = Math.max(330, height - 36);
  return [
    { id: 'assets-main', type: 'assets', title: TITLES.assets, x: 14, y: 14, width: left, height: fullHeight, z: 1 },
    { id: 'editor-main', type: 'editor', title: TITLES.editor, x: left + 26, y: 14, width: center, height: fullHeight, z: 2 },
    { id: 'downloads-main', type: 'downloads', title: TITLES.downloads, x: left + center + 38, y: 14, width: right, height: Math.floor(fullHeight * 0.48), z: 3 },
    { id: 'inspector-main', type: 'inspector', title: TITLES.inspector, x: left + center + 38, y: Math.floor(fullHeight * 0.48) + 26, width: right, height: Math.floor(fullHeight * 0.52) - 12, z: 4 },
  ];
}

type WorkspaceStore = {
  windows: WindowRecord[];
  selectedAssetId: string | null;
  projectName: string;
  open: (type: WindowType) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  resize: (id: string, x: number, y: number, width: number, height: number) => void;
  toggleMinimize: (id: string) => void;
  resetLayout: () => void;
  selectAsset: (id: string) => void;
  renameProject: (name: string) => void;
};

export const useWorkspace = create<WorkspaceStore>()(persist((set, get) => ({
  windows: initialWindows(), selectedAssetId: null, projectName: '未命名项目',
  open(type) {
    const same = get().windows.find(item => item.type === type);
    if (same) {
      set(state => ({ windows: state.windows.map(w => w.id === same.id ? { ...w, minimized: false, z: Math.max(...state.windows.map(a => a.z)) + 1 } : w) }));
      return;
    }
    const z = Math.max(0, ...get().windows.map(w => w.z)) + 1;
    const id = crypto.randomUUID();
    const offset = Math.min(z * 16, 120);
    set(state => ({ windows: [...state.windows, { id, type, title: TITLES[type], x: 90 + offset, y: 35 + offset, width: type === 'editor' ? 780 : 440, height: type === 'editor' ? 590 : 420, z }] }));
  },
  close(id) { set(state => ({ windows: state.windows.filter(w => w.id !== id) })); },
  focus(id) {
    const current = get().windows.find(w => w.id === id);
    if (!current || current.z === Math.max(...get().windows.map(w => w.z))) return;
    const z = Math.max(...get().windows.map(w => w.z)) + 1;
    set(state => ({ windows: state.windows.map(w => w.id === id ? { ...w, z } : w) }));
  },
  move(id, x, y) { set(state => ({ windows: state.windows.map(w => w.id === id ? { ...w, x, y } : w) })); },
  resize(id, x, y, width, height) { set(state => ({ windows: state.windows.map(w => w.id === id ? { ...w, x, y, width, height } : w) })); },
  toggleMinimize(id) { set(state => ({ windows: state.windows.map(w => w.id === id ? { ...w, minimized: !w.minimized } : w) })); },
  resetLayout() { set({ windows: initialWindows() }); },
  selectAsset(id) { set({ selectedAssetId: id }); },
  renameProject(name) { set({ projectName: name.trim().slice(0, 80) || '未命名项目' }); },
}), { name: 'creator-studio-workspace-v1', partialize: state => ({ windows: state.windows, projectName: state.projectName, selectedAssetId: state.selectedAssetId }) }));
