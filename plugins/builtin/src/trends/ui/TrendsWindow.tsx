import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, ChevronLeft, ChevronRight, Flame, Newspaper, RefreshCw, Search, Settings2 } from 'lucide-react';
import { Button } from '@creator-studio/ui/button';
import { Input } from '@creator-studio/ui/input';
import { usePlugin } from '../../context';
import { categoryNames, type Category } from '../contracts';
import { RankingBoard } from './RankingBoard';
import { SettingsPanel } from './SettingsPanel';
import { TrendCard } from './TrendCard';
import { TopicDraftContext, useTrendsApi } from './shared';

type Tab = 'feed' | 'rankings' | 'topics';
const tabs = [{ id: 'feed', title: '资讯流', icon: Newspaper }, { id: 'rankings', title: '热榜', icon: Flame }, { id: 'topics', title: '选题池', icon: Bookmark }] as const;
const pageSize = 25;

export function TrendsWindow() {
  const api = useTrendsApi();
  const { sdk } = usePlugin();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>('feed');
  const [settings, setSettings] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [sourceId, setSourceId] = useState('');
  const [offset, setOffset] = useState(0);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  // 草稿随窗口存活，列表刷新、分页及进入设置均不丢失未保存的备注。
  function updateDraft(itemId: string, note: string | undefined) {
    setNoteDrafts(current => {
      const next = { ...current };
      if (note === undefined) delete next[itemId]; else next[itemId] = note;
      return next;
    });
  }
  const filters = { search: search.trim() || undefined, category: category || undefined, sourceId: sourceId || undefined };
  const query = { ...filters, savedOnly: tab === 'topics', offset, limit: pageSize };
  const status = useQuery({ queryKey: ['trends', 'status'], queryFn: () => api.call('getStatus', null), refetchInterval: 30_000 });
  const page = useQuery({ queryKey: ['trends', 'list', query], queryFn: () => api.call('list', query), enabled: tab !== 'rankings' });
  const rankings = useQuery({ queryKey: ['trends', 'rankings', filters], queryFn: () => api.call('rankings', filters), enabled: tab === 'rankings' });
  const refresh = useMutation({
    mutationFn: () => api.call('refresh', {}), onSuccess: () => { void client.invalidateQueries({ queryKey: ['trends'] }); },
  });
  useEffect(() => {
    const changed = () => { void client.invalidateQueries({ queryKey: ['trends'] }); };
    const subscriptions = [sdk.events.subscribe('studio.trends.changed', changed), sdk.events.subscribe('studio.connection.open', changed)];
    return () => subscriptions.forEach(dispose => dispose());
  }, [sdk, client]);
  // 移除最后一页的选题后回到仍有内容的一页。
  useEffect(() => {
    if (page.data && offset > 0 && page.data.total <= offset) setOffset(Math.max(0, Math.floor((page.data.total - 1) / pageSize) * pageSize));
  }, [page.data, offset]);
  const sources = status.data?.sources ?? [];
  const enabled = sources.filter(source => source.enabled);
  const failed = sources.filter(source => source.state === 'needs_auth' || (source.enabled && source.state === 'error'));
  const loading = tab === 'rankings' ? rankings.isPending : page.isPending;
  const contentError = tab === 'rankings' ? rankings.error : page.error;
  const error = refresh.error ?? status.error ?? contentError;
  const total = page.data?.total ?? 0;
  const queue = status.data?.queue;
  const refreshing = refresh.isPending || enabled.some(source => source.state === 'refreshing');

  if (settings) return <div className="trends-root"><SettingsPanel sources={sources} onClose={() => setSettings(false)} /></div>;
  return <TopicDraftContext value={{ values: noteDrafts, update: updateDraft }}><div className="trends-root">
    <header className="trend-topbar">
      <div className="trend-tabs">{tabs.map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`trend-tab ${tab === id ? 'active' : ''}`} aria-pressed={tab === id}
        onClick={() => { setTab(id); setOffset(0); setSourceId(''); }}><Icon size={15} />{title}</button>)}</div>
      <span className="trend-spacer" />
      <Button variant="outline" size="sm" disabled={refreshing} onClick={() => refresh.mutate()}><RefreshCw size={13} className={refreshing ? 'trend-spinning' : ''} />{refreshing ? '刷新中' : '刷新'}</Button>
      <Button variant="ghost" size="sm" onClick={() => setSettings(true)}><Settings2 size={14} />设置</Button>
    </header>
    <div className="trend-filters">
      <div className="trend-search"><Search size={14} /><Input value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} placeholder={tab === 'topics' ? '搜索收藏标题或备注' : '搜索标题或内容'} aria-label="搜索资讯" /></div>
      <select aria-label="筛选领域" value={category} onChange={event => { setCategory(event.target.value as Category | ''); setSourceId(''); setOffset(0); }}>
        <option value="">全部领域</option>{(Object.keys(categoryNames) as Category[]).map(key => <option key={key} value={key}>{categoryNames[key]}</option>)}
      </select>
      <select aria-label="筛选来源" value={sourceId} onChange={event => { setSourceId(event.target.value); setOffset(0); }}>
        <option value="">全部来源</option>{sources.filter(source => (!category || source.category === category) && (tab !== 'rankings' || source.kind === 'hot' || source.kind === 'community'))
          .map(source => <option key={source.id} value={source.id}>{source.name}{!source.enabled ? '（已停用）' : ''}</option>)}
      </select>
    </div>
    <div className="trend-health">
      <span className={`trend-dot ${failed.length ? 'warning' : enabled.length ? 'ready' : ''}`} />
      <span>{enabled.length} 个来源已启用</span>
      {failed.length > 0 && <button type="button" className="trend-health-action" onClick={() => setSettings(true)}>{failed.length} 个来源需要处理</button>}
      <span className="trend-spacer" />
      <span>{status.data?.modelReady ? status.data.autoGenerate ? 'AI 自动处理已就绪' : 'AI 已就绪 · 自动处理已暂停' : 'AI 未就绪，可在设置中配置并测试'}</span>
      {queue && (queue.pending > 0 || queue.processing > 0) && <span>加工中 {queue.processing} · {status.data?.autoGenerate ? '待处理' : '已暂停'} {queue.pending}</span>}
      {queue && queue.failed > 0 && <span>AI 失败 {queue.failed}</span>}
    </div>
    {error && <div className="trend-banner trend-error" role="alert">{error.message}<Button variant="ghost" size="sm" onClick={() => { void client.invalidateQueries({ queryKey: ['trends'] }); }}>重新读取</Button></div>}
    <main className={`trend-body ${tab === 'rankings' ? 'ranking-view' : ''}`} aria-label={tabs.find(value => value.id === tab)?.title} aria-busy={loading}>
      {loading ? <div className="trend-empty"><RefreshCw className="trend-spinning" size={22} />正在读取资讯…</div>
        : tab === 'rankings' ? rankings.data?.length ? <RankingBoard groups={rankings.data} /> : <div className="trend-empty"><Flame size={26} />当前筛选下暂无热榜<p>可在设置中检查微博、知乎与抖音来源。</p></div>
          : page.data?.items.length ? <div className="trend-feed">{page.data.items.map(item => <TrendCard key={item.id} item={item} />)}</div>
            : <div className="trend-empty">{tab === 'topics' ? <Bookmark size={26} /> : <Newspaper size={26} />}<strong>{tab === 'topics' ? '暂时没有选题' : '暂时没有资讯'}</strong>
              <p>{search || category || sourceId ? '调整搜索或筛选条件后再试。' : tab === 'topics' ? '点击资讯上的书签，将值得创作的热点加入选题池。' : '首次采集可能需要一些时间，可在设置中查看信息源状态。'}</p></div>}
    </main>
    <footer className="trend-bottom-bar">
      <span>{tab === 'topics' ? '选题与备注永久保留' : '保留 30 天 · 仅在后台运行期间持续采集'}</span>
      <span className="trend-spacer" />
      {tab !== 'rankings' && <><span>{total ? `${offset + 1}–${Math.min(offset + pageSize, total)} / ${total}` : '0 条'}</span>
        <Button variant="ghost" size="icon" aria-label="上一页" disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - pageSize))}><ChevronLeft size={14} /></Button>
        <Button variant="ghost" size="icon" aria-label="下一页" disabled={offset + pageSize >= total || loading} onClick={() => setOffset(value => value + pageSize)}><ChevronRight size={14} /></Button></>}
    </footer>
  </div></TopicDraftContext>;
}
