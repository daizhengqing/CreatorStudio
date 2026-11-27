import type { createScheduleService } from '../../harness/schedules/index.js';
import { scheduleInputSchema } from '../../harness/schedules/schema.js';
import { toolMetadata } from '../content.js';
import { creatorTool } from './tool.js';

export function createScheduleTool(schedules: Pick<ReturnType<typeof createScheduleService>, 'create'>) {
  return creatorTool(
    toolMetadata('create_schedule'),
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
