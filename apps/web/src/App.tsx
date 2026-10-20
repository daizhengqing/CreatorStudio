import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Clapperboard, Download, FileVideo2, FolderOpen, LayoutPanelTop, RotateCcw, Settings2 } from 'lucide-react';
import type { WindowType } from '@creator-studio/shared';
import { Button } from '@/components/ui/button';
import { WorkspaceWindow } from '@/components/WorkspaceWindow';
import { useWorkspace, TITLES } from '@/store/workspace';
import { api } from '@/lib/api';

export function App() {
  const { windows, open, resetLayout, projectName, renameProject } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    const events = new EventSource('/api/events');
    events.addEventListener('changed', event => {
      const type = (JSON.parse((event as MessageEvent<string>).data) as { type: string }).type;
      if (['assets', 'downloads', 'exports'].includes(type)) void queryClient.invalidateQueries({ queryKey: [type] });
    });
    return () => events.close();
  }, [queryClient]);

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    try { for (const file of Array.from(files)) await api.upload(file); }
    catch (err) { window.alert(err instanceof Error ? err.message : '上传失败'); }
    void queryClient.invalidateQueries({ queryKey: ['assets'] });
    open('assets');
  }

  function openDownload() { open('downloads'); }

  return <div className="app-root">
    <header className="app-toolbar">
      <div className="brand"><Clapperboard size={19} /><strong>Media Studio</strong></div>
      <div className="toolbar-divider" />
      <div className="toolbar-buttons">
        <Button variant="ghost" size="sm" onClick={() => open('assets')}><FolderOpen /> 素材</Button>
        <Button variant="ghost" size="sm" onClick={openDownload}><Download /> 下载</Button>
        <Button variant="ghost" size="sm" onClick={() => open('editor')}><Clapperboard /> 剪辑</Button>
        <Button variant="ghost" size="sm" onClick={() => open('exports')}><FileVideo2 /> 导出</Button>
      </div>
      <span className="flex-1" />
      <label className="project-name-label">项目：<input className="project-name" value={projectName} onChange={e => renameProject(e.target.value)} title="本地工作区名称" /></label>
      <div className="toolbar-divider" />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>导入素材</Button>
      <input type="file" ref={inputRef} accept="video/*,audio/*,image/*,.mkv" multiple hidden onChange={e => { void importFiles(e.target.files); e.target.value = ''; }} />
      <Button variant="outline" size="sm" onClick={openDownload}>粘贴链接下载</Button>
      <select className="native-select" value="" aria-label="打开窗口" onChange={e => { if (e.target.value) open(e.target.value as WindowType); }}>
        <option value="">＋ 新建窗口</option>
        {(Object.keys(TITLES) as WindowType[]).map(key => <option key={key} value={key}>{TITLES[key]}</option>)}
      </select>
      <Button variant="ghost" size="icon" title="恢复默认布局" onClick={() => { if (window.confirm('恢复默认窗口布局？')) resetLayout(); }}><RotateCcw /></Button>
      <Button variant="ghost" size="icon" title="设置（待开发）" disabled><Settings2 /></Button>
    </header>
    <main className="workspace-canvas" aria-label="自由多窗口工作区">
      {windows.map(record => <WorkspaceWindow key={record.id} windowRecord={record} />)}
      {windows.length === 0 && <div className="workspace-empty"><LayoutPanelTop size={36} /><h2>空白工作区</h2><p>使用顶部工具栏打开素材库、下载任务或剪辑器。</p></div>}
    </main>
  </div>;
}
