import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { LoginDetails } from '@creator-studio/contracts';
import type { createTrendsService } from '../harness/trends/index.js';
import type { createXMonitorService } from '../harness/x-monitor/index.js';

const username = Type.String({ minLength: 1 });
const login = Type.Union([
  Type.Object({ mode: Type.Literal('cookie'), username, cookie: Type.String({ minLength: 1 }) }),
  Type.Object({
    mode: Type.Literal('password'), username, password: Type.String({ minLength: 1 }), email: Type.String({ minLength: 1 }),
    emailPassword: Type.Optional(Type.String()), totpSecret: Type.Optional(Type.String()),
  }),
]);

export function installCollectionRoutes(app: FastifyInstance, trends: ReturnType<typeof createTrendsService>, x: ReturnType<typeof createXMonitorService>) {
  app.get('/api/settings/trends', async () => ({ config: trends.getConfig(), sources: trends.getStatus().sources }));
  app.put<{ Body: { proxyUrl: string } }>('/api/settings/trends/proxy',
    { schema: { body: Type.Object({ proxyUrl: Type.String() }) } }, async request => trends.setProxy(request.body.proxyUrl));
  app.put<{ Body: { cookie: string } }>('/api/settings/trends/weibo',
    { schema: { body: Type.Object({ cookie: Type.String() }) } }, async request => trends.saveSourceCredentials('weibo', request.body.cookie));

  app.get('/api/settings/x/runtime', async () => x.getRuntime());
  app.get('/api/settings/x/accounts', async () => x.listLoginAccounts());
  app.post<{ Body: LoginDetails }>('/api/settings/x/accounts', { schema: { body: login } }, async (request, reply) =>
    reply.code(201).send(await x.saveLoginAccount(request.body)));
  app.delete<{ Params: { username: string } }>('/api/settings/x/accounts/:username', async (request, reply) => {
    await x.removeLoginAccount(request.params.username);
    return reply.code(204).send();
  });
}
