import { Rnd } from 'react-rnd';
import { Copy, Minus, Square, X } from 'lucide-react';
import type { WindowRecord } from '@creator-studio/shared';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/store/workspace';
import { AssetWindow } from '@/components/windows/AssetWindow';
import { DownloadWindow } from '@/components/windows/DownloadWindow';
import { EditorWindow } from '@/components/windows/EditorWindow';
import { InspectorWindow } from '@/components/windows/InspectorWindow';
import { ExportWindow } from '@/components/windows/ExportWindow';

const views = { assets: AssetWindow, downloads: DownloadWindow, editor: EditorWindow, inspector: InspectorWindow, exports: ExportWindow };

export function WorkspaceWindow({ windowRecord }: { windowRecord: WindowRecord }) {
  const { move, resize, close, focus, toggleMinimize } = useWorkspace();
  const View = views[windowRecord.type];
  return (
    <Rnd
      bounds="parent"
      size={{ width: windowRecord.width, height: windowRecord.minimized ? 44 : windowRecord.height }}
      position={{ x: windowRecord.x, y: windowRecord.y }}
      onDragStop={(_event, position) => move(windowRecord.id, position.x, position.y)}
      onResizeStop={(_event, _direction, element, _delta, position) => resize(windowRecord.id, position.x, position.y, element.offsetWidth, element.offsetHeight)}
      dragHandleClassName="window-drag-handle"
      cancel="button, input, select, textarea, video, .window-scroll-area"
      enableResizing={!windowRecord.minimized}
      minWidth={300} minHeight={240}
      style={{ zIndex: windowRecord.z }}
      className="workspace-window"
    >
      <div className="window-shell" onMouseDown={() => focus(windowRecord.id)}>
        <div className="window-titlebar window-drag-handle">
          <span className="window-title"><Copy size={14} strokeWidth={1.9} />{windowRecord.title}</span>
          <div className="titlebar-actions">
            <Button variant="ghost" size="icon" title="最小化" onClick={() => toggleMinimize(windowRecord.id)}><Minus /></Button>
            <Button variant="ghost" size="icon" title="置于最前" onClick={() => focus(windowRecord.id)}><Square size={12} /></Button>
            <Button variant="ghost" size="icon" title="关闭窗口" onClick={() => close(windowRecord.id)}><X /></Button>
          </div>
        </div>
        {!windowRecord.minimized && <div className="window-body"><View /></div>}
      </div>
    </Rnd>
  );
}
