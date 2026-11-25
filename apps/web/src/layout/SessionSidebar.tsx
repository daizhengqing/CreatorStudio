import { useState, useMemo, type FormEvent } from 'react';
import {
  Check,
  MessageSquare,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { SessionSummary } from '@creator-studio/contracts';
import { cn } from '@creator-studio/ui/utils';

type Props = {
  sessions: SessionSummary[];
  selectedId: string | null;
  onSelectSession: (id: string | null) => void;
  onNewSession: () => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onDeleteSession: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  disabled?: boolean;
};

type SessionGroup = {
  label: string;
  sessions: SessionSummary[];
};

/**
 * 将会话列表按今天、昨天、近 7 天、更早进行时间轴分组
 */
function groupSessionsByTime(sessions: SessionSummary[]): SessionGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const last7DaysStart = todayStart - 7 * 86400000;

  const today: SessionSummary[] = [];
  const yesterday: SessionSummary[] = [];
  const last7Days: SessionSummary[] = [];
  const older: SessionSummary[] = [];

  for (const session of sessions) {
    const time = session.updatedAt;
    if (time >= todayStart) {
      today.push(session);
    } else if (time >= yesterdayStart) {
      yesterday.push(session);
    } else if (time >= last7DaysStart) {
      last7Days.push(session);
    } else {
      older.push(session);
    }
  }

  const groups: SessionGroup[] = [];
  if (today.length > 0) groups.push({ label: '今天', sessions: today });
  if (yesterday.length > 0) groups.push({ label: '昨天', sessions: yesterday });
  if (last7Days.length > 0) groups.push({ label: '近 7 天', sessions: last7Days });
  if (older.length > 0) groups.push({ label: '更早', sessions: older });

  return groups;
}

/**
 * 中间工作台/会话列表侧边栏
 * 包含：折叠收起、时间轴分组、搜索过滤、内联重命名与快捷删除
 */
export function SessionSidebar({
  sessions,
  selectedId,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
  collapsed,
  onToggleCollapse,
  disabled,
}: Props) {
  const [keyword, setKeyword] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // 根据搜索关键字过滤会话列表
  const filteredSessions = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(session => session.title.toLowerCase().includes(q));
  }, [sessions, keyword]);

  // 时间轴分组
  const groups = useMemo(() => {
    return groupSessionsByTime(filteredSessions);
  }, [filteredSessions]);

  function startRename(session: SessionSummary) {
    setEditingId(session.id);
    setEditingTitle(session.title);
    setConfirmDeleteId(null);
  }

  function commitRename(id: string) {
    const trimmed = editingTitle.trim();
    if (trimmed && trimmed !== sessions.find(s => s.id === id)?.title) {
      onRenameSession(id, trimmed);
    }
    setEditingId(null);
  }

  function handleRenameSubmit(event: FormEvent, id: string) {
    event.preventDefault();
    commitRename(id);
  }

  return (
    <aside
      className={cn('session-sidebar', {
        collapsed,
      })}
      aria-label="工作台会话列表"
    >
      {/* 顶部标题与折叠按钮 */}
      <div className="sidebar-header">
        <h2 className="sidebar-title">工作台</h2>
        <button
          type="button"
          className="sidebar-toggle-btn"
          title="收起侧栏"
          aria-label="收起侧栏"
          onClick={onToggleCollapse}
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      {/* 新建会话按钮 */}
      <div className="sidebar-action-wrap">
        <button
          type="button"
          className="new-session-text-btn"
          disabled={disabled}
          onClick={onNewSession}
        >
          <Plus size={15} />
          <span>新建会话</span>
        </button>
      </div>

      {/* 搜索会话框 */}
      <div className="sidebar-search-wrap">
        <Search size={14} className="search-icon" />
        <input
          type="text"
          className="sidebar-search-input"
          placeholder="搜索会话..."
          value={keyword}
          onChange={event => setKeyword(event.target.value)}
        />
        {keyword && (
          <button
            type="button"
            className="search-clear-btn"
            title="清空搜索"
            onClick={() => setKeyword('')}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* 会话列表容器：时间轴分组或搜索结果 */}
      <div className="sidebar-list-container">
        {keyword ? (
          // 搜索结果直接展示
          <div className="sessions-list">
            <div className="session-group-label">搜索结果 ({filteredSessions.length})</div>
            {filteredSessions.map(session => renderSessionItem(session))}
          </div>
        ) : (
          // 时间轴分组渲染
          <div className="sessions-list">
            {groups.map(group => (
              <div key={group.label} className="session-time-group">
                <div className="session-group-label">{group.label}</div>
                {group.sessions.map(session => renderSessionItem(session))}
              </div>
            ))}
          </div>
        )}

        {filteredSessions.length === 0 && (
          <p className="sidebar-empty-tip">
            {keyword ? '未找到匹配的会话' : '暂无会话，点击新建开始'}
          </p>
        )}
      </div>
    </aside>
  );

  function renderSessionItem(session: SessionSummary) {
    const isSelected = session.id === selectedId;
    const isEditing = session.id === editingId;
    const isConfirmingDelete = session.id === confirmDeleteId;

    if (isEditing) {
      return (
        <form
          key={session.id}
          className="session-item-editing"
          onSubmit={event => handleRenameSubmit(event, session.id)}
        >
          <input
            type="text"
            className="session-rename-input"
            autoFocus
            maxLength={64}
            value={editingTitle}
            onChange={event => setEditingTitle(event.target.value)}
            onBlur={() => commitRename(session.id)}
            onKeyDown={event => {
              if (event.key === 'Escape') setEditingId(null);
            }}
          />
          <button type="submit" className="session-inline-btn" title="保存">
            <Check size={12} />
          </button>
        </form>
      );
    }

    return (
      <div
        key={session.id}
        className={cn('session-item-row', {
          active: isSelected,
          'is-confirming': isConfirmingDelete,
        })}
      >
        <button
          type="button"
          className="session-item-main"
          disabled={disabled}
          onClick={() => {
            if (isConfirmingDelete) {
              setConfirmDeleteId(null);
              return;
            }
            onSelectSession(session.id);
          }}
        >
          <MessageSquare size={14} className="session-item-icon" />
          <span className="session-item-title truncate">{session.title}</span>
        </button>

        {/* 悬停操作按钮组 / 删除确认组 */}
        {isConfirmingDelete ? (
          <div className="session-item-confirm">
            <span className="confirm-tip">删除?</span>
            <button
              type="button"
              className="session-action-btn text-destructive"
              title="确认删除"
              onClick={event => {
                event.stopPropagation();
                onDeleteSession(session.id);
                setConfirmDeleteId(null);
              }}
            >
              <Check size={13} />
            </button>
            <button
              type="button"
              className="session-action-btn"
              title="取消"
              onClick={event => {
                event.stopPropagation();
                setConfirmDeleteId(null);
              }}
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className="session-item-actions">
            <button
              type="button"
              className="session-action-btn"
              title="重命名"
              onClick={event => {
                event.stopPropagation();
                startRename(session);
              }}
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              className="session-action-btn"
              title="删除会话"
              onClick={event => {
                event.stopPropagation();
                setConfirmDeleteId(session.id);
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    );
  }
}
