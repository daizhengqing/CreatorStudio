export type CollectionSignal = {
  seq: number;
  id: string;
  title: string;
  text: string;
  url: string;
  source: string;
  publishedAt: number | null;
  collectedAt: number;
};

export type ScheduledTaskInput = {
  name: string;
  prompt: string;
  kind: 'instruction' | 'x-drafts';
  intervalMinutes: number;
  enabled: boolean;
};

export const X_DRAFT_SCHEDULE = {
  name: '五分钟热点选题与 X 草稿',
  kind: 'x-drafts',
  intervalMinutes: 5,
  enabled: true,
  prompt: [
    '通过采集工具查阅本轮新增的热点资讯和 X 推文，找出适合在 X 分享的消息。优先考虑时效性、明确的新进展、来源可信度和讨论价值。',
    '将同一事件的多条报道或转发合并。只有证据足够、确实有价值的消息才提交待审草稿。',
    '每个选题写一条自然、简洁的中文帖，正文约 100 至 130 个字。开头点明发生了什么，再说明为什么值得关注。保留可核实的事实，不把传闻写成已证实事实。',
  ].join('\n'),
} satisfies ScheduledTaskInput;

export type ScheduledRunSummary = {
  id: string;
  taskId: string;
  sessionId: string | null;
  startedAt: number;
  finishedAt: number | null;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  error: string | null;
};

export type ScheduledPost = {
  title: string;
  text: string;
  reason: string;
  sourceUrls: string[];
};

export type ScheduledConversationResult = { text: string; posts?: ScheduledPost[] };

export type ScheduledConversationTrace = {
  signal: AbortSignal;
  beginStep(label: string): {
    complete(summary: string, text?: string): void;
    fail(message: string): void;
  };
};

export type ScheduledConversationInput = {
  title: string;
  prompt: string;
  signal: AbortSignal;
};

export type ScheduledRun = ScheduledRunSummary & {
  output: string | null;
  posts: ScheduledPost[];
  scanned: { trends: number; x: number } | null;
};

export type ScheduledTask = ScheduledTaskInput & {
  id: string;
  nextRunAt: number | null;
  lastRun: ScheduledRunSummary | null;
};
