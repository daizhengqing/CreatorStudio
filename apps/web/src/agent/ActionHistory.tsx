import { useState, useEffect } from 'react';
import {
  Check,
  ChevronRight,
  Code2,
  LoaderCircle,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import type { ToolEntry } from '@creator-studio/contracts';
import { MediaReference } from './MediaCards';

type Props = {
  entries: ToolEntry[];
};

function resultText(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/**
 * Agent 动作执行历史折叠面板
 * 支持：实时步骤状态动效、运行中自动展开、媒体素材结果预览
 */
export function ActionHistory({ entries }: Props) {
  const hasRunning = entries.some(e => e.status === 'running');
  const hasFailed = entries.some(e => e.status === 'failed');

  const [expanded, setExpanded] = useState(false);

  // 当有正在执行的任务时，自动展开方便观察步骤
  useEffect(() => {
    if (hasRunning) {
      setExpanded(true);
    }
  }, [hasRunning]);

  if (!entries.length) return null;

  const currentRunningStep = entries.find(e => e.status === 'running');

  return (
    <div className="action-history-wrapper">
      <button
        type="button"
        className="action-history-header"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="action-history-title">
          {hasRunning ? (
            <LoaderCircle size={14} className="animate-spin text-primary mr-1.5" />
          ) : hasFailed ? (
            <TriangleAlert size={14} className="text-destructive mr-1.5" />
          ) : (
            <Check size={14} className="text-emerald-500 mr-1.5" />
          )}

          <span className="font-medium">
            Action History · {entries.length} 步
          </span>

          {currentRunningStep && (
            <span className="current-running-step-tip truncate">
              正在处理：{currentRunningStep.label}
            </span>
          )}
        </div>

        <ChevronRight
          size={14}
          className={`action-history-arrow transition-transform duration-200 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
      </button>

      {expanded && (
        <div className="action-history-body">
          {entries.map(entry => {
            const Icon = {
              running: LoaderCircle,
              completed: Check,
              failed: TriangleAlert,
            }[entry.status];

            return (
              <div key={entry.id} className="action-step-item">
                <div className="tool-line">
                  <Wrench size={13} className="tool-icon" />
                  <span className="tool-label">{entry.label}</span>
                  <span
                    className={
                      entry.status === 'failed' ? 'tool-failed' : 'tool-summary'
                    }
                  >
                    <Icon
                      size={12}
                      className={entry.status === 'running' ? 'animate-spin' : undefined}
                    />
                    {entry.summary}
                  </span>
                </div>

                {entry.references.map((reference, index) => (
                  <MediaReference key={index} reference={reference} />
                ))}

                {entry.text && entry.status !== 'failed' && (
                  <details className="tool-details">
                    <summary>
                      <Code2 size={12} />
                      <span>查看工具返回数据</span>
                    </summary>
                    <pre className="tool-json-preview">{resultText(entry.text)}</pre>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
