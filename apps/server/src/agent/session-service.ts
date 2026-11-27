import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import {
  SessionManager, type AgentSession, type AgentSessionEvent, type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type {
  AgentRun, ChatEntry, RunAccepted, ScheduledConversationInput, ScheduledConversationResult,
  ScheduledConversationTrace, SendMessage, SessionEvent, SessionListEvent, SessionSummary, ToolDetails, ToolEntry,
} from '@creator-studio/contracts';
import { DATA_ROOT, DIRS } from '../config.js';
import { getAsset } from '../services/media.js';
import type { ModelConnection } from '../services/model-completion.js';
import { getActiveModelConnection } from '../services/models.js';
import { agentMessages } from './content.js';
import { loadPromptImages } from './images.js';
import { createCreatorSession, modelFailure, type CreatorSessionProfile } from './runtime.js';
import {
  contentText, inputType, restoreTranscript, runType, scheduledResultType, scheduledSessionType, scheduledStepType,
  toolEntry, type CreatorInput,
} from './transcript.js';

export type ScheduledAgentInput = ScheduledConversationInput & {
  tools?: ToolDefinition[];
  profile?: CreatorSessionProfile;
  skipModel?: boolean;
  finalize?: (result: ScheduledConversationResult, trace: ScheduledConversationTrace) => Promise<ScheduledConversationResult>;
};

type Listener = (event: SessionEvent) => void;
type ListListener = (event: SessionListEvent) => void;
type ListChange = Exclude<SessionListEvent, { type: 'snapshot' }>;
type ActiveRun = { cancel: AbortController; done: Promise<void> };
type Conversation = {
  manager: SessionManager;
  scheduled: boolean;
  summary: SessionSummary;
  entries: ChatEntry[];
  run: AgentRun | null;
  active: ActiveRun | null;
  listeners: Set<Listener>;
};

function statusError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeInput(input: SendMessage): CreatorInput {
  const text = input.text.trim();
  if (!text) throw statusError('请输入创作指令', 400);
  const assets = [...new Set(input.assetIds)].map(id => {
    const asset = getAsset(id);
    if (!asset) throw statusError(`素材不存在 ${id}`, 400);
    return asset;
  });
  return { text, assets };
}

function publish(record: Conversation, event: SessionEvent) {
  for (const listener of record.listeners) listener(event);
}

function upsert(record: Conversation, entry: ChatEntry) {
  const index = record.entries.findIndex(item => item.id === entry.id);
  if (index === -1) record.entries.push(entry);
  else record.entries[index] = entry;
  publish(record, { type: 'entry', entry });
}

function promptText(input: CreatorInput): string {
  if (!input.assets.length) return input.text;
  const assets = input.assets.map(({ id, name, type, duration }) => ({ assetId: id, name, type, duration }));
  const context = agentMessages.uploadedAssets.replace('{{assets}}', () => JSON.stringify(assets));
  return `${input.text}\n\n${context}`;
}

export function createAgentService(tools: ToolDefinition[], interactiveTools: ToolDefinition[] = []) {
  // 对话可以创建定时任务，定时执行仅使用原有的业务工具。
  const chatTools = [...tools, ...interactiveTools];
  const labels = new Map(chatTools.map(tool => [tool.name, tool.label]));
  const records = new Map<string, Conversation>();
  const listListeners = new Set<(event: ListChange) => void>();
  const persistedSessions = () => SessionManager.list(DATA_ROOT, DIRS.sessions);

  function publishList(event: ListChange) {
    for (const listener of listListeners) listener(event);
  }

  function publishSummary(record: Conversation) {
    publishList({ type: 'upsert', session: { ...record.summary } });
  }

  function releaseScheduled(record: Conversation) {
    if (!record.scheduled || record.active || record.listeners.size) return;
    const { id } = record.summary;
    // 给正在打开会话的请求一个订阅机会，然后从已完成的任务会话回收内存。
    setImmediate(() => {
      if (records.get(id) === record && !record.active && !record.listeners.size) records.delete(id);
    }).unref();
  }

  function makeRecord(manager: SessionManager, title: string, updatedAt: number): Conversation {
    const summary = { id: manager.getSessionId(), title, updatedAt };
    const record = { manager, summary, ...restoreTranscript(manager, labels), active: null, listeners: new Set<Listener>() };
    records.set(summary.id, record);
    return record;
  }

  async function load(id: string) {
    const cached = records.get(id);
    if (cached) return cached;
    const info = (await persistedSessions()).find(item => item.id === id);
    if (!info) throw statusError('找不到该会话', 404);
    return records.get(id) ?? makeRecord(SessionManager.open(info.path, DIRS.sessions, DATA_ROOT),
      info.name ?? '创作会话', info.modified.getTime());
  }

  async function list() {
    const summaries = new Map((await persistedSessions()).map(info => [
      info.id, { id: info.id, title: info.name ?? '创作会话', updatedAt: info.modified.getTime() },
    ]));
    for (const record of records.values()) summaries.set(record.summary.id, record.summary);
    return [...summaries.values()].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async function observeSessions(listener: ListListener) {
    // 初始列表需要读磁盘，期间先排队，再依次推送变更。
    const pending: ListChange[] = [];
    const buffer = (event: ListChange) => { pending.push(event); };
    listListeners.add(buffer);
    try {
      listener({ type: 'snapshot', sessions: await list() });
      for (const event of pending) listener(event);
      listListeners.add(listener);
      return () => listListeners.delete(listener);
    } finally {
      listListeners.delete(buffer);
    }
  }

  function handler(record: Conversation, availableTools: ToolDefinition[]) {
    const runLabels = new Map(availableTools.map(tool => [tool.name, tool.label]));
    let assistant: Extract<ChatEntry, { role: 'assistant' }> | undefined;
    return (event: AgentSessionEvent) => {
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
        const { delta } = event.assistantMessageEvent;
        if (!assistant) {
          assistant = { id: randomUUID(), role: 'assistant', text: delta };
          upsert(record, assistant);
        } else {
          assistant.text += delta;
          publish(record, { type: 'text_delta', id: assistant.id, delta });
        }
      }
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        const text = contentText(event.message.content);
        if (text) upsert(record, { id: assistant?.id ?? randomUUID(), role: 'assistant', text });
        assistant = undefined;
      }
      if (event.type === 'tool_execution_start') {
        upsert(record, {
          id: event.toolCallId, role: 'tool', label: runLabels.get(event.toolName) ?? event.toolName,
          status: 'running', summary: '正在执行', text: '', references: [],
        });
      }
      if (event.type === 'tool_execution_end') {
        const result = event.result as { content: ContentResult; details?: Partial<ToolDetails> };
        upsert(record, toolEntry(event.toolCallId, runLabels.get(event.toolName) ?? event.toolName,
          contentText(result.content), event.isError, result.details));
      }
    };
  }

  async function runPi(
    record: Conversation, model: ModelConnection, signal: AbortSignal, prompt: (session: AgentSession) => Promise<void>,
    availableTools: ToolDefinition[], profile?: CreatorSessionProfile,
  ) {
    signal.throwIfAborted();
    const session = await createCreatorSession(model, record.manager, availableTools, profile);
    const abort = () => { void session.abort(); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      signal.throwIfAborted();
      const receive = handler(record, availableTools);
      session.subscribe(event => {
        // 停止可能发生在 SDK 的提示词预检期间。
        if (signal.aborted && event.type === 'agent_start') abort();
        receive(event);
      });
      await prompt(session);
      signal.throwIfAborted();
      return session.messages.findLast(message => message.role === 'assistant');
    } finally {
      signal.removeEventListener('abort', abort);
      session.dispose();
    }
  }

  async function execute(record: Conversation, active: ActiveRun, run: AgentRun, input: CreatorInput, connection: ModelConnection) {
    const text = promptText(input);
    const inputId = record.manager.appendCustomEntry(inputType, input);
    record.manager.appendCustomEntry(runType, run);
    const signal = active.cancel.signal;
    let error: string | null = null;

    try {
      const last = await runPi(record, connection, signal, async session => {
        const images = connection.supportsImages ? await loadPromptImages(input.assets) : [];
        signal.throwIfAborted();
        await session.prompt(text, { expandPromptTemplates: false, images });
      }, chatTools);
      if (last?.stopReason === 'error' || last?.stopReason === 'length') {
        throw new Error(last.errorMessage ?? '模型未能完成本轮回复');
      }
    } catch (failure) {
      error = modelFailure(failure, connection);
    }

    // SDK 在接收用户消息时落盘。会话初始化期间停止时，保存已提交的输入。
    const branch = record.manager.getBranch();
    if (!branch.slice(branch.findIndex(entry => entry.id === inputId) + 1)
      .some(entry => entry.type === 'message' && entry.message.role === 'user')) {
      record.manager.appendMessage({ role: 'user', content: text, timestamp: Date.now() });
    }

    const result: AgentRun = {
      id: run.id, status: signal.aborted ? 'cancelled' : error ? 'failed' : 'completed',
      error: signal.aborted ? null : error,
    };
    finish(record, result);
  }

  function finish(record: Conversation, run: AgentRun, persist = true) {
    record.active = null;
    record.run = run;
    record.summary.updatedAt = Date.now();
    if (persist) record.manager.appendCustomEntry(runType, run);
    announce(record, run);
    releaseScheduled(record);
  }

  function begin(record: Conversation) {
    if (record.active) throw statusError('本轮仍在运行，请先等待或停止', 409);
    const run: AgentRun = { id: randomUUID(), status: 'running', error: null };
    const active: ActiveRun = { cancel: new AbortController(), done: Promise.resolve() };
    record.active = active;
    record.run = run;
    record.summary.updatedAt = Date.now();
    return { run, active };
  }

  function announce(record: Conversation, run: AgentRun) {
    publish(record, { type: 'run', run, session: record.summary });
    publishSummary(record);
  }

  function start(record: Conversation, input: CreatorInput, connection: ModelConnection): RunAccepted {
    const { run, active } = begin(record);
    upsert(record, { ...input, id: run.id, role: 'user' });
    announce(record, run);
    active.done = execute(record, active, run, input, connection).catch(error => {
      finish(record, { id: run.id, status: 'failed', error: modelFailure(error, connection) }, false);
    });
    return { sessionId: record.summary.id, runId: run.id };
  }

  async function stop(record: Conversation) {
    const active = record.active;
    if (!active) return;
    active.cancel.abort();
    await active.done;
  }

  function connection() {
    const value = getActiveModelConnection();
    if (!value) throw statusError('请先在设置中添加并启用一个模型', 400);
    return value;
  }

  function recordStep(record: Conversation, step: ToolEntry) {
    record.manager.appendCustomEntry(scheduledStepType, step);
    upsert(record, step);
  }

  async function scheduledReply(
    record: Conversation, signal: AbortSignal, availableTools: ToolDefinition[], profile?: CreatorSessionProfile,
  ): Promise<ScheduledConversationResult> {
    const model = connection();
    try {
      // 指令在启动任务时已经落盘。隐藏的触发消息启动一轮 Pi 执行，避免在历史里重复指令。
      const last = await runPi(record, model, signal, session => session.sendCustomMessage({
        customType: 'creator-scheduled-trigger',
        content: agentMessages.scheduledTrigger,
        display: false,
      }, { triggerTurn: true }), availableTools, profile);
      if (profile === 'x-drafts' && (last?.stopReason === 'length' || last?.rawStopReason === 'length')) {
        throw new Error('模型达到单次输出上限，未生成完整草稿结果');
      }
      if (last?.stopReason !== 'stop' && !(profile === 'x-drafts' && last?.stopReason === 'toolUse')) {
        throw new Error(last?.errorMessage ?? 'Agent 未完成本轮指令');
      }
      if (profile === 'x-drafts') {
        // Pi 会在工具执行前校验参数，草稿提交失败也可能出现在会话工具结果中。
        const submissions = record.manager.getBranch().flatMap(entry => {
          if (entry.type !== 'message' || entry.message.role !== 'toolResult' || entry.message.toolName !== 'save_x_draft') return [];
          return [entry.message];
        });
        const latest = submissions.at(-1);
        if (latest?.isError) throw new Error(`草稿提交失败。${contentText(latest.content)}`);
        if (last.stopReason === 'toolUse') {
          const calls = last.content.filter(block => block.type === 'toolCall');
          const submitted = calls.length > 0 && calls.every(call =>
            call.name === 'save_x_draft' && submissions.some(result => result.toolCallId === call.id && !result.isError));
          if (!submitted) throw new Error('Agent 未完成本轮草稿提交');
        }
      }
      return { text: contentText(last.content).trim() };
    } catch (error) {
      signal.throwIfAborted();
      throw new Error(modelFailure(error, model));
    }
  }

  function appendScheduledResult(record: Conversation, result: ScheduledConversationResult) {
    // 草稿随结果进入 Pi 上下文，用户在同一会话续聊时可以直接改写。
    const { text, posts } = result;
    const context = posts?.length
      ? `${text}\n\n${agentMessages.scheduledResult.replace('{{posts}}', () => JSON.stringify(posts))}`
      : text;
    const id = record.manager.appendCustomMessageEntry(scheduledResultType, context, true, result);
    upsert(record, { id, role: 'assistant', text, posts });
  }

  function startScheduled(input: ScheduledAgentInput) {
    const manager = SessionManager.create(DATA_ROOT, DIRS.sessions);
    manager.appendSessionInfo(input.title);
    manager.appendCustomEntry(scheduledSessionType, null);
    const record = makeRecord(manager, input.title, Date.now());
    const { run, active } = begin(record);
    manager.appendCustomEntry(runType, run);
    const firstId = manager.appendMessage({ role: 'user', content: input.prompt, timestamp: Date.now() });
    upsert(record, { id: firstId, role: 'user', text: input.prompt, assets: [] });
    announce(record, run);

    const signal = AbortSignal.any([input.signal, active.cancel.signal]);
    const availableTools = input.tools ?? tools;
    const unfinished = new Map<string, ToolEntry>();
    function finishStep(step: ToolEntry, status: 'completed' | 'failed', summary: string, text: string) {
      recordStep(record, { ...step, status, summary, text });
      unfinished.delete(step.id);
    }
    const trace: ScheduledConversationTrace = {
      signal,
      beginStep(label) {
        const step: ToolEntry = { id: randomUUID(), role: 'tool', label, status: 'running', summary: '正在执行', text: '', references: [] };
        recordStep(record, step);
        unfinished.set(step.id, step);
        return {
          complete: (summary, text = '') => finishStep(step, 'completed', summary, text),
          fail: message => finishStep(step, 'failed', message, message),
        };
      },
    };

    // 先把会话 ID 交给调度器，再启动执行，运行记录可以同步关联会话。
    const done = Promise.resolve().then(async () => {
      let result: ScheduledConversationResult;
      try {
        signal.throwIfAborted();
        result = input.skipModel ? { text: '' } : await scheduledReply(record, signal, availableTools, input.profile);
        if (input.finalize) {
          result = await input.finalize(result, trace);
          appendScheduledResult(record, result);
        } else if (!result.text) {
          result = { text: '指令已执行，本轮没有返回文本。' };
          appendScheduledResult(record, result);
        }
      } catch (failure) {
        const message = signal.aborted ? '本次任务已停止' : failure instanceof Error ? failure.message : '定时任务执行失败';
        for (const step of unfinished.values()) finishStep(step, 'failed', message, message);
        finish(record, { id: run.id, status: signal.aborted ? 'cancelled' : 'failed', error: signal.aborted ? null : message });
        if (signal.aborted) throw new DOMException(message, 'AbortError');
        throw new Error(message);
      }
      finish(record, { id: run.id, status: 'completed', error: null });
      return result;
    });
    active.done = done.then(() => {}, () => {});
    return { sessionId: record.summary.id, done };
  }

  return {
    list,
    observeSessions,
    startScheduled,
    create(input: SendMessage) {
      const value = connection();
      const message = normalizeInput(input);
      const manager = SessionManager.create(DATA_ROOT, DIRS.sessions);
      const title = Array.from(message.text.split('\n')[0] ?? message.text).slice(0, 32).join('');
      manager.appendSessionInfo(title);
      return start(makeRecord(manager, title, Date.now()), message, value);
    },
    async send(id: string, input: SendMessage) {
      const record = await load(id);
      return start(record, normalizeInput(input), connection());
    },
    async events(id: string) {
      const record = await load(id);
      return (listener: Listener) => {
        record.listeners.add(listener);
        listener({ type: 'snapshot', snapshot: { session: record.summary, entries: record.entries, run: record.run } });
        return () => {
          record.listeners.delete(listener);
          releaseScheduled(record);
        };
      };
    },
    async abort(id: string) { await stop(await load(id)); },
    async rename(id: string, newTitle: string) {
      const trimmed = newTitle.trim().slice(0, 64);
      if (!trimmed) throw statusError('会话标题不能为空', 400);
      const record = await load(id);
      record.manager.appendSessionInfo(trimmed);
      record.summary.title = trimmed;
      record.summary.updatedAt = Date.now();
      publish(record, { type: 'run', run: record.run ?? { id: '', status: 'completed', error: null }, session: record.summary });
      publishSummary(record);
      releaseScheduled(record);
      return record.summary;
    },
    async remove(id: string) {
      const record = records.get(id);
      if (record) {
        await stop(record);
        records.delete(id);
      }
      const info = (await persistedSessions()).find(item => item.id === id);
      if (info && existsSync(info.path)) {
        await unlink(info.path);
      }
      publishList({ type: 'removed', sessionId: id });
    },
    async dispose() { await Promise.all([...records.values()].map(stop)); },
  };
}

type ContentResult = readonly { type: string; text?: string }[];
