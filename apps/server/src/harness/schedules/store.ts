import { randomUUID } from 'node:crypto';
import type { ScheduledRun, ScheduledRunSummary, ScheduledTask, ScheduledTaskInput } from '@creator-studio/contracts';
import { sqlite } from '../../db/index.js';

export const MINUTE_MS = 60_000;
export type Cursors = { trends: number; x: number };
type TaskRow = Omit<ScheduledTask, 'lastRun' | 'enabled'> & { enabled: number; trendsCursor: number; xCursor: number };
type RunRow = Omit<ScheduledRun, 'posts' | 'scanned'> & { posts: string; scanned: string | null };
type RunResult = Pick<ScheduledRun, 'output' | 'posts' | 'scanned'>;

export function scheduleError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

function nextSlot(due: number, intervalMinutes: number, now: number) {
  const interval = intervalMinutes * MINUTE_MS;
  return due + (Math.floor((now - due) / interval) + 1) * interval;
}

export function openScheduleStore() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, prompt TEXT NOT NULL, kind TEXT NOT NULL,
      intervalMinutes INTEGER NOT NULL, enabled INTEGER NOT NULL, nextRunAt INTEGER,
      trendsCursor INTEGER NOT NULL, xCursor INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scheduled_runs (
      id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
      startedAt INTEGER NOT NULL, finishedAt INTEGER, status TEXT NOT NULL, error TEXT,
      output TEXT, posts TEXT NOT NULL DEFAULT '[]', scanned TEXT
    );
    CREATE TABLE IF NOT EXISTS scheduled_run_sessions (
      runId TEXT PRIMARY KEY REFERENCES scheduled_runs(id) ON DELETE CASCADE,
      sessionId TEXT NOT NULL UNIQUE
    );
    CREATE INDEX IF NOT EXISTS scheduled_tasks_due ON scheduled_tasks(nextRunAt) WHERE enabled=1;
    CREATE INDEX IF NOT EXISTS scheduled_runs_history ON scheduled_runs(taskId, startedAt DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS scheduled_runs_active ON scheduled_runs(taskId) WHERE status='running';
  `);

  const findTask = sqlite.prepare<[string], TaskRow>('SELECT * FROM scheduled_tasks WHERE id=?');
  const listTasks = sqlite.prepare<[], TaskRow>('SELECT * FROM scheduled_tasks ORDER BY rowid DESC');
  const latestRun = sqlite.prepare<[string], ScheduledRunSummary>(`
    SELECT r.id, r.taskId, s.sessionId, r.startedAt, r.finishedAt, r.status, r.error
    FROM scheduled_runs r LEFT JOIN scheduled_run_sessions s ON s.runId=r.id
    WHERE r.taskId=? ORDER BY r.startedAt DESC, r.rowid DESC LIMIT 1
  `);
  const listRuns = sqlite.prepare<[string], RunRow>(`
    SELECT r.*, s.sessionId FROM scheduled_runs r LEFT JOIN scheduled_run_sessions s ON s.runId=r.id
    WHERE r.taskId=? ORDER BY r.startedAt DESC, r.rowid DESC LIMIT 30
  `);
  const insertTask = sqlite.prepare<TaskRow>(`
    INSERT INTO scheduled_tasks VALUES (@id,@name,@prompt,@kind,@intervalMinutes,@enabled,@nextRunAt,@trendsCursor,@xCursor)
  `);
  const updateTask = sqlite.prepare<TaskRow>(`
    UPDATE scheduled_tasks SET name=@name,prompt=@prompt,kind=@kind,intervalMinutes=@intervalMinutes,
    enabled=@enabled,nextRunAt=@nextRunAt,trendsCursor=@trendsCursor,xCursor=@xCursor WHERE id=@id
  `);
  const deleteTask = sqlite.prepare<[string]>('DELETE FROM scheduled_tasks WHERE id=?');
  const isRunning = sqlite.prepare<[string], { active: number }>(`
    SELECT 1 AS active FROM scheduled_runs WHERE taskId=? AND status='running'
  `);
  const scheduled = sqlite.prepare<[], { id: string; nextRunAt: number }>(`
    SELECT t.id, t.nextRunAt FROM scheduled_tasks t
    WHERE t.enabled=1 AND NOT EXISTS (SELECT 1 FROM scheduled_runs r WHERE r.taskId=t.id AND r.status='running')
    ORDER BY t.nextRunAt, t.rowid LIMIT 1
  `);
  const insertRun = sqlite.prepare<ScheduledRunSummary>(`
    INSERT INTO scheduled_runs (id,taskId,startedAt,status) VALUES (@id,@taskId,@startedAt,@status)
  `);
  const insertSessionLink = sqlite.prepare<[string, string]>(`
    INSERT INTO scheduled_run_sessions (runId,sessionId) VALUES (?,?)
  `);
  const advanceSchedule = sqlite.prepare<[number, string]>('UPDATE scheduled_tasks SET nextRunAt=? WHERE id=?');
  const advanceCursors = sqlite.prepare<[number, number, string]>('UPDATE scheduled_tasks SET trendsCursor=?,xCursor=? WHERE id=?');
  const finishRun = sqlite.prepare<[number, ScheduledRunSummary['status'], string | null, string | null, string, string | null, string]>(`
    UPDATE scheduled_runs SET finishedAt=?,status=?,error=?,output=?,posts=?,scanned=? WHERE id=? AND status='running'
  `);

  function publicTask({ trendsCursor: _trends, xCursor: _x, ...task }: TaskRow): ScheduledTask {
    return { ...task, enabled: Boolean(task.enabled), lastRun: latestRun.get(task.id) ?? null };
  }

  function taskById(id: string) {
    const task = findTask.get(id);
    if (!task) throw scheduleError('定时任务不存在', 404);
    return task;
  }

  function idleTask(id: string) {
    const task = taskById(id);
    if (isRunning.get(id)) throw scheduleError('该任务正在运行，请等待本次运行结束', 409);
    return task;
  }

  function saveTask(input: ScheduledTaskInput, id: string, cursors: Cursors, previous?: TaskRow) {
    const name = input.name.trim();
    const prompt = input.prompt.trim();
    if (!name || !prompt) throw scheduleError('请填写任务名称和执行指令', 400);
    const keepSchedule = previous?.enabled && previous.intervalMinutes === input.intervalMinutes;
    const task: TaskRow = {
      ...input, name, prompt, id, enabled: input.enabled ? 1 : 0,
      nextRunAt: input.enabled ? (keepSchedule ? previous.nextRunAt : Date.now() + input.intervalMinutes * MINUTE_MS) : null,
      trendsCursor: cursors.trends, xCursor: cursors.x,
    };
    (previous ? updateTask : insertTask).run(task);
    return publicTask(task);
  }

  const recover = sqlite.transaction((now: number) => {
    // 中断的通用指令可能已执行部分工具，恢复时从下一计划时间开始。
    const interrupted = sqlite.prepare<[number], { id: string; intervalMinutes: number; nextRunAt: number }>(`
      SELECT t.id, t.intervalMinutes, t.nextRunAt FROM scheduled_tasks t JOIN scheduled_runs r ON r.taskId=t.id
      WHERE t.kind='instruction' AND t.enabled=1 AND t.nextRunAt<=? AND r.status='running'
    `).all(now);
    for (const task of interrupted) advanceSchedule.run(nextSlot(task.nextRunAt, task.intervalMinutes, now), task.id);
    sqlite.prepare(`UPDATE scheduled_runs SET status='interrupted', finishedAt=?, error='服务已重启，本次运行中断' WHERE status='running'`).run(now);
  });
  recover.immediate(Date.now());

  const begin = sqlite.transaction((id: string, now: number, manual: boolean) => {
    const task = idleTask(id);
    const due = task.nextRunAt !== null && task.nextRunAt <= now;
    if (!manual && !due) return null;
    if (due) advanceSchedule.run(nextSlot(task.nextRunAt!, task.intervalMinutes, now), id);
    const run: ScheduledRunSummary = { id: randomUUID(), taskId: id, sessionId: null, startedAt: now, finishedAt: null, status: 'running', error: null };
    insertRun.run(run);
    return { task, run };
  });

  const finish = sqlite.transaction((run: ScheduledRunSummary, result: RunResult, cursors?: Cursors) => {
    const update = finishRun.run(Date.now(), 'completed', null, result.output, JSON.stringify(result.posts), result.scanned && JSON.stringify(result.scanned), run.id);
    if (update.changes && cursors) advanceCursors.run(cursors.trends, cursors.x, run.taskId);
  });

  return {
    scheduled: () => scheduled.get(),
    list: () => listTasks.all().map(publicTask),
    create: (input: ScheduledTaskInput, cursors: Cursors) => saveTask(input, randomUUID(), cursors),
    update: (id: string, input: ScheduledTaskInput, baseline: () => Cursors) => {
      const previous = taskById(id);
      if (isRunning.get(id) && (previous.name !== input.name.trim() || previous.prompt !== input.prompt.trim()
        || previous.kind !== input.kind || previous.intervalMinutes !== input.intervalMinutes)) {
        throw scheduleError('该任务正在运行，请等待本次运行结束再编辑', 409);
      }
      const cursors = input.kind === 'x-drafts' && previous.kind !== 'x-drafts'
        ? baseline() : { trends: previous.trendsCursor, x: previous.xCursor };
      return saveTask(input, id, cursors, previous);
    },
    remove(id: string) { idleTask(id); deleteTask.run(id); },
    history(id: string): ScheduledRun[] {
      taskById(id);
      return listRuns.all(id).map(({ posts, scanned, ...run }) => ({
        ...run, posts: JSON.parse(posts) as ScheduledRun['posts'], scanned: scanned ? JSON.parse(scanned) as ScheduledRun['scanned'] : null,
      }));
    },
    begin: (id: string, now: number, manual: boolean) => begin.immediate(id, now, manual),
    linkSession(run: ScheduledRunSummary, sessionId: string): ScheduledRunSummary {
      insertSessionLink.run(run.id, sessionId);
      return { ...run, sessionId };
    },
    finish: (run: ScheduledRunSummary, result: RunResult, cursors?: Cursors) => finish.immediate(run, result, cursors),
    fail(run: ScheduledRunSummary, status: 'failed' | 'interrupted', error: string) {
      finishRun.run(Date.now(), status, error, null, '[]', null, run.id);
    },
  };
}
