import { useEffect, useState } from 'react';
import type { SourceStatus, TrendsConfig } from '@creator-studio/contracts';
import { Button } from '@creator-studio/ui/button';
import { Input } from '@creator-studio/ui/input';
import { api, json, messageOf } from '@/api';
import { SettingsField } from './SettingsField';

type Config = { config: TrendsConfig; sources: SourceStatus[] };

export function TrendSettings() {
  const [data, setData] = useState<Config | null>(null);
  const [proxy, setProxy] = useState<string | null>(null);
  const [cookie, setCookie] = useState('');
  const [busy, setBusy] = useState<'proxy' | 'cookie' | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean }>();
  const weibo = data?.sources.find(source => source.id === 'weibo');

  useEffect(() => {
    void api<Config>('/api/settings/trends').then(setData)
      .catch(error => setFeedback({ message: messageOf(error), ok: false }));
  }, []);

  async function saveProxy() {
    setBusy('proxy');
    setFeedback(undefined);
    try {
      const config = await api<TrendsConfig>('/api/settings/trends/proxy', json('PUT', { proxyUrl: proxy ?? '' }));
      setData(current => current ? { ...current, config } : current);
      setProxy(null);
      setFeedback({ message: '采集代理已保存', ok: true });
    } catch (error) { setFeedback({ message: messageOf(error), ok: false }); }
    finally { setBusy(null); }
  }

  async function saveCookie(value: string) {
    setBusy('cookie');
    setFeedback(undefined);
    try {
      const source = await api<SourceStatus>('/api/settings/trends/weibo', json('PUT', { cookie: value }));
      setData(current => current ? { ...current, sources: current.sources.map(item => item.id === source.id ? source : item) } : current);
      setCookie('');
      setFeedback({ message: source.error ?? (value ? '微博登录态已保存并完成试采' : '微博登录态已清除'), ok: !source.error });
    } catch (error) { setFeedback({ message: messageOf(error), ok: false }); }
    finally { setBusy(null); }
  }

  return <div className="settings-fields">
    {data && <>
      <form className="settings-form" onSubmit={event => { event.preventDefault(); void saveProxy(); }}>
        <SettingsField label="热点采集代理" hint="此设置用于 RSS、快讯和平台热榜。">
          <Input value={proxy ?? data.config.proxyUrl} onChange={event => setProxy(event.target.value)} placeholder="http://127.0.0.1:7897" />
        </SettingsField>
        <Button className="self-start" type="submit" disabled={Boolean(busy) || proxy === null}>{busy === 'proxy' ? '保存中…' : '保存代理'}</Button>
      </form>
      <form className="settings-form" onSubmit={event => { event.preventDefault(); void saveCookie(cookie); }}>
        <SettingsField label="微博 Cookie" hint={weibo?.hasCredentials ? '已保存登录态。更新后会重新试采。' : '使用你自己的微博浏览器登录态。'}>
          <Input type="password" value={cookie} autoComplete="new-password" onChange={event => setCookie(event.target.value)} />
        </SettingsField>
        <div className="settings-actions">
          <Button type="submit" disabled={!cookie.trim() || Boolean(busy)}>{busy === 'cookie' ? '处理中…' : '保存并试采'}</Button>
          {weibo?.hasCredentials && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => { void saveCookie(''); }}>清除登录态</Button>}
        </div>
      </form>
    </>}
    {feedback && <p role={feedback.ok ? 'status' : 'alert'} className={feedback.ok ? undefined : 'status-error'}>{feedback.message}</p>}
  </div>;
}
