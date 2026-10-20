import { useQuery } from '@tanstack/react-query';
import { Download, LoaderCircle, Film } from 'lucide-react';
import { api } from '@/lib/api';

export function ExportWindow() {
  const { data = [] } = useQuery({ queryKey: ['exports'], queryFn: api.exports });
  return <div className="flex h-full min-h-0 flex-col">
    <div className="window-toolbar text-xs text-muted-foreground">视频导出任务 · 输出保存到 ~/MediaStudio/exports/</div>
    <div className="flex-1 min-h-0 overflow-auto window-scroll-area">
      {data.length === 0 ? <div className="empty-state"><Film size={24} /><span>暂无导出任务</span></div> :
        <table className="task-table"><thead><tr><th>导出文件</th><th>状态</th><th>进度</th><th>操作</th></tr></thead><tbody>
          {data.map(row => <tr key={row.id} title={row.error ?? row.outputFile ?? ''}>
            <td>{row.id.slice(0, 8)}.mp4</td><td>{({ queued: '排队中', running: '导出中', completed: '完成', failed: '失败', cancelled: '取消' })[row.status]}{row.status === 'running' && <LoaderCircle className="ml-1 inline animate-spin" size={12} />}</td>
            <td><div className="progress-bar"><span style={{ width: `${row.progress}%` }} /></div><span className="text-[11px] text-muted-foreground">{row.progress}%</span></td>
            <td>{row.status === 'completed' && <a title="查看导出文件" href={`/api/exports/${row.id}/file`} target="_blank" rel="noreferrer"><Download size={16} /></a>}</td>
          </tr>)}</tbody></table>}
    </div>
  </div>;
}
