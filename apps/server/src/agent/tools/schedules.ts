import type { createScheduleService } from '../../harness/schedules/index.js';
import { scheduleInputSchema } from '../../harness/schedules/schema.js';
import { creatorTool } from './tool.js';

export function createScheduleTool(schedules: Pick<ReturnType<typeof createScheduleService>, 'create'>) {
  return creatorTool(
    'create_schedule', '创建定时任务',
    '在用户要求创建定时任务时使用。按固定分钟间隔执行，返回已保存的任务 ID 和下次执行时间。',
    scheduleInputSchema,
    input => {
      const task = schedules.create(input);
      const nextRunAtIso = task.nextRunAt === null ? null : new Date(task.nextRunAt).toISOString();
      return {
        data: { ...task, nextRunAtIso },
        summary: task.enabled ? `已创建「${task.name}」，每 ${task.intervalMinutes} 分钟执行` : `已创建「${task.name}」，当前暂停`,
      };
    },
  );
}
