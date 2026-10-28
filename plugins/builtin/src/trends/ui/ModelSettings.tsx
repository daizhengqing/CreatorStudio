import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FlaskConical } from 'lucide-react';
import { Button } from '@creator-studio/ui/button';
import { Input } from '@creator-studio/ui/input';
import type { ConfigInput, ProfileId, TrendsConfig } from '../contracts';
import { useTrendsApi } from './shared';

type Props = { draft: ConfigInput; saved: TrendsConfig; dirty: boolean; onChange: (draft: ConfigInput) => void };
const profileNames: Record<ProfileId, string> = { local: '本地模型', remote: '远程 API' };

export function ModelSettings({ draft, saved, dirty, onChange }: Props) {
  const api = useTrendsApi();
  const client = useQueryClient();
  const [result, setResult] = useState<{ profileId: ProfileId; ok: boolean; message: string } | null>(null);
  const test = useMutation({
    mutationFn: (profileId: ProfileId) => api.call('testModel', { profileId }),
    onSuccess: (value, profileId) => {
      setResult({ ...value, profileId });
      void client.invalidateQueries({ queryKey: ['trends'] });
    },
    onError: (error, profileId) => setResult({ profileId, ok: false, message: error.message }),
  });
  function setProfile(id: ProfileId, patch: Partial<ConfigInput['profiles'][ProfileId]>) {
    onChange({ ...draft, profiles: { ...draft.profiles, [id]: { ...draft.profiles[id], ...patch } } });
    setResult(null);
  }
  function setKey(id: ProfileId, value: string) {
    // 留空表示保留已有密钥，只有“清除”操作会提交空字符串。
    const { baseUrl, model } = draft.profiles[id];
    const profile = { baseUrl, model };
    onChange({ ...draft, profiles: { ...draft.profiles, [id]: value ? { ...profile, apiKey: value } : profile } });
    setResult(null);
  }

  return <section className="trend-settings-section">
    <h3>中文翻译与摘要</h3>
    <p className="trend-hint">使用支持 Chat Completions 和 JSON mode 的接口。有正文或快讯内容才生成摘要；只有标题时仅翻译。</p>
    <div className="trend-model-options">
      <label>当前使用<select value={draft.activeProfile} onChange={event => onChange({ ...draft, activeProfile: event.target.value as ProfileId })}>
        <option value="local">本地模型</option><option value="remote">远程 API</option>
      </select></label>
      <label className="trend-checkbox"><input type="checkbox" checked={draft.autoGenerate} onChange={event => onChange({ ...draft, autoGenerate: event.target.checked })} />自动翻译与摘要</label>
    </div>
    <div className="trend-model-profiles">
      {(['local', 'remote'] as const).map(id => {
        const profile = draft.profiles[id];
        const stored = saved.profiles[id];
        const cleared = profile.apiKey === '';
        return <div className="trend-model-profile" key={id}>
          <div className="trend-model-heading"><strong>{profileNames[id]}</strong>
            <span className={stored.verified && !dirty ? 'trend-ready' : 'trend-hint'}>{stored.verified && !dirty ? <><CheckCircle2 size={12} />已验证</> : '保存后测试'}</span>
          </div>
          <label>API 根地址<Input value={profile.baseUrl} autoComplete="off" placeholder={id === 'local' ? 'http://127.0.0.1:1234/v1' : 'https://api.example.com/v1'}
            onChange={event => setProfile(id, { baseUrl: event.target.value })} /></label>
          <label>模型名称<Input value={profile.model} autoComplete="off" placeholder="接口支持的模型 ID" onChange={event => setProfile(id, { model: event.target.value })} /></label>
          <label>API Key<span className="trend-key-control"><Input type="password" autoComplete="new-password" value={profile.apiKey ?? ''}
            placeholder={cleared ? '保存后清除密钥' : stored.hasKey ? '已保存；留空保留原密钥' : '可选；无认证的本地服务可留空'} onChange={event => setKey(id, event.target.value)} />
            <Button variant="outline" size="sm" type="button" disabled={cleared || (!stored.hasKey && !profile.apiKey)} onClick={() => setProfile(id, { apiKey: '' })}>清除</Button></span></label>
          <Button type="button" variant="outline" size="sm" disabled={dirty || test.isPending || !profile.baseUrl.trim() || !profile.model.trim()}
            title={dirty ? '请先保存设置，再测试已保存的配置' : undefined} onClick={() => { setResult(null); test.mutate(id); }}>
            <FlaskConical size={13} />{test.isPending && test.variables === id ? '测试中…' : '测试已保存配置'}
          </Button>
          {result?.profileId === id && <p className={result.ok ? 'trend-ready' : 'trend-error'} role="status">{result.message}</p>}
        </div>;
      })}
    </div>
    <p className="trend-hint">配置未验证或接口失败时仍会保留原始资讯。切换模型不会自动重新加工已完成的历史内容。</p>
  </section>;
}
