import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Check, FlaskConical, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import {
  MODEL_PROTOCOLS, type ConfiguredModel, type ModelConfig, type ModelInput, type ModelProtocol,
  type ModelTestResponse, type ModelTestResult,
} from '@creator-studio/contracts';
import { Button } from '@creator-studio/ui/button';
import { Input } from '@creator-studio/ui/input';
import { api, json, messageOf } from '@/api';
import { useToast } from '@/ui/Toast';
import { SettingsField } from './SettingsField';

const protocols = {
  'openai-completions': {
    label: 'OpenAI Chat Completions',
    placeholder: 'https://api.openai.com/v1',
    path: '/chat/completions',
  },
  'anthropic-messages': {
    label: 'Anthropic Messages',
    placeholder: 'https://api.anthropic.com',
    path: '/v1/messages',
  },
} satisfies Record<ModelProtocol, { label: string; placeholder: string; path: string }>;

type Draft = Omit<ModelInput, 'apiKey' | 'contextWindow'> & {
  apiKey: string;
  contextWindow: string;
  clearKey: boolean;
};

type Modal = { action: 'edit'; model: ConfiguredModel | null } | { action: 'delete'; model: ConfiguredModel };

const modelPath = (id: string) => `/api/models/${encodeURIComponent(id)}`;

function editable(model: ConfiguredModel | null): Draft {
  return {
    protocol: model?.protocol ?? 'openai-completions',
    baseUrl: model?.baseUrl ?? '',
    model: model?.model ?? '',
    apiKey: '',
    proxyUrl: model?.proxyUrl ?? '',
    contextWindow: model?.contextWindow?.toString() ?? '',
    supportsImages: model?.supportsImages ?? false,
    clearKey: false,
  };
}

