import { useState } from 'react';
import { ExternalLink, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { XMonitorTarget, XMonitorTweet, XMonitorTweetCursor, XMonitorTweetPage } from '@creator-studio/contracts';
import { Button } from '@creator-studio/ui/button';
import { api, messageOf } from '@/api';
import { CollectionSearch, CollectionState, CollectionTime, useCollection, type CollectionViewProps } from './collection-view';

const kindLabels = { original: '原创', quote: '引用', repost: '转发' } satisfies Record<XMonitorTweet['kind'], string>;
const targetStates = {
  scheduled: '等待采集', collecting: '采集中', paused: '已暂停', removed: '已移除',
  needs_auth: '待登录', rate_limited: '已限流', runtime_missing: '环境未就绪', error: '采集异常',
} satisfies Record<XMonitorTarget['state'], string>;

function TweetRow({ tweet }: { tweet: XMonitorTweet }) {
  const reference = tweet.reference;
  return (
    <li className="collection-entry">
      <div className="collection-post-heading">
        <div className="collection-post-author">
          <h3>{tweet.author.name || `@${tweet.author.handle}`}</h3>
          <span>@{tweet.author.handle}</span>
        </div>
        <a className="collection-link" href={tweet.url} target="_blank" rel="noreferrer">
          原帖 <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
      <div className="collection-meta">
        <span className="collection-tag">{kindLabels[tweet.kind]}</span>
        <CollectionTime value={tweet.publishedAt} />
      </div>
      {tweet.text && <p className="collection-entry-text collection-post-text">{tweet.text}</p>}
      {reference && <blockquote className="collection-reference">
        <a className="collection-link" href={reference.url} target="_blank" rel="noreferrer">
          @{reference.author.handle} <ExternalLink size={12} aria-hidden="true" />
        </a>
        {reference.text && <p>{reference.text}</p>}
      </blockquote>}
      <div className="collection-meta collection-metrics">
        <span>回复 {tweet.metrics.replies}</span>
        <span>转发 {tweet.metrics.reposts}</span>
        <span>点赞 {tweet.metrics.likes}</span>
      </div>
    </li>
  );
}

export function XMonitorView({ onOpenSettings }: CollectionViewProps) {
  const [search, setSearch] = useState('');
  const [targetId, setTargetId] = useState('');
  const [kind, setKind] = useState('');
  const [cursors, setCursors] = useState<XMonitorTweetCursor[]>([]);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);

  const cursor = cursors.at(-1);
  const params = new URLSearchParams({ limit: '20' });
  if (search) params.set('q', search);
  if (targetId) params.set('targetId', targetId);
  if (kind) params.set('kind', kind);
  if (cursor) {
    params.set('cursorPublishedAt', String(cursor.publishedAt));
    params.set('cursorId', cursor.id);
  }
  const feed = useCollection<XMonitorTweetPage>(`/api/collections/x/tweets?${params}`, cursor ? undefined : 15_000);
  const targets = useCollection<XMonitorTarget[]>('/api/collections/x/targets', 8_000);
  const activeTargets = targets.data?.filter(target => target.state !== 'removed') ?? [];
  const next = feed.data?.nextCursor;

  function filterTarget(value: string) {
    setTargetId(value);
    setCursors([]);
  }

  function refresh() {
    setCursors([]);
    targets.reload();
    feed.reload();
  }

  async function collect(target: XMonitorTarget) {
    setCollectingId(target.id);
    setFeedback(null);
    try {
      await api<XMonitorTarget>(`/api/collections/x/targets/${encodeURIComponent(target.id)}/collect`, { method: 'POST' });
      setFeedback({ error: false, text: `已请求采集 @${target.handle}，结果将自动更新。` });
      refresh();
    } catch (error) {
      setFeedback({ error: true, text: messageOf(error) });
    } finally {
      setCollectingId(null);
    }
  }

  return (
    <main className="collection-page" aria-labelledby="x-monitor-heading">
      <div className="collection-shell">
        <header className="collection-header">
          <div>
            <h1 id="x-monitor-heading">X 监控</h1>
            <p>{targets.data ? `${activeTargets.length} 个监控目标` : '查看监控账号的已采集帖子。'}</p>
          </div>
          <div className="collection-actions">
            <Button variant="outline" onClick={onOpenSettings}><SlidersHorizontal data-icon="inline-start" aria-hidden="true" />X 账号设置</Button>
            <Button onClick={refresh}><RefreshCw data-icon="inline-start" aria-hidden="true" />刷新列表</Button>
          </div>
        </header>
        {feedback && <p className="collection-feedback" role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
        <div className="collection-grid">
          <section className="collection-panel" aria-labelledby="x-feed-heading">
            <div className="collection-panel-heading"><h2 id="x-feed-heading">已采集帖子</h2></div>
            <div className="collection-filters">
              <CollectionSearch label="搜索帖子正文" onSearch={value => { setSearch(value); setCursors([]); }} />
              <select aria-label="监控目标" value={targetId} onChange={event => filterTarget(event.target.value)}>
                <option value="">全部目标</option>
                {targets.data?.map(target => <option value={target.id} key={target.id}>@{target.handle}{target.state === 'removed' ? '（已移除）' : ''}</option>)}
              </select>
              <select aria-label="帖子类型" value={kind} onChange={event => { setKind(event.target.value); setCursors([]); }}>
                <option value="">全部类型</option>
                {Object.entries(kindLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>
            {feed.error && <CollectionState text={feed.error} retry={feed.reload} />}
            {!feed.data && !feed.error && <CollectionState text="正在读取帖子…" />}
            {feed.data && <>
              {feed.data.items.length ? (
                <ul className="collection-list">{feed.data.items.map(tweet => <TweetRow key={tweet.id} tweet={tweet} />)}</ul>
              ) : <CollectionState text={search || targetId || kind ? '没有符合筛选条件的帖子。' : '暂无已采集的帖子。'} />}
              {(cursor || next) && <nav className="collection-pagination" aria-label="帖子分页">
                <Button variant="outline" size="sm" disabled={!cursor} onClick={() => setCursors(values => values.slice(0, -1))}>上一页</Button>
                <span>第 {cursors.length + 1} 页</span>
                <Button variant="outline" size="sm" disabled={!next} onClick={() => { if (next) setCursors(values => [...values, next]); }}>下一页</Button>
              </nav>}
            </>}
          </section>
          <aside className="collection-panel" aria-labelledby="x-targets-heading">
            <div className="collection-panel-heading"><h2 id="x-targets-heading">监控目标</h2></div>
            {targets.error && <CollectionState text={targets.error} retry={targets.reload} />}
            {!targets.data && !targets.error && <CollectionState text="正在读取监控目标…" />}
            {targets.data && (activeTargets.length ? (
              <ul className="collection-side-list">
                {activeTargets.map(target => (
                  <li key={target.id}>
                    <button type="button" className="collection-side-filter" aria-pressed={targetId === target.id}
                      onClick={() => filterTarget(targetId === target.id ? '' : target.id)}>
                      <span className="collection-side-title">@{target.handle}</span>
                      <span className="collection-tag">{targetStates[target.state]}</span>
                    </button>
                    <p className="collection-side-note">每 {target.intervalMinutes} 分钟采集</p>
                    {target.lastSuccessAt !== null && <p className="collection-side-note">最近成功 <CollectionTime value={target.lastSuccessAt} /></p>}
                    {target.nextRunAt !== null && <p className="collection-side-note">下次采集 <CollectionTime value={target.nextRunAt} /></p>}
                    {target.message && <p className="collection-side-note" title={target.message}>{target.message}</p>}
                    <Button size="sm" variant="outline" className="collection-side-action"
                      disabled={collectingId !== null || target.state === 'paused' || target.state === 'collecting'}
                      aria-label={`立即采集 @${target.handle}`} onClick={() => { void collect(target); }}>
                      {collectingId === target.id ? '正在提交…' : '立即采集'}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : <CollectionState text="暂无监控目标。配置 X 登录账号后，可在会话中让 Agent 添加监控。" />)}
          </aside>
        </div>
      </div>
    </main>
  );
}
