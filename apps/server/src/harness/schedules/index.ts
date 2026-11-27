import type {
  ScheduledConversationResult, ScheduledRunSummary, ScheduledTaskInput,
} from '@creator-studio/contracts';
import type { ScheduledAgentInput } from '../../agent/session-service.js';
import type { createMessageService } from '../messages.js';
import { runConversationStep } from './conversation-step.js';
import { prepareDraftRun, scheduledDraftPrompt } from './drafts.js';
import { openScheduleStore, scheduleError } from './store.js';

type ScheduleServices = {
  messages: Pick<ReturnType<typeof createMessageService>, 'latestCursors' | 'listBatch'>;
  startConversation(input: ScheduledAgentInput): { sessionId: string; done: Promise<ScheduledConversationResult> };
};

export function createScheduleService({ messages, startConversation }: ScheduleServices) {
  const store = openScheduleStore();
  const shutdown = new AbortController();
  const active = new Map<string, Promise<void>>();
  let timer: NodeJS.Timeout | undefined;

  function wake() {
    clearTimeout(timer);
    if (shutdown.signal.aborted) return;
    const next = store.scheduled();
    if (!next) return;
    const delay = Math.max(0, Math.min(next.nextRunAt - Date.now(), 2_147_483_647));
    timer = setTimeout(() => start(next.id, false), delay);
    timer.unref();
  }

  function fail(run: ScheduledRunSummary, error: unknown) {
    const message = error instanceof Error ? error.message : '定时任务执行失败';
    if (shutdown.signal.aborted) store.fail(run, 'interrupted', '服务已关闭，本次运行中断');
    else if (error instanceof Error && error.name === 'AbortError') store.fail(run, 'interrupted', '已停止本次运行');
    else store.fail(run, 'failed', message.slice(0, 1_200));
  }

  function start(id: string, manual: boolean): ScheduledRunSummary | null {
    if (shutdown.signal.aborted) throw scheduleError('服务正在关闭，请稍后再试', 503);
    const started = store.begin(id, Date.now(), manual);
    if (!started) {
      wake();
      return null;
    }
    const { task, run } = started;
    const controller = new AbortController();
    const signal = AbortSignal.any([shutdown.signal, controller.signal]);
    let conversation: ReturnType<ScheduleServices['startConversation']> | undefined;
    let linked: ScheduledRunSummary;
    try {
      const input: ScheduledAgentInput = { title: `定时 · ${task.name}`, prompt: task.prompt, signal };
      if (task.kind === 'x-drafts') {
        const current = { trends: task.trendsCursor, x: task.xCursor };
        const draftRun = prepareDraftRun(messages.listBatch(current, messages.latestCursors()));
        input.prompt = scheduledDraftPrompt(task.prompt);
        input.tools = draftRun.tools;
        input.skipModel = draftRun.empty;
        input.profile = 'x-drafts';
        input.finalize = async (_result, trace) => {
          trace.signal.throwIfAborted();
          const { cursors, posts, scanned } = draftRun.finish();
          // 草稿与游标一起提交，只有提交成功才在会话中显示保存结果。
          await runConversationStep(trace, '保存运行结果', () => {
            store.finish(run, { output: null, posts, scanned }, cursors);
            return {
              value: undefined,
              summary: posts.length ? `已保存 ${posts.length} 条 X 草稿` : '已保存本轮扫描结果',
            };
          });
          const result = posts.length ? `已保存 ${posts.length} 条 X 草稿。` : '本轮没有选出适合发帖的消息。';
          const text = scanned.trends + scanned.x
            ? `本轮读取了 ${scanned.trends} 条热点和 ${scanned.x} 条 X 推文。${result}`
            : '本轮没有新增的热点或 X 推文。';
          return { text, posts };
        };
      }
      conversation = startConversation(input);
      linked = store.linkSession(run, conversation.sessionId);
    } catch (error) {
      controller.abort();
      void conversation?.done.catch(() => {});
      fail(run, error);
      wake();
      if (manual) throw error;
      return null;
    }

    const execution = conversation.done
      .then(({ text }) => {
        if (task.kind === 'instruction') store.finish(run, { output: text, posts: [], scanned: null });
      })
      .catch(error => fail(run, error))
      .finally(() => {
        active.delete(run.id);
        wake();
      });
    active.set(run.id, execution);
    wake();
    return linked;
  }

  wake();

  return {
    list: store.list,
    history: store.history,
    create(input: ScheduledTaskInput) {
      const task = store.create(input, input.kind === 'x-drafts' ? messages.latestCursors() : { trends: 0, x: 0 });
      wake();
      return task;
    },
    update(id: string, input: ScheduledTaskInput) {
      const task = store.update(id, input, messages.latestCursors);
      wake();
      return task;
    },
    remove(id: string) {
      store.remove(id);
      wake();
    },
    runNow: (id: string) => start(id, true)!,
    async dispose() {
      clearTimeout(timer);
      shutdown.abort();
      await Promise.all(active.values());
    },
  };
}
