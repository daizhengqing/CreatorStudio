import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@creator-studio/ui/button';
import { Input } from '@creator-studio/ui/input';
import type { SourceStatus, TrendsConfig } from '../contracts';
import { SourceSettings } from './SourceSettings';
import { useTrendsApi } from './shared';

export function SettingsPanel({ sources, onClose, onOpenModels }: { sources: SourceStatus[]; onClose: () => void; onOpenModels: () => void }) {
  const api = useTrendsApi();
  const client = useQueryClient();
  const [edits, setEdits] = useState<TrendsConfig | null>(null);
  const config = useQuery({ queryKey: ['trends', 'config'], queryFn: () => api.call('getConfig', null) });
  const draft = edits ?? config.data;
  const save = useMutation({
    mutationFn: (input: TrendsConfig) => api.call('saveConfig', input),
    onSuccess: value => {
      client.setQueryData(['trends', 'config'], value);
      setEdits(null);
      void client.invalidateQueries({ queryKey: ['trends'] });
    },
  });
  const dirty = draft && config.data && (draft.autoGenerate !== config.data.autoGenerate || draft.proxyUrl !== config.data.proxyUrl);
  function update(value: TrendsConfig) { setEdits(value); save.reset(); }
  return <div className="trend-settings-panel">
    <header className="trend-settings-header">
      <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft size={14} />返回看板</Button><strong>热点追踪设置</strong><span className="trend-spacer" />
      {dirty && <span className="trend-hint">有未保存的设置</span>}
      <Button size="sm" disabled={!dirty || save.isPending} onClick={() => { if (draft) save.mutate(draft); }}><Save size={13} />{save.isPending ? '保存中…' : '保存设置'}</Button>
    </header>
    <div className="trend-settings-scroll">
      {(config.error || save.error) && <p className="trend-error" role="alert">{(config.error ?? save.error)?.message}</p>}
      {save.isSuccess && <p className="trend-ready" role="status">设置已保存</p>}
      {!draft ? <div className="trend-empty">{config.isError ? '无法读取设置' : '正在读取设置…'}</div> : <fieldset className="trend-settings-fields" disabled={save.isPending}>
        <section className="trend-settings-section">
          <h3>中文翻译与摘要</h3>
          <div className="trend-translation-options">
            <label className="trend-checkbox"><input type="checkbox" checked={draft.autoGenerate} onChange={event => update({ ...draft, autoGenerate: event.target.checked })} />自动翻译与摘要</label>
            <Button variant="outline" size="sm" onClick={onOpenModels}>打开大模型配置</Button>
          </div>
          <p className="trend-hint">有正文或快讯时生成摘要。只有标题时仅翻译。</p>
        </section>
        <section className="trend-settings-section">
          <h3>采集代理</h3>
          <label>HTTP 代理地址<Input value={draft.proxyUrl} placeholder="http://127.0.0.1:7897（留空直连）" autoComplete="off" onChange={event => update({ ...draft, proxyUrl: event.target.value })} /></label>
          <p className="trend-hint">用于资讯采集。回环地址始终直连。</p>
        </section>
      </fieldset>}
      <SourceSettings sources={sources} />
      <p className="trend-hint trend-settings-footnote">资讯保留 30 天，选题池永久保留。仅在工作台后端运行期间自动采集。</p>
    </div>
  </div>;
}
