import { useEffect, useState } from 'react';
import {
  ChevronDown,
  Download,
  FileAudio,
  FileImage,
  Film,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';
import type {
  Asset,
  DownloadTask,
  ExportTask,
  TaskStatus,
  ToolReference,
} from '@creator-studio/contracts';
import { Button } from '@creator-studio/ui/button';
import { cn } from '@creator-studio/ui/utils';
import { api, messageOf } from '@/api';
import { formatBytes, formatDuration } from '../utils/format';

const icons = {
  video: Film,
  audio: FileAudio,
  image: FileImage,
};

const statuses: Record<TaskStatus, string> = {
  queued: '排队中',
  running: '处理中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已停止',
};

const pending = (status: TaskStatus) => status === 'queued' || status === 'running';

/**
 * 现代媒体卡片组件
 * 展示资源海报/缩略图、元数据（时长、尺寸、文件体积）与内联预览
 */
export function AssetCard({ asset }: { asset: Asset }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = icons[asset.type];

  const metaText = [
    formatBytes(asset.size),
    asset.duration ? formatDuration(asset.duration) : null,
    asset.width && asset.height ? `${asset.width}×${asset.height}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="modern-media-card">
      <div
        className="media-card-header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <div className="media-type-icon-box">
          <Icon size={15} />
        </div>
        <div className="media-card-title-box">
          <span className="media-name truncate">{asset.name}</span>
          <span className="media-meta">{metaText}</span>
        </div>
        <ChevronDown
          size={14}
          className={cn('media-expand-arrow transition-transform duration-200', {
            'rotate-180': expanded,
          })}
        />
      </div>

      {expanded && (
        <div className="media-preview-body">
          {asset.type === 'video' && (
            <div className="media-video-wrapper">
              <video playsInline controls preload="metadata" src={asset.streamUrl} />
            </div>
          )}
          {asset.type === 'audio' && (
            <div className="media-audio-wrapper">
              <audio controls preload="none" src={asset.streamUrl} className="w-full" />
            </div>
          )}
          {asset.type === 'image' && (
            <div className="media-image-wrapper">
              <img loading="lazy" src={asset.streamUrl} alt={asset.name} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DownloadedAsset({ id }: { id: string }) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void api<Asset>(`/api/assets/${id}`, { signal: controller.signal })
      .then(setAsset)
      .catch(err => {
        if (!controller.signal.aborted) setError(messageOf(err));
      });
    return () => controller.abort();
  }, [id]);

  if (error) return <p role="alert" className="status-error">{error}</p>;
  return asset ? <AssetCard asset={asset} /> : null;
}

/**
 * 现代任务卡片组件（下载与导出）
 * 展示动态任务进度条、状态徽章与完成预览
 */
function TaskCard({
  initial,
  kind,
}: {
  initial: DownloadTask | ExportTask;
  kind: 'download' | 'export';
}) {
  const [task, setTask] = useState(initial);
  const [error, setError] = useState('');
  const { id } = initial;

  useEffect(() => {
    if (!pending(initial.status)) return;
    const controller = new AbortController();
    let timer: number | undefined;
    const path = `/api/${kind === 'download' ? 'downloads' : 'exports'}/${id}`;

    async function refresh() {
      try {
        const current = await api<DownloadTask | ExportTask>(path, {
          signal: controller.signal,
        });
        setTask(current);
        if (pending(current.status)) timer = window.setTimeout(refresh, 1200);
      } catch (err) {
        if (!controller.signal.aborted) setError(messageOf(err));
      }
    }

    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, initial.status, kind]);

  const current = pending(initial.status) ? task : initial;
  const href = 'playbackUrl' in current ? current.playbackUrl : null;
  const title = 'title' in current ? current.title : '视频导出';
  const isPending = pending(current.status);

  return (
    <div className={cn('modern-task-card', `task-${current.status}`)}>
      <div className="task-heading">
        <div className="task-title-left">
          {kind === 'download' ? <Download size={15} /> : <Film size={15} />}
          <strong className="task-title truncate">{title}</strong>
        </div>

        <div className="task-status-badge">
          {isPending && <LoaderCircle size={12} className="animate-spin text-primary" />}
          <span>
            {statuses[current.status]}
            {isPending && ` · ${current.progress}%`}
          </span>
        </div>
      </div>

      {/* 现代平滑进度条 */}
      {isPending && (
        <div className="modern-progress-bar">
          <div
            className="modern-progress-fill"
            style={{ width: `${Math.min(100, Math.max(0, current.progress))}%` }}
          />
        </div>
      )}

      {(current.error || error) && (
        <div className="task-error-row" role="alert">
          <TriangleAlert size={14} />
          <span>{current.error ?? error}</span>
        </div>
      )}

      {href && (
        <div className="export-playback-box">
          <div className="export-video-player">
            <video src={href} playsInline controls preload="metadata" />
          </div>
          <div className="export-action-row">
            <Button asChild size="default">
              <a href={href} download={`${id}.mp4`}>
                <Download data-icon="inline-start" />
                <span>保存 MP4 到本地</span>
              </a>
            </Button>
          </div>
        </div>
      )}

      {'url' in current && current.assetId && (
        <div className="mt-2">
          <DownloadedAsset id={current.assetId} />
        </div>
      )}
    </div>
  );
}

export function MediaReference({ reference }: { reference: ToolReference }) {
  if (reference.kind === 'asset') return <AssetCard asset={reference.asset} />;
  return <TaskCard kind={reference.kind} initial={reference.task} />;
}
