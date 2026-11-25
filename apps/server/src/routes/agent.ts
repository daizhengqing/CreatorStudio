import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { SendMessage } from '@creator-studio/contracts';
import type { createAgentService } from '../agent/session-service.js';

const body = Type.Object({
  text: Type.String({ minLength: 1, maxLength: 32_000 }),
  assetIds: Type.Optional(Type.Array(Type.String(), { maxItems: 20 })),
});

export function installAgentRoutes(app: FastifyInstance, agent: ReturnType<typeof createAgentService>) {
  const streams = new Set<ServerResponse>();
  app.get('/api/agent/sessions', () => agent.list());
  app.post<{ Body: SendMessage }>('/api/agent/sessions', { schema: { body } }, async (request, reply) =>
    reply.code(202).send(agent.create(request.body)));

  app.post<{ Params: { id: string }; Body: SendMessage }>('/api/agent/sessions/:id/messages', { schema: { body } }, async (request, reply) =>
    reply.code(202).send(await agent.send(request.params.id, request.body)));

  app.post<{ Params: { id: string } }>('/api/agent/sessions/:id/abort', async (request, reply) => {
    await agent.abort(request.params.id);
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/api/agent/sessions/:id', async (request, reply) => {
    await agent.remove(request.params.id);
    return reply.code(204).send();
  });

  app.patch<{ Params: { id: string }; Body: { title: string } }>(
    '/api/agent/sessions/:id',
    { schema: { body: Type.Object({ title: Type.String({ minLength: 1, maxLength: 64 }) }) } },
    async (request, reply) => {
      const updated = await agent.rename(request.params.id, request.body.title);
      return reply.send(updated);
    },
  );

  app.get<{ Params: { id: string } }>('/api/agent/sessions/:id/events', async (request, reply) => {
    const subscribe = await agent.events(request.params.id);
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    streams.add(response);
    const unsubscribe = subscribe(event => response.write(`data: ${JSON.stringify(event)}\n\n`));
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15_000);
    response.once('close', () => { clearInterval(heartbeat); unsubscribe(); streams.delete(response); });
  });

  app.addHook('preClose', async () => {
    for (const stream of streams) stream.end();
    await agent.dispose();
  });
}
