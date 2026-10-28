import type { FrontendPlugin, WindowMount } from '@creator-studio/plugin-sdk/browser';
import type { NotesApi, NotesWindowApi } from './contracts.js';

const mount: WindowMount = (container, { sdk, window }) => {
  const root = document.createElement('section');
  root.className = 'notes-root';
  const title = document.createElement('strong');
  const textarea = document.createElement('textarea');
  textarea.className = 'notes-textarea';
  textarea.placeholder = '记录素材用途、剪辑想法或待办';
  textarea.setAttribute('aria-label', '素材笔记内容');
  const status = document.createElement('p');
  status.className = 'notes-status';
  const actions = document.createElement('div');
  actions.className = 'notes-actions';
  root.append(title, textarea, actions, status);
  container.append(root);

  const backend = sdk.plugins.client<NotesApi>(sdk.pluginId);
  let assetId: string | null = null;
  let disposed = false;
  function report(error: Error) { status.textContent = error.message; }
  async function load() {
    assetId = sdk.selection.getSnapshot();
    textarea.disabled = assetId === null;
    if (!assetId) { title.textContent = '先从素材库选择素材'; textarea.value = ''; return; }
    const requestedId = assetId;
    const result = await backend.call('load', { assetId });
    // 素材切换或窗口关闭后，已经发出的请求不再修改这个窗口。
    if (disposed || assetId !== requestedId) return;
    title.textContent = result.name;
    textarea.value = result.note;
    status.textContent = '笔记保存在本地';
  }
  function button(label: string, action: () => Promise<unknown>) {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = label;
    element.onclick = () => { void action().catch(report); };
    actions.append(element);
  }
  button('保存笔记', async () => {
    if (!assetId) return;
    await backend.call('save', { assetId, note: textarea.value });
    status.textContent = '已保存';
  });
  button('在详情中查看', async () => {
    if (!assetId) return;
    const inspector = await sdk.windows.open('studio.inspector/main');
    await sdk.windows.call(inspector.id, 'showAsset', { assetId });
  });
  button('新建笔记窗口', () => sdk.windows.open('example.asset-notes/main'));

  const stopSelection = sdk.selection.subscribe(() => { void load().catch(report); });
  const stopEvents = sdk.events.subscribe<{ assetId: string; note: string }>('example.asset-notes.saved', event => {
    if (event.assetId === assetId) { textarea.value = event.note; status.textContent = '笔记已同步'; }
  });
  const stopApi = window.expose<NotesWindowApi>({
    setNote: ({ note }) => { textarea.value = note; return null; },
    getNote: () => textarea.value,
  });
  void load().catch(report);
  return () => { disposed = true; stopSelection(); stopEvents(); stopApi(); root.remove(); };
};

export default { windows: { main: mount } } satisfies FrontendPlugin;
