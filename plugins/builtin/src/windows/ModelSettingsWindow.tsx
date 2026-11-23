import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FlaskConical, Save } from 'lucide-react';
import { MODEL_CONFIG_CHANGED, MODEL_PROFILE_IDS, type ModelConfig, type ModelConfigInput, type ModelProfileId, type ModelProfileInput } from '@creator-studio/plugin-sdk';
import { Button } from '@creator-studio/ui/button';
import { Input } from '@creator-studio/ui/input';
import { cn } from '@creator-studio/ui/utils';
import { usePlugin } from '../context';

const configKey = ['models', 'config'];
const profileNames: Record<ModelProfileId, string> = { local: '本地模型', remote: '远程 API' };

function editableConfig({ activeProfile, proxyUrl, profiles }: ModelConfig): ModelConfigInput {
  const { local, remote } = profiles;
  return { activeProfile, proxyUrl, profiles: {
    local: { baseUrl: local.baseUrl, model: local.model },
    remote: { baseUrl: remote.baseUrl, model: remote.model },
  } };
}

export function ModelSettingsWindow() {
  const { sdk } = usePlugin();
  const client = useQueryClient();
  const [edits, setEdits] = useState<ModelConfigInput | null>(null);
  const config = useQuery({ queryKey: configKey, queryFn: sdk.models.getConfig });
  const save = useMutation({
    mutationFn: (input: ModelConfigInput) => sdk.models.saveConfig(input),
    onSuccess: saved => { client.setQueryData(configKey, saved); setEdits(null); },
  });
  const test = useMutation({
    mutationFn: (id: ModelProfileId) => sdk.models.testConnection(id),
    onSuccess: () => client.invalidateQueries({ queryKey: configKey }),
  });
  useEffect(() => {
    const invalidate = () => { void client.invalidateQueries({ queryKey: configKey }); };
    const changed = sdk.events.subscribe(MODEL_CONFIG_CHANGED, invalidate);
    const reconnected = sdk.events.subscribe('studio.connection.open', invalidate);
    return () => { changed(); reconnected(); };
  }, [client, sdk]);

  if (!config.data) return <div className="model-settings-empty">
    {config.error ? <><p role="alert">{config.error.message}</p><Button type="button" variant="outline" onClick={() => { void config.refetch(); }}>重新读取</Button></> : '正在读取模型配置…'}
  </div>;

  const saved = config.data;
  const initial = editableConfig(saved);
  const draft = edits ?? initial;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const busy = save.isPending || test.isPending;
  function update(input: ModelConfigInput) { setEdits(input); save.reset(); test.reset(); }
  function updateProfile(id: ModelProfileId, input: ModelProfileInput) {
    update({ ...draft, profiles: { ...draft.profiles, [id]: input } });
  }

  return <form className="model-settings" onSubmit={event => { event.preventDefault(); if (dirty && !busy) save.mutate(draft); }}>
    <fieldset className="model-settings-scroll" disabled={busy}>
      <div className="model-settings-active">
        <label htmlFor="model-active-profile">当前使用</label>
        <select id="model-active-profile" value={draft.activeProfile} onChange={event => update({ ...draft, activeProfile: event.target.value as ModelProfileId })}>
          {MODEL_PROFILE_IDS.map(id => <option key={id} value={id}>{profileNames[id]}</option>)}
        </select>
        <p className="model-settings-hint">工作台共用此选择。接口需支持 Chat Completions 和 JSON 输出。</p>
      </div>
      <div className="model-settings-profiles">
        {MODEL_PROFILE_IDS.map(id => {
          const profile = draft.profiles[id];
          const stored = saved.profiles[id];
          const { baseUrl, model } = profile;
          const keyId = `model-${id}-key`;
          const configured = Boolean(baseUrl.trim() && model.trim());
          const modified = baseUrl !== stored.baseUrl || model !== stored.model || profile.apiKey !== undefined || (id === 'remote' && draft.proxyUrl !== saved.proxyUrl);
          const verified = stored.verified && !modified;
          const result = test.variables === id ? test.data : undefined;
          const error = test.variables === id ? test.error : null;
          return <fieldset className="model-settings-profile" key={id}>
            <legend>{profileNames[id]}</legend>
            <span className="model-settings-state">
              {verified ? <><CheckCircle2 size={12} />已验证</> : configured ? '待验证' : '待配置'}
            </span>
            <label className="model-settings-field">API 根地址
              <Input value={baseUrl} autoComplete="off" placeholder={id === 'local' ? 'http://127.0.0.1:11434/v1' : 'https://api.example.com/v1'}
                onChange={event => updateProfile(id, { ...profile, baseUrl: event.target.value })} />
            </label>
            <label className="model-settings-field">模型名称
              <Input value={model} autoComplete="off" placeholder="接口支持的模型 ID" onChange={event => updateProfile(id, { ...profile, model: event.target.value })} />
            </label>
            <div className="model-settings-field">
              <label htmlFor={keyId}>API Key</label>
              <div className="model-settings-key">
                <Input id={keyId} type="password" autoComplete="new-password" value={profile.apiKey ?? ''}
                  placeholder={profile.apiKey === '' ? '保存后清除密钥' : stored.hasKey ? '留空保留已保存的密钥' : '服务无需认证时可留空'}
                  onChange={event => {
                    // 留空保留已保存的密钥。点清除才会提交空字符串。
                    const apiKey = event.target.value;
                    updateProfile(id, apiKey ? { baseUrl, model, apiKey } : { baseUrl, model });
                  }} />
                <Button type="button" variant="outline" size="sm" disabled={profile.apiKey === '' || (!stored.hasKey && !profile.apiKey)}
                  onClick={() => updateProfile(id, stored.hasKey ? { baseUrl, model, apiKey: '' } : { baseUrl, model })}>清除</Button>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={dirty || busy || !configured}
              title={dirty ? '请先保存设置' : undefined} onClick={() => test.mutate(id)}>
              <FlaskConical data-icon="inline-start" />{test.isPending && test.variables === id ? '测试中…' : '测试连接'}
            </Button>
            {(result || error) && <p className={cn('model-settings-feedback', { 'model-settings-error': !result?.ok })} role={result?.ok ? 'status' : 'alert'}>{result?.message ?? error?.message}</p>}
          </fieldset>;
        })}
      </div>
      <label className="model-settings-field">远程模型代理
        <Input value={draft.proxyUrl} placeholder="http://127.0.0.1:7897（留空直连）" autoComplete="off"
          onChange={event => update({ ...draft, proxyUrl: event.target.value })} />
      </label>
    </fieldset>
    <footer className="model-settings-footer">
      <span className={cn('model-settings-feedback', { 'model-settings-error': save.isError })} role={save.isError ? 'alert' : 'status'}>
        {save.error?.message ?? (save.isSuccess ? '配置已保存' : dirty ? '有未保存的修改' : '')}
      </span>
      <Button type="submit" disabled={!dirty || busy}><Save data-icon="inline-start" />{save.isPending ? '保存中…' : '保存配置'}</Button>
    </footer>
  </form>;
}
