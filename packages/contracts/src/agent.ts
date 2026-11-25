import type { Asset, DownloadTask, ExportTask } from './media.js';

export type SendMessage = { text: string; assetIds?: string[] };
export type RunAccepted = { sessionId: string; runId: string };
export type SessionSummary = { id: string; title: string; updatedAt: number };

export type ToolReference =
  | { kind: 'asset'; asset: Asset }
  | { kind: 'download'; task: DownloadTask }
  | { kind: 'export'; task: ExportTask };

export type ToolDetails = { summary: string; references: ToolReference[] };
export type ToolEntry = ToolDetails & {
  id: string; role: 'tool'; label: string; status: 'running' | 'completed' | 'failed'; text: string;
};

export type ChatEntry =
  | { id: string; role: 'user'; text: string; assets: Asset[] }
  | { id: string; role: 'assistant'; text: string }
  | ToolEntry;

export type AgentRun = {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  error: string | null;
};

export type SessionSnapshot = { session: SessionSummary; entries: ChatEntry[]; run: AgentRun | null };

export type SessionEvent =
  | { type: 'snapshot'; snapshot: SessionSnapshot }
  | { type: 'entry'; entry: ChatEntry }
  | { type: 'run'; run: AgentRun; session: SessionSummary }
  | { type: 'text_delta'; id: string; delta: string };
