import type { AgentRun, Asset, ChatEntry, ScheduledConversationResult, ToolDetails, ToolEntry } from '@creator-studio/contracts';
import type { SessionManager } from '@earendil-works/pi-coding-agent';

export const inputType = 'creator-input';
export const runType = 'creator-run';
export const scheduledSessionType = 'creator-scheduled-session';
export const scheduledStepType = 'creator-scheduled-step';
export const scheduledResultType = 'creator-scheduled-result';

export type CreatorInput = { text: string; assets: Asset[] };

type Content = string | readonly { type: string; text?: string }[];

export function contentText(content: Content): string {
  return typeof content === 'string' ? content : content.flatMap(block => block.type === 'text' ? [block.text ?? ''] : []).join('');
}

export function toolEntry(id: string, label: string, text: string, isError: boolean, details?: Partial<ToolDetails>): ToolEntry {
  return {
    id, role: 'tool', label: details?.label ?? label, text, status: isError ? 'failed' : 'completed',
    summary: isError ? text : details?.summary ?? '工具已完成', references: details?.references ?? [],
  };
}

export function restoreTranscript(manager: SessionManager, labels: Map<string, string>) {
  const entries: ChatEntry[] = [];
  const stepIndexes = new Map<string, number>();
  let input: CreatorInput | undefined;
  let run: AgentRun | null = null;
  let scheduled = false;
  for (const entry of manager.getBranch()) {
    if (entry.type === 'custom') {
      if (entry.customType === inputType) input = entry.data as CreatorInput;
      if (entry.customType === runType) run = entry.data as AgentRun;
      if (entry.customType === scheduledSessionType) scheduled = true;
      if (entry.customType === scheduledStepType) {
        const step = entry.data as ToolEntry;
        const index = stepIndexes.get(step.id) ?? entries.length;
        stepIndexes.set(step.id, index);
        entries[index] = step;
      }
    }
    if (entry.type === 'custom_message' && entry.customType === scheduledResultType) {
      const { text, posts } = entry.details as ScheduledConversationResult;
      entries.push({ id: entry.id, role: 'assistant', text, posts });
    }
    if (entry.type !== 'message') continue;
    const { message } = entry;
    if (message.role === 'user') {
      entries.push({ id: entry.id, role: 'user', text: input?.text ?? contentText(message.content), assets: input?.assets ?? [] });
      input = undefined;
    }
    if (message.role === 'assistant') {
      const text = contentText(message.content);
      if (text) entries.push({ id: entry.id, role: 'assistant', text });
    }
    if (message.role === 'toolResult') {
      entries.push(toolEntry(message.toolCallId, labels.get(message.toolName) ?? message.toolName,
        contentText(message.content), message.isError, message.details as Partial<ToolDetails> | undefined));
    }
  }
  if (run?.status === 'running') {
    const error = '服务已重启，本轮运行已中断';
    run = { ...run, status: 'failed', error };
    for (const index of stepIndexes.values()) {
      const entry = entries[index];
      if (entry?.role === 'tool' && entry.status === 'running') {
        entries[index] = { ...entry, status: 'failed', summary: error, text: error };
      }
    }
  }
  return { entries, run, scheduled };
}
