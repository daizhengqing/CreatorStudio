import { useContext, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, ExternalLink, MessageSquare, RotateCcw } from 'lucide-react';
import { Button } from '@creator-studio/ui/button';
import { categoryNames, type AiState, type TrendItem } from '../contracts';
import { formatDate, TopicDraftContext, useTrendsApi } from './shared';

const aiLabels: Record<AiState, string> = {
  pending: '等待 AI', processing: 'AI 处理中', completed: 'AI 已完成', failed: 'AI 失败',
  skipped: '未自动加工', not_needed: '无需翻译', unconfigured: '模型未就绪',
};

export function TrendCard({ item, rankSourceId }: { item: TrendItem; rankSourceId?: string }) {
  const api = useTrendsApi();
  const client = useQueryClient();
  const drafts = useContext(TopicDraftContext)!;
  const [editing, setEditing] = useState(drafts.values[item.id] !== undefined);
  const note = drafts.values[item.id] ?? item.note;
  const refresh = () => client.invalidateQueries({ queryKey: ['trends'] });
  const save = useMutation({
    mutationFn: (text: string) => api.call('saveTopic', { itemId: item.id, note: text }),
    onSuccess: () => { drafts.update(item.id, undefined); setEditing(false); void refresh(); },
  });
  const remove = useMutation({
    mutationFn: () => api.call('removeTopic', { itemId: item.id }), onSuccess: () => { void refresh(); },
  });
  const retry = useMutation({
    mutationFn: () => api.call('retryAi', { itemId: item.id }), onSuccess: () => { void refresh(); },
  });
  const ranked = item.sources.find(source => source.id === rankSourceId);
  const change = ranked?.rank !== null && ranked?.rank !== undefined && ranked.previousRank !== null
    ? ranked.previousRank - ranked.rank : null;
  const time = item.timeKind === 'discovered' || item.publishedAt === null ? item.firstSeenAt : item.publishedAt;
  const timeLabel = item.timeKind === 'discovered' || item.publishedAt === null
    ? '发现于' : item.timeKind === 'community' ? '社区发布' : '发布于';
  const busy = save.isPending || remove.isPending;
  const failure = save.error ?? remove.error ?? retry.error;
  const canRetry = !['processing', 'pending', 'not_needed'].includes(item.aiState);

  return <article className="trend-card">
    <div className="trend-card-heading">
      {ranked?.rank !== null && ranked?.rank !== undefined && <span className={`trend-rank ${ranked.rank <= 3 ? 'leading' : ''}`}>{ranked.rank}</span>}
      <div className="trend-card-title-wrap">
        <a className="trend-title" href={item.url} target="_blank" rel="noreferrer">{item.titleZh || item.title}<ExternalLink size={12} /></a>
        {item.titleZh && item.titleZh !== item.title && <p className="trend-original-title">{item.title}</p>}
      </div>
      <Button variant="ghost" size="icon" className={item.saved ? 'trend-bookmarked' : ''}
        title={item.saved ? '移出选题池' : '加入选题池'} aria-label={item.saved ? '移出选题池' : '加入选题池'}
        disabled={busy} onClick={() => item.saved ? remove.mutate() : save.mutate(note)}>
        {item.saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
      </Button>
    </div>
    {item.summaryZh && <p className="trend-summary">{item.summaryZh}</p>}
    <div className="trend-meta">
      <span className="trend-category">{categoryNames[item.category]}</span>
      <span>{item.sources.map(source => source.name).join(' · ')}</span>
      <time dateTime={new Date(time).toISOString()} title={`${timeLabel} ${new Date(time).toLocaleString('zh-CN')}`}>{timeLabel} {formatDate(time)}</time>
      {ranked?.heat && <span>热度 {ranked.heat}</span>}
      {change !== null && change !== 0 && <span className={change > 0 ? 'trend-rising' : 'trend-falling'}>{change > 0 ? '↑' : '↓'} {Math.abs(change)}</span>}
      {ranked && change === null && <span>首次记录排名</span>}
    </div>
    {item.content && <details className="trend-content">
      <summary>{item.summaryZh ? '查看来源内容' : '来源内容'}</summary>
      <p>{item.content}</p>
    </details>}
    {item.note && !editing && <p className="trend-note"><MessageSquare size={12} />{item.note}</p>}
    <div className="trend-card-footer">
      <span className={`trend-ai-state ${item.aiState === 'failed' ? 'error' : ''}`} title={item.aiError ?? undefined}>{aiLabels[item.aiState]}</span>
      {item.aiModel && <span className="trend-model" title={`生成于 ${formatDate(item.aiGeneratedAt)}`}>{item.aiModel}</span>}
      <span className="trend-spacer" />
      {canRetry && <Button variant="ghost" size="sm" disabled={retry.isPending} onClick={() => retry.mutate()}><RotateCcw size={12} />{retry.isPending ? '提交中' : item.aiState === 'completed' ? '重新加工' : item.aiState === 'failed' ? '重试 AI' : '生成'}</Button>}
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => {
        if (!editing && drafts.values[item.id] === undefined) drafts.update(item.id, item.note);
        setEditing(!editing);
      }}><MessageSquare size={12} />{editing ? '收起备注' : item.note ? '编辑备注' : '选题备注'}</Button>
    </div>
    {item.aiState === 'failed' && item.aiError && <p className="trend-error">{item.aiError}</p>}
    {failure && <p className="trend-error" role="alert">{failure.message}</p>}
    {editing && <div className="trend-note-editor">
      <textarea aria-label="选题备注" value={note} disabled={busy} onChange={event => drafts.update(item.id, event.target.value)} placeholder="记录切入角度、观点或待核实的问题…" rows={3} />
      <div><span>备注随选题永久保存</span><Button size="sm" disabled={busy} onClick={() => save.mutate(note)}>{save.isPending ? '保存中' : item.saved ? '保存备注' : '加入选题池'}</Button></div>
    </div>}
  </article>;
}
