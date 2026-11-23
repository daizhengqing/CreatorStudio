import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Radar } from 'lucide-react';
import { Button } from '@creator-studio/ui/button';
import { Input } from '@creator-studio/ui/input';
import type { XMonitorTarget } from '@creator-studio/plugin-sdk/x-monitor';
import { DEFAULT_INTERVAL, type AddTarget, type Backfill } from '../contracts';
import { dateTime, queryRoot, targetStates, useMonitorApi } from './shared';

type RowAction = { action: 'interval'; minutes: number } | { action: 'toggle' | 'collect' | 'remove' };

function TargetRow({ target }: { target: XMonitorTarget }) {
  const api = useMonitorApi();
  const query = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const paused = target.state === 'paused';
  const collecting = target.state === 'collecting';
  const command = useMutation({
    mutationFn: (input: RowAction) => {
      if (input.action === 'interval') return api.call('updateTarget', { id: target.id, intervalMinutes: input.minutes });
      if (input.action === 'toggle') return api.call('updateTarget', { id: target.id, enabled: paused });
      return api.call(input.action === 'collect' ? 'collectNow' : 'removeTarget', { id: target.id });
    },
    onSuccess: async (_, input) => {
      await query.invalidateQueries({ queryKey: [queryRoot, 'targets'] });
      if (input.action === 'interval') setDraft(null);
    },
  });

  function saveInterval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    command.mutate({ action: 'interval', minutes: Number(draft) });
  }

  return <li className="xm-record">
    <div className="xm-record-identity">
      {target.avatarUrl && <img className="xm-avatar" src={target.avatarUrl} alt="" loading="lazy" />}
      <div className="xm-tweet-byline">
        <strong title={target.name}>{target.name || `@${target.handle}`}</strong>
        <a href={`https://x.com/${target.handle}`} target="_blank" rel="noreferrer">@{target.handle}</a>
      </div>
    </div>
    <form className="xm-interval" onSubmit={saveInterval}>
      <Input type="number" min={1} step={1} required aria-label={`@${target.handle} 的采集间隔（分钟）`}
        value={draft ?? target.intervalMinutes} onChange={event => setDraft(event.target.value)} />
      <span>分钟</span>
      <Button type="submit" variant="outline" disabled={draft === null || Number(draft) === target.intervalMinutes || command.isPending}>保存</Button>
    </form>
    <div className="xm-record-status">
      <strong data-state={target.state}>{targetStates[target.state]}</strong>
      <span>上次成功 {target.lastSuccessAt === null ? '—' : dateTime.format(target.lastSuccessAt)}</span>
      <span>下次采集 {target.nextRunAt === null || collecting ? '—' : dateTime.format(target.nextRunAt)}</span>
    </div>
    <div className="xm-actions">
      <Button type="button" variant="outline" disabled={paused || collecting || command.isPending}
        onClick={() => command.mutate({ action: 'collect' })}>立即采集</Button>
      <Button type="button" variant="ghost" disabled={command.isPending}
        onClick={() => command.mutate({ action: 'toggle' })}>{paused ? '恢复' : '暂停'}</Button>
      <Button type="button" variant="ghost" disabled={command.isPending}
        onClick={() => command.mutate({ action: 'remove' })}>移除</Button>
    </div>
    {(command.error || target.message) && <p className="xm-row-note" role="status">{command.error?.message ?? target.message}</p>}
  </li>;
}

export function TargetsPanel({ targets, ready, loading }: { targets: XMonitorTarget[]; ready: boolean; loading: boolean }) {
  const api = useMonitorApi();
  const query = useQueryClient();
  const [mode, setMode] = useState<Backfill['mode']>('from_now');
  const create = useMutation({
    mutationFn: (input: AddTarget) => api.call('addTarget', input),
    onSuccess: () => query.invalidateQueries({ queryKey: [queryRoot, 'targets'] }),
  });

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const backfill: Backfill = mode === 'from_now' ? { mode } : { mode, amount: Number(values.get('amount')) };
    create.mutate({ handle: String(values.get('handle')), intervalMinutes: Number(values.get('interval')), backfill }, {
      onSuccess: () => { form.reset(); setMode('from_now'); },
    });
  }

  const activeTargets = targets.filter(target => target.state !== 'removed');
  return <div className="xm-scroll">
    <div className="xm-panel">
      <section className="xm-form-section" aria-label="添加监控账号">
        <h2>添加监控账号</h2>
        <form onSubmit={add}>
          <div className="xm-form-fields">
            <label className="xm-field">X 用户名<Input required name="handle" placeholder="@用户名" autoCapitalize="off" /></label>
            <label className="xm-field">采集间隔（分钟）<Input required name="interval" type="number" min={1} step={1} defaultValue={DEFAULT_INTERVAL} /></label>
            <label className="xm-field">首次采集<select name="mode" value={mode} onChange={event => setMode(event.target.value as typeof mode)}>
              <option value="from_now">从添加时开始</option><option value="days">立即补采过去 N 天</option><option value="latest">立即补采最新 N 条</option>
            </select></label>
            {mode !== 'from_now' && <label className="xm-field">{mode === 'days' ? '补采天数' : '补采条数'}
              <Input key={mode} required name="amount" type="number" min={1} step={1} />
            </label>}
          </div>
          <Button type="submit" disabled={!ready || create.isPending}>
            <Plus data-icon="inline-start" aria-hidden />{create.isPending ? '正在添加…' : '添加监控'}
          </Button>
          {create.error && <p className="xm-error" role="alert">{create.error.message}</p>}
        </form>
      </section>
      <section className="xm-list-section" aria-label="监控账号列表">
        <h2>监控列表 <span className="xm-quiet">{activeTargets.length}</span></h2>
        {loading ? <p className="xm-empty">正在读取监控账号…</p>
          : activeTargets.length ? <ul className="xm-records">{activeTargets.map(target => <TargetRow key={target.id} target={target} />)}</ul>
            : <div className="xm-empty"><Radar size={24} aria-hidden /><span>暂无监控账号</span></div>}
      </section>
    </div>
  </div>;
}
