import { useQuery } from '@tanstack/react-query';
import { FileVideo2, FolderOpen, Image as ImageIcon, Music2 } from 'lucide-react';
import { api, friendlySize, friendlyTime } from '@/lib/api';
import { useWorkspace } from '@/store/workspace';

export function InspectorWindow() {
  const selected = useWorkspace(s => s.selectedAssetId);
  const { data = [] } = useQuery({ queryKey: ['assets'], queryFn: api.assets });
  const asset = data.find(item => item.id === selected);
  if (!asset) return <div className="empty-state">在素材库中选择一个文件</div>;
  const Icon = asset.type === 'video' ? FileVideo2 : asset.type === 'image' ? ImageIcon : Music2;
  return <div className="h-full min-h-0 overflow-auto p-3 window-scroll-area">
    <div className="inspector-preview">
      {asset.type === 'image' ? <img src={asset.streamUrl} alt={asset.name} />
        : asset.type === 'video' ? <video controls preload="metadata" src={asset.streamUrl} poster={asset.thumbnailUrl ?? undefined} />
          : <div className="media-placeholder"><Icon size={36} /></div>}
    </div>
    <h3 className="my-3 break-all text-sm font-semibold">{asset.name}</h3>
    <div className="inspector-grid">
      <span>类型</span><strong>{asset.type}</strong>
      <span>来源</span><strong>{asset.source}</strong>
      <span>分辨率</span><strong>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : '—'}</strong>
      <span>时长</span><strong>{friendlyTime(asset.duration)}</strong>
      <span>大小</span><strong>{friendlySize(asset.size)}</strong>
      <span>创建时间</span><strong>{new Date(asset.createdAt).toLocaleString('zh-CN')}</strong>
      <span>视频含音轨</span><strong>{asset.hasAudio ? '是' : '否'}</strong>
    </div>
    <p className="mt-4 text-xs text-muted-foreground">媒体文件只存本地，不上传到远程服务。</p>
    <a href={asset.streamUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs underline"><FolderOpen size={14} />查看原文件</a>
  </div>;
}
