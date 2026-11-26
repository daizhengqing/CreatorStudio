import type { ScheduledRun, ScheduledRunSummary } from '@creator-studio/contracts';
import { Button } from '@creator-studio/ui/button';
import { XDraftCards } from '../ui/XDraftCards';

const dateTime = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

export const runTime = (time: number) => dateTime.format(time);

export const runLabels: Record<ScheduledRunSummary['status'], string> = {
  running: '运行中', completed: '已完成', failed: '失败', interrupted: '已中断',
};

export function ScheduleRunHistory({ name, runs, error, onOpenSession }: {
  name: string;
  runs: ScheduledRun[] | null;
  error: string;
  onOpenSession: (id: string) => void;
}) {
  return (
    <section className="schedule-panel" aria-labelledby="schedule-history-title">
      <header className="schedule-panel-header">
        <div>
          <h2 id="schedule-history-title">运行记录</h2>
          <p className="schedule-muted">{name}</p>
        </div>
      </header>
      {error && <p className="schedule-panel-message status-error" role="alert">{error}</p>}
      {!error && runs === null && <p className="schedule-panel-message" role="status">正在读取运行记录…</p>}
      {runs?.length === 0 && <p className="schedule-panel-message">还没有运行记录。</p>}
      {runs?.map(({ sessionId, ...run }, index) => (
        <details key={run.id} className="schedule-run" open={index === 0}>
          <summary>
            <span>{runTime(run.startedAt)}</span>
            <span className={run.status === 'failed' ? 'status-error' : 'schedule-muted'}>{runLabels[run.status]}</span>
            {run.posts.length > 0 && <span className="schedule-count">{run.posts.length} 条 X 草稿</span>}
          </summary>
          <div className="schedule-run-result">
            {sessionId && (
              <div className="schedule-actions">
                <Button type="button" variant="outline" onClick={() => onOpenSession(sessionId)}>
                  打开会话
                </Button>
              </div>
            )}
            {run.scanned && (
              <p className="schedule-muted">本轮读取 {run.scanned.trends} 条热点、{run.scanned.x} 条推文。</p>
            )}
            {run.scanned && run.posts.length === 0 && (
              <p className="schedule-muted">
                {run.scanned.trends + run.scanned.x === 0 ? '本轮没有新增消息。' : '本轮没有选出适合发帖的消息。'}
              </p>
            )}
            {run.error && <p className="status-error">{run.error}</p>}
            {run.output && <p className="schedule-text">{run.output}</p>}
            <XDraftCards posts={run.posts} />
          </div>
        </details>
      ))}
    </section>
  );
}
