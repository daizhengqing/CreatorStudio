import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock3, Download, Film, LoaderCircle, XCircle } from 'lucide-react';
import type { DownloadPreview, DownloadTask } from '@creator-studio/shared';
import { api, friendlyTime } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const platformNames = { youtube: 'YouTube', bilibili: 'B站', douyin: '抖音', local: '本地' };
const statusNames = { queued: '排队中', running: '下载中', completed: '已完成', failed: '失败', cancelled: '已停止' };

function TaskCover({ row }: { row: DownloadTask }) {
  const localUrl = row.assetId ? `/api/assets/${row.assetId}/thumbnail` : null;
  const [source, setSource] = useState(localUrl ?? row.thumbnailUrl);
  return <div className="download-cover">
    {source ? <img src={source} alt="" loading="lazy" onError={() => setSource(source === localUrl ? row.thumbnailUrl : null)} />
      : <Film size={20} />}
  </div>;
}

function PreviewCover({ url }: { url: string | null }) {
  const [missing, setMissing] = useState(false);
  return <div className="download-cover download-preview-cover">
    {url && !missing ? <img src={url} alt="视频封面" onError={() => setMissing(true)} /> : <Film size={24} />}
  </div>;
}

export function DownloadWindow() {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<DownloadPreview | null>(null);
  const [resolution, setResolution] = useState('best');
  const [error, setError] = useState('');
  const currentInput = useRef('');
  const client = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ['downloads'], queryFn: api.downloads });
  const inspect = useMutation({
    mutationFn: api.previewDownload,
    onSuccess: (result, input) => {
      if (currentInput.current !== input) return;
      setPreview(result); setResolution('best'); setError('');
    },
    onError: err => setError(err.message),
  });
  const start = useMutation({
    mutationFn: api.startDownload,
    onSuccess: () => {
      setUrl(''); currentInput.current = ''; setPreview(null); setError('');
      void client.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: err => setError(err.message),
  });
  const stop = useMutation({
    mutationFn: api.cancelDownload,
    onSuccess: () => { setError(''); void client.invalidateQueries({ queryKey: ['downloads'] }); },
    onError: err => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: api.deleteDownload,
    onSuccess: () => { setError(''); void client.invalidateQueries({ queryKey: ['downloads'] }); },
    onError: err => setError(err.message),
  });

  return <div className="flex h-full min-h-0 flex-col">
    <form className="window-toolbar" onSubmit={event => {
      event.preventDefault();
      const input = url.trim();
      if (!input) return;
      currentInput.current = input;
      setPreview(null); setError(''); inspect.mutate(input);
    }}>
      <Input className="h-8 min-w-0 flex-1" value={url} onChange={event => {
        setUrl(event.target.value); currentInput.current = event.target.value.trim(); setPreview(null);
      }} placeholder="视频链接或分享文案" />
      <Button size="sm" disabled={inspect.isPending || !url.trim()}>
        {inspect.isPending ? '解析中' : '解析'}
      </Button>
    </form>
    {error && <p role="alert" className="px-3 py-2 text-xs text-destructive">{error}</p>}
    <div className="min-h-0 flex-1 overflow-auto window-scroll-area">
      {preview && <div className="download-preview">
        <div className="download-preview-main">
          <PreviewCover key={preview.id} url={preview.thumbnailUrl} />
          <div className="min-w-0 flex-1">
            <div className="download-title" title={preview.title}>{preview.title}</div>
            <div className="download-meta">{platformNames[preview.platform]} · {preview.duration === null ? '时长未知' : friendlyTime(preview.duration)}</div>
          </div>
        </div>
        <div className="download-preview-actions">
          <label htmlFor="download-resolution">分辨率</label>
          <select id="download-resolution" className="native-select min-w-0 flex-1" value={resolution}
            onChange={event => setResolution(event.target.value)}>
            <option value="best">自动最高画质</option>
            {preview.resolutions.map(height => <option key={height} value={height}>{height}p</option>)}
          </select>
          <Button size="sm" disabled={start.isPending} onClick={() => start.mutate({
            previewId: preview.id, resolution: resolution === 'best' ? null : Number(resolution),
          })}>{start.isPending ? '添加中' : '开始下载'}</Button>
        </div>
      </div>}
      <div className="download-list">
        {data.map(row => <div key={row.id} className="download-task">
          <TaskCover key={`${row.id}:${row.assetId ?? ''}`} row={row} />
          <div className="min-w-0 flex-1">
            <div className="download-title" title={row.title}>{row.title}</div>
            <div className="download-meta">{platformNames[row.platform]} · {row.resolution ? `${row.resolution}p` : '自动画质'}</div>
            <div className="download-state">
              {row.status === 'running' ? <LoaderCircle size={13} className="animate-spin" />
                : row.status === 'completed' ? <Check size={13} />
                  : row.status === 'failed' ? <XCircle size={13} /> : <Clock3 size={13} />}
              <span>{statusNames[row.status]}</span>
              {(row.status === 'running' || row.status === 'queued') && <span>{row.progress}%</span>}
            </div>
            {(row.status === 'running' || row.status === 'queued') && <div className="progress-bar download-progress"><span style={{ width: `${row.progress}%` }} /></div>}
            {row.error && <div className="download-error" title={row.error}>{row.error}</div>}
          </div>
          {row.status === 'running' || row.status === 'queued' ? <Button size="sm" variant="ghost" title="停止下载"
            aria-label={`停止下载：${row.title}`} disabled={stop.isPending && stop.variables === row.id}
            onClick={() => stop.mutate(row.id)}>停止</Button>
            : <Button size="sm" variant="ghost" title="删除任务记录" aria-label={`删除任务记录：${row.title}`}
              disabled={remove.isPending && remove.variables === row.id}
              onClick={() => remove.mutate(row.id)}>删除</Button>}
        </div>)}
        {data.length === 0 && !preview && <div className="empty-state"><Download size={24} /><span>粘贴链接，解析视频并选择画质</span></div>}
      </div>
    </div>
    <div className="window-status">下载任务保存在本地 SQLite 中 · 删除任务记录不会删除素材</div>
  </div>;
}
