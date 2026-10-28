import { useState } from 'react';
import { ArrowDown, RefreshCw } from 'lucide-react';
import { Button } from '@creator-studio/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RankingGroup } from '../contracts';
import { TrendCard } from './TrendCard';
import { formatDate, useTrendsApi } from './shared';

function RankingColumn({ group }: { group: RankingGroup }) {
  const api = useTrendsApi();
  const client = useQueryClient();
  const [visible, setVisible] = useState(10);
  const refresh = useMutation({
    mutationFn: () => api.call('refresh', { sourceId: group.source.id }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['trends'] }); },
  });
  return <section className="trend-ranking-column">
    <header className="trend-ranking-header">
      <div><strong>{group.source.name}</strong><span>最近成功 {formatDate(group.source.lastSuccessAt)}</span></div>
      <Button size="icon" variant="ghost" title={`刷新${group.source.name}`} aria-label={`刷新${group.source.name}`}
        disabled={refresh.isPending || group.source.state === 'refreshing'} onClick={() => refresh.mutate()}><RefreshCw size={14} className={refresh.isPending ? 'trend-spinning' : ''} /></Button>
    </header>
    {group.source.error && <p className="trend-error">{group.source.error}</p>}
    {refresh.error && <p className="trend-error" role="alert">{refresh.error.message}</p>}
    {group.items.slice(0, visible).map(item => <TrendCard key={item.id} item={item} rankSourceId={group.source.id} />)}
    {group.items.length === 0 && <div className="trend-empty">{group.source.state === 'needs_auth' ? '请先在设置中更新凭据' : '尚无热榜内容'}</div>}
    {visible < group.items.length && <Button variant="ghost" size="sm" className="trend-load-more" onClick={() => setVisible(value => value + 10)}><ArrowDown size={13} />展开更多（{group.items.length - visible}）</Button>}
  </section>;
}

export function RankingBoard({ groups }: { groups: RankingGroup[] }) {
  return <div className="trend-rankings">{groups.map(group => <RankingColumn key={group.source.id} group={group} />)}</div>;
}
