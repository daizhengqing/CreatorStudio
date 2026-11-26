import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { ItemQuery, LoginDetails, XMonitorTweetQuery } from '@creator-studio/contracts';
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
const itemLimit = Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }));
const category = Type.Union([
  Type.Literal('social'), Type.Literal('international'), Type.Literal('ai'),
  Type.Literal('finance'), Type.Literal('crypto'),
]);
const tweetKind = Type.Union([
  Type.Literal('original'), Type.Literal('quote'), Type.Literal('repost'),
]);
const timestamp = Type.Integer({ minimum: 0 });
type TweetQuery = Omit<XMonitorTweetQuery, 'cursor'> & { cursorPublishedAt?: number; cursorId?: string };

export function installCollectionRoutes(app: FastifyInstance, trends: ReturnType<typeof createTrendsService>, x: ReturnType<typeof createXMonitorService>) {
  app.get<{ Querystring: ItemQuery }>('/api/collections/trends', {
    schema: {
      querystring: Type.Object({
        search: Type.Optional(Type.String()), category: Type.Optional(category), sourceId: Type.Optional(Type.String()),
        savedOnly: Type.Optional(Type.Boolean()), offset: Type.Optional(Type.Integer({ minimum: 0 })), limit: itemLimit,
      }),
    },
  }, async request => trends.list(request.query));
  app.get('/api/collections/trends/status', async () => trends.getStatus());
  app.post('/api/collections/trends/refresh', async () => ({ sourceIds: trends.refresh() }));

  app.get('/api/collections/x/targets', async () => x.listTargets());
  app.get<{ Querystring: TweetQuery }>('/api/collections/x/tweets', {
    schema: {
      querystring: Type.Object({
        q: Type.Optional(Type.String()), targetId: Type.Optional(Type.String()), kind: Type.Optional(tweetKind),
        hasMedia: Type.Optional(Type.Boolean()), from: Type.Optional(timestamp), to: Type.Optional(timestamp),
        limit: itemLimit, cursorPublishedAt: Type.Optional(timestamp), cursorId: Type.Optional(Type.String({ minLength: 1 })),
      }),
    },
  }, async request => {
    const { cursorPublishedAt, cursorId, ...query } = request.query;
    return x.listTweets({
      ...query,
      cursor: cursorPublishedAt !== undefined && cursorId !== undefined ? { publishedAt: cursorPublishedAt, id: cursorId } : undefined,
    });
  });
  app.post<{ Params: { id: string } }>('/api/collections/x/targets/:id/collect', {
    schema: { params: Type.Object({ id: Type.String({ minLength: 1 }) }) },
  }, async request => x.collectNow(request.params.id));

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