function ModelDialog({ title, busy, onDismiss, children }: {
  title: string;
  busy: boolean;
  onDismiss: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // 使用模态对话框处理焦点限制、Esc 和关闭后的焦点恢复。
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const close = () => dialog.current?.close();

  return <dialog ref={dialog} className="model-dialog" aria-labelledby={titleId} onClose={onDismiss}
    onCancel={event => { if (busy) event.preventDefault(); }}>
    <header className="model-dialog-header">
      <h2 id={titleId}>{title}</h2>
      <Button variant="ghost" size="icon" type="button" title="关闭" aria-label="关闭" disabled={busy} onClick={close}>
        <X aria-hidden="true" />
      </Button>
    </header>
    {children(close)}
  </dialog>;
}

function ModelEditor({ model, onConfig, onDismiss }: {
  model: ConfiguredModel | null;
  onConfig: (config: ModelConfig) => void;
  onDismiss: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState(() => editable(model));
  const [pending, setPending] = useState<'save' | 'test' | null>(null);
  const [checks, setChecks] = useState<ModelTestResult | null>(null);
  const [error, setError] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(model?.proxyUrl));
  const busy = pending !== null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(editable(model));
  const protocol = protocols[draft.protocol];

  function edit(patch: Partial<Draft>) {
    setDraft(previous => ({ ...previous, ...patch }));
    setError('');
  }

  async function save(event: FormEvent<HTMLFormElement>, close: () => void) {
    event.preventDefault();
    setPending('save');
    setError('');
    const { apiKey, clearKey, contextWindow, ...fields } = draft;
    const input: ModelInput = {
      ...fields,
      apiKey: apiKey.trim() || (clearKey ? '' : undefined),
      contextWindow: contextWindow ? Number(contextWindow) : null,
    };
    try {
      const config = await api<ModelConfig>(model ? modelPath(model.id) : '/api/models', json(model ? 'PUT' : 'POST', input));
      onConfig(config);
      toast.success(model ? '模型已更新' : '模型已添加');
      close();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setPending(null);
    }
  }

  async function test(id: string) {
    setPending('test');
    setError('');
    setChecks(null);
    try {
      const { config, ...result } = await api<ModelTestResponse>(`${modelPath(id)}/test`, { method: 'POST' });
      onConfig(config);
      setChecks(result);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setPending(null);
    }
  }

  return <ModelDialog title={model ? '编辑模型' : '新增自定义模型'} busy={busy} onDismiss={onDismiss}>
    {close => <form onSubmit={event => { void save(event, close); }}>
      <fieldset className="model-dialog-fields settings-fields" disabled={busy}>
        <SettingsField label="接口协议">
          <select value={draft.protocol} onChange={event => edit({ protocol: event.target.value as ModelProtocol })}>
            {MODEL_PROTOCOLS.map(id => <option key={id} value={id}>{protocols[id].label}</option>)}
          </select>
        </SettingsField>
        <SettingsField label="API 地址" hint={`请求时会在 API 地址后追加 ${protocol.path}。`}>
          <Input type="url" value={draft.baseUrl} placeholder={protocol.placeholder} autoComplete="off" required
            onChange={event => edit({ baseUrl: event.target.value })} />
        </SettingsField>
        <div className="model-key-field">
          <SettingsField label="API Key">
            <Input type="password" value={draft.apiKey} autoComplete="new-password"
              placeholder={draft.clearKey ? '保存时将清除密钥' : model?.hasKey ? '留空保留已保存的密钥' : '无需认证可留空'}
              onChange={event => edit({ apiKey: event.target.value, clearKey: false })} />
          </SettingsField>
          {model?.hasKey && <Button variant="ghost" type="button" onClick={() => edit({ apiKey: '', clearKey: !draft.clearKey })}>
            {draft.clearKey ? '撤销清除' : '清除密钥'}
          </Button>}
        </div>
        <SettingsField label="模型 ID">
          <Input value={draft.model} placeholder="填写服务商提供的模型 ID" autoComplete="off" required
            onChange={event => edit({ model: event.target.value })} />
        </SettingsField>
        <SettingsField label="上下文窗口（Token）" hint="填写模型支持的上下文长度。留空时由服务商的上下文超限响应触发压缩。">
          <Input type="number" min={1} step={1} value={draft.contextWindow} placeholder="可选"
            onChange={event => edit({ contextWindow: event.target.value })} />
        </SettingsField>
        <label className="model-image-option">
          <input type="checkbox" checked={draft.supportsImages} onChange={event => edit({ supportsImages: event.target.checked })} />
          支持图片输入
        </label>
        <details className="model-advanced" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}>
          <summary>代理设置</summary>
          <SettingsField label="代理地址" hint="仅用于此模型。留空时直连。">
            <Input type="url" value={draft.proxyUrl} placeholder="http://127.0.0.1:7897" autoComplete="off"
              onChange={event => edit({ proxyUrl: event.target.value })} />
          </SettingsField>
        </details>
        {model && <div className="model-test-panel">
          <Button variant="outline" type="button" disabled={dirty || !model.baseUrl || !model.model}
            onClick={() => { void test(model.id); }}>
            <FlaskConical data-icon="inline-start" aria-hidden="true" />
            {pending === 'test' ? '测试中…' : '测试连接'}
          </Button>
          {dirty ? <p className="model-note">保存修改后可测试连接。</p>
            : <ul className="model-checks" role="status">
              <li className={checks?.agent.ok === false ? 'status-error' : undefined}>
                工具调用 · {checks?.agent.message ?? (model.agentVerified ? '已验证' : '待验证')}
              </li>
              <li className={checks?.summary.ok === false ? 'status-error' : undefined}>
                热点摘要 · {checks?.summary.message ?? (model.summaryVerified ? '已验证' : '待验证')}
              </li>
            </ul>}
        </div>}
        {error && <p className="model-note status-error" role="alert">{error}</p>}
      </fieldset>
      <footer className="model-dialog-footer">
        <Button type="button" variant="outline" onClick={close} disabled={busy}>取消</Button>
        <Button type="submit" disabled={busy || !dirty || !draft.baseUrl.trim() || !draft.model.trim()}>
          {pending === 'save' ? '保存中…' : '保存模型'}
        </Button>
      </footer>
    </form>}
  </ModelDialog>;
}

