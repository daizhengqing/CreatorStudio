import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, KeyRound, List, Radar } from 'lucide-react';
import { Button } from '@creator-studio/ui/button';
import { X_MONITOR_TWEETS_CHANGED } from '@creator-studio/plugin-sdk/x-monitor';
import { usePlugin } from '../../context';
import { STATUS_CHANGED } from '../contracts';
import { AccountsPanel } from './AccountsPanel';
import { queryRoot, useMonitorApi } from './shared';
import { TargetsPanel } from './TargetsPanel';
import { TweetsPanel } from './TweetsPanel';

const tabs = [
  ['tweets', '推文', List], ['targets', '监控账号', Radar], ['accounts', '登录账号', KeyRound],
] as const;

export function XMonitorWindow() {
  const api = useMonitorApi();
  const { sdk } = usePlugin();
  const client = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('tweets');
  const runtime = useQuery({ queryKey: [queryRoot, 'runtime'], queryFn: () => api.call('getRuntime', null) });
  const targets = useQuery({ queryKey: [queryRoot, 'targets'], queryFn: () => api.call('listTargets', null) });
  const ready = runtime.data?.ready ?? false;
  const preparing = runtime.isFetching && !ready;
  const runtimeError = preparing ? null : runtime.error?.message ?? runtime.data?.message;

  useEffect(() => {
    const subscriptions = [
      sdk.events.subscribe(STATUS_CHANGED, () => { void client.invalidateQueries({ queryKey: [queryRoot, 'targets'] }); }),
      sdk.events.subscribe(X_MONITOR_TWEETS_CHANGED, () => { void client.invalidateQueries({ queryKey: [queryRoot, 'tweets'] }); }),
      sdk.events.subscribe('studio.connection.open', () => { void client.invalidateQueries({ queryKey: [queryRoot] }); }),
    ];
    return () => subscriptions.forEach(dispose => dispose());
  }, [client, sdk]);

  return <div className="xm-root">
    <nav className="xm-tabs" aria-label="X Monitor">
      {tabs.map(([key, title, Icon]) => <Button key={key} type="button" aria-pressed={tab === key}
        variant={tab === key ? 'secondary' : 'ghost'} onClick={() => setTab(key)}>
        <Icon data-icon="inline-start" aria-hidden />{title}
      </Button>)}
    </nav>
    {preparing && <div className="xm-notice xm-preparing" role="status">正在准备 Python 依赖…</div>}
    {(runtimeError || targets.error) && <div className="xm-notice" role="alert">
      <AlertCircle size={15} aria-hidden />
      <span>{runtimeError ?? targets.error?.message}</span>
      <Button variant="ghost" onClick={() => {
        if (runtimeError) void runtime.refetch();
        if (targets.error) void targets.refetch();
      }}>重试</Button>
    </div>}
    {tab === 'tweets' ? <TweetsPanel targets={targets.data ?? []} onAddTarget={() => setTab('targets')} />
      : tab === 'targets' ? <TargetsPanel targets={targets.data ?? []} ready={ready} loading={targets.isPending} />
        : <AccountsPanel ready={ready} />}
  </div>;
}
