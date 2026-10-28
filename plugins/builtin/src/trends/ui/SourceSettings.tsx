import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@creator-studio/ui/button';
import { categoryNames, type SourceStatus } from '../contracts';
import { formatDate, useTrendsApi } from './shared';

const sourceStates: Record<SourceStatus['state'], string> = {
  idle: '等待采集', refreshing: '采集中', ok: '正常', error: '采集失败', needs_auth: '需要凭据',
};

export function SourceSettings({ sources }: { sources: SourceStatus[] }) {
  const api = useTrendsApi();
  const client = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [cookie, setCookie] = useState('');
  const [message, setMessage] = useState('');
  const update = useMutation({
    mutationFn: (input: { sourceId: string; enabled: boolean }) => api.call('setSourceEnabled', input),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['trends'] }); },
  });
  const credentials = useMutation({
    mutationFn: (input: { sourceId: string; cookie: string }) => api.call('saveSourceCredentials', input),
    onSuccess: (_, input) => {
      setEditing(null); setCookie(''); setMessage(input.cookie ? '凭据已保存，正在验证；验证通过后会自动启用来源。' : '凭据已清除，来源已停用。');
      void client.invalidateQueries({ queryKey: ['trends'] });
    },
  });
  const error = update.error ?? credentials.error;
  return <section className="trend-settings-section">
    <h3>信息源 <span className="trend-hint">{sources.filter(source => source.enabled).length} / {sources.length} 已启用</span></h3>
    <p className="trend-hint">来源开关立即生效。检查时间表示尝试连接的时间，最近成功时间用于判断内容是否可能过时。</p>
    {error && <p className="trend-error" role="alert">{error.message}</p>}
    {message && <p className="trend-ready" role="status">{message}</p>}
    <div className="trend-source-list">
      {sources.map(source => <div className="trend-source-row" key={source.id}>
        <div className="trend-source-main">
          <label className="trend-checkbox"><input type="checkbox" checked={source.enabled} disabled={update.isPending && update.variables?.sourceId === source.id}
            onChange={event => update.mutate({ sourceId: source.id, enabled: event.target.checked })} /><strong>{source.name}</strong></label>
          <span className="trend-source-category">{categoryNames[source.category]}</span>
          <span className={source.state === 'error' || source.state === 'needs_auth' ? 'trend-error' : 'trend-hint'}>{source.enabled || source.state === 'needs_auth' || source.state === 'error' ? sourceStates[source.state] : '已停用'}</span>
          {source.requiresCredentials && <Button size="sm" variant="outline" type="button" onClick={() => {
            setEditing(editing === source.id ? null : source.id); setCookie(''); setMessage('');
          }}>{source.hasCredentials ? '更新 Cookie' : '配置 Cookie'}</Button>}
        </div>
        <div className="trend-source-times"><span>最近检查 {formatDate(source.lastCheckedAt)}</span><span>最近成功 {formatDate(source.lastSuccessAt)}</span>
          {source.latestContentAt !== null && <span>最新内容 {formatDate(source.latestContentAt)}</span>}</div>
        {source.error && <p className="trend-error">{source.error}</p>}
        {editing === source.id && <div className="trend-cookie-editor">
          <label>来源 Cookie<textarea value={cookie} autoComplete="off" spellCheck={false} rows={3} onChange={event => setCookie(event.target.value)}
            placeholder={source.hasCredentials ? '已保存的 Cookie 不会回显；输入新值替换' : '从你已登录的浏览器请求中复制 Cookie'} /></label>
          <p className="trend-hint">仅保存到本机后台，读取设置时不会返回 Cookie。过期后在此替换。</p>
          <div><Button type="button" size="sm" disabled={credentials.isPending || !cookie.trim()} onClick={() => credentials.mutate({ sourceId: source.id, cookie: cookie.trim() })}>保存 Cookie</Button>
            <Button type="button" size="sm" variant="outline" disabled={credentials.isPending || !source.hasCredentials} onClick={() => credentials.mutate({ sourceId: source.id, cookie: '' })}>清除已存 Cookie</Button></div>
        </div>}
      </div>)}
    </div>
  </section>;
}
