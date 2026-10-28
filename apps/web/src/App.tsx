import { Clapperboard, LayoutPanelTop, RotateCcw, Settings2 } from 'lucide-react';
import { Button } from '@creator-studio/ui/button';
import { WorkspaceWindow } from '@/components/WorkspaceWindow';
import { useWorkspace } from '@/store/workspace';
import { listViews } from '@/runtime/catalog';
import { windows as windowApi } from '@/runtime/windows';

function report(error: Error) { window.alert(error.message); }

export function App() {
  const { windows, resetLayout, projectName, renameProject } = useWorkspace();
  const views = listViews();
  return <div className="app-root">
    <header className="app-toolbar">
      <div className="brand"><Clapperboard size={16} /><strong>Media Studio</strong></div>
      <div className="toolbar-divider" />
      <div className="toolbar-buttons">
        {views.filter(view => view.definition.toolbar).map(view => <Button key={view.id} variant="ghost" size="sm" onClick={() => { void windowApi.open(view.id).catch(report); }}>{view.definition.toolbar}</Button>)}
      </div>
      <span className="flex-1" />
      <label className="project-name-label">项目：<input className="project-name" value={projectName} onChange={event => renameProject(event.target.value)} title="本地工作区名称" /></label>
      <div className="toolbar-divider" />
      {views.flatMap(view => (view.definition.actions ?? []).map(action => <Button key={`${view.id}:${action.method}`} variant="outline" size="sm" onClick={() => {
        void windowApi.open(view.id).then(handle => windowApi.call(handle.id, action.method, action.input)).catch(report);
      }}>{action.title}</Button>))}
      <select className="native-select" value="" aria-label="打开窗口" onChange={event => { if (event.target.value) void windowApi.open(event.target.value).catch(report); }}>
        <option value="">＋ 新建窗口</option>
        {views.map(view => <option key={view.id} value={view.id}>{view.definition.title}</option>)}
      </select>
      <Button variant="ghost" size="icon" title="恢复默认布局" onClick={() => { if (window.confirm('恢复默认窗口布局？')) resetLayout(); }}><RotateCcw /></Button>
      <Button variant="ghost" size="icon" title="设置（待开发）" disabled><Settings2 /></Button>
    </header>
    <main className="workspace-canvas" aria-label="自由多窗口工作区">
      {windows.map(record => <WorkspaceWindow key={record.id} windowRecord={record} />)}
      {windows.length === 0 && <div className="workspace-empty"><LayoutPanelTop size={36} /><h2>空白工作区</h2><p>使用顶部工具栏打开功能窗口。</p></div>}
    </main>
  </div>;
}
