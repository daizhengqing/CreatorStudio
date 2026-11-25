import { Aperture, ArrowUpRight, Clapperboard, Flame, PanelLeft, Plus, Radio } from 'lucide-react';
import type { AgentRun, Asset, ChatEntry, ModelConfig, ModelProfileId, SessionSummary } from '@creator-studio/contracts';
import { Button } from '@creator-studio/ui/button';
import { Composer } from '../agent/Composer';
import { Transcript } from '../agent/Transcript';

const starters = [
  { Icon: Clapperboard, label: '查看我的素材', prompt: '查看最近导入的素材，告诉我它们的类型和时长。' },
  { Icon: Flame, label: '看看今天的热点', prompt: '查一下最近的 AI 热点，列出几条值得关注的消息并附上来源链接。' },
  { Icon: Radio, label: '查询 X 监控', prompt: '查看我的 X 监控目标和最近的采集状态。' },
];

type Props = {
  selectedSession: SessionSummary | null;
  entries: ChatEntry[];
  run: AgentRun | null;
  offline: boolean;
  busy: boolean;
  sending: boolean;
  uploading: boolean;
  stopping: boolean;
  error: string;
  draft: string;
  assets: Asset[];
  onDraft: (text: string) => void;
  onAttach: (files: File[]) => void;
  onRemoveAsset: (id: string) => void;
  onSend: () => void;
  onStop: () => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
  modelConfig: ModelConfig | null;
  onSwitchProfile: (profileId: ModelProfileId) => void;
  onReplay: (text: string, assets: Asset[]) => void;
  modelName?: string;
  isModelVerified?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
};

/**
 * 右侧主会话交互区域
 * 包含顶部 Tab 栏、消息流/欢迎页、以及底部现代输入框
 */
export function ChatView({
  selectedSession,
  entries,
  run,
  offline,
  busy,
  sending,
  uploading,
  stopping,
  error,
  draft,
  assets,
  onDraft,
  onAttach,
  onRemoveAsset,
  onSend,
  onStop,
  onNewSession,
  onOpenSettings,
  modelConfig,
  onSwitchProfile,
  onReplay,
  modelName,
  isModelVerified,
  sidebarCollapsed,
  onToggleSidebar,
}: Props) {
  return (
    <div className="chat-view">
      {/* 顶部标签栏 */}
      <header className="chat-header">
        <div className="chat-tab-container">
          {sidebarCollapsed && onToggleSidebar && (
            <button
              type="button"
              className="chat-header-btn mr-1.5"
              title="展开工作台侧栏"
              aria-label="展开工作台侧栏"
              onClick={onToggleSidebar}
            >
              <PanelLeft size={16} />
            </button>
          )}

          <div className="chat-tab active">
            <span className="chat-tab-title truncate">
              {selectedSession?.title || '新对话'}
            </span>
          </div>
        </div>

        <div className="chat-header-actions">
          {/* 模型状态指示 */}
          {modelName && (
            <button
              type="button"
              className="chat-model-badge"
              title="模型设置"
              onClick={onOpenSettings}
            >
              <span className={`status-dot ${isModelVerified ? 'status-ready' : ''}`} />
              <span className="truncate">{modelName}</span>
            </button>
          )}

          {/* 新建会话按钮 */}
          <button
            type="button"
            className="chat-header-btn"
            title="新建对话"
            aria-label="新建对话"
            disabled={busy || sending}
            onClick={onNewSession}
          >
            <Plus size={16} />
          </button>
        </div>
      </header>

      {/* 主对话区 / 初始欢迎区 */}
      <div className="chat-body">
        {selectedSession ? (
          <Transcript
            key={selectedSession.id}
            entries={entries}
            run={run}
            offline={offline}
            onReplay={onReplay}
          />
        ) : (
          <section className="welcome-screen" aria-labelledby="welcome-title">
            <div className="welcome-mark">
              <Aperture size={32} strokeWidth={1.65} />
            </div>
            <h1 id="welcome-title">今天想创作什么？</h1>
            <p>从一个想法、一段素材或一条热点开始。</p>
            <div className="starter-actions">
              {starters.map(({ Icon, label, prompt }) => (
                <Button
                  key={label}
                  className="starter"
                  variant="outline"
                  onClick={() => onDraft(prompt)}
                >
                  <Icon data-icon="inline-start" />
                  <span>{label}</span>
                  <ArrowUpRight data-icon="inline-end" />
                </Button>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* 底部输入框 */}
      <Composer
        draft={draft}
        onDraft={onDraft}
        assets={assets}
        onAttach={onAttach}
        onRemove={onRemoveAsset}
        busy={busy}
        sending={sending}
        uploading={uploading}
        stopping={stopping}
        error={error}
        onSend={onSend}
        onStop={onStop}
        modelConfig={modelConfig}
        onSwitchProfile={onSwitchProfile}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
}
