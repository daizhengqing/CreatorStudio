import { useState, type ComponentProps } from 'react';
import {
  ArrowDown,
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';
import { MessageScroller } from '@shadcn/react/message-scroller';
import Markdown from 'react-markdown';
import type { AgentRun, ChatEntry, ScheduledPost, ToolEntry } from '@creator-studio/contracts';
import { AssetCard } from './MediaCards';
import { ActionHistory } from './ActionHistory';
import { useToast } from '../ui/Toast';
import { XDraftCards } from '../ui/XDraftCards';

type GroupedMessage =
  | { kind: 'user'; entry: ChatEntry & { role: 'user' } }
  | { kind: 'tools'; entries: ToolEntry[] }
  | { kind: 'assistant'; entry: ChatEntry & { role: 'assistant' }; durationSec?: number };

function groupEntries(entries: ChatEntry[]): GroupedMessage[] {
  const groups: GroupedMessage[] = [];
  let currentTools: ToolEntry[] = [];

  for (const entry of entries) {
    if (entry.role === 'tool') {
      currentTools.push(entry);
    } else {
      if (currentTools.length > 0) {
        groups.push({ kind: 'tools', entries: currentTools });
        currentTools = [];
      }
      if (entry.role === 'user') {
        groups.push({ kind: 'user', entry });
      } else if (entry.role === 'assistant') {
        // 估算耗时展示
        const durationSec = Math.max(2, Math.round(entry.text.length / 25));
        groups.push({ kind: 'assistant', entry, durationSec });
      }
    }
  }

  if (currentTools.length > 0) {
    groups.push({ kind: 'tools', entries: currentTools });
  }

  return groups;
}

/**
 * 现代代码块卡片
 * 支持语言标头与一键复制代码
 */
function CodeBlockCard({ language, code }: { language?: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  function handleCopy() {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('代码已复制到剪贴板');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="code-block-card">
      <div className="code-block-header">
        <span className="code-block-lang">{language || 'code'}</span>
        <button
          type="button"
          className="code-copy-btn"
          title="复制代码"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-500" />
              <span>已复制</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>复制代码</span>
            </>
          )}
        </button>
      </div>
      <pre className="code-block-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function AssistantMessage({
  text,
  posts,
  durationSec,
  isStreaming,
}: {
  text: string;
  posts?: ScheduledPost[];
  durationSec?: number;
  isStreaming?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  function handleCopy() {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('回复内容已复制');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="assistant-message-container">
      <div className="assistant-message">
        <Markdown
          components={{
            a: props => (
              <a {...props} target="_blank" rel="noreferrer" className="markdown-link">
                <span>{props.children}</span>
                <ExternalLink size={11} className="inline-block ml-0.5" />
              </a>
            ),
            code: ({ className, children, ...props }: ComponentProps<'code'>) => {
              const match = /language-(\w+)/.exec(className || '');
              const content = String(children);
              const isMultiLine = content.includes('\n');

              if (!match && !isMultiLine) {
                return (
                  <code className="inline-code" {...props}>
                    {children}
                  </code>
                );
              }

              return (
                <CodeBlockCard
                  language={match ? match[1] : ''}
                  code={content.replace(/\n$/, '')}
                />
              );
            },
          }}
        >
          {text}
        </Markdown>
        {isStreaming && <span className="typing-cursor" aria-label="正在输出" />}
      </div>

      {posts && <XDraftCards posts={posts} />}

      <div className="message-meta-footer">
        <span className="worked-time">- Worked for {durationSec ?? 3}s</span>
        <button
          type="button"
          className="msg-action-btn"
          title={copied ? '已复制' : '复制内容'}
          aria-label="复制内容"
          onClick={handleCopy}
        >
          {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

export function Transcript({
  entries,
  run,
  offline,
}: {
  entries: ChatEntry[];
  run: AgentRun | null;
  offline: boolean;
}) {
  const groups = groupEntries(entries);
  const isRunning = run?.status === 'running';

  // 找到最后一个 assistant 消息索引，用于在生成中展示闪烁光标
  let lastAssistantIndex = -1;
  for (let i = groups.length - 1; i >= 0; i--) {
    const item = groups[i];
    if (item && item.kind === 'assistant') {
      lastAssistantIndex = i;
      break;
    }
  }

  return (
    <MessageScroller.Provider autoScroll>
      <MessageScroller.Root className="transcript">
        <MessageScroller.Viewport className="transcript-viewport" aria-label="创作对话">
          <MessageScroller.Content className="transcript-content">
            {groups.map((group, index) => {
              if (group.kind === 'tools') {
                return (
                  <MessageScroller.Item
                    key={`tools-${group.entries[0]?.id || index}`}
                    messageId={`tools-${group.entries[0]?.id || index}`}
                  >
                    <ActionHistory entries={group.entries} />
                  </MessageScroller.Item>
                );
              }

              if (group.kind === 'user') {
                return (
                  <MessageScroller.Item
                    key={group.entry.id}
                    messageId={group.entry.id}
                    scrollAnchor
                  >
                    <div className="user-message-container">
                      <div className="user-message">
                        <p>{group.entry.text}</p>
                        {group.entry.assets.map(asset => (
                          <AssetCard key={asset.id} asset={asset} />
                        ))}
                      </div>
                    </div>
                  </MessageScroller.Item>
                );
              }

              return (
                <MessageScroller.Item key={group.entry.id} messageId={group.entry.id}>
                  <AssistantMessage
                    text={group.entry.text}
                    posts={group.entry.posts}
                    durationSec={group.durationSec}
                    isStreaming={isRunning && index === lastAssistantIndex}
                  />
                </MessageScroller.Item>
              );
            })}

            {(offline ||
              run?.status === 'running' ||
              run?.status === 'failed' ||
              run?.status === 'cancelled') && (
              <MessageScroller.Item messageId="run-status">
                {offline ? (
                  <p className="run-status">正在重新连接会话…</p>
                ) : run?.status === 'running' ? (
                  <p className="run-status">
                    <LoaderCircle size={14} className="animate-spin text-primary" />
                    Agent 正在处理
                  </p>
                ) : run?.status === 'failed' ? (
                  <p className="run-status status-error" role="alert">
                    <TriangleAlert size={15} />
                    {run.error}
                  </p>
                ) : (
                  <p className="run-status">已停止本轮运行</p>
                )}
              </MessageScroller.Item>
            )}
          </MessageScroller.Content>
        </MessageScroller.Viewport>
        <MessageScroller.Button className="thread-jump" aria-label="跳到最新消息">
          <ArrowDown size={16} />
        </MessageScroller.Button>
      </MessageScroller.Root>
    </MessageScroller.Provider>
  );
}
