import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clapperboard, Pause, Play, Scissors, Volume2, VolumeX } from 'lucide-react';
import type { ExportRequest } from '@creator-studio/shared';
import { api, friendlyTime } from '@/lib/api';
import { useWorkspace } from '@/store/workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function EditorWindow() {
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: api.assets });
  const selected = useWorkspace(s => s.selectedAssetId);
  const open = useWorkspace(s => s.open);
  const video = assets.find(asset => asset.id === selected && asset.type === 'video');
  const audioAssets = assets.filter(asset => asset.type === 'audio');
  const [aspect, setAspect] = useState<ExportRequest['aspect']>('16:9');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(30);
  const [cursor, setCursor] = useState(0);
  const [mute, setMute] = useState(false);
  const [bgm, setBgm] = useState('');
  const [volume, setVolume] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLVideoElement>(null);
  const client = useQueryClient();

  useEffect(() => {
    setStart(0); setEnd(video?.duration ?? 30); setCursor(0); setPlaying(false); setBgm('');
  }, [video?.id, video?.duration]);

  const exportMutation = useMutation({
    mutationFn: api.startExport,
    onSuccess: () => { setError(''); open('exports'); void client.invalidateQueries({ queryKey: ['exports'] }); },
    onError: err => setError(err.message),
  });

  function seek(time: number) {
    if (!ref.current) return;
    const bounded = Math.max(start, Math.min(end, time));
    ref.current.currentTime = bounded;
    setCursor(bounded);
  }
  function togglePlay() {
    if (!ref.current) return;
    if (ref.current.paused) { void ref.current.play().catch(() => setPlaying(false)); }
    else ref.current.pause();
  }
  function exportVideo() {
    if (!video || end <= start) return;
    exportMutation.mutate({ assetId: video.id, start, end, aspect, mute, ...(bgm ? { bgmAssetId: bgm, bgmVolume: volume } : {}) });
  }

  if (!video) return <div className="empty-state"><Clapperboard size={30} /><strong>先从素材库中选择一个视频</strong><span>双击视频素材进入编辑预览</span></div>;
  const duration = video.duration ?? Math.max(end, 1);
  return <div className="editor-root">
    <div className="window-toolbar editor-tools">
      <label>画幅 <select value={aspect} onChange={e => setAspect(e.target.value as ExportRequest['aspect'])} className="native-select"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option><option value="original">原始</option></select></label>
      <span className="filename-ellipsis">{video.name}</span>
      <span className="flex-1" />
      <Button size="sm" variant="outline" onClick={() => open('exports')}>导出队列</Button>
      <Button size="sm" onClick={exportVideo} disabled={exportMutation.isPending || end <= start}>{exportMutation.isPending ? '提交中' : '导出视频'}</Button>
    </div>
    <div className="editor-preview">
      <div className="preview-screen" style={{ aspectRatio: aspect === 'original' ? (video.width && video.height ? `${video.width}/${video.height}` : '16/9') : aspect.replace(':', '/') }}>
        <video ref={ref} key={video.id} src={video.streamUrl} poster={video.thumbnailUrl ?? undefined}
          muted={mute} preload="metadata"
          onTimeUpdate={e => { const current = e.currentTarget.currentTime; setCursor(current); if (current >= end) { e.currentTarget.pause(); setPlaying(false); } }}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
      </div>
    </div>
    <div className="playbar">
      <span>{friendlyTime(cursor)} / {friendlyTime(duration)}</span>
      <Button size="icon" variant="ghost" onClick={togglePlay} title="播放/暂停">{playing ? <Pause /> : <Play />}</Button>
      <Button size="icon" variant="ghost" title="静音原声音轨" onClick={() => setMute(!mute)}>{mute ? <VolumeX /> : <Volume2 />}</Button>
    </div>
    <div className="timeline-editor">
      <div className="trim-toolbar">
        <span className="inline-flex items-center gap-1"><Scissors size={15} /> 区间裁剪</span>
        <label>起点 <Input type="number" className="h-7 w-[78px]" min={0} step={0.1} max={end} value={start} onChange={e => { const n = Math.max(0, Number(e.target.value)); if (n < end) { setStart(n); seek(n); } }} /></label>
        <label>终点 <Input type="number" className="h-7 w-[78px]" min={start} max={duration + 1} step={0.1} value={end} onChange={e => { const n = Number(e.target.value); if (n > start && n <= duration + 1) setEnd(n); }} /></label>
        <span className="text-muted-foreground">单位：秒</span>
      </div>
      <div className="timeline-ruler"><span>00:00</span><span>{friendlyTime(duration * 0.25)}</span><span>{friendlyTime(duration * 0.5)}</span><span>{friendlyTime(duration * 0.75)}</span><span>{friendlyTime(duration)}</span></div>
      <div className="track-line"><span>视频 1</span><button type="button" className="track-clip video-track" title="点击时间线定位" onClick={e => { const rect = e.currentTarget.getBoundingClientRect(); seek((e.clientX - rect.left) / rect.width * duration); }}>
        <span className="trimmed-region" style={{ left: `${start / duration * 100}%`, right: `${(duration - end) / duration * 100}%` }} /><span>{video.name}</span>
        <i style={{ left: `${cursor / duration * 100}%` }} />
      </button></div>
      <div className="track-line"><span>原声轨</span><div className={`track-clip audio-track ${mute ? 'track-muted' : ''}`}><span>{video.hasAudio ? (mute ? '已静音' : '视频原声') : '无原声'}</span></div></div>
      <div className="track-line"><span>BGM 轨</span><div className="track-clip bgm-track"><span>{bgm ? audioAssets.find(a => a.id === bgm)?.name : '未选择音频素材'}</span></div></div>
      <div className="track-settings">
        <label>添加 BGM <select className="native-select min-w-0 max-w-[160px]" value={bgm} onChange={e => setBgm(e.target.value)}><option value="">无</option>{audioAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>BGM 音量 <input type="range" min={0} max={2} step={0.1} value={volume} onChange={e => setVolume(Number(e.target.value))} /></label>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-[11px] text-muted-foreground">当前为单视频片段裁剪 + 画幅 + 原声静音/BGM 导出起点；分割及片段拖拽将在后续迭代完成。</p>
    </div>
  </div>;
}
