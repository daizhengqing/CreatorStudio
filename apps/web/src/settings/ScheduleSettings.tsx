import { useEffect, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { X_DRAFT_SCHEDULE, type ScheduledRun, type ScheduledTask, type ScheduledTaskInput } from '@creator-studio/contracts';
import { Button } from '@creator-studio/ui/button';
import { Input } from '@creator-studio/ui/input';
import { api, json, messageOf } from '../api';
import { ScheduleRunHistory, runLabels, runTime } from './ScheduleRunHistory';
import { SettingsField } from './SettingsField';
import './schedules.css';

type TaskForm = Omit<ScheduledTaskInput, 'intervalMinutes'> & { intervalMinutes: string; id?: string };

const SCHEDULES = '/api/schedules';
const refreshInterval = 4000;
const blankTask = { name: '', prompt: '', kind: 'instruction', intervalMinutes: 30, enabled: true } satisfies ScheduledTaskInput;
const taskPath = (id: string) => SCHEDULES + '/' + encodeURIComponent(id);

function inputOf({ name, prompt, kind, intervalMinutes, enabled }: ScheduledTaskInput): ScheduledTaskInput {
  return { name, prompt, kind, intervalMinutes, enabled };
}

export function ScheduleSettings({ onOpenRunSession }: { onOpenRunSession: (id: string) => void }) {
  const [tasks, setTasks] = useState<ScheduledTask[] | null>(null);
  const [form, setForm] = useState<TaskForm | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<ScheduledRun[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [runsError, setRunsError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (busy) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const result = await api<ScheduledTask[]>(SCHEDULES, { signal: controller.signal });
        setTasks(result);
        setLoadError('');
      } catch (failure) {
        if (!controller.signal.aborted) setLoadError(messageOf(failure));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, refreshInterval);
      }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [busy]);

  useEffect(() => {
    if (!selectedId || busy) return;
    const controller = new AbortController();
    const path = taskPath(selectedId) + '/runs';
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        setRuns(await api<ScheduledRun[]>(path, { signal: controller.signal }));
        setRunsError('');
      } catch (failure) {
        if (!controller.signal.aborted) setRunsError(messageOf(failure));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, refreshInterval);
      }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [busy, selectedId]);

  function selectTask(id: string) {
    if (selectedId === id) return;
    setRuns(null);
    setRunsError('');
    setSelectedId(id);
  }

  function editTask(input: ScheduledTaskInput, id?: string) {
    setError('');
    setConfirmDelete(null);
    setForm({ ...inputOf(input), id, intervalMinutes: String(input.intervalMinutes) });
  }

  function editForm(patch: Partial<TaskForm>) {
    setError('');
    setForm(previous => previous && ({ ...previous, ...patch }));
  }

  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      setTasks(await api<ScheduledTask[]>(SCHEDULES));
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const { id, name, prompt, intervalMinutes, kind, enabled } = form;
    const input: ScheduledTaskInput = {
      name: name.trim(), prompt: prompt.trim(), intervalMinutes: Number(intervalMinutes), kind, enabled,
    };
    void mutate(async () => {
      const task = await api<ScheduledTask>(id ? taskPath(id) : SCHEDULES, json(id ? 'PUT' : 'POST', input));
      selectTask(task.id);
      setForm(null);
    });
  }

  function toggle(task: ScheduledTask) {
    void mutate(async () => {
      await api<ScheduledTask>(taskPath(task.id), json('PUT', { ...inputOf(task), enabled: !task.enabled }));
    });
  }

  function runNow(id: string) {
    void mutate(async () => {
      await api(taskPath(id) + '/run', { method: 'POST' });
      selectTask(id);
    });
  }

  function remove(id: string) {
    void mutate(async () => {
      await api(taskPath(id), { method: 'DELETE' });
      if (selectedId === id) setSelectedId(null);
      if (form?.id === id) setForm(null);
      setConfirmDelete(null);
    });
  }

  const selected = tasks?.find(task => task.id === selectedId);

  return (
    <div className="schedule-settings">
      <section className="schedule-panel" aria-labelledby="schedule-list-title">
        <header className="schedule-panel-header">
          <div>
            <h2 id="schedule-list-title">任务列表</h2>
            <p className="schedule-muted">CreatorStudio 服务运行期间按设定间隔执行。</p>
          </div>
          <div className="schedule-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={() => editTask(X_DRAFT_SCHEDULE)}>使用五分钟模板</Button>
            <Button type="button" disabled={busy} onClick={() => editTask(blankTask)}>
              <Plus data-icon="inline-start" aria-hidden="true" /> 新增任务
            </Button>
          </div>
        </header>
        {loadError && <p className="schedule-panel-message status-error" role="alert">{loadError}</p>}
        {tasks === null && !loadError && <p className="schedule-panel-message" role="status">正在读取定时任务…</p>}
        {tasks?.length === 0 && <p className="schedule-panel-message">还没有任务。可以新建任务，或从五分钟热点模板开始。</p>}
        {tasks?.length ? (
          <ul className="schedule-task-list">
            {tasks.map(task => {
              const running = task.lastRun?.status === 'running';
              return (
                <li key={task.id} className="schedule-task">
                  <div className="schedule-task-heading">
                    <div>
                      <h3>{task.name} <span className="schedule-count">{task.enabled ? '已启用' : '已暂停'}</span></h3>
                      <p className="schedule-muted">
                        每 {task.intervalMinutes} 分钟 · {task.kind === 'x-drafts' ? 'X 草稿' : '自定义指令'}
                        {task.enabled && task.nextRunAt !== null && ' · 下次 ' + runTime(task.nextRunAt)}
                        {task.lastRun && ' · 最近' + runLabels[task.lastRun.status]}
                      </p>
                    </div>
                    <div className="schedule-actions">
                      <Button type="button" variant={selectedId === task.id ? 'secondary' : 'ghost'} onClick={() => selectTask(task.id)}>运行记录</Button>
                      <Button type="button" variant="ghost" disabled={busy || running} onClick={() => runNow(task.id)}>运行一次</Button>
                      <Button type="button" variant="ghost" disabled={busy} onClick={() => toggle(task)}>{task.enabled ? '暂停' : '启用'}</Button>
                      <Button type="button" variant="ghost" disabled={busy || running} onClick={() => editTask(task, task.id)}>编辑</Button>
                      <Button type="button" variant="ghost" disabled={busy || running} onClick={() => { setError(''); setConfirmDelete(task.id); }}>删除</Button>
                    </div>
                  </div>
                  {confirmDelete === task.id && (
                    <div className="schedule-delete" role="group" aria-label="确认删除">
                      <span>删除此任务及其运行记录？</span>
                      <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmDelete(null)}>取消</Button>
                      <Button type="button" variant="destructive" disabled={busy || running} onClick={() => remove(task.id)}>确认删除</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
        {error && !form && <p className="schedule-panel-message status-error" role="alert">{error}</p>}
      </section>

      {form && (
        <form className="schedule-panel" onSubmit={save} aria-labelledby="schedule-form-title">
          <header className="schedule-panel-header"><h2 id="schedule-form-title">{form.id ? '编辑任务' : '新增任务'}</h2></header>
          <fieldset className="schedule-form settings-fields" disabled={busy}>
            <SettingsField label="任务名称">
              <Input required maxLength={100} value={form.name} onChange={event => editForm({ name: event.target.value })} />
            </SettingsField>
            <div className="schedule-form-row">
              <SettingsField label="任务类型">
                <select value={form.kind} onChange={event => editForm({ kind: event.target.value === 'x-drafts' ? 'x-drafts' : 'instruction' })}>
                  <option value="instruction">自定义指令</option>
                  <option value="x-drafts">采集增量生成 X 草稿</option>
                </select>
              </SettingsField>
              <SettingsField label="间隔（分钟）">
                <Input type="number" min={1} max={525600} required value={form.intervalMinutes}
                  onChange={event => editForm({ intervalMinutes: event.target.value })} />
              </SettingsField>
            </div>
            <SettingsField label="Agent 指令" hint={form.kind === 'x-drafts' ? '任务会读取创建后新入库的热点和推文，只把结果保存为草稿。' : undefined}>
              <textarea rows={5} required maxLength={12000} value={form.prompt}
                placeholder="写下每次运行时希望 Agent 完成的工作"
                onChange={event => editForm({ prompt: event.target.value })} />
            </SettingsField>
            <label className="schedule-enable">
              <input type="checkbox" checked={form.enabled} onChange={event => editForm({ enabled: event.target.checked })} />
              启用定时运行
            </label>
            {error && <p className="status-error" role="alert">{error}</p>}
          </fieldset>
          <footer className="schedule-panel-footer">
            <Button type="button" variant="outline" disabled={busy} onClick={() => { setError(''); setForm(null); }}>取消</Button>
            <Button type="submit" disabled={busy || !form.name.trim() || !form.prompt.trim()}>保存任务</Button>
          </footer>
        </form>
      )}

      {selected && <ScheduleRunHistory name={selected.name} runs={runs} error={runsError} onOpenSession={onOpenRunSession} />}
    </div>
  );
}
