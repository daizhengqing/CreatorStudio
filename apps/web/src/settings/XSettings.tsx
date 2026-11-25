import { useEffect, useState, type FormEvent } from 'react';
import type { LoginAccount, LoginDetails, RuntimeStatus } from '@creator-studio/contracts';
import { Button } from '@creator-studio/ui/button';
import { Input } from '@creator-studio/ui/input';
import { api, json, messageOf } from '@/api';
import { SettingsField } from './SettingsField';

const stateLabel: Record<LoginAccount['state'], string> = {
  configured: '已配置', ready: '可用', rate_limited: '已限流', needs_auth: '需要重新登录',
};

export function XSettings() {
  const [accounts, setAccounts] = useState<LoginAccount[]>([]);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [mode, setMode] = useState<LoginDetails['mode']>('cookie');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    setRuntime(null);
    try {
      const status = await api<RuntimeStatus>('/api/settings/x/runtime');
      setRuntime(status);
      if (status.ready) setAccounts(await api<LoginAccount[]>('/api/settings/x/accounts'));
    } catch (error) { setError(messageOf(error)); }
  }

  useEffect(() => { void load(); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const read = (key: string) => String(fields.get(key) ?? '');
    const username = read('username');
    const input: LoginDetails = mode === 'cookie'
      ? { mode, username, cookie: read('cookie') }
      : { mode, username, password: read('password'), email: read('email'), emailPassword: read('emailPassword') || undefined, totpSecret: read('totpSecret') || undefined };
    setBusy(true);
    setError('');
    try {
      const account = await api<LoginAccount>('/api/settings/x/accounts', json('POST', input));
      setAccounts(list => [...list.filter(item => item.username !== account.username), account]);
      form.reset();
    } catch (error) { setError(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function remove(username: string) {
    setError('');
    setBusy(true);
    try {
      await api(`/api/settings/x/accounts/${encodeURIComponent(username)}`, { method: 'DELETE' });
      setAccounts(list => list.filter(account => account.username !== username));
    } catch (error) { setError(messageOf(error)); }
    finally { setBusy(false); }
  }

  return <div className="settings-fields">
    {error && <p role="alert" className="status-error">{error}</p>}
    {runtime === null && !error && <p role="status">正在准备 X 的 Python 运行环境…</p>}
    {!runtime?.ready && (runtime || error) && <div className="settings-actions">
      <p role="status">{runtime?.message}</p><Button type="button" variant="outline" onClick={() => { void load(); }}>重试</Button>
    </div>}
    {runtime?.ready && <>
      <ul className="account-list">
        {accounts.map(account => <li key={account.username}>
          <span>@{account.username} <small>{stateLabel[account.state]}</small></span>
          <Button disabled={busy} variant="ghost" onClick={() => { void remove(account.username); }}>移除</Button>
        </li>)}
      </ul>
      <form className="settings-form" onSubmit={event => { void save(event); }}>
        <fieldset disabled={busy} className="settings-fields">
          <SettingsField label="登录方式">
            <select value={mode} onChange={event => setMode(event.target.value as LoginDetails['mode'])}>
              <option value="cookie">浏览器 Cookie</option><option value="password">账号密码</option>
            </select>
          </SettingsField>
          <SettingsField label="X 用户名"><Input name="username" placeholder="@用户名" required autoComplete="off" /></SettingsField>
          {mode === 'cookie' ? <SettingsField label="Cookie" hint="包含 auth_token 与 ct0，可粘贴请求头或 JSON。">
            <Input name="cookie" type="password" required autoComplete="new-password" />
          </SettingsField> : <>
            <SettingsField label="X 密码"><Input name="password" type="password" required autoComplete="new-password" /></SettingsField>
            <SettingsField label="邮箱"><Input name="email" type="email" required autoComplete="off" /></SettingsField>
            <SettingsField label="邮箱应用密码（按需）"><Input name="emailPassword" type="password" autoComplete="new-password" /></SettingsField>
            <SettingsField label="两步验证密钥（按需）"><Input name="totpSecret" type="password" autoComplete="new-password" /></SettingsField>
          </>}
        </fieldset>
        <Button type="submit" className="self-start" disabled={busy}>{busy ? '处理中…' : '保存登录账号'}</Button>
      </form>
    </>}
  </div>;
}
