import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import {
  SessionManager, type AgentSession, type AgentSessionEvent, type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type {
  AgentRun, ChatEntry, RunAccepted, SendMessage, SessionEvent, SessionSummary, ToolDetails,
} from '@creator-studio/contracts';
import { DATA_ROOT, DIRS } from '../config.js';
import { getAsset } from '../services/media.js';
import type { ModelConnection } from '../services/model-completion.js';
import { getActiveModelConnection } from '../services/models.js';
import { createCreatorSession, modelFailure } from './runtime.js';
import { contentText, inputType, restoreTranscript, runType, toolEntry, type CreatorInput } from './transcript.js';

type Listener = (event: SessionEvent) => void;
type ActiveRun = { cancelled: boolean; session?: AgentSession; done: Promise<void> };
type Conversation = {
  manager: SessionManager;
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
  return `${input.text}\n\n本轮用户上传的素材：${JSON.stringify(assets)}`;
}

export function createAgentService(tools: ToolDefinition[]) {
  const labels = new Map(tools.map(tool => [tool.name, tool.label]));
  const records = new Map<string, Conversation>();
  const persistedSessions = () => SessionManager.list(DATA_ROOT, DIRS.sessions);

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

  function handler(record: Conversation) {
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
          id: event.toolCallId, role: 'tool', label: labels.get(event.toolName) ?? event.toolName,
          status: 'running', summary: '正在执行', text: '', references: [],
        });
      }
      if (event.type === 'tool_execution_end') {
        const result = event.result as { content: ContentResult; details?: Partial<ToolDetails> };
        upsert(record, toolEntry(event.toolCallId, labels.get(event.toolName) ?? event.toolName,
          contentText(result.content), event.isError, result.details));
      }
    };
  }

  async function execute(record: Conversation, active: ActiveRun, run: AgentRun, input: CreatorInput, connection: ModelConnection) {
    const text = promptText(input);
    const inputId = record.manager.appendCustomEntry(inputType, input);
    record.manager.appendCustomEntry(runType, run);
    let error: string | null = null;

    try {
      const session = await createCreatorSession(connection, record.manager, tools);
      active.session = session;
      session.subscribe(handler(record));
      if (!active.cancelled) {
        await session.prompt(text, { expandPromptTemplates: false });
        const last = session.messages.findLast(message => message.role === 'assistant');
        if (last?.stopReason === 'error' || last?.stopReason === 'length') {
          throw new Error(last.errorMessage ?? '模型未能完成本轮回复');
        }
      }
    } catch (failure) {
      error = modelFailure(failure, connection);
    } finally {
      active.session?.dispose();
    }

    // SDK 在接收用户消息时落盘。会话初始化期间停止时，保存已提交的输入。
    const branch = record.manager.getBranch();
    if (!branch.slice(branch.findIndex(entry => entry.id === inputId) + 1)
      .some(entry => entry.type === 'message' && entry.message.role === 'user')) {
      record.manager.appendMessage({ role: 'user', content: text, timestamp: Date.now() });
    }

    const result: AgentRun = {
      id: run.id, status: active.cancelled ? 'cancelled' : error ? 'failed' : 'completed',
      error: active.cancelled ? null : error,
    };
    finish(record, result);
  }

  function finish(record: Conversation, run: AgentRun, persist = true) {
    record.active = null;
    record.run = run;
    record.summary.updatedAt = Date.now();
    if (persist) record.manager.appendCustomEntry(runType, run);
    publish(record, { type: 'run', run, session: record.summary });
  }

  function start(record: Conversation, input: CreatorInput, connection: ModelConnection): RunAccepted {
    if (record.active) throw statusError('本轮仍在运行，请先等待或停止', 409);
    const run: AgentRun = { id: randomUUID(), status: 'running', error: null };
    const active: ActiveRun = { cancelled: false, done: Promise.resolve() };
    record.active = active;
    record.run = run;
    record.summary.updatedAt = Date.now();
    upsert(record, { ...input, id: run.id, role: 'user' });
    publish(record, { type: 'run', run, session: record.summary });
    active.done = execute(record, active, run, input, connection).catch(error => {
      finish(record, { id: run.id, status: 'failed', error: modelFailure(error, connection) }, false);
    });
    return { sessionId: record.summary.id, runId: run.id };
  }

  async function stop(record: Conversation) {
    const active = record.active;
    if (!active) return;
    active.cancelled = true;
    await active.session?.abort();
    await active.done;
  }

  function connection() {
    const value = getActiveModelConnection();
    if (!value.baseUrl || !value.model) throw statusError('请先在设置中填写模型 API 地址和模型名称', 400);
    return value;
  }

  return {
    list,
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
        return () => record.listeners.delete(listener);
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
    },
    async dispose() { await Promise.all([...records.values()].map(stop)); },
  };
}

type ContentResult = readonly { type: string; text?: string }[];
