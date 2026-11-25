import { useEffect, useState } from 'react';
import type { Asset, ModelConfig, ModelConfigInput, ModelProfileId, RunAccepted, SessionSummary } from '@creator-studio/contracts';
import { api, json, messageOf } from './api';
import { useSession } from './agent/use-session';
import { useToast } from './ui/Toast';
import { IconMenu } from './layout/IconMenu';
import { SessionSidebar } from './layout/SessionSidebar';
import { ChatView } from './views/ChatView';
import { SettingsView } from './views/SettingsView';

const SELECTION_KEY = 'creator-studio.session';
const THEME_KEY = 'creator-studio.theme';
const SIDEBAR_COLLAPSE_KEY = 'creator-studio.sidebar-collapsed';

export function App() {
  const toast = useToast();
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === 'true';
  });

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [model, setModel] = useState<ModelConfig | null>(null);

  const [draft, setDraft] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [waitingRun, setWaitingRun] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { snapshot, offline } = useSession(selected);
  const summary = snapshot?.session;
  const busy = snapshot?.run?.status === 'running' || Boolean(waitingRun && waitingRun !== snapshot?.run?.id);
  const profile = model?.profiles[model.activeProfile];

  // 初始化主题样式类
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // 初始化会话列表与模型配置
  useEffect(() => {
    const controller = new AbortController();
    void api<SessionSummary[]>('/api/agent/sessions', { signal: controller.signal })
      .then(list => {
        setSessions(list);
        const last = localStorage.getItem(SELECTION_KEY);
        if (last && list.some(session => session.id === last)) {
          setSelected(last);
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) setError(messageOf(err));
      });

    void api<ModelConfig>('/api/models/config', { signal: controller.signal })
      .then(setModel)
      .catch(err => {
        if (!controller.signal.aborted) setError(messageOf(err));
      });

    return () => controller.abort();
  }, []);

  // 监听并同步当前会话更新
  useEffect(() => {
    if (summary) {
      setSessions(previous =>
        [summary, ...previous.filter(session => session.id !== summary.id)].sort(
          (a, b) => b.updatedAt - a.updatedAt,
        ),
      );
    }
  }, [summary]);

  // 运行完成后重置等待标志
  useEffect(() => {
    if (waitingRun === snapshot?.run?.id) setWaitingRun(null);
  }, [waitingRun, snapshot?.run?.id]);

  function selectSession(id: string | null) {
    setSelected(id);
    setWaitingRun(null);
    setError('');
    if (id) localStorage.setItem(SELECTION_KEY, id);
    else localStorage.removeItem(SELECTION_KEY);
  }

  function handleNewSession() {
    selectSession(null);
    setDraft('');
    setAssets([]);
    setView('chat');
  }

  function handleToggleTheme() {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }

  async function handleSend() {
    const body = { text: draft, assetIds: assets.map(asset => asset.id) };
    setError('');
    setSending(true);
    try {
      const path = selected ? `/api/agent/sessions/${selected}/messages` : '/api/agent/sessions';
      const result = await api<RunAccepted>(path, json('POST', body));
      selectSession(result.sessionId);
      setWaitingRun(result.runId);
      setDraft('');
      setAssets([]);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSending(false);
    }
  }

  async function handleAttach(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      for (const file of files.slice(0, 20 - assets.length)) {
        const form = new FormData();
        form.append('file', file);
        const asset = await api<Asset>('/api/assets/upload', { method: 'POST', body: form });
        setAssets(list => [...list, asset]);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleStop() {
    if (!selected) return;
    setStopping(true);
    try {
      await api(`/api/agent/sessions/${selected}/abort`, { method: 'POST' });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setStopping(false);
    }
  }

  async function handleSwitchProfile(profileId: ModelProfileId) {
    if (!model || model.activeProfile === profileId) return;
    try {
      const input: ModelConfigInput = {
        activeProfile: profileId,
        proxyUrl: model.proxyUrl,
        profiles: {
          local: { baseUrl: model.profiles.local.baseUrl, model: model.profiles.local.model },
          remote: { baseUrl: model.profiles.remote.baseUrl, model: model.profiles.remote.model },
        },
      };
      const updated = await api<ModelConfig>('/api/models/config', json('PUT', input));
      setModel(updated);
      toast.success(`已切换为${profileId === 'local' ? '本地模型' : '远程 API'}`);
    } catch (err) {
      const msg = messageOf(err);
      setError(msg);
      toast.error(msg);
    }
  }

  function handleReplay(text: string, replayAssets: Asset[]) {
    setDraft(text);
    setAssets(replayAssets);
    toast.info('已回填历史输入');
  }

  function toggleSidebar() {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(next));
      return next;
    });
  }

  async function handleDeleteSession(id: string) {
    try {
      await api(`/api/agent/sessions/${id}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== id));
      if (selected === id) {
        const remaining = sessions.filter(s => s.id !== id);
        selectSession(remaining[0]?.id ?? null);
      }
      toast.info('会话已删除');
    } catch (err) {
      const msg = messageOf(err);
      setError(msg);
      toast.error(msg);
    }
  }

  async function handleRenameSession(id: string, newTitle: string) {
    try {
      const updated = await api<SessionSummary>(`/api/agent/sessions/${id}`, json('PATCH', { title: newTitle }));
      setSessions(prev =>
        prev.map(s => (s.id === id ? { ...s, title: updated.title, updatedAt: updated.updatedAt } : s)),
      );
      toast.success('会话已重命名');
    } catch (err) {
      const msg = messageOf(err);
      setError(msg);
      toast.error(msg);
    }
  }

  return (
    <div className="app-shell">
      {/* 最左侧固定图标导航栏 */}
      <IconMenu
        currentView={view}
        onSelectView={setView}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {/* 主界面内容：会话视图 或 独立设置页视图 */}
      {view === 'chat' ? (
        <div className="chat-layout">
          <SessionSidebar
            sessions={sessions}
            selectedId={selected}
            onSelectSession={selectSession}
            onNewSession={handleNewSession}
            onRenameSession={(id, title) => { void handleRenameSession(id, title); }}
            onDeleteSession={id => { void handleDeleteSession(id); }}
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebar}
            disabled={sending || uploading}
          />

          <ChatView
            selectedSession={summary ?? (selected ? sessions.find(s => s.id === selected) ?? null : null)}
            entries={snapshot?.entries ?? []}
            run={snapshot?.run ?? null}
            offline={offline}
            busy={busy}
            sending={sending}
            uploading={uploading}
            stopping={stopping}
            error={error}
            draft={draft}
            assets={assets}
            onDraft={setDraft}
            onAttach={files => { void handleAttach(files); }}
            onRemoveAsset={id => setAssets(list => list.filter(asset => asset.id !== id))}
            onSend={() => { void handleSend(); }}
            onStop={() => { void handleStop(); }}
            onNewSession={handleNewSession}
            onOpenSettings={() => setView('settings')}
            modelConfig={model}
            onSwitchProfile={id => { void handleSwitchProfile(id); }}
            onReplay={handleReplay}
            modelName={profile?.model || 'Agent'}
            isModelVerified={profile?.agentVerified}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={toggleSidebar}
          />
        </div>
      ) : (
        <SettingsView
          model={model}
          onModel={setModel}
          onBack={() => setView('chat')}
        />
      )}
    </div>
  );
}