export function ModelSettings() {
  const toast = useToast();
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void api<ModelConfig>('/api/models/config', { signal: controller.signal }).then(setConfig).catch(failure => {
      if (!controller.signal.aborted) setError(messageOf(failure));
    });
    return () => controller.abort();
  }, [reload]);

  async function update(path: string, method: 'POST' | 'DELETE', message: string, close?: () => void) {
    setBusy(true);
    setError('');
    try {
      setConfig(await api<ModelConfig>(path, { method }));
      toast.success(message);
      close?.();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    setModal(null);
    setError('');
  }

  if (!config) return <div className="model-loading">
    <p role={error ? 'alert' : 'status'} className={error ? 'status-error' : undefined}>
      {error || '正在读取模型配置…'}
    </p>
    {error && <Button variant="outline" type="button" onClick={() => { setError(''); setReload(value => value + 1); }}>重试</Button>}
  </div>;

  return <section className="model-list-card" aria-labelledby="model-list-title">
    <header className="model-list-header">
      <h2 id="model-list-title">可用模型</h2>
      <Button type="button" disabled={busy} onClick={() => { setError(''); setModal({ action: 'edit', model: null }); }}>
        <Plus data-icon="inline-start" aria-hidden="true" /> 新增模型
      </Button>
    </header>

    {config.models.length ? <ul className="model-list">
      {config.models.map(model => {
        const active = model.id === config.activeModelId;
        const name = model.model || '未填写模型 ID';
        return <li key={model.id} className="model-row">
          <div className="model-row-summary">
            <div className="model-row-title">
              <h3 className="truncate" title={name}>{name}</h3>
              {active && <span className="model-active"><Check size={12} aria-hidden="true" /> 使用中</span>}
            </div>
            <p className="model-note truncate" title={model.baseUrl}>
              {protocols[model.protocol].label}{model.baseUrl && ` · ${model.baseUrl}`}
            </p>
          </div>
          <div className="model-row-actions">
            {!active && <Button variant="ghost" size="icon" type="button" title="启用模型"
              disabled={busy || !model.baseUrl || !model.model} aria-label={`启用 ${name}`}
              onClick={() => { void update(`${modelPath(model.id)}/activate`, 'POST', '已切换当前模型'); }}>
              <Play aria-hidden="true" />
            </Button>}
            <Button variant="ghost" size="icon" type="button" title="编辑模型" disabled={busy} aria-label={`编辑 ${name}`}
              onClick={() => { setError(''); setModal({ action: 'edit', model }); }}>
              <Pencil aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" type="button" title="删除模型" disabled={busy} aria-label={`删除 ${name}`}
              onClick={() => { setError(''); setModal({ action: 'delete', model }); }}>
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        </li>;
      })}
    </ul> : <p className="model-empty model-note">还没有模型。添加模型后即可开始对话。</p>}

    {error && !modal && <p className="model-list-error status-error" role="alert">{error}</p>}

    {modal?.action === 'edit' && <ModelEditor model={modal.model} onConfig={setConfig} onDismiss={dismiss} />}
    {modal?.action === 'delete' && <ModelDialog title="删除模型" busy={busy} onDismiss={dismiss}>
      {close => <>
        <div className="model-dialog-fields">
          <p>确定删除 <strong>{modal.model.model || '这条配置'}</strong>？</p>
          {modal.model.id === config.activeModelId && <p className="model-note">
            {config.models.some(model => model.id !== modal.model.id && model.baseUrl && model.model)
              ? '删除后将自动启用剩余列表中的第一个可用模型。'
              : '删除后需要添加或启用其他模型才能继续使用对话和热点摘要。'}
          </p>}
          {error && <p className="model-note status-error" role="alert">{error}</p>}
        </div>
        <footer className="model-dialog-footer">
          <Button type="button" variant="outline" disabled={busy} onClick={close}>取消</Button>
          <Button type="button" variant="destructive" disabled={busy}
            onClick={() => { void update(modelPath(modal.model.id), 'DELETE', '模型已删除', close); }}>
            {busy ? '删除中…' : '删除模型'}
          </Button>
        </footer>
      </>}
    </ModelDialog>}
  </section>;
}
