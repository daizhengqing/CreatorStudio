import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { Button } from '@creator-studio/ui/button';
import { Input } from '@creator-studio/ui/input';
import type { LoginAccount, LoginDetails } from '../contracts';
import { dateTime, queryRoot, useMonitorApi } from './shared';

const accountStates: Record<LoginAccount['state'], string> = {
  configured: '会话已保存', ready: '会话可用', rate_limited: '请求受限', needs_auth: '需要重新登录',
};

export function AccountsPanel({ ready }: { ready: boolean }) {
  const api = useMonitorApi();
  const query = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<LoginDetails['mode']>('cookie');
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const accounts = useQuery({
    queryKey: [queryRoot, 'accounts'], queryFn: () => api.call('listLoginAccounts', null),
    enabled: ready, refetchInterval: 30_000,
  });
  const remove = useMutation({
    mutationFn: (key: string) => api.call('removeLoginAccount', { username: key }),
    onSuccess: () => query.invalidateQueries({ queryKey: [queryRoot, 'accounts'] }),
  });

  function edit(key: string, nextMode: LoginDetails['mode']) {
    formRef.current?.reset();
    setUsername(key);
    setMode(nextMode);
    setError('');
    formRef.current?.scrollIntoView({ block: 'nearest' });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const field = (name: string) => String(values.get(name) ?? '');
    const input: LoginDetails = mode === 'cookie' ? { mode, username, cookie: field('cookie') } : {
      mode, username, email: field('email'), password: field('password'),
      emailPassword: field('emailPassword') || undefined, totpSecret: field('totpSecret').trim() || undefined,
    };
    setSaving(true);
    setError('');
    // 登录表单直接提交，密码和 Cookie 不进入查询缓存。
    try {
      await api.call('saveLoginAccount', input);
      form.reset();
      setUsername('');
      await query.invalidateQueries({ queryKey: [queryRoot, 'accounts'] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存登录会话失败。');
    } finally {
      setSaving(false);
    }
  }

  return <div className="xm-scroll">
    <div className="xm-panel">
      <section className="xm-form-section" aria-label="添加或更新登录账号">
        <h2>添加或更新登录账号</h2>
        <form ref={formRef} onSubmit={event => void save(event)} autoComplete="off">
          <div className="xm-form-fields">
            <label className="xm-field">X 用户名<Input required value={username} placeholder="@用户名" autoCapitalize="off"
              onChange={event => setUsername(event.target.value)} disabled={saving} /></label>
            <label className="xm-field">登录方式<select value={mode} disabled={saving} onChange={event => { setMode(event.target.value as typeof mode); setError(''); }}>
              <option value="cookie">Cookie</option><option value="password">账号密码</option>
            </select></label>
            {mode === 'cookie' ? <label className="xm-field xm-field-wide">Cookie
              <Input key="cookie" required name="cookie" type="password" disabled={saving} placeholder="粘贴含 auth_token 和 ct0 的 Cookie 头或 JSON" />
            </label> : <>
              <label className="xm-field">X 密码<Input key="password" name="password" type="password" required disabled={saving} /></label>
              <label className="xm-field">X 邮箱<Input name="email" type="email" required disabled={saving} /></label>
              <label className="xm-field">邮箱应用密码（选填）<Input name="emailPassword" type="password" disabled={saving} /></label>
              <label className="xm-field">TOTP 密钥（选填）<Input name="totpSecret" type="password" disabled={saving} /></label>
            </>}
          </div>
          <Button type="submit" disabled={!ready || saving}>{saving ? '正在保存会话…' : mode === 'cookie' ? '保存 Cookie' : '登录并保存会话'}</Button>
          {error && <p className="xm-error" role="alert">{error}</p>}
        </form>
      </section>
      <section className="xm-list-section" aria-label="登录账号列表">
        <h2>登录会话</h2>
        {(accounts.error || remove.error) && <p className="xm-error" role="alert">{accounts.error?.message ?? remove.error?.message}</p>}
        {ready && accounts.isPending && <p className="xm-empty">正在读取登录会话…</p>}
        {accounts.isSuccess && (accounts.data.length ? <ul className="xm-records">
          {accounts.data.map(account => <li className="xm-record xm-account" key={account.username}>
            <strong>@{account.username}</strong>
            <div className="xm-record-status">
              <strong data-state={account.state}>{accountStates[account.state]}</strong>
              {account.lastUsedAt !== null && <span>上次使用 {dateTime.format(account.lastUsedAt)}</span>}
            </div>
            <div className="xm-actions">
              <Button variant="outline" disabled={saving} onClick={() => edit(account.username, 'cookie')}>更新 Cookie</Button>
              <Button variant="ghost" disabled={saving} onClick={() => edit(account.username, 'password')}>重新登录</Button>
              <Button variant="ghost" disabled={saving || remove.isPending} onClick={() => remove.mutate(account.username)}>移除</Button>
            </div>
          </li>)}
        </ul> : <div className="xm-empty"><KeyRound size={24} aria-hidden /><span>暂无登录会话</span></div>)}
      </section>
    </div>
  </div>;
}
