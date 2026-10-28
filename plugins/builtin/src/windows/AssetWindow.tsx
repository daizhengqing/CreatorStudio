import type { AssetWindowApi, EditorApi } from '../contracts';
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Film, Grid2X2, Image as ImageIcon, Music2, Plus, Search, Upload, List, LoaderCircle } from 'lucide-react';
import type { Asset, AssetType } from '@creator-studio/plugin-sdk';
import { friendlySize, friendlyTime } from '../format';
import { useExpose, usePlugin, useSelectedAsset } from '../context';
import { Input } from '@creator-studio/ui/input';
import { Button } from '@creator-studio/ui/button';

type Filter = 'all' | AssetType;

function MediaThumb({ asset }: { asset: Asset }) {
  const [missing, setMissing] = useState(false);
  if (asset.thumbnailUrl && !missing) return <img src={asset.thumbnailUrl} alt="" loading="lazy" onError={() => setMissing(true)} />;
  const Icon = asset.type === 'video' ? Film : asset.type === 'audio' ? Music2 : ImageIcon;
  return <div className="media-placeholder"><Icon size={28} /></div>;
}

export function AssetWindow() {
  const { sdk } = usePlugin();
  const api = sdk.media;
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [listMode, setListMode] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const selected = useSelectedAsset();
  const select = sdk.selection.set;
  const { data = [], isLoading } = useQuery({ queryKey: ['assets'], queryFn: api.assets });
  const upload = useMutation({
    mutationFn: async (files: FileList) => {
      for (const file of Array.from(files)) await api.upload(file);
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['assets'] }); setError(''); },
    onError: err => setError(err.message),
  });
  useExpose<AssetWindowApi>({
    importFiles: () => { inputRef.current!.click(); return null; },
    selectAsset: ({ assetId }) => { select(assetId); return null; },
    getSelection: () => sdk.selection.getSnapshot(),
  });
  async function openEditor(asset: Asset) {
    select(asset.id);
    try {
      const handle = await sdk.windows.open('studio.editor/main');
      if (asset.type === 'video') await sdk.windows.client<EditorApi>(handle.id).call('loadAsset', { assetId: asset.id });
    } catch (error) { setError((error as Error).message); }
  }
  const shown = useMemo(() => data.filter(asset => (filter === 'all' || asset.type === filter) && asset.name.toLowerCase().includes(search.toLowerCase())), [data, filter, search]);
  return (
    <div className="flex min-h-0 h-full flex-col">
      <div className="window-toolbar">
        {(['all', 'video', 'audio', 'image'] as const).map(type => (
          <Button key={type} size="sm" variant={type === filter ? 'secondary' : 'ghost'} onClick={() => setFilter(type)}>
            {({ all: '全部', video: '视频', audio: '音频', image: '图片' })[type]}
          </Button>
        ))}
        <span className="flex-1" />
        <Button size="icon" variant="ghost" title="导入素材" onClick={() => inputRef.current?.click()}><Plus /></Button>
        <input ref={inputRef} type="file" multiple hidden accept="video/*,audio/*,image/*,.mkv" onChange={e => { if (e.target.files?.length) upload.mutate(e.target.files); e.target.value = ''; }} />
      </div>
      <div className="flex items-center gap-1 border-b px-2 py-1">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="pl-7" placeholder="搜索素材..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="icon" variant="ghost" title="切换视图" onClick={() => setListMode(!listMode)}>{listMode ? <Grid2X2 /> : <List />}</Button>
      </div>
      {error && <p className="px-2 pt-1 text-xs text-destructive">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto p-2 window-scroll-area">
        {isLoading ? <p className="empty-state"><LoaderCircle className="animate-spin" /> 加载中...</p>
          : shown.length === 0 ? <div className="empty-state"><Upload size={24} /><span>暂无素材</span><Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>导入本地文件</Button></div>
            : <div className={listMode ? 'asset-list' : 'asset-grid'}>
              {shown.map(asset => (
                <button key={asset.id} type="button" title={asset.name} className={`asset-item ${selected === asset.id ? 'selected' : ''}`}
                  onClick={() => { select(asset.id); void sdk.windows.open('studio.inspector/main'); }} onDoubleClick={() => { void openEditor(asset); }}>
                  <div className="asset-thumbnail"><MediaThumb asset={asset} />{asset.duration !== null && <span className="duration-badge">{friendlyTime(asset.duration)}</span>}</div>
                  <div className="asset-item-title">{asset.name}</div>
                  <div className="asset-item-meta">{asset.width ? `${asset.width}×${asset.height}` : friendlySize(asset.size)} · {asset.source === 'local' ? '本地' : asset.source}</div>
                </button>
              ))}
            </div>}
      </div>
      <div className="window-status">{shown.length} 项素材 {upload.isPending ? '· 正在导入...' : ''}</div>
    </div>
  );
}
