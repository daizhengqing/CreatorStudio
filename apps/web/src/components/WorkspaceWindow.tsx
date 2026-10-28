import { useEffect, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import { Copy, Minus, Square, X } from 'lucide-react';
import type { WindowRecord } from '@creator-studio/plugin-sdk';
import { Button } from '@creator-studio/ui/button';
import { useWorkspace } from '@/store/workspace';
import { getView } from '@/runtime/catalog';
import { sdkFor } from '@/runtime';
import { mountWindow, windows } from '@/runtime/windows';

function PluginContent({ id, pluginId }: { id: string; pluginId: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => mountWindow(id, container.current!, sdkFor, error => setError(error.message)), [id]);
  return <>
    <div className="plugin-container" data-plugin={pluginId} ref={container} style={{ display: error ? 'none' : undefined }} />
    {error && <p role="alert" className="p-3 text-destructive">{error}</p>}
  </>;
}

export function WorkspaceWindow({ windowRecord }: { windowRecord: WindowRecord }) {
  const { move, resize, focus, toggleMinimize } = useWorkspace();
  const { definition, pluginId } = getView(windowRecord.viewId);
  return <Rnd
    bounds="parent"
    size={{ width: windowRecord.width, height: windowRecord.minimized ? 36 : windowRecord.height }}
    position={{ x: windowRecord.x, y: windowRecord.y }}
    onDragStop={(_event, position) => move(windowRecord.id, position.x, position.y)}
    onResizeStop={(_event, _direction, element, _delta, position) => resize(windowRecord.id, position.x, position.y, element.offsetWidth, element.offsetHeight)}
    dragHandleClassName="window-drag-handle"
    cancel="button, input, select, textarea, video, .window-scroll-area"
    enableResizing={!windowRecord.minimized}
    minWidth={definition.minWidth}
    minHeight={windowRecord.minimized ? 36 : definition.minHeight}
    style={{ zIndex: windowRecord.z }}
    className="workspace-window"
  >
    <div className="window-shell" onMouseDown={() => focus(windowRecord.id)}>
      <div className="window-titlebar window-drag-handle">
        <span className="window-title"><Copy size={13} strokeWidth={1.9} />{windowRecord.title}</span>
        <div className="titlebar-actions">
          <Button variant="ghost" size="icon" title="最小化" onClick={() => toggleMinimize(windowRecord.id)}><Minus /></Button>
          <Button variant="ghost" size="icon" title="置于最前" onClick={() => focus(windowRecord.id)}><Square /></Button>
          <Button variant="ghost" size="icon" title="关闭窗口" onClick={() => windows.close(windowRecord.id)}><X /></Button>
        </div>
      </div>
      <div className="window-body" style={{ display: windowRecord.minimized ? 'none' : undefined }}>
        <PluginContent id={windowRecord.id} pluginId={pluginId} />
      </div>
    </div>
  </Rnd>;
}
