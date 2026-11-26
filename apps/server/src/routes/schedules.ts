import type { ScheduledTaskInput } from '@creator-studio/contracts';
import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { createScheduleService } from '../harness/schedules/index.js';
import { scheduleInputSchema } from '../harness/schedules/schema.js';

type ScheduleParams = { id: string };
const params = Type.Object({ id: Type.String() });
const schema = { body: scheduleInputSchema };

export function installScheduleRoutes(app: FastifyInstance, schedules: ReturnType<typeof createScheduleService>): void {
  app.get('/api/schedules', async () => schedules.list());
  app.post<{ Body: ScheduledTaskInput }>('/api/schedules', { schema }, async (request, reply) =>
    reply.code(201).send(schedules.create(request.body)));
  app.put<{ Params: ScheduleParams; Body: ScheduledTaskInput }>('/api/schedules/:id', { schema: { params, ...schema } }, async request =>
    schedules.update(request.params.id, request.body));
  app.delete<{ Params: ScheduleParams }>('/api/schedules/:id', { schema: { params } }, async (request, reply) => {
    schedules.remove(request.params.id);
    return reply.code(204).send();
  });
  app.post<{ Params: ScheduleParams }>('/api/schedules/:id/run', { schema: { params } }, async (request, reply) =>
    reply.code(202).send(schedules.runNow(request.params.id)));
  app.get<{ Params: ScheduleParams }>('/api/schedules/:id/runs', { schema: { params } }, async request =>
    schedules.history(request.params.id));
}
