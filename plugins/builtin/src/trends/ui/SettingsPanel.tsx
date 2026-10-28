import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@creator-studio/ui/button';
import { Input } from '@creator-studio/ui/input';
import type { ConfigInput, SourceStatus, TrendsConfig } from '../contracts';
import { ModelSettings } from './ModelSettings';
import { SourceSettings } from './SourceSettings';
import { useTrendsApi } from './shared';

function editableConfig(config: TrendsConfig): ConfigInput {
  return {
    activeProfile: config.activeProfile, autoGenerate: config.autoGenerate, proxyUrl: config.proxyUrl,
    profiles: {
      local: { baseUrl: config.profiles.local.baseUrl, model: config.profiles.local.model },
      remote: { baseUrl: config.profiles.remote.baseUrl, model: config.profiles.remote.model },
    },
  };
}

export function SettingsPanel({ sources, onClose }: { sources: SourceStatus[]; onClose: () => void }) {
  const api = useTrendsApi();
  const client = useQueryClient();
  const [draft, setDraft] = useState<ConfigInput | null>(null);
  const [message, setMessage] = useState('');
  const config = useQuery({ queryKey: ['trends', 'config'], queryFn: () => api.call('getConfig', null) });
  // SSE 刷新配置时保留正在编辑的内容，密钥仅存在当前表单内存中。
  useEffect(() => { if (config.data && draft === null) setDraft(editableConfig(config.data)); }, [config.data, draft]);
  const save = useMutation({
    mutationFn: (input: ConfigInput) => api.call('saveConfig', input),
    onSuccess: value => {
      client.setQueryData(['trends', 'config'], value);
      setDraft(editableConfig(value)); setMessage('设置已保存；模型配置变更后请测试连接。');
      void client.invalidateQueries({ queryKey: ['trends'] });
    },
  });
  const dirty = draft !== null && config.data !== undefined && JSON.stringify(draft) !== JSON.stringify(editableConfig(config.data));
  function update(value: ConfigInput) { setDraft(value); setMessage(''); }
  return <div className="trend-settings-panel">
    <header className="trend-settings-header">
      <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft size={14} />返回看板</Button><strong>热点追踪设置</strong><span className="trend-spacer" />
      {dirty && <span className="trend-hint">有未保存的设置</span>}
      <Button size="sm" disabled={!dirty || save.isPending} onClick={() => { if (draft) save.mutate(draft); }}><Save size={13} />{save.isPending ? '保存中…' : '保存设置'}</Button>
    </header>
    <div className="trend-settings-scroll">
      {(config.error || save.error) && <p className="trend-error" role="alert">{(config.error ?? save.error)?.message}</p>}
      {message && <p className="trend-ready" role="status">{message}</p>}
      {!draft || !config.data ? <div className="trend-empty">{config.isError ? '无法读取设置' : '正在读取设置…'}</div> : <fieldset className="trend-settings-fields" disabled={save.isPending}>
        <ModelSettings draft={draft} saved={config.data} dirty={dirty} onChange={update} />
        <section className="trend-settings-section">
          <h3>网络代理</h3>
          <label>HTTP 代理地址<Input value={draft.proxyUrl} placeholder="http://127.0.0.1:7897（留空直连）" autoComplete="off" onChange={event => update({ ...draft, proxyUrl: event.target.value })} /></label>
          <p className="trend-hint">用于资讯采集和远程模型。localhost、127.0.0.1 和 ::1 始终直连，本地模型不经过代理。</p>
        </section>
      </fieldset>}
      <SourceSettings sources={sources} />
      <p className="trend-hint trend-settings-footnote">资讯保留 30 天，选题池永久保留。仅在工作台后端运行期间自动采集。</p>
    </div>
  </div>;
}
