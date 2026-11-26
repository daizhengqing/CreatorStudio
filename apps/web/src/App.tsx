import { useCallback, useEffect, useRef, useState } from 'react';
import type { Asset, RunAccepted, SessionListEvent, SessionSummary } from '@creator-studio/contracts';
import { api, json, messageOf } from './api';
import { useSession } from './agent/use-session';
import { useToast } from './ui/Toast';
import { IconMenu, type AppView } from './layout/IconMenu';
import { SessionSidebar } from './layout/SessionSidebar';
import { ChatView } from './views/ChatView';
import { SettingsView, type SettingsSection } from './views/SettingsView';
import { TrendsView } from './views/TrendsView';
import { XMonitorView } from './views/XMonitorView';

const SELECTION_KEY = 'creator-studio.session';
const THEME_KEY = 'creator-studio.theme';
const SIDEBAR_COLLAPSE_KEY = 'creator-studio.sidebar-collapsed';

function readView(): AppView {
  const hash = window.location.hash.slice(1);
  return hash === 'trends' || hash === 'x-monitor' || hash === 'settings' ? hash : 'chat';
}

export function App() {
  const toast = useToast();
  const [view, setView] = useState(readView);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('model');
  const [settingsReturn, setSettingsReturn] = useState<Exclude<AppView, 'settings'>>('chat');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === 'true';
  });

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const selection = useRef<string | null>(null);
  const [sessionListOffline, setSessionListOffline] = useState(false);

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

  const selectSession = useCallback((id: string | null) => {
    selection.current = id;
    setSelected(id);
    setWaitingRun(null);
    setError('');
    if (id) localStorage.setItem(SELECTION_KEY, id);
    else localStorage.removeItem(SELECTION_KEY);
  }, []);

  useEffect(() => {
    const updateView = () => setView(readView());
    window.addEventListener('hashchange', updateView);
    return () => window.removeEventListener('hashchange', updateView);
  }, []);

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

  // 后台任务的新会话也从同一条会话列表事件流推送。
  useEffect(() => {
    const stream = new EventSource('/api/agent/session-list/events');
    let current: SessionSummary[] = [];
    let receivedSnapshot = false;
    stream.onmessage = message => {
      const event = JSON.parse(message.data) as SessionListEvent;
      setSessionListOffline(false);
      if (event.type === 'snapshot') {
        const previous = selection.current;
        if (!receivedSnapshot && !previous) {
          const last = localStorage.getItem(SELECTION_KEY);
          if (last && event.sessions.some(session => session.id === last)) selectSession(last);
        } else if (current.some(session => session.id === previous) && !event.sessions.some(session => session.id === previous)) {
          selectSession(event.sessions[0]?.id ?? null);
        }
        receivedSnapshot = true;
        current = event.sessions;
      } else if (event.type === 'upsert') {
        current = [event.session, ...current.filter(session => session.id !== event.session.id)]
          .sort((a, b) => b.updatedAt - a.updatedAt);
      } else {
        current = current.filter(session => session.id !== event.sessionId);
        if (selection.current === event.sessionId) selectSession(current[0]?.id ?? null);
      }
      setSessions(current);
    };
    stream.onerror = () => setSessionListOffline(true);
    return () => stream.close();
  }, [selectSession]);

  // 运行完成后重置等待标志
  useEffect(() => {
    if (waitingRun === snapshot?.run?.id) setWaitingRun(null);
  }, [waitingRun, snapshot?.run?.id]);

  function navigate(next: AppView) {
    setView(next);
    if (readView() !== next) window.location.hash = next;
  }

  function openRunSession(id: string) {
    selectSession(id);
    navigate('chat');
  }

  function openSettings(section: SettingsSection = 'model') {
    if (view !== 'settings') setSettingsReturn(view);
    setSettingsSection(section);
    navigate('settings');
  }

  function handleNewSession() {
    selectSession(null);
    setDraft('');
    setAssets([]);
    navigate('chat');
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
      toast.info('会话已删除');
    } catch (err) {
      const msg = messageOf(err);
      setError(msg);
      toast.error(msg);
    }
  }

  async function handleRenameSession(id: string, newTitle: string) {
    try {
      await api(`/api/agent/sessions/${id}`, json('PATCH', { title: newTitle }));
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
        onSelectView={next => next === 'settings' ? openSettings() : navigate(next)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {view === 'chat' && (
        <div className="chat-layout">
          <SessionSidebar
            sessions={sessions}
            offline={sessionListOffline}
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
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={toggleSidebar}
          />
        </div>
      )}
      {view === 'trends' && <TrendsView onOpenSettings={() => openSettings('trends')} />}
      {view === 'x-monitor' && <XMonitorView onOpenSettings={() => openSettings('x')} />}
      {view === 'settings' && (
        <SettingsView key={settingsSection} initialSection={settingsSection} onBack={() => navigate(settingsReturn)}
          onOpenRunSession={openRunSession} />
      )}
    </div>
  );
}
