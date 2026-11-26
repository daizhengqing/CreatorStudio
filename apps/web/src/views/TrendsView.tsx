import { useState } from 'react';
import { ExternalLink, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { Category, ItemPage, SourceStatus, TrendItem, TrendsStatus } from '@creator-studio/contracts';
import { Button } from '@creator-studio/ui/button';
import { api, messageOf } from '@/api';
import { CollectionSearch, CollectionState, CollectionTime, useCollection, type CollectionViewProps } from './collection-view';

const pageSize = 20;
const categories = {
  social: '社会', international: '国际', ai: 'AI', finance: '财经', crypto: '加密',
} satisfies Record<Category, string>;
const sourceStates = {
  idle: '等待采集', refreshing: '采集中', ok: '采集正常', error: '采集异常', needs_auth: '待登录',
} satisfies Record<SourceStatus['state'], string>;

function TrendRow({ item, sourceId }: { item: TrendItem; sourceId: string }) {
  const text = item.summaryZh || item.content;
  const rankedSource = item.sources.find(source => source.rank !== null && (!sourceId || source.id === sourceId));
  return (
    <li className="collection-entry">
      <div className="collection-meta">
        <span className="collection-tag">{categories[item.category]}</span>
        {item.sources.length > 0 && <span>{item.sources.map(source => source.name).join(' · ')}</span>}
        <span>{item.publishedAt === null && '采集于 '}<CollectionTime value={item.publishedAt ?? item.firstSeenAt} /></span>
        {rankedSource && <span>热榜 #{rankedSource.rank}</span>}
        {item.saved && <span>已收藏</span>}
      </div>
      <h3 className="collection-entry-title">
        <a href={item.url} target="_blank" rel="noreferrer">
          {item.titleZh || item.title}<ExternalLink size={13} aria-hidden="true" />
        </a>
      </h3>
      {text && <p className="collection-entry-text collection-excerpt">{text}</p>}
    </li>
  );
}

export function TrendsView({ onOpenSettings }: CollectionViewProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);

  const params = new URLSearchParams({ offset: String(offset), limit: String(pageSize) });
  if (search) params.set('search', search);
  if (category) params.set('category', category);
  if (sourceId) params.set('sourceId', sourceId);
  if (savedOnly) params.set('savedOnly', 'true');
  const feed = useCollection<ItemPage>(`/api/collections/trends?${params}`, offset === 0 ? 15_000 : undefined);
  const status = useCollection<TrendsStatus>('/api/collections/trends/status', 8_000);
  const sources = status.data?.sources ?? [];
  const enabledCount = sources.filter(source => source.enabled).length;
  const collectingCount = sources.filter(source => source.state === 'refreshing').length;

  function filterSource(value: string) {
    setSourceId(value);
    setOffset(0);
  }

  async function refresh() {
    setRefreshing(true);
    setFeedback(null);
    try {
      const { sourceIds } = await api<{ sourceIds: string[] }>('/api/collections/trends/refresh', { method: 'POST' });
      setFeedback({ error: false, text: sourceIds.length ? `已请求 ${sourceIds.length} 个来源采集，结果将自动更新。` : '没有已启用的来源。' });
      setOffset(0);
      status.reload();
      feed.reload();
    } catch (error) {
      setFeedback({ error: true, text: messageOf(error) });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="collection-page" aria-labelledby="trends-heading">
      <div className="collection-shell">
        <header className="collection-header">
          <div>
            <h1 id="trends-heading">热点采集</h1>
            <p>{status.data ? `${enabledCount} 个来源已启用${collectingCount ? `，${collectingCount} 个正在采集` : ''}` : '查看已采集的资讯与热榜。'}</p>
          </div>
          <div className="collection-actions">
            <Button variant="outline" onClick={onOpenSettings}><SlidersHorizontal data-icon="inline-start" aria-hidden="true" />采集设置</Button>
            <Button disabled={refreshing || collectingCount > 0} onClick={() => { void refresh(); }}>
              <RefreshCw data-icon="inline-start" aria-hidden="true" />
              {refreshing ? '正在提交…' : collectingCount > 0 ? '采集中' : '刷新来源'}
            </Button>
          </div>
        </header>
        {feedback && <p className="collection-feedback" role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
        <div className="collection-grid">
          <section className="collection-panel" aria-labelledby="trends-feed-heading">
            <div className="collection-panel-heading">
              <h2 id="trends-feed-heading">资讯</h2>
              {feed.data && <span>{feed.data.total} 条结果</span>}
            </div>
            <div className="collection-filters">
              <CollectionSearch label="搜索资讯" onSearch={value => { setSearch(value); setOffset(0); }} />
              <select aria-label="资讯分类" value={category} onChange={event => { setCategory(event.target.value); setOffset(0); }}>
                <option value="">全部分类</option>
                {Object.entries(categories).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
              </select>
              <select aria-label="资讯来源" value={sourceId} onChange={event => filterSource(event.target.value)}>
                <option value="">全部来源</option>
                {sources.map(source => <option value={source.id} key={source.id}>{source.name}</option>)}
              </select>
              <label className="collection-check"><input type="checkbox" checked={savedOnly} onChange={event => { setSavedOnly(event.target.checked); setOffset(0); }} />仅看收藏</label>
            </div>
            {feed.error && <CollectionState text={feed.error} retry={feed.reload} />}
            {!feed.data && !feed.error && <CollectionState text="正在读取资讯…" />}
            {feed.data && <>
              {feed.data.items.length ? (
                <ul className="collection-list">
                  {feed.data.items.map(item => <TrendRow item={item} sourceId={sourceId} key={item.id} />)}
                </ul>
              ) : (
                <CollectionState text={search || category || sourceId || savedOnly ? '没有符合筛选条件的资讯。' : '暂无已采集的资讯。'} />
              )}
              {(offset > 0 || feed.data.total > pageSize) && (
                <nav className="collection-pagination" aria-label="资讯分页">
                  <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - pageSize))}>上一页</Button>
                  <span>第 {Math.floor(offset / pageSize) + 1} 页</span>
                  <Button variant="outline" size="sm" disabled={offset + pageSize >= feed.data.total} onClick={() => setOffset(value => value + pageSize)}>下一页</Button>
                </nav>
              )}
            </>}
          </section>
          <aside className="collection-panel" aria-labelledby="trends-sources-heading">
            <div className="collection-panel-heading"><h2 id="trends-sources-heading">采集来源</h2></div>
            {status.error && <CollectionState text={status.error} retry={status.reload} />}
            {!status.data && !status.error && <CollectionState text="正在读取来源…" />}
            {status.data && (
              <ul className="collection-side-list">
                {sources.map(source => (
                  <li key={source.id}>
                    <button type="button" className="collection-side-filter" aria-pressed={sourceId === source.id}
                      onClick={() => filterSource(sourceId === source.id ? '' : source.id)}>
                      <span className="collection-side-title">{source.name}</span>
                      <span className="collection-tag">{!source.enabled && source.state !== 'needs_auth' ? '已停用' : sourceStates[source.state]}</span>
                    </button>
                    {source.lastSuccessAt !== null && <p className="collection-side-note">最近成功 <CollectionTime value={source.lastSuccessAt} /></p>}
                    {source.error && <p className="collection-side-note" title={source.error}>{source.error}</p>}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
