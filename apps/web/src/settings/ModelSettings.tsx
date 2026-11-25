import { useEffect, useState } from 'react';
import { FlaskConical, Save } from 'lucide-react';
import { MODEL_PROFILE_IDS, type ModelConfig, type ModelConfigInput, type ModelProfileId, type ModelProfileInput, type ModelTestResult } from '@creator-studio/contracts';
import { Button } from '@creator-studio/ui/button';
import { Input } from '@creator-studio/ui/input';
import { api, json, messageOf } from '@/api';
import { SettingsField } from './SettingsField';

const names = { local: '本地模型', remote: '远程 API' };

function editable(config: ModelConfig): ModelConfigInput {
  const profile = ({ baseUrl, model }: ModelProfileInput) => ({ baseUrl, model });
  return {
    activeProfile: config.activeProfile, proxyUrl: config.proxyUrl,
    profiles: { local: profile(config.profiles.local), remote: profile(config.profiles.remote) },
  };
}

export function ModelSettings({ config, onSave }: { config: ModelConfig | null; onSave: (value: ModelConfig) => void }) {
  const [edits, setEdits] = useState<ModelConfigInput | null>(null);
  const [busy, setBusy] = useState<'save' | ModelProfileId | null>(null);
  const [checks, setChecks] = useState<Partial<Record<ModelProfileId, ModelTestResult>>>({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) return;
    void api<ModelConfig>('/api/models/config').then(onSave).catch(error => setError(messageOf(error)));
  }, [config, onSave]);

  if (!config) return <p role={error ? 'alert' : 'status'}>{error || '正在读取模型配置…'}</p>;
  const initial = editable(config);
  const draft = edits ?? initial;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  function edit(value: ModelConfigInput) {
    setEdits(value);
    setChecks({});
    setSaved(false);
    setError('');
  }

  function editProfile(id: ModelProfileId, profile: ModelProfileInput) {
    edit({ ...draft, profiles: { ...draft.profiles, [id]: profile } });
  }

  async function save() {
    setBusy('save');
    setError('');
    try {
      onSave(await api<ModelConfig>('/api/models/config', json('PUT', draft)));
      setEdits(null);
      setSaved(true);
    } catch (error) { setError(messageOf(error)); }
    finally { setBusy(null); }
  }

  async function test(id: ModelProfileId) {
    setBusy(id);
    setError('');
    try {
      const result = await api<ModelTestResult>('/api/models/test', json('POST', { profileId: id }));
      setChecks(previous => ({ ...previous, [id]: result }));
      onSave(await api<ModelConfig>('/api/models/config'));
    } catch (error) { setError(messageOf(error)); }
    finally { setBusy(null); }
  }

  return <form className="settings-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <fieldset disabled={Boolean(busy)} className="settings-fields">
      <SettingsField label="当前使用">
        <select value={draft.activeProfile} onChange={event => edit({ ...draft, activeProfile: event.target.value as ModelProfileId })}>
          {MODEL_PROFILE_IDS.map(id => <option value={id} key={id}>{names[id]}</option>)}
        </select>
      </SettingsField>
      <div className="model-profiles">
        {MODEL_PROFILE_IDS.map(id => {
          const profile = draft.profiles[id];
          const original = config.profiles[id];
          const result = checks[id];
          const { baseUrl, model } = profile;
          return <fieldset className="model-profile" key={id}>
            <legend>{names[id]}</legend>
            <SettingsField label="API 根地址">
              <Input value={baseUrl} autoComplete="off" placeholder={id === 'local' ? 'http://127.0.0.1:11434/v1' : 'https://api.example.com/v1'}
                onChange={event => editProfile(id, { ...profile, baseUrl: event.target.value })} />
            </SettingsField>
            <SettingsField label="模型 ID">
              <Input value={model} autoComplete="off" onChange={event => editProfile(id, { ...profile, model: event.target.value })} />
            </SettingsField>
            <SettingsField label="API Key">
              <Input type="password" autoComplete="new-password" value={profile.apiKey ?? ''}
                placeholder={profile.apiKey === '' ? '保存后清除密钥' : original.hasKey ? '留空保留已保存的密钥' : '服务无需认证时可留空'}
                onChange={event => editProfile(id, event.target.value ? { baseUrl, model, apiKey: event.target.value } : { baseUrl, model })} />
            </SettingsField>
            <div className="settings-actions">
              <Button type="button" variant="outline" disabled={dirty || !baseUrl.trim() || !model.trim()} title={dirty ? '请先保存设置' : undefined}
                onClick={() => { void test(id); }}><FlaskConical data-icon="inline-start" />{busy === id ? '测试中…' : '测试连接'}</Button>
              {original.hasKey && <Button type="button" variant="ghost" onClick={() => editProfile(id, { baseUrl, model, apiKey: '' })}>清除密钥</Button>}
            </div>
            <ul className="check-list">
              <li className={result?.agent.ok === false ? 'status-error' : undefined}>工具调用 · {result?.agent.message ?? (original.agentVerified ? '已验证' : '待验证')}</li>
              <li className={result?.summary.ok === false ? 'status-error' : undefined}>热点摘要 · {result?.summary.message ?? (original.summaryVerified ? '已验证' : '待验证')}</li>
            </ul>
          </fieldset>;
        })}
      </div>
      <SettingsField label="远程模型代理" hint="远程对话和摘要通过此代理访问模型。留空时直连。">
        <Input value={draft.proxyUrl} placeholder="http://127.0.0.1:7897" autoComplete="off"
          onChange={event => edit({ ...draft, proxyUrl: event.target.value })} />
      </SettingsField>
    </fieldset>
    <div className="settings-actions settings-footer">
      <span role={error ? 'alert' : 'status'} className={error ? 'status-error' : undefined}>{error || (saved ? '配置已保存' : '')}</span>
      <Button type="submit" disabled={!dirty || Boolean(busy)}><Save data-icon="inline-start" />{busy === 'save' ? '保存中…' : '保存配置'}</Button>
    </div>
  </form>;
}
