import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { List, Search } from 'lucide-react';
import { Button } from '@creator-studio/ui/button';
import { Input } from '@creator-studio/ui/input';
import type { XMonitorTarget, XMonitorTweetCursor, XMonitorTweetKind, XMonitorTweetQuery } from '@creator-studio/plugin-sdk/x-monitor';
import { kindNames, queryRoot, useMonitorApi } from './shared';
import { TweetCard } from './TweetCard';

const emptyFilters = { targetId: '', q: '', kind: '' as XMonitorTweetKind | '', media: '', from: '', to: '' };

function endOfDay(date: string): number {
  const value = new Date(`${date}T00:00:00`);
  return value.setDate(value.getDate() + 1);
}

export function TweetsPanel({ targets, onAddTarget }: { targets: XMonitorTarget[]; onAddTarget: () => void }) {
  const api = useMonitorApi();
  const [filters, setFilters] = useState(emptyFilters);
  const query: XMonitorTweetQuery = {
    targetId: filters.targetId || undefined,
    q: filters.q.trim() || undefined,
    kind: filters.kind || undefined,
    hasMedia: filters.media ? filters.media === 'yes' : undefined,
    from: filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : undefined,
    to: filters.to ? endOfDay(filters.to) : undefined,
  };
  const filtered = Object.values(query).some(value => value !== undefined);
  const page = useInfiniteQuery({
    queryKey: [queryRoot, 'tweets', query],
    initialPageParam: undefined as XMonitorTweetCursor | undefined,
    queryFn: ({ pageParam }) => api.call('listTweets', { ...query, cursor: pageParam }),
    getNextPageParam: result => result.nextCursor ?? undefined,
  });
  const tweets = page.data?.pages.flatMap(result => result.items) ?? [];

  return <div className="xm-feed">
    <div className="xm-filters">
      <div className="xm-filter-row">
        <label className="xm-search"><Search size={15} aria-hidden />
          <Input aria-label="搜索推文正文" placeholder="搜索推文正文" value={filters.q}
            onChange={event => setFilters({ ...filters, q: event.target.value })} />
        </label>
        <select aria-label="监控账号筛选" value={filters.targetId}
          onChange={event => setFilters({ ...filters, targetId: event.target.value })}>
          <option value="">全部账号</option>
          {targets.map(target => <option key={target.id} value={target.id}>
            @{target.handle}{target.state === 'removed' ? '（已移除）' : ''}
          </option>)}
        </select>
        <select aria-label="推文类型筛选" value={filters.kind}
          onChange={event => setFilters({ ...filters, kind: event.target.value as typeof filters.kind })}>
          <option value="">全部类型</option>
          {Object.entries(kindNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="媒体筛选" value={filters.media}
          onChange={event => setFilters({ ...filters, media: event.target.value })}>
          <option value="">全部媒体</option><option value="yes">有媒体</option><option value="no">无媒体</option>
        </select>
      </div>
      <div className="xm-filter-row xm-dates">
        <label>起始日期<Input type="date" value={filters.from} max={filters.to || undefined}
          onChange={event => setFilters({ ...filters, from: event.target.value })} /></label>
        <label>结束日期<Input type="date" value={filters.to} min={filters.from || undefined}
          onChange={event => setFilters({ ...filters, to: event.target.value })} /></label>
        {filtered && <Button variant="ghost" onClick={() => setFilters(emptyFilters)}>清除筛选</Button>}
      </div>
    </div>
    <div className="xm-scroll xm-feed-body" aria-busy={page.isPending}>
      {page.error && <p className="xm-error" role="alert">{page.error.message} <Button variant="ghost" onClick={() => void page.refetch()}>重试</Button></p>}
      {tweets.map(tweet => <TweetCard tweet={tweet} key={tweet.id} />)}
      {page.isPending && <p className="xm-empty">正在读取推文…</p>}
      {page.isSuccess && !tweets.length && <div className="xm-empty">
        <List size={24} aria-hidden />
        <strong>{filtered ? '没有符合条件的推文' : '暂无推文'}</strong>
        {!filtered && targets.some(target => target.state !== 'removed') && <span>可在监控账号中查看采集状态。</span>}
        {!filtered && targets.every(target => target.state === 'removed') && <Button variant="outline" onClick={onAddTarget}>添加监控账号</Button>}
      </div>}
      {page.hasNextPage && <div className="xm-more"><Button variant="outline" disabled={page.isFetchingNextPage}
        onClick={() => void page.fetchNextPage()}>{page.isFetchingNextPage ? '加载中…' : '加载更多'}</Button></div>}
    </div>
  </div>;
}
